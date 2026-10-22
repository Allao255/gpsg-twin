// Leitor de CSV mínimo para o log de sessão (02-interface-remota.md seção 6).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface LogRow {
  utc: string;
  tSession: string;
  tRun: string;
  kind: string;
  text: string;
}

export function parseLog(text: string): { header: string[]; rows: LogRow[] } {
  const [header = [], ...rest] = parseCsv(text);
  return {
    header,
    rows: rest.map(([utc = '', tSession = '', tRun = '', kind = '', t = '']) => ({
      utc,
      tSession,
      tRun,
      kind,
      text: t,
    })),
  };
}
