// Log de sessão dos runners (CSV `utc_iso,t_session_s,t_run_s,kind,text`, 02-interface-remota.md
// seção 6) -> script `.scpi` equivalente ao que foi aceito pelo equipamento, para o caminho reverso.
//
// - Comandos aceitos viram linhas do script; consultas e o controle de TRUN dos runners não entram.
// - Comando seguido de ERR (rejeitado pelo equipamento) entra comentado, com o erro.
// - O início de execução (`MARK t_run = 0`) vira `@run`; o TRUN enviado com a simulação rodando
//   vira `@stop`. Durante a execução, cada comando recebe `@at <t_run>` do log (tempo real).
import { diag, type Diagnostic } from '../diagnostics';
import { lexCommand } from '../scpi/lexer';
import { resolveHeader } from '../scpi/header';
import { formatNumber } from '../units';
import { splitCsvLine } from './waypoints-csv';

export const LOG_HEADER = 'utc_iso,t_session_s,t_run_s,kind,text';

export interface LogRow {
  utc: string;
  tSession_s: number;
  tRun_s: number | null;
  kind: string;
  text: string;
}

export function isSessionLog(text: string): boolean {
  return text.replace(/^\uFEFF/, '').startsWith(LOG_HEADER);
}

export function parseLogRows(text: string): { rows: LogRow[]; diagnostics: Diagnostic[] } {
  const rows: LogRow[] = [];
  const diagnostics: Diagnostic[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== LOG_HEADER)
    return {
      rows,
      diagnostics: [diag('file-format', 'error', `cabeçalho de log esperado: ${LOG_HEADER}`)],
    };
  lines.slice(1).forEach((l, i) => {
    if (l.trim() === '') return;
    const c = splitCsvLine(l);
    const tS = Number(c[1]);
    const tR = c[2] === '' ? null : Number(c[2]);
    if (c.length < 5 || !Number.isFinite(tS) || (tR !== null && !Number.isFinite(tR))) {
      diagnostics.push(
        diag('file-format', 'warning', 'linha de log malformada; ignorada', { line: i + 2 }),
      );
      return;
    }
    rows.push({
      utc: c[0] ?? '',
      tSession_s: tS,
      tRun_s: tR,
      kind: c[3] ?? '',
      text: c.slice(4).join(','),
    });
  });
  return { rows, diagnostics };
}

function headerOf(cmd: string): { header: string | null; query: boolean } {
  const lx = lexCommand(cmd);
  const r = resolveHeader(lx.header);
  return { header: r.ok ? r.info.header : null, query: lx.header.endsWith('?') };
}

export interface LogScript {
  text: string;
  diagnostics: Diagnostic[];
  stats: { tx: number; rejected: number; runs: number };
}

/** Log -> script `.scpi` com o que o equipamento aceitou e os instantes reais de execução. */
export function logToScript(log: string, name = 'log'): LogScript {
  const { rows, diagnostics } = parseLogRows(log);
  const out: string[] = [`# twin-scenario: ${name}`, '# reconstruído de log de sessão do runner'];
  const stats = { tx: 0, rejected: 0, runs: 0 };
  let running = false;
  let lastAt = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (r.kind === 'MARK') {
      if (r.text === 't_run = 0') {
        out.push('@run');
        running = true;
        lastAt = 0;
        stats.runs++;
      } else if (r.text.startsWith('PAUSE ')) out.push(`# ${r.text}`);
      else out.push(`@mark ${r.text}`);
      continue;
    }
    if (r.kind === 'INFO' && /^[A-Za-z_]\w*=/.test(r.text)) {
      out.push(`# entrada do operador: ${r.text}`);
      continue;
    }
    if (r.kind !== 'TX') continue;
    stats.tx++;
    const { header, query } = headerOf(r.text);
    if (header === 'GPS:SIM:ToggleRUN') {
      if (!query && running) {
        if (r.tRun_s !== null && r.tRun_s > lastAt) out.push(`@at ${formatNumber(r.tRun_s, 3)}`);
        out.push('@stop');
        running = false;
      }
      continue;
    }
    if (query) continue;
    const errs: string[] = [];
    for (let k = i + 1; k < rows.length && rows[k]?.kind !== 'TX'; k++)
      if (rows[k]?.kind === 'ERR') errs.push(rows[k]?.text ?? '');
    if (errs.length > 0) {
      stats.rejected++;
      out.push(`# rejeitado (${errs.join(' | ').replace(/\s+/g, ' ')}): ${r.text}`);
      continue;
    }
    if (running && r.tRun_s !== null && r.tRun_s > lastAt) {
      lastAt = Math.round(r.tRun_s * 1000) / 1000;
      out.push(`@at ${formatNumber(lastAt, 3)}`);
    }
    out.push(r.text);
  }
  if (running)
    diagnostics.push(
      diag('file-value', 'warning', 'log termina com a simulação rodando (sem @stop)'),
    );
  if (stats.tx === 0)
    diagnostics.push(diag('file-format', 'warning', 'log sem comandos enviados (TX)'));
  return { text: out.join('\n') + '\n', diagnostics, stats };
}
