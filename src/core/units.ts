// Conversões de unidade. O core trabalha em SI (ângulos em radianos); conversão só na entrada e na saída.

export type Dimension =
  | 'length'
  | 'velocity'
  | 'acceleration'
  | 'angle'
  | 'frequency'
  | 'time'
  | 'ratio_db'
  | 'power_dbm';

export interface UnitDef {
  /** Grafia canônica (a do modelo quando existir). */
  token: string;
  dim: Dimension;
  /** Valor em SI de 1 unidade (multiplicativo). */
  factor: number;
}

const FT = 0.3048;

const UNIT_DEFS: readonly UnitDef[] = [
  { token: 'm', dim: 'length', factor: 1 },
  { token: 'km', dim: 'length', factor: 1000 },
  { token: 'ft', dim: 'length', factor: FT },
  { token: 'nmi', dim: 'length', factor: 1852 },
  { token: 'm/s', dim: 'velocity', factor: 1 },
  { token: 'm/min', dim: 'velocity', factor: 1 / 60 },
  { token: 'km/h', dim: 'velocity', factor: 1 / 3.6 },
  { token: 'mph', dim: 'velocity', factor: 0.44704 },
  { token: 'kt', dim: 'velocity', factor: 1852 / 3600 },
  { token: 'ft/s', dim: 'velocity', factor: FT },
  { token: 'ft/min', dim: 'velocity', factor: FT / 60 },
  { token: 'm/s2', dim: 'acceleration', factor: 1 },
  { token: 'ft/s2', dim: 'acceleration', factor: FT },
  { token: 'g', dim: 'acceleration', factor: 9.80665 },
  { token: 'rad', dim: 'angle', factor: 1 },
  { token: 'deg', dim: 'angle', factor: Math.PI / 180 },
  { token: 'Hz', dim: 'frequency', factor: 1 },
  { token: 'kHz', dim: 'frequency', factor: 1e3 },
  { token: 'MHz', dim: 'frequency', factor: 1e6 },
  { token: 's', dim: 'time', factor: 1 },
  { token: 'dB', dim: 'ratio_db', factor: 1 },
  { token: 'dBm', dim: 'power_dbm', factor: 1 },
];

const ALIASES: Readonly<Record<string, string>> = {
  'm/s²': 'm/s2',
  'ft/s²': 'ft/s2',
  kts: 'kt',
  kn: 'kt',
  fpm: 'ft/min',
  kph: 'km/h',
  sec: 's',
};

const BY_KEY = new Map<string, UnitDef>(UNIT_DEFS.map((u) => [u.token.toLowerCase(), u]));

/** Localiza uma unidade pela grafia, sem diferenciar caixa. */
export function findUnit(token: string): UnitDef | null {
  const k = token.trim().toLowerCase();
  const alias = ALIASES[k];
  return BY_KEY.get(alias ?? k) ?? null;
}

function mustFind(token: string): UnitDef {
  const u = findUnit(token);
  if (!u) throw new Error(`unidade desconhecida: ${token}`);
  return u;
}

export function toSI(value: number, unit: string): number {
  return value * mustFind(unit).factor;
}

export function fromSI(valueSI: number, unit: string): number {
  return valueSI / mustFind(unit).factor;
}

export function sameDimension(a: string, b: string): boolean {
  const ua = findUnit(a);
  const ub = findUnit(b);
  return ua !== null && ub !== null && ua.dim === ub.dim;
}

/**
 * Formata um número com no máximo `decimals` casas, sem zeros à direita, sem expoente e sem "-0".
 */
export function formatNumber(x: number, decimals: number): string {
  if (!Number.isFinite(x)) throw new Error(`número não finito: ${x}`);
  // toFixed usa expoente a partir de 1e21; nessa magnitude não há casas decimais representáveis.
  if (Math.abs(x) >= 1e21) return BigInt(Math.round(x)).toString();
  let s = x.toFixed(Math.max(0, Math.min(20, decimals)));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (/^-0$/.test(s)) s = '0';
  return s;
}

/** Número de casas decimais de um passo (0.1 -> 1, 0.001 -> 3, 1 -> 0). */
export function decimalsOfStep(step: number): number {
  const s = formatNumber(step, 12);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}
