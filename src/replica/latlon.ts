// Exibição e entrada de latitude e longitude nos três formatos da tela (OP 3-8).
import { AXIS_LIMIT_DEG, degToRad, radToDeg, type Axis } from '../core/geo';
import type { LatLonFormat } from '../core/scenario/types';
import { formatNumber } from '../core/units';

const HEMI: Readonly<Record<Axis, [string, string]>> = { lat: ['N', 'S'], lon: ['E', 'W'] };

export const LATLON_FORMAT_LABEL: Readonly<Record<LatLonFormat, string>> = {
  'DD.DD': 'DD.DD°',
  'DDMM.MM': "DD°MM.MM'",
  'DDMMSS.SS': 'DD°MM\'SS.SS"',
};

/** Formata um ângulo em rad no formato da tela, com hemisfério. */
export function formatLatLon(rad: number, axis: Axis, fmt: LatLonFormat): string {
  const deg = radToDeg(rad);
  const [pos, neg] = HEMI[axis];
  const h = deg < 0 ? neg : pos;
  const a = Math.abs(deg);
  if (fmt === 'DD.DD') return `${a.toFixed(6)}° ${h}`;
  let d = Math.floor(a);
  if (fmt === 'DDMM.MM') {
    let m = Number(((a - d) * 60).toFixed(4));
    if (m >= 60) {
      d += 1;
      m = 0;
    }
    return `${d}° ${m.toFixed(4)}' ${h}`;
  }
  let totalSec = Number(((a - d) * 3600).toFixed(4));
  if (totalSec >= 3600) {
    d += 1;
    totalSec = 0;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return `${d}° ${m}' ${s.toFixed(4)}" ${h}`;
}

/**
 * Lê latitude ou longitude digitada: graus decimais com sinal ou hemisfério, graus e minutos, ou
 * graus, minutos e segundos (separadores livres: espaço, °, ', ").
 */
export function parseLatLon(text: string, axis: Axis): { rad: number } | { error: string } {
  const t = text.trim().toUpperCase();
  const [pos, neg] = HEMI[axis];
  const letters = t.match(/[A-Z]/g) ?? [];
  if (letters.some((l) => l !== pos && l !== neg))
    return { error: `hemisfério deve ser ${pos} ou ${neg}` };
  if (letters.length > 1) return { error: 'mais de um hemisfério' };
  const nums = t.match(/[+-]?\d+(?:\.\d+)?/g) ?? [];
  if (nums.length === 0 || nums.length > 3) return { error: 'formato não reconhecido' };
  const values = nums.map(Number);
  const first = values[0] ?? 0;
  const negSign = first < 0 || (nums[0] ?? '').startsWith('-');
  if (negSign && letters.length > 0) return { error: 'sinal e hemisfério ao mesmo tempo' };
  const [d = 0, m = 0, s = 0] = values.map(Math.abs);
  if (nums.length > 1 && !Number.isInteger(d))
    return { error: 'graus devem ser inteiros com minutos' };
  if (nums.length > 2 && !Number.isInteger(m))
    return { error: 'minutos devem ser inteiros com segundos' };
  if (m >= 60 || s >= 60) return { error: 'minutos e segundos devem ser menores que 60' };
  const abs = d + m / 60 + s / 3600;
  const lim = AXIS_LIMIT_DEG[axis];
  if (abs > lim) return { error: `fora de ±${lim}°` };
  const negative = negSign || letters[0] === neg;
  return { rad: degToRad(negative ? -abs : abs) };
}

/** Graus decimais com sinal, como emitidos (D07). */
export function decimalDegrees(rad: number): string {
  return formatNumber(radToDeg(rad), 9);
}
