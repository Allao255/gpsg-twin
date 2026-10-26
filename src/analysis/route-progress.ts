// Posição estimada do receptor numa rota Dynamic, no instante t desde o @run. Estimativa de baixa
// fidelidade, só para a aba Análise: trechos de grande círculo entre pontos, velocidade constante no
// trecho igual à do ponto de saída, altitude interpolada linearmente; sem curvas (raio de curva),
// sem aceleração e sem razão de subida. Não reproduz o caminho do equipamento (cinemática de alta
// fidelidade fora do escopo, 00-visao-geral.md).
// Loop ON: depois do último ponto volta ao primeiro (trecho de fechamento, também com dois pontos) e
// repete. Loop OFF: para no último ponto. Comportamento no fim da rota não verificado em bancada.
import type { Scenario } from '../core/scenario/types';
import {
  bearing,
  checkRoute,
  distance_m,
  EARTH_RADIUS_M,
  type RoutePointView,
} from './route-checks';

interface Fix {
  name: string;
  lat_rad: number;
  lon_rad: number;
  alt_m: number;
  speed_mps: number;
}

export interface RouteLegPlan {
  from: string;
  to: string;
  length_m: number;
  speed_mps: number;
  /** Instante de partida dentro da volta, s. */
  start_s: number;
  duration_s: number;
}

export interface RoutePlan {
  legs: RouteLegPlan[];
  /** Duração de uma volta (ou da rota inteira, sem loop), s. */
  lap_s: number;
  loop: boolean;
}

export type RouteEstimate =
  | {
      ok: true;
      lat_rad: number;
      lon_rad: number;
      alt_m: number;
      /** 0 depois do fim da rota (sem loop) ou do @stop. */
      speed_mps: number;
      /** Rumo do trecho no instante, rad (0 = norte, sentido horário). */
      course_rad: number;
      /** Índice do trecho (0 = do primeiro ao segundo ponto). */
      leg: number;
      legs: number;
      from: string;
      to: string;
      /** Volta corrente, a partir de 1. */
      lap: number;
      loop: boolean;
      /** Rota terminada (sem loop): parado no último ponto. */
      finished: boolean;
      /** Depois do @stop: posição congelada no instante do @stop. */
      stopped: boolean;
    }
  | { ok: false; reason: string };

type Plan = { ok: true; plan: RoutePlan; fixes: Fix[] } | { ok: false; reason: string };

function known(p: RoutePointView): Fix | null {
  if (p.lat_rad === null || p.lon_rad === null) return null;
  return {
    name: p.name,
    lat_rad: p.lat_rad,
    lon_rad: p.lon_rad,
    alt_m: p.alt_m ?? 0,
    speed_mps: p.speed_mps,
  };
}

function plan(sc: Scenario): Plan {
  if (sc.setup.simulationType !== 'DYNAMIC')
    return { ok: false, reason: 'só com Simulation = Dynamic' };
  if (sc.files.route !== null)
    return { ok: false, reason: `rota lida do arquivo ${sc.files.route} no equipamento` };
  const pts = checkRoute(sc).points;
  if (pts.length < 2) return { ok: false, reason: 'rota com menos de dois pontos' };
  const fixes = pts.map(known);
  const unknown = pts.filter((_, i) => fixes[i] === null).map((p) => p.name);
  if (unknown.length > 0)
    return {
      ok: false,
      reason: `pontos do banco do equipamento sem coordenadas no twin: ${unknown.join(', ')}`,
    };
  const fx = fixes as Fix[];
  const loop = sc.route.loop === 'ON';
  const n = fx.length;
  const legs: RouteLegPlan[] = [];
  let start = 0;
  for (let i = 0; i < (loop ? n : n - 1); i++) {
    const a = fx[i] as Fix;
    const b = fx[(i + 1) % n] as Fix;
    const length = distance_m(a.lat_rad, a.lon_rad, b.lat_rad, b.lon_rad);
    if (length > 0 && !(a.speed_mps > 0))
      return { ok: false, reason: `velocidade zero no ponto ${a.name}` };
    const duration = length > 0 ? length / a.speed_mps : 0;
    legs.push({
      from: a.name,
      to: b.name,
      length_m: length,
      speed_mps: a.speed_mps,
      start_s: start,
      duration_s: duration,
    });
    start += duration;
  }
  return { ok: true, plan: { legs, lap_s: start, loop }, fixes: fx };
}

/** Trechos e duração de uma volta, ou null quando não há estimativa. */
export function routePlan(sc: Scenario): RoutePlan | null {
  const p = plan(sc);
  return p.ok ? p.plan : null;
}

/** Ponto a uma fração f do grande círculo de a a b. */
function along(a: Fix, b: Fix, f: number): { lat_rad: number; lon_rad: number } {
  const d = distance_m(a.lat_rad, a.lon_rad, b.lat_rad, b.lon_rad) / EARTH_RADIUS_M;
  if (d < 1e-12) return { lat_rad: a.lat_rad, lon_rad: a.lon_rad };
  const ka = Math.sin((1 - f) * d) / Math.sin(d);
  const kb = Math.sin(f * d) / Math.sin(d);
  const x =
    ka * Math.cos(a.lat_rad) * Math.cos(a.lon_rad) + kb * Math.cos(b.lat_rad) * Math.cos(b.lon_rad);
  const y =
    ka * Math.cos(a.lat_rad) * Math.sin(a.lon_rad) + kb * Math.cos(b.lat_rad) * Math.sin(b.lon_rad);
  const z = ka * Math.sin(a.lat_rad) + kb * Math.sin(b.lat_rad);
  return { lat_rad: Math.atan2(z, Math.hypot(x, y)), lon_rad: Math.atan2(y, x) };
}

export function routeEstimate(sc: Scenario, t_s: number): RouteEstimate {
  const p = plan(sc);
  if (!p.ok) return p;
  const { legs, lap_s, loop } = p.plan;
  const n = p.fixes.length;
  const stop = sc.run.stopAt_s;
  const stopped = stop !== null && t_s > stop;
  const tt = Math.max(0, stopped ? stop : t_s);
  let lap = 1;
  let r = tt;
  let finished = false;
  if (lap_s <= 0) finished = !loop;
  else if (loop) {
    lap = Math.floor(tt / lap_s) + 1;
    r = tt - (lap - 1) * lap_s;
  } else if (tt >= lap_s) finished = true;

  // Último trecho com duração que já começou (trechos de comprimento zero são saltados).
  let k = finished ? legs.length - 1 : 0;
  if (!finished)
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i] as RouteLegPlan;
      if (l.duration_s > 0 && l.start_s <= r) k = i;
    }
  const leg = legs[k] as RouteLegPlan;
  const f = finished ? 1 : leg.duration_s > 0 ? Math.min(1, (r - leg.start_s) / leg.duration_s) : 0;
  const a = p.fixes[k] as Fix;
  const b = p.fixes[(k + 1) % n] as Fix;
  const pos = along(a, b, f);
  const course =
    f < 1
      ? bearing(pos.lat_rad, pos.lon_rad, b.lat_rad, b.lon_rad)
      : (bearing(b.lat_rad, b.lon_rad, a.lat_rad, a.lon_rad) + Math.PI) % (2 * Math.PI);
  return {
    ok: true,
    ...pos,
    alt_m: a.alt_m + f * (b.alt_m - a.alt_m),
    speed_mps: finished || stopped ? 0 : leg.speed_mps,
    course_rad: course,
    leg: k,
    legs: legs.length,
    from: leg.from,
    to: leg.to,
    lap,
    loop,
    finished,
    stopped,
  };
}
