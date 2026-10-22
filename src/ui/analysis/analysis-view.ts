// Aba Análise, camada declarada (M5): o que o script pede, lido do script e do cenário da réplica.
// Linha do tempo com cursor e faixas por SV, estado no instante, orçamento de nível, mapa com
// posição, rota e trajetória, checagens de rota e eventos ligados ao script e à réplica.
import { analysisEvents, type AnalysisEvent, type Target } from '../../analysis/events';
import { checkRoute, type RouteCheck } from '../../analysis/route-checks';
import { actionSvs, stateAt, timelineEnd, type StateAt } from '../../analysis/state';
import { describeAction } from '../../core/files/sheet';
import { parseTrajectory, type TrackPoint } from '../../core/files/trajectory';
import { levelBudget } from '../../core/scenario/budget';
import { sortedActions } from '../../core/scenario/emit';
import type { RoutePoint, Scenario } from '../../core/scenario/types';
import { parseScript } from '../../core/script/parse';
import { formatNumber } from '../../core/units';
import { formatDate, formatTime } from '../../replica/datetime';
import { displayValue, field, fieldUnit } from '../../replica/fields';
import { formatLatLon } from '../../replica/latlon';
import { routeInsert, setField, type ReplicaSession } from '../../replica/session';
import { h } from '../dom';
import type { ReplicaHandle } from '../replica/app';
import type { MapView } from './map';

const SVG = 'http://www.w3.org/2000/svg';
const W = 1000;
const LEFT = 120;
const LANE = 22;
const AXIS = 24;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  ...children: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

const fmt = (x: number, d = 1): string => formatNumber(x, d);

function niceStep(end: number): number {
  for (const s of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600])
    if (end / s <= 12) return s;
  return 7200;
}

const trackCache = new WeakMap<object, TrackPoint[]>();

export interface AnalysisView {
  el: HTMLElement;
  /** Recalcula a partir do estado corrente da réplica (aba mostrada ou cenário alterado). */
  show: () => void;
}

export function analysisView(
  replica: ReplicaHandle,
  goto: (line: number | null, target: Target | null) => void,
): AnalysisView {
  let t = 0;
  const head = h('div', { class: 'an-head' });
  const lanes = h('div', { class: 'an-timeline' });
  const tInput = h('input', {
    type: 'number',
    min: '0',
    step: 'any',
    'aria-label': 'instante do cursor (s)',
    onchange: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      if (Number.isFinite(v) && v >= 0) setCursor(v);
    },
  });
  const statePanel = h('div', { class: 'an-state' });
  const routePanel = h('div', { class: 'an-route' });
  const eventsPanel = h('div', { class: 'an-events' });

  const mapClick = (lat: number, lon: number, close: () => void): HTMLElement | null => {
    const s = replica.session();
    const sc = s.scenario;
    const fmtLL = sc.display.latLonFormat;
    const latText = formatNumber(lat, 7);
    const lonText = formatNumber(lon, 7);
    const msg = h('div', { class: 'sev-error' });
    const run = (r: ReturnType<typeof setField>): void => {
      if (!r.ok) msg.textContent = r.error;
      else if (replica.act(r)) close();
    };
    const usePos = (): void => {
      const a = setField(s, 'position.lat', latText);
      run(a.ok ? setField(a.session, 'position.lon', lonText) : a);
    };
    const addPoint = (): void => {
      const last = sc.route.points.at(-1);
      const leg = last
        ? {
            climbRate_mps: last.climbRate_mps,
            speed_mps: last.speed_mps,
            accel_mps2: last.accel_mps2,
            turnRadius_m: last.turnRadius_m,
          }
        : { climbRate_mps: 0, speed_mps: 10, accel_mps2: 1, turnRadius_m: 100 };
      const p: RoutePoint = {
        kind: 'point',
        name: `P${sc.route.points.length + 1}`,
        lat_rad: (lat * Math.PI) / 180,
        lon_rad: (lon * Math.PI) / 180,
        alt_m: last?.kind === 'point' ? last.alt_m : sc.position.alt_m,
        ...leg,
      };
      run(routeInsert(s, p));
    };
    return h(
      'div',
      { class: 'pt-pop' },
      h('div', {}, formatLatLon((lat * Math.PI) / 180, 'lat', fmtLL)),
      h('div', {}, formatLatLon((lon * Math.PI) / 180, 'lon', fmtLL)),
      h(
        'div',
        { class: 'pop-btns' },
        sc.setup.simulationType === 'STATIC'
          ? h('button', { type: 'button', onclick: usePos }, 'Usar como posição estática')
          : null,
        sc.setup.simulationType === 'DYNAMIC'
          ? h('button', { type: 'button', onclick: addPoint }, 'Acrescentar à rota')
          : null,
      ),
      msg,
    );
  };
  let map: MapView | null = null;
  let mapLoading = false;
  const mapHost = h('div', { class: 'an-map' });

  function setCursor(v: number): void {
    t = Math.round(v * 1000) / 1000;
    render();
  }

  function timelineSvg(sc: Scenario, events: AnalysisEvent[], end: number): SVGSVGElement {
    const svs = actionSvs(sc);
    const rows = ['Execução', 'RF Level', ...svs.map((x) => `${x.constellation} ${x.sv}`)];
    const H = AXIS + rows.length * LANE + 6;
    const x = (v: number): number => LEFT + (Math.min(v, end) / end) * (W - LEFT - 10);
    const root = svg('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'tl',
      role: 'img',
      'aria-label': 'linha do tempo',
    });
    const step = niceStep(end);
    for (let v = 0; v <= end; v += step) {
      root.append(svg('line', { x1: x(v), x2: x(v), y1: AXIS - 4, y2: H, class: 'tl-grid' }));
      root.append(svg('text', { x: x(v), y: 14, class: 'tl-tick' }, `${fmt(v, 0)} s`));
    }
    rows.forEach((r, i) => {
      root.append(svg('text', { x: 4, y: AXIS + i * LANE + 15, class: 'tl-lane' }, r));
    });
    const y = (i: number): number => AXIS + i * LANE + 3;
    // Execução: do @run ao @stop (ou até o fim do eixo, tracejado).
    const stop = sc.run.stopAt_s;
    root.append(
      svg('rect', {
        x: x(0),
        y: y(0),
        width: x(stop ?? end) - x(0),
        height: LANE - 6,
        class: stop === null ? 'tl-run open' : 'tl-run',
      }),
    );
    // RF Level: degraus com o valor.
    const rf = sortedActions(sc.actions).filter((a) => a.type === 'rfLevel');
    const bounds = [0, ...rf.map((a) => a.t_s), stop ?? end];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i] ?? 0;
      const b = bounds[i + 1] ?? end;
      const lvl = stateAt(sc, a).rfLevel_dBm;
      const g = svg(
        'g',
        { class: 'tl-seg rf' },
        svg('title', {}, `RF Level ${fmt(lvl)} dBm de ${fmt(a, 3)} s`),
      );
      g.append(
        svg('rect', { x: x(a), y: y(1), width: Math.max(1, x(b) - x(a)), height: LANE - 6 }),
      );
      if (x(b) - x(a) > 40)
        g.append(svg('text', { x: x(a) + 4, y: y(1) + 12, class: 'tl-val' }, `${fmt(lvl)} dBm`));
      root.append(g);
    }
    // SVs: segmentos entre mudanças (ações e fim do Doppler), coloridos pelo estado.
    svs.forEach((s, k) => {
      const acts = sc.actions.filter(
        (a) => a.type === 'sv' && a.constellation === s.constellation && a.sv === s.sv,
      );
      const cuts = new Set<number>([0, stop ?? end]);
      for (const a of acts) {
        cuts.add(a.t_s);
        if (a.type === 'sv' && a.doppler_Hz !== 0) cuts.add(a.t_s + a.duration_s);
      }
      const ts = [...cuts].filter((v) => v <= (stop ?? end)).sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i++) {
        const a = ts[i] ?? 0;
        const b = ts[i + 1] ?? end;
        const st = stateAt(sc, a).svs.find(
          (v) => v.constellation === s.constellation && v.sv === s.sv,
        );
        if (!st?.manipulated) continue;
        const cls =
          st.state.select === 'OFF'
            ? 'off'
            : st.state.health === 'BAD' || st.state.health === 'DISCONNECTED'
              ? 'bad'
              : 'manip';
        const text = describeAction({
          ...st.state,
          doppler_Hz: st.doppler_Hz,
          t_s: a,
          type: 'sv',
          constellation: s.constellation,
          sv: s.sv,
        });
        root.append(
          svg(
            'g',
            { class: `tl-seg sv ${cls}` },
            svg('title', {}, `${fmt(a, 3)} a ${fmt(b, 3)} s: ${text}`),
            svg('rect', {
              x: x(a),
              y: y(k + 2),
              width: Math.max(2, x(b) - x(a)),
              height: LANE - 6,
            }),
          ),
        );
      }
    });
    // Marcadores dos eventos em execução: clique leva à linha e ao campo.
    for (const e of events) {
      if (e.t_s === null || e.kind === 'run') continue;
      const lane =
        e.target?.kind === 'sv'
          ? 2 +
            svs.findIndex(
              (v) =>
                e.target?.kind === 'sv' &&
                v.constellation === e.target.constellation &&
                v.sv === e.target.sv,
            )
          : e.target?.kind === 'field' && e.target.id === 'setup.rfLevel'
            ? 1
            : 0;
      const mk = svg(
        'g',
        { class: `tl-ev ${e.exact ? '' : 'approx'}`, tabindex: 0 },
        svg('title', {}, `L${e.line}, t ${e.exact ? '' : '≥ '}${fmt(e.t_s, 3)} s: ${e.label}`),
        svg('path', { d: `M${x(e.t_s)},${y(Math.max(0, lane)) - 2} l5,-6 h-10 z` }),
      );
      mk.addEventListener('click', (ev) => {
        ev.stopPropagation();
        goto(e.line, e.target);
      });
      root.append(mk);
    }
    // Cursor.
    root.append(svg('line', { x1: x(t), x2: x(t), y1: AXIS - 6, y2: H, class: 'tl-cursor' }));
    const pick = (ev: PointerEvent): void => {
      const r = root.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      if (px < LEFT - 4) return;
      setCursor(Math.max(0, Math.min(end, ((px - LEFT) / (W - LEFT - 10)) * end)));
    };
    root.addEventListener('pointerdown', (ev) => {
      pick(ev);
      root.setPointerCapture(ev.pointerId);
    });
    root.addEventListener('pointermove', (ev) => {
      if (root.hasPointerCapture(ev.pointerId)) pick(ev);
    });
    return root;
  }

  function stateView(s: ReplicaSession, at: StateAt): HTMLElement {
    const sc = s.scenario;
    const dv = (id: string): string => displayValue(field(id), sc);
    const b = levelBudget(sc, at.rfLevel_dBm);
    const rows: [string, string][] = [
      ['Simulação', `${dv('setup.simulationType')}, ${dv('setup.gnss')} ${dv('setup.carrier')}`],
      [
        'Porta e RF Level',
        `${dv('setup.rfPort')}, ${fmt(at.rfLevel_dBm)} dBm${at.rfLevelSince_s !== null ? ` (desde ${fmt(at.rfLevelSince_s, 3)} s)` : ''}`,
      ],
      [
        'Faixa da porta (D17)',
        `${b.range_dBm[0]} a ${b.range_dBm[1]} dBm${b.inRange ? '' : ', fora da faixa'}`,
      ],
      [
        'Composto na saída',
        `${fmt(b.composite_dBm(6))} dBm com 6 SVs, ${fmt(b.composite_dBm(12))} dBm com 12`,
      ],
    ];
    if (b.atAntenna_dBm !== null)
      rows.push(['Na antena (acoplador)', `${fmt(b.atAntenna_dBm)} dBm`]);
    rows.push([
      'Perdas',
      `acoplador ${fmt(sc.io.coupler_dB)}, cabo do acoplador ${fmt(sc.io.couplerCable_dB)}, cabo direto ${fmt(sc.io.directCable_dB)}, divisor ${fmt(sc.io.splitter_dB)} dB`,
    ]);
    if (sc.setup.clock === 'USER') {
      const now = sc.setup.userTime_s + t;
      rows.push(['Hora simulada', `${formatDate(now)} ${formatTime(now)} UTC`]);
    } else rows.push(['Relógio', dv('setup.clock')]);
    if (sc.setup.simulationType === 'STATIC')
      rows.push([
        'Posição',
        `${dv('position.lat')}, ${dv('position.lon')}, ${dv('position.alt')} ${fieldUnit(field('position.alt'), sc)}`,
      ]);
    else if (sc.setup.simulationType === 'DYNAMIC')
      rows.push([
        'Rota',
        sc.files.route
          ? `arquivo ${sc.files.route}`
          : `${sc.route.points.length} pontos${sc.route.loop === 'ON' ? ', em loop' : ''}`,
      ]);
    else rows.push(['Trajetória', sc.files.nmea ?? 'sem arquivo']);
    rows.push(['Modelo de movimento', dv('motion.model')]);
    const svRows = at.svs.map((v) =>
      h(
        'tr',
        { class: v.manipulated ? 'manip' : '' },
        h('td', {}, `${v.constellation} ${v.sv}`),
        h('td', {}, v.state.select),
        h('td', {}, v.state.health),
        h('td', {}, fmt(v.doppler_Hz, 0)),
        h('td', {}, fmt(v.state.incoherence_mps, 3)),
        h('td', {}, fmt(v.state.ampOffset_dB)),
        h('td', {}, fmt(v.state.stepError_m, 3)),
        h('td', {}, v.state.select === 'OFF' ? '' : fmt(at.rfLevel_dBm + v.state.ampOffset_dB)),
      ),
    );
    return h(
      'div',
      {},
      h('h3', {}, `Estado em t = ${fmt(t, 3)} s${at.running ? '' : ' (simulação parada)'}`),
      h(
        'dl',
        { class: 'an-dl' },
        rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
      ),
      at.svs.length > 0
        ? h(
            'table',
            { class: 'params' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                [
                  'SV',
                  'Select',
                  'Health',
                  'Doppler (Hz)',
                  'Coerência (m/s)',
                  'Offset (dB)',
                  'Step (m)',
                  'Nível (dBm)',
                ].map((c) => h('th', {}, c)),
              ),
            ),
            h('tbody', {}, svRows),
          )
        : h('p', { class: 'muted' }, 'Nenhum SV manipulado pelo script.'),
    );
  }

  function routeView(sc: Scenario, rc: RouteCheck): HTMLElement | null {
    if (sc.route.points.length === 0) return null;
    const m = (v: number | null): string => (v === null ? '' : fmt(v / 1000, 3));
    return h(
      'div',
      {},
      h(
        'h3',
        {},
        `Rota: ${rc.points.length} pontos, ${fmt(rc.length_m / 1000, 3)} km${sc.setup.simulationType === 'DYNAMIC' ? '' : ' (emitida só com Simulation = Dynamic)'}`,
      ),
      rc.warnings.length > 0
        ? h(
            'ul',
            { class: 'diags' },
            rc.warnings.map((w) => h('li', { class: 'sev-warning' }, w)),
          )
        : null,
      h(
        'div',
        { class: 'scroll-x' },
        h(
          'table',
          { class: 'params' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              [
                '#',
                'Nome',
                'Latitude',
                'Longitude',
                'Alt (m)',
                'Vel (m/s)',
                'Raio (m)',
                'Acel (m/s²)',
                'Subida (m/s)',
                'Até o próximo (km)',
                'Avisos',
              ].map((c) => h('th', {}, c)),
            ),
          ),
          h(
            'tbody',
            {},
            rc.points.map((p) =>
              h(
                'tr',
                {
                  class: p.warnings.length > 0 ? 'warn' : '',
                  onclick: () => {
                    goto(null, { kind: 'window', win: 'route' });
                  },
                },
                h('td', {}, String(p.index + 1)),
                h('td', {}, p.name),
                h(
                  'td',
                  {},
                  p.lat_rad === null
                    ? '?'
                    : formatLatLon(p.lat_rad, 'lat', sc.display.latLonFormat),
                ),
                h(
                  'td',
                  {},
                  p.lon_rad === null
                    ? '?'
                    : formatLatLon(p.lon_rad, 'lon', sc.display.latLonFormat),
                ),
                h('td', {}, p.alt_m === null ? '?' : fmt(p.alt_m)),
                h('td', {}, fmt(p.speed_mps, 2)),
                h('td', {}, fmt(p.turnRadius_m)),
                h('td', {}, fmt(p.accel_mps2, 2)),
                h('td', {}, fmt(p.climbRate_mps, 3)),
                h('td', {}, m(p.next_m)),
                h('td', {}, p.warnings.join('; ')),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function eventsView(events: AnalysisEvent[]): HTMLElement {
    const cfg = events.filter((e) => e.t_s === null && e.kind !== 'query').length;
    const runEvents = events.filter((e) => e.t_s !== null && e.kind !== 'query');
    return h(
      'div',
      {},
      h('h3', {}, `Eventos do script (${cfg} comandos de configuração antes do @run)`),
      h(
        'div',
        { class: 'scroll-x' },
        h(
          'table',
          { class: 'params ev' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['t (s)', 'Linha', 'Evento'].map((c) => h('th', {}, c)),
            ),
          ),
          h(
            'tbody',
            {},
            runEvents.map((e) =>
              h(
                'tr',
                {
                  class: (e.t_s ?? 0) <= t ? 'past' : '',
                  title: 'Ir para a linha do script e o campo da réplica',
                  onclick: () => {
                    goto(e.line, e.target);
                  },
                },
                h('td', {}, `${e.exact ? '' : '≥ '}${fmt(e.t_s ?? 0, 3)}`),
                h('td', {}, `L${e.line}`),
                h('td', {}, h('code', {}, e.label)),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function render(): void {
    // Fora do documento (outra aba) não renderiza: o mapa mediria tamanho zero. show() refaz.
    if (!el.isConnected) return;
    const s = replica.session();
    const sc = s.scenario;
    const doc = parseScript(replica.script());
    const events = analysisEvents(doc);
    const end = timelineEnd(sc);
    if (t > end) t = end;
    const errors = doc.diagnostics.filter((d) => d.severity === 'error').length;
    head.replaceChildren(
      h('strong', {}, sc.name),
      h('span', { class: 'badge' }, 'camada declarada'),
      h(
        'span',
        { class: 'muted' },
        'Lido do script e do cenário da aba Equipamento. Satélites calculados pelo almanaque: M6.',
      ),
      ...(errors > 0 ? [h('span', { class: 'badge warn' }, `${errors} erro(s) no script`)] : []),
    );
    tInput.value = String(t);
    lanes.replaceChildren(
      h(
        'div',
        { class: 'an-tl-bar' },
        h('label', {}, 'Cursor (s) ', tInput),
        h(
          'span',
          { class: 'muted' },
          'Clicar ou arrastar na linha do tempo; clicar num marcador leva à linha do script e ao campo.',
        ),
      ),
      h('div', { class: 'an-tl-scroll' }, timelineSvg(sc, events, end)),
    );
    const at = stateAt(sc, t);
    statePanel.replaceChildren(stateView(s, at));
    const rc = checkRoute(sc);
    const rv = routeView(sc, rc);
    routePanel.replaceChildren(...(rv ? [rv] : []));
    eventsPanel.replaceChildren(eventsView(events));

    // Leaflet e o contorno costeiro vêm sob demanda, na primeira vez que a aba é mostrada.
    if (!map) {
      if (!mapLoading) {
        mapLoading = true;
        mapHost.textContent = 'Carregando o mapa…';
        void import('./map').then((m) => {
          map = m.createMap(mapClick);
          mapHost.replaceChildren(map.el);
          render();
        });
      }
      return;
    }
    map.resize();
    const att = s.attachments.trajectory;
    let track: TrackPoint[] | null = null;
    if (att) {
      track = trackCache.get(att) ?? parseTrajectory(att.text).points;
      trackCache.set(att, track);
    }
    map.update({
      position:
        sc.setup.simulationType === 'STATIC'
          ? {
              lat_rad: sc.position.lat_rad,
              lon_rad: sc.position.lon_rad,
              label: 'Posição estática',
            }
          : null,
      route:
        sc.setup.simulationType === 'DYNAMIC' && sc.route.points.length > 0
          ? { points: rc.points, loop: sc.route.loop === 'ON' }
          : null,
      trajectory: sc.setup.simulationType === 'TRAJECTORY' ? track : null,
    });
  }

  replica.onChange(render);
  const el = h(
    'section',
    { class: 'analysis' },
    head,
    lanes,
    h('div', { class: 'an-grid' }, statePanel, mapHost),
    routePanel,
    eventsPanel,
  );
  return {
    el,
    show: render,
  };
}
