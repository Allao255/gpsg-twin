// Cenário padrão. Valores com `default` no modelo vêm de lá; os demais estão justificados ao lado.
import { degToRad } from '../geo';
import { info, type CommandHeader, type EnumValue, type ModelEnums } from '../model/load';
import { D02_DEFAULT_DURATION_S } from '../quirks';
import { SCENARIO_VERSION, type Scenario } from './types';

function modelDefault<
  H extends keyof ModelEnums & CommandHeader,
  P extends keyof ModelEnums[H] & string,
>(header: H, param: P, fallback: EnumValue<H, P>): EnumValue<H, P> {
  const p = info(header).params.find((x) => x.name === param);
  return (p?.default as EnumValue<H, P> | undefined) ?? fallback;
}

export function defaultScenario(): Scenario {
  return {
    scenario_version: SCENARIO_VERSION,
    name: 'cenario',
    description: '',
    setup: {
      // Unidades de exibição como na figura e nos procedimentos do manual (OP 3-5, 4.1.2). Os
      // scripts gerados usam SI de qualquer forma (D04).
      units: 'IMPERIAL',
      gnss: modelDefault('GPS:SET:GNSS', 'gnss', 'GPS'),
      // Exemplo S00 de 02-interface-remota.md.
      carrier: { command: 'GPS:SET:CARRier', token: 'L1/E1' },
      // SBAS desligado: não consome canal (OP 3-6).
      sbas: 'OFF',
      simulationType: modelDefault('GPS:SET:SimulationTYPe', 'type', 'STATIC'),
      // Porta DIRECT com ruído digital ligado, como a UI força (nota de DNOS no modelo).
      digitalNoise: 'ON',
      fading: modelDefault('GPS:SET:FADing', 'fading', 'NONE'),
      // Todos os SVs no RF Level programado (OP 3-6).
      prnSignal: 'FIXED',
      positionSource: modelDefault('GPS:SET:PositionSouRCe', 'source', 'USER'),
      // D12: USER.
      clock: 'USER',
      // Data e hora do exemplo S00 (manual): 04/14/2013 11:11:11.
      userTime_s: Date.UTC(2013, 3, 14, 11, 11, 11) / 1000,
      rfPort: 'DIRECT',
      // Faixa recomendada pelo manual para a maioria dos receptores (OP 4-2).
      rfLevel_dBm: -120,
      triggerSource: modelDefault('GPS:SET:TriggerSouRCe', 'source', 'AUTO'),
      extRef: 'OFF',
      referenceSource: 'INTERNAL',
    },
    io: { coupler_dB: 0, couplerCable_dB: 0, directCable_dB: 0, splitter_dB: 0 },
    motion: { model: 'UNLIMITED', custom: null },
    channels: { gnss: null, sbas: null, dualGps: null, dualGal: null, dualSbas: null },
    // Kansas City Intl, exemplo do manual (RP 9-1), altitude do exemplo S00.
    position: { lat_rad: degToRad(39.2976), lon_rad: degToRad(-94.7139), alt_m: 300 },
    route: { points: [], loop: 'OFF', saveAs: null },
    userWaypoints: [],
    // Almanaque padrão do equipamento: cenário fixado (semana 574).
    files: {
      imports: [],
      settings: null,
      almanac: { kind: 'default' },
      route: null,
      nmea: null,
      kml: null,
    },
    run: { stopAt_s: null },
    actions: [],
    display: { latLonFormat: 'DDMMSS.SS' },
  };
}

export const DEFAULT_SV_DURATION_S = D02_DEFAULT_DURATION_S;
