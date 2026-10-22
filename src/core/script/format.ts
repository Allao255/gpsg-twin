// Formatação de ScriptDoc em texto, na mesma ordem de linhas.
//
// preserve:  só normaliza espaços nas pontas e o espaçamento do comentário de fim de linha. É o modo
//            para scripts de sonda (S01), cujas grafias alternativas são o objeto do ensaio.
// canonical: aplica as regras de emissão do twin: forma curta, enum sem aspas, strings com aspas
//            duplas, números normalizados, lat/long em graus decimais (D07), SVPR:SAT com 8
//            parâmetros (D02). Linhas com erro ficam como escritas.
import { radToDeg } from '../geo';
import { EMIT_HEADER_OVERRIDE } from '../quirks';
import { quoteString } from '../scpi/lexer';
import { parseNumberToken, type ParamValue } from '../scpi/params';
import type { CheckedCommand } from '../scpi/validate';
import { formatNumber } from '../units';
import type { Directive, NumArg, ScriptDoc, ScriptLine } from './ast';

export type FormatMode = 'preserve' | 'canonical';

export function formatScript(doc: ScriptDoc, mode: FormatMode = 'canonical'): string {
  return doc.lines.map((l) => formatLine(l, mode)).join('\n') + (doc.lines.length > 0 ? '\n' : '');
}

function withComment(text: string, comment: string | null): string {
  return comment === null ? text : `${text} #${comment === '' ? '' : ` ${comment}`}`;
}

export function formatLine(l: ScriptLine, mode: FormatMode): string {
  switch (l.type) {
    case 'blank':
      return '';
    case 'comment':
      return mode === 'preserve' ? l.raw.trim() : l.text === '' ? '#' : `# ${l.text}`;
    case 'directive':
      return withComment(
        mode === 'canonical' && l.directive && !l.diagnostics.some((d) => d.severity === 'error')
          ? canonicalDirective(l.directive)
          : l.body,
        l.comment,
      );
    case 'command':
      return withComment(
        mode === 'canonical' ? (canonicalCommand(l.command) ?? l.body) : l.body,
        l.comment,
      );
  }
}

/** Número como escrito, normalizado: sem `+`, sem zeros supérfluos, sem expoente. */
export function canonicalNumberText(raw: string): string {
  const n = parseNumberToken(raw);
  if ('error' in n) return raw;
  const s = String(n.value);
  return /e/i.test(s) ? formatNumber(n.value, 15) : s;
}

function numArgText(a: NumArg): string {
  return a.value === null ? a.raw : canonicalNumberText(a.raw);
}

function canonicalDirective(d: Directive): string {
  switch (d.name) {
    case 'wait':
    case 'at':
      return `@${d.name} ${numArgText(d.seconds)}`;
    case 'run':
    case 'stop':
      return `@${d.name}`;
    case 'poll':
      return [
        '@poll',
        numArgText(d.period),
        numArgText(d.duration),
        ...d.queries.map((q) => canonicalCommand(q) ?? q.text),
      ].join(' ');
    case 'expect':
      return `@expect ${canonicalCommand(d.query) ?? d.query.text} ${d.expected}`;
    case 'errcheck':
      return `@errcheck ${d.on ? 'on' : 'off'}`;
    case 'mark':
    case 'pause':
      return d.text === '' ? `@${d.name}` : `@${d.name} ${d.text}`;
    case 'set':
      return `@set ${d.varName} ${d.value}`.trimEnd();
    case 'input':
      return `@input ${d.varName} ${d.prompt}`.trimEnd();
  }
}

/** Forma canônica de um comando validado, ou null se tiver erro. */
export function canonicalCommand(c: CheckedCommand): string | null {
  const inf = c.info;
  if (!inf || c.diagnostics.some((d) => d.severity === 'error')) return null;
  const header = EMIT_HEADER_OVERRIDE[inf.header] ?? inf.shortHeader;
  const parts: string[] = [];
  for (let i = 0; i < inf.params.length; i++) {
    const p = inf.params[i];
    const v = c.values[i];
    if (v === undefined) {
      // D02: parâmetro opcional com padrão (duração de SVPR:SAT) é sempre emitido.
      if (p?.default !== undefined && p.optional) parts.push(String(p.default));
      continue;
    }
    parts.push(canonicalValue(v));
  }
  return parts.length === 0 ? header : `${header} ${parts.join(',')}`;
}

function canonicalValue(v: ParamValue): string {
  switch (v.kind) {
    case 'number':
      return v.suffix === null ? canonicalNumberText(v.raw) : v.raw;
    case 'enum':
      return v.value;
    case 'string':
      return quoteString(v.value);
    case 'angle':
      return v.form === 'decimal' ? canonicalNumberText(v.raw) : formatNumber(radToDeg(v.value), 9);
    case 'unit':
    case 'var':
      return v.raw;
  }
}
