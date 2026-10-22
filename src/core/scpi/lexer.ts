// Tokenizador de uma linha de comando SCPI: cabeçalho e parâmetros brutos.
// A interpretação de cada parâmetro depende do tipo esperado e fica em params.ts.
import { diag, type Diagnostic, type Span } from '../diagnostics';

export type Quote = '"' | "'";

export interface RawParam {
  /** Texto do parâmetro sem espaços nas pontas, como escrito. */
  text: string;
  span: Span;
  /** Aspas que delimitam o parâmetro, se for string entre aspas. */
  quote: Quote | null;
  /** Conteúdo sem aspas e com aspas duplicadas desfeitas; igual a `text` sem aspas. */
  value: string;
}

export interface LexedCommand {
  text: string;
  header: string;
  headerSpan: Span;
  params: RawParam[];
  diagnostics: Diagnostic[];
}

const isSpace = (ch: string | undefined): boolean => ch === ' ' || ch === '\t';

export function lexCommand(text: string): LexedCommand {
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  while (isSpace(text[i])) i++;
  const hStart = i;
  while (i < text.length && !isSpace(text[i])) i++;
  const header = text.slice(hStart, i);
  const headerSpan = { start: hStart, end: i };
  if (header === '') {
    diagnostics.push(diag('empty', 'error', 'linha de comando vazia'));
    return { text, header, headerSpan, params: [], diagnostics };
  }
  while (isSpace(text[i])) i++;

  const params: RawParam[] = [];
  if (i < text.length) {
    let start = i;
    let quote: Quote | null = null;
    for (let k = i; k <= text.length; k++) {
      const ch = text[k];
      if (k === text.length) {
        // Fim da linha encerra o último parâmetro, mesmo com string aberta.
        params.push(finishParam(text, start, k, diagnostics));
        break;
      }
      if (quote !== null) {
        if (ch === quote) {
          if (text[k + 1] === quote) k++;
          else quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ';') {
        diagnostics.push(
          diag(
            'chained',
            'error',
            'encadeamento com ";" não é emitido pelo twin; um comando por linha',
            {
              span: { start: k, end: k + 1 },
            },
          ),
        );
      } else if (ch === ',') {
        params.push(finishParam(text, start, k, diagnostics));
        start = k + 1;
      }
    }
  }
  if (header.includes(';')) {
    diagnostics.push(
      diag(
        'chained',
        'error',
        'encadeamento com ";" não é emitido pelo twin; um comando por linha',
        {
          span: headerSpan,
        },
      ),
    );
  }
  return { text, header, headerSpan, params, diagnostics };
}

function finishParam(text: string, from: number, to: number, out: Diagnostic[]): RawParam {
  let s = from;
  let e = to;
  while (s < e && isSpace(text[s])) s++;
  while (e > s && isSpace(text[e - 1])) e--;
  const raw = text.slice(s, e);
  const span = { start: s, end: e };
  if (raw === '') {
    out.push(diag('empty-param', 'error', 'parâmetro vazio', { span }));
    return { text: raw, span, quote: null, value: raw };
  }
  const q = raw[0];
  if (q !== '"' && q !== "'") return { text: raw, span, quote: null, value: raw };

  let value = '';
  let k = 1;
  let closed = -1;
  while (k < raw.length) {
    const ch = raw[k];
    if (ch === q) {
      if (raw[k + 1] === q) {
        value += q;
        k += 2;
        continue;
      }
      closed = k;
      break;
    }
    value += ch ?? '';
    k++;
  }
  if (closed < 0) {
    const other = q === '"' ? "'" : '"';
    if (raw.endsWith(other)) {
      out.push(
        diag('mixed-quotes', 'error', 'string aberta e fechada com aspas diferentes', { span }),
      );
    } else {
      out.push(diag('unterminated-string', 'error', 'string sem aspas de fechamento', { span }));
    }
  } else if (closed !== raw.length - 1) {
    out.push(diag('text-after-string', 'error', 'texto depois do fechamento da string', { span }));
  }
  return { text: raw, span, quote: q, value };
}

/** Escreve uma string SCPI entre aspas duplas, duplicando aspas internas. */
export function quoteString(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
