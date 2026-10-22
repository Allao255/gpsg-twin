// Redutor: comando validado + estado anterior -> novo estado do cenário (configuração).
// Ações em execução (SVPR:SAT, RFLV com a simulação rodando) são tratadas em from-script.ts.
import { diag, type Diagnostic } from '../diagnostics';
import type { CommandHeader } from '../model/load';
import type { ParamValue } from '../scpi/params';
import type { CheckedCommand } from '../scpi/validate';
import { MOTION_LIMITS, type MotionLimits } from './motion';
import type { FileKind, Scenario, UserWaypoint } from './types';

export type ApplyOutcome =
  | { kind: 'applied'; state: Scenario; touched: string[]; diagnostics: Diagnostic[] }
  /** Sem efeito no estado do cenário: consultas, backups, exportações, validação. */
  | { kind: 'ignored' }
  /** Altera o equipamento, mas não faz parte do cenário. */
  | { kind: 'unrepresented' }
  /** Comando com erro ou com variável não resolvida: estado inalterado. */
  | { kind: 'invalid' };

type Vals = readonly (ParamValue | undefined)[];
type Handler = (s: Scenario, v: Vals) => string[] | Diagnostic | null;

const num = (v: ParamValue | undefined): number | undefined =>
  v?.kind === 'number' || v?.kind === 'angle' ? v.value : undefined;
const txt = (v: ParamValue | undefined): string | undefined =>
  v?.kind === 'enum' || v?.kind === 'string' ? v.value : undefined;

function need<T>(x: T | undefined): T {
  if (x === undefined) throw new MissingValue();
  return x;
}
class MissingValue extends Error {}

const DAY = 86400;

function dateToDays(s: string): number {
  const [mo, d, y] = s.split('/').map(Number);
  return Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1) / 1000 / DAY;
}

function timeToSeconds(s: string): number {
  const [h, m, sec] = s.split(':').map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (sec ?? 0);
}

const tod = (t: number): number => ((t % DAY) + DAY) % DAY;

function enumSetter(key: keyof Scenario['setup']): Handler {
  return (s, v) => {
    (s.setup as unknown as Record<string, unknown>)[key] = need(txt(v[0]));
    return [`setup.${key}`];
  };
}

function lossSetter(key: keyof Scenario['io']): Handler {
  return (s, v) => {
    s.io[key] = need(num(v[0]));
    return [`io.${key}`];
  };
}

function customSetter(key: keyof MotionLimits): Handler {
  return (s, v) => {
    // Ponto de partida de CUSTOM: limites do modelo Unlimited.
    s.motion.custom ??= { ...MOTION_LIMITS.UNLIMITED };
    s.motion.custom[key] = need(num(v[0]));
    return ['motion.custom'];
  };
}

function channelSetter(key: keyof Scenario['channels']): Handler {
  return (s, v) => {
    s.channels[key] = need(num(v[0]));
    return [`channels.${key}`];
  };
}

function importer(kind: FileKind): Handler {
  return (s) => {
    if (!s.files.imports.includes(kind)) s.files.imports.push(kind);
    return ['files.imports'];
  };
}

function carrier(command: Scenario['setup']['carrier']['command']): Handler {
  return (s, v) => {
    s.setup.carrier = { command, token: need(txt(v[0])) } as Scenario['setup']['carrier'];
    return ['setup.carrier'];
  };
}

function leg(
  v: Vals,
  from: number,
): {
  climbRate_mps: number;
  speed_mps: number;
  accel_mps2: number;
  turnRadius_m: number;
} {
  return {
    climbRate_mps: need(num(v[from])),
    speed_mps: need(num(v[from + 1])),
    accel_mps2: need(num(v[from + 2])),
    turnRadius_m: need(num(v[from + 3])),
  };
}

function waypointFrom(v: Vals): UserWaypoint {
  return {
    code: need(txt(v[0])),
    icao: need(txt(v[1])),
    name: need(txt(v[2])),
    city: need(txt(v[3])),
    state: need(txt(v[4])),
    lat_rad: need(num(v[5])),
    lon_rad: need(num(v[6])),
    alt_m: need(num(v[7])),
  };
}

function routeRow(s: Scenario, row: number): Diagnostic | null {
  if (s.files.route !== null) {
    return diag(
      'route-unknown-row',
      'warning',
      `linha ${row} de rota carregada de arquivo: conteúdo desconhecido`,
    );
  }
  if (row < 1 || row > s.route.points.length) {
    return diag(
      'route-unknown-row',
      'warning',
      `linha ${row} inexistente na rota (${s.route.points.length} pontos)`,
    );
  }
  return null;
}

const HANDLERS: Partial<Record<CommandHeader, Handler>> = {
  'GPS:SET:UNITs': enumSetter('units'),
  'GPS:SET:GNSS': enumSetter('gnss'),
  'GPS:SET:CARRier': carrier('GPS:SET:CARRier'),
  'GPS:SET:CaRrierGPs': carrier('GPS:SET:CaRrierGPs'),
  'GPS:SET:CaRrierGAl': carrier('GPS:SET:CaRrierGAl'),
  'GPS:SET:CaRrierGG': carrier('GPS:SET:CaRrierGG'),
  'GPS:SET:SBAS': enumSetter('sbas'),
  'GPS:SET:SimulationTYPe': enumSetter('simulationType'),
  'GPS:SET:DigitalNOiSe': enumSetter('digitalNoise'),
  'GPS:SET:FADing': enumSetter('fading'),
  'GPS:SET:PRNSignal': enumSetter('prnSignal'),
  'GPS:SET:PositionSouRCe': enumSetter('positionSource'),
  'GPS:SET:CLOCk': enumSetter('clock'),
  'GPS:SET:RFPoRt': enumSetter('rfPort'),
  'GPS:SET:TriggerSouRCe': enumSetter('triggerSource'),
  'GPS:SET:ExtREF': enumSetter('extRef'),
  'GPS:SET:ReferenceSouRCe': (s, v) => {
    const t = need(txt(v[0]));
    s.setup.referenceSource =
      t === 'INT' ? 'INTERNAL' : t === 'EXT' ? 'EXTERNAL' : (t as typeof s.setup.referenceSource);
    return ['setup.referenceSource'];
  },
  'GPS:SET:DATe': (s, v) => {
    s.setup.userTime_s = dateToDays(need(txt(v[0]))) * DAY + tod(s.setup.userTime_s);
    return ['setup.userTime_s'];
  },
  'GPS:SET:TIMe': (s, v) => {
    s.setup.userTime_s =
      s.setup.userTime_s - tod(s.setup.userTime_s) + timeToSeconds(need(txt(v[0])));
    return ['setup.userTime_s'];
  },
  'GPS:SET:RFLeVel': (s, v) => {
    s.setup.rfLevel_dBm = need(num(v[0]));
    return ['setup.rfLevel_dBm'];
  },
  'GPS:SET:CouplerLOSs': lossSetter('coupler_dB'),
  'GPS:SETup:CouplerCABle': lossSetter('couplerCable_dB'),
  'GPS:SET:DirectCABle': lossSetter('directCable_dB'),
  'GPS:SET:SplitterLOSs': lossSetter('splitter_dB'),
  'GPS:SET:CuRrentMotionModel': (s, v) => {
    s.motion.model = need(txt(v[0])) as typeof s.motion.model;
    return ['motion.model'];
  },
  'GPS:SET:MaxLATeralacceleration': customSetter('maxLateral_mps2'),
  'GPS:SET:MaxLONgitudinalacceleration': customSetter('maxLongitudinal_mps2'),
  'GPS:SET:MaxVELocity': customSetter('maxVelocity_mps'),
  'GPS:SET:MotionModelDEfault': (s) => {
    s.motion.custom = null;
    return ['motion.custom'];
  },
  'GPS:SET:CHAN:GNSS': channelSetter('gnss'),
  'GPS:SET:CHAN:SBAS': channelSetter('sbas'),
  'GPS:SET:CHAN:DUAL:GPS': channelSetter('dualGps'),
  'GPS:SET:CHAN:DUAL:GAL': channelSetter('dualGal'),
  'GPS:SET:CHAN:DUAL:SBAS': channelSetter('dualSbas'),
  'GPS:SET:CHAN:DUAL:DEFault': (s) => {
    s.channels.dualGps = null;
    s.channels.dualGal = null;
    s.channels.dualSbas = null;
    return ['channels'];
  },
  'GPS:SET:CHAN:APPLy': () => [],
  'GPS:SIM:LATitude': (s, v) => {
    s.position.lat_rad = need(num(v[0]));
    return ['position.lat_rad'];
  },
  'GPS:SIM:LONGitude': (s, v) => {
    s.position.lon_rad = need(num(v[0]));
    return ['position.lon_rad'];
  },
  'GPS:SIM:ALTitude': (s, v) => {
    s.position.alt_m = need(num(v[0]));
    return ['position.alt_m'];
  },
  'GPS:ROUT:CLeaR': (s) => {
    s.route.points = [];
    s.files.route = null;
    return ['route.points', 'files.route'];
  },
  'GPS:ROUT:ADD:POINt': (s, v) => {
    s.route.points.push({
      kind: 'point',
      name: need(txt(v[0])),
      lat_rad: need(num(v[1])),
      lon_rad: need(num(v[2])),
      alt_m: need(num(v[3])),
      ...leg(v, 4),
    });
    return ['route.points'];
  },
  'GPS:ROUT:ADD:WAYPoint': (s, v) => {
    s.route.points.push({ kind: 'waypoint', code: need(txt(v[0])), ...leg(v, 1) });
    return ['route.points'];
  },
  'GPS:ROUT:EDIT': (s, v) => {
    const row = need(num(v[0]));
    const bad = routeRow(s, row);
    if (bad) return bad;
    s.route.points[row - 1] = {
      kind: 'point',
      name: need(txt(v[1])),
      lat_rad: need(num(v[2])),
      lon_rad: need(num(v[3])),
      alt_m: need(num(v[4])),
      ...leg(v, 5),
    };
    return ['route.points'];
  },
  'GPS:ROUT:DELete': (s, v) => {
    const row = need(num(v[0]));
    const bad = routeRow(s, row);
    if (bad) return bad;
    s.route.points.splice(row - 1, 1);
    return ['route.points'];
  },
  'GPS:ROUT:SAVe': (s, v) => {
    s.route.saveAs = need(txt(v[0]));
    return ['route.saveAs'];
  },
  'GPS:ROUT:LOOP': (s, v) => {
    s.route.loop = need(txt(v[0])) as typeof s.route.loop;
    return ['route.loop'];
  },
  'GPS:ROUT:LOAD': routeLoad,
  'GPS:FILe:ROUT:LOAD': routeLoad,
  'GPS:WAYP:NEW': (s, v) => {
    const w = waypointFrom(v);
    s.userWaypoints = [...s.userWaypoints.filter((x) => x.code !== w.code), w];
    return ['userWaypoints'];
  },
  'GPS:WAYP:EDIT': (s, v) => {
    const w = waypointFrom(v);
    const i = s.userWaypoints.findIndex((x) => x.code === w.code);
    if (i < 0) s.userWaypoints.push(w);
    else s.userWaypoints[i] = w;
    return ['userWaypoints'];
  },
  'GPS:WAYP:DELete': (s, v) => {
    const code = need(txt(v[0]));
    s.userWaypoints = s.userWaypoints.filter((x) => x.code !== code);
    return ['userWaypoints'];
  },
  'GPS:WAYP:CLeaR': (s) => {
    s.userWaypoints = [];
    return ['userWaypoints'];
  },
  'GPS:FILe:SET:IMPort': importer('SET'),
  'GPS:FILe:ROUT:IMPort': importer('ROUT'),
  'GPS:FILe:ALM:IMPort': importer('ALM'),
  'GPS:FILe:NMEA:IMPort': importer('NMEA'),
  'GPS:FILe:WAYP:IMPort': importer('WAYP'),
  'GPS:FILe:SET:LOAD': (s, v) => {
    s.files.settings = need(txt(v[0]));
    return ['files.settings'];
  },
  'GPS:FILe:ALM:LOAD': (s, v) => {
    s.files.almanac = { kind: 'file', name: need(txt(v[0])) };
    return ['files.almanac'];
  },
  'GPS:FILe:ALM:DEFault': (s) => {
    s.files.almanac = { kind: 'default' };
    return ['files.almanac'];
  },
  'GPS:FILe:ALM:RELoad': (s) => {
    s.files.almanac = { kind: 'equipment' };
    return ['files.almanac'];
  },
  'GPS:GPSR:RELoad': (s) => {
    s.files.almanac = { kind: 'equipment' };
    return ['files.almanac'];
  },
  'GPS:FILe:NMEA:LOAD': (s, v) => {
    s.files.nmea = need(txt(v[0]));
    return ['files.nmea'];
  },
  'GPS:FILe:KML:LOAD': (s, v) => {
    s.files.kml = need(txt(v[0]));
    return ['files.kml'];
  },
};

function routeLoad(s: Scenario, v: Vals): string[] {
  s.files.route = need(txt(v[0]));
  s.route.points = [];
  return ['files.route', 'route.points'];
}

/** Comandos sem efeito no estado do cenário (além das consultas). */
const IGNORED = new Set<CommandHeader>([
  '*CLS',
  '*WAI',
  '*OPC',
  'GPS:FILe:SET:SAVe',
  'GPS:FILe:ROUT:SAVe',
  'GPS:ROUT:VALiDate',
  'GPS:FILe:SET:EXPort',
  'GPS:FILe:ROUT:EXPort',
  'GPS:FILe:ALM:EXPort',
  'GPS:FILe:NMEA:EXPort',
  'GPS:FILe:WAYP:EXPort',
  'GPS:SIM:ToggleRUN',
]);

export function applyCommand(state: Scenario, cmd: CheckedCommand): ApplyOutcome {
  const inf = cmd.info;
  if (!inf || cmd.diagnostics.some((d) => d.severity === 'error')) return { kind: 'invalid' };
  if (inf.isQuery || IGNORED.has(inf.header)) return { kind: 'ignored' };
  const h = HANDLERS[inf.header];
  if (!h) return { kind: 'unrepresented' };
  if (cmd.values.some((v) => v?.kind === 'var')) return { kind: 'invalid' };
  const next = structuredClone(state);
  try {
    const r = h(next, cmd.values);
    if (r === null) return { kind: 'invalid' };
    if (!Array.isArray(r)) return { kind: 'applied', state, touched: [], diagnostics: [r] };
    return { kind: 'applied', state: next, touched: r, diagnostics: [] };
  } catch (e) {
    if (e instanceof MissingValue) return { kind: 'invalid' };
    throw e;
  }
}

/** Cabeçalhos com efeito no cenário, para a UI e para testes de cobertura do modelo. */
export function representedHeaders(): CommandHeader[] {
  return Object.keys(HANDLERS) as CommandHeader[];
}
