// Unidades de exibição e entrada na tela, por modo de unidades do Setup (OP 3-7, 3-12, 3-21, 3-22).
// Só a réplica usa estas unidades; os scripts gerados usam SI (D04).
import type { UnitsMode } from '../core/quirks';
import { findUnit } from '../core/units';

export type DisplayQuantity =
  'altitude' | 'radius' | 'speed' | 'climb' | 'accel' | 'velocityMax' | 'coherence' | 'step';

const TABLE: Readonly<Record<UnitsMode, Record<DisplayQuantity, string>>> = {
  IMPERIAL: {
    altitude: 'ft',
    radius: 'ft',
    speed: 'mph',
    climb: 'ft/min',
    accel: 'ft/s2',
    velocityMax: 'mph',
    coherence: 'ft/s',
    step: 'ft',
  },
  SI: {
    altitude: 'm',
    radius: 'm',
    speed: 'km/h',
    climb: 'm/min',
    accel: 'm/s2',
    velocityMax: 'km/h',
    coherence: 'm/s',
    step: 'm',
  },
  'AERO/IMPERIAL': {
    altitude: 'ft',
    radius: 'ft',
    speed: 'kt',
    climb: 'ft/min',
    accel: 'ft/s2',
    velocityMax: 'kt',
    coherence: 'ft/s',
    step: 'ft',
  },
  'AERO/SI': {
    altitude: 'm',
    radius: 'm',
    speed: 'kt',
    climb: 'm/min',
    accel: 'm/s2',
    velocityMax: 'kt',
    coherence: 'm/s',
    step: 'm',
  },
};

/** Rótulos como na tela do equipamento. */
const LABEL: Readonly<Record<string, string>> = {
  ft: 'ft',
  m: 'm',
  mph: 'Mph',
  'km/h': 'Km/h',
  kt: 'kts',
  'ft/min': 'ft/min',
  'm/min': 'm/min',
  'ft/s2': 'ft/s^2',
  'm/s2': 'm/s^2',
  'ft/s': 'ft/s',
  'm/s': 'm/s',
};

/** Casas decimais de exibição (passos da UI: altitude em 1 ft ou 1 m, demais em 0,001). */
const DECIMALS: Readonly<Record<DisplayQuantity, number>> = {
  altitude: 0,
  radius: 3,
  speed: 3,
  climb: 3,
  accel: 3,
  velocityMax: 3,
  coherence: 3,
  step: 3,
};

export function displayUnit(mode: UnitsMode, q: DisplayQuantity): string {
  return TABLE[mode][q];
}

export function unitLabel(unit: string): string {
  return LABEL[unit] ?? unit;
}

export function displayDecimals(q: DisplayQuantity): number {
  return DECIMALS[q];
}

function factor(unit: string): number {
  const u = findUnit(unit);
  if (!u) throw new Error(`unidade sem conversão: ${unit}`);
  return u.factor;
}

export function toDisplay(si: number, mode: UnitsMode, q: DisplayQuantity): number {
  return si / factor(displayUnit(mode, q));
}

export function fromDisplay(v: number, mode: UnitsMode, q: DisplayQuantity): number {
  return v * factor(displayUnit(mode, q));
}
