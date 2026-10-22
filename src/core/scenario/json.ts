// Serialização do cenário em JSON versionado (scenario_version) e leitura com validação estrutural.
// Faixas e consistência são verificadas pelo emissor (emitScenario relê o script gerado).
import { diag, type Diagnostic } from '../diagnostics';
import { enumValues, type CommandHeader } from '../model/load';
import { LATLON_FORMATS, SCENARIO_VERSION, type Scenario } from './types';

const FIRST_KEYS = ['scenario_version', 'name', 'description'];

function ordered(x: unknown, top = false): unknown {
  if (Array.isArray(x)) return x.map((v) => ordered(v));
  if (x === null || typeof x !== 'object') return x;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).sort((a, b) => {
    const ia = top ? FIRST_KEYS.indexOf(a) : -1;
    const ib = top ? FIRST_KEYS.indexOf(b) : -1;
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return Object.fromEntries(keys.map((k) => [k, ordered(o[k])]));
}

/** JSON determinístico: chaves em ordem fixa, 2 espaços, quebra de linha final. */
export function serializeScenario(sc: Scenario): string {
  return JSON.stringify(ordered(sc, true), null, 2) + '\n';
}

class Invalid extends Error {}

type Obj = Record<string, unknown>;

function obj(x: unknown, path: string): Obj {
  if (x === null || typeof x !== 'object' || Array.isArray(x))
    throw new Invalid(`${path}: objeto esperado`);
  return x as Obj;
}
function numberAt(o: Obj, k: string, path: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Invalid(`${path}.${k}: número esperado`);
  return v;
}
function nullableNumber(o: Obj, k: string, path: string): number | null {
  return o[k] === null ? null : numberAt(o, k, path);
}
function stringAt(o: Obj, k: string, path: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Invalid(`${path}.${k}: string esperada`);
  return v;
}
function nullableString(o: Obj, k: string, path: string): string | null {
  return o[k] === null ? null : stringAt(o, k, path);
}
// T é inferido do campo de destino; a validação contra o modelo garante o valor.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function token<T extends string>(
  o: Obj,
  k: string,
  path: string,
  header: CommandHeader,
  param: string,
): T {
  const v = stringAt(o, k, path);
  const allowed = enumValues(header, param);
  if (!allowed.includes(v)) throw new Invalid(`${path}.${k}: "${v}" fora de ${allowed.join(', ')}`);
  return v as T;
}
function oneOf<T extends string>(o: Obj, k: string, path: string, allowed: readonly T[]): T {
  const v = stringAt(o, k, path);
  if (!(allowed as readonly string[]).includes(v))
    throw new Invalid(`${path}.${k}: "${v}" fora de ${allowed.join(', ')}`);
  return v as T;
}
function arrayAt(o: Obj, k: string, path: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Invalid(`${path}.${k}: lista esperada`);
  return v;
}

const CARRIER_HEADERS = [
  'GPS:SET:CARRier',
  'GPS:SET:CaRrierGPs',
  'GPS:SET:CaRrierGAl',
  'GPS:SET:CaRrierGG',
] as const;

/**
 * Migração entre versões, sobre o objeto cru. Cada passo leva da versão n para n + 1.
 * v1 -> v2: `route.saveAs` (null) e `display.latLonFormat` (padrão da tela).
 */
export function migrate(x: unknown): Obj {
  const o = obj(x, '$');
  const version = o.scenario_version;
  if (version === 1) {
    const route = obj(o.route, 'route');
    return {
      ...o,
      scenario_version: 2,
      route: { ...route, saveAs: null },
      display: { latLonFormat: 'DDMMSS.SS' },
    };
  }
  if (version !== SCENARIO_VERSION) {
    throw new Invalid(
      `scenario_version ${String(version)} não suportada (esperado ${SCENARIO_VERSION})`,
    );
  }
  return o;
}

function readScenario(x: unknown): Scenario {
  const o = migrate(x);
  const s = obj(o.setup, 'setup');
  const car = obj(s.carrier, 'setup.carrier');
  const carCmd = oneOf(car, 'command', 'setup.carrier', CARRIER_HEADERS);
  const io = obj(o.io, 'io');
  const motion = obj(o.motion, 'motion');
  const custom = motion.custom === null ? null : obj(motion.custom, 'motion.custom');
  const ch = obj(o.channels, 'channels');
  const pos = obj(o.position, 'position');
  const route = obj(o.route, 'route');
  const files = obj(o.files, 'files');
  const alm = obj(files.almanac, 'files.almanac');
  const almKind = oneOf(alm, 'kind', 'files.almanac', ['file', 'default', 'equipment'] as const);
  const run = obj(o.run, 'run');

  const legOf = (p: Obj, path: string) => ({
    climbRate_mps: numberAt(p, 'climbRate_mps', path),
    speed_mps: numberAt(p, 'speed_mps', path),
    accel_mps2: numberAt(p, 'accel_mps2', path),
    turnRadius_m: numberAt(p, 'turnRadius_m', path),
  });

  return {
    scenario_version: SCENARIO_VERSION,
    name: stringAt(o, 'name', '$'),
    description: stringAt(o, 'description', '$'),
    setup: {
      units: token(s, 'units', 'setup', 'GPS:SET:UNITs', 'units'),
      gnss: token(s, 'gnss', 'setup', 'GPS:SET:GNSS', 'gnss'),
      carrier: {
        command: carCmd,
        token: token(car, 'token', 'setup.carrier', carCmd, 'carrier'),
      } as Scenario['setup']['carrier'],
      sbas: token(s, 'sbas', 'setup', 'GPS:SET:SBAS', 'status'),
      simulationType: token(s, 'simulationType', 'setup', 'GPS:SET:SimulationTYPe', 'type'),
      digitalNoise: token(s, 'digitalNoise', 'setup', 'GPS:SET:DigitalNOiSe', 'state'),
      fading: token(s, 'fading', 'setup', 'GPS:SET:FADing', 'fading'),
      prnSignal: token(s, 'prnSignal', 'setup', 'GPS:SET:PRNSignal', 'prn_signal'),
      positionSource: token(s, 'positionSource', 'setup', 'GPS:SET:PositionSouRCe', 'source'),
      clock: token(s, 'clock', 'setup', 'GPS:SET:CLOCk', 'clock'),
      userTime_s: numberAt(s, 'userTime_s', 'setup'),
      rfPort: token(s, 'rfPort', 'setup', 'GPS:SET:RFPoRt', 'port'),
      rfLevel_dBm: numberAt(s, 'rfLevel_dBm', 'setup'),
      triggerSource: token(s, 'triggerSource', 'setup', 'GPS:SET:TriggerSouRCe', 'source'),
      extRef: token(s, 'extRef', 'setup', 'GPS:SET:ExtREF', 'state'),
      referenceSource: token(s, 'referenceSource', 'setup', 'GPS:SET:ReferenceSouRCe', 'reference'),
    },
    io: {
      coupler_dB: numberAt(io, 'coupler_dB', 'io'),
      couplerCable_dB: numberAt(io, 'couplerCable_dB', 'io'),
      directCable_dB: numberAt(io, 'directCable_dB', 'io'),
      splitter_dB: numberAt(io, 'splitter_dB', 'io'),
    },
    motion: {
      model: token(motion, 'model', 'motion', 'GPS:SET:CuRrentMotionModel', 'model'),
      custom: custom && {
        maxLateral_mps2: numberAt(custom, 'maxLateral_mps2', 'motion.custom'),
        maxLongitudinal_mps2: numberAt(custom, 'maxLongitudinal_mps2', 'motion.custom'),
        maxVelocity_mps: numberAt(custom, 'maxVelocity_mps', 'motion.custom'),
      },
    },
    channels: {
      gnss: nullableNumber(ch, 'gnss', 'channels'),
      sbas: nullableNumber(ch, 'sbas', 'channels'),
      dualGps: nullableNumber(ch, 'dualGps', 'channels'),
      dualGal: nullableNumber(ch, 'dualGal', 'channels'),
      dualSbas: nullableNumber(ch, 'dualSbas', 'channels'),
    },
    position: {
      lat_rad: numberAt(pos, 'lat_rad', 'position'),
      lon_rad: numberAt(pos, 'lon_rad', 'position'),
      alt_m: numberAt(pos, 'alt_m', 'position'),
    },
    route: {
      loop: token(route, 'loop', 'route', 'GPS:ROUT:LOOP', 'loop'),
      saveAs: nullableString(route, 'saveAs', 'route'),
      points: arrayAt(route, 'points', 'route').map((x, i) => {
        const path = `route.points[${i}]`;
        const p = obj(x, path);
        const kind = oneOf(p, 'kind', path, ['point', 'waypoint'] as const);
        if (kind === 'waypoint')
          return { kind, code: stringAt(p, 'code', path), ...legOf(p, path) };
        return {
          kind,
          name: stringAt(p, 'name', path),
          lat_rad: numberAt(p, 'lat_rad', path),
          lon_rad: numberAt(p, 'lon_rad', path),
          alt_m: numberAt(p, 'alt_m', path),
          ...legOf(p, path),
        };
      }),
    },
    userWaypoints: arrayAt(o, 'userWaypoints', '$').map((x, i) => {
      const path = `userWaypoints[${i}]`;
      const w = obj(x, path);
      return {
        code: stringAt(w, 'code', path),
        icao: stringAt(w, 'icao', path),
        name: stringAt(w, 'name', path),
        city: stringAt(w, 'city', path),
        state: stringAt(w, 'state', path),
        lat_rad: numberAt(w, 'lat_rad', path),
        lon_rad: numberAt(w, 'lon_rad', path),
        alt_m: numberAt(w, 'alt_m', path),
      };
    }),
    files: {
      imports: arrayAt(files, 'imports', 'files').map((x, i) =>
        oneOf({ v: x }, 'v', `files.imports[${i}]`, [
          'SET',
          'ROUT',
          'ALM',
          'NMEA',
          'WAYP',
        ] as const),
      ),
      settings: nullableString(files, 'settings', 'files'),
      almanac:
        almKind === 'file'
          ? { kind: almKind, name: stringAt(alm, 'name', 'files.almanac') }
          : { kind: almKind },
      route: nullableString(files, 'route', 'files'),
      nmea: nullableString(files, 'nmea', 'files'),
      kml: nullableString(files, 'kml', 'files'),
    },
    run: { stopAt_s: nullableNumber(run, 'stopAt_s', 'run') },
    display: {
      latLonFormat: oneOf(obj(o.display, 'display'), 'latLonFormat', 'display', LATLON_FORMATS),
    },
    actions: arrayAt(o, 'actions', '$').map((x, i) => {
      const path = `actions[${i}]`;
      const a = obj(x, path);
      const type = oneOf(a, 'type', path, ['sv', 'rfLevel'] as const);
      const t_s = numberAt(a, 't_s', path);
      if (type === 'rfLevel') return { t_s, type, level_dBm: numberAt(a, 'level_dBm', path) };
      return {
        t_s,
        type,
        constellation: oneOf(a, 'constellation', path, ['GPS', 'GAL'] as const),
        sv: numberAt(a, 'sv', path),
        select: token(a, 'select', path, 'GPS:SVPR:GAL:SATellite', 'select'),
        health: token(a, 'health', path, 'GPS:SVPR:GAL:SATellite', 'health'),
        doppler_Hz: numberAt(a, 'doppler_Hz', path),
        incoherence_mps: numberAt(a, 'incoherence_mps', path),
        ampOffset_dB: numberAt(a, 'ampOffset_dB', path),
        stepError_m: numberAt(a, 'stepError_m', path),
        duration_s: numberAt(a, 'duration_s', path),
      };
    }),
  };
}

export function parseScenarioJson(text: string): {
  scenario: Scenario | null;
  diagnostics: Diagnostic[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      scenario: null,
      diagnostics: [diag('scenario-invalid', 'error', `JSON inválido: ${(e as Error).message}`)],
    };
  }
  try {
    return { scenario: readScenario(raw), diagnostics: [] };
  } catch (e) {
    if (e instanceof Invalid) {
      return { scenario: null, diagnostics: [diag('scenario-invalid', 'error', e.message)] };
    }
    throw e;
  }
}
