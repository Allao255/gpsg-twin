import { describe, expect, it } from 'vitest';
import { countBySeverity, diag, hasErrors } from './diagnostics';

describe('diagnósticos', () => {
  it('monta, conta e detecta erros', () => {
    const a = diag('range', 'error', 'm', { line: 3, span: { start: 1, end: 2 }, dRefs: ['D01'] });
    const b = diag('step', 'warning', 'm', { dRefs: [] });
    expect(a).toEqual({
      code: 'range',
      severity: 'error',
      message: 'm',
      line: 3,
      span: { start: 1, end: 2 },
      dRefs: ['D01'],
    });
    expect(b).toEqual({ code: 'step', severity: 'warning', message: 'm' });
    expect(hasErrors([a, b])).toBe(true);
    expect(hasErrors([b])).toBe(false);
    expect(countBySeverity([a, b, b])).toEqual({ error: 1, warning: 2, info: 0 });
  });
});
