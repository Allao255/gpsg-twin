// Trajetórias do equipamento: GDT (`.gdt`, gerado a partir de KML, OP D-2) e NMEA-0183 (`.nme`,
// sentenças GGA e RMC, OP D-3). Leitura e validação; o twin não gera trajetória.
import { diag, type Diagnostic } from '../diagnostics';
import { degToRad } from '../geo';

export type TrajectoryFormat = 'GDT' | 'NMEA';

export interface TrackPoint {
  /** Instante UTC em s desde 1970-01-01; sem data (NMEA sem RMC), s desde 0 h do dia. */
  t_s: number;
  lat_rad: number;
  lon_rad: number;
  /** GDT: altitude absoluta; NMEA: MSL mais separação geoidal (elipsoidal), em m. */
  alt_m: number | null;
}

export interface Trajectory {
  format: TrajectoryFormat;
  points: TrackPoint[];
  /** Instantes têm data (GDT, ou NMEA com RMC). */
  dated: boolean;
  /** Mediana do intervalo entre pontos, em s; null com menos de dois pontos. */
  period_s: number | null;
  diagnostics: Diagnostic[];
}

/** XOR dos caracteres entre `$` e `*` (NMEA-0183; no GDT inclui a vírgula final). */
export function nmeaChecksum(body: string): string {
  let x = 0;
  for (const ch of body) x ^= ch.charCodeAt(0) & 0xff;
  return x.toString(16).toUpperCase().padStart(2, '0');
}

/** Confere o checksum; devolve o corpo (entre `$` e `*`) ou o motivo da rejeição. */
export function checkSentence(line: string): { body: string } | { error: string } {
  const m = /^\$([^*]*)\*([0-9A-Fa-f]{2})\s*$/.exec(line.trim());
  if (!m) return { error: 'sentença sem $ ou sem checksum *hh' };
  const body = m[1] ?? '';
  const want = (m[2] ?? '').toUpperCase();
  const got = nmeaChecksum(body);
  return got === want ? { body } : { error: `checksum ${want}, calculado ${got}` };
}

/** ddmm.mmmm (ou dddmm.mmmm) + hemisfério -> graus decimais. */
function nmeaAngle(v: string, h: string, degDigits: number): number | null {
  const m = new RegExp(`^(\\d{${degDigits}})(\\d{2}(?:\\.\\d+)?)$`).exec(v);
  if (!m) return null;
  const min = Number(m[2]);
  if (min >= 60) return null;
  const x = Number(m[1]) + min / 60;
  if (h === 'S' || h === 'W') return -x;
  return h === 'N' || h === 'E' ? x : null;
}

function hms(v: string): number | null {
  const m = /^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/.exec(v);
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return h < 24 && mi < 60 && s < 61 ? h * 3600 + mi * 60 + s : null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? (s[k] ?? 0) : ((s[k - 1] ?? 0) + (s[k] ?? 0)) / 2;
}

export function detectTrajectory(text: string): TrajectoryFormat | null {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '' && !/^Notes,/i.test(l)) ?? '';
  if (/^\$GDT,/.test(first.trim())) return 'GDT';
  if (/^\$(GP|GN|GL|GA)(GGA|RMC|GSV|GSA|VTG)/.test(first.trim())) return 'NMEA';
  return null;
}

export function parseTrajectory(text: string): Trajectory {
  const format = detectTrajectory(text);
  if (format === null)
    return {
      format: 'NMEA',
      points: [],
      dated: false,
      period_s: null,
      diagnostics: [
        diag('file-format', 'error', 'trajetória não reconhecida: esperado $GDT ou NMEA'),
      ],
    };
  const diagnostics: Diagnostic[] = [];
  const points: TrackPoint[] = [];
  const bad = (line: number, m: string): void => {
    diagnostics.push(diag('file-format', 'warning', m, { line }));
  };
  let date: number | null = null;
  let dated = format === 'GDT';
  // NMEA: a mesma época aparece em GGA e RMC; agrupa por hora do dia.
  let pending: { tod: number; lat: number; lon: number; alt: number | null } | null = null;
  const flush = (): void => {
    if (!pending) return;
    const t = (date ?? 0) + pending.tod;
    const prev = points.at(-1);
    if (!prev || prev.t_s !== t)
      points.push({
        t_s: t,
        lat_rad: degToRad(pending.lat),
        lon_rad: degToRad(pending.lon),
        alt_m: pending.alt,
      });
    else if (prev.alt_m === null && pending.alt !== null) prev.alt_m = pending.alt;
    pending = null;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const l = raw.trim();
    if (l === '' || /^Notes,/i.test(l)) return;
    const c = checkSentence(l);
    if ('error' in c) {
      bad(line, c.error);
      return;
    }
    const f = c.body.split(',');
    const kind = f[0] ?? '';
    if (format === 'GDT') {
      if (kind !== 'GDT') {
        bad(line, `sentença ${kind} em arquivo GDT`);
        return;
      }
      const d = /^(\d{4})(\d{2})(\d{2})$/.exec(f[1] ?? '');
      const tod = hms(f[2] ?? '');
      const lat = Number(f[3]);
      const lon = Number(f[4]);
      const alt = Number(f[5]);
      if (
        !d ||
        tod === null ||
        f[3] === '' ||
        f[4] === '' ||
        ![lat, lon, alt].every(Number.isFinite)
      ) {
        bad(line, 'campos de data, hora ou posição inválidos');
        return;
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        bad(line, 'latitude ou longitude fora da faixa');
        return;
      }
      const day = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) / 1000;
      points.push({ t_s: day + tod, lat_rad: degToRad(lat), lon_rad: degToRad(lon), alt_m: alt });
      return;
    }
    const type = kind.slice(2);
    if (type !== 'GGA' && type !== 'RMC') return;
    const tod = hms(f[1] ?? '');
    if (tod === null) {
      bad(line, `${type}: hora inválida`);
      return;
    }
    if (pending && pending.tod !== tod) flush();
    if (type === 'GGA') {
      if (f[6] === '0') {
        bad(line, 'GGA sem fix (qualidade 0); ignorada');
        return;
      }
      const lat = nmeaAngle(f[2] ?? '', f[3] ?? '', 2);
      const lon = nmeaAngle(f[4] ?? '', f[5] ?? '', 3);
      const msl = Number(f[9]);
      const sep = f[11] === '' ? 0 : Number(f[11]);
      if (lat === null || lon === null) {
        bad(line, 'GGA: latitude ou longitude inválida');
        return;
      }
      const alt = f[9] !== '' && Number.isFinite(msl) && Number.isFinite(sep) ? msl + sep : null;
      pending = { tod, lat, lon, alt };
    } else {
      if (f[2] !== 'A') {
        bad(line, 'RMC com status V (inválido); ignorada');
        return;
      }
      const lat = nmeaAngle(f[3] ?? '', f[4] ?? '', 2);
      const lon = nmeaAngle(f[5] ?? '', f[6] ?? '', 3);
      const d = /^(\d{2})(\d{2})(\d{2})$/.exec(f[9] ?? '');
      if (lat === null || lon === null || !d) {
        bad(line, 'RMC: posição ou data inválida');
        return;
      }
      // Ano de dois dígitos: 80 a 99 -> 19xx, demais -> 20xx.
      const yy = Number(d[3]);
      date = Date.UTC(yy >= 80 ? 1900 + yy : 2000 + yy, Number(d[2]) - 1, Number(d[1])) / 1000;
      dated = true;
      pending ??= { tod, lat, lon, alt: null };
    }
  });
  flush();
  if (format === 'NMEA' && !dated && points.length > 0)
    diagnostics.push(diag('file-value', 'info', 'NMEA sem RMC: a data vem do Setup (OP D-3)'));
  for (let k = 1; k < points.length; k++) {
    if ((points[k]?.t_s ?? 0) <= (points[k - 1]?.t_s ?? 0)) {
      diagnostics.push(diag('file-value', 'warning', `instante não crescente no ponto ${k + 1}`));
      break;
    }
  }
  if (points.length === 0)
    diagnostics.push(diag('file-format', 'error', 'nenhum ponto de trajetória válido'));
  const dts = points.slice(1).map((p, k) => p.t_s - (points[k]?.t_s ?? 0));
  return { format, points, dated, period_s: median(dts), diagnostics };
}
