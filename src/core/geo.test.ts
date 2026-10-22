import { describe, expect, it } from 'vitest';
import { degToRad, isHemisphere, parseDegMin, radToDeg } from './geo';

describe('geo', () => {
  it('converte graus e radianos', () => {
    expect(radToDeg(degToRad(-94.7139))).toBeCloseTo(-94.7139, 12);
  });

  it('lê graus, minutos decimais e hemisfério', () => {
    expect(parseDegMin('105', '45.8912', 'W', 'lon')).toEqual({ deg: -(105 + 45.8912 / 60) });
    expect(parseDegMin('12', '30.0000', 's', 'lat')).toEqual({ deg: -12.5 });
    expect(parseDegMin('12', '30', 'N', 'lat')).toEqual({ deg: 12.5 });
  });

  it('rejeita formatos inválidos', () => {
    expect(parseDegMin('x', '1', 'N', 'lat')).toHaveProperty('error');
    expect(parseDegMin('1', 'y', 'N', 'lat')).toHaveProperty('error');
    expect(parseDegMin('1', '60', 'N', 'lat')).toHaveProperty('error');
    expect(parseDegMin('1', '1', 'E', 'lat')).toHaveProperty('error');
    expect(parseDegMin('91', '0', 'N', 'lat')).toHaveProperty('error');
  });

  it('reconhece hemisfério por eixo', () => {
    expect(isHemisphere(' w ', 'lon')).toBe(true);
    expect(isHemisphere('N', 'lon')).toBe(false);
  });
});
