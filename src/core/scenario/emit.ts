// Emissor canônico: Scenario -> script .scpi em ordem determinística.
//
// Ordem: metadados, salvaguardas do equipamento compartilhado (estado parado, backup), UNIT SI (D04),
// importação e carga de arquivos, setup, I/O, movimento, almanaque, waypoints, posição, rota ou
// trajetória conforme o tipo de simulação, RF Level, confirmação física, @run, ações por @at, @stop.
// O texto gerado é relido por parseScript; os diagnósticos dessa leitura voltam junto.
import { diag, type Diagnostic } from '../diagnostics';
import type { CommandHeader } from '../model/load';
import { D04_FORCED_UNITS, D24_DREFS } from '../quirks';
import { formatCommand, type EmitArg } from '../scpi/format';
import { formatNumber } from '../units';
import type { ScriptDoc } from '../script/ast';
import { parseScript } from '../script/parse';
import { NAME_RE, type FileKind, type Scenario, type TimedAction } from './types';

export const META_NAME = 'twin-scenario:';
export const META_DESCRIPTION = 'twin-description:';
export const META_CHANNELS = 'twin-channels:';

export interface EmitResult {
  text: string;
  doc: ScriptDoc;
  diagnostics: Diagnostic[];
}

/** Resolução de tempo das ações: 1 ms. */
const TIME_DECIMALS = 3;
const roundTime = (t: number): number => Number(formatNumber(t, TIME_DECIMALS));

const c = (header: CommandHeader, ...args: EmitArg[]): string => formatCommand(header, args);

const IMPORT_HEADERS: Readonly<Record<FileKind, CommandHeader>> = {
  SET: 'GPS:FILe:SET:IMPort',
  ROUT: 'GPS:FILe:ROUT:IMPort',
  ALM: 'GPS:FILe:ALM:IMPort',
  NMEA: 'GPS:FILe:NMEA:IMPort',
  WAYP: 'GPS:FILe:WAYP:IMPort',
};

const fmtDate = (t: number): string => {
  const d = new Date(t * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`;
};

const fmtTime = (t: number): string => {
  const d = new Date(t * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

export function backupName(sc: Scenario): string {
  return `twin_bkp_${sc.name}`;
}

/** Ações ordenadas por tempo, estável. */
export function sortedActions(actions: readonly TimedAction[]): TimedAction[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.t_s - y.a.t_s || x.i - y.i)
    .map((x) => x.a);
}

function actionLine(a: TimedAction): string {
  if (a.type === 'rfLevel') return c('GPS:SET:RFLeVel', a.level_dBm);
  const header: CommandHeader =
    a.constellation === 'GPS' ? 'GPS:SVPR:GPS:SATellite' : 'GPS:SVPR:GAL:SATellite';
  return c(
    header,
    a.sv,
    a.select,
    a.health,
    a.doppler_Hz,
    a.incoherence_mps,
    a.ampOffset_dB,
    a.stepError_m,
    a.duration_s,
  );
}

export function scenarioChecks(sc: Scenario): Diagnostic[] {
  const out: Diagnostic[] = [];
  const bad = (m: string): void => {
    out.push(diag('scenario-invalid', 'error', m));
  };
  const warn = (m: string, dRefs: string[] = []): void => {
    out.push(diag('scenario-consistency', 'warning', m, { dRefs }));
  };
  if (!NAME_RE.test(sc.name))
    bad(`nome "${sc.name}" inválido: usar minúsculas, dígitos e _ (até 40)`);
  if (sc.setup.rfPort === 'COUPLER' && sc.setup.digitalNoise === 'ON') {
    warn('ruído digital ligado com porta COUPLER; a UI do equipamento força OFF');
  }
  if (sc.setup.rfPort === 'DIRECT' && sc.setup.digitalNoise === 'OFF') {
    warn('ruído digital desligado com porta DIRECT; a UI do equipamento força ON');
  }
  if (sc.files.almanac.kind === 'equipment') {
    out.push(
      diag(
        'almanac-not-fixed',
        'warning',
        'almanaque não fixado: o céu simulado depende do estado do equipamento',
        {
          dRefs: D24_DREFS,
        },
      ),
    );
  }
  if (
    sc.setup.simulationType === 'DYNAMIC' &&
    sc.files.route === null &&
    sc.route.points.length === 0
  ) {
    warn('simulação DYNAMIC sem rota');
  }
  if (sc.setup.simulationType === 'TRAJECTORY' && sc.files.nmea === null) {
    warn('simulação TRAJECTORY sem arquivo de trajetória');
  }
  const last = sortedActions(sc.actions).at(-1);
  if (sc.run.stopAt_s !== null && last && last.t_s > sc.run.stopAt_s) {
    bad(`ação em t=${last.t_s} s depois do @stop em t=${sc.run.stopAt_s} s`);
  }
  for (const a of sc.actions) {
    if (!(a.t_s >= 0)) bad(`ação com tempo inválido: ${a.t_s}`);
  }
  return out;
}

export function emitLines(sc: Scenario): string[] {
  const s = sc.setup;
  const L: string[] = [];
  const blank = (): void => {
    L.push('');
  };
  const comment = (t: string): void => {
    L.push(`# ${t}`);
  };

  comment(`${META_NAME} ${sc.name}`);
  if (sc.description.trim() !== '')
    comment(`${META_DESCRIPTION} ${sc.description.replace(/\s+/g, ' ').trim()}`);
  comment(`gerado pelo gpsg-twin, scenario_version ${sc.scenario_version}`);
  L.push('@errcheck on');
  L.push(`@mark ${sc.name} inicio`);
  L.push(`@expect ${c('GPS:SIM:ToggleRUN?')} Stopped`);
  L.push(
    '@pause Se TRUN? nao retornou Stopped, outro usuario esta com a simulacao ativa: interromper (Ctrl+C).',
  );

  blank();
  comment('backup do estado do usuário anterior');
  L.push(c('GPS:FILe:SET:SAVe', backupName(sc)));
  L.push(c('GPS:FILe:ROUT:SAVe', `${backupName(sc)}.rte`));

  blank();
  comment('D04: unidades SI em todo script gerado');
  L.push(c('GPS:SET:UNITs', D04_FORCED_UNITS));
  L.push(`@expect ${c('GPS:SET:UNITs?')} ${D04_FORCED_UNITS}`);

  if (sc.files.imports.length > 0 || sc.files.settings !== null) {
    blank();
    comment('arquivos do pendrive');
    for (const k of sc.files.imports) L.push(c(IMPORT_HEADERS[k]));
    if (sc.files.settings !== null) L.push(c('GPS:FILe:SET:LOAD', sc.files.settings));
  }

  blank();
  comment('setup');
  L.push(c('GPS:SET:GNSS', s.gnss));
  L.push(c(s.carrier.command, s.carrier.token));
  L.push(c('GPS:SET:SBAS', s.sbas));
  L.push(c('GPS:SET:SimulationTYPe', s.simulationType));
  L.push(c('GPS:SET:PRNSignal', s.prnSignal));
  L.push(c('GPS:SET:FADing', s.fading));
  L.push(c('GPS:SET:PositionSouRCe', s.positionSource));
  L.push(c('GPS:SET:CLOCk', s.clock));
  if (s.clock === 'USER') {
    L.push(c('GPS:SET:DATe', fmtDate(s.userTime_s)));
    L.push(c('GPS:SET:TIMe', fmtTime(s.userTime_s)));
  }
  L.push(c('GPS:SET:TriggerSouRCe', s.triggerSource));
  L.push(c('GPS:SET:ExtREF', s.extRef));
  L.push(c('GPS:SET:ReferenceSouRCe', s.referenceSource));

  blank();
  comment('I/O');
  L.push(c('GPS:SET:RFPoRt', s.rfPort));
  L.push(c('GPS:SET:DigitalNOiSe', s.digitalNoise));
  L.push(c('GPS:SET:CouplerLOSs', sc.io.coupler_dB));
  L.push(c('GPS:SETup:CouplerCABle', sc.io.couplerCable_dB));
  L.push(c('GPS:SET:DirectCABle', sc.io.directCable_dB));
  L.push(c('GPS:SET:SplitterLOSs', sc.io.splitter_dB));

  blank();
  comment('movimento');
  L.push(c('GPS:SET:CuRrentMotionModel', sc.motion.model));
  if (sc.motion.custom) {
    L.push(c('GPS:SET:MaxLATeralacceleration', sc.motion.custom.maxLateral_mps2));
    L.push(c('GPS:SET:MaxLONgitudinalacceleration', sc.motion.custom.maxLongitudinal_mps2));
    L.push(c('GPS:SET:MaxVELocity', sc.motion.custom.maxVelocity_mps));
  }
  const chSet = Object.entries(sc.channels).filter(([, v]) => v !== null);
  if (chSet.length > 0) {
    // D09: alocação de canais não emitida; guardada como metadado para a ida e volta.
    comment(
      `${META_CHANNELS} ${chSet.map(([k, v]) => `${k}=${String(v)}`).join(' ')} (D09: não emitido)`,
    );
  }

  blank();
  comment('almanaque');
  if (sc.files.almanac.kind === 'file') L.push(c('GPS:FILe:ALM:LOAD', sc.files.almanac.name));
  else if (sc.files.almanac.kind === 'default') L.push(c('GPS:FILe:ALM:DEFault'));
  else comment('D24: almanaque não fixado, usa o que estiver carregado no equipamento');

  if (sc.userWaypoints.length > 0) {
    blank();
    comment('waypoints de usuário');
    for (const w of sc.userWaypoints) {
      L.push(
        c('GPS:WAYP:NEW', w.code, w.icao, w.name, w.city, w.state, w.lat_rad, w.lon_rad, w.alt_m),
      );
    }
  }

  if (sc.files.kml !== null) L.push(c('GPS:FILe:KML:LOAD', sc.files.kml));

  blank();
  if (s.simulationType === 'STATIC') {
    comment('posição estática');
    if (s.positionSource === 'USER') {
      L.push(c('GPS:SIM:LATitude', sc.position.lat_rad));
      L.push(c('GPS:SIM:LONGitude', sc.position.lon_rad));
      L.push(c('GPS:SIM:ALTitude', sc.position.alt_m));
    }
  } else if (s.simulationType === 'DYNAMIC') {
    comment('rota');
    if (sc.files.route !== null) {
      L.push(c('GPS:FILe:ROUT:LOAD', sc.files.route));
    } else if (sc.route.points.length > 0) {
      L.push('@pause ROUT:CLR apaga a rota em memoria (salva no backup). Enter para continuar.');
      L.push(c('GPS:ROUT:CLeaR'));
    }
    for (const p of sc.route.points) {
      const leg = [p.climbRate_mps, p.speed_mps, p.accel_mps2, p.turnRadius_m];
      L.push(
        p.kind === 'point'
          ? c('GPS:ROUT:ADD:POINt', p.name, p.lat_rad, p.lon_rad, p.alt_m, ...leg)
          : c('GPS:ROUT:ADD:WAYPoint', p.code, ...leg),
      );
    }
    L.push(c('GPS:ROUT:LOOP', sc.route.loop));
    L.push(c('GPS:ROUT:VALiDate'));
    L.push(c('GPS:STAT?'));
  } else {
    comment('trajetória');
    if (sc.files.nmea !== null) L.push(c('GPS:FILe:NMEA:LOAD', sc.files.nmea));
  }

  blank();
  comment('nível de RF');
  L.push(c('GPS:SET:RFLeVel', s.rfLevel_dBm));
  L.push(
    `@pause Confirmar porta ${s.rfPort} e destino do sinal (carga, atenuador ou DUT em bancada). Nada irradiando. Enter para iniciar.`,
  );

  blank();
  L.push('@run');
  let t = 0;
  for (const a of sortedActions(sc.actions)) {
    const ta = roundTime(a.t_s);
    if (ta > t) {
      L.push(`@at ${formatNumber(ta, TIME_DECIMALS)}`);
      t = ta;
    }
    L.push(actionLine(a));
  }
  if (sc.run.stopAt_s !== null) {
    const ts = roundTime(sc.run.stopAt_s);
    if (ts > t) L.push(`@at ${formatNumber(ts, TIME_DECIMALS)}`);
    L.push('@stop');
  }
  L.push(`@mark ${sc.name} fim`);

  blank();
  comment('restauração do estado anterior, se necessário (executar manualmente):');
  comment(c('GPS:FILe:SET:LOAD', backupName(sc)));
  comment(c('GPS:FILe:ROUT:LOAD', `${backupName(sc)}.rte`));
  return L;
}

export function emitScenario(sc: Scenario): EmitResult {
  const text = emitLines(sc).join('\n') + '\n';
  const doc = parseScript(text);
  return { text, doc, diagnostics: [...scenarioChecks(sc), ...doc.diagnostics] };
}
