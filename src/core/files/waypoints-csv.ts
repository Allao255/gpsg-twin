// Waypoints de usuário (`.csv`, OP D-8): sem cabeçalho, colunas A a J = nome, cidade, país, código,
// ICAO, latitude, longitude, altitude, offset UTC, 0. País é o campo `state` do remoto (D28).
// D30: unidade da altitude (ft no exemplo, talvez o modo de unidades) e nome do arquivo não
// confirmados; provisoriamente ft.
import { diag, type Diagnostic } from '../diagnostics';
import { degToRad, radToDeg } from '../geo';
import { D30_WAYPOINT_CSV_ALT_UNIT } from '../quirks';
import type { UserWaypoint } from '../scenario/types';
import { formatCommand } from '../scpi/format';
import { checkCommand } from '../scpi/validate';
import { fromSI, toSI } from '../units';
import { g16, SI_CONTEXT } from './route-xml';

function field(s: string): { text: string; quoted: boolean } {
  if (!/[",\r\n]/.test(s)) return { text: s, quoted: false };
  return { text: `"${s.replace(/"/g, '""')}"`, quoted: true };
}

export interface WaypointsCsvResult {
  text: string;
  diagnostics: Diagnostic[];
}

export function waypointsToCsv(list: readonly UserWaypoint[]): WaypointsCsvResult {
  const diagnostics: Diagnostic[] = [];
  const lines = list.map((w) => {
    const cols = [w.name, w.city, w.state, w.code, w.icao].map(field);
    if (cols.some((c) => c.quoted))
      diagnostics.push(
        diag(
          'file-unverified',
          'warning',
          `waypoint ${w.code}: texto com vírgula ou aspas gravado entre aspas; leitura pelo equipamento não verificada`,
        ),
      );
    const alt = g16(fromSI(w.alt_m, D30_WAYPOINT_CSV_ALT_UNIT));
    return [
      ...cols.map((c) => c.text),
      g16(radToDeg(w.lat_rad)),
      g16(radToDeg(w.lon_rad)),
      alt,
      '0',
      '0',
    ].join(',');
  });
  if (list.length > 0)
    diagnostics.push(
      diag(
        'file-unverified',
        'info',
        `altitude dos waypoints em ${D30_WAYPOINT_CSV_ALT_UNIT} (D30, não verificado)`,
        { dRefs: ['D30'] },
      ),
    );
  return { text: lines.map((l) => `${l}\r\n`).join(''), diagnostics };
}

/** Divide uma linha CSV com aspas duplas (RFC 4180). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface WaypointsReadResult {
  waypoints: UserWaypoint[];
  diagnostics: Diagnostic[];
}

export function waypointsFromCsv(text: string): WaypointsReadResult {
  const waypoints: UserWaypoint[] = [];
  const diagnostics: Diagnostic[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === '') return;
    const c = splitCsvLine(raw).map((x) => x.trim());
    const lat = Number(c[5]);
    const lon = Number(c[6]);
    const alt = Number(c[7]);
    if (c.length < 8 || c[5] === '' || ![lat, lon, alt].every(Number.isFinite)) {
      diagnostics.push(
        diag(
          'file-format',
          'warning',
          'linha sem latitude, longitude e altitude numéricas; ignorada',
          {
            line,
          },
        ),
      );
      return;
    }
    const code = c[3] ?? '';
    if (code === '') {
      diagnostics.push(
        diag('file-format', 'warning', 'linha sem código (coluna D); ignorada', { line }),
      );
      return;
    }
    const w: UserWaypoint = {
      code,
      icao: c[4] ?? '',
      name: c[0] ?? '',
      city: c[1] ?? '',
      state: c[2] ?? '',
      lat_rad: degToRad(lat),
      lon_rad: degToRad(lon),
      alt_m: toSI(alt, D30_WAYPOINT_CSV_ALT_UNIT),
    };
    if (waypoints.some((x) => x.code === code)) {
      diagnostics.push(
        diag('file-value', 'warning', `código ${code} repetido; ignorado`, { line }),
      );
      return;
    }
    const cmd = formatCommand('GPS:WAYP:NEW', [
      w.code,
      w.icao,
      w.name,
      w.city,
      w.state,
      w.lat_rad,
      w.lon_rad,
      w.alt_m,
    ]);
    for (const d of checkCommand(cmd, SI_CONTEXT).diagnostics)
      if (d.severity === 'error')
        diagnostics.push(diag('file-value', 'warning', `${code}: ${d.message}`, { line }));
    waypoints.push(w);
  });
  return { waypoints, diagnostics };
}
