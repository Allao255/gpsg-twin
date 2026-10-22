import { describe, expect, it } from 'vitest';
import type { ScriptLine } from './ast';
import { expandVars, parseScript, rejoinPollQueries, splitComment } from './parse';

const codesOf = (src: string): string[] =>
  parseScript(src).diagnostics.map((d) => `L${d.line ?? 0} ${d.code}`);
function line(src: string, n: number): ScriptLine {
  const l = parseScript(src).lines[n - 1];
  if (!l) throw new Error('linha ausente');
  return l;
}

describe('comentários e linhas', () => {
  it('separa comentário de fim de linha fora de aspas', () => {
    expect(splitComment('GPS:SET:RFLV -120 # nivel')).toEqual({
      body: 'GPS:SET:RFLV -120',
      comment: 'nivel',
    });
    expect(splitComment('GPS:FIL:SET:SAV "a #b"')).toEqual({
      body: 'GPS:FIL:SET:SAV "a #b"',
      comment: null,
    });
    expect(splitComment('X#y')).toEqual({ body: 'X#y', comment: null });
  });

  it('classifica linhas', () => {
    const doc = parseScript('# c\n\n  @mark x\nGPS:SET:RFLV -120 # n\r\n');
    expect(doc.lines.map((l) => l.type)).toEqual(['comment', 'blank', 'directive', 'command']);
    expect(doc.lines[3]?.comment).toBe('n');
  });

  it('script vazio', () => {
    expect(parseScript('').lines).toEqual([]);
  });

  it('posição do erro na linha', () => {
    const d = parseScript('  GPS:SET:CLOS 99').diagnostics[0];
    expect(d?.line).toBe(1);
    expect(d?.span).toEqual({ start: 15, end: 17 });
  });
});

describe('variáveis', () => {
  it('substitui as conhecidas e mantém as de execução', () => {
    const vars = new Map<string, string | null>([
      ['A', '5'],
      ['P', null],
    ]);
    expect(expandVars('x ${A} ${P} ${Z}', vars)).toEqual({
      text: 'x 5 ${P} ${Z}',
      undefinedNames: ['Z'],
      runtimeNames: ['P'],
    });
  });

  it('@set e @input', () => {
    const src =
      '@set PRN 7\nGPS:SVPR:GPS:SAT? ${PRN}\n@input X Digite\nGPS:SVPR:GPS:SAT? ${X}\nGPS:SVPR:GPS:SAT? ${NADA}';
    expect(codesOf(src)).toEqual(['L5 var-undefined']);
    const l2 = line(src, 2);
    expect(l2.type === 'command' && l2.command.values[0]).toMatchObject({
      kind: 'number',
      value: 7,
    });
    const l4 = line(src, 4);
    expect(l4.type === 'command' && l4.command.values[0]).toMatchObject({ kind: 'var' });
  });

  it('nome de variável inválido', () => {
    expect(codesOf('@set 1A x')).toEqual(['L1 directive-args']);
  });
});

describe('diretivas', () => {
  it('reconhece todas', () => {
    const src = [
      '@errcheck on',
      '@wait 1.5',
      '@mark m',
      '@pause p',
      '@set A 1',
      '@input B b',
      '@run',
      '@at 10',
      '@poll 1 5 GPS:SIM:LAT? GPS:SIM:ALT? FT',
      '@expect GPS:SET:UNIT? SI',
      '@stop',
    ].join('\n');
    const doc = parseScript(src);
    expect(doc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const names = doc.lines.map((l) => (l.type === 'directive' ? l.directive?.name : null));
    expect(names).toEqual([
      'errcheck',
      'wait',
      'mark',
      'pause',
      'set',
      'input',
      'run',
      'at',
      'poll',
      'expect',
      'stop',
    ]);
    const poll = doc.lines[8];
    expect(
      poll?.type === 'directive' &&
        poll.directive?.name === 'poll' &&
        poll.directive.queries.map((q) => q.text),
    ).toEqual(['GPS:SIM:LAT?', 'GPS:SIM:ALT? FT']);
  });

  it('erros de diretiva', () => {
    expect(codesOf('@foo')).toEqual(['L1 directive-unknown']);
    expect(codesOf('@wait abc')).toEqual(['L1 directive-args']);
    expect(codesOf('@wait -1')).toEqual(['L1 directive-args']);
    expect(codesOf('@errcheck talvez')).toEqual(['L1 directive-args']);
    expect(codesOf('@expect GPS:SET:UNIT?')).toEqual(['L1 directive-args']);
    expect(codesOf('@expect GPS:SET:UNIT SI')).toContain('L1 expect-not-query');
    expect(codesOf('@run\n@poll 0 5')).toEqual(['L2 directive-args', 'L2 directive-args']);
    expect(codesOf('@at 5')).toEqual(['L1 at-before-run']);
  });

  it('@run e @stop repetidos', () => {
    expect(codesOf('@run\n@run\n@stop\n@stop')).toEqual(['L2 run-twice', 'L4 stop-not-running']);
  });

  it('rejunta argumentos de consultas em @poll', () => {
    expect(rejoinPollQueries(['A:B?', 'FT', '*IDN?', 'C:D?'])).toEqual([
      'A:B? FT',
      '*IDN?',
      'C:D?',
    ]);
  });
});

describe('linha do tempo nominal', () => {
  it('soma @wait, @poll e @at; zera em @run', () => {
    const src =
      '@wait 2\n@run\n@wait 3\n@poll 1 10 GPS:SIM:LAT?\n@at 40\nGPS:SET:RFLV -125\n@at 20\n@stop\n@run\nGPS:SIM:LAT?';
    const doc = parseScript(src);
    const t = doc.lines.map((l) => [l.time.tSession, l.time.tRun]);
    expect(t).toEqual([
      [0, null],
      [2, null],
      [2, 0],
      [5, 3],
      [15, 13],
      [42, 40],
      [42, 40],
      [42, 40],
      [42, 40],
      [42, 0],
    ]);
    expect(doc.runs).toBe(2);
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['at-past']);
  });

  it('@pause torna o tempo mínimo; @run restaura a exatidão de t_run', () => {
    const doc = parseScript('@pause x\n@run\n@at 5\n@input A a\nGPS:SIM:LAT?');
    const at = doc.lines[2];
    expect(at?.time.sessionExact).toBe(false);
    expect(at?.time.runExact).toBe(true);
    expect(doc.lines[4]?.time.runExact).toBe(false);
  });

  it('espera com variável de execução', () => {
    const doc = parseScript('@input T t\n@run\n@at ${T}\n@wait ${T}\nGPS:SIM:LAT?');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.lines[4]?.time.runExact).toBe(false);
  });
});

describe('contexto de estado', () => {
  it('trava em execução e SVPR parado', () => {
    expect(codesOf('@run\nGPS:SET:CARR L2\n@stop\nGPS:SET:CARR L2')).toEqual([
      'L2 locked-while-running',
    ]);
    expect(codesOf('@stop\nGPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0,3600')).toEqual(['L2 runtime-only']);
  });

  it('modo de unidades e porta conhecidos pelo script', () => {
    expect(codesOf('GPS:SIM:ALT 50000')).toEqual(['L1 range-depends-on-units']);
    expect(codesOf('GPS:SET:UNIT IMPERIAL\nGPS:SIM:ALT 50000')).toEqual([]);
    expect(codesOf('GPS:SET:UNIT SI\nGPS:SIM:ALT 50000')).toEqual(['L2 range']);
    expect(codesOf('GPS:SET:RFPR COUPLER\nGPS:SET:RFLV -150')).toEqual(['L2 range']);
    expect(codesOf('GPS:SET:RFPR DIRECT\nGPS:SET:DCAB 3\nGPS:SET:RFLV -157')).toEqual([]);
  });

  it('carga de settings torna o estado desconhecido', () => {
    expect(codesOf('GPS:SET:UNIT SI\nGPS:FIL:SET:LOAD "twin_a"\nGPS:SIM:ALT 50000')).toEqual([
      'L3 range-depends-on-units',
    ]);
  });

  it('comandos destrutivos: confirmação e lote', () => {
    expect(codesOf('GPS:FIL:SET:REM "twin_a"')).toEqual(['L1 destructive']);
    expect(codesOf('@pause confirmar\n@mark x\nGPS:FIL:SET:REM "twin_a"')).toEqual([]);
    expect(codesOf('@pause c\nGPS:FIL:SET:REM "twin_a"\nGPS:FIL:SET:REM "twin_b"')).toEqual([
      'L3 destructive-batch',
    ]);
  });

  it('diagnósticos do redutor (linha de rota inexistente)', () => {
    expect(codesOf('GPS:ROUT:CLR\nGPS:ROUT:DEL 3')).toEqual([
      'L1 destructive',
      'L2 route-unknown-row',
    ]);
  });
});
