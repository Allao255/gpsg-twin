import { describe, expect, it } from 'vitest';
import { decimalsOfStep, findUnit, formatNumber, fromSI, sameDimension, toSI } from './units';

describe('units', () => {
  it('converte para SI e de volta', () => {
    expect(toSI(1000, 'ft')).toBeCloseTo(304.8, 12);
    expect(toSI(1, 'mph')).toBeCloseTo(0.44704, 12);
    expect(toSI(5905.512, 'ft/min')).toBeCloseTo(30, 4);
    expect(toSI(328.084, 'ft/s2')).toBeCloseTo(100, 4);
    expect(fromSI(toSI(12.3, 'kt'), 'kt')).toBeCloseTo(12.3, 12);
    expect(toSI(180, 'deg')).toBeCloseTo(Math.PI, 12);
  });

  it('localiza unidade sem diferenciar caixa e por alias', () => {
    expect(findUnit('FT')?.token).toBe('ft');
    expect(findUnit('m/s²')?.token).toBe('m/s2');
    expect(findUnit('KTS')?.token).toBe('kt');
    expect(findUnit('MHZ')?.token).toBe('MHz');
    expect(findUnit('furlong')).toBeNull();
    expect(() => toSI(1, 'furlong')).toThrow(/desconhecida/);
  });

  it('compara dimensões', () => {
    expect(sameDimension('ft', 'm')).toBe(true);
    expect(sameDimension('ft', 'mph')).toBe(false);
    expect(sameDimension('ft', 'xx')).toBe(false);
  });

  it('formata números sem zeros supérfluos, sem expoente e sem -0', () => {
    expect(formatNumber(37.6499, 9)).toBe('37.6499');
    expect(formatNumber(-0.0000001, 3)).toBe('0');
    expect(formatNumber(1e21, 2)).not.toMatch(/e/);
    expect(formatNumber(12, 3)).toBe('12');
    expect(formatNumber(-130, 0)).toBe('-130');
    expect(() => formatNumber(NaN, 2)).toThrow();
  });

  it('casas decimais do passo', () => {
    expect(decimalsOfStep(1)).toBe(0);
    expect(decimalsOfStep(0.1)).toBe(1);
    expect(decimalsOfStep(0.001)).toBe(3);
  });
});
