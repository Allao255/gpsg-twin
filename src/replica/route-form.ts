// Janela Route Edit (OP 3-21): conversão entre o formulário (unidades de exibição) e o ponto de
// rota do cenário (SI), e linhas da tabela da janela Route.
import type { RoutePoint, Scenario, UserWaypoint } from '../core/scenario/types';
import { formatNumber } from '../core/units';
import { displayDecimals, fromDisplay, toDisplay, type DisplayQuantity } from './display-units';
import { formatLatLon, parseLatLon } from './latlon';

export interface RouteForm {
  /** 'point': ponto livre (ROUT:ADD:POIN); 'waypoint': código do banco (ROUT:ADD:WAYP). */
  kind: 'point' | 'waypoint';
  name: string;
  lat: string;
  lon: string;
  alt: string;
  climb: string;
  speed: string;
  accel: string;
  radius: string;
}

const LEG: readonly [keyof RouteForm, DisplayQuantity, keyof RoutePoint][] = [
  ['climb', 'climb', 'climbRate_mps'],
  ['speed', 'speed', 'speed_mps'],
  ['accel', 'accel', 'accel_mps2'],
  ['radius', 'radius', 'turnRadius_m'],
];

function num(text: string, what: string): number | string {
  const t = text.trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return `${what}: número inválido "${t}"`;
  return Number(t);
}

/** Formulário -> ponto de rota em SI. A faixa é validada depois pelo modelo (routeInsert). */
export function formToPoint(sc: Scenario, f: RouteForm): { point: RoutePoint } | { error: string } {
  const mode = sc.setup.units;
  const leg: Record<string, number> = {};
  for (const [key, q, out] of LEG) {
    const v = num(f[key], key);
    if (typeof v === 'string') return { error: v };
    leg[out] = fromDisplay(v, mode, q);
  }
  const l = {
    climbRate_mps: leg.climbRate_mps ?? 0,
    speed_mps: leg.speed_mps ?? 0,
    accel_mps2: leg.accel_mps2 ?? 0,
    turnRadius_m: leg.turnRadius_m ?? 0,
  };
  const name = f.name.trim();
  if (name === '') return { error: 'nome vazio' };
  if (f.kind === 'waypoint') return { point: { kind: 'waypoint', code: name, ...l } };
  const lat = parseLatLon(f.lat, 'lat');
  if ('error' in lat) return { error: `latitude: ${lat.error}` };
  const lon = parseLatLon(f.lon, 'lon');
  if ('error' in lon) return { error: `longitude: ${lon.error}` };
  const alt = num(f.alt, 'altitude');
  if (typeof alt === 'string') return { error: alt };
  return {
    point: {
      kind: 'point',
      name,
      lat_rad: lat.rad,
      lon_rad: lon.rad,
      alt_m: fromDisplay(alt, mode, 'altitude'),
      ...l,
    },
  };
}

function out(sc: Scenario, si: number, q: DisplayQuantity): string {
  return formatNumber(toDisplay(si, sc.setup.units, q), displayDecimals(q));
}

/** Ponto do cenário -> formulário, para edição. Waypoint do banco sem coordenadas conhecidas. */
export function pointToForm(sc: Scenario, p: RoutePoint): RouteForm {
  const wp = p.kind === 'waypoint' ? sc.userWaypoints.find((w) => w.code === p.code) : undefined;
  const fmt = sc.display.latLonFormat;
  return {
    kind: p.kind,
    name: p.kind === 'point' ? p.name : p.code,
    lat:
      p.kind === 'point'
        ? formatLatLon(p.lat_rad, 'lat', fmt)
        : wp
          ? formatLatLon(wp.lat_rad, 'lat', fmt)
          : '',
    lon:
      p.kind === 'point'
        ? formatLatLon(p.lon_rad, 'lon', fmt)
        : wp
          ? formatLatLon(wp.lon_rad, 'lon', fmt)
          : '',
    alt:
      p.kind === 'point' ? out(sc, p.alt_m, 'altitude') : wp ? out(sc, wp.alt_m, 'altitude') : '',
    climb: out(sc, p.climbRate_mps, 'climb'),
    speed: out(sc, p.speed_mps, 'speed'),
    accel: out(sc, p.accel_mps2, 'accel'),
    radius: out(sc, p.turnRadius_m, 'radius'),
  };
}

/** Formulário novo a partir de um waypoint (Stored Waypoints, Next) ou vazio. */
export function newRouteForm(sc: Scenario, w?: UserWaypoint | { code: string }): RouteForm {
  const blank: RouteForm = {
    kind: 'point',
    name: '',
    lat: '',
    lon: '',
    alt: '0',
    climb: '0',
    speed: '0',
    accel: '0',
    radius: '0',
  };
  if (!w) return blank;
  if (!('lat_rad' in w)) return { ...blank, kind: 'waypoint', name: w.code, alt: '' };
  const fmt = sc.display.latLonFormat;
  return {
    ...blank,
    kind: 'waypoint',
    name: w.code,
    lat: formatLatLon(w.lat_rad, 'lat', fmt),
    lon: formatLatLon(w.lon_rad, 'lon', fmt),
    alt: out(sc, w.alt_m, 'altitude'),
  };
}

export const ROUTE_COLUMNS = [
  'Number',
  'Name',
  'Latitude',
  'Longitude',
  'Altitude',
  'Altitude Rate',
  'Speed',
  'Acceleration',
  'Turn Radius',
];

/** Linhas da tabela da janela Route, como exibidas. */
export function routeRows(sc: Scenario): string[][] {
  return sc.route.points.map((p, i) => {
    const f = pointToForm(sc, p);
    return [String(i + 1), f.name, f.lat, f.lon, f.alt, f.climb, f.speed, f.accel, f.radius];
  });
}
