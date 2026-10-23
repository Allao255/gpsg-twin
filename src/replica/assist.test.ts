import { describe, expect, it } from 'vitest';
import { info } from '../core/model/load';
import { commandDoc, completeAt, DIRECTIVES, hoverAt } from './assist';

const labels = (line: string, col = line.length): string[] =>
  completeAt(line, col)?.options.map((o) => o.label) ?? [];

describe('completeAt', () => {
  it('cabeçalhos no início da linha: forma curta e longa, sem os proibidos', () => {
    const r = completeAt('  GPS:SET:RF', 12);
    expect(r?.from).toBe(2);
    const all = labels('GPS');
    expect(all).toContain('GPS:SET:RFLV');
    expect(all).toContain('GPS:SET:RFLEVEL');
    expect(all).toContain('GPS:SET:RFLV?');
    // Nunca emitidos (CLAUDE.md) e TRUN direto ficam de fora; a consulta TRUN? fica.
    expect(all).not.toContain('GPS:SYST:CPAS');
    expect(all).not.toContain('GPS:SIM:TRUN');
    expect(all).toContain('GPS:SIM:TRUN?');
    expect(all.some((l) => l.startsWith('GPS:CAL:') && !l.endsWith('?'))).toBe(false);
  });

  it('diretivas depois de @', () => {
    const r = completeAt('@a', 2);
    expect(r?.from).toBe(0);
    expect(r?.options.map((o) => o.label)).toEqual(DIRECTIVES.map((d) => `@${d.name}`));
    expect(r?.options.find((o) => o.label === '@at')?.detail).toBe('@at <s>');
  });

  it('valores de enumeração do parâmetro sob o cursor', () => {
    expect(labels('GPS:SET:RFPR ')).toEqual(['DIRECT', 'COUPLER']);
    const sat = 'GPS:SVPR:GPS:SAT 5,ON,G';
    const r = completeAt(sat, sat.length);
    expect(r?.from).toBe(sat.length - 1);
    expect(r?.options.map((o) => o.label)).toEqual(['GOOD', 'BAD']);
    expect(labels('GPS:SVPR:GPS:SAT 5,')).toEqual(['ON', 'OFF']);
    // Vírgula dentro de aspas não conta como separador.
    expect(labels('GPS:WAYP:NEW "a,b",')).toEqual([]);
  });

  it('sem sugestão: comentário, parâmetro numérico, cabeçalho desconhecido, diretiva com argumentos', () => {
    expect(completeAt('# GPS', 5)).toBeNull();
    expect(completeAt('GPS:SET:RFLV -1', 15)).toBeNull();
    expect(completeAt('GPS:XYZ 1', 9)).toBeNull();
    expect(completeAt('@at 3', 5)).toBeNull();
    expect(completeAt('GPS:SET:RFPR DIRECT,', 20)).toBeNull();
  });
});

describe('hoverAt', () => {
  it('comando: formas, parâmetros com faixa, campo da réplica, discrepâncias', () => {
    const t = hoverAt('GPS:SET:RFLV -120', 5) ?? '';
    expect(t).toMatch(/^GPS:SET:RFLV {2}\(GPS:SET:RFLEVEL\)/);
    expect(t).toMatch(/level \(real\): DIRECT -155\.\.-93; COUPLER -130\.\.-68, dBm/);
    expect(t).toMatch(/Na réplica: RF Level\./);
    expect(t).toMatch(/manuais divergem/);
    expect(t).toMatch(/RP 10-15, não verificado em bancada/);
  });

  it('consulta, trava em execução, forma emitida diferente e TRUN', () => {
    expect(hoverAt('GPS:SET:CLOS? ', 3)).toMatch(/Na réplica: Coupler Loss/);
    expect(hoverAt('GPS:SET:CLOS 3', 3)).toMatch(/Rejeitado com a simulação rodando/);
    expect(hoverAt('GPS:SIM:TRUN', 3)).toMatch(/usar @run e @stop/);
    expect(commandDoc(info('GPS:SYST:CPAS'))).toMatch(/Nunca emitido/);
    expect(commandDoc(info('GPS:SIMU:SPeeD?'))).toMatch(/O twin emite como GPS:SIM:SPD\?/);
  });

  it('parâmetro e diretiva', () => {
    expect(hoverAt('GPS:SVPR:GPS:SAT 5,ON,GOOD,10', 28)).toMatch(
      /^doppler \(real\), parâmetro 4 de GPS:SVPR:GPS:SAT\n-5000\.\.5000, Hz/,
    );
    expect(hoverAt('  @run', 3)).toMatch(/^@run\nConsulta GPS:SIM:TRUN\?/);
    expect(hoverAt('@at 5', 4)).toBeNull();
    expect(hoverAt('@nada', 2)).toBeNull();
  });

  it('nada: comentário, linha vazia, antes do recuo, desconhecido, parâmetro a mais', () => {
    expect(hoverAt('# x', 1)).toBeNull();
    expect(hoverAt('', 0)).toBeNull();
    expect(hoverAt('   GPS:SET:RFLV', 1)).toBeNull();
    expect(hoverAt('GPS:XYZ 1', 2)).toBeNull();
    expect(hoverAt('GPS:SET:RFLV 1,2', 15)).toBeNull();
  });
});
