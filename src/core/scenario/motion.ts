// Limites dos modelos de movimento e grandezas derivadas. Valores de fábrica em quirks.ts (D27).
import { D27_FACTORY_LIMITS, type MotionLimits } from '../quirks';
import type { Motion } from './types';

export type { MotionLimits };

export const MOTION_LIMITS: Readonly<Record<Motion['model'], MotionLimits>> = D27_FACTORY_LIMITS;

/** Limites em vigor: os do modelo CUSTOM editados, ou os de fábrica do modelo corrente. */
export function motionLimits(m: Motion): MotionLimits {
  return m.custom ?? MOTION_LIMITS[m.model];
}

export const STANDARD_GRAVITY = 9.80665;

/**
 * Inclinação máxima em curva coordenada, em rad: atan(a_lateral / g). A UI do equipamento não a
 * exibe para pedestre, automóvel e marítimo (curva não coordenada, OP 3-12); retorna null nesses.
 */
export function maxBankAngle(m: Motion): number | null {
  if (m.model === 'PEDESTRIAN' || m.model === 'AUTOMOTIVE' || m.model === 'MARINE') return null;
  return Math.atan(motionLimits(m).maxLateral_mps2 / STANDARD_GRAVITY);
}
