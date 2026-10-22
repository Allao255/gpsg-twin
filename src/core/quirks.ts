// Tratamentos provisórios das discrepâncias de docs/04-discrepancias.md.
//
// Regra: todo comportamento que depende de uma discrepância não resolvida fica neste módulo, com o
// ID `Dnn` no comentário. Ao resolver um item em bancada, atualizar model/commands.json e
// docs/04-discrepancias.md e remover o tratamento correspondente daqui.
//
// Itens cujo efeito só aparece em marcos posteriores estão em DEFERRED.
import type { CommandHeader, EnumValue, Param } from './model/load';
import type { Range } from './model/types.gen';
import type { Carrier } from './scenario/types';

type Gnss = EnumValue<'GPS:SET:GNSS', 'gnss'>;

export type UnitsMode = EnumValue<'GPS:SET:UNITs', 'units'>;
export type Port = EnumValue<'GPS:SET:RFPoRt', 'port'>;

export interface Losses {
  coupler_dB: number;
  couplerCable_dB: number;
  directCable_dB: number;
  splitter_dB: number;
}

/** Discrepâncias sem efeito no core do M1, com o marco em que o tratamento entra. */
export const DEFERRED: Readonly<Record<string, string>> = {
  D03: 'M6/M7: parser tolerante de SVPR:LIST? (ordem provável dos 12 campos)',
  D16: 'M2/M7: fila de erros registra código e texto, sem tabela',
  D18: 'M5: step error tratado como absoluto; duração só para Doppler',
  D21: 'M3: DIAG:FREQ 1278 exposto só na tela de diagnóstico',
  D22: 'M4: mapeamento de tokens de fading entre SCPI e settings XML',
  D23: 'M4: AUTOMOTIVE no SCPI, Automobile no settings XML',
};

// ---------------------------------------------------------------------------------------------
// D01: step error limitado a ±1000 m. Já é a faixa do modelo (GPS:SVPR:*:SAT step_error); nada a
// sobrepor aqui. Constante usada pela UI e pelos testes.
export const D01_STEP_ERROR_MAX_M = 1000;

// ---------------------------------------------------------------------------------------------
// D02: SVPR:SAT sempre emitido com 8 parâmetros (duração explícita). Com 7, aceito com aviso.
export const D02_SVPR_HEADERS: readonly CommandHeader[] = [
  'GPS:SVPR:GPS:SATellite',
  'GPS:SVPR:GAL:SATellite',
];
export const D02_DEFAULT_DURATION_S = 3600;

// ---------------------------------------------------------------------------------------------
// D04: modo de unidades.
// - Todo script gerado começa com UNIT SI e confirma com UNIT?.
// - Sem sufixo de unidade na emissão; sufixo aceito na leitura com aviso.
// - Unidade de cada grandeza por modo: IMPERIAL pelas faixas do modelo (ft, ft/min, mph, ft/s2);
//   SI pelo exemplo de ROUT:LIST?/DISP? em SI (m, m/s, m/s, m/s2).
// - AERO/SI e AERO/IMPERIAL tratados como SI e IMPERIAL, não verificado.
// - MLAT, MLON e MVEL não têm unidade no modelo; grandeza inferida pelo nome do parâmetro.
export const D04_FORCED_UNITS: UnitsMode = 'SI';
export const D04_EMIT_UNIT_SUFFIX = false;

export type ModeQuantity = 'length' | 'speed' | 'climb' | 'accel';

export const D04_MODE_UNITS: Readonly<Record<'SI' | 'IMPERIAL', Record<ModeQuantity, string>>> = {
  SI: { length: 'm', speed: 'm/s', climb: 'm/s', accel: 'm/s2' },
  IMPERIAL: { length: 'ft', speed: 'mph', climb: 'ft/min', accel: 'ft/s2' },
};

/** Unidades métricas e imperiais das chaves de `range_by_units`. */
export const D04_RANGE_KEY_SYSTEM: Readonly<Record<string, 'SI' | 'IMPERIAL'>> = {
  m: 'SI',
  'km/h': 'SI',
  ft: 'IMPERIAL',
  mph: 'IMPERIAL',
};

export function d04System(mode: UnitsMode): { system: 'SI' | 'IMPERIAL'; verified: boolean } {
  switch (mode) {
    case 'SI':
      return { system: 'SI', verified: true };
    case 'IMPERIAL':
      return { system: 'IMPERIAL', verified: true };
    case 'AERO/SI':
      return { system: 'SI', verified: false };
    case 'AERO/IMPERIAL':
      return { system: 'IMPERIAL', verified: false };
  }
}

const QUANTITY_BY_MODEL_UNIT: Readonly<Record<string, ModeQuantity>> = {
  ft: 'length',
  mph: 'speed',
  'ft/min': 'climb',
  'ft/s2': 'accel',
};

const QUANTITY_BY_PARAM_NAME: Readonly<Record<string, ModeQuantity>> = {
  acceleration: 'accel',
  velocity: 'speed',
};

/** Grandeza de um parâmetro cuja unidade depende do modo de unidades, ou null. */
export function d04Quantity(p: Param): ModeQuantity | null {
  if (p.unit !== undefined) return QUANTITY_BY_MODEL_UNIT[p.unit] ?? null;
  if (p.unit_suffix) return QUANTITY_BY_PARAM_NAME[p.name] ?? null;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Grafias de cabeçalho fora do modelo. Chave: nós resolvidos na forma curta mais o restante em
// maiúsculas, sem `:` inicial, com `?` nas consultas.
export interface HeaderQuirk {
  key: string;
  target: CommandHeader | null;
  /** true: aceita como o alvo; false: rejeita com referência à discrepância. */
  accept: boolean;
  dRefs: string[];
  note: string;
}

export const HEADER_QUIRKS: readonly HeaderQuirk[] = [
  // D05: GPS:SET:PORT no exemplo do próprio comando; o cabeçalho documentado é RFPoRt.
  {
    key: 'GPS:SET:PORT',
    target: 'GPS:SET:RFPoRt',
    accept: false,
    dRefs: ['D05'],
    note: 'grafia do exemplo do RP 10-15, não documentada no cabeçalho',
  },
  {
    key: 'GPS:SET:PORT?',
    target: 'GPS:SET:RFPoRt?',
    accept: false,
    dRefs: ['D05'],
    note: 'grafia do exemplo do RP 10-15, não documentada no cabeçalho',
  },
  // D06: STYPE no capítulo 14.
  {
    key: 'GPS:SET:STYPE',
    target: 'GPS:SET:SimulationTYPe',
    accept: false,
    dRefs: ['D06'],
    note: 'grafia do capítulo 14; forma curta documentada é STYP',
  },
  {
    key: 'GPS:SET:STYPE?',
    target: 'GPS:SET:SimulationTYPe?',
    accept: false,
    dRefs: ['D06'],
    note: 'grafia do capítulo 14; forma curta documentada é STYP',
  },
  // D09: CHAN:SINGLE citado em APPL e não documentado.
  {
    key: 'GPS:SET:CHAN:SINGLE?',
    target: null,
    accept: false,
    dRefs: ['D09'],
    note: 'citado em CHAN:APPL, sem entrada no manual',
  },
  {
    key: 'GPS:SET:CHAN:SINGLE',
    target: null,
    accept: false,
    dRefs: ['D09'],
    note: 'citado em CHAN:APPL, sem entrada no manual',
  },
  // D20: SPD? com nó SIM em vez de SIMU; aceito, pendente de S01 B6.
  {
    key: 'GPS:SIM:SPD?',
    target: 'GPS:SIMU:SPeeD?',
    accept: true,
    dRefs: ['D20'],
    note: 'nó SIM no lugar de SIMU, como nos demais comandos de simulação',
  },
  {
    key: 'GPS:SIM:SPEED?',
    target: 'GPS:SIMU:SPeeD?',
    accept: true,
    dRefs: ['D20'],
    note: 'nó SIM no lugar de SIMU, como nos demais comandos de simulação',
  },
  // D25: STIME no exemplo de SamplingTIMe.
  {
    key: 'GPS:FIL:KML:STIME',
    target: 'GPS:FILe:KML:SamplingTIMe',
    accept: false,
    dRefs: ['D25'],
    note: 'grafia do exemplo do RP 7-11; forma curta é STIM',
  },
  {
    key: 'GPS:FIL:KML:STIME?',
    target: 'GPS:FILe:KML:SamplingTIMe?',
    accept: false,
    dRefs: ['D25'],
    note: 'grafia do exemplo do RP 7-11; forma curta é STIM',
  },
];

// D20: forma canônica de emissão de SIMU:SPeeD? enquanto S01 B6 não confirmar.
export const EMIT_HEADER_OVERRIDE: Readonly<Partial<Record<CommandHeader, string>>> = {
  'GPS:SIMU:SPeeD?': 'GPS:SIM:SPD?',
};

// ---------------------------------------------------------------------------------------------
// D06: enum entre aspas (`PSRC "USER"`) aceito com aviso; emissão sem aspas.
export const D06_QUOTED_ENUM_DREFS = ['D06'];

// D07: latitude e longitude emitidas em graus decimais com sinal; `DD,MM.MMMM,H` aceito com aviso.
export const D07_LATLON_DREFS = ['D07'];

// ---------------------------------------------------------------------------------------------
// Sobreposição de faixa de parâmetro.
export interface RangeOverride {
  header: CommandHeader;
  param: string;
  min?: number;
  max?: number;
  dRefs: string[];
}

export const RANGE_OVERRIDES: readonly RangeOverride[] = [
  // D08: linha de rota 1..9999 (EDIT documenta 1..10000).
  { header: 'GPS:ROUT:EDIT', param: 'row', min: 1, max: 9999, dRefs: ['D08'] },
];

export function rangeOverride(header: CommandHeader, param: string): RangeOverride | null {
  return RANGE_OVERRIDES.find((o) => o.header === header && o.param === param) ?? null;
}

// D10: PRN Galileo 1..36 e D14: SLOS 0..10 já são as faixas do modelo.

// ---------------------------------------------------------------------------------------------
// Tokens de enum que existem só na UI ou em outro documento: rejeitados com explicação.
export interface EnumHint {
  header: CommandHeader;
  token: string;
  dRefs: string[];
  note: string;
}

export const ENUM_HINTS: readonly EnumHint[] = [
  // D12: INTERNAL só na UI; remoto aceita GPSRX e USER. Tratamento: USER.
  {
    header: 'GPS:SET:CLOCk',
    token: 'INTERNAL',
    dRefs: ['D12'],
    note: 'INTERNAL existe só na UI; usar USER',
  },
  // D13: Traj File só na UI.
  {
    header: 'GPS:SET:PRNSignal',
    token: 'TRAJ',
    dRefs: ['D13'],
    note: 'Traj File existe só na UI; não emitido',
  },
  // D11: L1 no P(y) só na UI.
  {
    header: 'GPS:SET:CARRier',
    token: 'L1NOPY',
    dRefs: ['D11'],
    note: 'L1 no P(y) existe só na UI',
  },
  // D22: nomes da UI para fading.
  {
    header: 'GPS:SET:FADing',
    token: 'LAND',
    dRefs: ['D22'],
    note: 'nome da tabela de especificação; token remoto é VEHICLE',
  },
  {
    header: 'GPS:SET:FADing',
    token: 'AERONAUTICAL',
    dRefs: ['D22'],
    note: 'nome da tabela de especificação; token remoto é AIRCRAFT',
  },
  // D23: nome do settings XML para o modelo de movimento.
  {
    header: 'GPS:SET:CuRrentMotionModel',
    token: 'AUTOMOBILE',
    dRefs: ['D23'],
    note: 'token do settings XML; token remoto é AUTOMOTIVE',
  },
];

// ---------------------------------------------------------------------------------------------
// D11: portadora emitida por CARR com os tokens do RP, salvo quando o cenário veio de CRGP, CRGA ou
// CRGG (o comando de origem é preservado).
export const D11_DEFAULT_CARRIER_HEADER: CommandHeader = 'GPS:SET:CARRier';

// D11: portadoras oferecidas pela UI por GNSS (OP 3-5) e o comando remoto emitido para cada uma.
// `carrier: null`: opção só da UI, sem equivalente remoto.
export interface UiCarrier {
  label: string;
  carrier: Carrier | null;
  dRefs: string[];
}

export const D11_UI_CARRIERS: Readonly<Record<Gnss, readonly UiCarrier[]>> = {
  GPS: [
    { label: 'L1', carrier: { command: 'GPS:SET:CARRier', token: 'L1/E1' }, dRefs: ['D11'] },
    { label: 'L1C', carrier: { command: 'GPS:SET:CARRier', token: 'L1C' }, dRefs: [] },
    { label: 'L2', carrier: { command: 'GPS:SET:CARRier', token: 'L2' }, dRefs: [] },
    { label: 'L2C', carrier: { command: 'GPS:SET:CARRier', token: 'L2C' }, dRefs: [] },
    { label: 'L5', carrier: { command: 'GPS:SET:CARRier', token: 'L5/E5' }, dRefs: ['D11'] },
    { label: 'L1 no P(y)', carrier: null, dRefs: ['D11'] },
  ],
  GALILEO: [
    { label: 'E1', carrier: { command: 'GPS:SET:CARRier', token: 'L1/E1' }, dRefs: ['D11'] },
    { label: 'E5', carrier: { command: 'GPS:SET:CARRier', token: 'L5/E5' }, dRefs: ['D11'] },
    { label: 'E5A', carrier: { command: 'GPS:SET:CaRrierGAl', token: 'E5a' }, dRefs: ['D11'] },
  ],
  'GAL+GPS': [
    { label: 'L1/E1', carrier: { command: 'GPS:SET:CARRier', token: 'L1/E1' }, dRefs: [] },
    { label: 'L5/E5', carrier: { command: 'GPS:SET:CARRier', token: 'L5/E5' }, dRefs: [] },
  ],
};

/** Rótulo da UI para a portadora do cenário; o token remoto quando não há correspondência. */
export function d11CarrierLabel(gnss: Gnss, c: Carrier): string {
  const hit = D11_UI_CARRIERS[gnss].find(
    (u) => u.carrier?.command === c.command && u.carrier.token === c.token,
  );
  return hit?.label ?? c.token.toUpperCase();
}

// D12, D13: opções só da UI (Clock = Internal, PRN Signal = Traj File) aparecem na réplica
// desabilitadas, com a referência; o tratamento remoto está em ENUM_HINTS.

// D26: a réplica valida pelas faixas do RP (modelo); as faixas da UI (OP 3-3, 3-21) não são aplicadas.
// D28: o quinto parâmetro de WAYP:NEW/EDIT (`state`) aparece na réplica como Country/State.

// D27: limites de fábrica dos modelos de movimento, SI, do settings XML (OP D-7, 01-equipamento.md
// seção 4). A UI (OP 3-12) cita máximo de 100 m/s² e 1150,782 mph; não adotado.
export interface MotionLimits {
  maxLateral_mps2: number;
  maxLongitudinal_mps2: number;
  maxVelocity_mps: number;
}

export const D27_FACTORY_LIMITS: Readonly<
  Record<EnumValue<'GPS:SET:CuRrentMotionModel', 'model'>, MotionLimits>
> = {
  PEDESTRIAN: { maxLateral_mps2: 2.94, maxLongitudinal_mps2: 2.94, maxVelocity_mps: 10.73 },
  AUTOMOTIVE: { maxLateral_mps2: 9.8, maxLongitudinal_mps2: 9.8, maxVelocity_mps: 89.41 },
  MARINE: { maxLateral_mps2: 6.86, maxLongitudinal_mps2: 6.86, maxVelocity_mps: 44.7 },
  LOW_PERFORMANCE_AIRCRAFT: {
    maxLateral_mps2: 19.6,
    maxLongitudinal_mps2: 9.8,
    maxVelocity_mps: 223.52,
  },
  HIGH_PERFORMANCE_AIRCRAFT: {
    maxLateral_mps2: 88.2,
    maxLongitudinal_mps2: 49,
    maxVelocity_mps: 447.04,
  },
  CUSTOM: { maxLateral_mps2: 98, maxLongitudinal_mps2: 98, maxVelocity_mps: 514.1 },
  UNLIMITED: { maxLateral_mps2: 98, maxLongitudinal_mps2: 98, maxVelocity_mps: 514.1 },
};

// D09: alocação de canais não emitida na v1.
export const D09_NOT_EMITTED: readonly CommandHeader[] = [
  'GPS:SET:CHAN:GNSS',
  'GPS:SET:CHAN:SBAS',
  'GPS:SET:CHAN:DUAL:GPS',
  'GPS:SET:CHAN:DUAL:GAL',
  'GPS:SET:CHAN:DUAL:SBAS',
  'GPS:SET:CHAN:DUAL:DEFault',
  'GPS:SET:CHAN:APPLy',
];

// D15: forma de parar a gravação de trajetória não descrita; não emitir.
export const D15_NOT_EMITTED: readonly CommandHeader[] = ['GPS:GPSR:RTRJ'];

// ---------------------------------------------------------------------------------------------
// D17: RF Level é nível por SV; a parte inteira das perdas desloca a faixa da porta para baixo.
// Perdas consideradas por porta (não verificado):
//   COUPLER: acoplador + cabo do acoplador + divisor
//   DIRECT:  cabo direto + divisor
export const D17_RANGE_SHIFT_HEADERS: readonly CommandHeader[] = ['GPS:SET:RFLeVel'];

export function d17LossForPort(port: Port, l: Losses): number {
  return port === 'COUPLER'
    ? l.coupler_dB + l.couplerCable_dB + l.splitter_dB
    : l.directCable_dB + l.splitter_dB;
}

export function d17ShiftedRange(base: Range, port: Port, losses: Losses): Range {
  const shift = Math.floor(d17LossForPort(port, losses) + 1e-9);
  return [base[0] - shift, base[1] - shift];
}

// ---------------------------------------------------------------------------------------------
// D19: respostas com aspas, unidade e símbolo de grau. Limpeza tolerante para comparação.
export function d19CleanResponse(resp: string): string {
  let s = resp.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s*°$/, '').trim();
}

// ---------------------------------------------------------------------------------------------
// D24: almanaque reprodutível só quando carregado de arquivo (LOAD) ou o padrão (DEF).
export const D24_DREFS = ['D24'];
