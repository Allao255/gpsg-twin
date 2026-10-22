// Diagnósticos compartilhados por lexer, resolução de cabeçalho, validação, parser de script e emissor.

export type Severity = 'error' | 'warning' | 'info';

/** Intervalo de colunas (base 0, fim exclusivo) dentro do texto analisado. */
export interface Span {
  start: number;
  end: number;
}

export type DiagCode =
  // lexer
  | 'empty'
  | 'chained'
  | 'unterminated-string'
  | 'mixed-quotes'
  | 'text-after-string'
  | 'empty-param'
  // cabeçalho
  | 'unknown-header'
  | 'known-misspelling'
  | 'no-query-form'
  | 'no-set-form'
  | 'alias-unverified'
  // parâmetros
  | 'arity'
  | 'type'
  | 'range'
  | 'range-depends-on-units'
  | 'range-unknown'
  | 'step'
  | 'enum'
  | 'enum-quoted'
  | 'maxlen'
  | 'format'
  | 'string-unquoted'
  | 'unit-suffix-not-allowed'
  | 'unit-suffix-unverified'
  | 'unit-unknown'
  | 'units-aero-unverified'
  | 'latlon-dm'
  | 'optional-omitted'
  // política do twin e estado
  | 'emit-forbidden'
  | 'trun-direct'
  | 'destructive'
  | 'destructive-batch'
  | 'locked-while-running'
  | 'runtime-only'
  // script
  | 'directive-unknown'
  | 'directive-args'
  | 'var-undefined'
  | 'var-runtime'
  | 'at-before-run'
  | 'at-past'
  | 'run-twice'
  | 'stop-not-running'
  | 'expect-not-query'
  // cenário
  | 'not-represented'
  | 'multi-run'
  | 'time-approximate'
  | 'route-unknown-row'
  | 'scenario-invalid'
  | 'scenario-consistency'
  | 'almanac-not-fixed';

export interface Diagnostic {
  code: DiagCode;
  severity: Severity;
  message: string;
  /** Linha do script (base 1), quando houver. */
  line?: number;
  span?: Span;
  /** IDs de discrepância relacionados (docs/04-discrepancias.md). */
  dRefs?: string[];
}

export function diag(
  code: DiagCode,
  severity: Severity,
  message: string,
  extra: Partial<Pick<Diagnostic, 'line' | 'span' | 'dRefs'>> = {},
): Diagnostic {
  const d: Diagnostic = { code, severity, message };
  if (extra.line !== undefined) d.line = extra.line;
  if (extra.span !== undefined) d.span = extra.span;
  if (extra.dRefs !== undefined && extra.dRefs.length > 0) d.dRefs = extra.dRefs;
  return d;
}

export function hasErrors(diags: readonly Diagnostic[]): boolean {
  return diags.some((d) => d.severity === 'error');
}

export function countBySeverity(diags: readonly Diagnostic[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of diags) out[d.severity]++;
  return out;
}
