// Leitura da tabela de docs/04-discrepancias.md (fonte única do texto das discrepâncias).

export interface Discrepancy {
  id: string;
  divergence: string;
  sources: string;
  provisional: string;
  resolution: string;
  resolved: boolean;
}

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out.slice(1, -1);
}

/** Extrai as linhas `| Dnn | ... |` da tabela principal e da seção "Resolvidos". */
export function parseDiscrepancies(markdown: string): Discrepancy[] {
  const out: Discrepancy[] = [];
  let resolvedSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s+Resolvidos/i.test(line)) resolvedSection = true;
    else if (/^##\s/.test(line)) resolvedSection = false;
    if (!/^\|\s*D\d{2}\s*\|/.test(line)) continue;
    const c = cells(line);
    out.push({
      id: c[0] ?? '',
      divergence: c[1] ?? '',
      sources: c[2] ?? '',
      provisional: c[3] ?? '',
      resolution: c[4] ?? '',
      resolved: resolvedSection,
    });
  }
  return out;
}
