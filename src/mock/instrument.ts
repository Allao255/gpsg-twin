// Instrumento simulado: máquina de estados do GPSG-1000 vista pela interface remota.
// Usa o core para resolver e validar comandos e o redutor do cenário para o estado. Não simula
// sinal nem geometria: respostas de consulta refletem o estado configurado.
//
// Códigos de erro: códigos SCPI padrão (IEEE 488.2). O manual não traz a tabela do equipamento
// (D16); quando a sessão 1 registrar os códigos reais, ajustar ERRORS.
import type { Diagnostic } from '../core/diagnostics';
import { radToDeg } from '../core/geo';
import {
  getIndex,
  info,
  type CommandHeader,
  type CommandInfo,
  type Param,
} from '../core/model/load';
import { applyCommand } from '../core/scenario/apply';
import { defaultScenario } from '../core/scenario/defaults';
import { motionLimits } from '../core/scenario/motion';
import type { RoutePoint, Scenario } from '../core/scenario/types';
import { formatNumberInMode } from '../core/scpi/format';
import { quoteString } from '../core/scpi/lexer';
import type { ParamValue } from '../core/scpi/params';
import { checkCommand, type CheckedCommand } from '../core/scpi/validate';
import { canonicalCommand } from '../core/script/format';
import { findUnit, formatNumber } from '../core/units';

export const ERRORS = {
  command: [-100, 'Command error'],
  dataType: [-104, 'Data type error'],
  paramNotAllowed: [-108, 'Parameter not allowed'],
  missingParam: [-109, 'Missing parameter'],
  undefinedHeader: [-113, 'Undefined header'],
  invalidSuffix: [-131, 'Invalid suffix'],
  invalidString: [-151, 'Invalid string data'],
  settingsConflict: [-221, 'Settings conflict'],
  outOfRange: [-222, 'Data out of range'],
  tooMuchData: [-223, 'Too much data'],
  illegalValue: [-224, 'Illegal parameter value'],
  fileNotFound: [-256, 'File name not found'],
  queueOverflow: [-350, 'Queue overflow'],
} as const satisfies Record<string, readonly [number, string]>;

type ErrorKey = keyof typeof ERRORS;

const QUEUE_MAX = 10;

/** Diagnóstico do core -> erro SCPI. Diagnósticos de política do twin não geram erro no mock. */
const ERROR_BY_DIAG: Partial<Record<Diagnostic['code'], ErrorKey>> = {
  chained: 'command',
  'unterminated-string': 'invalidString',
  'mixed-quotes': 'invalidString',
  'text-after-string': 'invalidString',
  'empty-param': 'missingParam',
  'unknown-header': 'undefinedHeader',
  'known-misspelling': 'undefinedHeader',
  'no-query-form': 'undefinedHeader',
  'no-set-form': 'undefinedHeader',
  type: 'dataType',
  format: 'illegalValue',
  range: 'outOfRange',
  enum: 'illegalValue',
  maxlen: 'tooMuchData',
  'unit-suffix-not-allowed': 'invalidSuffix',
  'unit-unknown': 'invalidSuffix',
  'locked-while-running': 'settingsConflict',
  'route-unknown-row': 'outOfRange',
};

function errorFor(d: Diagnostic): ErrorKey | null {
  if (d.severity !== 'error' && d.code !== 'route-unknown-row') return null;
  if (d.code === 'arity')
    return d.message.startsWith('faltam') ? 'missingParam' : 'paramNotAllowed';
  return ERROR_BY_DIAG[d.code] ?? null;
}

type FileKind = 'SET' | 'ROUT' | 'ALM' | 'NMEA' | 'KML';

export const DEFAULT_ALMANAC = 'default.alm';

interface SvState {
  select: string;
  health: string;
  doppler: number;
  corr: number;
  amp: number;
  step: number;
  duration: number;
}

export interface InstrumentOptions {
  /** Relógio em ms (injetável nos testes). */
  now?: () => number;
  /** PRNs simulados enquanto a simulação roda (sem geometria). */
  prns?: { GPS: readonly number[]; GAL: readonly number[] };
  /** Canais instalados (6 ou 12). */
  channels?: 6 | 12;
  idn?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number): string => String(n).padStart(2, '0');

function hms(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`;
}

/** Estado ao ligar: padrão do twin com unidades SI (a sessão remota começa em SI, RP 1-10; D04). */
export function powerUpState(): Scenario {
  const s = defaultScenario();
  s.setup.units = 'SI';
  return s;
}

export class Instrument {
  state: Scenario = powerUpState();
  running = false;
  errors: string[] = [];
  status = 'Ready';
  readonly files: Record<FileKind, Map<string, unknown>> = {
    SET: new Map(),
    ROUT: new Map(),
    ALM: new Map([[DEFAULT_ALMANAC, null]]),
    NMEA: new Map(),
    KML: new Map(),
  };
  readonly loaded: Record<FileKind, string> = {
    SET: '',
    ROUT: '',
    ALM: DEFAULT_ALMANAC,
    NMEA: '',
    KML: '',
  };
  readonly sv: { GPS: Map<number, SvState>; GAL: Map<number, SvState> } = {
    GPS: new Map(),
    GAL: new Map(),
  };
  /** Valores de comandos sem representação no cenário (DIAG, KML, GPSR, CAL, registradores). */
  readonly misc = new Map<string, string>();
  recording = false;
  private runStartMs: number | null = null;
  private elapsedMs = 0;
  private readonly now: () => number;
  private readonly prns: { GPS: readonly number[]; GAL: readonly number[] };
  private readonly channels: 6 | 12;
  private readonly idn: string;

  constructor(opts: InstrumentOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.prns = opts.prns ?? { GPS: [1, 5, 9, 13, 17, 22], GAL: [2, 7, 11, 19] };
    this.channels = opts.channels ?? 12;
    this.idn = opts.idn ?? 'gpsg-twin,GPSG-1000 mock,0000000000,0.1.0,0';
  }

  /** Processa uma linha recebida. Retorna a resposta (consultas) ou null. */
  handle(line: string): string | null {
    const text = line.trim();
    if (text === '') return null;
    const c = checkCommand(text, {
      running: this.running,
      units: this.state.setup.units,
      port: this.state.setup.rfPort,
      losses: this.state.io,
    });
    for (const d of c.diagnostics) {
      const e = errorFor(d);
      if (e) {
        this.pushError(e, d.message);
        return null;
      }
    }
    const inf = c.info;
    if (!inf) return null;
    if (!inf.isQuery) return this.command(inf, c);
    // Consulta que gerou erro não tem resposta (o runner registra WARN por falta de resposta).
    const r = this.query(inf, c);
    return r === '' ? null : r;
  }

  pushError(key: ErrorKey, detail = ''): void {
    const [code, text] = ERRORS[key];
    const msg = detail ? `${text}; ${detail.replace(/"/g, "'")}` : text;
    if (this.errors.length >= QUEUE_MAX) {
      const [oc, ot] = ERRORS.queueOverflow;
      this.errors[QUEUE_MAX - 1] = `${oc},"${ot}"`;
      return;
    }
    this.errors.push(`${code},"${msg}"`);
  }

  elapsedSeconds(): number {
    const ms =
      this.runStartMs === null ? this.elapsedMs : this.elapsedMs + this.now() - this.runStartMs;
    return ms / 1000;
  }

  // ---------------------------------------------------------------- comandos

  private command(inf: CommandInfo, c: CheckedCommand): null {
    const h = inf.header;
    const special = COMMANDS[h];
    if (special) {
      special(this, c);
      return null;
    }
    if (h === 'GPS:SVPR:GPS:SATellite' || h === 'GPS:SVPR:GAL:SATellite') {
      this.setSv(h === 'GPS:SVPR:GPS:SATellite' ? 'GPS' : 'GAL', c.values);
      return null;
    }
    const r = applyCommand(this.state, c);
    if (r.kind === 'applied') {
      const bad = r.diagnostics[0];
      if (bad) {
        this.pushError('outOfRange', bad.message);
        return null;
      }
      this.state = r.state;
    } else if (r.kind === 'unrepresented' || r.kind === 'ignored') {
      const canon = canonicalCommand(c);
      const args = canon?.includes(' ') ? canon.slice(canon.indexOf(' ') + 1) : '';
      this.misc.set(h, args);
    }
    return null;
  }

  private setSv(cons: 'GPS' | 'GAL', v: readonly (ParamValue | undefined)[]): void {
    const n = (i: number): number => {
      const x = v[i];
      return x?.kind === 'number' ? x.value : 0;
    };
    const t = (i: number): string => {
      const x = v[i];
      return x?.kind === 'enum' ? x.value : '';
    };
    const dur = v[7];
    this.sv[cons].set(n(0), {
      select: t(1),
      health: t(2),
      doppler: n(3),
      corr: n(4),
      amp: n(5),
      step: n(6),
      duration: dur?.kind === 'number' ? dur.value : 3600,
    });
  }

  toggleRun(): void {
    if (this.running) {
      this.elapsedMs += this.now() - (this.runStartMs ?? this.now());
      this.runStartMs = null;
      this.running = false;
      this.status = 'Simulation stopped';
    } else {
      this.elapsedMs = 0;
      this.runStartMs = this.now();
      this.running = true;
      this.status = 'Simulation running';
    }
  }

  // ---------------------------------------------------------------- consultas

  private query(inf: CommandInfo, c: CheckedCommand): string | null {
    const special = QUERIES[inf.header];
    if (special) return special(this, c);
    const setter = getIndex().byHeader.get(inf.header.slice(0, -1));
    const getter = STATE_GETTERS[inf.header];
    if (getter) return reply(inf, getter(this, c));
    if (setter) {
      const stored = this.misc.get(setter.header);
      const def = setter.params[0]?.default;
      return reply(inf, unquote(stored ?? (def === undefined ? '0' : String(def))));
    }
    return reply(inf, '0');
  }

  /** Valor numérico SI de um parâmetro, no modo de unidades corrente ou na unidade pedida. */
  numberOut(p: Param, si: number, c?: CheckedCommand): string {
    const u = c?.values[0];
    if (u?.kind === 'unit') {
      const def = findUnit(u.value);
      if (def) return formatNumber(si / def.factor, 4);
    }
    return formatNumberInMode(p, si, this.state.setup.units);
  }

  svRow(cons: 'GPS' | 'GAL', sv: number): string {
    const s = this.sv[cons].get(sv) ?? {
      select: 'ON',
      health: cons === 'GPS' ? 'GOOD' : 'CONNECTED',
      doppler: 0,
      corr: 0,
      amp: 0,
      step: 0,
      duration: 3600,
    };
    const simulated = this.running && this.prns[cons].includes(sv) && s.select === 'ON';
    const el = 15 + ((sv * 37) % 70);
    const az = (sv * 53) % 360;
    const health = s.health.charAt(0) + s.health.slice(1).toLowerCase();
    // D03: ordem provável SV, El, Az, RFLevel, AmpOffset, Doppler, Corr, Step, Duration, Health, Select, Simd.
    return [
      sv,
      `${el}.0000`,
      `${az}.0000`,
      formatNumber(this.state.setup.rfLevel_dBm + s.amp, 1),
      formatNumber(s.amp, 1),
      formatNumber(s.doppler, 0),
      formatNumber(s.corr, 3),
      formatNumber(s.step, 3),
      s.duration,
      health,
      s.select,
      simulated ? 'ON' : 'OFF',
    ].join(',');
  }

  simulatedPrns(cons: 'GPS' | 'GAL'): readonly number[] {
    const g = this.state.setup.gnss;
    const active = cons === 'GPS' ? g !== 'GALILEO' : g !== 'GPS';
    return this.running && active ? this.prns[cons] : [];
  }

  routeRow(i: number, p: RoutePoint): string {
    const pAlt = info('GPS:ROUT:ADD:POINt').params;
    const out = (k: number, si: number): string =>
      pAlt[k] ? formatNumberInMode(pAlt[k], si, this.state.setup.units) : '0';
    const wp =
      p.kind === 'waypoint' ? this.state.userWaypoints.find((w) => w.code === p.code) : undefined;
    const name = p.kind === 'point' ? p.name : p.code;
    const lat = p.kind === 'point' ? p.lat_rad : (wp?.lat_rad ?? 0);
    const lon = p.kind === 'point' ? p.lon_rad : (wp?.lon_rad ?? 0);
    const alt = p.kind === 'point' ? p.alt_m : (wp?.alt_m ?? 0);
    return [
      i + 1,
      name,
      formatNumber(radToDeg(lat), 9),
      formatNumber(radToDeg(lon), 9),
      out(3, alt),
      out(4, p.climbRate_mps),
      out(5, p.speed_mps),
      out(6, p.accel_mps2),
      out(7, p.turnRadius_m),
    ].join(',');
  }

  motionLimits(): readonly [number, number, number] {
    const l = motionLimits(this.state.motion);
    return [l.maxLateral_mps2, l.maxLongitudinal_mps2, l.maxVelocity_mps];
  }

  userDate(): Date {
    return new Date(
      (this.state.setup.userTime_s + (this.running ? this.elapsedSeconds() : 0)) * 1000,
    );
  }

  // ---------------------------------------------------------------- arquivos

  fileName(c: CheckedCommand): string {
    const v = c.values[0];
    return v?.kind === 'string' ? v.value : '';
  }

  saveFile(kind: FileKind, name: string): void {
    this.files[kind].set(
      name,
      kind === 'SET' ? structuredClone(this.state) : structuredClone(this.state.route.points),
    );
    this.status = `File saved: ${name}`;
  }

  loadFile(kind: FileKind, name: string): boolean {
    const store = this.files[kind];
    if (!store.has(name)) {
      this.pushError('fileNotFound', name);
      return false;
    }
    const data = store.get(name);
    if (kind === 'SET') {
      this.state = {
        ...structuredClone(data as Scenario),
        files: { ...this.state.files, settings: name },
      };
    } else if (kind === 'ROUT') {
      this.state.route.points = structuredClone(data as RoutePoint[]);
      this.state.files.route = null;
    } else if (kind === 'ALM') {
      this.state.files.almanac =
        name === DEFAULT_ALMANAC ? { kind: 'default' } : { kind: 'file', name };
    } else if (kind === 'NMEA') {
      this.state.files.nmea = name;
    } else {
      this.state.files.kml = name;
    }
    this.loaded[kind] = name;
    this.status = `File loaded: ${name}`;
    return true;
  }

  removeFile(kind: FileKind, name: string): void {
    if (!this.files[kind].delete(name)) this.pushError('fileNotFound', name);
    else this.status = `File removed: ${name}`;
  }

  clearFiles(kind: FileKind): void {
    this.files[kind].clear();
    if (kind === 'ALM') this.files.ALM.set(DEFAULT_ALMANAC, null);
    this.status = `Files cleared: ${kind}`;
  }

  fileList(kind: FileKind): string {
    return [...this.files[kind].keys()].sort().join('\n');
  }

  reset(): void {
    this.state = powerUpState();
    this.running = false;
    this.runStartMs = null;
    this.elapsedMs = 0;
    this.sv.GPS.clear();
    this.sv.GAL.clear();
    this.misc.clear();
    this.status = 'Ready';
  }

  get channelCount(): 6 | 12 {
    return this.channels;
  }

  get identity(): string {
    return this.idn;
  }

  get prnTable(): { GPS: readonly number[]; GAL: readonly number[] } {
    return this.prns;
  }
}

// ---------------------------------------------------------------- formatação de resposta

function unquote(s: string): string {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"')
    ? t.slice(1, -1).replace(/""/g, '"')
    : t;
}

/** Aplica a convenção de resposta pelo tipo de retorno do modelo: string e csv entre aspas. */
export function reply(inf: CommandInfo, value: string): string {
  const t = inf.cmd.returns?.type;
  return t === 'string' || t === 'csv' || t === 'csv_multiline' ? quoteString(value) : value;
}

/** Token de enum do ajuste convertido para o token da consulta, quando o modelo lista ambos. */
function queryToken(
  query: CommandHeader,
  setter: CommandHeader,
  param: string,
  token: string,
): string {
  const qv = info(query).cmd.returns?.values;
  const sv = info(setter).params.find((p) => p.name === param)?.values;
  if (!qv || !sv || qv.length !== sv.length) return token;
  const i = sv.indexOf(token);
  return i < 0 ? token : String(qv[i]);
}

type Getter = (m: Instrument, c: CheckedCommand) => string;

type Setup = Scenario['setup'];
type TokenKey = { [K in keyof Setup]: Setup[K] extends string ? K : never }[keyof Setup];

function setupEnum(
  query: CommandHeader,
  setter: CommandHeader,
  param: string,
  key: TokenKey,
): Getter {
  return (m) => queryToken(query, setter, param, m.state.setup[key]);
}

function paramOf(h: CommandHeader, i = 0): Param {
  const p = info(h).params[i];
  if (!p) throw new Error(`${h}: parâmetro ${i}`);
  return p;
}

function modeNumber(setter: CommandHeader, get: (m: Instrument) => number): Getter {
  return (m, c) => m.numberOut(paramOf(setter), get(m), c);
}

const STATE_GETTERS: Partial<Record<CommandHeader, Getter>> = {
  'GPS:SET:UNITs?': (m) => m.state.setup.units,
  'GPS:SET:GNSS?': setupEnum('GPS:SET:GNSS?', 'GPS:SET:GNSS', 'gnss', 'gnss'),
  'GPS:SET:CARRier?': (m) => m.state.setup.carrier.token,
  'GPS:SET:SBAS?': setupEnum('GPS:SET:SBAS?', 'GPS:SET:SBAS', 'status', 'sbas'),
  'GPS:SET:SimulationTYPe?': setupEnum(
    'GPS:SET:SimulationTYPe?',
    'GPS:SET:SimulationTYPe',
    'type',
    'simulationType',
  ),
  'GPS:SET:DigitalNOiSe?': setupEnum(
    'GPS:SET:DigitalNOiSe?',
    'GPS:SET:DigitalNOiSe',
    'state',
    'digitalNoise',
  ),
  'GPS:SET:FADing?': (m) => m.state.setup.fading,
  'GPS:SET:PRNSignal?': setupEnum(
    'GPS:SET:PRNSignal?',
    'GPS:SET:PRNSignal',
    'prn_signal',
    'prnSignal',
  ),
  'GPS:SET:PositionSouRCe?': setupEnum(
    'GPS:SET:PositionSouRCe?',
    'GPS:SET:PositionSouRCe',
    'source',
    'positionSource',
  ),
  'GPS:SET:CLOCk?': setupEnum('GPS:SET:CLOCk?', 'GPS:SET:CLOCk', 'clock', 'clock'),
  'GPS:SET:RFPoRt?': setupEnum('GPS:SET:RFPoRt?', 'GPS:SET:RFPoRt', 'port', 'rfPort'),
  'GPS:SET:TriggerSouRCe?': setupEnum(
    'GPS:SET:TriggerSouRCe?',
    'GPS:SET:TriggerSouRCe',
    'source',
    'triggerSource',
  ),
  'GPS:SET:ExtREF?': (m) => m.state.setup.extRef,
  'GPS:SET:ReferenceSouRCe?': (m) => m.state.setup.referenceSource,
  'GPS:SET:CuRrentMotionModel?': (m) => m.state.motion.model,
  'GPS:SET:DATe?': (m) => {
    const d = new Date(m.state.setup.userTime_s * 1000);
    return `${MONTHS[d.getUTCMonth()] ?? ''} ${p2(d.getUTCDate())} ${d.getUTCFullYear()}`;
  },
  'GPS:SET:TIMe?': (m) => hms(((m.state.setup.userTime_s % 86400) + 86400) % 86400),
  'GPS:SET:RFLeVel?': (m) => formatNumber(m.state.setup.rfLevel_dBm, 1),
  'GPS:SET:CouplerLOSs?': (m) => formatNumber(m.state.io.coupler_dB, 1),
  'GPS:SETup:CouplerCABle?': (m) => formatNumber(m.state.io.couplerCable_dB, 1),
  'GPS:SET:DirectCABle?': (m) => formatNumber(m.state.io.directCable_dB, 1),
  'GPS:SET:SplitterLOSs?': (m) => formatNumber(m.state.io.splitter_dB, 1),
  'GPS:SET:MaxLATeralacceleration?': modeNumber(
    'GPS:SET:MaxLATeralacceleration',
    (m) => m.motionLimits()[0],
  ),
  'GPS:SET:MaxLONgitudinalacceleration?': modeNumber(
    'GPS:SET:MaxLONgitudinalacceleration',
    (m) => m.motionLimits()[1],
  ),
  'GPS:SET:MaxVELocity?': modeNumber('GPS:SET:MaxVELocity', (m) => m.motionLimits()[2]),
  // D09: padrão do RP para canais duplos (3/3/0).
  'GPS:SET:CHAN:GNSS?': (m) => String(m.state.channels.gnss ?? m.channelCount - 1),
  'GPS:SET:CHAN:SBAS?': (m) => String(m.state.channels.sbas ?? 1),
  'GPS:SET:CHAN:DUAL:GPS?': (m) => String(m.state.channels.dualGps ?? 3),
  'GPS:SET:CHAN:DUAL:GAL?': (m) => String(m.state.channels.dualGal ?? 3),
  'GPS:SET:CHAN:DUAL:SBAS?': (m) => String(m.state.channels.dualSbas ?? 0),
  'GPS:SIM:LATitude?': (m) => formatNumber(radToDeg(m.state.position.lat_rad), 9),
  'GPS:SIM:LONGitude?': (m) => formatNumber(radToDeg(m.state.position.lon_rad), 9),
  'GPS:SIM:ALTitude?': modeNumber('GPS:SIM:ALTitude', (m) => m.state.position.alt_m),
};

const QUERIES: Partial<Record<CommandHeader, (m: Instrument, c: CheckedCommand) => string>> = {
  ':SYSTem:ERRor?': (m) => m.errors.shift() ?? '0,"No error"',
  '*IDN?': (m) => m.identity,
  '*OPC?': () => '1',
  '*ESR?': () => '0',
  '*STB?': (m) => (m.errors.length > 0 ? '4' : '0'),
  '*ESE?': (m) => m.misc.get('*ESE') ?? '0',
  '*SRE?': (m) => m.misc.get('*SRE') ?? '0',
  'GPS:?': (_m, c) => {
    const v = c.values[0];
    const section = v?.kind === 'enum' ? v.value : 'ALL';
    return quoteString(helpList(section).join('\n'));
  },
  'GPS:STAT?': (m) => quoteString(m.status),
  'GPS:SIM:ToggleRUN?': (m) => quoteString(m.running ? 'Running' : 'Stopped'),
  'GPS:SIM:TIMe?': (m) => quoteString(hms((m.userDate().getTime() / 1000) % 86400)),
  'GPS:SIM:DATe?': (m) => {
    const d = m.userDate();
    return quoteString(`${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${d.getUTCFullYear()}`);
  },
  'GPS:SIM:ElapsedTIMe?': (m) => quoteString(hms(m.elapsedSeconds())),
  'GPS:SIM:ExtREF?': (m) => m.state.setup.extRef,
  'GPS:SIMU:SPeeD?': () => '0',
  'GPS:SIM:AltitudeRATe?': () => '0',
  'GPS:SIM:DistanceToGo?': () => '0',
  'GPS:SIM:HEADing?': () => quoteString('0°'),
  'GPS:SIM:FROM?': (m) => quoteString(routeName(m, 0)),
  'GPS:SIM:TO?': (m) => quoteString(routeName(m, 1)),
  'GPS:SIM:GPS:PRN?': (m) => quoteString(m.simulatedPrns('GPS').join(', ')),
  'GPS:SIM:GAL:PRN?': (m) => quoteString(m.simulatedPrns('GAL').join(', ')),
  'GPS:SIM:GPS:VisibleSVS?': (m) => String(m.simulatedPrns('GPS').length),
  'GPS:SIM:GAL:VisibleSVS?': (m) => String(m.simulatedPrns('GAL').length),
  'GPS:SIM:GPS:CARRier?': (m) => quoteString(m.state.setup.carrier.token),
  'GPS:SIM:GAL:CARRier?': (m) => quoteString(m.state.setup.carrier.token),
  'GPS:SIM:GPS:ADVisory?': () => quoteString(''),
  'GPS:SIM:GAL:ADVisory?': () => quoteString(''),
  'GPS:SIM:SBAS:SBAS?': (m) => m.state.setup.sbas,
  'GPS:SIM:SBAS:VisibleSVS?': () => '0',
  'GPS:SIM:SBAS:PRN?': () => quoteString(''),
  'GPS:SVPR:GPS:LIST?': (m) =>
    quoteString(
      m
        .simulatedPrns('GPS')
        .map((sv) => m.svRow('GPS', sv))
        .join('\n'),
    ),
  'GPS:SVPR:GAL:LIST?': (m) =>
    quoteString(
      m
        .simulatedPrns('GAL')
        .map((sv) => m.svRow('GAL', sv))
        .join('\n'),
    ),
  'GPS:SVPR:GPS:SATellite?': (m, c) => quoteString(m.svRow('GPS', numberArg(c))),
  'GPS:SVPR:GAL:SATellite?': (m, c) => quoteString(m.svRow('GAL', numberArg(c))),
  'GPS:ROUT:LIST?': (m) =>
    quoteString(m.state.route.points.map((p, i) => m.routeRow(i, p)).join('\n')),
  'GPS:ROUT:DISPlay?': (m, c) => {
    const row = numberArg(c);
    const p = m.state.route.points[row - 1];
    if (!p) {
      m.pushError('outOfRange', `linha ${row}`);
      return '';
    }
    return quoteString(m.routeRow(row - 1, p));
  },
  'GPS:ROUT:FILe?': (m) => quoteString(m.loaded.ROUT),
  'GPS:WAYP:LIST?': (m) => quoteString(m.state.userWaypoints.map(waypointRow).join('\n')),
  'GPS:WAYP:DISPlay?': (m, c) => {
    const v = c.values[0];
    const code = v?.kind === 'string' ? v.value : '';
    const w = m.state.userWaypoints.find((x) => x.code === code);
    if (!w) {
      m.pushError('illegalValue', code);
      return '';
    }
    return quoteString(waypointRow(w));
  },
  'GPS:FILe:ALM:FileLiST?': (m) => quoteString(m.fileList('ALM')),
  'GPS:FILe:ROUT:FileLiST?': (m) => quoteString(m.fileList('ROUT')),
  'GPS:FILe:SET:FileLiST?': (m) => quoteString(m.fileList('SET')),
  'GPS:FILe:NMEA:FileLiST?': (m) => quoteString(m.fileList('NMEA')),
  'GPS:FILe:KML:FileLiST?': (m) => quoteString(m.fileList('KML')),
  'GPS:FILe:ALM:FileNAMe?': (m) => quoteString(m.loaded.ALM),
  'GPS:FILe:ROUT:FileNAMe?': (m) => quoteString(m.loaded.ROUT),
  'GPS:FILe:SET:FileNAMe?': (m) => quoteString(m.loaded.SET),
  'GPS:FILe:NMEA:FileNAMe?': (m) => quoteString(m.loaded.NMEA),
  'GPS:FILe:KML:FileNAMe?': (m) => quoteString(m.loaded.KML),
  'GPS:SET:CHAN:AVAILable?': (m) => String(m.channelCount),
  'GPS:GPSR:FIX?': () => quoteString('No position fix'),
  'GPS:GPSR:AlmanacSTatus?': () => quoteString('Not loaded'),
  'GPS:GPSR:CurrentTIMe?': () => quoteString(''),
  'GPS:GPSR:ActiveSATellite?': () => quoteString('0'),
  'GPS:GPSR:LATitude?': () => '0',
  'GPS:GPSR:LONGitude?': () => '0',
  'GPS:GPSR:ALTitude?': () => '0',
  'GPS:GPSR:SPeeD?': () => '0',
  'GPS:GPSR:RTRJ?': (m) => quoteString(m.recording ? 'Recording' : 'Not Recording'),
  'GPS:DIAG:LogAMP?': () => quoteString('-46.8 dBm'),
  'GPS:DIAG:PLLLockstatus?': () => '1',
  'GPS:DIAG:PLLlock800status?': () => '1',
  'GPS:DIAG:PLLlockeXternalstatus?': () => '0',
  'GPS:DIAG:PLllockeXternalRefdetec?': () => '0',
  'GPS:CAL:RLCV:STATus?': () => quoteString('Ready'),
  'GPS:CAL:RLCV:DONE?': () => quoteString(''),
};

function numberArg(c: CheckedCommand): number {
  const v = c.values[0];
  return v?.kind === 'number' ? v.value : 0;
}

function routeName(m: Instrument, i: number): string {
  const p = m.state.route.points[i];
  if (!p || m.state.setup.simulationType !== 'DYNAMIC') return '';
  return p.kind === 'point' ? p.name : p.code;
}

function waypointRow(w: Scenario['userWaypoints'][number]): string {
  return [
    w.code,
    w.icao,
    w.name,
    w.city,
    w.state,
    formatNumber(radToDeg(w.lat_rad), 9),
    formatNumber(radToDeg(w.lon_rad), 9),
    formatNumber(w.alt_m, 3),
  ].join(',');
}

const SECTION_PREFIX: Readonly<Record<string, readonly string[]>> = {
  CAL: ['GPS:CAL:'],
  DIAG: ['GPS:DIAG:'],
  FILE: ['GPS:FILe:'],
  GPSR: ['GPS:GPSR:'],
  ROUTE: ['GPS:ROUT:'],
  SET: ['GPS:SET:', 'GPS:SETup:'],
  SIM: ['GPS:SIM:', 'GPS:SIMU:'],
  SVPRN: ['GPS:SVPR:'],
  WAYP: ['GPS:WAYP:'],
};

/** Lista de comandos por seção para GPS:? (nomes do modelo). */
export function helpList(section: string): string[] {
  const all = getIndex().infos.map((i) => i.header as string);
  if (section === 'ALL') return all;
  const pref = SECTION_PREFIX[section];
  if (pref) return all.filter((h) => pref.some((p) => h.startsWith(p)));
  const known = Object.values(SECTION_PREFIX).flat();
  return all.filter((h) => !known.some((p) => h.startsWith(p)));
}

type Action = (m: Instrument, c: CheckedCommand) => void;

const fileOps = (kind: FileKind): Partial<Record<string, Action>> => ({
  SAV: (m, c) => {
    m.saveFile(kind, m.fileName(c));
  },
  LOAD: (m, c) => {
    m.loadFile(kind, m.fileName(c));
  },
  REM: (m, c) => {
    m.removeFile(kind, m.fileName(c));
  },
  CLR: (m) => {
    m.clearFiles(kind);
  },
  IMP: (m) => {
    m.status = `Import complete: ${kind}`;
  },
  EXP: (m) => {
    m.status = `Export complete: ${kind}`;
  },
});

const SET_OPS = fileOps('SET');
const ROUT_OPS = fileOps('ROUT');
const ALM_OPS = fileOps('ALM');
const NMEA_OPS = fileOps('NMEA');
const KML_OPS = fileOps('KML');

function must(a: Action | undefined): Action {
  if (!a) throw new Error('operação ausente');
  return a;
}

const COMMANDS: Partial<Record<CommandHeader, Action>> = {
  '*RST': (m) => {
    m.reset();
  },
  '*CLS': (m) => {
    m.errors.length = 0;
  },
  '*ESE': (m, c) => {
    m.misc.set('*ESE', String(numberArg(c)));
  },
  '*SRE': (m, c) => {
    m.misc.set('*SRE', String(numberArg(c)));
  },
  'GPS:SIM:ToggleRUN': (m) => {
    m.toggleRun();
  },
  'GPS:FILe:SET:SAVe': must(SET_OPS.SAV),
  'GPS:FILe:SET:LOAD': must(SET_OPS.LOAD),
  'GPS:FILe:SET:REMove': must(SET_OPS.REM),
  'GPS:FILe:SET:CLeaRall': must(SET_OPS.CLR),
  'GPS:FILe:SET:IMPort': must(SET_OPS.IMP),
  'GPS:FILe:SET:EXPort': must(SET_OPS.EXP),
  'GPS:FILe:SET:DEFault': (m) => {
    const units = m.state.setup.units;
    m.state = powerUpState();
    m.state.setup.units = units;
    m.loaded.SET = '';
    m.status = 'Default settings loaded';
  },
  'GPS:FILe:ROUT:SAVe': must(ROUT_OPS.SAV),
  'GPS:ROUT:SAVe': must(ROUT_OPS.SAV),
  'GPS:FILe:ROUT:LOAD': must(ROUT_OPS.LOAD),
  'GPS:ROUT:LOAD': must(ROUT_OPS.LOAD),
  'GPS:FILe:ROUT:REMove': must(ROUT_OPS.REM),
  'GPS:ROUT:REMove': must(ROUT_OPS.REM),
  'GPS:FILe:ROUT:CLeaRall': must(ROUT_OPS.CLR),
  'GPS:FILe:ROUT:IMPort': must(ROUT_OPS.IMP),
  'GPS:FILe:ROUT:EXPort': must(ROUT_OPS.EXP),
  'GPS:FILe:ROUT:DEFaults': (m) => {
    m.state.route.points = [];
    m.loaded.ROUT = '';
  },
  'GPS:FILe:ALM:LOAD': must(ALM_OPS.LOAD),
  'GPS:FILe:ALM:REMove': must(ALM_OPS.REM),
  'GPS:FILe:ALM:CLeaRall': must(ALM_OPS.CLR),
  'GPS:FILe:ALM:IMPort': must(ALM_OPS.IMP),
  'GPS:FILe:ALM:EXPort': must(ALM_OPS.EXP),
  'GPS:FILe:ALM:DEFault': (m) => {
    m.loadFile('ALM', DEFAULT_ALMANAC);
  },
  'GPS:FILe:ALM:RELoad': (m) => {
    m.state.files.almanac = { kind: 'equipment' };
    m.loaded.ALM = '';
  },
  'GPS:GPSR:RELoad': (m) => {
    m.state.files.almanac = { kind: 'equipment' };
    m.loaded.ALM = '';
  },
  'GPS:FILe:NMEA:LOAD': must(NMEA_OPS.LOAD),
  'GPS:FILe:NMEA:CLeaRall': must(NMEA_OPS.CLR),
  'GPS:FILe:NMEA:IMPort': must(NMEA_OPS.IMP),
  'GPS:FILe:NMEA:EXPort': must(NMEA_OPS.EXP),
  'GPS:FILe:NMEA:DEFault': (m) => {
    m.state.files.nmea = null;
    m.loaded.NMEA = '';
  },
  'GPS:FILe:KML:LOAD': must(KML_OPS.LOAD),
  'GPS:FILe:KML:REMove': must(KML_OPS.REM),
  'GPS:FILe:KML:CLeaRall': must(KML_OPS.CLR),
  'GPS:FILe:WAYP:IMPort': (m) => {
    m.status = 'Import complete: WAYP';
  },
  'GPS:FILe:WAYP:EXPort': (m) => {
    m.status = 'Export complete: WAYP';
  },
  'GPS:FILe:WAYP:CLeaR': (m) => {
    m.state.userWaypoints = [];
  },
  'GPS:ROUT:VALiDate': (m) => {
    // Sem verificação de dinâmica: o mock só confere que há pontos (avisos de rota no M5).
    const n = m.state.route.points.length;
    m.status = n >= 2 ? `Route valid (mock): ${n} points` : `Route invalid (mock): ${n} points`;
  },
  'GPS:SET:CHAN:APPLy': (m) => {
    m.status = 'Channel configuration applied';
  },
  'GPS:GPSR:RTRJ': (m) => {
    // D15: tratado como alternância.
    m.recording = !m.recording;
  },
};
