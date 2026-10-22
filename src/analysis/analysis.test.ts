import { describe, expect, it } from 'vitest';
import { routeFromXml } from '../core/files/route-xml';
import { degToRad } from '../core/geo';
import { levelBudget } from '../core/scenario/budget';
import { defaultScenario } from '../core/scenario/defaults';
import type { Scenario } from '../core/scenario/types';
import { parseScript } from '../core/script/parse';
import { analysisEvents } from './events';
import { bearing, checkRoute, distance_m } from './route-checks';
import { actionSvs, stateAt, timelineEnd } from './state';

const D = degToRad;
const LEG = { climbRate_mps: 0, speed_mps: 50, accel_mps2: 2, turnRadius_m: 100 };

describe('geodésia', () => {
  it('distância e rumo por grande círculo', () => {
    // 1° de latitude no equador: ~111,195 km na esfera de raio médio.
    expect(distance_m(0, 0, D(1), 0)).toBeCloseTo(111195.08, 1);
    expect(bearing(0, 0, D(1), 0)).toBeCloseTo(0, 12);
    expect(bearing(0, 0, 0, D(1))).toBeCloseTo(Math.PI / 2, 12);
    expect(bearing(0, 0, 0, D(-1))).toBeCloseTo(1.5 * Math.PI, 12);
  });
});

describe('checkRoute', () => {
  // Rota do exemplo do manual (OP D-5): sem aviso no modelo Unlimited.
  const OP_D5 = `<Route>
<Waypoint Longitude="-77.88420000000001" MaxAcceleration="0" MaxClimbRate="0" Name="HESKU" Latitude="37.14982222222222" Altitude="1524" TargetSpeed="53.64466666666667" TurningCircleRadius="108.5658611334349"/>
<Waypoint Longitude="-78.80005277777778" MaxAcceleration="0" MaxClimbRate="0" Name="RFLAT" Latitude="38.20028888888889" Altitude="1524" TargetSpeed="53.64466666666667" TurningCircleRadius="131.3646919714563"/>
<Waypoint Longitude="-78.83963333333332" MaxAcceleration="9.800000000000001" MaxClimbRate="-3.048" Name="RIVKE" Latitude="38.24149166666667" Altitude="1249.68" TargetSpeed="53.64466666666667" TurningCircleRadius="100"/>
</Route>`;

  it('rota do manual: distâncias e nenhum aviso', () => {
    const sc = defaultScenario();
    sc.route.points = routeFromXml(OP_D5).points;
    const r = checkRoute(sc);
    expect(r.warnings).toEqual([]);
    expect(r.points.flatMap((p) => p.warnings)).toEqual([]);
    expect(r.points[0]?.next_m).toBeCloseTo(142_000, -4);
    expect(r.points[2]?.next_m).toBeNull();
    expect(r.length_m).toBeCloseTo((r.points[0]?.next_m ?? 0) + (r.points[1]?.next_m ?? 0), 6);
  });

  it('avisos: 4 raios, v²/a, velocidade e aceleração do modelo, loop', () => {
    const sc: Scenario = defaultScenario();
    sc.motion = { model: 'PEDESTRIAN', custom: null };
    sc.route.loop = 'ON';
    sc.route.points = [
      { kind: 'point', name: 'A', lat_rad: 0, lon_rad: 0, alt_m: 0, ...LEG, accel_mps2: 5 },
      { kind: 'point', name: 'B', lat_rad: D(0.003), lon_rad: 0, alt_m: 0, ...LEG },
      {
        kind: 'point',
        name: 'C',
        lat_rad: D(0.003),
        lon_rad: D(0.01),
        alt_m: 0,
        ...LEG,
        speed_mps: 1,
        accel_mps2: 1,
        turnRadius_m: 0,
      },
    ];
    const r = checkRoute(sc);
    const a = r.points[0]?.warnings ?? [];
    expect(a.some((w) => w.startsWith('trecho A -> B com 333.6 m, não maior que 4 raios'))).toBe(
      true,
    );
    expect(a).toContain('raio de curva 100 m menor que v²/a = 850.3 m (PEDESTRIAN)');
    expect(a).toContain('velocidade 50 m/s acima do máximo do modelo (10.7 m/s, PEDESTRIAN)');
    expect(a).toContain(
      'aceleração 5 m/s² acima do máximo longitudinal do modelo (2.9 m/s², PEDESTRIAN)',
    );
    // Loop fecha C -> A; C sem raio de curva não gera aviso de raio.
    expect(r.points[2]?.next_m).toBeGreaterThan(0);
    expect(r.points[2]?.warnings).toEqual([]);
    sc.motion = {
      model: 'CUSTOM',
      custom: { maxLateral_mps2: 100, maxLongitudinal_mps2: 100, maxVelocity_mps: 100 },
    };
    expect(checkRoute(sc).points[0]?.warnings.some((w) => w.includes('Custom editado'))).toBe(
      false,
    );
  });

  it('waypoint do banco e rota de um ponto', () => {
    const sc = defaultScenario();
    sc.route.points = [{ kind: 'waypoint', code: 'SFO', ...LEG }];
    const r = checkRoute(sc);
    expect(r.warnings).toEqual([
      'rota com um ponto só',
      'waypoints do banco do equipamento sem coordenadas no twin: SFO',
    ]);
    expect(r.points[0]?.lat_rad).toBeNull();
    sc.userWaypoints = [
      { code: 'SFO', icao: '', name: '', city: '', state: '', lat_rad: 1, lon_rad: 1, alt_m: 3 },
    ];
    expect(checkRoute(sc).points[0]).toMatchObject({ lat_rad: 1, alt_m: 3 });
  });
});

describe('stateAt', () => {
  const sc = defaultScenario();
  sc.actions = [
    {
      t_s: 10,
      type: 'sv',
      constellation: 'GPS',
      sv: 5,
      select: 'ON',
      health: 'GOOD',
      doppler_Hz: 50,
      incoherence_mps: 0,
      ampOffset_dB: 0,
      stepError_m: 0,
      duration_s: 20,
    },
    { t_s: 20, type: 'rfLevel', level_dBm: -125 },
    {
      t_s: 40,
      type: 'sv',
      constellation: 'GAL',
      sv: 3,
      select: 'OFF',
      health: 'CONNECTED',
      doppler_Hz: 0,
      incoherence_mps: 0,
      ampOffset_dB: 0,
      stepError_m: 0,
      duration_s: 3600,
    },
  ];
  sc.run.stopAt_s = 60;

  it('RF Level e SVs ao longo do tempo; Doppler expira com a duração (D18)', () => {
    expect(actionSvs(sc)).toEqual([
      { constellation: 'GAL', sv: 3 },
      { constellation: 'GPS', sv: 5 },
    ]);
    const s0 = stateAt(sc, 5);
    expect([s0.rfLevel_dBm, s0.rfLevelSince_s, s0.svs.some((x) => x.manipulated)]).toEqual([
      -120,
      null,
      false,
    ]);
    const s1 = stateAt(sc, 15);
    expect(s1.svs.find((x) => x.sv === 5)).toMatchObject({ doppler_Hz: 50, manipulated: true });
    const s2 = stateAt(sc, 35);
    expect(s2.rfLevel_dBm).toBe(-125);
    expect(s2.rfLevelSince_s).toBe(20);
    expect(s2.svs.find((x) => x.sv === 5)).toMatchObject({ doppler_Hz: 0, manipulated: false });
    expect(stateAt(sc, 45).svs.find((x) => x.sv === 3)?.manipulated).toBe(true);
    expect(stateAt(sc, 61).running).toBe(false);
    expect(stateAt(sc, 60).running).toBe(true);
  });

  it('fim do eixo', () => {
    expect(timelineEnd(defaultScenario())).toBe(60);
    expect(timelineEnd(sc)).toBeCloseTo(63, 6);
    const open = structuredClone(sc);
    open.run.stopAt_s = null;
    // Sem @stop: Doppler de 50 Hz em t = 10 s por 20 s; ação em 40 s.
    expect(timelineEnd(open)).toBeCloseTo(60, 6);
    open.actions = [{ t_s: 100, type: 'rfLevel', level_dBm: -120 }];
    expect(timelineEnd(open)).toBeCloseTo(105, 6);
  });
});

describe('levelBudget', () => {
  it('DIRECT e COUPLER com perdas (D17)', () => {
    const sc = defaultScenario();
    const d = levelBudget(sc);
    expect([d.range_dBm, d.inRange, d.atAntenna_dBm]).toEqual([[-155, -93], true, null]);
    expect(d.composite_dBm(12)).toBeCloseTo(-109.208, 3);
    sc.setup.rfPort = 'COUPLER';
    sc.io = { coupler_dB: 0, couplerCable_dB: 2.5, directCable_dB: 0, splitter_dB: 1 };
    const c = levelBudget(sc, -60);
    expect([c.loss_dB, c.range_dBm, c.inRange, c.atAntenna_dBm]).toEqual([
      3.5,
      [-133, -71],
      false,
      -84,
    ]);
  });
});

describe('analysisEvents', () => {
  it('configuração sem instante, execução com instante, alvo na réplica', () => {
    const doc = parseScript(
      [
        'GPS:SET:RFPR DIRECT',
        'GPS:ROUT:CLR',
        'GPS:WAYP:LIST?',
        'GPS:FIL:ALM:DEF',
        ':SYST:ERR?',
        '@run',
        '@at 5',
        'GPS:SVPR:GPS:SAT 7,ON,BAD,0,0,0,0,3600',
        'GPS:SVPR:GAL:LIST?',
        '@pause x',
        'GPS:SET:RFLV -125',
        '@stop',
        '@run',
        'GPS:SET:RFLV -100',
      ].join('\n'),
    );
    const ev = analysisEvents(doc);
    expect(ev.map((e) => [e.line, e.t_s, e.exact, e.kind, e.target])).toEqual([
      [1, null, true, 'command', { kind: 'field', id: 'setup.rfPort' }],
      [2, null, true, 'command', { kind: 'window', win: 'route' }],
      [3, null, true, 'query', { kind: 'window', win: 'waypoint' }],
      [4, null, true, 'command', { kind: 'window', win: 'file' }],
      [5, null, true, 'query', null],
      [6, 0, true, 'run', null],
      [8, 5, true, 'command', { kind: 'sv', constellation: 'GPS', sv: 7 }],
      [9, 5, true, 'query', { kind: 'window', win: 'svprn' }],
      [10, 5, true, 'pause', null],
      [11, 5, false, 'command', { kind: 'field', id: 'setup.rfLevel' }],
      [12, 5, false, 'stop', null],
    ]);
  });
});
