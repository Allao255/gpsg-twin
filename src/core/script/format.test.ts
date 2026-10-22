import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalNumberText, formatScript } from './format';
import { parseScript } from './parse';

const SESSIONS = resolve(import.meta.dirname, '../../../sessions');
const scripts = readdirSync(SESSIONS).filter((f) => f.endsWith('.scpi'));

const canon = (s: string): string => formatScript(parseScript(s), 'canonical');

describe('formatação de script', () => {
  it('há scripts em sessions/', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  // Critério de aceite do M1: emit(parse(s)) idempotente para os scripts de sessions/.
  for (const f of scripts) {
    const src = readFileSync(resolve(SESSIONS, f), 'utf8');
    it(`${f}: preserve reproduz o arquivo e é idempotente`, () => {
      const a = formatScript(parseScript(src), 'preserve');
      expect(a).toBe(src);
      expect(formatScript(parseScript(a), 'preserve')).toBe(a);
    });
    it(`${f}: canonical é idempotente e mantém o número de linhas`, () => {
      const a = canon(src);
      expect(canon(a)).toBe(a);
      expect(a.split('\n').length).toBe(src.split('\n').length);
    });
  }

  it('forma canônica de comandos', () => {
    const src = [
      'gps:setup:rfport direct',
      "GPS:SET:PSRC 'USER'",
      'GPS:SET:PSRC "USER"',
      "GPS:FIL:SET:SAV 'twin_a'",
      'GPS:SET:CLOS +12.50',
      'GPS:SIM:LONG 105,45.8912,W',
      'GPS:SIM:LAT 045.30',
      'GPS:SVPR:GPS:SAT 1,on,good,0,0,0,0',
      'GPS:SIMU:SPD?',
      'GPS:SIM:ALT 1000 FT',
      'GPS:SVPR:GPS:SAT ${P},ON,GOOD,0,0,0,0,3600',
      'GPS:SET:PORT DIRECT',
      'GPS:SIM:ALT? ft',
    ].join('\n');
    expect(canon(`@input P p\n${src}`).split('\n').slice(1, -1)).toEqual([
      'GPS:SET:RFPR DIRECT',
      'GPS:SET:PSRC USER',
      'GPS:SET:PSRC USER',
      'GPS:FIL:SET:SAV "twin_a"',
      'GPS:SET:CLOS 12.5',
      'GPS:SIM:LONG -105.764853333',
      'GPS:SIM:LAT 45.3',
      'GPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0,3600',
      'GPS:SIM:SPD?',
      'GPS:SIM:ALT 1000 FT',
      'GPS:SVPR:GPS:SAT ${P},ON,GOOD,0,0,0,0,3600',
      'GPS:SET:PORT DIRECT',
      'GPS:SIM:ALT? ft',
    ]);
  });

  it('forma canônica de diretivas e comentários', () => {
    const src =
      '#x\n#\n@WAIT 01.50 # c\n@Run\n@AT 10\n@poll 1 5 gps:sim:lat?\n@expect gps:set:unit? SI\n@errcheck OFF\n@mark\n@pause  ok\n@set A 1\n@input B b\n@stop\n@foo bar\n';
    expect(canon(src)).toBe(
      '# x\n#\n@wait 1.5 # c\n@run\n@at 10\n@poll 1 5 GPS:SIM:LAT?\n@expect GPS:SET:UNIT? SI\n@errcheck off\n@mark\n@pause ok\n@set A 1\n@input B b\n@stop\n@foo bar\n',
    );
  });

  it('comentário vazio de fim de linha', () => {
    expect(canon('@run #\n')).toBe('@run #\n');
  });

  it('números canônicos', () => {
    expect(canonicalNumberText('+1.0')).toBe('1');
    expect(canonicalNumberText('1e-7')).toBe('0.0000001');
    expect(canonicalNumberText('abc')).toBe('abc');
  });
});
