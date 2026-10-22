import { describe, expect, it } from 'vitest';
import { degToRad } from '../core/geo';
import { defaultScenario } from '../core/scenario/defaults';
import type { RoutePoint, Scenario, UserWaypoint } from '../core/scenario/types';
import {
  formToPoint,
  newRouteForm,
  pointToForm,
  ROUTE_COLUMNS,
  routeRows,
  type RouteForm,
} from './route-form';

const MCI: UserWaypoint = {
  code: 'MCI',
  icao: 'KMCI',
  name: 'Kansas City Intl',
  city: 'Kansas City',
  state: 'MO',
  lat_rad: degToRad(39.2976),
  lon_rad: degToRad(-94.7139),
  alt_m: 304.8,
};

function sc(units: Scenario['setup']['units'] = 'IMPERIAL'): Scenario {
  const s = defaultScenario();
  s.setup.units = units;
  s.display.latLonFormat = 'DD.DD';
  s.userWaypoints = [MCI];
  return s;
}

function point(s: Scenario, f: RouteForm): RoutePoint {
  const r = formToPoint(s, f);
  if ('error' in r) throw new Error(r.error);
  return r.point;
}

const LEG = { climb: '500', speed: '500', accel: '100', radius: '5000' };

describe('formToPoint', () => {
  it('ponto livre em IMPERIAL vira SI', () => {
    const p = point(sc(), {
      ...newRouteForm(sc()),
      ...LEG,
      name: 'P1',
      lat: '4.444 N',
      lon: '102.4533 E',
      alt: '1000',
    });
    expect(p.kind).toBe('point');
    if (p.kind !== 'point') return;
    expect(p.name).toBe('P1');
    expect(p.lat_rad).toBeCloseTo(degToRad(4.444), 12);
    expect(p.alt_m).toBeCloseTo(304.8, 9);
    expect(p.climbRate_mps).toBeCloseTo(2.54, 9);
    expect(p.speed_mps).toBeCloseTo(223.52, 9);
    expect(p.accel_mps2).toBeCloseTo(30.48, 9);
    expect(p.turnRadius_m).toBeCloseTo(1524, 9);
  });

  it('waypoint do banco: só código e trecho', () => {
    const p = point(sc('SI'), { ...newRouteForm(sc(), { code: 'SFO' }), ...LEG });
    expect(p).toEqual({
      kind: 'waypoint',
      code: 'SFO',
      climbRate_mps: 500 / 60,
      speed_mps: 500 / 3.6,
      accel_mps2: 100,
      turnRadius_m: 5000,
    });
  });

  it('erros', () => {
    const base = { ...newRouteForm(sc()), name: 'P', lat: '1', lon: '2' };
    const err = (f: RouteForm): string => {
      const r = formToPoint(sc(), f);
      return 'error' in r ? r.error : '';
    };
    expect(err({ ...base, speed: 'x' })).toMatch(/speed: número inválido/);
    expect(err({ ...base, name: ' ' })).toMatch(/nome vazio/);
    expect(err({ ...base, lat: '95' })).toMatch(/^latitude/);
    expect(err({ ...base, lon: '1 2 3 4' })).toMatch(/^longitude/);
    expect(err({ ...base, alt: '' })).toMatch(/altitude: número inválido/);
  });
});

describe('pointToForm e newRouteForm', () => {
  it('ida e volta de ponto livre', () => {
    const s = sc();
    const f = { ...newRouteForm(s), ...LEG, name: 'P1', lat: '-4.444', lon: '102.5', alt: '900' };
    const back = pointToForm(s, point(s, f));
    expect(back).toEqual({ ...f, lat: '4.444000° S', lon: '102.500000° E' });
  });

  it('waypoint do usuário mostra coordenadas; do banco, em branco', () => {
    const s = sc();
    const user = pointToForm(s, point(s, { ...newRouteForm(s, MCI), ...LEG }));
    expect(user.lat).toBe('39.297600° N');
    expect(user.alt).toBe('1000');
    const bank = pointToForm(s, point(s, { ...newRouteForm(s, { code: 'SFO' }), ...LEG }));
    expect([bank.lat, bank.lon, bank.alt]).toEqual(['', '', '']);
  });

  it('formulário novo a partir de waypoint armazenado', () => {
    const f = newRouteForm(sc(), MCI);
    expect(f).toMatchObject({ kind: 'waypoint', name: 'MCI', lat: '39.297600° N', alt: '1000' });
    expect(newRouteForm(sc()).kind).toBe('point');
  });
});

describe('routeRows', () => {
  it('uma linha por ponto, colunas da tela', () => {
    const s = sc();
    s.route.points = [
      point(s, { ...newRouteForm(s, MCI), ...LEG }),
      point(s, { ...newRouteForm(s, { code: 'SFO' }), ...LEG }),
    ];
    const rows = routeRows(s);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(ROUTE_COLUMNS.length);
    expect(rows[0]?.slice(0, 2)).toEqual(['1', 'MCI']);
    expect(rows[1]?.slice(0, 2)).toEqual(['2', 'SFO']);
    expect(rows[1]?.slice(5)).toEqual(['500', '500', '100', '5000']);
  });
});
