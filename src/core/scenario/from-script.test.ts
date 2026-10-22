import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { radToDeg } from '../geo';
import { parseScript } from '../script/parse';
import { CONFIG_FIELDS, sanitizeName, scenarioFromScript } from './from-script';

const from = (src: string, name?: string) =>
  scenarioFromScript(parseScript(src), name ? { name } : {});

describe('script para cenário', () => {
  it('exemplo S00 do manual remoto', () => {
    const src = [
      '@errcheck on',
      'GPS:FIL:SET:SAV "bkp_twin"',
      'GPS:SET:UNIT SI',
      'GPS:SET:RFPR DIRECT',
      'GPS:SET:RFLV -120',
      'GPS:SET:CARR L1/E1',
      'GPS:SET:CLOC USER',
      'GPS:SET:TIM "11:11:11"',
      'GPS:SET:DAT "04/14/2013"',
      'GPS:SET:STYP STATIC',
      'GPS:SIM:LAT 39.2976',
      'GPS:SIM:LONG -94.7139',
      'GPS:SIM:ALT 300',
      '@pause Confirmar carga',
      '@run',
      '@poll 1 30 GPS:SIM:LAT? GPS:SIM:LONG? GPS:SIM:TIM?',
      '@at 40',
      'GPS:SVPR:GPS:LIST?',
      '@stop',
    ].join('\n');
    const r = from(src, 'S00 estático');
    const sc = r.scenario;
    expect(sc.name).toBe('s00_estatico');
    expect(radToDeg(sc.position.lat_rad)).toBeCloseTo(39.2976, 10);
    expect(sc.position.alt_m).toBe(300);
    expect(new Date(sc.setup.userTime_s * 1000).toISOString()).toBe('2013-04-14T11:11:11.000Z');
    expect(sc.run.stopAt_s).toBe(40);
    expect(sc.files.almanac).toEqual({ kind: 'equipment' });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['almanac-not-fixed']);
    expect(r.unset).toContain('setup.gnss');
    expect(r.unset).not.toContain('setup.rfPort');
  });

  it('ações em execução e diagnósticos', () => {
    const src = [
      'GPS:FIL:ALM:DEF',
      'GPS:DIAG:MOD CW',
      '@run',
      '@at 10',
      'GPS:SVPR:GPS:SAT 5,ON,GOOD,0,0,0,0',
      'GPS:SVPR:GAL:SAT 3,OFF,DISCONNECTED,10,0,0,0,60',
      'GPS:SET:RFLV -125',
      'GPS:ROUT:LOOP ON',
      'GPS:SET:CARR L2',
      '@input X x',
      'GPS:SVPR:GPS:SAT ${X},ON,GOOD,0,0,0,0,3600',
      '@wait 5',
      'GPS:SET:RFLV -126',
      '@stop',
      'GPS:SET:RFLV -127',
      '@run',
      'GPS:SET:RFLV -128',
    ].join('\n');
    const r = from(src);
    expect(r.scenario.actions).toEqual([
      expect.objectContaining({
        t_s: 10,
        type: 'sv',
        constellation: 'GPS',
        sv: 5,
        duration_s: 3600,
      }),
      expect.objectContaining({
        t_s: 10,
        type: 'sv',
        constellation: 'GAL',
        sv: 3,
        health: 'DISCONNECTED',
        doppler_Hz: 10,
        duration_s: 60,
      }),
      { t_s: 10, type: 'rfLevel', level_dBm: -125 },
      { t_s: 15, type: 'rfLevel', level_dBm: -126 },
    ]);
    expect(r.scenario.run.stopAt_s).toBe(15);
    expect(r.diagnostics.map((d) => `L${d.line ?? 0} ${d.code}`)).toEqual([
      'L2 not-represented',
      'L8 not-represented',
      'L11 time-approximate',
      'L11 var-runtime',
      'L13 time-approximate',
      'L14 time-approximate',
      'L15 not-represented',
      'L16 multi-run',
    ]);
  });

  it('S01: duas execuções, primeira representada', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '../../../sessions/S01-sonda.scpi'),
      'utf8',
    );
    const r = from(src);
    expect(r.diagnostics.some((d) => d.code === 'multi-run')).toBe(true);
    expect(r.scenario.files.almanac).toEqual({ kind: 'default' });
    expect(
      r.scenario.actions
        .filter((a) => a.type === 'rfLevel')
        .map((a) => a.type === 'rfLevel' && a.level_dBm),
    ).toEqual([-125, -130]);
    expect(r.scenario.run.stopAt_s).not.toBeNull();
  });

  it('metadados do cabeçalho', () => {
    const r = from('# twin-scenario: abc_1\n# twin-description: texto livre\n');
    expect(r.scenario.name).toBe('abc_1');
    expect(r.scenario.description).toBe('texto livre');
    expect(r.unset).toEqual(CONFIG_FIELDS);
  });

  it('nome saneado', () => {
    expect(sanitizeName('Ensaio Ação 1!')).toBe('ensaio_acao_1');
    expect(sanitizeName('***')).toBe('cenario');
  });
});
