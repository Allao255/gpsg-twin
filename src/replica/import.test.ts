import { describe, expect, it } from 'vitest';
import { buildPackage } from '../core/files/package';
import { LOG_HEADER } from '../core/files/session-log';
import { nmeaChecksum } from '../core/files/trajectory';
import { degToRad } from '../core/geo';
import { defaultScenario } from '../core/scenario/defaults';
import { classifyFile, importFiles, type InputFile } from './import';
import {
  attachAlmanac,
  attachTrajectory,
  detach,
  newSession,
  run,
  setPrns,
  type ReplicaSession,
  type Result,
} from './session';

function must(r: Result): ReplicaSession {
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

const YUMA = `******** Week 799 almanac for PRN-01 ********
ID:                         01
Health:                     000
Eccentricity:               0.3730297089E-002
Time of Applicability(s):  61440.0000
Orbital Inclination(rad):   0.9613649345
Rate of Right Ascen(r/s):  -0.7863184676E-008
SQRT(A)  (m 1/2):           5153.619629
Right Ascen at Week(rad):   0.9558857469E+000
Argument of Perigee(rad):   0.444257464
Mean Anom(rad):            -0.1754657556E+001
Af0(s):                    -0.1144409180E-004
Af1(s/s):                   0.0000000000E+000
week:                        799
`;
const gga = (b: string): string => `$${b}*${nmeaChecksum(b)}`;
const NMEA = [
  gga('GPGGA,000001,0100.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
  gga('GPGGA,000002,0100.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
].join('\n');
const GDT = `$GDT,20000101,000144.00,38.9425699612859,-94.7561817577427,0.000000,3D,*16\n`;
const RTE = `<Route><Waypoint Longitude="-77.88420000000001" MaxAcceleration="0" MaxClimbRate="0" Name="HESKU" Latitude="37.14982222222222" Altitude="1524" TargetSpeed="53.64466666666667" TurningCircleRadius="108.5658611334349"/></Route>`;
const CSV = 'NY to RM 01,NA,,TR01,NA,49.0875,-45.3539,7000,0,0\n';
const SET = `<!DOCTYPE GpsgPowerupConfig>\n<GpsgPowerupConfig><SimulationSetup><RfLevel>-125</RfLevel></SimulationSetup></GpsgPowerupConfig>`;
const LOG = `${LOG_HEADER}\nu,0.1,,TX,GPS:SET:RFLV -110\nu,0.2,,MARK,t_run = 0\nu,10.2,10,TX,GPS:SET:RFLV -111\n`;

describe('anexos', () => {
  it('almanaque: nome twin_, importação e carga; recusa arquivo inválido', () => {
    const s = must(attachAlmanac(newSession(), 'C:\\dados\\Week799.txt', YUMA));
    expect(s.attachments.almanac?.name).toBe('twin_Week799.alm');
    expect(s.scenario.files.almanac).toEqual({ kind: 'file', name: 'twin_Week799.alm' });
    expect(s.scenario.files.imports).toEqual(['ALM']);
    expect(must(attachAlmanac(s, 'twin_Week799.alm', YUMA)).scenario.files.imports).toEqual([
      'ALM',
    ]);
    const bad = attachAlmanac(newSession(), 'x.alm', 'nada');
    expect(!bad.ok && bad.error).toMatch(/^x.alm: nenhum bloco/);
    expect(attachAlmanac(must(run(newSession())), 'x.alm', YUMA).ok).toBe(false);
  });

  it('trajetória: .nmea vira .nme, GDT mantém .gdt', () => {
    const s = must(attachTrajectory(newSession(), 'gravacao.nmea', NMEA));
    expect(s.scenario.files.nmea).toBe('twin_gravacao.nme');
    expect(s.scenario.files.imports).toEqual(['NMEA']);
    const g = must(attachTrajectory(s, '/tmp/rota.gdt', GDT));
    expect(g.attachments.trajectory?.name).toBe('twin_rota.gdt');
    expect(g.scenario.files.imports).toEqual(['NMEA']);
    expect(attachTrajectory(newSession(), 'x.nme', 'abc').ok).toBe(false);
    expect(attachTrajectory(must(run(newSession())), 'x.nme', NMEA).ok).toBe(false);
  });

  it('remover anexo tira a importação e mantém o nome', () => {
    const s = must(
      attachTrajectory(must(attachAlmanac(newSession(), 'w.alm', YUMA)), 't.nme', NMEA),
    );
    const d = must(detach(s, 'almanac'));
    expect(d.attachments).toEqual({ trajectory: s.attachments.trajectory });
    expect(d.scenario.files.imports).toEqual(['NMEA']);
    expect(d.scenario.files.almanac).toEqual({ kind: 'file', name: 'twin_w.alm' });
    expect(detach(d, 'almanac').ok).toBe(false);
    expect(detach(must(run(s)), 'almanac').ok).toBe(false);
  });
});

describe('classifyFile', () => {
  it('por extensão e por conteúdo', () => {
    const c = (name: string, text: string): string => classifyFile({ name, text });
    expect(c('a.json', '{}')).toBe('scenario');
    expect(c('a.scpi', '')).toBe('script');
    expect(c('a.txt', 'GPS:SET:RFLV -1')).toBe('script');
    expect(c('a.csv', LOG)).toBe('log');
    expect(c('a.csv', CSV)).toBe('waypoints');
    expect(c('a.set', SET)).toBe('settings');
    expect(c('x', `<?xml version="1.0"?>\n${RTE}`)).toBe('route');
    expect(c('w.alm', YUMA)).toBe('almanac');
    expect(c('t.nme', NMEA)).toBe('trajectory');
    expect(c('t.gdt', `Notes,Date\n${GDT}`)).toBe('trajectory');
    expect(c('x.bin', 'zzz')).toBe('unknown');
    expect(c('f.md', '# x')).toBe('aux');
    expect(c('r-colavel.ps1', '')).toBe('aux');
  });
});

describe('importFiles', () => {
  const prev = must(setPrns(newSession(), 'GPS', '5 9'));

  it('pacote do twin: cenário JSON é a base, anexos restaurados, derivados ignorados', () => {
    const sc = defaultScenario();
    sc.name = 'ensaio';
    sc.setup.simulationType = 'DYNAMIC';
    sc.route.points = [
      {
        kind: 'point',
        name: 'A',
        lat_rad: degToRad(1),
        lon_rad: degToRad(2),
        alt_m: 3,
        climbRate_mps: 0,
        speed_mps: 10,
        accel_mps2: 1,
        turnRadius_m: 100,
      },
    ];
    sc.files.almanac = { kind: 'file', name: 'twin_w.alm' };
    const pkg = buildPackage(sc, { almanac: { name: 'twin_w.alm', text: YUMA } });
    const r = importFiles(
      prev,
      pkg.files.map((f) => ({ name: f.path, text: f.text })),
    );
    expect(r.diagnostics).toEqual([]);
    expect(r.script).toBeNull();
    expect(r.session.scenario).toEqual({ ...sc, files: { ...sc.files, imports: ['ALM'] } });
    expect(r.session.attachments.almanac).toEqual({ name: 'twin_w.alm', text: YUMA });
    expect(r.session.svs).toEqual(prev.svs);
    expect(r.summary).toEqual([
      'ensaio.json: cenário carregado',
      'ensaio.scpi: derivado do cenário do pacote; não aplicado',
      'twin_ensaio.rte: derivado do cenário do pacote; não aplicado',
      'twin_w.alm: almanaque anexado',
      'ensaio-folha.md: ignorado',
    ]);
  });

  it('arquivos exportados do equipamento aplicados sobre o cenário corrente', () => {
    const files: InputFile[] = [
      { name: 'Instrument/Waypoint/wp.csv', text: CSV },
      { name: 'Instrument/Routes/r.rte', text: RTE },
      { name: 'Instrument/Settings/s.set', text: SET },
      { name: 'Instrument/Nmea/t.nme', text: NMEA },
    ];
    const r = importFiles(prev, files);
    expect(r.session.scenario.setup.rfLevel_dBm).toBe(-125);
    expect(r.session.scenario.route.points).toHaveLength(1);
    expect(r.session.scenario.userWaypoints.map((w) => w.code)).toEqual(['TR01']);
    expect(r.session.scenario.files.nmea).toBe('twin_t.nme');
    expect(r.summary).toEqual([
      's.set: settings aplicado',
      'r.rte: rota com 1 ponto(s)',
      'wp.csv: 1 waypoint(s) de usuário',
      't.nme: trajetória anexada',
    ]);
    expect(r.diagnostics.some((d) => d.message.startsWith('s.set: SimulationMode ausente'))).toBe(
      true,
    );
  });

  it('script ou log sozinho: vai para o editor', () => {
    const r = importFiles(prev, [{ name: 'S01.scpi', text: 'GPS:SET:RFLV -110\n' }]);
    expect(r.script).toBe('GPS:SET:RFLV -110\n');
    expect(r.session.scenario.setup.rfLevel_dBm).toBe(-110);
    const l = importFiles(prev, [{ name: 'S01-sonda_2026.csv', text: LOG }]);
    expect(l.script).toMatch(/^# twin-scenario: s01_sonda_2026\n/);
    expect(l.session.scenario.actions).toEqual([{ t_s: 10, type: 'rfLevel', level_dBm: -111 }]);
    expect(l.summary).toEqual([
      'S01-sonda_2026.csv: log com 2 comandos enviados, 0 rejeitados, 1 execução(ões)',
    ]);
  });

  it('script seguido de arquivo: editor regenerado do cenário; segundo script e cenário inválido', () => {
    const r = importFiles(prev, [
      { name: 'a.scpi', text: 'GPS:SET:RFLV -110\n' },
      { name: 'b.scpi', text: 'GPS:SET:RFLV -100\n' },
      { name: 'w.alm', text: YUMA },
    ]);
    expect(r.script).toBeNull();
    expect(r.session.scenario.setup.rfLevel_dBm).toBe(-110);
    expect(r.summary).toContain('b.scpi: segundo script; não carregado');
    const bad = importFiles(prev, [
      { name: 'x.json', text: '{' },
      { name: 'y.json', text: '{}' },
      { name: 'w.alm', text: 'nada' },
      { name: 'q.bin', text: '?' },
    ]);
    expect(bad.summary).toEqual([
      'x.json: cenário inválido',
      'y.json: cenário inválido',
      'w.alm: não reconhecido',
      'q.bin: não reconhecido',
    ]);
    const two = importFiles(prev, [
      { name: 'a.json', text: JSON.stringify(defaultScenario()) },
      { name: 'b.json', text: JSON.stringify(defaultScenario()) },
      { name: 'w.alm', text: '******** week\nlixo' },
    ]);
    expect(two.summary).toEqual([
      'a.json: cenário carregado',
      'b.json: segundo cenário ignorado',
      'w.alm: não aplicado',
    ]);
  });
});
