// Settings do equipamento (`.set`, OP D-7): XML <GpsgPowerupConfig>. Tokens de enumeração só os do
// exemplo do manual (observados); o arquivo só é gravado quando todos os valores do cenário têm token
// observado. Leitura aceita também os tokens inferidos de D31, com aviso.
import { diag, type Diagnostic } from '../diagnostics';
import { degToRad, radToDeg } from '../geo';
import { D27_FACTORY_LIMITS, D31_DREFS, D31_SETTINGS_INFERRED, type MotionLimits } from '../quirks';
import type { Channels, LatLonFormat, Motion, Scenario } from '../scenario/types';
import { g16 } from './route-xml';
import { child, parseXml, type XmlElement } from './xml';

type Model = Motion['model'];

interface EnumSpec {
  element: string;
  /** Elemento pai (SimulationSetup ou IoSetup). */
  parent: 'SimulationSetup' | 'IoSetup';
  get: (sc: Scenario) => string;
  set: (sc: Scenario, key: string) => void;
  /** Valor do cenário -> token observado no exemplo do manual (OP D-7). */
  observed: Readonly<Record<string, string>>;
}

const carrierKey = (sc: Scenario): string =>
  sc.setup.carrier.command === 'GPS:SET:CARRier'
    ? sc.setup.carrier.token
    : `${sc.setup.carrier.command} ${sc.setup.carrier.token}`;

/** Elementos de enumeração, na ordem do exemplo. */
const ENUMS: readonly EnumSpec[] = [
  {
    element: 'SimulationMode',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.gnss,
    set: (sc, k) => {
      sc.setup.gnss = k as Scenario['setup']['gnss'];
    },
    observed: { GPS: 'Gps' },
  },
  {
    element: 'Carrier',
    parent: 'SimulationSetup',
    get: carrierKey,
    set: (sc, k) => {
      sc.setup.carrier = {
        command: 'GPS:SET:CARRier',
        token: k as Extract<Scenario['setup']['carrier'], { command: 'GPS:SET:CARRier' }>['token'],
      };
    },
    observed: { 'L1/E1': 'L1_E1' },
  },
  {
    element: 'SbasMode',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.sbas,
    set: (sc, k) => {
      sc.setup.sbas = k as Scenario['setup']['sbas'];
    },
    observed: { AUTO: 'Auto' },
  },
  {
    element: 'SimulationType',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.simulationType,
    set: (sc, k) => {
      sc.setup.simulationType = k as Scenario['setup']['simulationType'];
    },
    observed: { STATIC: 'Static' },
  },
  {
    element: 'DigitalNoiseMode',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.digitalNoise,
    set: (sc, k) => {
      sc.setup.digitalNoise = k as Scenario['setup']['digitalNoise'];
    },
    observed: { OFF: 'Off' },
  },
  {
    element: 'FadingMode',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.fading,
    set: (sc, k) => {
      sc.setup.fading = k as Scenario['setup']['fading'];
    },
    observed: { NONE: 'None' },
  },
  {
    element: 'PrnSignalType',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.prnSignal,
    set: (sc, k) => {
      sc.setup.prnSignal = k as Scenario['setup']['prnSignal'];
    },
    observed: { FIXED: 'Fixed' },
  },
  {
    element: 'PositionSource',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.positionSource,
    set: (sc, k) => {
      sc.setup.positionSource = k as Scenario['setup']['positionSource'];
    },
    observed: { USER: 'User' },
  },
  {
    element: 'ClockSetting',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.clock,
    set: (sc, k) => {
      sc.setup.clock = k as Scenario['setup']['clock'];
    },
    observed: { USER: 'User' },
  },
  {
    element: 'UnitsType',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.units,
    set: (sc, k) => {
      sc.setup.units = k as Scenario['setup']['units'];
    },
    observed: { IMPERIAL: 'Imperial' },
  },
  {
    element: 'LatLonFormat',
    parent: 'SimulationSetup',
    get: (sc) => sc.display.latLonFormat,
    set: (sc, k) => {
      sc.display.latLonFormat = k as LatLonFormat;
    },
    observed: { 'DDMMSS.SS': `DD°MM'SS.SS"` },
  },
  {
    element: 'RfPortSelection',
    parent: 'SimulationSetup',
    get: (sc) => sc.setup.rfPort,
    set: (sc, k) => {
      sc.setup.rfPort = k as Scenario['setup']['rfPort'];
    },
    observed: { COUPLER: 'Coupler' },
  },
  {
    element: 'RouteLooping',
    parent: 'SimulationSetup',
    get: (sc) => sc.route.loop,
    set: (sc, k) => {
      sc.route.loop = k as Scenario['route']['loop'];
    },
    observed: { OFF: '0' },
  },
  {
    element: 'ExternalRefOutMode',
    parent: 'IoSetup',
    get: (sc) => sc.setup.extRef,
    set: (sc, k) => {
      sc.setup.extRef = k as Scenario['setup']['extRef'];
    },
    observed: { OFF: 'Off' },
  },
  {
    element: 'ReferenceSource',
    parent: 'IoSetup',
    get: (sc) => sc.setup.referenceSource,
    set: (sc, k) => {
      sc.setup.referenceSource = k as Scenario['setup']['referenceSource'];
    },
    observed: { INTERNAL: 'Internal' },
  },
  {
    element: 'TriggerMode',
    parent: 'IoSetup',
    get: (sc) => sc.setup.triggerSource,
    set: (sc, k) => {
      sc.setup.triggerSource = k as Scenario['setup']['triggerSource'];
    },
    observed: { AUTO: 'Auto' },
  },
];

/** Elementos de MotionModel (nomes observados em OP D-7; D23: Automobile). */
const MODEL_ELEMENTS: readonly [Model, string][] = [
  ['PEDESTRIAN', 'Pedestrian'],
  ['AUTOMOTIVE', 'Automobile'],
  ['MARINE', 'Marine'],
  ['LOW_PERFORMANCE_AIRCRAFT', 'LowPerfAircraft'],
  ['HIGH_PERFORMANCE_AIRCRAFT', 'HiPerfAircraft'],
  ['CUSTOM', 'Custom'],
  ['UNLIMITED', 'Unlimited'],
];
/** Atributo `type` observado só como Unlimited; demais inferidos dos nomes dos elementos (D31). */
const MODEL_TYPE_OBSERVED: Readonly<Partial<Record<Model, string>>> = { UNLIMITED: 'Unlimited' };

/** ChannelsSetup: atributo -> campo do cenário (mapeamento inferido, D31; D09). */
const CHANNEL_ATTRS: readonly [string, keyof Channels][] = [
  ['Gnss', 'gnss'],
  ['Galileo', 'dualGal'],
  ['Gps', 'dualGps'],
  ['SingleSbas', 'sbas'],
  ['Sbas', 'dualSbas'],
];

/** DiagnosticsSetup do exemplo (diagnóstico fora do cenário, D21). */
const DIAGNOSTICS_BLOCK = [
  '\t<DiagnosticsSetup>',
  '\t\t<DiagnosticsMode>Off</DiagnosticsMode>',
  '\t\t<Frequency>1176.45 MHz</Frequency>',
  '\t\t<Amplitude>-100</Amplitude>',
  '\t\t<DopplerError>0</DopplerError>',
  '\t</DiagnosticsSetup>',
];

const isoUtc = (t: number): string => new Date(t * 1000).toISOString().slice(0, 19);

function limitsAttrs(l: MotionLimits): string {
  return `LateralAcceleration="${g16(l.maxLateral_mps2)}" Velocity="${g16(l.maxVelocity_mps)}" LongitudinalAcceleration="${g16(l.maxLongitudinal_mps2)}"`;
}

const almanacName = (sc: Scenario): string =>
  sc.files.almanac.kind === 'file' ? sc.files.almanac.name : '';

export interface SettingsXmlResult {
  /** null quando algum valor não tem token observado. */
  text: string | null;
  diagnostics: Diagnostic[];
}

export function settingsToXml(sc: Scenario): SettingsXmlResult {
  const missing: string[] = [];
  const token = (s: EnumSpec): string => {
    const key = s.get(sc);
    const t = s.observed[key];
    if (t === undefined) missing.push(`${s.element}=${key}`);
    return t ?? '';
  };
  const el = (s: EnumSpec, indent: string): string =>
    `${indent}<${s.element}>${token(s)}</${s.element}>`;
  const sim = ENUMS.filter((s) => s.parent === 'SimulationSetup');
  const io = ENUMS.filter((s) => s.parent === 'IoSetup');
  const type = MODEL_TYPE_OBSERVED[sc.motion.model];
  if (type === undefined) missing.push(`MotionModel type=${sc.motion.model}`);
  const nullChannels = CHANNEL_ATTRS.filter(([, k]) => sc.channels[k] === null);
  if (nullChannels.length > 0)
    missing.push(`ChannelsSetup (${nullChannels.map(([a]) => a).join(', ')} não definidos)`);

  const at = (name: string): number => sim.findIndex((s) => s.element === name);
  const simLines = sim.map((s) => el(s, '\t\t'));
  // UserDateTime depois de ClockSetting; RfLevel depois de RfPortSelection (ordem de OP D-7).
  simLines.splice(
    at('ClockSetting') + 1,
    0,
    `\t\t<UserDateTime>${isoUtc(sc.setup.userTime_s)}</UserDateTime>`,
  );
  simLines.splice(
    at('RfPortSelection') + 2,
    0,
    `\t\t<RfLevel>${g16(sc.setup.rfLevel_dBm)}</RfLevel>`,
  );
  const models = MODEL_ELEMENTS.map(([m, name]) => {
    const l = m === 'CUSTOM' && sc.motion.custom ? sc.motion.custom : D27_FACTORY_LIMITS[m];
    return `\t\t\t<${name} ${limitsAttrs(l)}/>`;
  });
  const p = sc.position;
  const lines = [
    '<!DOCTYPE GpsgPowerupConfig>',
    '<GpsgPowerupConfig>',
    '\t<SimulationSetup>',
    ...simLines,
    `\t\t<MotionModel type="${type ?? ''}">`,
    ...models,
    '\t\t</MotionModel>',
    '\t</SimulationSetup>',
    `\t<ChannelsSetup ${CHANNEL_ATTRS.map(([a, k]) => `${a}="${String(sc.channels[k] ?? '')}"`).join(' ')}/>`,
    '\t<IoSetup>',
    `\t\t<LossValues Splitter="${g16(sc.io.splitter_dB)}" Coupler="${g16(sc.io.coupler_dB)}" DirectCable="${g16(sc.io.directCable_dB)}" CouplerCable="${g16(sc.io.couplerCable_dB)}"/>`,
    ...io.map((s) => el(s, '\t\t')),
    '\t</IoSetup>',
    `\t<DefaultStaticPoint Longitude="${g16(radToDeg(p.lon_rad))}" Latitude="${g16(radToDeg(p.lat_rad))}" Altitude="${g16(p.alt_m)}"/>`,
    `\t<DefaultFiles Trajectory="${sc.files.nmea ?? ''}" Route="${sc.files.route ?? ''}" Almanac="${almanacName(sc)}"/>`,
    ...DIAGNOSTICS_BLOCK,
    '</GpsgPowerupConfig>',
  ];
  if (missing.length > 0) {
    return {
      text: null,
      diagnostics: [
        diag(
          'file-omitted',
          'warning',
          `settings XML não gerado: sem token observado em bancada ou no manual para ${missing.join('; ')}. A configuração vai pelo script.`,
          { dRefs: D31_DREFS },
        ),
      ],
    };
  }
  return {
    text: lines.join('\n') + '\n',
    diagnostics: [
      diag(
        'file-unverified',
        'warning',
        'settings XML com os tokens do exemplo do manual (OP D-7), não verificado em bancada',
        { dRefs: D31_DREFS },
      ),
    ],
  };
}

export interface SettingsReadResult {
  scenario: Scenario;
  diagnostics: Diagnostic[];
}

function reverse(m: Readonly<Record<string, string>>): Map<string, string> {
  return new Map(Object.entries(m).map(([k, v]) => [v.toLowerCase(), k]));
}

function numAttr(el: XmlElement | undefined, a: string): number | null {
  const s = el?.attrs[a];
  if (s === undefined || s.trim() === '') return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

/** Settings XML -> cenário: aplica sobre `base` os valores reconhecidos. */
export function settingsFromXml(text: string, base: Scenario): SettingsReadResult {
  const sc = structuredClone(base);
  const diagnostics: Diagnostic[] = [];
  const warn = (m: string, code: Diagnostic['code'] = 'file-value', dRefs: string[] = []): void => {
    diagnostics.push(diag(code, 'warning', m, { dRefs }));
  };
  const r = parseXml(text);
  if ('error' in r) return { scenario: base, diagnostics: [diag('file-format', 'error', r.error)] };
  if (r.root.name !== 'GpsgPowerupConfig')
    return {
      scenario: base,
      diagnostics: [
        diag('file-format', 'error', `raiz <${r.root.name}>, esperado <GpsgPowerupConfig>`),
      ],
    };
  const sim = child(r.root, 'SimulationSetup');
  const io = child(r.root, 'IoSetup');
  for (const s of ENUMS) {
    const parent = s.parent === 'SimulationSetup' ? sim : io;
    const e = parent && child(parent, s.element);
    if (!e) {
      warn(`${s.element} ausente`, 'file-format');
      continue;
    }
    const t = e.text.toLowerCase();
    const obs = reverse(s.observed).get(t);
    const inf = reverse(D31_SETTINGS_INFERRED[s.element] ?? {}).get(t);
    if (obs !== undefined) s.set(sc, obs);
    else if (inf !== undefined) {
      s.set(sc, inf);
      warn(`${s.element}=${e.text}: token inferido, não verificado`, 'file-unverified', D31_DREFS);
    } else
      warn(
        `${s.element}=${e.text}: token desconhecido; valor não aplicado`,
        'file-value',
        D31_DREFS,
      );
  }

  const dt = sim && child(sim, 'UserDateTime');
  if (dt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(dt.text);
    if (m)
      sc.setup.userTime_s =
        Date.UTC(
          +(m[1] ?? 0),
          +(m[2] ?? 1) - 1,
          +(m[3] ?? 1),
          +(m[4] ?? 0),
          +(m[5] ?? 0),
          +(m[6] ?? 0),
        ) / 1000;
    else warn(`UserDateTime inválido: ${dt.text}`);
  }
  const lvl = sim && child(sim, 'RfLevel');
  if (lvl) {
    const x = Number(lvl.text);
    if (lvl.text !== '' && Number.isFinite(x)) sc.setup.rfLevel_dBm = x;
    else warn(`RfLevel inválido: ${lvl.text}`);
  }

  const mm = sim && child(sim, 'MotionModel');
  if (mm) {
    const type = mm.attrs.type ?? '';
    const hit = MODEL_ELEMENTS.find(([, n]) => n.toLowerCase() === type.toLowerCase());
    if (!hit)
      warn(`MotionModel type=${type}: desconhecido; valor não aplicado`, 'file-value', D31_DREFS);
    else {
      sc.motion.model = hit[0];
      if (MODEL_TYPE_OBSERVED[hit[0]] === undefined)
        warn(
          `MotionModel type=${type}: token inferido, não verificado`,
          'file-unverified',
          D31_DREFS,
        );
    }
    for (const [m, name] of MODEL_ELEMENTS) {
      const e = child(mm, name);
      const l = {
        maxLateral_mps2: numAttr(e, 'LateralAcceleration'),
        maxLongitudinal_mps2: numAttr(e, 'LongitudinalAcceleration'),
        maxVelocity_mps: numAttr(e, 'Velocity'),
      };
      if (
        l.maxLateral_mps2 === null ||
        l.maxLongitudinal_mps2 === null ||
        l.maxVelocity_mps === null
      ) {
        warn(`MotionModel ${name}: limites ausentes ou inválidos`, 'file-format');
        continue;
      }
      const lim = l as MotionLimits;
      if (m === 'CUSTOM') {
        if (sc.motion.model === 'CUSTOM') sc.motion.custom = lim;
      } else if (JSON.stringify(lim) !== JSON.stringify(D27_FACTORY_LIMITS[m])) {
        diagnostics.push(
          diag(
            'not-represented',
            'info',
            `limites de ${name} diferentes dos de fábrica (D27); não representados no cenário`,
          ),
        );
      }
    }
    if (sc.motion.model !== 'CUSTOM') sc.motion.custom = null;
  }

  const ch = child(r.root, 'ChannelsSetup');
  if (ch) {
    for (const [a, k] of CHANNEL_ATTRS) sc.channels[k] = numAttr(ch, a);
    warn(
      'ChannelsSetup: mapeamento para a alocação de canais inferido (D09, D31)',
      'file-unverified',
      ['D09', ...D31_DREFS],
    );
  }
  const loss = io && child(io, 'LossValues');
  if (loss) {
    const v = {
      splitter_dB: numAttr(loss, 'Splitter'),
      coupler_dB: numAttr(loss, 'Coupler'),
      directCable_dB: numAttr(loss, 'DirectCable'),
      couplerCable_dB: numAttr(loss, 'CouplerCable'),
    };
    for (const [k, x] of Object.entries(v)) {
      if (x === null) warn(`LossValues ${k}: ausente ou inválido`, 'file-format');
      else sc.io[k as keyof Scenario['io']] = x;
    }
  }
  const sp = child(r.root, 'DefaultStaticPoint');
  if (sp) {
    const lat = numAttr(sp, 'Latitude');
    const lon = numAttr(sp, 'Longitude');
    const alt = numAttr(sp, 'Altitude');
    if (lat === null || lon === null || alt === null)
      warn('DefaultStaticPoint inválido', 'file-format');
    else sc.position = { lat_rad: degToRad(lat), lon_rad: degToRad(lon), alt_m: alt };
  }
  const df = child(r.root, 'DefaultFiles');
  if (df && Object.values(df.attrs).some((v) => v !== '')) {
    diagnostics.push(
      diag(
        'not-represented',
        'info',
        `DefaultFiles (arquivos da inicialização: ${Object.entries(df.attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')}) não fazem parte do cenário`,
      ),
    );
  }
  return { scenario: sc, diagnostics };
}
