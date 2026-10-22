import { describe, expect, it } from 'vitest';
import { DEFAULT_ALMANAC, helpList, Instrument } from './instrument';

function inst(): {
  m: Instrument;
  clock: { t: number };
  send: (l: string) => string | null;
  err: () => string;
} {
  const clock = { t: 0 };
  const m = new Instrument({ now: () => clock.t, prns: { GPS: [1, 5], GAL: [2] } });
  return { m, clock, send: (l) => m.handle(l), err: () => m.handle(':SYST:ERR?') ?? '' };
}

describe('instrumento simulado: protocolo', () => {
  it('fila de erros com código SCPI e "No error" quando vazia', () => {
    const { send, err } = inst();
    expect(send('GPS:SET:PORT DIRECT')).toBeNull();
    expect(err()).toMatch(/^-113,"Undefined header; /);
    expect(err()).toBe('0,"No error"');
    expect(send('')).toBeNull();
  });

  it('mapeia diagnósticos para códigos', () => {
    const { send, err } = inst();
    const cases: [string, string][] = [
      ['GPS:SET:CLOS 99', '-222'],
      ['GPS:SET:GNSS GLONASS', '-224'],
      ['GPS:SET:CLOS', '-109'],
      ['GPS:SET:CLOS 1,2', '-108'],
      ['GPS:SET:CLOS abc', '-104'],
      ['GPS:FIL:SET:SAV "abc', '-151'],
      ['GPS:SET:CLOS 1 dB', '-131'],
      ['GPS:SET:DAT "13/40/2020"', '-224'],
      ['GPS:SET:RFLV -120', ''],
      ['GPS:SET:RFLV -120;GPS:SET:RFLV -121', '-100'],
      [`GPS:ROUT:ADD:WAYP "${'x'.repeat(81)}",0,0,0,0`, '-223'],
    ];
    for (const [cmd, code] of cases) {
      send(cmd);
      const e = err();
      if (code === '') expect(e, cmd).toBe('0,"No error"');
      else expect(e.split(',')[0], cmd).toBe(code);
    }
  });

  it('transborda a fila em 10 entradas', () => {
    const { send, err } = inst();
    for (let i = 0; i < 12; i++) send('NADA');
    const all = Array.from({ length: 11 }, err);
    expect(all[9]).toBe('-350,"Queue overflow"');
    expect(all[10]).toBe('0,"No error"');
  });

  it('comandos comuns', () => {
    const { m, send, err } = inst();
    expect(send('*IDN?')).toMatch(/GPSG-1000 mock/);
    expect(send('*OPC?')).toBe('1');
    expect(send('*ESR?')).toBe('0');
    send('*ESE 12');
    send('*SRE 3');
    expect(send('*ESE?')).toBe('12');
    expect(send('*SRE?')).toBe('3');
    send('NADA');
    expect(send('*STB?')).toBe('4');
    send('*CLS');
    expect(send('*STB?')).toBe('0');
    expect(err()).toBe('0,"No error"');
    send('GPS:SET:GNSS GALILEO');
    send('*RST');
    expect(m.state.setup.gnss).toBe('GPS');
  });

  it('ajuda por seção', () => {
    const { send } = inst();
    expect(send('GPS:? ROUTE')).toContain('GPS:ROUT:ADD:POINt');
    expect(helpList('ALL')).toHaveLength(233);
    expect(helpList('SET').every((h) => h.startsWith('GPS:SET'))).toBe(true);
    expect(helpList('GEN')).toContain('*IDN?');
    expect(helpList('GEN')).not.toContain('GPS:SET:GNSS');
  });
});

describe('instrumento simulado: execução', () => {
  it('TRUN alterna, trava parâmetros e conta o tempo', () => {
    const { m, clock, send, err } = inst();
    expect(send('GPS:SIM:TRUN?')).toBe('"Stopped"');
    send('GPS:SIM:TRUN');
    expect(send('GPS:SIM:TRUN?')).toBe('"Running"');
    expect(send('GPS:STAT?')).toBe('"Simulation running"');
    send('GPS:SET:CARR L2');
    expect(err()).toMatch(/^-221/);
    send('GPS:SET:RFLV -125');
    expect(send('GPS:SET:RFLV?')).toBe('-125');
    clock.t = 65_000;
    expect(send('GPS:SIM:ETIM?')).toBe('"00:01:05"');
    expect(send('GPS:SIM:TIM?')).toBe('"11:12:16"');
    expect(send('GPS:SIM:DAT?')).toBe('"04/14/2013"');
    send('GPS:SIM:TRUN');
    expect(m.running).toBe(false);
    clock.t = 99_000;
    expect(send('GPS:SIM:ETIM?')).toBe('"00:01:05"');
    expect(send('GPS:SIM:TIM?')).toBe('"11:11:11"');
  });

  it('PRNs e manipulação por SV', () => {
    const { send } = inst();
    expect(send('GPS:SIM:GPS:PRN?')).toBe('""');
    expect(send('GPS:SVPR:GPS:LIST?')).toBe('""');
    send('GPS:SIM:TRUN');
    expect(send('GPS:SIM:GPS:PRN?')).toBe('"1, 5"');
    expect(send('GPS:SIM:GPS:VSVS?')).toBe('2');
    expect(send('GPS:SIM:GAL:PRN?')).toBe('""');
    send('GPS:SVPR:GPS:SAT 5,OFF,BAD,50,0.5,-6,100,10');
    expect(send('GPS:SVPR:GPS:SAT? 5')).toBe(
      '"5,60.0000,265.0000,-126,-6,50,0.5,100,10,Bad,OFF,OFF"',
    );
    expect(send('GPS:SVPR:GPS:LIST?')?.split('\n')).toHaveLength(2);
    send('GPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0');
    expect(send('GPS:SVPR:GPS:SAT? 1')).toMatch(/,3600,Good,ON,ON"$/);
    send('GPS:SET:GNSS GAL+GPS');
  });

  it('Galileo', () => {
    const { send } = inst();
    send('GPS:SET:GNSS GALILEO');
    send('GPS:SIM:TRUN');
    expect(send('GPS:SIM:GAL:PRN?')).toBe('"2"');
    expect(send('GPS:SIM:GPS:PRN?')).toBe('""');
    send('GPS:SVPR:GAL:SAT 2,ON,DISCONNECTED,10,0,0,0,60');
    expect(send('GPS:SVPR:GAL:LIST?')).toMatch(/Disconnected,ON,ON"$/);
    expect(send('GPS:SVPR:GAL:SAT? 3')).toMatch(/Connected,ON,OFF"$/);
  });

  it('consultas de execução sem simulação', () => {
    const { send } = inst();
    expect(send('GPS:SIMU:SPD?')).toBe('0');
    expect(send('GPS:SIM:SPD?')).toBe('0');
    expect(send('GPS:SIM:HEAD?')).toBe('"0°"');
    expect(send('GPS:SIM:ARAT?')).toBe('0');
    expect(send('GPS:SIM:DTG?')).toBe('0');
    expect(send('GPS:SIM:EREF?')).toBe('OFF');
    expect(send('GPS:SIM:GPS:CARR?')).toBe('"L1/E1"');
    expect(send('GPS:SIM:GAL:CARR?')).toBe('"L1/E1"');
    expect(send('GPS:SIM:GPS:ADV?')).toBe('""');
    expect(send('GPS:SIM:GAL:ADV?')).toBe('""');
    expect(send('GPS:SIM:SBAS:SBAS?')).toBe('OFF');
    expect(send('GPS:SIM:SBAS:VSVS?')).toBe('0');
    expect(send('GPS:SIM:SBAS:PRN?')).toBe('""');
    expect(send('GPS:SIM:GAL:VSVS?')).toBe('0');
    expect(send('GPS:SIM:FROM?')).toBe('""');
  });
});

describe('instrumento simulado: estado configurado', () => {
  it('consultas refletem o estado, com tokens de consulta do modelo', () => {
    const { send } = inst();
    send('GPS:SET:GNSS GAL+GPS');
    send('GPS:SET:PRNS VARIABLE');
    send('GPS:SET:DAT "08/22/2010"');
    send('GPS:SET:TIM "01:02:03"');
    send('GPS:SET:CLOS 21.5');
    expect(send('GPS:SET:GNSS?')).toBe('"BOTH"');
    expect(send('GPS:SET:PRNS?')).toBe('VAR');
    expect(send('GPS:SET:DAT?')).toBe('"Aug 22 2010"');
    expect(send('GPS:SET:TIM?')).toBe('"01:02:03"');
    expect(send('GPS:SET:CLOS?')).toBe('21.5');
    expect(send('GPS:SET:CCAB?')).toBe('0');
    expect(send('GPS:SET:DCAB?')).toBe('0');
    expect(send('GPS:SET:SLOS?')).toBe('0');
    expect(send('GPS:SET:UNIT?')).toBe('"SI"');
    expect(send('GPS:SET:CARR?')).toBe('"L1/E1"');
    expect(send('GPS:SET:SBAS?')).toBe('OFF');
    expect(send('GPS:SET:STYP?')).toBe('STATIC');
    expect(send('GPS:SET:DNOS?')).toBe('ON');
    expect(send('GPS:SET:FAD?')).toBe('"NONE"');
    expect(send('GPS:SET:PSRC?')).toBe('USER');
    expect(send('GPS:SET:CLOC?')).toBe('USER');
    expect(send('GPS:SET:RFPR?')).toBe('DIRECT');
    expect(send('GPS:SET:TSRC?')).toBe('AUTO');
    expect(send('GPS:SET:EREF?')).toBe('OFF');
    expect(send('GPS:SET:RSRC?')).toBe('"INTERNAL"');
    expect(send('GPS:SET:CRMM?')).toBe('"UNLIMITED"');
    expect(send('GPS:SIM:LAT?')).toBe('39.2976');
    expect(send('GPS:SIM:LONG?')).toBe('-94.7139');
  });

  it('unidades: modo corrente e unidade pedida na consulta (D04)', () => {
    const { send } = inst();
    send('GPS:SIM:ALT 304.8');
    expect(send('GPS:SIM:ALT?')).toBe('304.8');
    expect(send('GPS:SIM:ALT? FT')).toBe('1000');
    send('GPS:SET:UNIT IMPERIAL');
    expect(send('GPS:SIM:ALT?')).toBe('1000');
    send('GPS:SET:CRMM PEDESTRIAN');
    expect(send('GPS:SET:MVEL?')).toBe('24.0023');
    send('GPS:SET:UNIT SI');
    expect(send('GPS:SET:MVEL?')).toBe('10.73');
    send('GPS:SET:MLAT 5');
    expect(send('GPS:SET:MLAT?')).toBe('5');
    expect(send('GPS:SET:MLON?')).toBe('98');
  });

  it('canais', () => {
    const { send } = inst();
    expect(send('GPS:SET:CHAN:AVAL?')).toBe('12');
    expect(send('GPS:SET:CHAN:GNSS?')).toBe('11');
    expect(send('GPS:SET:CHAN:SBAS?')).toBe('1');
    expect(send('GPS:SET:CHAN:DUAL:GPS?')).toBe('3');
    expect(send('GPS:SET:CHAN:DUAL:GAL?')).toBe('3');
    expect(send('GPS:SET:CHAN:DUAL:SBAS?')).toBe('0');
    send('GPS:SET:CHAN:GNSS 6');
    expect(send('GPS:SET:CHAN:GNSS?')).toBe('6');
    send('GPS:SET:CHAN:APPL');
    expect(send('GPS:STAT?')).toBe('"Channel configuration applied"');
  });

  it('comandos sem representação no cenário guardam o valor', () => {
    const { send } = inst();
    expect(send('GPS:DIAG:MOD?')).toBe('OFF');
    send('GPS:DIAG:MOD CW');
    expect(send('GPS:DIAG:MOD?')).toBe('CW');
    send('GPS:FIL:KML:STIM 4 Hz');
    expect(send('GPS:FIL:KML:STIM?')).toBe('"4 Hz"');
    expect(send('GPS:FIL:KML:MTR?')).toBe('"0"');
    expect(send('GPS:GPSR:REC?')).toBe('"INTERNAL"');
    expect(send('GPS:DIAG:LAMP?')).toBe('"-46.8 dBm"');
    expect(send('GPS:DIAG:PLLL?')).toBe('1');
    expect(send('GPS:DIAG:PLL8?')).toBe('1');
    expect(send('GPS:DIAG:PLLX?')).toBe('0');
    expect(send('GPS:DIAG:PLXR?')).toBe('0');
    expect(send('GPS:CAL:RLCV:STATUS?')).toBe('"Ready"');
    expect(send('GPS:CAL:RLCV:DONE?')).toBe('""');
    expect(send('GPS:GPSR:FIX?')).toBe('"No position fix"');
    expect(send('GPS:GPSR:AST?')).toBe('"Not loaded"');
    expect(send('GPS:GPSR:CTIM?')).toBe('""');
    expect(send('GPS:GPSR:ASAT?')).toBe('"0"');
    expect(send('GPS:GPSR:LAT?')).toBe('0');
    expect(send('GPS:GPSR:LONG?')).toBe('0');
    expect(send('GPS:GPSR:ALT?')).toBe('0');
    expect(send('GPS:GPSR:SPEED?')).toBe('0');
    expect(send('GPS:GPSR:RTRJ?')).toBe('"Not Recording"');
    send('GPS:GPSR:RTRJ');
    expect(send('GPS:GPSR:RTRJ?')).toBe('"Recording"');
    expect(send('GPS:CAL:RFCV:VAL?')).toBe('0');
  });
});

describe('instrumento simulado: rota, waypoints e arquivos', () => {
  it('rota e validação', () => {
    const { send, err } = inst();
    send('GPS:ROUT:VALD');
    expect(send('GPS:STAT?')).toMatch(/invalid/);
    send('GPS:ROUT:ADD:POIN "twin_a",39.2976,-94.7139,312,5,50,9.8,100');
    send('GPS:ROUT:ADD:WAYP "SFO",5,50,9.8,100');
    send('GPS:WAYP:NEW "SFO","","x","","",37.6,-122.4,4');
    send('GPS:ROUT:VALD');
    expect(send('GPS:STAT?')).toBe('"Route valid (mock): 2 points"');
    expect(send('GPS:ROUT:LIST?')).toBe(
      '"1,twin_a,39.2976,-94.7139,312,5,50,9.8,100\n2,SFO,37.6,-122.4,4,5,50,9.8,100"',
    );
    expect(send('GPS:ROUT:DISP? 1')).toMatch(/^"1,twin_a/);
    expect(send('GPS:ROUT:DISP? 9')).toBeNull();
    expect(err()).toMatch(/^-222/);
    send('GPS:ROUT:DEL 7');
    expect(err()).toMatch(/^-222/);
    send('GPS:SET:STYP DYNAMIC');
    expect(send('GPS:SIM:FROM?')).toBe('"twin_a"');
    expect(send('GPS:SIM:TO?')).toBe('"SFO"');
    send('GPS:ROUT:ADD:WAYP "XYZ",5,50,9.8,100');
    expect(send('GPS:ROUT:DISP? 3')).toBe('"3,XYZ,0,0,0,5,50,9.8,100"');
  });

  it('waypoints de usuário', () => {
    const { send, err } = inst();
    send('GPS:WAYP:NEW "twin_w","","Nome","","",1,2,3');
    expect(send('GPS:WAYP:LIST?')).toBe('"twin_w,,Nome,,,1,2,3"');
    expect(send('GPS:WAYP:DISP? "twin_w"')).toBe('"twin_w,,Nome,,,1,2,3"');
    expect(send('GPS:WAYP:DISP? "nada"')).toBeNull();
    expect(err()).toMatch(/^-224/);
    send('GPS:FIL:WAYP:CLR');
    expect(send('GPS:WAYP:LIST?')).toBe('""');
    send('GPS:FIL:WAYP:IMP');
    expect(send('GPS:STAT?')).toMatch(/Import complete: WAYP/);
    send('GPS:FIL:WAYP:EXP');
    expect(send('GPS:STAT?')).toMatch(/Export complete: WAYP/);
  });

  it('settings: salvar, carregar, listar, remover, padrão', () => {
    const { m, send, err } = inst();
    send('GPS:SET:GNSS GALILEO');
    send('GPS:FIL:SET:SAV "twin_a"');
    send('GPS:SET:GNSS GPS');
    expect(send('GPS:FIL:SET:FLST?')).toBe('"twin_a"');
    send('GPS:FIL:SET:LOAD "twin_a"');
    expect(m.state.setup.gnss).toBe('GALILEO');
    expect(send('GPS:FIL:SET:FNAM?')).toBe('"twin_a"');
    send('GPS:FIL:SET:LOAD "nada"');
    expect(err()).toMatch(/^-256/);
    send('GPS:FIL:SET:REM "nada"');
    expect(err()).toMatch(/^-256/);
    send('GPS:FIL:SET:REM "twin_a"');
    expect(send('GPS:FIL:SET:FLST?')).toBe('""');
    send('GPS:SET:UNIT IMPERIAL');
    send('GPS:FIL:SET:DEF');
    expect(m.state.setup.gnss).toBe('GPS');
    expect(m.state.setup.units).toBe('IMPERIAL');
    send('GPS:FIL:SET:SAV "twin_b"');
    send('GPS:FIL:SET:CLR');
    expect(send('GPS:FIL:SET:FLST?')).toBe('""');
    send('GPS:FIL:SET:IMP');
    send('GPS:FIL:SET:EXP');
    expect(send('GPS:STAT?')).toBe('"Export complete: SET"');
  });

  it('rotas em arquivo', () => {
    const { m, send } = inst();
    send('GPS:ROUT:ADD:POIN "twin_a",1,2,3,4,5,6,7');
    send('GPS:ROUT:SAV "twin_r.rte"');
    send('GPS:ROUT:CLR');
    send('GPS:ROUT:LOAD "twin_r.rte"');
    expect(m.state.route.points).toHaveLength(1);
    expect(send('GPS:ROUT:FIL?')).toBe('"twin_r.rte"');
    expect(send('GPS:FIL:ROUT:FNAM?')).toBe('"twin_r.rte"');
    send('GPS:ROUT:DEL 1');
    expect(m.state.route.points).toHaveLength(0);
    send('GPS:FIL:ROUT:SAV "twin_s.rte"');
    send('GPS:FIL:ROUT:LOAD "twin_s.rte"');
    expect(send('GPS:FIL:ROUT:FLST?')).toBe('"twin_r.rte\ntwin_s.rte"');
    send('GPS:ROUT:REM "twin_s.rte"');
    send('GPS:FIL:ROUT:REM "twin_r.rte"');
    send('GPS:FIL:ROUT:CLR');
    send('GPS:FIL:ROUT:DEF');
    expect(send('GPS:ROUT:FIL?')).toBe('""');
    send('GPS:FIL:ROUT:IMP');
    send('GPS:FIL:ROUT:EXP');
  });

  it('almanaque, trajetória e KML', () => {
    const { m, send, err } = inst();
    expect(send('GPS:FIL:ALM:FLST?')).toBe(`"${DEFAULT_ALMANAC}"`);
    expect(send('GPS:FIL:ALM:FNAM?')).toBe(`"${DEFAULT_ALMANAC}"`);
    send('GPS:FIL:ALM:LOAD "twin_x.alm"');
    expect(err()).toMatch(/^-256/);
    m.files.ALM.set('twin_x.alm', null);
    send('GPS:FIL:ALM:LOAD "twin_x.alm"');
    expect(m.state.files.almanac).toEqual({ kind: 'file', name: 'twin_x.alm' });
    send('GPS:FIL:ALM:REL');
    expect(m.state.files.almanac).toEqual({ kind: 'equipment' });
    send('GPS:GPSR:REL');
    send('GPS:FIL:ALM:DEF');
    expect(m.state.files.almanac).toEqual({ kind: 'default' });
    send('GPS:FIL:ALM:REM "twin_x.alm"');
    send('GPS:FIL:ALM:CLR');
    expect(send('GPS:FIL:ALM:FLST?')).toBe(`"${DEFAULT_ALMANAC}"`);
    send('GPS:FIL:ALM:IMP');
    send('GPS:FIL:ALM:EXP');
    m.files.NMEA.set('twin_t.nme', null);
    send('GPS:FIL:NMEA:LOAD "twin_t.nme"');
    expect(send('GPS:FIL:NMEA:FNAM?')).toBe('"twin_t.nme"');
    expect(send('GPS:FIL:NMEA:FLST?')).toBe('"twin_t.nme"');
    send('GPS:FIL:NMEA:DEF');
    expect(m.state.files.nmea).toBeNull();
    send('GPS:FIL:NMEA:CLR');
    send('GPS:FIL:NMEA:IMP');
    send('GPS:FIL:NMEA:EXP');
    m.files.KML.set('twin_k.kml', null);
    send('GPS:FIL:KML:LOAD "twin_k.kml"');
    expect(m.state.files.kml).toBe('twin_k.kml');
    expect(send('GPS:FIL:KML:FNAM?')).toBe('"twin_k.kml"');
    expect(send('GPS:FIL:KML:FLST?')).toBe('"twin_k.kml"');
    send('GPS:FIL:KML:REM "twin_k.kml"');
    send('GPS:FIL:KML:CLR');
    expect(err()).toBe('0,"No error"');
  });
});

describe('instrumento simulado: opções', () => {
  it('padrões de relógio, PRNs e identificação', () => {
    const m = new Instrument({ channels: 6, idn: 'x' });
    expect(m.handle('*IDN?')).toBe('x');
    expect(m.handle('GPS:SET:CHAN:AVAL?')).toBe('6');
    expect(m.prnTable.GPS).toContain(5);
    expect(m.elapsedSeconds()).toBe(0);
  });
});
