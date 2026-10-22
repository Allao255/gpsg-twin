// Estado do cenário. Unidades SI e ângulos em radianos; tokens de enumeração vêm do modelo.
//
// Um cenário é uma configuração pré-execução mais uma execução (do @run ao @stop) com ações
// temporizadas. Scripts com várias execuções são tratados inteiros no nível de ScriptDoc; a
// conversão para cenário cobre a primeira execução.
import type { EnumValue } from '../model/load';
import type { Port, UnitsMode } from '../quirks';

export type { Port, UnitsMode };

export const SCENARIO_VERSION = 1;
export type OnOff = EnumValue<'GPS:SET:DigitalNOiSe', 'state'>;

/** Comando de portadora de origem e token correspondente (D11). */
export type Carrier =
  | { command: 'GPS:SET:CARRier'; token: EnumValue<'GPS:SET:CARRier', 'carrier'> }
  | { command: 'GPS:SET:CaRrierGPs'; token: EnumValue<'GPS:SET:CaRrierGPs', 'carrier'> }
  | { command: 'GPS:SET:CaRrierGAl'; token: EnumValue<'GPS:SET:CaRrierGAl', 'carrier'> }
  | { command: 'GPS:SET:CaRrierGG'; token: EnumValue<'GPS:SET:CaRrierGG', 'carrier'> };

export interface Setup {
  /** Modo de exibição do cenário. Scripts gerados usam sempre SI (D04). */
  units: UnitsMode;
  gnss: EnumValue<'GPS:SET:GNSS', 'gnss'>;
  carrier: Carrier;
  sbas: EnumValue<'GPS:SET:SBAS', 'status'>;
  simulationType: EnumValue<'GPS:SET:SimulationTYPe', 'type'>;
  digitalNoise: OnOff;
  fading: EnumValue<'GPS:SET:FADing', 'fading'>;
  prnSignal: EnumValue<'GPS:SET:PRNSignal', 'prn_signal'>;
  positionSource: EnumValue<'GPS:SET:PositionSouRCe', 'source'>;
  clock: EnumValue<'GPS:SET:CLOCk', 'clock'>;
  /** Data e hora USER em UTC, segundos desde 1970-01-01. Usado só com clock USER. */
  userTime_s: number;
  rfPort: Port;
  rfLevel_dBm: number;
  triggerSource: EnumValue<'GPS:SET:TriggerSouRCe', 'source'>;
  extRef: OnOff;
  referenceSource: EnumValue<'GPS:SET:ReferenceSouRCe', 'reference'>;
}

export interface Io {
  coupler_dB: number;
  couplerCable_dB: number;
  directCable_dB: number;
  splitter_dB: number;
}

export interface Motion {
  model: EnumValue<'GPS:SET:CuRrentMotionModel', 'model'>;
  /** Limites do modelo CUSTOM; null mantém os do equipamento. */
  custom: { maxLateral_mps2: number; maxLongitudinal_mps2: number; maxVelocity_mps: number } | null;
}

/** Alocação de canais. Guardada, não emitida na v1 (D09). null: não definido. */
export interface Channels {
  gnss: number | null;
  sbas: number | null;
  dualGps: number | null;
  dualGal: number | null;
  dualSbas: number | null;
}

export interface Position {
  lat_rad: number;
  lon_rad: number;
  alt_m: number;
}

export interface Leg {
  climbRate_mps: number;
  speed_mps: number;
  accel_mps2: number;
  turnRadius_m: number;
}

export type RoutePoint =
  ({ kind: 'point'; name: string } & Position & Leg) | ({ kind: 'waypoint'; code: string } & Leg);

export interface Route {
  points: RoutePoint[];
  loop: OnOff;
}

export interface UserWaypoint extends Position {
  code: string;
  icao: string;
  name: string;
  city: string;
  state: string;
}

export type FileKind = 'SET' | 'ROUT' | 'ALM' | 'NMEA' | 'WAYP';

export type AlmanacSource =
  | { kind: 'file'; name: string }
  | { kind: 'default' }
  /** Almanaque que estiver no equipamento: cenário não fixado (D24). */
  | { kind: 'equipment' };

export interface Files {
  /** Tipos importados do pendrive antes da carga, na ordem. */
  imports: FileKind[];
  settings: string | null;
  almanac: AlmanacSource;
  route: string | null;
  nmea: string | null;
  kml: string | null;
}

export interface SvAction {
  t_s: number;
  type: 'sv';
  constellation: 'GPS' | 'GAL';
  sv: number;
  select: EnumValue<'GPS:SVPR:GAL:SATellite', 'select'>;
  health: EnumValue<'GPS:SVPR:GAL:SATellite', 'health'>;
  doppler_Hz: number;
  incoherence_mps: number;
  ampOffset_dB: number;
  stepError_m: number;
  duration_s: number;
}

export interface RfLevelAction {
  t_s: number;
  type: 'rfLevel';
  level_dBm: number;
}

export type TimedAction = SvAction | RfLevelAction;

export interface Scenario {
  scenario_version: typeof SCENARIO_VERSION;
  /** Identificador: minúsculas, dígitos e `_`. Arquivos no equipamento: `twin_<name>`. */
  name: string;
  description: string;
  setup: Setup;
  io: Io;
  motion: Motion;
  channels: Channels;
  position: Position;
  route: Route;
  userWaypoints: UserWaypoint[];
  files: Files;
  run: {
    /** Instante do @stop em relação ao @run; null: a simulação continua após o script. */
    stopAt_s: number | null;
  };
  /** Ações em execução, em ordem de tempo (estável). */
  actions: TimedAction[];
}

export const NAME_RE = /^[a-z0-9_]{1,40}$/;
