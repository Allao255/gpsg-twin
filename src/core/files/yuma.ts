// Almanaque Yuma (`.alm`, ICD-GPS-870, OP D-1): um bloco por PRN. Unidades SI e radianos, como no
// arquivo. A semana vem em módulo 1024; a resolução do rollover pela data de simulação fica com quem
// propaga (M6).
import { diag, type Diagnostic } from '../diagnostics';

export interface YumaEntry {
  prn: number;
  health: number;
  eccentricity: number;
  toa_s: number;
  inclination_rad: number;
  rateOfRightAscen_rps: number;
  sqrtA: number;
  rightAscenAtWeek_rad: number;
  argOfPerigee_rad: number;
  meanAnomaly_rad: number;
  af0_s: number;
  af1_sps: number;
  week: number;
}

/** Rótulo do arquivo (até o `:`, sem diferenciar caixa e espaços) -> campo. */
const LABELS: readonly [RegExp, keyof YumaEntry][] = [
  [/^id$/, 'prn'],
  [/^health$/, 'health'],
  [/^eccentricity$/, 'eccentricity'],
  [/^timeofapplicability/, 'toa_s'],
  [/^orbitalinclination/, 'inclination_rad'],
  [/^rateofrightascen/, 'rateOfRightAscen_rps'],
  [/^sqrt\(a\)/, 'sqrtA'],
  [/^rightascenatweek/, 'rightAscenAtWeek_rad'],
  [/^argumentofperigee/, 'argOfPerigee_rad'],
  [/^meananom/, 'meanAnomaly_rad'],
  [/^af0/, 'af0_s'],
  [/^af1/, 'af1_sps'],
  [/^week$/, 'week'],
];

export interface Almanac {
  entries: YumaEntry[];
  /** Semanas distintas encontradas (módulo 1024). */
  weeks: number[];
  diagnostics: Diagnostic[];
}

export function parseYuma(text: string): Almanac {
  const entries: YumaEntry[] = [];
  const diagnostics: Diagnostic[] = [];
  let cur: Partial<YumaEntry> | null = null;
  let start = 0;
  const close = (): void => {
    if (!cur) return;
    const missing = LABELS.map(([, k]) => k).filter((k) => cur?.[k] === undefined);
    if (missing.length > 0)
      diagnostics.push(
        diag('file-format', 'warning', `bloco sem ${missing.join(', ')}; ignorado`, {
          line: start,
        }),
      );
    else if (entries.some((e) => e.prn === cur?.prn))
      diagnostics.push(
        diag('file-value', 'warning', `PRN ${String(cur.prn)} repetido; ignorado`, { line: start }),
      );
    else entries.push(cur as YumaEntry);
    cur = null;
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const l = raw.trim();
    if (l === '') return;
    if (/^\*+\s*week/i.test(l)) {
      close();
      cur = {};
      start = line;
      return;
    }
    const m = /^([^:]+):\s*(\S+)\s*$/.exec(l);
    if (!m || !cur) {
      diagnostics.push(diag('file-format', 'warning', 'linha fora de bloco de PRN', { line }));
      return;
    }
    const label = (m[1] ?? '').toLowerCase().replace(/\s+/g, '');
    const key = LABELS.find(([re]) => re.test(label))?.[1];
    if (!key) return;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) {
      diagnostics.push(diag('file-format', 'warning', `${m[1] ?? ''}: valor inválido`, { line }));
      return;
    }
    cur[key] = v;
  });
  close();
  entries.sort((a, b) => a.prn - b.prn);
  for (const e of entries)
    if (!Number.isInteger(e.prn) || e.prn < 1 || e.prn > 32)
      diagnostics.push(diag('file-value', 'warning', `PRN ${e.prn} fora de 1 a 32`));
  if (entries.length === 0)
    diagnostics.push(diag('file-format', 'error', 'nenhum bloco de PRN válido (formato Yuma)'));
  const weeks = [...new Set(entries.map((e) => e.week % 1024))].sort((a, b) => a - b);
  if (weeks.length > 1)
    diagnostics.push(
      diag('file-value', 'warning', `semanas diferentes no mesmo almanaque: ${weeks.join(', ')}`),
    );
  return { entries, weeks, diagnostics };
}
