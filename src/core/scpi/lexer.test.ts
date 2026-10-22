import { describe, expect, it } from 'vitest';
import { lexCommand, quoteString } from './lexer';

const codes = (t: string): string[] => lexCommand(t).diagnostics.map((d) => d.code);

describe('lexer', () => {
  it('separa cabeçalho e parâmetros com posições', () => {
    const l = lexCommand('  GPS:ROUT:ADD:POIN "Kansas City Intl", 39.2976 ,-94.7139');
    expect(l.header).toBe('GPS:ROUT:ADD:POIN');
    expect(l.headerSpan).toEqual({ start: 2, end: 19 });
    expect(l.params.map((p) => p.text)).toEqual(['"Kansas City Intl"', '39.2976', '-94.7139']);
    expect(l.params[0]?.value).toBe('Kansas City Intl');
    expect(l.params[0]?.quote).toBe('"');
    expect(l.params[1]?.span).toEqual({ start: 40, end: 47 });
  });

  it('aceita aspas simples, aspas duplicadas e vírgula dentro de string', () => {
    const l = lexCommand(`X 'a,b','it''s',"x""y"`);
    expect(l.params.map((p) => p.value)).toEqual(['a,b', "it's", 'x"y']);
    expect(l.diagnostics).toEqual([]);
  });

  it('comando sem parâmetros', () => {
    expect(lexCommand('*IDN?').params).toEqual([]);
  });

  it('linha vazia', () => {
    expect(codes('   ')).toEqual(['empty']);
  });

  it('erros de string', () => {
    // Regressão: string aberta no último parâmetro sumia sem diagnóstico.
    expect(codes('X "abc')).toEqual(['unterminated-string']);
    expect(lexCommand('X 1,"abc').params.map((p) => p.text)).toEqual(['1', '"abc']);
    expect(codes(`X "abc'`)).toEqual(['mixed-quotes']);
    expect(codes('X "abc"d')).toEqual(['text-after-string']);
  });

  it('parâmetro vazio', () => {
    expect(codes('X 1,,2')).toEqual(['empty-param']);
  });

  it('encadeamento com ponto e vírgula', () => {
    expect(codes('A:B 1;C 2')).toContain('chained');
    expect(codes('A:B;C')).toContain('chained');
    expect(codes('X "a;b"')).toEqual([]);
  });

  it('escreve string SCPI', () => {
    expect(quoteString('a"b')).toBe('"a""b"');
  });
});
