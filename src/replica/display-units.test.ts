import { describe, expect, it } from 'vitest';
import {
  displayDecimals,
  displayUnit,
  fromDisplay,
  toDisplay,
  unitLabel,
  type DisplayQuantity,
} from './display-units';

const MODES = ['IMPERIAL', 'SI', 'AERO/IMPERIAL', 'AERO/SI'] as const;
const QUANTITIES: DisplayQuantity[] = [
  'altitude',
  'radius',
  'speed',
  'climb',
  'accel',
  'velocityMax',
  'coherence',
  'step',
];

describe('unidades de exibição por modo', () => {
  it('velocidade: mph, km/h e nós nos modos aeronáuticos', () => {
    expect(MODES.map((m) => displayUnit(m, 'speed'))).toEqual(['mph', 'km/h', 'kt', 'kt']);
    expect(MODES.map((m) => displayUnit(m, 'altitude'))).toEqual(['ft', 'm', 'ft', 'm']);
  });

  it('rótulos como na tela; unidade sem rótulo passa como está', () => {
    expect(unitLabel('mph')).toBe('Mph');
    expect(unitLabel('kt')).toBe('kts');
    expect(unitLabel('ft/s2')).toBe('ft/s^2');
    expect(unitLabel('dBm')).toBe('dBm');
  });

  it('altitude sem casas decimais, demais com 3', () => {
    expect(displayDecimals('altitude')).toBe(0);
    expect(displayDecimals('speed')).toBe(3);
  });

  it('conversão de ida e volta em todos os modos e grandezas', () => {
    for (const m of MODES)
      for (const q of QUANTITIES)
        expect(fromDisplay(toDisplay(12.5, m, q), m, q)).toBeCloseTo(12.5);
  });

  it('valores conhecidos', () => {
    expect(toDisplay(0.3048, 'IMPERIAL', 'altitude')).toBeCloseTo(1, 12);
    expect(fromDisplay(100, 'SI', 'speed')).toBeCloseTo(100 / 3.6, 12);
    expect(toDisplay(1852 / 3600, 'AERO/SI', 'speed')).toBeCloseTo(1, 12);
    expect(fromDisplay(60, 'SI', 'climb')).toBeCloseTo(1, 12);
  });
});
