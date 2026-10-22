import { describe, expect, it } from 'vitest';
import { degToRad } from '../geo';
import { defaultScenario } from './defaults';
import { emitScenario, scenarioChecks, sortedActions } from './emit';
import { dynamicScenario } from './fixtures.test-util';
import { scenarioFromScript } from './from-script';
import type { Scenario } from './types';

function roundTrip(sc: Scenario): { a: string; b: string } {
  const a = emitScenario(sc);
  const back = scenarioFromScript(a.doc);
  return { a: a.text, b: emitScenario(back.scenario).text };
}

const errors = (sc: Scenario): string[] =>
  emitScenario(sc)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.message);

describe('emissor de cenário', () => {
  it('cenário padrão: sem diagnóstico, determinístico', () => {
    const r = emitScenario(defaultScenario());
    expect(r.diagnostics).toEqual([]);
    expect(emitScenario(defaultScenario()).text).toBe(r.text);
    expect(r.text).toMatchSnapshot();
  });

  it('cenário dinâmico completo: sem erro e com ordem canônica', () => {
    const r = emitScenario(dynamicScenario());
    expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(r.text).toMatchSnapshot();
    const lines = r.text.split('\n');
    const idx = (s: string): number => lines.findIndex((l) => l.startsWith(s));
    expect(idx('GPS:SET:UNIT SI')).toBeLessThan(idx('GPS:SET:GNSS'));
    expect(idx('GPS:SET:RFPR')).toBeLessThan(idx('GPS:SET:RFLV'));
    expect(idx('@pause ROUT:CLR')).toBe(idx('GPS:ROUT:CLR') - 1);
    expect(idx('@run')).toBeLessThan(idx('@at 12.5'));
    expect(r.text).not.toContain('GPS:SET:DAT');
    expect(r.text).toContain('# twin-channels: gnss=11 (D09: não emitido)');
  });

  it('ida e volta: cenários fixos', () => {
    for (const sc of [defaultScenario(), dynamicScenario()]) {
      const { a, b } = roundTrip(sc);
      expect(b).toBe(a);
    }
  });

  it('rota por arquivo com pontos adicionais', () => {
    const sc = dynamicScenario();
    sc.files.route = 'twin_r.rte';
    const r = emitScenario(sc);
    expect(r.text).toContain('GPS:FIL:ROUT:LOAD "twin_r.rte"');
    expect(r.text).not.toContain('GPS:ROUT:CLR');
    expect(roundTrip(sc).b).toBe(r.text);
  });

  it('trajetória, KML e almanaque não fixado', () => {
    const sc = defaultScenario();
    sc.setup.simulationType = 'TRAJECTORY';
    sc.files.nmea = 'twin_t.nme';
    sc.files.kml = 'twin_k.kml';
    sc.files.almanac = { kind: 'equipment' };
    const r = emitScenario(sc);
    expect(r.text).toContain('GPS:FIL:NMEA:LOAD "twin_t.nme"');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['almanac-not-fixed']);
    expect(roundTrip(sc).b).toBe(r.text);
  });

  it('posição de fonte GPS não é emitida', () => {
    const sc = defaultScenario();
    sc.setup.positionSource = 'GPS';
    expect(emitScenario(sc).text).not.toContain('GPS:SIM:LAT');
  });

  it('checagens de consistência', () => {
    const sc = defaultScenario();
    sc.name = 'Nome Invalido';
    sc.setup.rfPort = 'COUPLER';
    sc.setup.simulationType = 'DYNAMIC';
    sc.actions = [{ t_s: 50, type: 'rfLevel', level_dBm: -120 }];
    sc.run.stopAt_s = 10;
    expect(scenarioChecks(sc).map((d) => d.code)).toEqual([
      'scenario-invalid',
      'scenario-consistency',
      'scenario-consistency',
      'scenario-invalid',
    ]);
    const t = defaultScenario();
    t.setup.simulationType = 'TRAJECTORY';
    t.setup.digitalNoise = 'OFF';
    t.actions = [{ t_s: -1, type: 'rfLevel', level_dBm: -120 }];
    expect(scenarioChecks(t).map((d) => d.code)).toEqual([
      'scenario-consistency',
      'scenario-consistency',
      'scenario-invalid',
    ]);
  });

  it('valor fora da faixa aparece na releitura', () => {
    const sc = defaultScenario();
    sc.setup.rfLevel_dBm = -90;
    expect(errors(sc).join()).toMatch(/fora da faixa da porta DIRECT/);
    sc.setup.rfLevel_dBm = -158;
    sc.io.directCable_dB = 3.9;
    expect(errors(sc)).toEqual([]);
  });

  it('ordena ações de forma estável', () => {
    const a = { type: 'rfLevel' as const, level_dBm: -1 };
    expect(
      sortedActions([
        { ...a, t_s: 5, level_dBm: 1 },
        { ...a, t_s: 1 },
        { ...a, t_s: 5, level_dBm: 2 },
      ]).map((x) => x.t_s),
    ).toEqual([1, 5, 5]);
  });
});

// Gerador determinístico (mulberry32) para cenários válidos variados.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomScenario(seed: number): Scenario {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const between = (lo: number, hi: number): number => lo + r() * (hi - lo);
  const sc = defaultScenario();
  sc.name = `aleatorio_${seed}`;
  sc.setup.simulationType = pick(['STATIC', 'DYNAMIC', 'TRAJECTORY'] as const);
  sc.setup.rfPort = pick(['DIRECT', 'COUPLER'] as const);
  sc.setup.digitalNoise = sc.setup.rfPort === 'DIRECT' ? 'ON' : 'OFF';
  sc.setup.clock = pick(['USER', 'GPSRX'] as const);
  sc.setup.userTime_s = Math.floor(between(0, 2e9));
  sc.setup.fading = pick(['NONE', 'STATIC', 'PEDESTRIAN', 'VEHICLE', 'AIRCRAFT'] as const);
  sc.io = {
    coupler_dB: Math.round(between(0, 40) * 10) / 10,
    couplerCable_dB: Math.round(between(0, 12) * 10) / 10,
    directCable_dB: Math.round(between(0, 12) * 10) / 10,
    splitter_dB: Math.round(between(0, 10) * 10) / 10,
  };
  const loss =
    sc.setup.rfPort === 'COUPLER'
      ? sc.io.coupler_dB + sc.io.couplerCable_dB + sc.io.splitter_dB
      : sc.io.directCable_dB + sc.io.splitter_dB;
  const [lo, hi] = sc.setup.rfPort === 'COUPLER' ? [-130, -68] : [-155, -93];
  const shift = Math.floor(loss + 1e-9);
  sc.setup.rfLevel_dBm = Math.round(between(lo - shift, hi - shift));
  sc.position = {
    lat_rad: degToRad(between(-90, 90)),
    lon_rad: degToRad(between(-180, 180)),
    alt_m: between(-1000, 30000),
  };
  sc.motion.model = pick(['PEDESTRIAN', 'AUTOMOTIVE', 'CUSTOM', 'UNLIMITED'] as const);
  if (sc.motion.model === 'CUSTOM')
    sc.motion.custom = {
      maxLateral_mps2: between(1, 98),
      maxLongitudinal_mps2: between(1, 98),
      maxVelocity_mps: between(1, 514),
    };
  const n = Math.floor(between(0, 5));
  for (let i = 0; i < n; i++) {
    sc.route.points.push({
      kind: 'point',
      name: `twin_p${i}`,
      lat_rad: degToRad(between(-89, 89)),
      lon_rad: degToRad(between(-179, 179)),
      alt_m: between(0, 10000),
      climbRate_mps: between(-30, 30),
      speed_mps: between(0, 514),
      accel_mps2: between(-100, 100),
      turnRadius_m: between(0, 100000),
    });
  }
  if (sc.setup.simulationType === 'TRAJECTORY') sc.files.nmea = 'twin_t.nme';
  if (sc.setup.simulationType === 'DYNAMIC' && n === 0) sc.files.route = 'twin_r.rte';
  const k = Math.floor(between(0, 6));
  for (let i = 0; i < k; i++) {
    const gps = r() < 0.5;
    sc.actions.push({
      t_s: Math.round(between(0, 600) * 1000) / 1000,
      type: 'sv',
      constellation: gps ? 'GPS' : 'GAL',
      sv: 1 + Math.floor(between(0, gps ? 32 : 36)),
      select: pick(['ON', 'OFF'] as const),
      health: gps
        ? pick(['GOOD', 'BAD'] as const)
        : pick(['GOOD', 'BAD', 'CONNECTED', 'DISCONNECTED'] as const),
      doppler_Hz: Math.round(between(-5000, 5000)),
      incoherence_mps: between(-2, 2),
      ampOffset_dB: between(-15, 15),
      stepError_m: between(-1000, 1000),
      duration_s: Math.floor(between(1, 7200)),
    });
  }
  sc.run.stopAt_s = r() < 0.5 ? null : 700;
  return sc;
}

describe('ida e volta: cenários gerados', () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`semente ${seed}`, () => {
      const sc = randomScenario(seed);
      expect(errors(sc)).toEqual([]);
      const { a, b } = roundTrip(sc);
      expect(b).toBe(a);
    });
  }
});
