// Catálogo dos campos editáveis da réplica. Cada campo liga um controle da tela (rótulo do
// equipamento, OP capítulo 3) ao cenário e ao comando do modelo que o configura, de onde vêm trava
// em execução, faixa e validação.
import type { Axis } from '../core/geo';
import { info, type CommandHeader } from '../core/model/load';
import {
  D11_UI_CARRIERS,
  d11CarrierLabel,
  d17ShiftedRange,
  d04Quantity,
  D04_MODE_UNITS,
} from '../core/quirks';
import { MOTION_LIMITS } from '../core/scenario/motion';
import type { Scenario } from '../core/scenario/types';
import { formatCommand, type EmitArg } from '../core/scpi/format';
import { checkCommand } from '../core/scpi/validate';
import { formatNumber, toSI } from '../core/units';
import {
  formatDate,
  formatTime,
  mmddyyyy,
  parseDate,
  parseTime,
  withDate,
  withTime,
} from './datetime';
import {
  displayDecimals,
  displayUnit,
  fromDisplay,
  toDisplay,
  unitLabel,
  type DisplayQuantity,
} from './display-units';
import { formatLatLon, LATLON_FORMAT_LABEL, parseLatLon } from './latlon';

export type FieldKind = 'enum' | 'number' | 'lat' | 'lon' | 'date' | 'time';

export interface FieldOption {
  value: string;
  label: string;
  /** Motivo de a opção existir na tela mas não ser selecionável (com a referência Dnn). */
  disabled?: string;
}

export interface FieldDef {
  id: string;
  label: string;
  kind: FieldKind;
  /** Comando remoto que configura o campo (trava, faixa, linha do script); null se não houver. */
  header: CommandHeader | null;
  options?: (s: Scenario) => FieldOption[];
  /** Grandeza com unidade dependente do modo de exibição. */
  quantity?: DisplayQuantity;
  /** Unidade fixa exibida (dB, dBm). */
  unit?: string;
  decimals?: number;
  /** Valor canônico: valor da opção (enum), SI (número) ou rad (lat/lon); epoch em data/hora. */
  get: (s: Scenario) => string | number | null;
  set: (s: Scenario, v: string | number) => void;
  /** Motivo de travamento por modo (além da trava em execução). */
  modeLock?: (s: Scenario) => string | null;
  /** Alterável com a simulação rodando: vira ação temporizada. */
  runtime?: boolean;
  /** Preferência de exibição: não altera o script de configuração. */
  displayOnly?: boolean;
}

const opts = (pairs: [string, string][], disabled: Record<string, string> = {}): FieldOption[] =>
  pairs.map(([value, label]) =>
    disabled[value] ? { value, label, disabled: disabled[value] } : { value, label },
  );

const enumField = (
  id: string,
  label: string,
  header: CommandHeader,
  key: keyof Scenario['setup'],
  pairs: [string, string][],
  disabled: Record<string, string> = {},
): FieldDef => ({
  id,
  label,
  kind: 'enum',
  header,
  options: () => opts(pairs, disabled),
  get: (s) => s.setup[key] as string,
  set: (s, v) => {
    (s.setup as unknown as Record<string, unknown>)[key] = v;
  },
});

const notStatic = (s: Scenario): string | null =>
  s.setup.simulationType === 'STATIC'
    ? null
    : 'Travado com Simulation = Dynamic ou Trajectory (OP 3-2)';

const notCustom = (s: Scenario): string | null =>
  s.motion.model === 'CUSTOM' ? null : 'Editável só com Current Motion Model = Custom';

const notUserClock = (s: Scenario): string | null =>
  s.setup.clock === 'USER' ? null : 'Usado só com Clock = User setting';

function lossField(
  id: string,
  label: string,
  header: CommandHeader,
  key: keyof Scenario['io'],
): FieldDef {
  return {
    id,
    label,
    kind: 'number',
    header,
    unit: 'dB',
    decimals: 1,
    get: (s) => s.io[key],
    set: (s, v) => {
      s.io[key] = Number(v);
    },
  };
}

function customField(
  id: string,
  label: string,
  header: CommandHeader,
  key: 'maxLateral_mps2' | 'maxLongitudinal_mps2' | 'maxVelocity_mps',
  quantity: DisplayQuantity,
): FieldDef {
  return {
    id,
    label,
    kind: 'number',
    header,
    quantity,
    get: (s) => (s.motion.custom ? s.motion.custom[key] : motionDefault(s, key)),
    set: (s, v) => {
      s.motion.custom ??= {
        maxLateral_mps2: motionDefault(s, 'maxLateral_mps2'),
        maxLongitudinal_mps2: motionDefault(s, 'maxLongitudinal_mps2'),
        maxVelocity_mps: motionDefault(s, 'maxVelocity_mps'),
      };
      s.motion.custom[key] = Number(v);
    },
    modeLock: notCustom,
  };
}

function motionDefault(
  s: Scenario,
  key: 'maxLateral_mps2' | 'maxLongitudinal_mps2' | 'maxVelocity_mps',
): number {
  return MOTION_LIMITS[s.motion.model][key];
}

function channelField(
  id: string,
  label: string,
  header: CommandHeader,
  key: keyof Scenario['channels'],
): FieldDef {
  return {
    id,
    label,
    kind: 'number',
    header,
    decimals: 0,
    get: (s) => s.channels[key],
    set: (s, v) => {
      s.channels[key] = Number(v);
    },
  };
}

function angleField(id: string, label: string, axis: Axis, header: CommandHeader): FieldDef {
  return {
    id,
    label,
    kind: axis,
    header,
    get: (s) => (axis === 'lat' ? s.position.lat_rad : s.position.lon_rad),
    set: (s, v) => {
      if (axis === 'lat') s.position.lat_rad = Number(v);
      else s.position.lon_rad = Number(v);
    },
    modeLock: notStatic,
  };
}

export const FIELDS: readonly FieldDef[] = [
  // Setup, Simulation (OP 3-5 a 3-8)
  {
    id: 'setup.gnss',
    label: 'GNSS',
    kind: 'enum',
    header: 'GPS:SET:GNSS',
    options: () =>
      opts([
        ['GPS', 'GPS'],
        ['GALILEO', 'Galileo'],
        ['GAL+GPS', 'GPS+Galileo'],
      ]),
    get: (s) => s.setup.gnss,
    set: (s, v) => {
      s.setup.gnss = v as Scenario['setup']['gnss'];
      // A portadora depende do GNSS: mantém se existir na nova lista, senão a primeira opção.
      const label = d11CarrierLabel(s.setup.gnss, s.setup.carrier);
      const list = D11_UI_CARRIERS[s.setup.gnss];
      const keep = list.find((u) => u.label === label && u.carrier);
      const first = list.find((u) => u.carrier);
      const c = (keep ?? first)?.carrier;
      if (c) s.setup.carrier = c;
    },
  },
  {
    id: 'setup.carrier',
    label: 'Carrier',
    kind: 'enum',
    header: 'GPS:SET:CARRier',
    options: (s) =>
      D11_UI_CARRIERS[s.setup.gnss].map((u) =>
        u.carrier
          ? { value: u.label, label: u.label }
          : {
              value: u.label,
              label: u.label,
              disabled: 'sem equivalente remoto',
            },
      ),
    get: (s) => d11CarrierLabel(s.setup.gnss, s.setup.carrier),
    set: (s, v) => {
      const u = D11_UI_CARRIERS[s.setup.gnss].find((x) => x.label === v);
      if (u?.carrier) s.setup.carrier = u.carrier;
    },
  },
  enumField('setup.sbas', 'SBAS', 'GPS:SET:SBAS', 'sbas', [
    ['AUTO', 'Auto'],
    ['OFF', 'Off'],
  ]),
  enumField('setup.simulationType', 'Simulation', 'GPS:SET:SimulationTYPe', 'simulationType', [
    ['STATIC', 'Static'],
    ['DYNAMIC', 'Dynamic'],
    ['TRAJECTORY', 'Trajectory'],
  ]),
  enumField('setup.digitalNoise', 'Digital Noise', 'GPS:SET:DigitalNOiSe', 'digitalNoise', [
    ['ON', 'On'],
    ['OFF', 'Off'],
  ]),
  enumField('setup.fading', 'Fading', 'GPS:SET:FADing', 'fading', [
    ['NONE', 'None'],
    ['STATIC', 'Static'],
    ['PEDESTRIAN', 'Pedestrian'],
    ['VEHICLE', 'Land Vehicle'],
    ['AIRCRAFT', 'Aircraft'],
  ]),
  enumField(
    'setup.prnSignal',
    'PRN Signal',
    'GPS:SET:PRNSignal',
    'prnSignal',
    [
      ['FIXED', 'Fixed'],
      ['VARIABLE', 'Variable'],
      ['TRAJ', 'Traj File'],
    ],
    { TRAJ: 'só na UI, sem comando remoto' },
  ),
  enumField('setup.positionSource', 'Position Source', 'GPS:SET:PositionSouRCe', 'positionSource', [
    ['USER', 'User'],
    ['GPS', 'GPS'],
  ]),
  enumField(
    'setup.clock',
    'Clock',
    'GPS:SET:CLOCk',
    'clock',
    [
      ['GPSRX', 'GPSRX'],
      ['USER', 'User setting'],
      ['INTERNAL', 'Internal'],
    ],
    { INTERNAL: 'só na UI, sem comando remoto; usar User setting' },
  ),
  {
    id: 'setup.date',
    label: 'Date',
    kind: 'date',
    header: 'GPS:SET:DATe',
    get: (s) => s.setup.userTime_s,
    set: (s, v) => {
      s.setup.userTime_s = Number(v);
    },
    modeLock: notUserClock,
  },
  {
    id: 'setup.time',
    label: 'Time',
    kind: 'time',
    header: 'GPS:SET:TIMe',
    get: (s) => s.setup.userTime_s,
    set: (s, v) => {
      s.setup.userTime_s = Number(v);
    },
    modeLock: notUserClock,
  },
  {
    id: 'setup.rfLevel',
    label: 'RF Level',
    kind: 'number',
    header: 'GPS:SET:RFLeVel',
    unit: 'dBm',
    decimals: 1,
    runtime: true,
    get: (s) => s.setup.rfLevel_dBm,
    set: (s, v) => {
      s.setup.rfLevel_dBm = Number(v);
    },
  },
  {
    id: 'setup.rfPort',
    label: 'RF Port',
    kind: 'enum',
    header: 'GPS:SET:RFPoRt',
    options: () =>
      opts([
        ['DIRECT', 'Direct'],
        ['COUPLER', 'Coupler'],
      ]),
    get: (s) => s.setup.rfPort,
    set: (s, v) => {
      s.setup.rfPort = v as Scenario['setup']['rfPort'];
      // A UI força Digital Noise conforme a porta (OP 3-6).
      s.setup.digitalNoise = s.setup.rfPort === 'COUPLER' ? 'OFF' : 'ON';
    },
  },
  {
    ...enumField('setup.units', 'Units', 'GPS:SET:UNITs', 'units', [
      ['IMPERIAL', 'Imperial'],
      ['SI', 'SI'],
      ['AERO/IMPERIAL', 'Aero/Imperial'],
      ['AERO/SI', 'Aero/SI'],
    ]),
    displayOnly: true,
  },
  {
    id: 'display.latLonFormat',
    label: 'Lat/Long Format',
    kind: 'enum',
    header: null,
    displayOnly: true,
    options: () => opts(Object.entries(LATLON_FORMAT_LABEL)),
    get: (s) => s.display.latLonFormat,
    set: (s, v) => {
      s.display.latLonFormat = v as Scenario['display']['latLonFormat'];
    },
  },
  {
    id: 'motion.model',
    label: 'Motion Model',
    kind: 'enum',
    header: 'GPS:SET:CuRrentMotionModel',
    options: () =>
      opts([
        ['PEDESTRIAN', 'Pedestrian'],
        ['AUTOMOTIVE', 'Automobile'],
        ['MARINE', 'Marine'],
        ['LOW_PERFORMANCE_AIRCRAFT', 'Low Performance Aircraft'],
        ['HIGH_PERFORMANCE_AIRCRAFT', 'High Performance Aircraft'],
        ['CUSTOM', 'Custom'],
        ['UNLIMITED', 'Unlimited'],
      ]),
    get: (s) => s.motion.model,
    set: (s, v) => {
      s.motion.model = v as Scenario['motion']['model'];
    },
  },
  // Setup, Motion (OP 3-12)
  customField(
    'motion.maxLongitudinal',
    'Max Longitudinal Acceleration',
    'GPS:SET:MaxLONgitudinalacceleration',
    'maxLongitudinal_mps2',
    'accel',
  ),
  customField(
    'motion.maxLateral',
    'Max Normal Acceleration',
    'GPS:SET:MaxLATeralacceleration',
    'maxLateral_mps2',
    'accel',
  ),
  customField(
    'motion.maxVelocity',
    'Max Velocity',
    'GPS:SET:MaxVELocity',
    'maxVelocity_mps',
    'velocityMax',
  ),
  // Setup, Channels (OP 3-13; D09: guardado, não emitido)
  channelField('channels.gnss', 'GNSS SVs', 'GPS:SET:CHAN:GNSS', 'gnss'),
  channelField('channels.sbas', 'SBAS SVs', 'GPS:SET:CHAN:SBAS', 'sbas'),
  channelField('channels.dualGps', 'GPS SVs', 'GPS:SET:CHAN:DUAL:GPS', 'dualGps'),
  channelField('channels.dualGal', 'Galileo SVs', 'GPS:SET:CHAN:DUAL:GAL', 'dualGal'),
  channelField('channels.dualSbas', 'SBAS SVs', 'GPS:SET:CHAN:DUAL:SBAS', 'dualSbas'),
  // Setup, I/O (OP 3-14)
  lossField('io.coupler', 'Coupler Loss', 'GPS:SET:CouplerLOSs', 'coupler_dB'),
  lossField('io.couplerCable', 'Coupler Cable', 'GPS:SETup:CouplerCABle', 'couplerCable_dB'),
  lossField('io.directCable', 'Direct Cable', 'GPS:SET:DirectCABle', 'directCable_dB'),
  lossField('io.splitter', 'Splitter Loss', 'GPS:SET:SplitterLOSs', 'splitter_dB'),
  enumField('setup.extRef', 'Ext Ref Out', 'GPS:SET:ExtREF', 'extRef', [
    ['OFF', 'OFF'],
    ['ON', 'ON'],
  ]),
  enumField(
    'setup.referenceSource',
    'Reference Source',
    'GPS:SET:ReferenceSouRCe',
    'referenceSource',
    [
      ['INTERNAL', 'INT'],
      ['EXTERNAL', 'EXT'],
    ],
  ),
  enumField('setup.triggerSource', 'Trigger', 'GPS:SET:TriggerSouRCe', 'triggerSource', [
    ['AUTO', 'Auto'],
    ['EXTERNAL', 'External'],
  ]),
  // Simulation, PVT (OP 3-2, 3-3)
  angleField('position.lat', 'Latitude', 'lat', 'GPS:SIM:LATitude'),
  angleField('position.lon', 'Longitude', 'lon', 'GPS:SIM:LONGitude'),
  {
    id: 'position.alt',
    label: 'Altitude',
    kind: 'number',
    header: 'GPS:SIM:ALTitude',
    quantity: 'altitude',
    get: (s) => s.position.alt_m,
    set: (s, v) => {
      s.position.alt_m = Number(v);
    },
    modeLock: notStatic,
  },
];

const BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

export function field(id: string): FieldDef {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`campo inexistente: ${id}`);
  return f;
}

export function fieldsForHeader(header: string): FieldDef[] {
  return FIELDS.filter((f) => f.header === header);
}

/** Motivo de o campo estar travado, ou null. */
export function lockReason(f: FieldDef, s: Scenario, running: boolean): string | null {
  if (running && !f.displayOnly) {
    if (f.runtime) return null;
    const locked = f.header ? info(f.header).cmd.locked_while_running === true : false;
    return locked
      ? 'Travado durante a execução'
      : 'Em execução, só RF Level e SVs entram na linha do tempo';
  }
  return f.modeLock?.(s) ?? null;
}

/** Unidade exibida ao lado do campo. */
export function fieldUnit(f: FieldDef, s: Scenario): string {
  if (f.quantity) return unitLabel(displayUnit(s.setup.units, f.quantity));
  return f.unit ?? '';
}

/** Texto do campo como na tela. */
export function displayValue(f: FieldDef, s: Scenario): string {
  const v = f.get(s);
  if (v === null) return '';
  switch (f.kind) {
    case 'enum':
      return f.options?.(s).find((o) => o.value === v)?.label ?? String(v);
    case 'lat':
    case 'lon':
      return formatLatLon(Number(v), f.kind, s.display.latLonFormat);
    case 'date':
      return formatDate(Number(v));
    case 'time':
      return formatTime(Number(v));
    case 'number': {
      const n = Number(v);
      if (f.quantity)
        return formatNumber(toDisplay(n, s.setup.units, f.quantity), displayDecimals(f.quantity));
      return formatNumber(n, f.decimals ?? 3);
    }
  }
}

export type ParseResult = { value: string | number } | { error: string };

/** Interpreta o texto digitado no campo e valida pelo modelo. */
export function parseInput(f: FieldDef, s: Scenario, text: string): ParseResult {
  const t = text.trim();
  let value: string | number;
  let emitArg: EmitArg;
  switch (f.kind) {
    case 'enum': {
      const o = f.options?.(s).find((x) => x.value === t || x.label === t);
      if (!o) return { error: `opção inexistente: ${t}` };
      if (o.disabled) return { error: o.disabled };
      return { value: o.value };
    }
    case 'lat':
    case 'lon': {
      const r = parseLatLon(t, f.kind);
      if ('error' in r) return r;
      value = r.rad;
      emitArg = r.rad;
      break;
    }
    case 'date': {
      const r = parseDate(t);
      if ('error' in r) return r;
      value = withDate(Number(f.get(s)), r.days);
      emitArg = mmddyyyy(value);
      break;
    }
    case 'time': {
      const r = parseTime(t);
      if ('error' in r) return r;
      value = withTime(Number(f.get(s)), r.seconds);
      emitArg = formatTime(value);
      break;
    }
    case 'number': {
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { error: `número inválido: ${t}` };
      const n = Number(t);
      value = f.quantity ? fromDisplay(n, s.setup.units, f.quantity) : n;
      emitArg = value;
      break;
    }
  }
  const err = f.header ? modelError(f.header, emitArg, s) : null;
  return err ? { error: err } : { value };
}

function modelError(header: CommandHeader, arg: EmitArg, s: Scenario): string | null {
  const c = checkCommand(formatCommand(header, [arg]), {
    running: false,
    units: 'SI',
    port: s.setup.rfPort,
    losses: s.io,
  });
  return c.diagnostics.find((d) => d.severity === 'error')?.message ?? null;
}

/** Faixa aceita pelo campo, na unidade exibida, ou null. */
export function fieldRange(
  f: FieldDef,
  s: Scenario,
): { min: number; max: number; unit: string } | null {
  if (!f.header || f.kind !== 'number') return null;
  const p = info(f.header).params[0];
  if (!p) return null;
  const unit = fieldUnit(f, s);
  if (p.range_by_port) {
    const port = s.setup.rfPort;
    const r =
      f.header === 'GPS:SET:RFLeVel'
        ? d17ShiftedRange(p.range_by_port[port], port, s.io)
        : p.range_by_port[port];
    return { min: r[0], max: r[1], unit };
  }
  if (p.min === undefined || p.max === undefined) return null;
  const q = d04Quantity(p);
  if (q && f.quantity && p.unit) {
    const conv = (x: number): number =>
      Number(
        formatNumber(
          toDisplay(
            toSI(x, p.unit ?? D04_MODE_UNITS.SI[q]),
            s.setup.units,
            f.quantity ?? 'altitude',
          ),
          3,
        ),
      );
    return { min: conv(p.min), max: conv(p.max), unit };
  }
  return { min: p.min, max: p.max, unit };
}

/** Aplica um valor ao cenário (cópia). */
export function applyField(f: FieldDef, s: Scenario, v: string | number): Scenario {
  const n = structuredClone(s);
  f.set(n, v);
  return n;
}
