// Mapa da aba Análise: contorno costeiro embutido (Natural Earth 1:50m, world-atlas) e grade de
// latitude e longitude, sem rede. Mapa base online (OpenStreetMap) opcional e desligado por padrão:
// ligado, as coordenadas visíveis vão para o servidor de tiles.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import land50 from 'world-atlas/land-50m.json';
import { radToDeg } from '../../core/geo';
import type { RoutePointView } from '../../analysis/route-checks';
import type { TrackPoint } from '../../core/files/trajectory';
import { h } from '../dom';

export interface MapData {
  /** Posição estática (STATIC). */
  position: { lat_rad: number; lon_rad: number; label: string } | null;
  route: { points: RoutePointView[]; loop: boolean } | null;
  trajectory: TrackPoint[] | null;
}

export interface ReceiverMark {
  lat_rad: number;
  lon_rad: number;
  label: string;
}

export interface MapView {
  el: HTMLElement;
  update: (d: MapData) => void;
  /** Move o marcador do receptor (posição estimada no instante do cursor); null remove. */
  setReceiver: (r: ReceiverMark | null) => void;
  /** Recalcula o tamanho (o mapa é criado com a aba oculta). */
  resize: () => void;
}

const TILES_KEY = 'gpsg-twin.osm-tiles';

const ll = (lat_rad: number, lon_rad: number): L.LatLngTuple => [
  radToDeg(lat_rad),
  radToDeg(lon_rad),
];

/** Espaçamento da grade para ~4 a 10 linhas na vista. */
function gridStep(span: number): number {
  for (const s of [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30])
    if (span / s <= 10) return s;
  return 30;
}

export function createMap(
  onClick: (lat: number, lon: number, close: () => void) => HTMLElement | null,
): MapView {
  const host = h('div', { class: 'map' });
  const map = L.map(host, { worldCopyJump: true, attributionControl: true }).setView([0, 0], 2);
  map.attributionControl.setPrefix(false);
  const topo = land50 as unknown as Topology<{ land: GeometryCollection }>;
  L.geoJSON(feature(topo, topo.objects.land), {
    style: { color: '#6b7785', weight: 1, fillColor: '#8a96a3', fillOpacity: 0.25 },
    interactive: false,
  }).addTo(map);
  map.attributionControl.addAttribution('Contorno: Natural Earth');

  const grid = L.layerGroup().addTo(map);
  const drawGrid = (): void => {
    grid.clearLayers();
    const b = map.getBounds();
    const step = gridStep(Math.max(b.getNorth() - b.getSouth(), (b.getEast() - b.getWest()) / 2));
    const style = { color: '#9aa4ae', weight: 0.6, opacity: 0.6, interactive: false };
    const dec = Math.max(0, -Math.floor(Math.log10(step)));
    for (let lat = Math.ceil(b.getSouth() / step) * step; lat <= b.getNorth(); lat += step) {
      L.polyline(
        [
          [lat, b.getWest()],
          [lat, b.getEast()],
        ],
        style,
      ).addTo(grid);
      L.marker([lat, b.getWest()], {
        icon: L.divIcon({
          className: 'grid-label',
          html: `${lat.toFixed(dec)}°`,
          iconSize: [0, 0],
          iconAnchor: [-3, 7],
        }),
        interactive: false,
      }).addTo(grid);
    }
    for (let lon = Math.ceil(b.getWest() / step) * step; lon <= b.getEast(); lon += step) {
      L.polyline(
        [
          [b.getSouth(), lon],
          [b.getNorth(), lon],
        ],
        style,
      ).addTo(grid);
      L.marker([b.getSouth(), lon], {
        icon: L.divIcon({
          className: 'grid-label',
          html: `${lon.toFixed(dec)}°`,
          iconSize: [0, 0],
          iconAnchor: [-3, 16],
        }),
        interactive: false,
      }).addTo(grid);
    }
  };
  map.on('moveend zoomend', drawGrid);

  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  });
  let tilesOn = false;
  try {
    tilesOn = localStorage.getItem(TILES_KEY) === '1';
  } catch {
    /* sem armazenamento */
  }
  const tilesToggle = h('input', {
    type: 'checkbox',
    onchange: (e: Event) => {
      tilesOn = (e.target as HTMLInputElement).checked;
      if (tilesOn) osm.addTo(map);
      else osm.remove();
      try {
        localStorage.setItem(TILES_KEY, tilesOn ? '1' : '0');
      } catch {
        /* sem armazenamento */
      }
    },
  });
  tilesToggle.checked = tilesOn;
  if (tilesOn) osm.addTo(map);

  const data = L.layerGroup().addTo(map);
  map.on('click', (e: L.LeafletMouseEvent) => {
    const content = onClick(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true), () =>
      map.closePopup(),
    );
    if (content) L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
  });

  // Marcador do receptor: um só, movido a cada cursor, fora da camada de dados.
  const receiver = L.circleMarker([0, 0], {
    radius: 8,
    color: '#9a6700',
    fillColor: '#f2a900',
    fillOpacity: 1,
    weight: 2,
    interactive: false,
  }).bindTooltip('', { permanent: true, direction: 'bottom', offset: [0, 8] });
  const setReceiver = (r: ReceiverMark | null): void => {
    if (!r) {
      receiver.remove();
      return;
    }
    receiver.setLatLng(ll(r.lat_rad, r.lon_rad)).setTooltipContent(r.label);
    if (!map.hasLayer(receiver)) receiver.addTo(map);
    receiver.bringToFront();
  };

  let fitted = '';
  let drawn: { key: string; trajectory: TrackPoint[] | null } | null = null;
  const update = (d: MapData): void => {
    // Mover o cursor não muda os dados: redesenhar só quando mudam (preserva popups e desempenho).
    const dataKey = JSON.stringify({ position: d.position, route: d.route });
    if (drawn && drawn.key === dataKey && drawn.trajectory === d.trajectory) return;
    drawn = { key: dataKey, trajectory: d.trajectory };
    data.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    if (d.trajectory && d.trajectory.length > 0) {
      const line = d.trajectory.map((p) => ll(p.lat_rad, p.lon_rad));
      L.polyline(line, { color: '#8957e5', weight: 2 })
        .bindTooltip('Trajetória anexada')
        .addTo(data);
      bounds.push(...line);
    }
    if (d.route) {
      const known = d.route.points.filter((p) => p.lat_rad !== null && p.lon_rad !== null);
      const line = known.map((p) => ll(p.lat_rad ?? 0, p.lon_rad ?? 0));
      if (d.route.loop && line.length > 2 && line[0]) line.push(line[0]);
      L.polyline(line, { color: '#1f6feb', weight: 3 }).addTo(data);
      for (const p of known) {
        const warn = p.warnings.length > 0;
        L.circleMarker(ll(p.lat_rad ?? 0, p.lon_rad ?? 0), {
          radius: 6,
          color: warn ? '#cf222e' : '#1f6feb',
          fillColor: warn ? '#ff8182' : '#ffffff',
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip(`${p.index + 1}. ${p.name}`, {
            permanent: known.length <= 30,
            direction: 'right',
          })
          .bindPopup(() => routePopup(p))
          .addTo(data);
      }
      bounds.push(...line);
    }
    if (d.position) {
      const p = ll(d.position.lat_rad, d.position.lon_rad);
      L.circleMarker(p, {
        radius: 7,
        color: '#1a7f37',
        fillColor: '#2da44e',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(d.position.label, { permanent: true, direction: 'right' })
        .addTo(data);
      bounds.push(p);
    }
    // Reenquadra só quando a geometria muda, para não perder o zoom do operador.
    const key = JSON.stringify(bounds);
    if (key !== fitted && bounds.length > 0) {
      fitted = key;
      if (bounds.length === 1 && bounds[0]) map.setView(bounds[0], 11);
      else map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 14 });
    }
    drawGrid();
    if (map.hasLayer(receiver)) receiver.bringToFront();
  };

  const el = h(
    'div',
    { class: 'map-wrap' },
    host,
    h(
      'label',
      { class: 'chk muted' },
      tilesToggle,
      ' Mapa base online (OpenStreetMap). Ligado, as coordenadas visíveis vão para o servidor de tiles: não usar com posições ou rotas de interesse.',
    ),
  );
  return {
    el,
    update,
    setReceiver,
    resize: () => {
      map.invalidateSize();
    },
  };
}

function routePopup(p: RoutePointView): HTMLElement {
  const f = (x: number | null, d = 1): string =>
    x === null ? '?' : (Math.round(x * 10 ** d) / 10 ** d).toString();
  return h(
    'div',
    { class: 'pt-pop' },
    h('strong', {}, `${p.index + 1}. ${p.name}`),
    h('div', {}, `Altitude ${f(p.alt_m)} m, velocidade ${f(p.speed_mps)} m/s`),
    h(
      'div',
      {},
      `Raio de curva ${f(p.turnRadius_m)} m, aceleração ${f(p.accel_mps2)} m/s², subida ${f(p.climbRate_mps, 3)} m/s`,
    ),
    p.next_m !== null ? h('div', {}, `Até o próximo: ${f(p.next_m / 1000, 3)} km`) : null,
    ...p.warnings.map((w) => h('div', { class: 'sev-warning' }, w)),
  );
}
