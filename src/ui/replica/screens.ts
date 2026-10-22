// Janelas da réplica (OP capítulo 3). Cada função devolve o corpo da janela para o estado atual.
import { radToDeg } from '../../core/geo';
import { maxBankAngle } from '../../core/scenario/motion';
import type { Scenario } from '../../core/scenario/types';
import { formatNumber } from '../../core/units';
import { formatDate, formatTime, parseTime } from '../../replica/datetime';
import {
  displayUnit,
  fromDisplay,
  toDisplay,
  unitLabel,
  type DisplayQuantity,
} from '../../replica/display-units';
import { displayValue, field, fieldUnit, lockReason } from '../../replica/fields';
import { formatLatLon } from '../../replica/latlon';
import {
  formToPoint,
  newRouteForm,
  pointToForm,
  ROUTE_COLUMNS,
  routeRows,
  type RouteForm,
} from '../../replica/route-form';
import { servicesFor } from '../../replica/services';
import {
  channelDefaults,
  importSvList,
  motionDefaults,
  routeClear,
  routeDelete,
  routeInsert,
  routeLoop,
  routeMove,
  routeReplace,
  routeSaveAs,
  setAlmanac,
  setFile,
  setPrns,
  setTime,
  svApply,
  svStateAt,
  toggleImport,
  waypointDelete,
  waypointUpsert,
  waypointUse,
  type Constellation,
  type SvEdit,
} from '../../replica/session';
import {
  emptyWaypointForm,
  formToWaypoint,
  waypointToForm,
  type WaypointForm,
} from '../../replica/waypoint-form';
import { h } from '../dom';
import { attachmentRow } from './files-view';
import {
  actionBox,
  button,
  choiceDialog,
  confirmDialog,
  entryDialog,
  group,
  infoBox,
  note,
  pills,
  row,
  table,
  type AppApi,
  type WindowId,
} from './kit';

interface SvForm {
  select: string;
  health: string;
  amp: string;
  coherence: string;
  doppler: string;
  step: string;
  duration: string;
}

export type Sub =
  | { kind: 'svEdit'; cons: Constellation; sv: number; form: SvForm }
  | { kind: 'routeStored'; insertAt: number | null }
  | { kind: 'routeEdit'; index: number | null; insertAt: number | null; form: RouteForm }
  | { kind: 'wpEdit'; prevCode: string | null; form: WaypointForm };

export interface UiState {
  win: WindowId;
  tab: Record<string, string>;
  sub: Sub | null;
  routeSel: number | null;
  wpSel: number | null;
  storedSel: number | null;
  storedCode: string;
}

export function initialUi(): UiState {
  return {
    win: 'simulation',
    tab: { simulation: 'GPS', setup: 'Simulation', svprn: 'GPS', file: 'Almanacs' },
    sub: null,
    routeSel: null,
    wpSel: null,
    storedSel: null,
    storedCode: '',
  };
}

export const WINDOWS: readonly [WindowId, string][] = [
  ['simulation', 'Simulation'],
  ['setup', 'Setup'],
  ['svprn', 'SV PRN'],
  ['route', 'Route'],
  ['waypoint', 'Waypoint'],
  ['gpsrx', 'GPS RX'],
  ['file', 'File'],
  ['diagnostics', 'Diagnostics'],
];

const fmt = (x: number, d: number): string => formatNumber(x, d);

function fb(app: AppApi, id: string, cls = ''): HTMLElement {
  const f = field(id);
  const sc = app.session.scenario;
  const lock = lockReason(f, sc, app.session.running);
  const err = app.fieldErrors.get(id);
  const v = displayValue(f, sc);
  const el = actionBox(
    f.label,
    v === '' ? '—' : v,
    () => {
      app.editField(id);
    },
    { unit: fieldUnit(f, sc), lock, cls: `${cls} ${err ? 'err' : ''}`, title: err },
  );
  el.dataset.field = id;
  return el;
}

/** Janela (e aba do Setup) onde o campo aparece, para levar a ele a partir do script ou da análise. */
export function fieldLocation(id: string): { win: WindowId; setupTab?: string } {
  if (id.startsWith('position.') || id === 'setup.rfLevel') return { win: 'simulation' };
  if (id.startsWith('channels.')) return { win: 'setup', setupTab: 'Channels' };
  if (
    id.startsWith('io.') ||
    ['setup.extRef', 'setup.referenceSource', 'setup.triggerSource'].includes(id)
  )
    return { win: 'setup', setupTab: 'I/O' };
  if (id.startsWith('motion.') && id !== 'motion.model')
    return { win: 'setup', setupTab: 'Motion' };
  return { win: 'setup', setupTab: 'Simulation' };
}

function hms(t: number): string {
  return formatTime(t);
}

function q(sc: Scenario, quantity: DisplayQuantity): string {
  return unitLabel(displayUnit(sc.setup.units, quantity));
}

// ---------------------------------------------------------------- Simulation (OP 3-1 a 3-4)

function simulationWindow(app: AppApi, ui: UiState): HTMLElement {
  const s = app.session;
  const sc = s.scenario;
  const tab = ui.tab.simulation ?? 'GPS';
  const carrierLabel = displayValue(field('setup.carrier'), sc);
  const prnTop =
    tab === 'SBAS'
      ? group(
          'SBAS',
          row(
            infoBox(
              'SBAS',
              sc.setup.sbas === 'AUTO'
                ? 'Auto: seleção conforme posição (sem simulação no twin)'
                : 'Off',
              '',
              'wide',
            ),
            infoBox('Visible SVs', '—'),
          ),
        )
      : (() => {
          const cons: Constellation = tab === 'GPS' ? 'GPS' : 'GAL';
          const svc = servicesFor(sc.setup.gnss, carrierLabel, cons);
          const list = s.svs[cons].map((x) => x.sv).join(', ');
          return group(
            'SV PRN',
            row(
              actionBox(
                'SV PRN',
                list,
                () => {
                  editPrns(app, cons);
                },
                {
                  cls: 'wide',
                  title:
                    'PRNs informados pelo operador ou importados de log (sem geometria até o M6)',
                },
              ),
              infoBox('Visible SVs', s.svs[cons].length ? String(s.svs[cons].length) : '—'),
            ),
            row(infoBox('Carrier', svc.carrier), infoBox('Services', svc.services, '', 'wide')),
          );
        })();

  const start = sc.setup.clock === 'USER' ? sc.setup.userTime_s + (s.running ? s.t_s : 0) : null;
  const elapsed = s.running
    ? actionBox(
        'Elapsed',
        hms(s.t_s),
        () => {
          entryDialog({
            title: 'Elapsed (instante da execução)',
            initial: String(s.t_s),
            hint: 'Instante em que as próximas alterações entram na linha do tempo: segundos ou hh:mm:ss.',
            keypad: true,
            onOk: (text) => {
              const t = /^\d+(\.\d+)?$/.test(text.trim())
                ? Number(text)
                : (() => {
                    const r = parseTime(text);
                    return 'error' in r ? NaN : r.seconds;
                  })();
              const r = setTime(app.session, t);
              return r.ok ? (app.act(r), null) : r.error;
            },
          });
        },
        { title: 'Ajustável em execução: define o instante das ações (@at)' },
      )
    : infoBox('Elapsed', s.t_s > 0 ? hms(s.t_s) : '00:00:00');

  return h(
    'div',
    {},
    pills(
      [
        ['GPS', 'GPS'],
        ['GAL', 'Galileo'],
        ['SBAS', 'SBAS'],
      ],
      tab,
      (id) => {
        ui.tab.simulation = id;
        app.redraw();
      },
    ),
    prnTop,
    group(
      'PVT',
      row(
        infoBox('Sim Date', start === null ? '—' : formatDate(start)),
        infoBox('Sim Time', start === null ? '—' : hms(start)),
        elapsed,
        infoBox('Speed', '—', q(sc, 'speed')),
        infoBox('Altitude Rate', '—', q(sc, 'climb')),
      ),
      row(
        fb(app, 'position.lat', 'wide'),
        fb(app, 'position.lon', 'wide'),
        fb(app, 'position.alt'),
      ),
      row(
        infoBox('From', ''),
        infoBox('To', ''),
        infoBox('Distance To Go', '—', q(sc, 'altitude')),
        infoBox('Heading', '—'),
      ),
    ),
    h(
      'div',
      { class: 'rf-bar' },
      group('RF', fb(app, 'setup.rfLevel')),
      h('span', { class: `led ${sc.setup.extRef === 'ON' ? 'on' : ''}` }, 'Ext Ref'),
      h('span', { class: `led ${s.running ? 'run' : ''}` }, s.running ? 'Running' : 'Ready'),
    ),
  );
}

function editPrns(app: AppApi, cons: Constellation): void {
  entryDialog({
    title: `SV PRN ${cons === 'GPS' ? 'GPS' : 'Galileo'}`,
    initial: app.session.svs[cons].map((x) => x.sv).join(', '),
    hint: `PRNs em simulação, separados por vírgula (${cons === 'GPS' ? '1 a 32' : '1 a 36'}). Sem geometria até o M6.`,
    onOk: (text) => {
      const r = setPrns(app.session, cons, text);
      return r.ok ? (app.act(r), null) : r.error;
    },
  });
}

// ---------------------------------------------------------------- Setup (OP 3-5 a 3-14)

function setupWindow(app: AppApi, ui: UiState): HTMLElement {
  const sc = app.session.scenario;
  const tab = ui.tab.setup ?? 'Simulation';
  let body: HTMLElement;
  if (tab === 'Simulation') {
    body = h(
      'div',
      {},
      group(
        'GNSS',
        row(
          fb(app, 'setup.gnss'),
          fb(app, 'setup.carrier'),
          fb(app, 'setup.sbas'),
          fb(app, 'setup.simulationType'),
        ),
        row(
          fb(app, 'setup.digitalNoise'),
          fb(app, 'setup.fading'),
          fb(app, 'setup.prnSignal'),
          fb(app, 'setup.positionSource'),
        ),
      ),
      group(
        'Simulation Start Time',
        row(fb(app, 'setup.clock'), fb(app, 'setup.date'), fb(app, 'setup.time')),
      ),
      h(
        'div',
        { class: 'r' },
        group('RF Output', row(fb(app, 'setup.rfLevel'), fb(app, 'setup.rfPort'))),
        h(
          'div',
          { class: 'col' },
          row(fb(app, 'setup.units'), fb(app, 'display.latLonFormat')),
          row(fb(app, 'motion.model', 'wide')),
        ),
      ),
    );
  } else if (tab === 'Channels') {
    body = h(
      'div',
      {},
      row(infoBox('Available Channels', '12')),
      group(
        'GNSS Allocation (single mode)',
        row(fb(app, 'channels.gnss'), fb(app, 'channels.sbas')),
      ),
      group(
        'GNSS Allocation (dual mode)',
        row(
          fb(app, 'channels.dualGps'),
          fb(app, 'channels.dualGal'),
          fb(app, 'channels.dualSbas'),
          button('Default', () => {
            app.act(channelDefaults(app.session));
          }),
        ),
      ),
      row(
        button('Apply', () => {
          app.message('D09: alocação de canais guardada no cenário, não emitida no script.');
        }),
      ),
      note(
        'D09: alocação de canais guardada no cenário e não emitida na v1 (faixas e padrões divergentes).',
      ),
    );
  } else if (tab === 'I/O') {
    body = h(
      'div',
      {},
      group(
        'Loss',
        row(
          fb(app, 'io.coupler'),
          fb(app, 'io.couplerCable'),
          fb(app, 'io.directCable'),
          fb(app, 'io.splitter'),
        ),
      ),
      group(
        'Input/Output',
        row(
          fb(app, 'setup.extRef'),
          fb(app, 'setup.referenceSource'),
          fb(app, 'setup.triggerSource'),
        ),
      ),
      note('Splitter Loss não aparece na tela do equipamento; existe só no remoto (SLOS, D14).'),
    );
  } else {
    const bank = maxBankAngle(sc.motion);
    body = h(
      'div',
      {},
      group(
        'Motion Model Settings',
        row(fb(app, 'motion.model', 'wide')),
        row(fb(app, 'motion.maxLongitudinal'), fb(app, 'motion.maxLateral')),
        row(
          fb(app, 'motion.maxVelocity'),
          infoBox('Max Bank Angle', bank === null ? '' : fmt(radToDeg(bank), 3), 'deg'),
        ),
        row(
          button('Defaults', () => {
            app.act(motionDefaults(app.session));
          }),
        ),
      ),
      note(
        'D27: limites de fábrica do settings XML (01-equipamento.md seção 4); edição só com Custom.',
      ),
    );
  }
  return h(
    'div',
    {},
    pills(
      [
        ['Simulation', 'Simulation'],
        ['Channels', 'Channels'],
        ['I/O', 'I/O'],
        ['Motion', 'Motion'],
      ],
      tab,
      (id) => {
        ui.tab.setup = id;
        app.redraw();
      },
    ),
    body,
  );
}

// ---------------------------------------------------------------- SV PRN (OP 3-15 a 3-17, Fig. 4-2)

function svForm(sc: Scenario, e: SvEdit): SvForm {
  return {
    select: e.select,
    health: e.health,
    amp: fmt(e.ampOffset_dB, 1),
    coherence: fmt(toDisplay(e.incoherence_mps, sc.setup.units, 'coherence'), 3),
    doppler: fmt(e.doppler_Hz, 0),
    step: fmt(toDisplay(e.stepError_m, sc.setup.units, 'step'), 3),
    duration: String(e.duration_s),
  };
}

function svPrnWindow(app: AppApi, ui: UiState): HTMLElement {
  const s = app.session;
  const sc = s.scenario;
  const tab = ui.tab.svprn ?? 'GPS';
  const cons: Constellation = tab === 'GPS' ? 'GPS' : 'GAL';
  const rows = s.svs[cons].map((x) => {
    const st = svStateAt(sc, cons, x.sv, s.t_s);
    return [
      st.select,
      String(x.sv),
      x.elevation_deg === null ? '' : fmt(x.elevation_deg, 4),
      x.azimuth_deg === null ? '' : fmt(x.azimuth_deg, 4),
      st.health,
      fmt(st.doppler_Hz, 0),
      fmt(toDisplay(st.incoherence_mps, sc.setup.units, 'coherence'), 3),
      fmt(st.ampOffset_dB, 1),
      fmt(toDisplay(st.stepError_m, sc.setup.units, 'step'), 3),
    ];
  });
  return h(
    'div',
    {},
    pills(
      [
        ['GPS', 'GPS'],
        ['GAL', 'Galileo'],
      ],
      tab,
      (id) => {
        ui.tab.svprn = id;
        app.redraw();
      },
    ),
    row(
      button('PRNs…', () => {
        editPrns(app, cons);
      }),
      button('Importar LIST? de log…', () => {
        entryDialog({
          title: `Importar ${cons === 'GPS' ? 'GPS:SVPR:GPS:LIST?' : 'GPS:SVPR:GAL:LIST?'}`,
          initial: '',
          hint: 'Colar a resposta do log (uma linha por SV; \\n aceito). Usados SV, elevação e azimute (D03).',
          multiline: true,
          onOk: (text) => {
            const r = importSvList(app.session, cons, text);
            return r.ok ? (app.act(r), null) : r.error;
          },
        });
      }),
    ),
    table(
      [
        'Select',
        'SV',
        'Elevation(°)',
        'Azimuth(°)',
        'Health',
        'Doppler',
        `Carrier Incohe. (${q(sc, 'coherence')})`,
        'Amp.Offset',
        `Step Error (${q(sc, 'step')})`,
      ],
      rows,
      {
        rowClass: (i) => (rows[i]?.[0] === 'ON' ? 'sim' : ''),
        onSelect: (i) => {
          const sv = s.svs[cons][i]?.sv;
          if (sv === undefined) return;
          ui.sub = { kind: 'svEdit', cons, sv, form: svForm(sc, svStateAt(sc, cons, sv, s.t_s)) };
          app.revealHeader(cons === 'GPS' ? 'GPS:SVPR:GPS:SATellite' : 'GPS:SVPR:GAL:SATellite');
          app.redraw();
        },
      },
    ),
    row(
      button(
        'Reset',
        () => {
          let cur = app.session;
          for (const x of cur.svs[cons]) {
            const st = svStateAt(cur.scenario, cons, x.sv, cur.t_s);
            const def = {
              select: 'ON' as const,
              health: cons === 'GPS' ? ('GOOD' as const) : ('CONNECTED' as const),
              ampOffset_dB: 0,
              incoherence_mps: 0,
              doppler_Hz: 0,
              stepError_m: 0,
              duration_s: 3600,
            };
            if (JSON.stringify(st) === JSON.stringify(def)) continue;
            const r = svApply(cur, cons, x.sv, def);
            if (!r.ok) {
              app.message(r.error, 'error');
              return;
            }
            cur = r.session;
          }
          app.act({ ok: true, session: cur });
        },
        { disabled: s.running ? null : 'Só com a simulação rodando' },
      ),
    ),
    s.running
      ? note(
          `Alterações entram na linha do tempo em t = ${fmt(s.t_s, 3)} s (campo Elapsed na janela Simulation).`,
        )
      : note(
          'Edição de SV só com a simulação rodando (RUN). A tabela mostra o estado no instante corrente.',
        ),
  );
}

function svEditWindow(
  app: AppApi,
  ui: UiState,
  sub: Extract<Sub, { kind: 'svEdit' }>,
): HTMLElement {
  const sc = app.session.scenario;
  const f = sub.form;
  const sel = (label: string, key: keyof SvForm, options: string[]): HTMLElement =>
    h(
      'label',
      { class: 'fld' },
      h('span', { class: 'lbl' }, label),
      h(
        'select',
        {
          class: 'box',
          onchange: (e: Event) => {
            f[key] = (e.target as HTMLSelectElement).value;
          },
        },
        options.map((o) => {
          const opt = h('option', { value: o }, o.charAt(0) + o.slice(1).toLowerCase());
          if (o === f[key]) opt.selected = true;
          return opt;
        }),
      ),
    );
  const inp = (label: string, key: keyof SvForm, unit: string): HTMLElement => {
    const el = h('input', {
      class: 'box',
      type: 'text',
      oninput: (e: Event) => {
        f[key] = (e.target as HTMLInputElement).value;
      },
    });
    el.value = f[key];
    return h(
      'label',
      { class: 'fld' },
      h('span', { class: 'lbl' }, label),
      h('span', { class: 'line' }, el, h('span', { class: 'unit' }, unit)),
    );
  };
  const apply = (): void => {
    const nums: Record<string, number> = {};
    for (const k of ['amp', 'coherence', 'doppler', 'step', 'duration'] as const) {
      const t = f[k].trim();
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) {
        app.message(`${k}: número inválido "${t}"`, 'error');
        return;
      }
      nums[k] = Number(t);
    }
    const r = svApply(app.session, sub.cons, sub.sv, {
      select: f.select as SvEdit['select'],
      health: f.health as SvEdit['health'],
      ampOffset_dB: nums.amp ?? 0,
      incoherence_mps: fromDisplay(nums.coherence ?? 0, sc.setup.units, 'coherence'),
      doppler_Hz: nums.doppler ?? 0,
      stepError_m: fromDisplay(nums.step ?? 0, sc.setup.units, 'step'),
      duration_s: nums.duration ?? 3600,
    });
    if (app.act(r)) {
      ui.sub = null;
      app.redraw();
    }
  };
  return h(
    'div',
    {},
    row(
      sel('Select', 'select', ['ON', 'OFF']),
      sub.cons === 'GPS'
        ? sel('Satellite Health', 'health', ['GOOD', 'BAD'])
        : sel('GAL Integrity', 'health', ['CONNECTED', 'DISCONNECTED']),
    ),
    row(
      inp('Amplitude Offset', 'amp', 'dB'),
      inp('Code/Carrier Coherence', 'coherence', q(sc, 'coherence')),
    ),
    row(inp('Doppler Error', 'doppler', 'Hz'), inp('Step Error', 'step', q(sc, 'step'))),
    row(inp('Error Duration', 'duration', 's')),
    note(
      'Select Replace (troca de SV) não tem comando remoto; não representado. Faixas: Doppler ±5 kHz, offset ±15 dB, step ±1000 m (D01), coerência ±2 m/s.',
    ),
    row(
      button('Cancel', () => {
        ui.sub = null;
        app.redraw();
      }),
      button('Apply', apply, {
        cls: 'primary',
        disabled: app.session.running ? null : 'Só com a simulação rodando',
      }),
    ),
  );
}

// ---------------------------------------------------------------- Route (OP 3-18 a 3-22)

function routeWindow(app: AppApi, ui: UiState): HTMLElement {
  const s = app.session;
  const sc = s.scenario;
  const sel = ui.routeSel;
  const locked = s.running ? 'Em execução: a configuração está travada' : null;
  const rows = routeRows(sc);
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'r' },
      group(
        'Route',
        row(
          actionBox(
            'Route File',
            sc.files.route ?? '',
            () => {
              entryDialog({
                title: 'Load Route (arquivo no equipamento)',
                initial: sc.files.route ?? '',
                hint: 'Nome de uma rota já gravada no equipamento (GPS:FIL:ROUT:LOAD). Vazio: rota montada na tabela.',
                onOk: (t) => {
                  const r = setFile(app.session, 'route', t.trim() === '' ? null : t);
                  return r.ok ? (app.act(r), null) : r.error;
                },
              });
            },
            { lock: locked, cls: 'wide' },
          ),
          button(
            'Manage',
            () => {
              entryDialog({
                title: 'Manage Routes: Save',
                initial: sc.route.saveAs ?? '',
                hint: 'Grava a rota montada no equipamento (GPS:ROUT:SAV) com prefixo twin_. Vazio: não grava.',
                onOk: (t) => {
                  const r = routeSaveAs(app.session, t.trim() === '' ? null : t);
                  return r.ok ? (app.act(r), null) : r.error;
                },
              });
            },
            { disabled: locked },
          ),
          button('Validate', () => {
            app.message(
              sc.route.points.length >= 2
                ? `${sc.route.points.length} pontos. O script emite GPS:ROUT:VALD e lê o resultado em GPS:STAT?; avisos do twin no M5.`
                : 'Rota com menos de 2 pontos.',
            );
          }),
        ),
      ),
      group(
        'Properties',
        button(
          `Loop ${sc.route.loop === 'ON' ? 'On' : 'Off'}`,
          () => {
            app.act(routeLoop(app.session, sc.route.loop !== 'ON'));
          },
          { cls: sc.route.loop === 'ON' ? 'toggle on' : 'toggle', disabled: locked },
        ),
      ),
    ),
    sc.route.saveAs ? note(`Gravada como ${sc.route.saveAs} (GPS:ROUT:SAV).`) : null,
    h(
      'div',
      { class: 'r split' },
      table(ROUTE_COLUMNS, rows, {
        selected: sel,
        onSelect: (i) => {
          ui.routeSel = i;
          app.revealHeader(
            sc.route.points[i]?.kind === 'waypoint'
              ? 'GPS:ROUT:ADD:WAYPoint'
              : 'GPS:ROUT:ADD:POINt',
          );
          app.redraw();
        },
      }),
      group(
        'Points',
        h(
          'div',
          { class: 'col' },
          button(
            'Add',
            () => {
              ui.sub = { kind: 'routeStored', insertAt: sel === null ? null : sel + 1 };
              ui.storedSel = null;
              app.redraw();
            },
            { disabled: locked },
          ),
          button(
            'Delete',
            () => {
              if (sel === null) return;
              if (app.act(routeDelete(app.session, sel))) ui.routeSel = null;
              app.redraw();
            },
            { disabled: locked ?? (sel === null ? 'Selecionar um ponto' : null) },
          ),
          button(
            'Edit',
            () => {
              const p = sel === null ? undefined : sc.route.points[sel];
              if (!p || sel === null) return;
              ui.sub = { kind: 'routeEdit', index: sel, insertAt: null, form: pointToForm(sc, p) };
              app.redraw();
            },
            { disabled: locked ?? (sel === null ? 'Selecionar um ponto' : null) },
          ),
          button(
            'Clear All',
            () => {
              confirmDialog(
                'Clear All',
                'Apaga todos os pontos da rota do cenário (o script emite GPS:ROUT:CLR com @pause de confirmação).',
                () => {
                  if (app.act(routeClear(app.session))) ui.routeSel = null;
                  app.redraw();
                },
              );
            },
            { disabled: locked },
          ),
          button(
            'Move Up',
            () => {
              if (sel !== null && app.act(routeMove(app.session, sel, -1))) ui.routeSel = sel - 1;
              app.redraw();
            },
            { disabled: locked ?? (sel === null || sel === 0 ? 'Selecionar um ponto' : null) },
          ),
          button(
            'Move Down',
            () => {
              if (sel !== null && app.act(routeMove(app.session, sel, 1))) ui.routeSel = sel + 1;
              app.redraw();
            },
            {
              disabled:
                locked ??
                (sel === null || sel >= sc.route.points.length - 1 ? 'Selecionar um ponto' : null),
            },
          ),
        ),
      ),
    ),
    sc.setup.simulationType !== 'DYNAMIC'
      ? note('A rota só é emitida com Simulation = Dynamic.')
      : null,
  );
}

function routeStoredWindow(
  app: AppApi,
  ui: UiState,
  sub: Extract<Sub, { kind: 'routeStored' }>,
): HTMLElement {
  const sc = app.session.scenario;
  const code = h('input', {
    class: 'box',
    type: 'text',
    placeholder: 'ex.: SFO',
    oninput: (e: Event) => {
      ui.storedCode = (e.target as HTMLInputElement).value;
    },
  });
  code.value = ui.storedCode;
  const next = (form: RouteForm): void => {
    ui.sub = { kind: 'routeEdit', index: null, insertAt: sub.insertAt, form };
    app.redraw();
  };
  return h(
    'div',
    {},
    group(
      'Stored Waypoints',
      table(
        ['Code', 'ICAO Code', 'Name', 'City', 'Country', 'Latitude', 'Longitude'],
        sc.userWaypoints.map((w) => [
          w.code,
          w.icao,
          w.name,
          w.city,
          w.state,
          formatLatLon(w.lat_rad, 'lat', sc.display.latLonFormat),
          formatLatLon(w.lon_rad, 'lon', sc.display.latLonFormat),
        ]),
        {
          selected: ui.storedSel,
          onSelect: (i) => {
            ui.storedSel = i;
            app.redraw();
          },
        },
      ),
      note(
        'O banco de waypoints do equipamento não está no twin: lista só os waypoints de usuário do cenário. Para um waypoint do banco, informar o código abaixo.',
      ),
      h(
        'label',
        { class: 'fld' },
        h('span', { class: 'lbl' }, 'Código do banco do equipamento'),
        code,
      ),
    ),
    row(
      button('Cancel', () => {
        ui.sub = null;
        app.redraw();
      }),
      button('Ponto livre', () => {
        next(newRouteForm(sc));
      }),
      button(
        'Next',
        () => {
          const w = ui.storedSel === null ? undefined : sc.userWaypoints[ui.storedSel];
          if (w) next(newRouteForm(sc, w));
          else if (ui.storedCode.trim() !== '')
            next(newRouteForm(sc, { code: ui.storedCode.trim() }));
          else app.message('Selecionar um waypoint ou informar o código do banco', 'error');
        },
        { cls: 'primary' },
      ),
    ),
  );
}

function formInput<T extends object>(
  form: T,
  key: keyof T & string,
  label: string,
  unit = '',
  readonly = false,
): HTMLElement {
  const el = h('input', {
    class: 'box',
    type: 'text',
    readonly,
    oninput: (e: Event) => {
      (form as Record<string, string>)[key] = (e.target as HTMLInputElement).value;
    },
  });
  const v = (form as Record<string, unknown>)[key];
  el.value = typeof v === 'string' ? v : '';
  return h(
    'label',
    { class: 'fld' },
    h('span', { class: 'lbl' }, label),
    h('span', { class: 'line' }, el, unit ? h('span', { class: 'unit' }, unit) : null),
  );
}

function routeEditWindow(
  app: AppApi,
  ui: UiState,
  sub: Extract<Sub, { kind: 'routeEdit' }>,
): HTMLElement {
  const sc = app.session.scenario;
  const f = sub.form;
  const wp = f.kind === 'waypoint';
  const done = (): void => {
    const p = formToPoint(sc, f);
    if ('error' in p) {
      app.message(p.error, 'error');
      return;
    }
    const r =
      sub.index === null
        ? routeInsert(app.session, p.point, sub.insertAt ?? undefined)
        : routeReplace(app.session, sub.index, p.point);
    if (app.act(r)) {
      ui.sub = null;
      app.redraw();
    }
  };
  return h(
    'div',
    {},
    group(
      wp ? `Route Point (waypoint do banco: ${f.name})` : 'Route Point',
      h(
        'div',
        { class: 'r' },
        h(
          'div',
          { class: 'col' },
          formInput(f, 'name', wp ? 'Code' : 'Name', '', wp),
          formInput(f, 'lat', 'Latitude', '', wp),
          formInput(f, 'lon', 'Longitude', '', wp),
          formInput(f, 'alt', 'Altitude', q(sc, 'altitude'), wp),
        ),
        h(
          'div',
          { class: 'col' },
          formInput(f, 'climb', 'Altitude Rate', q(sc, 'climb')),
          formInput(f, 'speed', 'Speed', q(sc, 'speed')),
          formInput(f, 'accel', 'Acceleration', q(sc, 'accel')),
          formInput(f, 'radius', 'Turn Radius', q(sc, 'radius')),
        ),
      ),
      note(
        wp
          ? 'Waypoint do banco: o script emite GPS:ROUT:ADD:WAYP com o código; coordenadas vêm do equipamento.'
          : 'Raio mínimo = v² / a. A distância entre pontos deve ser maior que 4 raios de curva (OP 3-21).',
      ),
    ),
    row(
      button('Cancel', () => {
        ui.sub = null;
        app.redraw();
      }),
      button('Done', done, { cls: 'primary' }),
    ),
  );
}

// ---------------------------------------------------------------- Waypoint (OP 3-23 a 3-26)

function waypointWindow(app: AppApi, ui: UiState): HTMLElement {
  const s = app.session;
  const sc = s.scenario;
  const sel = ui.wpSel;
  const w = sel === null ? undefined : sc.userWaypoints[sel];
  const locked = s.running ? 'Em execução: a configuração está travada' : null;
  const fmtLL = sc.display.latLonFormat;
  return h(
    'div',
    { class: 'r split' },
    group(
      'Waypoint List',
      table(
        [
          'Code',
          'ICAO Code',
          'Name',
          'City',
          'Country',
          'Latitude',
          'Longitude',
          `Altitude (${q(sc, 'altitude')})`,
        ],
        sc.userWaypoints.map((x) => [
          x.code,
          x.icao,
          x.name,
          x.city,
          x.state,
          formatLatLon(x.lat_rad, 'lat', fmtLL),
          formatLatLon(x.lon_rad, 'lon', fmtLL),
          fmt(toDisplay(x.alt_m, sc.setup.units, 'altitude'), 0),
        ]),
        {
          selected: sel,
          onSelect: (i) => {
            ui.wpSel = i;
            app.revealHeader('GPS:WAYP:NEW');
            app.redraw();
          },
        },
      ),
      note(
        'Waypoints de usuário do cenário (GPS:WAYP:NEW). D28: Country é o parâmetro remoto state.',
      ),
    ),
    group(
      'Waypoints',
      h(
        'div',
        { class: 'col' },
        button(
          'Add',
          () => {
            ui.sub = { kind: 'wpEdit', prevCode: null, form: emptyWaypointForm() };
            app.redraw();
          },
          { disabled: locked },
        ),
        button(
          'Delete',
          () => {
            if (!w) return;
            if (app.act(waypointDelete(app.session, w.code))) ui.wpSel = null;
            app.redraw();
          },
          { disabled: locked ?? (w ? null : 'Selecionar um waypoint') },
        ),
        button(
          'Edit',
          () => {
            if (!w) return;
            ui.sub = { kind: 'wpEdit', prevCode: w.code, form: waypointToForm(sc, w) };
            app.redraw();
          },
          { disabled: locked ?? (w ? null : 'Selecionar um waypoint') },
        ),
        button(
          'Use',
          () => {
            if (w) app.act(waypointUse(app.session, w.code));
          },
          {
            disabled:
              locked ??
              (w
                ? sc.setup.simulationType === 'DYNAMIC'
                  ? 'Travado com Simulation = Dynamic'
                  : null
                : 'Selecionar um waypoint'),
          },
        ),
        button(
          'Defaults',
          () => {
            confirmDialog('Defaults', 'Remove todos os waypoints de usuário do cenário.', () => {
              let cur = app.session;
              for (const x of [...cur.scenario.userWaypoints]) {
                const r = waypointDelete(cur, x.code);
                if (r.ok) cur = r.session;
              }
              ui.wpSel = null;
              app.act({ ok: true, session: cur });
            });
          },
          { disabled: locked },
        ),
      ),
    ),
  );
}

function waypointEditWindow(
  app: AppApi,
  ui: UiState,
  sub: Extract<Sub, { kind: 'wpEdit' }>,
): HTMLElement {
  const sc = app.session.scenario;
  const f = sub.form;
  return h(
    'div',
    {},
    group(
      'Waypoint',
      row(
        formInput(f, 'code', 'Code'),
        formInput(f, 'icao', 'ICAO Code'),
        formInput(f, 'name', 'Name'),
        formInput(f, 'city', 'City'),
      ),
      row(formInput(f, 'state', 'Country (state, D28)')),
      row(formInput(f, 'lat', 'Latitude'), formInput(f, 'lon', 'Longitude')),
      row(formInput(f, 'alt', 'Altitude', q(sc, 'altitude'))),
    ),
    row(
      button('Cancel', () => {
        ui.sub = null;
        app.redraw();
      }),
      button(
        'Done',
        () => {
          const r = formToWaypoint(sc, f);
          if ('error' in r) {
            app.message(r.error, 'error');
            return;
          }
          if (app.act(waypointUpsert(app.session, r.waypoint, sub.prevCode ?? undefined))) {
            ui.sub = null;
            app.redraw();
          }
        },
        { cls: 'primary' },
      ),
    ),
  );
}

// ---------------------------------------------------------------- GPS RX (OP 3-27)

function gpsRxWindow(app: AppApi): HTMLElement {
  const sc = app.session.scenario;
  return h(
    'div',
    {},
    group(
      'Position',
      row(infoBox('GPS Receiver', 'Internal'), infoBox('Position Fix', '')),
      row(
        infoBox('Latitude', '', 'deg'),
        infoBox('Longitude', '', 'deg'),
        infoBox('MSL Altitude', '', q(sc, 'altitude')),
      ),
    ),
    group(
      'Information',
      row(
        infoBox(
          'Almanac Status',
          sc.files.almanac.kind === 'equipment' ? 'Recebido do receptor (não fixado)' : '',
        ),
      ),
      row(
        button('Reload', () => {
          if (app.act(setAlmanac(app.session, { kind: 'equipment' }))) {
            app.message(
              'Almanaque do receptor interno: cenário não fixado (D24). Para ensaio, carregar almanaque de arquivo.',
            );
          }
        }),
        button('Record Trajectory', () => undefined, {
          disabled: 'D15: forma de parar a gravação não descrita; não emitido',
        }),
      ),
    ),
    note('Somente leitura: o twin não tem o receptor interno.'),
  );
}

// ---------------------------------------------------------------- File (OP 3-32 a 3-39)

const DESTRUCTIVE = 'Destrutivo: apaga arquivos de outros usuários; não faz parte do cenário';
const EXPORT = 'Exportação não faz parte do cenário; usar no equipamento';

function importButton(app: AppApi, kind: Scenario['files']['imports'][number]): HTMLElement {
  const on = app.session.scenario.files.imports.includes(kind);
  return button(
    on ? 'Import From USB ✓' : 'Import From USB',
    () => {
      app.act(toggleImport(app.session, kind));
    },
    { cls: on ? 'toggle on' : 'toggle' },
  );
}

function fileNameDialog(
  app: AppApi,
  title: string,
  initial: string,
  hint: string,
  set: (name: string | null) => ReturnType<typeof setFile>,
): void {
  entryDialog({
    title,
    initial,
    hint,
    onOk: (t) => {
      const r = set(t.trim() === '' ? null : t);
      return r.ok ? (app.act(r), null) : r.error;
    },
  });
}

function fileWindow(app: AppApi, ui: UiState): HTMLElement {
  const sc = app.session.scenario;
  const tab = ui.tab.file ?? 'Almanacs';
  let body: HTMLElement;
  const footer = (kind: Scenario['files']['imports'][number] | null): HTMLElement =>
    row(
      kind ? importButton(app, kind) : null,
      button('Export To USB', () => undefined, { disabled: EXPORT }),
    );
  if (tab === 'Almanacs') {
    const a = sc.files.almanac;
    const current =
      a.kind === 'file'
        ? a.name
        : a.kind === 'default'
          ? 'Default Almanac'
          : '(do receptor, não fixado)';
    body = h(
      'div',
      {},
      row(
        infoBox(
          'Current Almanac File',
          current,
          '',
          `wide ${a.kind === 'equipment' ? 'warn' : ''}`,
        ),
      ),
      row(
        button('Load', () => {
          entryDialog({
            title: 'Load Almanac',
            initial: a.kind === 'file' ? a.name : '',
            hint: 'Nome do arquivo .alm no equipamento (GPS:FIL:ALM:LOAD).',
            onOk: (t) => {
              const r = setAlmanac(app.session, { kind: 'file', name: t });
              return r.ok ? (app.act(r), null) : r.error;
            },
          });
        }),
        button('Manage', () => undefined, {
          disabled: 'D24: sem comando remoto para salvar almanaque',
        }),
        button('GPS Rx', () => {
          app.act(setAlmanac(app.session, { kind: 'equipment' }));
        }),
        button('Default', () => {
          app.act(setAlmanac(app.session, { kind: 'default' }));
        }),
        button('Clear', () => undefined, { disabled: DESTRUCTIVE }),
      ),
      note('Almanaque padrão: semana 574, 22/08/2010 (OP 3-32). O almanaque Galileo é fixo.'),
      attachmentRow(app, 'almanac'),
      footer('ALM'),
    );
  } else if (tab === 'Routes') {
    body = h(
      'div',
      {},
      row(infoBox('Current Route File', sc.files.route ?? '', '', 'wide')),
      row(
        button('Load', () => {
          fileNameDialog(
            app,
            'Load Route',
            sc.files.route ?? '',
            'Rota gravada no equipamento (GPS:FIL:ROUT:LOAD). Vazio: rota montada na janela Route.',
            (n) => setFile(app.session, 'route', n),
          );
        }),
        button('Manage', () => {
          entryDialog({
            title: 'Manage Routes: Save',
            initial: sc.route.saveAs ?? '',
            hint: 'Grava a rota montada (GPS:ROUT:SAV) com prefixo twin_. Vazio: não grava.',
            onOk: (t) => {
              const r = routeSaveAs(app.session, t.trim() === '' ? null : t);
              return r.ok ? (app.act(r), null) : r.error;
            },
          });
        }),
        button('Default', () => {
          app.act(setFile(app.session, 'route', null));
        }),
        button('Clear', () => undefined, { disabled: DESTRUCTIVE }),
      ),
      footer('ROUT'),
    );
  } else if (tab === 'Settings') {
    const values: [string, string][] = [
      ['Frequency band', displayValue(field('setup.carrier'), sc)],
      [
        'Simulation start time',
        `${formatDate(sc.setup.userTime_s)} ${formatTime(sc.setup.userTime_s)}`,
      ],
      ['Simulation mode', displayValue(field('setup.gnss'), sc)],
      ['SBAS mode', displayValue(field('setup.sbas'), sc)],
      ['Simulation type', displayValue(field('setup.simulationType'), sc)],
      ['RF port', displayValue(field('setup.rfPort'), sc)],
      ['RF level', `${displayValue(field('setup.rfLevel'), sc)} dBm`],
      ['Motion model', displayValue(field('motion.model'), sc)],
    ];
    body = h(
      'div',
      {},
      row(
        button('Load', () => {
          fileNameDialog(
            app,
            'Load Settings',
            sc.files.settings ?? '',
            'Settings gravado no equipamento (GPS:FIL:SET:LOAD), carregado antes do setup explícito do script.',
            (n) => setFile(app.session, 'settings', n),
          );
        }),
        button('Manage', () => undefined, {
          disabled: 'O script já salva o backup twin_bkp_<cenário>',
        }),
        button('Default', () => {
          app.act(setFile(app.session, 'settings', null));
        }),
        button('Clear', () => undefined, { disabled: DESTRUCTIVE }),
      ),
      row(infoBox('Current Settings File', sc.files.settings ?? '', '', 'wide')),
      group('Current Setting Values', table(['Setting Name', 'Setting Value'], values)),
      footer('SET'),
    );
  } else if (tab === 'Trajectory') {
    body = h(
      'div',
      {},
      row(infoBox('Current Trajectory File', sc.files.nmea ?? '', '', 'wide')),
      row(
        button('Load', () => {
          fileNameDialog(
            app,
            'Load Trajectory',
            sc.files.nmea ?? '',
            'Arquivo .nme ou .gdt no equipamento (GPS:FIL:NMEA:LOAD).',
            (n) => setFile(app.session, 'nmea', n),
          );
        }),
        button('Manage', () => undefined, { disabled: 'Sem comando remoto' }),
        button('Default', () => {
          app.act(setFile(app.session, 'nmea', null));
        }),
        button('Clear', () => undefined, { disabled: DESTRUCTIVE }),
      ),
      sc.setup.simulationType !== 'TRAJECTORY'
        ? note('A trajetória só é emitida com Simulation = Trajectory.')
        : null,
      attachmentRow(app, 'trajectory'),
      footer('NMEA'),
    );
  } else if (tab === 'KML') {
    body = h(
      'div',
      {},
      row(infoBox('Current KML File', sc.files.kml ?? '', '', 'wide')),
      row(
        button('Load Traj', () => {
          fileNameDialog(
            app,
            'Load Kml',
            sc.files.kml ?? '',
            'Arquivo .kml no equipamento (GPS:FIL:KML:LOAD).',
            (n) => setFile(app.session, 'kml', n),
          );
        }),
        button('Load Route', () => undefined, { disabled: 'Sem comando remoto' }),
        button('Clear', () => undefined, { disabled: DESTRUCTIVE }),
      ),
      row(
        infoBox('Maximum Velocity', '', 'Mph'),
        infoBox('Conversion Sampling Rate', ''),
        infoBox('Minimum Turning Radius', '', 'ft'),
      ),
      note(
        'Parâmetros de conversão KML (MVEL, STIM, MTR) não fazem parte do cenário. Para trajetórias, preferir GDT gerado fora (03-formatos-de-arquivo.md).',
      ),
      footer(null),
    );
  } else {
    body = h(
      'div',
      {},
      row(button('Clear', () => undefined, { disabled: DESTRUCTIVE })),
      footer('WAYP'),
    );
  }
  return h(
    'div',
    {},
    pills(
      [
        ['Almanacs', 'Almanacs'],
        ['Routes', 'Routes'],
        ['Settings', 'Settings'],
        ['Trajectory', 'Trajectory'],
        ['KML', 'KML'],
        ['Waypoints', 'Waypoints'],
      ],
      tab,
      (id) => {
        ui.tab.file = id;
        app.redraw();
      },
    ),
    body,
  );
}

// ---------------------------------------------------------------- Diagnostics (OP 3-31)

function diagnosticsWindow(): HTMLElement {
  const pll = (label: string): HTMLElement => h('span', { class: 'led' }, label);
  return h(
    'div',
    {},
    group(
      'Diagnostics',
      row(infoBox('Mode', 'Off'), infoBox('Frequency', '1176.45 MHz')),
      row(infoBox('Amplitude', '', 'dBm'), infoBox('Doppler Error', '', 'Hz')),
      row(infoBox('EXT REF OUT', 'OFF'), infoBox('Reference Source', 'INT')),
    ),
    row(
      group('Log Amp.', infoBox('', '', 'dB')),
      group(
        'PLL Lock Status',
        h(
          'div',
          { class: 'leds' },
          pll('LO'),
          pll('800 MHz'),
          pll('EXT. REF'),
          pll('EXT. REF DET'),
        ),
      ),
    ),
    note(
      'Função de manutenção (OP 5-9): Mode CW ou Modulated gera sinal de teste e trava a simulação. Não faz parte do cenário; Log Amp e PLL são leituras do hardware.',
    ),
  );
}

// ---------------------------------------------------------------- composição

export function windowTitle(ui: UiState): string {
  const sub = ui.sub;
  if (sub?.kind === 'svEdit') return `SVPRN EDIT: ${sub.cons === 'GPS' ? 'GPS' : 'GAL'} ${sub.sv}`;
  if (sub?.kind === 'routeStored' || sub?.kind === 'routeEdit') return 'Route Edit';
  if (sub?.kind === 'wpEdit') return 'Waypoint Edit';
  return WINDOWS.find(([id]) => id === ui.win)?.[1] ?? '';
}

export function windowBody(app: AppApi, ui: UiState): HTMLElement {
  const sub = ui.sub;
  if (sub?.kind === 'svEdit') return svEditWindow(app, ui, sub);
  if (sub?.kind === 'routeStored') return routeStoredWindow(app, ui, sub);
  if (sub?.kind === 'routeEdit') return routeEditWindow(app, ui, sub);
  if (sub?.kind === 'wpEdit') return waypointEditWindow(app, ui, sub);
  switch (ui.win) {
    case 'simulation':
      return simulationWindow(app, ui);
    case 'setup':
      return setupWindow(app, ui);
    case 'svprn':
      return svPrnWindow(app, ui);
    case 'route':
      return routeWindow(app, ui);
    case 'waypoint':
      return waypointWindow(app, ui);
    case 'gpsrx':
      return gpsRxWindow(app);
    case 'file':
      return fileWindow(app, ui);
    case 'diagnostics':
      return diagnosticsWindow();
  }
}

/** Seletor de opção (drop down) para um campo enum. */
export function enumChooser(
  app: AppApi,
  id: string,
  onPick: (value: string) => string | null,
): void {
  const f = field(id);
  const sc = app.session.scenario;
  choiceDialog(f.label, f.options?.(sc) ?? [], String(f.get(sc)), onPick);
}
