// Cenários de teste. Coordenadas e nomes apenas dos exemplos do manual.
import { degToRad } from '../geo';
import { defaultScenario } from './defaults';
import type { Scenario } from './types';

export function dynamicScenario(): Scenario {
  const sc = defaultScenario();
  sc.name = 'rota_manual';
  sc.description = 'Rota de 3 pontos do exemplo do manual,\n com SV manipulado';
  sc.setup.simulationType = 'DYNAMIC';
  sc.setup.gnss = 'GALILEO';
  sc.setup.carrier = { command: 'GPS:SET:CaRrierGAl', token: 'E5a' };
  sc.setup.clock = 'GPSRX';
  sc.setup.rfPort = 'COUPLER';
  sc.setup.digitalNoise = 'OFF';
  sc.setup.rfLevel_dBm = -115;
  sc.setup.referenceSource = 'EXTERNAL';
  sc.io = { coupler_dB: 21.5, couplerCable_dB: 2.3, directCable_dB: 0, splitter_dB: 0 };
  sc.motion = {
    model: 'CUSTOM',
    custom: { maxLateral_mps2: 9.8, maxLongitudinal_mps2: 4.9, maxVelocity_mps: 89.41 },
  };
  sc.channels.gnss = 11;
  sc.files.imports = ['SET', 'ALM'];
  sc.files.settings = 'twin_rota_manual.set';
  sc.files.almanac = { kind: 'file', name: 'twin_w0574.alm' };
  sc.route.loop = 'ON';
  sc.route.saveAs = 'twin_rota_manual.rte';
  sc.display.latLonFormat = 'DDMM.MM';
  sc.setup.units = 'AERO/SI';
  const leg = { climbRate_mps: 5.08, speed_mps: 44.704, accel_mps2: 9.8, turnRadius_m: 100 };
  sc.route.points = [
    {
      kind: 'point',
      name: 'Kansas City Intl',
      lat_rad: degToRad(39.2976),
      lon_rad: degToRad(-94.7139),
      alt_m: 312,
      ...leg,
    },
    { kind: 'waypoint', code: 'SFO', ...leg },
    {
      kind: 'point',
      name: 'twin_p3',
      lat_rad: degToRad(37.6499),
      lon_rad: degToRad(-97.4331),
      alt_m: 406,
      ...leg,
    },
  ];
  sc.userWaypoints = [
    {
      code: 'twin_wp1',
      icao: '',
      name: 'Kansas City Intl',
      city: '',
      state: '',
      lat_rad: degToRad(39.2976),
      lon_rad: degToRad(-94.7139),
      alt_m: 312,
    },
  ];
  sc.actions = [
    { t_s: 60, type: 'rfLevel', level_dBm: -120 },
    {
      t_s: 30,
      type: 'sv',
      constellation: 'GAL',
      sv: 11,
      select: 'ON',
      health: 'DISCONNECTED',
      doppler_Hz: 0,
      incoherence_mps: 0,
      ampOffset_dB: 0,
      stepError_m: 0,
      duration_s: 3600,
    },
    {
      t_s: 30,
      type: 'sv',
      constellation: 'GPS',
      sv: 5,
      select: 'OFF',
      health: 'GOOD',
      doppler_Hz: -50,
      incoherence_mps: 0.5,
      ampOffset_dB: -6,
      stepError_m: 100,
      duration_s: 10,
    },
    {
      t_s: 12.5,
      type: 'sv',
      constellation: 'GPS',
      sv: 7,
      select: 'ON',
      health: 'BAD',
      doppler_Hz: 0,
      incoherence_mps: 0,
      ampOffset_dB: 0,
      stepError_m: 0,
      duration_s: 3600,
    },
  ];
  sc.run.stopAt_s = 120;
  return sc;
}
