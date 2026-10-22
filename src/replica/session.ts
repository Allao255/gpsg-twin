// Sessão da réplica: cenário em edição, estado RUN/STOP, instante corrente da execução e lista de
// SVs informada pelo operador (sem geometria até o M6). Funções puras: cada ação devolve uma nova
// sessão ou um erro.
import type { Diagnostic } from '../core/diagnostics';
import { defaultScenario } from '../core/scenario/defaults';
import { emitScenario, sortedActions } from '../core/scenario/emit';
import { scenarioFromScript } from '../core/scenario/from-script';
import type {
  Leg,
  RoutePoint,
  Scenario,
  SvAction,
  TimedAction,
  UserWaypoint,
} from '../core/scenario/types';
import { parseScript } from '../core/script/parse';
import { formatCommand } from '../core/scpi/format';
import { checkCommand } from '../core/scpi/validate';
import { applyField, field, lockReason, parseInput } from './fields';

export type Constellation = 'GPS' | 'GAL';

export interface SvInfo {
  sv: number;
  elevation_deg: number | null;
  azimuth_deg: number | null;
}

export interface ReplicaSession {
  scenario: Scenario;
  running: boolean;
  /** Instante corrente da execução (s desde o RUN); ações registradas entram neste instante. */
  t_s: number;
  /** SVs na tabela SV PRN: informados pelo operador ou importados de log. */
  svs: Record<Constellation, SvInfo[]>;
}

export type Result = { ok: true; session: ReplicaSession } | { ok: false; error: string };

const ok = (session: ReplicaSession): Result => ({ ok: true, session });
const fail = (error: string): Result => ({ ok: false, error });

export function newSession(scenario: Scenario = defaultScenario()): ReplicaSession {
  return { scenario, running: false, t_s: 0, svs: { GPS: [], GAL: [] } };
}

function withScenario(s: ReplicaSession, mutate: (sc: Scenario) => void): ReplicaSession {
  const scenario = structuredClone(s.scenario);
  mutate(scenario);
  return { ...s, scenario };
}

// ---------------------------------------------------------------- campos

/** Edita um campo pelo texto digitado. Em execução, RF Level vira ação no instante corrente. */
export function setField(s: ReplicaSession, id: string, text: string): Result {
  const f = field(id);
  const lock = lockReason(f, s.scenario, s.running);
  if (lock) return fail(lock);
  const r = parseInput(f, s.scenario, text);
  if ('error' in r) return fail(r.error);
  if (s.running && f.runtime && f.id === 'setup.rfLevel') {
    return ok(addAction(s, { t_s: s.t_s, type: 'rfLevel', level_dBm: Number(r.value) }));
  }
  return ok({ ...s, scenario: applyField(f, s.scenario, r.value) });
}

// ---------------------------------------------------------------- execução

export function run(s: ReplicaSession): Result {
  if (s.running) return fail('a simulação já está rodando');
  return ok({ ...s, running: true, t_s: 0 });
}

export function stop(s: ReplicaSession): Result {
  if (!s.running) return fail('a simulação não está rodando');
  const last = sortedActions(s.scenario.actions).at(-1)?.t_s ?? 0;
  const stopAt = Math.max(s.t_s, last);
  return ok({
    ...withScenario(s, (sc) => {
      sc.run.stopAt_s = stopAt > 0 || sc.actions.length > 0 ? stopAt : null;
    }),
    running: false,
  });
}

/** Move o instante corrente (só em execução). */
export function setTime(s: ReplicaSession, t_s: number): Result {
  if (!s.running) return fail('o instante só é ajustável com a simulação rodando (RUN)');
  if (!Number.isFinite(t_s) || t_s < 0) return fail('instante deve ser maior ou igual a zero');
  return ok({ ...s, t_s: Math.round(t_s * 1000) / 1000 });
}

function sameAction(a: TimedAction, b: TimedAction): boolean {
  if (a.t_s !== b.t_s || a.type !== b.type) return false;
  if (a.type === 'sv' && b.type === 'sv')
    return a.constellation === b.constellation && a.sv === b.sv;
  return true;
}

/** Inclui a ação, substituindo a do mesmo alvo no mesmo instante. */
function addAction(s: ReplicaSession, a: TimedAction): ReplicaSession {
  return withScenario(s, (sc) => {
    sc.actions = sortedActions([...sc.actions.filter((x) => !sameAction(x, a)), a]);
  });
}

export function removeAction(s: ReplicaSession, index: number): Result {
  if (index < 0 || index >= s.scenario.actions.length) return fail('ação inexistente');
  return ok(
    withScenario(s, (sc) => {
      sc.actions = sc.actions.filter((_, i) => i !== index);
      const last = sortedActions(sc.actions).at(-1)?.t_s ?? null;
      if (sc.actions.length === 0 && !s.running) sc.run.stopAt_s = null;
      else if (sc.run.stopAt_s !== null && last !== null && last > sc.run.stopAt_s)
        sc.run.stopAt_s = last;
    }),
  );
}

// ---------------------------------------------------------------- SVs

export interface SvEdit {
  select: 'ON' | 'OFF';
  health: SvAction['health'];
  ampOffset_dB: number;
  incoherence_mps: number;
  doppler_Hz: number;
  stepError_m: number;
  duration_s: number;
}

export const SV_DEFAULT: SvEdit = {
  select: 'ON',
  health: 'GOOD',
  ampOffset_dB: 0,
  incoherence_mps: 0,
  doppler_Hz: 0,
  stepError_m: 0,
  duration_s: 3600,
};

/** Estado de manipulação de um SV no instante dado (última ação até t). */
export function svStateAt(sc: Scenario, cons: Constellation, sv: number, t_s: number): SvEdit {
  const last = sortedActions(sc.actions)
    .filter(
      (a): a is SvAction =>
        a.type === 'sv' && a.constellation === cons && a.sv === sv && a.t_s <= t_s,
    )
    .at(-1);
  if (!last) return { ...SV_DEFAULT, health: cons === 'GPS' ? 'GOOD' : 'CONNECTED' };
  return {
    select: last.select,
    health: last.health,
    ampOffset_dB: last.ampOffset_dB,
    incoherence_mps: last.incoherence_mps,
    doppler_Hz: last.doppler_Hz,
    stepError_m: last.stepError_m,
    duration_s: last.duration_s,
  };
}

/** Aplica a edição de um SV (janela SV PRN Edit): ação no instante corrente. Só em execução. */
export function svApply(s: ReplicaSession, cons: Constellation, sv: number, e: SvEdit): Result {
  if (!s.running)
    return fail('manipulação de SV só com a simulação rodando (RUN); entra na linha do tempo');
  const header = cons === 'GPS' ? 'GPS:SVPR:GPS:SATellite' : 'GPS:SVPR:GAL:SATellite';
  const line = formatCommand(header, [
    sv,
    e.select,
    e.health,
    e.doppler_Hz,
    e.incoherence_mps,
    e.ampOffset_dB,
    e.stepError_m,
    e.duration_s,
  ]);
  const err = checkCommand(line, {
    running: true,
    units: 'SI',
    port: null,
    losses: null,
  }).diagnostics.find((d) => d.severity === 'error');
  if (err) return fail(err.message);
  return ok(addAction(s, { t_s: s.t_s, type: 'sv', constellation: cons, sv, ...e }));
}

/** Lista de PRNs informada pelo operador ("5, 9 13"). */
export function setPrns(s: ReplicaSession, cons: Constellation, text: string): Result {
  const max = cons === 'GPS' ? 32 : 36;
  const nums = text.split(/[\s,;]+/).filter((x) => x !== '');
  const list: number[] = [];
  for (const n of nums) {
    const v = Number(n);
    if (!Number.isInteger(v) || v < 1 || v > max) return fail(`PRN inválido: ${n} (1 a ${max})`);
    if (!list.includes(v)) list.push(v);
  }
  const prev = new Map(s.svs[cons].map((x) => [x.sv, x]));
  const svs = list
    .sort((a, b) => a - b)
    .map((sv) => prev.get(sv) ?? { sv, elevation_deg: null, azimuth_deg: null });
  return ok({ ...s, svs: { ...s.svs, [cons]: svs } });
}

/**
 * Importa linhas de resposta de SVPR:LIST? (de um log): SV, elevação e azimute nos três primeiros
 * campos (D03: demais campos em ordem provável, não usados aqui).
 */
export function importSvList(s: ReplicaSession, cons: Constellation, text: string): Result {
  const rows: SvInfo[] = [];
  for (const raw of text.replace(/\\n/g, '\n').split(/\r?\n/)) {
    const line = raw.trim().replace(/^"|"$/g, '');
    if (line === '') continue;
    const f = line.split(',').map((x) => x.trim());
    const sv = Number(f[0]);
    if (!Number.isInteger(sv) || sv < 1) continue;
    const el = Number(f[1]);
    const az = Number(f[2]);
    rows.push({
      sv,
      elevation_deg: Number.isFinite(el) ? el : null,
      azimuth_deg: Number.isFinite(az) ? az : null,
    });
  }
  if (rows.length === 0) return fail('nenhuma linha de SV reconhecida');
  rows.sort((a, b) => a.sv - b.sv);
  return ok({ ...s, svs: { ...s.svs, [cons]: rows } });
}

// ---------------------------------------------------------------- rota

function configOnly(s: ReplicaSession): string | null {
  return s.running ? 'Em execução: a configuração está travada' : null;
}

function checkPoint(p: RoutePoint, s: ReplicaSession): string | null {
  const leg: Leg = p;
  const line =
    p.kind === 'point'
      ? formatCommand('GPS:ROUT:ADD:POINt', [
          p.name,
          p.lat_rad,
          p.lon_rad,
          p.alt_m,
          leg.climbRate_mps,
          leg.speed_mps,
          leg.accel_mps2,
          leg.turnRadius_m,
        ])
      : formatCommand('GPS:ROUT:ADD:WAYPoint', [
          p.code,
          leg.climbRate_mps,
          leg.speed_mps,
          leg.accel_mps2,
          leg.turnRadius_m,
        ]);
  const c = checkCommand(line, {
    running: false,
    units: 'SI',
    port: s.scenario.setup.rfPort,
    losses: s.scenario.io,
  });
  return c.diagnostics.find((d) => d.severity === 'error')?.message ?? null;
}

export function routeInsert(s: ReplicaSession, p: RoutePoint, index?: number): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  const err = checkPoint(p, s);
  if (err) return fail(err);
  const n = s.scenario.route.points.length;
  if (n >= 9999) return fail('rota com 9999 pontos (D08)');
  const i = index ?? n;
  if (!Number.isInteger(i) || i < 0 || i > n) return fail('posição de inserção fora da lista');
  return ok(
    withScenario(s, (sc) => {
      sc.route.points.splice(i, 0, p);
    }),
  );
}

export function routeReplace(s: ReplicaSession, index: number, p: RoutePoint): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (!s.scenario.route.points[index]) return fail('ponto inexistente');
  const err = checkPoint(p, s);
  if (err) return fail(err);
  return ok(
    withScenario(s, (sc) => {
      sc.route.points[index] = p;
    }),
  );
}

export function routeDelete(s: ReplicaSession, index: number): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (!s.scenario.route.points[index]) return fail('ponto inexistente');
  return ok(
    withScenario(s, (sc) => {
      sc.route.points.splice(index, 1);
    }),
  );
}

export function routeMove(s: ReplicaSession, index: number, delta: -1 | 1): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  const j = index + delta;
  const pts = s.scenario.route.points;
  if (!pts[index] || !pts[j]) return fail('movimento fora da lista');
  return ok(
    withScenario(s, (sc) => {
      const a = sc.route.points[index];
      const b = sc.route.points[j];
      if (a && b) {
        sc.route.points[index] = b;
        sc.route.points[j] = a;
      }
    }),
  );
}

export function routeClear(s: ReplicaSession): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  return ok(
    withScenario(s, (sc) => {
      sc.route.points = [];
      sc.files.route = null;
    }),
  );
}

export function routeLoop(s: ReplicaSession, on: boolean): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  return ok(
    withScenario(s, (sc) => {
      sc.route.loop = on ? 'ON' : 'OFF';
    }),
  );
}

export const TWIN_PREFIX = 'twin_';

/** Nome de arquivo criado no equipamento pelo twin: prefixo twin_ obrigatório. */
export function twinFileName(name: string): string {
  const n = name.trim();
  return n.startsWith(TWIN_PREFIX) ? n : `${TWIN_PREFIX}${n}`;
}

/** Grava a rota montada no equipamento (Route, Manage, Save) com o prefixo twin_. */
export function routeSaveAs(s: ReplicaSession, name: string | null): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (name !== null && name.trim() === '') return fail('nome vazio');
  return ok(
    withScenario(s, (sc) => {
      sc.route.saveAs = name === null ? null : twinFileName(name);
    }),
  );
}

// ---------------------------------------------------------------- waypoints

export function waypointUpsert(s: ReplicaSession, w: UserWaypoint, previousCode?: string): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (w.code.trim() === '') return fail('código vazio');
  if (w.code !== previousCode && s.scenario.userWaypoints.some((x) => x.code === w.code))
    return fail(`waypoint ${w.code} já existe`);
  const line = formatCommand('GPS:WAYP:NEW', [
    w.code,
    w.icao,
    w.name,
    w.city,
    w.state,
    w.lat_rad,
    w.lon_rad,
    w.alt_m,
  ]);
  const err = checkCommand(line).diagnostics.find((d) => d.severity === 'error');
  if (err) return fail(err.message);
  return ok(
    withScenario(s, (sc) => {
      const old = previousCode ?? w.code;
      const i = sc.userWaypoints.findIndex((x) => x.code === old);
      if (i >= 0) sc.userWaypoints[i] = w;
      else sc.userWaypoints.push(w);
    }),
  );
}

export function waypointDelete(s: ReplicaSession, code: string): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (!s.scenario.userWaypoints.some((w) => w.code === code)) return fail('waypoint inexistente');
  return ok(
    withScenario(s, (sc) => {
      sc.userWaypoints = sc.userWaypoints.filter((w) => w.code !== code);
    }),
  );
}

/** Use: carrega latitude, longitude e altitude do waypoint na posição estática (OP 3-23). */
export function waypointUse(s: ReplicaSession, code: string): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (s.scenario.setup.simulationType === 'DYNAMIC')
    return fail('Use travado com Simulation = Dynamic (OP 3-23)');
  const w = s.scenario.userWaypoints.find((x) => x.code === code);
  if (!w) return fail('waypoint inexistente');
  return ok(
    withScenario(s, (sc) => {
      sc.position = { lat_rad: w.lat_rad, lon_rad: w.lon_rad, alt_m: w.alt_m };
    }),
  );
}

// ---------------------------------------------------------------- arquivos e padrões

export type FileTarget = 'settings' | 'route' | 'nmea' | 'kml';

export function setFile(s: ReplicaSession, target: FileTarget, name: string | null): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (name !== null && name.trim() === '') return fail('nome vazio');
  return ok(
    withScenario(s, (sc) => {
      sc.files[target] = name === null ? null : name.trim();
      if (target === 'route' && name !== null) sc.route.points = [];
    }),
  );
}

export function setAlmanac(s: ReplicaSession, a: Scenario['files']['almanac']): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  if (a.kind === 'file' && a.name.trim() === '') return fail('nome vazio');
  return ok(
    withScenario(s, (sc) => {
      sc.files.almanac = a.kind === 'file' ? { kind: 'file', name: a.name.trim() } : a;
    }),
  );
}

export function toggleImport(
  s: ReplicaSession,
  kind: Scenario['files']['imports'][number],
): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  return ok(
    withScenario(s, (sc) => {
      sc.files.imports = sc.files.imports.includes(kind)
        ? sc.files.imports.filter((k) => k !== kind)
        : [...sc.files.imports, kind];
    }),
  );
}

/** Setup Motion, Defaults: volta aos limites de fábrica do modelo (MMDE). */
export function motionDefaults(s: ReplicaSession): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  return ok(
    withScenario(s, (sc) => {
      sc.motion.custom = null;
    }),
  );
}

/** Setup Channels, Default: alocação dupla de fábrica (OP 3-13). D09: não emitida. */
export function channelDefaults(s: ReplicaSession, available: 6 | 12 = 12): Result {
  const lock = configOnly(s);
  if (lock) return fail(lock);
  const n = available === 12 ? 6 : 3;
  return ok(
    withScenario(s, (sc) => {
      sc.channels.dualGps = n;
      sc.channels.dualGal = n;
      sc.channels.dualSbas = 0;
    }),
  );
}

export function setNameDescription(s: ReplicaSession, name: string, description: string): Result {
  const n = name.trim();
  if (!/^[a-z0-9_]{1,40}$/.test(n)) return fail('nome: minúsculas, dígitos e _ (até 40)');
  return ok(
    withScenario(s, (sc) => {
      sc.name = n;
      sc.description = description;
    }),
  );
}

// ---------------------------------------------------------------- script

export function sessionScript(s: ReplicaSession): { text: string; diagnostics: Diagnostic[] } {
  const r = emitScenario(s.scenario);
  return { text: r.text, diagnostics: r.diagnostics };
}

export interface LoadedScript {
  session: ReplicaSession;
  diagnostics: Diagnostic[];
  /** Linhas com conteúdo que o cenário não representa (reescrever o script as perde). */
  lostLines: number[];
}

/** Carrega um script na réplica, mantendo a lista de SVs da sessão anterior. */
export function loadScript(prev: ReplicaSession, text: string, name?: string): LoadedScript {
  const doc = parseScript(text);
  const r = scenarioFromScript(doc, name ? { name } : {});
  const lost = new Set<number>();
  for (const d of [...doc.diagnostics, ...r.diagnostics]) {
    if (
      d.line !== undefined &&
      (d.severity === 'error' || ['not-represented', 'multi-run', 'var-runtime'].includes(d.code))
    ) {
      lost.add(d.line);
    }
  }
  if (doc.runs > 1) {
    const second = doc.lines.find(
      (l) => l.type === 'directive' && l.directive?.name === 'run' && l.time.runIndex >= 1,
    );
    for (const l of doc.lines)
      if (second && l.lineNo >= second.lineNo && l.type !== 'blank' && l.type !== 'comment')
        lost.add(l.lineNo);
  }
  return {
    session: { ...newSession(r.scenario), svs: prev.svs },
    diagnostics: [...doc.diagnostics, ...r.diagnostics],
    lostLines: [...lost].sort((a, b) => a - b),
  };
}
