import { describe, expect, it } from 'vitest';
import { getIndex } from '../model/load';
import { checkCommand } from './validate';

const codes = (t: string, running: boolean | null = null): string[] =>
  checkCommand(t, { running, units: 'SI', port: 'DIRECT', losses: null }).diagnostics.map(
    (d) => `${d.severity}:${d.code}`,
  );

describe('validação de comando', () => {
  it('cabeçalho desconhecido com sugestão', () => {
    const d = checkCommand('GPS:SET:CARX L1').diagnostics[0];
    expect(d?.code).toBe('unknown-header');
    expect(d?.message).toMatch(/GPS:SET:CARR/);
  });

  it('forma de consulta ou ajuste inexistente', () => {
    expect(codes('GPS:SIM:ETIM')).toContain('error:no-set-form');
    expect(codes('GPS:ROUT:CLR?')).toContain('error:no-query-form');
  });

  it('linha vazia', () => {
    expect(checkCommand('').info).toBeNull();
  });

  it('grafia aceita por tratamento provisório gera informação', () => {
    expect(codes('GPS:SIM:SPD?')).toEqual(['info:known-misspelling']);
  });

  it('nunca emitir: *RST, calibração, senha', () => {
    expect(codes('*RST')).toContain('error:emit-forbidden');
    expect(codes('GPS:CAL:RFCV:VAL 1')).toContain('error:emit-forbidden');
    expect(codes('GPS:SYST:CPAS "a","b"')).toContain('error:emit-forbidden');
    expect(codes('GPS:CAL:RFCV:VAL?')).toEqual([]);
  });

  it('TRUN direto é erro; consulta é permitida', () => {
    expect(codes('GPS:SIM:TRUN')).toContain('error:trun-direct');
    expect(codes('GPS:SIM:TRUN?')).toEqual([]);
  });

  it('RTRJ não emitido (D15)', () => {
    expect(codes('GPS:GPSR:RTRJ')).toContain('warning:emit-forbidden');
  });

  it('trava durante a execução', () => {
    expect(codes('GPS:SET:CARR L2', true)).toContain('error:locked-while-running');
    expect(codes('GPS:SET:CARR L2', false)).toEqual([]);
    expect(codes('GPS:SET:CARR?', true)).toEqual([]);
    expect(codes('GPS:SET:RFLV -125', true)).toEqual([]);
  });

  it('SVPR:SAT com a simulação parada', () => {
    expect(codes('GPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0,3600', false)).toContain(
      'warning:runtime-only',
    );
    expect(codes('GPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0,3600', true)).toEqual([]);
  });

  it('marca comandos destrutivos', () => {
    expect(checkCommand('GPS:FIL:SET:CLR').destructive).toBe(true);
    expect(checkCommand('GPS:FIL:SET:REM "twin_x"').destructive).toBe(true);
    expect(checkCommand('GPS:ROUT:CLR').destructive).toBe(true);
    expect(checkCommand('GPS:WAYP:CLR').destructive).toBe(true);
    expect(checkCommand('GPS:FIL:SET:LOAD "twin_x"').destructive).toBe(false);
  });
});

// Critério de aceite do M1: todo `example` do modelo passa por parse sem erro, ou falha com erro
// ligado à discrepância documentada.
describe('exemplos do modelo', () => {
  const EXPECTED_ERRORS: Record<string, string> = {
    'GPS:FILE:KML:STIME 4 Hz': 'D25',
    'GPS:SET:PORT DIRECT': 'D05',
    'GPS:SET:SLOS 12.2': 'D14',
    'GPS:SET:CHAN:SBAS 6': 'D09',
  };
  const examples = getIndex().infos.filter((i) => i.cmd.example !== null);

  it('há exemplos', () => {
    expect(examples.length).toBe(40);
  });

  for (const inf of examples) {
    const ex = inf.cmd.example ?? '';
    it(ex, () => {
      const errors = checkCommand(ex).diagnostics.filter((d) => d.severity === 'error');
      const d = EXPECTED_ERRORS[ex];
      if (d === undefined) {
        expect(errors).toEqual([]);
      } else {
        expect(errors.length).toBeGreaterThan(0);
        for (const e of errors) expect(e.dRefs).toContain(d);
      }
    });
  }
});
