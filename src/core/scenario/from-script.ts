// Caminho reverso: ScriptDoc -> Scenario.
// Configuração: comandos antes do primeiro @run, aplicados pelo redutor. Execução: SVPR:SAT e RFLV
// entre o primeiro @run e o @stop dele viram ações temporizadas. Execuções seguintes não entram no
// cenário (diagnóstico multi-run).
import { diag, type Diagnostic } from '../diagnostics';
import type { CommandHeader } from '../model/load';
import { D02_DEFAULT_DURATION_S, D24_DREFS } from '../quirks';
import type { ParamValue } from '../scpi/params';
import type { CheckedCommand } from '../scpi/validate';
import type { ScriptDoc, ScriptLine } from '../script/ast';
import { applyCommand } from './apply';
import { defaultScenario } from './defaults';
import { META_CHANNELS, META_DESCRIPTION, META_NAME } from './emit';
import { NAME_RE, type Channels, type Scenario, type SvAction } from './types';

export interface FromScriptOptions {
  /** Nome do cenário quando o script não tiver metadado (por exemplo, nome do arquivo). */
  name?: string;
}

export interface FromScriptResult {
  scenario: Scenario;
  diagnostics: Diagnostic[];
  /** Campos de configuração que o script não define (ficam com o padrão do twin). */
  unset: string[];
}

/** Campos de configuração que um cenário completo define. */
export const CONFIG_FIELDS: readonly string[] = [
  'setup.units',
  'setup.gnss',
  'setup.carrier',
  'setup.sbas',
  'setup.simulationType',
  'setup.digitalNoise',
  'setup.fading',
  'setup.prnSignal',
  'setup.positionSource',
  'setup.clock',
  'setup.rfPort',
  'setup.rfLevel_dBm',
  'setup.triggerSource',
  'setup.extRef',
  'setup.referenceSource',
  'io.coupler_dB',
  'io.couplerCable_dB',
  'io.directCable_dB',
  'io.splitter_dB',
  'motion.model',
];

const SVPR: Partial<Record<CommandHeader, 'GPS' | 'GAL'>> = {
  'GPS:SVPR:GPS:SATellite': 'GPS',
  'GPS:SVPR:GAL:SATellite': 'GAL',
};

const num = (v: ParamValue | undefined): number | undefined =>
  v?.kind === 'number' ? v.value : undefined;
const tok = (v: ParamValue | undefined): string | undefined =>
  v?.kind === 'enum' ? v.value : undefined;

function svAction(cmd: CheckedCommand, constellation: 'GPS' | 'GAL', t: number): SvAction | null {
  const v = cmd.values;
  const sv = num(v[0]);
  const select = tok(v[1]);
  const health = tok(v[2]);
  const nums = [3, 4, 5, 6].map((i) => num(v[i]));
  if (
    sv === undefined ||
    select === undefined ||
    health === undefined ||
    nums.some((x) => x === undefined)
  ) {
    return null;
  }
  const [doppler, incoh, amp, step] = nums as number[];
  return {
    t_s: t,
    type: 'sv',
    constellation,
    sv,
    select: select as SvAction['select'],
    health: health as SvAction['health'],
    doppler_Hz: doppler ?? 0,
    incoherence_mps: incoh ?? 0,
    ampOffset_dB: amp ?? 0,
    stepError_m: step ?? 0,
    duration_s: num(v[7]) ?? D02_DEFAULT_DURATION_S,
  };
}

function meta(l: ScriptLine, key: string): string | null {
  if (l.type !== 'comment' || !l.text.startsWith(key)) return null;
  return l.text.slice(key.length).trim();
}

const CHANNEL_KEYS: readonly (keyof Channels)[] = [
  'gnss',
  'sbas',
  'dualGps',
  'dualGal',
  'dualSbas',
];

function readChannels(text: string, ch: Channels): void {
  for (const m of text.matchAll(/(\w+)=(\d+)/g)) {
    const k = CHANNEL_KEYS.find((x) => x === m[1]);
    if (k) ch[k] = Number(m[2]);
  }
}

export function sanitizeName(s: string): string {
  const n = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return NAME_RE.test(n) ? n : 'cenario';
}

export function scenarioFromScript(doc: ScriptDoc, opts: FromScriptOptions = {}): FromScriptResult {
  let sc = defaultScenario();
  // Sem carga explícita, o almanaque é o que estiver no equipamento (D24).
  sc.files.almanac = { kind: 'equipment' };
  sc.name = sanitizeName(opts.name ?? 'cenario');
  const known = new Set<string>();
  const out: Diagnostic[] = [];
  const note = (l: ScriptLine, d: Diagnostic): void => {
    d.line = l.lineNo;
    out.push(d);
  };

  for (const l of doc.lines) {
    const name = meta(l, META_NAME);
    if (name !== null) sc.name = sanitizeName(name);
    const desc = meta(l, META_DESCRIPTION);
    if (desc !== null) sc.description = desc;
    const channels = meta(l, META_CHANNELS);
    if (channels !== null) readChannels(channels, sc.channels);

    const run = l.time.runIndex;
    if (l.type === 'directive' && l.directive?.name === 'run' && run >= 1) {
      note(
        l,
        diag(
          'multi-run',
          'warning',
          `script com ${doc.runs} execuções; o cenário cobre só a primeira`,
        ),
      );
      break;
    }

    if (
      l.type === 'directive' &&
      l.directive?.name === 'stop' &&
      run === 1 &&
      l.time.running === true
    ) {
      sc.run.stopAt_s = l.time.tRun;
      if (!l.time.runExact) {
        note(
          l,
          diag(
            'time-approximate',
            'warning',
            '@stop depois de @pause ou @input: tempo é o mínimo nominal',
          ),
        );
      }
      continue;
    }
    if (l.type !== 'command') continue;
    const cmd = l.command;
    const inf = cmd.info;
    if (!inf || cmd.diagnostics.some((d) => d.severity === 'error')) continue;

    if (run === 0) {
      const r = applyCommand(sc, cmd);
      if (r.kind === 'applied') {
        sc = r.state;
        for (const k of r.touched) known.add(k);
        for (const d of r.diagnostics) note(l, d);
      } else if (r.kind === 'unrepresented') {
        note(l, diag('not-represented', 'info', `${inf.shortHeader} não faz parte do cenário`));
      }
      continue;
    }

    // Dentro da primeira execução.
    if (inf.isQuery) continue;
    if (l.time.running !== true) {
      note(
        l,
        diag(
          'not-represented',
          'info',
          `${inf.shortHeader} depois do @stop não faz parte do cenário`,
        ),
      );
      continue;
    }
    const t = l.time.tRun ?? 0;
    if (!l.time.runExact) {
      note(
        l,
        diag(
          'time-approximate',
          'warning',
          `ação depois de @pause ou @input: t=${t} s é o mínimo nominal`,
        ),
      );
    }
    const constellation = SVPR[inf.header];
    if (constellation) {
      if (cmd.values.some((v) => v?.kind === 'var')) {
        note(
          l,
          diag(
            'var-runtime',
            'warning',
            'SV definido por variável de execução; ação não representada',
          ),
        );
        continue;
      }
      const a = svAction(cmd, constellation, t);
      if (a) sc.actions.push(a);
      continue;
    }
    if (inf.header === 'GPS:SET:RFLeVel') {
      const level = num(cmd.values[0]);
      if (level !== undefined) sc.actions.push({ t_s: t, type: 'rfLevel', level_dBm: level });
      continue;
    }
    note(
      l,
      diag('not-represented', 'info', `${inf.shortHeader} em execução não faz parte do cenário`),
    );
  }

  if (sc.files.almanac.kind === 'equipment') {
    out.push(
      diag(
        'almanac-not-fixed',
        'warning',
        'script não carrega almanaque (ALM:LOAD ou ALM:DEF): cenário não fixado',
        {
          dRefs: D24_DREFS,
        },
      ),
    );
  }
  const unset = CONFIG_FIELDS.filter((f) => !known.has(f));
  return { scenario: sc, diagnostics: out, unset };
}
