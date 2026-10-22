// Checagens de rota que dependem só dos dados declarados (OP 3-21, 01-equipamento.md seção 4),
// equivalentes às que GPS:ROUT:VALD faz no equipamento: distância entre pontos maior que 4 raios de
// curva, raio de curva não menor que v²/a, velocidade e aceleração dentro do modelo de movimento.
// Distâncias por grande círculo numa esfera de raio médio (precisão bem melhor que a das regras).
import { motionLimits } from '../core/scenario/motion';
import type { Leg, Scenario } from '../core/scenario/types';

export const EARTH_RADIUS_M = 6371008.8;

export function distance_m(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const s =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rumo inicial de 1 para 2, em rad (0 = norte, sentido horário). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
}

export interface RoutePointView extends Leg {
  index: number;
  name: string;
  /** null: waypoint do banco do equipamento, sem coordenadas no twin. */
  lat_rad: number | null;
  lon_rad: number | null;
  alt_m: number | null;
  /** Distância até o próximo ponto (ou ao primeiro, com loop), m. */
  next_m: number | null;
  warnings: string[];
}

export interface RouteCheck {
  points: RoutePointView[];
  /** Comprimento total dos segmentos com coordenadas conhecidas, m. */
  length_m: number;
  warnings: string[];
}

const f1 = (x: number): string => (Math.round(x * 10) / 10).toString();

export function checkRoute(sc: Scenario): RouteCheck {
  const lim = motionLimits(sc.motion);
  const model = sc.motion.custom ? 'Custom editado' : sc.motion.model;
  const pts: RoutePointView[] = sc.route.points.map((p, index) => {
    const pos = p.kind === 'point' ? p : (sc.userWaypoints.find((w) => w.code === p.code) ?? null);
    return {
      index,
      name: p.kind === 'point' ? p.name : p.code,
      lat_rad: pos?.lat_rad ?? null,
      lon_rad: pos?.lon_rad ?? null,
      alt_m: pos?.alt_m ?? null,
      climbRate_mps: p.climbRate_mps,
      speed_mps: p.speed_mps,
      accel_mps2: p.accel_mps2,
      turnRadius_m: p.turnRadius_m,
      next_m: null,
      warnings: [],
    };
  });
  const warnings: string[] = [];
  if (pts.length === 1) warnings.push('rota com um ponto só');
  const unknown = pts.filter((p) => p.lat_rad === null).map((p) => p.name);
  if (unknown.length > 0)
    warnings.push(
      `waypoints do banco do equipamento sem coordenadas no twin: ${unknown.join(', ')}`,
    );

  let length = 0;
  const n = pts.length;
  const segments = sc.route.loop === 'ON' && n > 2 ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (
      !a ||
      !b ||
      a.lat_rad === null ||
      a.lon_rad === null ||
      b.lat_rad === null ||
      b.lon_rad === null
    )
      continue;
    const d = distance_m(a.lat_rad, a.lon_rad, b.lat_rad, b.lon_rad);
    a.next_m = d;
    length += d;
    for (const p of [a, b]) {
      if (p.turnRadius_m > 0 && d <= 4 * p.turnRadius_m)
        p.warnings.push(
          `trecho ${a.name} -> ${b.name} com ${f1(d)} m, não maior que 4 raios de curva (${f1(4 * p.turnRadius_m)} m)`,
        );
    }
  }
  for (const p of pts) {
    const rMin = lim.maxLateral_mps2 > 0 ? p.speed_mps ** 2 / lim.maxLateral_mps2 : 0;
    if (p.turnRadius_m > 0 && p.turnRadius_m < rMin)
      p.warnings.push(
        `raio de curva ${f1(p.turnRadius_m)} m menor que v²/a = ${f1(rMin)} m (${model})`,
      );
    if (p.speed_mps > lim.maxVelocity_mps)
      p.warnings.push(
        `velocidade ${f1(p.speed_mps)} m/s acima do máximo do modelo (${f1(lim.maxVelocity_mps)} m/s, ${model})`,
      );
    if (p.accel_mps2 > lim.maxLongitudinal_mps2)
      p.warnings.push(
        `aceleração ${f1(p.accel_mps2)} m/s² acima do máximo longitudinal do modelo (${f1(lim.maxLongitudinal_mps2)} m/s², ${model})`,
      );
  }
  return { points: pts, length_m: length, warnings };
}
