import { describe, expect, it } from 'vitest';
import { COMMAND_HEADERS } from './headers.gen';
import { buildIndex, enumValues, getIndex, info, makeInfo, MODEL, shortOf, splitHeader } from './load';
import type { Command, CommandModel } from './types.gen';

function cmd(header: string, extra: Partial<Command> = {}): Command {
  return {
    header,
    kind: header.endsWith('?') ? 'query' : 'set',
    aliases: [],
    params: [],
    query_params: [],
    returns: null,
    example: null,
    locked_while_running: null,
    category: 'setup',
    manual_page: '1-1',
    notes: null,
    discrepancies: [],
    emit_allowed: true,
    verified_on_hw: false,
    ...extra,
  };
}

function model(commands: Command[]): CommandModel {
  return { ...MODEL, commands };
}

describe('modelo', () => {
  it('tem 233 comandos com cabeçalhos únicos e tipos gerados em dia', () => {
    expect(MODEL.commands).toHaveLength(233);
    expect(new Set(MODEL.commands.map((c) => c.header)).size).toBe(233);
    expect([...COMMAND_HEADERS]).toEqual(MODEL.commands.map((c) => c.header));
  });

  it('deriva a forma curta das maiúsculas e dígitos', () => {
    expect(shortOf('CaRrierGPs')).toBe('CRGP');
    expect(shortOf('PLLlock800status')).toBe('PLL800');
    expect(shortOf('*IDN')).toBe('*IDN');
    expect(shortOf('?')).toBe('?');
  });

  it('separa cabeçalhos', () => {
    expect(splitHeader(':SYSTem:ERRor?')).toEqual({ nodes: ['SYSTem', 'ERRor'], isQuery: true, leadingColon: true });
    expect(splitHeader('GPS:?')).toEqual({ nodes: ['GPS', '?'], isQuery: true, leadingColon: false });
    expect(splitHeader('?')).toEqual({ nodes: ['?'], isQuery: true, leadingColon: false });
    expect(splitHeader('*RST')).toEqual({ nodes: ['*RST'], isQuery: false, leadingColon: false });
  });

  it('monta formas curta e longa completas', () => {
    expect(info('GPS:SET:CARRier?').shortHeader).toBe('GPS:SET:CARR?');
    expect(info('GPS:SETup:CouplerCABle').longHeader).toBe('GPS:SETUP:COUPLERCABLE');
    expect(info(':SYSTem:ERRor?').shortHeader).toBe(':SYST:ERR?');
    expect(info('GPS:?').shortHeader).toBe('GPS:?');
    expect(makeInfo(cmd('A:B?', { query_params: [{ name: 'x', type: 'int' }] })).params).toHaveLength(1);
  });

  it('funde nós irmãos com a mesma forma curta (SET e SETup)', () => {
    const gps = getIndex().tree.children.find((c) => c.short === 'GPS');
    const set = gps?.children.find((c) => c.short === 'SET');
    expect(set && [...set.spellings].sort()).toEqual(['SET', 'SETUP']);
    expect(gps?.children.some((c) => c.short === 'SIMU')).toBe(true);
  });

  it('detecta colisão de comandos no mesmo nó', () => {
    expect(() => buildIndex(model([cmd('A:BC'), cmd('A:BCx')]))).toThrow(/colidem/);
  });

  it('detecta grafia ambígua entre irmãos', () => {
    expect(() => buildIndex(model([cmd('A:XY', { aliases: ['ZZ'] }), cmd('A:ZZ')]))).toThrow(/ambígua/);
  });

  it('registra aliases de cabeçalho completo', () => {
    expect(getIndex().fullAliases.get('SYST:ERR?')?.header).toBe(':SYSTem:ERRor?');
  });

  it('lê valores de enum do modelo', () => {
    expect(enumValues('GPS:SET:GNSS', 'gnss')).toEqual(['GPS', 'GALILEO', 'GAL+GPS']);
    expect(() => enumValues('GPS:SET:GNSS', 'xx')).toThrow();
    expect(() => info('GPS:NADA' as never)).toThrow();
  });
});
