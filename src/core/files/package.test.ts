import { describe, expect, it } from 'vitest';
import { degToRad } from '../geo';
import { defaultScenario } from '../scenario/defaults';
import type { Scenario } from '../scenario/types';
import { buildPackage, DEFAULT_PACKAGE_OPTIONS, packageZip, type PackageOptions } from './package';
import { settingsFromXml } from './settings-xml';
import { unzip } from './zip';

const LEG = { climbRate_mps: 1, speed_mps: 50, accel_mps2: 2, turnRadius_m: 500 };

/** Cenário dinâmico com rota, waypoint de usuário, almanaque e trajetória anexáveis. */
function dynamic(): Scenario {
  const sc = defaultScenario();
  sc.name = 'rota_manual';
  sc.setup.simulationType = 'DYNAMIC';
  sc.userWaypoints = [
    {
      code: 'MCI',
      icao: 'KMCI',
      name: 'Kansas City Intl',
      city: 'Kansas City',
      state: 'MO',
      lat_rad: degToRad(39.2976),
      lon_rad: degToRad(-94.7139),
      alt_m: 312,
    },
  ];
  sc.route.points = [
    { kind: 'waypoint', code: 'MCI', ...LEG },
    {
      kind: 'point',
      name: 'P2',
      lat_rad: degToRad(37.6499),
      lon_rad: degToRad(-97.4331),
      alt_m: 406,
      ...LEG,
    },
  ];
  sc.files.almanac = { kind: 'file', name: 'twin_w0574.alm' };
  return sc;
}

const ATT = {
  almanac: { name: 'twin_w0574.alm', text: 'almanaque' },
  trajectory: { name: 'twin_t.nme', text: 'trajetória' },
};

const paths = (p: { files: { path: string }[] }): string[] => p.files.map((f) => f.path);
const text = (p: { files: { path: string; text: string }[] }, path: string): string =>
  p.files.find((f) => f.path === path)?.text ?? '';

describe('buildPackage', () => {
  it('cenário padrão: só script, cenário e folha; settings não gerado (D31)', () => {
    const p = buildPackage(defaultScenario());
    expect(paths(p)).toEqual(['cenario.scpi', 'cenario.json', 'cenario-folha.md']);
    expect(p.diagnostics.map((d) => d.code)).toEqual(['file-omitted']);
    expect(text(p, 'cenario.scpi')).not.toMatch(/:IMP$/m);
  });

  it('padrão: arquivos como registro e configuração por comandos', () => {
    const p = buildPackage(dynamic(), ATT);
    expect(paths(p)).toEqual([
      'Instrument/Routes/twin_rota_manual.rte',
      'Instrument/Waypoint/twin_rota_manual.csv',
      'Instrument/almanacs/twin_w0574.alm',
      'Instrument/Nmea/twin_t.nme',
      'rota_manual.scpi',
      'rota_manual.json',
      'rota_manual-folha.md',
    ]);
    const s = text(p, 'rota_manual.scpi');
    expect(s).toMatch(/GPS:ROUT:ADD:WAYP "MCI"/);
    expect(s).toMatch(/GPS:WAYP:NEW "MCI"/);
    expect(s).toMatch(/# arquivos do pendrive\nGPS:FIL:ALM:IMP\n/);
    expect(s).toMatch(/GPS:FIL:ALM:LOAD "twin_w0574.alm"/);
    // Trajetória anexada sem uso pelo cenário.
    expect(p.diagnostics.map((d) => d.message)).toContain(
      'trajetória twin_t.nme anexada e não usada pelo cenário',
    );
    expect(text(p, 'rota_manual-folha.md')).toMatch(
      /twin_rota_manual.rte` \| registro; não carregado pelo script\. D29/,
    );
    expect(JSON.parse(text(p, 'rota_manual.json'))).toMatchObject({ name: 'rota_manual' });
  });

  it('rota e waypoints pelo pendrive', () => {
    const opts: PackageOptions = { ...DEFAULT_PACKAGE_OPTIONS, viaRoute: true, viaWaypoints: true };
    const sc = dynamic();
    sc.files.nmea = 'twin_t.nme';
    const p = buildPackage(sc, ATT, opts);
    const s = text(p, 'rota_manual.scpi');
    expect(s).toMatch(/GPS:FIL:ROUT:IMP\nGPS:FIL:NMEA:IMP\nGPS:FIL:ALM:IMP\nGPS:FIL:WAYP:IMP\n/);
    expect(s).toMatch(/GPS:FIL:ROUT:LOAD "twin_rota_manual.rte"/);
    expect(s).not.toMatch(/ROUT:ADD|WAYP:NEW|ROUT:CLR/);
    expect(p.scriptScenario.route.points).toEqual([]);
    // O cenário guardado no pacote continua com a rota e os waypoints.
    expect(JSON.parse(text(p, 'rota_manual.json'))).toMatchObject({ route: { points: [{}, {}] } });
    expect(text(p, 'rota_manual-folha.md')).toMatch(
      /twin_rota_manual.rte` \| importado e carregado pelo script/,
    );
  });

  it('rota pelo pendrive só em DYNAMIC; waypoint do banco impede o .rte', () => {
    const sc = dynamic();
    sc.setup.simulationType = 'STATIC';
    const st = buildPackage(sc, {}, { ...DEFAULT_PACKAGE_OPTIONS, viaRoute: true });
    expect(st.scriptScenario.route.points).toHaveLength(2);
    sc.setup.simulationType = 'DYNAMIC';
    sc.route.points.push({ kind: 'waypoint', code: 'SFO', ...LEG });
    const bank = buildPackage(sc, {}, { ...DEFAULT_PACKAGE_OPTIONS, viaRoute: true });
    expect(paths(bank)).not.toContain('Instrument/Routes/twin_rota_manual.rte');
    expect(bank.diagnostics.map((d) => d.message).join()).toMatch(/SFO/);
    expect(text(bank, 'rota_manual.scpi')).toMatch(/ROUT:ADD:WAYP "SFO"/);
  });

  it('settings pelo pendrive quando todos os tokens são observados', () => {
    const xml = `<GpsgPowerupConfig><SimulationSetup><SimulationMode>Gps</SimulationMode><Carrier>L1_E1</Carrier>
<SbasMode>Auto</SbasMode><SimulationType>Static</SimulationType><DigitalNoiseMode>Off</DigitalNoiseMode>
<FadingMode>None</FadingMode><PrnSignalType>Fixed</PrnSignalType><PositionSource>User</PositionSource>
<ClockSetting>User</ClockSetting><UnitsType>Imperial</UnitsType><LatLonFormat>DD°MM'SS.SS"</LatLonFormat>
<RfPortSelection>Coupler</RfPortSelection><RouteLooping>0</RouteLooping></SimulationSetup>
<ChannelsSetup Gnss="11" Galileo="5" Gps="6" SingleSbas="0" Sbas="1"/>
<IoSetup><ExternalRefOutMode>Off</ExternalRefOutMode><ReferenceSource>Internal</ReferenceSource>
<TriggerMode>Auto</TriggerMode></IoSetup></GpsgPowerupConfig>`;
    const sc = settingsFromXml(xml, defaultScenario()).scenario;
    const p = buildPackage(sc, {}, { ...DEFAULT_PACKAGE_OPTIONS, viaSettings: true });
    expect(paths(p)).toContain('Instrument/Settings/twin_cenario.set');
    const s = text(p, 'cenario.scpi');
    expect(s).toMatch(/GPS:FIL:SET:IMP\nGPS:FIL:SET:LOAD "twin_cenario.set"\n/);
    expect(p.diagnostics.map((d) => d.dRefs)).toContainEqual(['D31']);
  });

  it('anexos sem prefixo, almanaque não anexado e runner colável', () => {
    const sc = dynamic();
    sc.files.nmea = 'twin_x.nme';
    const p = buildPackage(
      sc,
      { almanac: { name: 'w.alm', text: '' } },
      { ...DEFAULT_PACKAGE_OPTIONS, pasteable: (s, n) => `# ${n}\n${s.length}` },
    );
    const msgs = p.diagnostics.map((d) => d.message);
    expect(msgs).toContain('almanaque anexado sem prefixo twin_: w.alm');
    expect(msgs).toContain('almanaque w.alm anexado e não usado pelo cenário');
    expect(msgs).toContain('trajetória twin_x.nme não anexada: precisa já estar no equipamento');
    expect(text(p, 'rota_manual-colavel.ps1')).toMatch(/^# rota_manual.scpi\n\d+$/);
    const noAlm = buildPackage(dynamic());
    expect(noAlm.diagnostics.map((d) => d.message)).toContain(
      'almanaque twin_w0574.alm não anexado: precisa já estar no equipamento',
    );
  });
});

describe('trajetória anexada', () => {
  it('carregada só com Simulation = Trajectory; importada em qualquer tipo', () => {
    const sc = dynamic();
    sc.files.nmea = 'twin_t.nme';
    const dyn = buildPackage(sc, ATT);
    expect(text(dyn, 'rota_manual.scpi')).toMatch(/GPS:FIL:NMEA:IMP/);
    expect(text(dyn, 'rota_manual.scpi')).not.toMatch(/NMEA:LOAD/);
    expect(text(dyn, 'rota_manual-folha.md')).toMatch(
      /twin_t.nme` \| registro; não carregado pelo script\. Carregada só com Simulation = Trajectory/,
    );
    sc.setup.simulationType = 'TRAJECTORY';
    const traj = buildPackage(sc, ATT);
    expect(text(traj, 'rota_manual.scpi')).toMatch(/GPS:FIL:NMEA:LOAD "twin_t.nme"/);
    expect(text(traj, 'rota_manual-folha.md')).toMatch(
      /twin_t.nme` \| importado e carregado pelo script \|/,
    );
  });
});

describe('packageZip', () => {
  it('ida e volta pelo ZIP', async () => {
    const p = buildPackage(dynamic(), ATT);
    const back = await unzip(packageZip(p));
    const dec = new TextDecoder();
    expect(back.map((e) => [e.path, dec.decode(e.data)])).toEqual(
      p.files.map((f) => [f.path, f.text]),
    );
  });
});
