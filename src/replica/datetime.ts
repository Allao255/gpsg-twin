// Data e hora da simulação na tela (Setup, Simulation Start Time): "Aug 10, 2013" e "13:51:23".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400;
const p2 = (n: number): string => String(n).padStart(2, '0');

export function formatDate(epoch_s: number): string {
  const d = new Date(epoch_s * 1000);
  return `${MONTHS[d.getUTCMonth()] ?? ''} ${p2(d.getUTCDate())}, ${d.getUTCFullYear()}`;
}

export function formatTime(epoch_s: number): string {
  const t = ((Math.floor(epoch_s) % DAY) + DAY) % DAY;
  return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`;
}

function validDate(y: number, m: number, d: number): number | null {
  const ms = Date.UTC(y, m - 1, d);
  const x = new Date(ms);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d
    ? ms / 1000 / DAY
    : null;
}

/** Lê data em mm/dd/yyyy, yyyy-mm-dd ou "Aug 10, 2013"; devolve dias desde 1970-01-01. */
export function parseDate(text: string): { days: number } | { error: string } {
  const t = text.trim();
  let r: number | null = null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) r = validDate(Number(m[3]), Number(m[1]), Number(m[2]));
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)))
    r = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  else if ((m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))) {
    const mon = MONTHS.findIndex((x) => x.toLowerCase() === (m?.[1] ?? '').toLowerCase());
    if (mon >= 0) r = validDate(Number(m[3]), mon + 1, Number(m[2]));
  } else return { error: 'formato de data: mm/dd/aaaa, aaaa-mm-dd ou "Aug 10, 2013"' };
  return r === null ? { error: `data inexistente: ${t}` } : { days: r };
}

/** Lê hora hh:mm:ss (ou hh:mm); devolve segundos do dia. */
export function parseTime(text: string): { seconds: number } | { error: string } {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return { error: 'formato de hora: hh:mm:ss' };
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return { error: `hora inválida: ${text.trim()}` };
  return { seconds: h * 3600 + mi * 60 + s };
}

export function withDate(epoch_s: number, days: number): number {
  return days * DAY + (((epoch_s % DAY) + DAY) % DAY);
}

export function withTime(epoch_s: number, seconds: number): number {
  return Math.floor(epoch_s / DAY) * DAY + seconds;
}

export function mmddyyyy(epoch_s: number): string {
  const d = new Date(epoch_s * 1000);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${d.getUTCFullYear()}`;
}
