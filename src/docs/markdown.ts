// Markdown mínimo para publicar o guia (docs/guia/) na aba Ajuda: títulos, parágrafos, listas
// (numeradas ou não, aninhadas por recuo), blocos de código cercados, tabelas, código inline,
// negrito e links. Saída HTML com todo texto escapado; links passam pelo resolvedor.

/** Destino do link: href a usar, ou null para mostrar só o texto. */
export type LinkResolver = (href: string) => string | null;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const FENCE_RE = /^(\s*)```(\S*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

const indentOf = (l: string): number => l.length - l.trimStart().length;

function inline(text: string, link: LinkResolver): string {
  const codes: string[] = [];
  const s = text.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\uE000${codes.length - 1}\uE000`;
  });
  return escapeHtml(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, href: string) => {
      const to = link(href.replace(/&amp;/g, '&'));
      return to === null ? t : `<a href="${escapeHtml(to)}">${t}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\uE000(\d+)\uE000/g, (_m, i: string) => codes[Number(i)] ?? '');
}

function startsBlock(lines: readonly string[], i: number): boolean {
  const l = lines[i] ?? '';
  return (
    FENCE_RE.test(l) ||
    HEADING_RE.test(l) ||
    LIST_RE.test(l) ||
    (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? ''))
  );
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function blocks(lines: readonly string[], link: LinkResolver): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i] ?? '';
    if (l.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(l);
    if (fence) {
      const ind = (fence[1] ?? '').length;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? '')) {
        const x = lines[i] ?? '';
        body.push(x.slice(Math.min(ind, indentOf(x))));
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const head = HEADING_RE.exec(l);
    if (head) {
      const n = (head[1] ?? '#').length;
      out.push(`<h${n}>${inline(head[2] ?? '', link)}</h${n}>`);
      i++;
      continue;
    }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const th = cells(l).map((c) => `<th>${inline(c, link)}</th>`);
      const rows: string[] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i] ?? '')) {
        rows.push(`<tr>${cells(lines[i] ?? '').map((c) => `<td>${inline(c, link)}</td>`).join('')}</tr>`);
        i++;
      }
      out.push(`<table><thead><tr>${th.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
      continue;
    }
    const li = LIST_RE.exec(l);
    if (li) {
      const base = (li[1] ?? '').length;
      const ordered = /\d/.test(li[2] ?? '');
      const start = ordered ? parseInt(li[2] ?? '1', 10) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        // Linhas em branco entre itens da mesma lista.
        let j = i;
        while (j < lines.length && (lines[j] ?? '').trim() === '') j++;
        const m = LIST_RE.exec(lines[j] ?? '');
        if (!m || (m[1] ?? '').length !== base || /\d/.test(m[2] ?? '') !== ordered) break;
        i = j;
        const contentIndent = base + (m[2] ?? '').length + 1;
        const item: string[] = [m[3] ?? ''];
        i++;
        while (i < lines.length) {
          const x = lines[i] ?? '';
          if (x.trim() === '') {
            let j = i + 1;
            while (j < lines.length && (lines[j] ?? '').trim() === '') j++;
            if (j < lines.length && indentOf(lines[j] ?? '') > base) {
              item.push('');
              i++;
              continue;
            }
            break;
          }
          if (indentOf(x) <= base) break;
          item.push(x.slice(Math.min(contentIndent, indentOf(x))));
          i++;
        }
        // Primeiro parágrafo do item em linha; o resto como blocos.
        let k = 1;
        while (k < item.length && (item[k] ?? '') !== '' && !startsBlock(item, k)) k++;
        const lead = inline(item.slice(0, k).join(' '), link);
        items.push(`<li>${lead}${blocks(item.slice(k), link)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !startsBlock(lines, i)) {
      para.push((lines[i] ?? '').trim());
      i++;
    }
    out.push(`<p>${inline(para.join(' '), link)}</p>`);
  }
  return out.join('\n');
}

export function renderMarkdown(md: string, link: LinkResolver = (h) => h): string {
  return blocks(md.replace(/\r\n/g, '\n').split('\n'), link);
}
