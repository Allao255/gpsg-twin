import { describe, expect, it } from 'vitest';
import { degToRad, radToDeg } from '../core/geo';
import { decimalDegrees, formatLatLon, parseLatLon } from './latlon';

const deg = (r: { rad: number } | { error: string }): number => {
  if ('error' in r) throw new Error(r.error);
  return radToDeg(r.rad);
};

describe('formatLatLon', () => {
  it('três formatos da tela, com hemisfério', () => {
    const r = degToRad(39.2976);
    expect(formatLatLon(r, 'lat', 'DD.DD')).toBe('39.297600° N');
    expect(formatLatLon(r, 'lat', 'DDMM.MM')).toBe("39° 17.8560' N");
    expect(formatLatLon(r, 'lat', 'DDMMSS.SS')).toBe('39° 17\' 51.3600" N');
    expect(formatLatLon(degToRad(-94.7139), 'lon', 'DD.DD')).toBe('94.713900° W');
    expect(formatLatLon(degToRad(102.4533), 'lon', 'DD.DD')).toBe('102.453300° E');
    expect(formatLatLon(degToRad(-4.444), 'lat', 'DD.DD')).toBe('4.444000° S');
  });

  it('arredondamento que chega a 60 minutos ou 3600 segundos passa para o grau seguinte', () => {
    const r = degToRad(9.99999999);
    expect(formatLatLon(r, 'lat', 'DDMM.MM')).toBe("10° 0.0000' N");
    expect(formatLatLon(r, 'lat', 'DDMMSS.SS')).toBe('10° 0\' 0.0000" N');
  });
});

describe('parseLatLon', () => {
  it('graus decimais com sinal ou hemisfério', () => {
    expect(deg(parseLatLon('4.444', 'lat'))).toBeCloseTo(4.444, 12);
    expect(deg(parseLatLon('-94.7139', 'lon'))).toBeCloseTo(-94.7139, 12);
    expect(deg(parseLatLon('94.7139 w', 'lon'))).toBeCloseTo(-94.7139, 12);
    expect(deg(parseLatLon('+10 N', 'lat'))).toBe(10);
  });

  it('graus e minutos, graus minutos e segundos, separadores livres', () => {
    expect(deg(parseLatLon("39° 17.856' N", 'lat'))).toBeCloseTo(39.2976, 12);
    expect(deg(parseLatLon('39 17 51.36 S', 'lat'))).toBeCloseTo(-39.2976, 12);
    expect(deg(parseLatLon('-0 30', 'lat'))).toBe(-0.5);
  });

  it('ida e volta pelos três formatos', () => {
    for (const fmt of ['DD.DD', 'DDMM.MM', 'DDMMSS.SS'] as const) {
      const text = formatLatLon(degToRad(-33.8568), 'lat', fmt);
      expect(deg(parseLatLon(text, 'lat'))).toBeCloseTo(-33.8568, 5);
    }
  });

  it('rejeita entradas malformadas com motivo', () => {
    const err = (t: string, axis: 'lat' | 'lon' = 'lat'): string => {
      const r = parseLatLon(t, axis);
      return 'error' in r ? r.error : '';
    };
    expect(err('10 E')).toMatch(/hemisfério deve ser N ou S/);
    expect(err('10 N S')).toMatch(/mais de um hemisfério/);
    expect(err('')).toMatch(/formato/);
    expect(err('1 2 3 4')).toMatch(/formato/);
    expect(err('-10 N')).toMatch(/sinal e hemisfério/);
    expect(err('10.5 30')).toMatch(/graus devem ser inteiros/);
    expect(err('10 30.5 10')).toMatch(/minutos devem ser inteiros/);
    expect(err('10 60')).toMatch(/menores que 60/);
    expect(err('10 0 60')).toMatch(/menores que 60/);
    expect(err('90.0001')).toMatch(/±90/);
    expect(err('180.5', 'lon')).toMatch(/±180/);
  });

  it('sinal só nos graus: sinal em minutos ou segundos é rejeitado', () => {
    expect(parseLatLon('10 -30', 'lat')).toHaveProperty('error');
    expect(parseLatLon('10 30 +15', 'lat')).toHaveProperty('error');
  });
});

describe('decimalDegrees', () => {
  it('graus com sinal e até 9 casas (D07)', () => {
    expect(decimalDegrees(degToRad(-94.7139))).toBe('-94.7139');
    expect(decimalDegrees(degToRad(1 / 3))).toBe('0.333333333');
  });
});
