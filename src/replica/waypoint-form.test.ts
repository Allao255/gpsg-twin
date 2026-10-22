import { describe, expect, it } from 'vitest';
import { degToRad } from '../core/geo';
import { defaultScenario } from '../core/scenario/defaults';
import type { UserWaypoint } from '../core/scenario/types';
import { emptyWaypointForm, formToWaypoint, waypointToForm } from './waypoint-form';

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

describe('waypoint-form', () => {
  it('ida e volta com altitude em ft (IMPERIAL)', () => {
    const s = defaultScenario();
    const f = waypointToForm(s, MCI);
    expect(f.alt).toBe('1000');
    expect(f.state).toBe('MO');
    const r = formToWaypoint(s, f);
    if ('error' in r) throw new Error(r.error);
    expect(r.waypoint.code).toBe('MCI');
    expect(r.waypoint.alt_m).toBeCloseTo(304.8, 9);
    expect(r.waypoint.lat_rad).toBeCloseTo(MCI.lat_rad, 9);
  });

  it('campos de texto aparados; altitude em m no modo SI', () => {
    const s = defaultScenario();
    s.setup.units = 'SI';
    const r = formToWaypoint(s, {
      ...emptyWaypointForm(),
      code: ' P1 ',
      name: ' Ponto ',
      lat: '10 N',
      lon: '20 W',
      alt: '12.5',
    });
    expect(r).toEqual({
      waypoint: {
        code: 'P1',
        icao: '',
        name: 'Ponto',
        city: '',
        state: '',
        lat_rad: degToRad(10),
        lon_rad: degToRad(-20),
        alt_m: 12.5,
      },
    });
  });

  it('erros', () => {
    const s = defaultScenario();
    const base = { ...emptyWaypointForm(), code: 'P', lat: '1', lon: '2' };
    expect(formToWaypoint(s, { ...base, code: '' })).toEqual({ error: 'código vazio' });
    expect(formToWaypoint(s, { ...base, lat: 'x' })).toHaveProperty(
      'error',
      expect.stringMatching(/^latitude/),
    );
    expect(formToWaypoint(s, { ...base, lon: '200' })).toHaveProperty(
      'error',
      expect.stringMatching(/^longitude/),
    );
    expect(formToWaypoint(s, { ...base, alt: '1,5' })).toHaveProperty(
      'error',
      expect.stringMatching(/^altitude/),
    );
  });
});
