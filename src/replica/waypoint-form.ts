// Janela Waypoint Edit (OP 3-26): formulário em unidades de exibição <-> waypoint do cenário (SI).
// D28: o campo Country da tela é o quinto parâmetro remoto (`state`).
import type { Scenario, UserWaypoint } from '../core/scenario/types';
import { formatNumber } from '../core/units';
import { displayDecimals, fromDisplay, toDisplay } from './display-units';
import { formatLatLon, parseLatLon } from './latlon';

export interface WaypointForm {
  code: string;
  icao: string;
  name: string;
  city: string;
  state: string;
  lat: string;
  lon: string;
  alt: string;
}

export function emptyWaypointForm(): WaypointForm {
  return { code: '', icao: '', name: '', city: '', state: '', lat: '', lon: '', alt: '0' };
}

export function waypointToForm(sc: Scenario, w: UserWaypoint): WaypointForm {
  const fmt = sc.display.latLonFormat;
  return {
    code: w.code,
    icao: w.icao,
    name: w.name,
    city: w.city,
    state: w.state,
    lat: formatLatLon(w.lat_rad, 'lat', fmt),
    lon: formatLatLon(w.lon_rad, 'lon', fmt),
    alt: formatNumber(toDisplay(w.alt_m, sc.setup.units, 'altitude'), displayDecimals('altitude')),
  };
}

export function formToWaypoint(
  sc: Scenario,
  f: WaypointForm,
): { waypoint: UserWaypoint } | { error: string } {
  if (f.code.trim() === '') return { error: 'código vazio' };
  const lat = parseLatLon(f.lat, 'lat');
  if ('error' in lat) return { error: `latitude: ${lat.error}` };
  const lon = parseLatLon(f.lon, 'lon');
  if ('error' in lon) return { error: `longitude: ${lon.error}` };
  const t = f.alt.trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { error: `altitude: número inválido "${t}"` };
  return {
    waypoint: {
      code: f.code.trim(),
      icao: f.icao.trim(),
      name: f.name.trim(),
      city: f.city.trim(),
      state: f.state.trim(),
      lat_rad: lat.rad,
      lon_rad: lon.rad,
      alt_m: fromDisplay(Number(t), sc.setup.units, 'altitude'),
    },
  };
}
