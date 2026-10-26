import { describe, expect, it } from 'vitest';
import { degToRad } from '../core/geo';
import { defaultScenario } from '../core/scenario/defaults';
import type { RoutePoint, Scenario } from '../core/scenario/types';
import { distance_m } from './route-checks';
import { routeEstimate, routePlan, type RouteEstimate } from './route-progress';
import { timelineEnd } from './state';

const D = degToRad;
const LEG = { climbRate_mps: 0, speed_mps: 53.64466666666667, accel_mps2: 0, turnRadius_m: 100 };

const pt = (name: string, lat: number, lon: number, alt: number, speed = LEG.speed_mps) =>
  ({
    kind: 'point',
    name,
    lat_rad: D(lat),
    lon_rad: D(lon),
    alt_m: alt,
    ...LEG,
    speed_mps: speed,
  }) satisfies RoutePoint;

// Pontos do exemplo do manual (OP D-5).
const HESKU = pt('HESKU', 37.14982222, -77.8842, 1524);
const RIVKE = pt('RIVKE', 38.24149167, -78.83963333, 1249.68);

function dyn(points: RoutePoint[], loop: 'ON' | 'OFF' = 'OFF'): Scenario {
  const sc = defaultScenario();
  sc.setup.simulationType = 'DYNAMIC';
  sc.route.points = points;
  sc.route.loop = loop;
  sc.run.stopAt_s = null;
  return sc;
}

function ok(e: RouteEstimate): Extract<RouteEstimate, { ok: true }> {
  if (!e.ok) throw new Error(e.reason);
  return e;
}

const dist = (e: { lat_rad: number; lon_rad: number }, p: RoutePoint & { kind: 'point' }) =>
  distance_m(e.lat_rad, e.lon_rad, p.lat_rad, p.lon_rad);

describe('routeEstimate: HESKU para RIVKE', () => {
  const sc = dyn([HESKU, RIVKE]);
  const plan = routePlan(sc);
  const L = distance_m(HESKU.lat_rad, HESKU.lon_rad, RIVKE.lat_rad, RIVKE.lon_rad);

  it('um trecho de ~147,7 km em ~46 min, velocidade do ponto de saída', () => {
    expect(plan?.legs).toHaveLength(1);
    expect(L).toBeCloseTo(147_700, -2);
    expect(plan?.lap_s).toBeCloseTo(L / LEG.speed_mps, 6);
    expect((plan?.lap_s ?? 0) / 60).toBeCloseTo(46, 0);
    expect(plan?.loop).toBe(false);
  });

  it('no início, no meio e no fim', () => {
    const lap = plan?.lap_s ?? 0;
    const a = ok(routeEstimate(sc, 0));
    expect(dist(a, HESKU)).toBeLessThan(1e-6);
    expect(a.alt_m).toBe(1524);
    expect(a.speed_mps).toBe(LEG.speed_mps);
    expect(a).toMatchObject({ leg: 0, legs: 1, from: 'HESKU', to: 'RIVKE', lap: 1 });
    expect(a.finished).toBe(false);
    // Rumo inicial para noroeste.
    expect(a.course_rad).toBeGreaterThan(1.5 * Math.PI);

    const m = ok(routeEstimate(sc, lap / 2));
    expect(dist(m, HESKU)).toBeCloseTo(L / 2, 3);
    expect(dist(m, RIVKE)).toBeCloseTo(L / 2, 3);
    expect(m.alt_m).toBeCloseTo((1524 + 1249.68) / 2, 9);

    const z = ok(routeEstimate(sc, lap));
    expect(dist(z, RIVKE)).toBeLessThan(1e-3);
    expect(z.alt_m).toBeCloseTo(1249.68, 9);
    expect(z.finished).toBe(true);
    expect(z.speed_mps).toBe(0);
    // Rumo de chegada mantido depois do fim.
    expect(z.course_rad).toBeCloseTo(ok(routeEstimate(sc, lap - 1e-3)).course_rad, 5);
  });

  it('sem loop: parado no último ponto depois do fim', () => {
    const e = ok(routeEstimate(sc, 10 * (plan?.lap_s ?? 0)));
    expect(dist(e, RIVKE)).toBeLessThan(1e-3);
    expect(e).toMatchObject({ finished: true, speed_mps: 0, lap: 1 });
  });

  it('@stop congela a posição', () => {
    const st = structuredClone(sc);
    st.run.stopAt_s = 600;
    const at = ok(routeEstimate(st, 600));
    const after = ok(routeEstimate(st, 1200));
    expect(after.stopped).toBe(true);
    expect(after.speed_mps).toBe(0);
    expect(after.lat_rad).toBe(at.lat_rad);
    expect(after.lon_rad).toBe(at.lon_rad);
    expect(dist(at, HESKU)).toBeCloseTo(600 * LEG.speed_mps, 3);
  });

  it('eixo da linha do tempo cobre a rota', () => {
    expect(timelineEnd(sc)).toBeCloseTo((plan?.lap_s ?? 0) * 1.05, 6);
    const st = structuredClone(sc);
    st.run.stopAt_s = 100;
    expect(timelineEnd(st)).toBe(105);
    const stat = structuredClone(sc);
    stat.setup.simulationType = 'STATIC';
    expect(timelineEnd(stat)).toBe(60);
  });
});

describe('routeEstimate: loop e trechos', () => {
  // Triângulo no equador: 0,01° de lado em latitude e longitude, velocidades diferentes por ponto.
  const A = pt('A', 0, 0, 0, 10);
  const B = pt('B', 0.01, 0, 100, 20);
  const C = pt('C', 0.01, 0.01, 100, 5);

  it('loop: volta ao primeiro ponto e repete', () => {
    const sc = dyn([A, B, C], 'ON');
    const plan = routePlan(sc);
    expect(plan?.legs.map((l) => `${l.from}-${l.to}`)).toEqual(['A-B', 'B-C', 'C-A']);
    const [ab, bc, ca] = plan?.legs ?? [];
    expect(ab?.duration_s).toBeCloseTo((ab?.length_m ?? 0) / 10, 9);
    expect(bc?.duration_s).toBeCloseTo((bc?.length_m ?? 0) / 20, 9);
    expect(ca?.duration_s).toBeCloseTo((ca?.length_m ?? 0) / 5, 9);
    const lap = plan?.lap_s ?? 0;

    const inBC = ok(routeEstimate(sc, (bc?.start_s ?? 0) + 1));
    expect(inBC).toMatchObject({ leg: 1, from: 'B', to: 'C', speed_mps: 20, lap: 1 });
    expect(inBC.alt_m).toBe(100);
    expect(dist(inBC, B)).toBeCloseTo(20, 6);

    const back = ok(routeEstimate(sc, (ca?.start_s ?? 0) + (ca?.duration_s ?? 0) / 2));
    expect(back).toMatchObject({ leg: 2, from: 'C', to: 'A', speed_mps: 5 });
    expect(back.alt_m).toBeCloseTo(50, 9);

    const second = ok(routeEstimate(sc, lap + 1));
    expect(second).toMatchObject({ leg: 0, lap: 2, finished: false, loop: true });
    expect(dist(second, A)).toBeCloseTo(10, 6);
    expect(timelineEnd(sc)).toBeCloseTo(lap * 1.05, 6);
  });

  it('loop com dois pontos: ida e volta', () => {
    const plan = routePlan(dyn([A, B], 'ON'));
    expect(plan?.legs.map((l) => `${l.from}-${l.to}`)).toEqual(['A-B', 'B-A']);
  });

  it('pontos repetidos: trecho de comprimento zero saltado', () => {
    const sc = dyn([A, A, B]);
    const plan = routePlan(sc);
    expect(plan?.legs[0]?.duration_s).toBe(0);
    const e = ok(routeEstimate(sc, 0));
    expect(e).toMatchObject({ leg: 1, from: 'A', to: 'B' });
    const same = dyn([A, A]);
    expect(ok(routeEstimate(same, 5))).toMatchObject({ finished: true, speed_mps: 0 });
    expect(ok(routeEstimate(dyn([A, A], 'ON'), 5))).toMatchObject({ finished: false, lap: 1 });
    expect(timelineEnd(same)).toBe(60);
  });
});

describe('routeEstimate: sem estimativa', () => {
  const reason = (sc: Scenario, t = 0): string => {
    const e = routeEstimate(sc, t);
    return e.ok ? '' : e.reason;
  };

  it('motivos', () => {
    const stat = dyn([HESKU, RIVKE]);
    stat.setup.simulationType = 'STATIC';
    expect(reason(stat)).toMatch(/Dynamic/);

    const file = dyn([HESKU, RIVKE]);
    file.files.route = 'twin_rota.rte';
    expect(reason(file)).toMatch(/arquivo twin_rota\.rte/);

    expect(reason(dyn([HESKU]))).toMatch(/menos de dois/);
    expect(reason(dyn([]))).toMatch(/menos de dois/);

    const wp = dyn([HESKU, { kind: 'waypoint', code: 'XPTO1', ...LEG }]);
    expect(reason(wp)).toMatch(/sem coordenadas.*XPTO1/);
    // Waypoint do usuário com coordenadas no twin é resolvido.
    wp.userWaypoints = [
      {
        code: 'XPTO1',
        icao: '',
        name: 'XPTO1',
        city: '',
        state: '',
        lat_rad: RIVKE.lat_rad,
        lon_rad: RIVKE.lon_rad,
        alt_m: 0,
      },
    ];
    expect(routeEstimate(wp, 0).ok).toBe(true);

    expect(reason(dyn([pt('A', 0, 0, 0, 0), pt('B', 0.01, 0, 0)]))).toMatch(/velocidade zero.*A/);
    expect(routePlan(stat)).toBeNull();
  });
});
