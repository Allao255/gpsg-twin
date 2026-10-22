import { describe, expect, it } from 'vitest';
import { degToRad } from '../geo';
import { defaultScenario } from '../scenario/defaults';
import type { Scenario } from '../scenario/types';
import { settingsFromXml, settingsToXml } from './settings-xml';
import { child, parseXml, type XmlElement } from './xml';

// Exemplo do manual de operação (OP D-7), com a indentação original.
const OP_D7 = `<!DOCTYPE GpsgPowerupConfig>
<GpsgPowerupConfig>
       <SimulationSetup>
               <SimulationMode>Gps</SimulationMode>
               <Carrier>L1_E1</Carrier>
               <SbasMode>Auto</SbasMode>
               <SimulationType>Static</SimulationType>
               <DigitalNoiseMode>Off</DigitalNoiseMode>
               <FadingMode>None</FadingMode>
               <PrnSignalType>Fixed</PrnSignalType>
               <PositionSource>User</PositionSource>
               <ClockSetting>User</ClockSetting>
               <UserDateTime>2011-08-05T21:12:16</UserDateTime>
               <UnitsType>Imperial</UnitsType>
               <LatLonFormat>DD°MM'SS.SS"</LatLonFormat>
               <RfPortSelection>Coupler</RfPortSelection>
               <RfLevel>-130</RfLevel>
               <RouteLooping>0</RouteLooping>
               <MotionModel type="Unlimited">
                      <Pedestrian LateralAcceleration="2.94" Velocity="10.72896"
                      LongitudinalAcceleration="2.94"/>
                      <Automobile LateralAcceleration="9.800000000000001"
                      Velocity="89.408"
                      LongitudinalAcceleration="9.800000000000001"/>
                      <Marine LateralAcceleration="6.86" Velocity="44.704"
                      LongitudinalAcceleration="6.86"/>
                      <LowPerfAircraft LateralAcceleration="19.6" Velocity="223.52"
                      LongitudinalAcceleration="9.800000000000001"/>
                      <HiPerfAircraft LateralAcceleration="88.2" Velocity="447.04"
                      LongitudinalAcceleration="49"/>
                      <Custom LateralAcceleration="19.6" Velocity="0.44704"
                      LongitudinalAcceleration="9.800000000000001"/>
                      <Unlimited LateralAcceleration="98" Velocity="514.096"
                      LongitudinalAcceleration="98"/>
               </MotionModel>
       </SimulationSetup>
       <ChannelsSetup Gnss="12" Galileo="5" Gps="6" SingleSbas="0" Sbas="1"/>
       <IoSetup>
               <LossValues Splitter="0" Coupler="0" DirectCable="0" CouplerCable="0"/>
               <ExternalRefOutMode>Off</ExternalRefOutMode>
       <ReferenceSource>Internal</ReferenceSource>
       <TriggerMode>Auto</TriggerMode>
</IoSetup>
<DefaultStaticPoint Longitude="0" Latitude="0" Altitude="0"/>
<DefaultFiles Trajectory="" Route="Default Route" Almanac=""/>
<DiagnosticsSetup>
       <DiagnosticsMode>Off</DiagnosticsMode>
       <Frequency>1176.45 MHz</Frequency>
       <Amplitude>-100</Amplitude>
       <DopplerError>0</DopplerError>
</DiagnosticsSetup>
</GpsgPowerupConfig>
`;

function read(text: string, base = defaultScenario()): ReturnType<typeof settingsFromXml> {
  return settingsFromXml(text, base);
}

/** Árvore XML sem diferenças de espaço, para comparação semântica. */
function tree(text: string): unknown {
  const r = parseXml(text);
  if ('error' in r) throw new Error(r.error);
  const norm = (e: XmlElement): unknown => ({
    n: e.name,
    a: e.attrs,
    t: e.text,
    c: e.children.map(norm),
  });
  return norm(r.root);
}

describe('settingsFromXml', () => {
  it('exemplo do manual', () => {
    const r = read(OP_D7);
    const s = r.scenario;
    expect(s.setup).toMatchObject({
      gnss: 'GPS',
      carrier: { command: 'GPS:SET:CARRier', token: 'L1/E1' },
      sbas: 'AUTO',
      simulationType: 'STATIC',
      digitalNoise: 'OFF',
      fading: 'NONE',
      prnSignal: 'FIXED',
      positionSource: 'USER',
      clock: 'USER',
      units: 'IMPERIAL',
      rfPort: 'COUPLER',
      rfLevel_dBm: -130,
      extRef: 'OFF',
      referenceSource: 'INTERNAL',
      triggerSource: 'AUTO',
    });
    expect(new Date(s.setup.userTime_s * 1000).toISOString()).toBe('2011-08-05T21:12:16.000Z');
    expect(s.display.latLonFormat).toBe('DDMMSS.SS');
    expect(s.route.loop).toBe('OFF');
    expect(s.motion).toEqual({ model: 'UNLIMITED', custom: null });
    expect(s.channels).toEqual({ gnss: 12, dualGal: 5, dualGps: 6, sbas: 0, dualSbas: 1 });
    expect(s.io).toEqual({ coupler_dB: 0, couplerCable_dB: 0, directCable_dB: 0, splitter_dB: 0 });
    expect(s.position).toEqual({ lat_rad: 0, lon_rad: 0, alt_m: 0 });
    // Avisos esperados: canais inferidos (D31) e DefaultFiles fora do cenário.
    expect(r.diagnostics.map((d) => d.code)).toEqual(['file-unverified', 'not-represented']);
  });

  it('tokens inferidos com aviso; desconhecidos não aplicados', () => {
    const t = OP_D7.replace('<SimulationType>Static', '<SimulationType>Dynamic')
      .replace('<RfPortSelection>Coupler', '<RfPortSelection>Bogus')
      .replace('type="Unlimited"', 'type="Custom"');
    const r = read(t);
    expect(r.scenario.setup.simulationType).toBe('DYNAMIC');
    expect(r.scenario.setup.rfPort).toBe('DIRECT');
    expect(r.scenario.motion).toEqual({
      model: 'CUSTOM',
      custom: {
        maxLateral_mps2: 19.6,
        maxLongitudinal_mps2: 9.800000000000001,
        maxVelocity_mps: 0.44704,
      },
    });
    const msgs = r.diagnostics.map((d) => d.message).join('\n');
    expect(msgs).toMatch(/SimulationType=Dynamic: token inferido/);
    expect(msgs).toMatch(/RfPortSelection=Bogus: token desconhecido/);
    expect(msgs).toMatch(/MotionModel type=Custom: token inferido/);
  });

  it('valores inválidos, ausentes e limites alterados', () => {
    const t = OP_D7.replace('<UserDateTime>2011-08-05T21:12:16', '<UserDateTime>ontem')
      .replace('<RfLevel>-130', '<RfLevel>x')
      .replace('type="Unlimited"', 'type="Nave"')
      .replace('Velocity="223.52"', 'Velocity="200"')
      .replace('<Marine LateralAcceleration="6.86"', '<Marine')
      .replace('Splitter="0"', 'Splitter=""')
      .replace('Latitude="0" Altitude', 'Latitude="a" Altitude')
      .replace('<TriggerMode>Auto</TriggerMode>', '')
      .replace('Route="Default Route"', 'Route=""');
    const r = read(t);
    const msgs = r.diagnostics.map((d) => d.message).join('\n');
    expect(msgs).toMatch(/UserDateTime inválido/);
    expect(msgs).toMatch(/RfLevel inválido/);
    expect(msgs).toMatch(/type=Nave: desconhecido/);
    expect(msgs).toMatch(/LowPerfAircraft diferentes dos de fábrica/);
    expect(msgs).toMatch(/Marine: limites ausentes/);
    expect(msgs).toMatch(/LossValues splitter_dB/);
    expect(msgs).toMatch(/DefaultStaticPoint inválido/);
    expect(msgs).toMatch(/TriggerMode ausente/);
    expect(msgs).not.toMatch(/DefaultFiles/);
    expect(r.scenario.setup.rfLevel_dBm).toBe(-120);
  });

  it('erros de documento', () => {
    expect(read('<a>').diagnostics[0]?.severity).toBe('error');
    expect(read('<Route/>').diagnostics[0]?.message).toMatch(/GpsgPowerupConfig/);
    // Sem nenhum elemento: só avisos de ausência, cenário base mantido.
    const r = read('<GpsgPowerupConfig/>');
    expect(r.scenario).toEqual(defaultScenario());
  });
});

describe('settingsToXml', () => {
  it('ida e volta do exemplo do manual: mesma árvore, salvo Custom e DefaultFiles', () => {
    const s = read(OP_D7).scenario;
    const out = settingsToXml(s);
    expect(out.diagnostics.map((d) => d.code)).toEqual(['file-unverified']);
    const expected = OP_D7.replace(
      '<Custom LateralAcceleration="19.6" Velocity="0.44704"\n                      LongitudinalAcceleration="9.800000000000001"/>',
      '<Custom LateralAcceleration="98" Velocity="514.096" LongitudinalAcceleration="98"/>',
    ).replace('Route="Default Route"', 'Route=""');
    expect(tree(out.text ?? '')).toEqual(tree(expected));
  });

  it('cenário com valores sem token observado não gera arquivo', () => {
    const out = settingsToXml(defaultScenario());
    expect(out.text).toBeNull();
    const m = out.diagnostics[0]?.message ?? '';
    expect(m).toMatch(/DigitalNoiseMode=ON/);
    expect(m).toMatch(/RfPortSelection=DIRECT/);
    expect(m).toMatch(/ChannelsSetup \(Gnss, Galileo, Gps, SingleSbas, Sbas não definidos\)/);
    expect(out.diagnostics[0]?.dRefs).toEqual(['D31']);
  });

  it('Custom, arquivos e posição', () => {
    const s: Scenario = read(OP_D7).scenario;
    s.motion = {
      model: 'CUSTOM',
      custom: { maxLateral_mps2: 1, maxLongitudinal_mps2: 2, maxVelocity_mps: 3 },
    };
    s.files.almanac = { kind: 'file', name: 'twin_w.alm' };
    s.files.route = 'twin_r.rte';
    s.position = { lat_rad: degToRad(39.2976), lon_rad: degToRad(-94.7139), alt_m: 300 };
    const out = settingsToXml(s);
    expect(out.text).toBeNull();
    expect(out.diagnostics[0]?.message).toMatch(/MotionModel type=CUSTOM/);
    s.motion.model = 'UNLIMITED';
    const t = settingsToXml(s).text ?? '';
    const r = parseXml(t);
    if ('error' in r) throw new Error(r.error);
    expect(child(r.root, 'DefaultFiles')?.attrs).toEqual({
      Trajectory: '',
      Route: 'twin_r.rte',
      Almanac: 'twin_w.alm',
    });
    expect(child(r.root, 'DefaultStaticPoint')?.attrs.Latitude).toBe('39.2976');
    const back = read(t).scenario;
    expect(back.position.lat_rad).toBeCloseTo(s.position.lat_rad, 14);
  });
});
