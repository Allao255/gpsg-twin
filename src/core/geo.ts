// Ângulos e formatos de latitude e longitude. Radianos internamente; graus só na entrada e na saída.

export const DEG = Math.PI / 180;

export function degToRad(deg: number): number {
  return deg * DEG;
}

export function radToDeg(rad: number): number {
  return rad / DEG;
}

export type Axis = 'lat' | 'lon';

export const AXIS_LIMIT_DEG: Readonly<Record<Axis, number>> = { lat: 90, lon: 180 };

const HEMIS: Readonly<Record<Axis, { pos: string; neg: string }>> = {
  lat: { pos: 'N', neg: 'S' },
  lon: { pos: 'E', neg: 'W' },
};

/**
 * Converte a forma graus, minutos decimais e hemisfério (`105,45.8912,W`) em graus decimais com sinal.
 * Retorna mensagem de erro em caso de formato inválido.
 */
export function parseDegMin(
  deg: string,
  min: string,
  hemi: string,
  axis: Axis,
): { deg: number } | { error: string } {
  if (!/^\d{1,3}$/.test(deg.trim())) return { error: `graus inválidos: "${deg}"` };
  if (!/^\d{1,2}(\.\d*)?$/.test(min.trim())) return { error: `minutos inválidos: "${min}"` };
  const d = Number(deg);
  const m = Number(min);
  if (m >= 60) return { error: `minutos fora de 0..60: ${m}` };
  const h = hemi.trim().toUpperCase();
  const { pos, neg } = HEMIS[axis];
  if (h !== pos && h !== neg) return { error: `hemisfério deve ser ${pos} ou ${neg}: "${hemi}"` };
  const v = d + m / 60;
  if (v > AXIS_LIMIT_DEG[axis]) return { error: `fora de ±${AXIS_LIMIT_DEG[axis]}°` };
  return { deg: h === neg ? -v : v };
}

export function isHemisphere(s: string, axis: Axis): boolean {
  const h = s.trim().toUpperCase();
  return h === HEMIS[axis].pos || h === HEMIS[axis].neg;
}
