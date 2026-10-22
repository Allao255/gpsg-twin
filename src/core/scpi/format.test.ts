import { describe, expect, it } from 'vitest';
import { degToRad } from '../geo';
import { info, type CommandHeader, type Param } from '../model/load';
import { emitDecimals, formatArg, formatCommand, siToEmitUnit } from './format';
import { checkCommand } from './validate';

function param0(h: CommandHeader): Param {
  const p = info(h).params[0];
  if (!p) throw new Error(h);
  return p;
}

describe('emissão de comando', () => {
  it('forma curta e valores formatados', () => {
    expect(formatCommand('GPS:SET:RFLeVel', [-120])).toBe('GPS:SET:RFLV -120');
    expect(formatCommand('GPS:SIM:LATitude', [degToRad(39.2976)])).toBe('GPS:SIM:LAT 39.2976');
    expect(formatCommand('GPS:FILe:SET:SAVe', ['twin_a"b'])).toBe('GPS:FIL:SET:SAV "twin_a""b"');
    expect(formatCommand('GPS:FILe:ALM:DEFault')).toBe('GPS:FIL:ALM:DEF');
    expect(formatCommand('GPS:SIMU:SPeeD?')).toBe('GPS:SIM:SPD?');
  });

  it('SVPR:SAT com passos do modelo', () => {
    expect(
      formatCommand('GPS:SVPR:GPS:SATellite', [
        5,
        'ON',
        'GOOD',
        50.4,
        0.12345,
        -6.04,
        100.0004,
        3600,
      ]),
    ).toBe('GPS:SVPR:GPS:SAT 5,ON,GOOD,50,0.123,-6,100,3600');
  });

  it('rota em SI', () => {
    const line = formatCommand('GPS:ROUT:ADD:POINt', [
      'P1',
      degToRad(37.6499),
      degToRad(-97.4331),
      406,
      5.08,
      44.704,
      9.8,
      100,
    ]);
    expect(line).toBe('GPS:ROUT:ADD:POIN "P1",37.6499,-97.4331,406,5.08,44.704,9.8,100');
    const back = checkCommand(line, { running: false, units: 'SI', port: null, losses: null });
    expect(back.diagnostics).toEqual([]);
  });

  it('casas decimais e unidade de emissão', () => {
    const svpr = info('GPS:SVPR:GPS:SATellite').params;
    expect(svpr.map(emitDecimals)).toEqual([0, 0, 0, 0, 3, 1, 3, 0]);
    expect(emitDecimals(param0('GPS:SET:MaxVELocity'))).toBe(4);
    expect(emitDecimals(param0('GPS:DIAG:AMPLitude'))).toBe(0);
    expect(emitDecimals({ name: 'x', type: 'real' })).toBe(6);
    expect(siToEmitUnit({ name: 'x', type: 'real' }, 3)).toBe(3);
    expect(siToEmitUnit(param0('GPS:SIM:ALTitude'), 3)).toBe(3);
  });

  it('erros de uso', () => {
    expect(() => formatCommand('GPS:SET:RFLeVel', [1, 2])).toThrow();
    expect(() => formatArg({ name: 'x', type: 'real' }, 'a')).toThrow();
    expect(formatArg({ name: 'u', type: 'unit' }, 'FT')).toBe('FT');
  });
});
