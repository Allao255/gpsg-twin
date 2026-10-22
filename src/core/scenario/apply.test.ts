import { describe, expect, it } from 'vitest';
import { checkCommand } from '../scpi/validate';
import { applyCommand, representedHeaders } from './apply';
import { defaultScenario } from './defaults';
import type { Scenario } from './types';

const SI = { running: false, units: 'SI' as const, port: null, losses: null };

function apply(lines: string[], start: Scenario = defaultScenario()): Scenario {
  let s = start;
  for (const l of lines) {
    const r = applyCommand(s, checkCommand(l, SI));
    if (r.kind === 'applied') s = r.state;
  }
  return s;
}

describe('redutor', () => {
  it('não altera o estado de entrada', () => {
    const s0 = defaultScenario();
    const r = applyCommand(s0, checkCommand('GPS:SET:GNSS GALILEO', SI));
    expect(r.kind === 'applied' && r.state.setup.gnss).toBe('GALILEO');
    expect(s0.setup.gnss).toBe('GPS');
  });

  it('classifica comandos', () => {
    const s = defaultScenario();
    expect(applyCommand(s, checkCommand('GPS:SET:GNSS?', SI)).kind).toBe('ignored');
    expect(applyCommand(s, checkCommand('GPS:FIL:SET:SAV "twin_x"', SI)).kind).toBe('ignored');
    expect(applyCommand(s, checkCommand('GPS:DIAG:MOD CW', SI)).kind).toBe('unrepresented');
    expect(applyCommand(s, checkCommand('GPS:SET:GNSS XX', SI)).kind).toBe('invalid');
    expect(
      applyCommand(s, checkCommand('GPS:SVPR:GPS:SAT ${P},ON,GOOD,0,0,0,0,3600', SI)).kind,
    ).toBe('unrepresented');
    expect(applyCommand(s, checkCommand('GPS:SIM:ALT ${A}', SI)).kind).toBe('invalid');
  });

  it('setup, I/O, movimento e canais', () => {
    const s = apply([
      'GPS:SET:CRGP L5',
      'GPS:SET:RSRC EXT',
      'GPS:SET:DAT "12/31/2024"',
      'GPS:SET:TIM "23:59:58"',
      'GPS:SET:CCAB 2.5',
      'GPS:SET:MLAT 5',
      'GPS:SET:CHAN:GNSS 6',
      'GPS:SET:CHAN:DUAL:GPS 3',
      'GPS:SET:CHAN:APPL',
    ]);
    expect(s.setup.carrier).toEqual({ command: 'GPS:SET:CaRrierGPs', token: 'L5' });
    expect(s.setup.referenceSource).toBe('EXTERNAL');
    expect(new Date(s.setup.userTime_s * 1000).toISOString()).toBe('2024-12-31T23:59:58.000Z');
    expect(s.io.couplerCable_dB).toBe(2.5);
    expect(s.motion.custom).toEqual({
      maxLateral_mps2: 5,
      maxLongitudinal_mps2: 98,
      maxVelocity_mps: 514.096,
    });
    expect(s.channels).toMatchObject({ gnss: 6, dualGps: 3 });
    const s2 = apply(['GPS:SET:MMDE', 'GPS:SET:CHAN:DUAL:DEF', 'GPS:SET:RSRC INT'], s);
    expect(s2.motion.custom).toBeNull();
    expect(s2.channels.dualGps).toBeNull();
    expect(s2.setup.referenceSource).toBe('INTERNAL');
  });

  it('data e hora em qualquer ordem', () => {
    const s = apply(['GPS:SET:TIM "06:00:00"', 'GPS:SET:DAT "01/02/2020"']);
    expect(new Date(s.setup.userTime_s * 1000).toISOString()).toBe('2020-01-02T06:00:00.000Z');
  });

  it('rota: inclusão, edição, remoção, carga', () => {
    let s = apply([
      'GPS:ROUT:CLR',
      'GPS:ROUT:ADD:POIN "a",1,2,3,4,5,6,7',
      'GPS:ROUT:ADD:WAYP "SFO",1,2,3,4',
      'GPS:ROUT:EDIT 2,"b",1,1,1,1,1,1,1',
      'GPS:ROUT:LOOP ON',
    ]);
    expect(s.route.points.map((p) => (p.kind === 'point' ? p.name : p.code))).toEqual(['a', 'b']);
    expect(s.route.loop).toBe('ON');
    s = apply(['GPS:ROUT:DEL 1'], s);
    expect(s.route.points).toHaveLength(1);
    const bad = applyCommand(s, checkCommand('GPS:ROUT:EDIT 5,"x",1,1,1,1,1,1,1', SI));
    expect(bad.kind === 'applied' && bad.diagnostics[0]?.code).toBe('route-unknown-row');
    s = apply(['GPS:FIL:ROUT:LOAD "twin_r.rte"'], s);
    expect(s.files.route).toBe('twin_r.rte');
    expect(s.route.points).toEqual([]);
    const fromFile = applyCommand(s, checkCommand('GPS:ROUT:DEL 1', SI));
    expect(fromFile.kind === 'applied' && fromFile.diagnostics[0]?.message).toMatch(/arquivo/);
    s = apply(['GPS:ROUT:LOAD "twin_q.rte"', 'GPS:ROUT:CLR'], s);
    expect(s.files.route).toBeNull();
  });

  it('waypoints de usuário', () => {
    const w = (code: string, name: string): string =>
      `GPS:WAYP:NEW "${code}","K","${name}","c","s",1,2,3`;
    let s = apply([w('a', 'A'), w('b', 'B'), w('a', 'A2')]);
    expect(s.userWaypoints.map((x) => `${x.code}:${x.name}`)).toEqual(['b:B', 'a:A2']);
    s = apply(
      [
        'GPS:WAYP:EDIT "b","K","B2","c","s",1,2,3',
        'GPS:WAYP:EDIT "c","K","C","c","s",1,2,3',
        'GPS:WAYP:DEL "a"',
      ],
      s,
    );
    expect(s.userWaypoints.map((x) => `${x.code}:${x.name}`)).toEqual(['b:B2', 'c:C']);
    expect(apply(['GPS:WAYP:CLR'], s).userWaypoints).toEqual([]);
  });

  it('arquivos e almanaque', () => {
    const s = apply([
      'GPS:FIL:SET:IMP',
      'GPS:FIL:SET:IMP',
      'GPS:FIL:ROUT:IMP',
      'GPS:FIL:NMEA:IMP',
      'GPS:FIL:WAYP:IMP',
      'GPS:FIL:ALM:IMP',
      'GPS:FIL:SET:LOAD "twin_s"',
      'GPS:FIL:NMEA:LOAD "twin_t.nme"',
      'GPS:FIL:KML:LOAD "twin_k.kml"',
      'GPS:FIL:ALM:LOAD "twin_a.alm"',
    ]);
    expect(s.files).toMatchObject({
      imports: ['SET', 'ROUT', 'NMEA', 'WAYP', 'ALM'],
      settings: 'twin_s',
      nmea: 'twin_t.nme',
      kml: 'twin_k.kml',
      almanac: { kind: 'file', name: 'twin_a.alm' },
    });
    expect(apply(['GPS:FIL:ALM:REL'], s).files.almanac).toEqual({ kind: 'equipment' });
    expect(apply(['GPS:GPSR:REL'], s).files.almanac).toEqual({ kind: 'equipment' });
    expect(apply(['GPS:FIL:ALM:DEF'], s).files.almanac).toEqual({ kind: 'default' });
  });

  it('todo cabeçalho tratado existe no modelo como set ou action', () => {
    for (const h of representedHeaders()) expect(h.endsWith('?'), h).toBe(false);
  });
});
