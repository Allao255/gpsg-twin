// Caminho reverso: arquivos do pacote USB, exportados do equipamento ou logs de sessão -> réplica.
// A base é o cenário JSON ou o script (.scpi ou log); settings, rota, waypoints e anexos são
// aplicados por cima, nessa ordem.
import { diag, type Diagnostic } from '../core/diagnostics';
import { routeFromXml } from '../core/files/route-xml';
import { isSessionLog, logToScript } from '../core/files/session-log';
import { settingsFromXml } from '../core/files/settings-xml';
import { detectTrajectory } from '../core/files/trajectory';
import { waypointsFromCsv } from '../core/files/waypoints-csv';
import { parseScenarioJson } from '../core/scenario/json';
import { sanitizeName } from '../core/scenario/from-script';
import {
  attachAlmanac,
  attachTrajectory,
  loadScript,
  newSession,
  type ReplicaSession,
  type Result,
} from './session';

export interface InputFile {
  /** Nome ou caminho dentro do ZIP. */
  name: string;
  text: string;
}

export type FileClass =
  | 'scenario'
  | 'script'
  | 'log'
  | 'settings'
  | 'route'
  | 'waypoints'
  | 'almanac'
  | 'trajectory'
  /** Folha de sessão e runner colável do pacote: não importados. */
  | 'aux'
  | 'unknown';

const ext = (name: string): string => /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
const base = (name: string): string => name.replace(/^.*[\\/]/, '');

export function classifyFile(f: InputFile): FileClass {
  const e = ext(f.name);
  const t = f.text.replace(/^\uFEFF/, '').trimStart();
  if (e === 'json') return 'scenario';
  if (e === 'md' || e === 'ps1') return 'aux';
  if (e === 'scpi') return 'script';
  if (isSessionLog(t)) return 'log';
  if (/^(<\?xml[^>]*>\s*)?(<!DOCTYPE GpsgPowerupConfig>\s*)?<GpsgPowerupConfig\b/.test(t))
    return 'settings';
  if (/^(<\?xml[^>]*>\s*)?<Route\b/.test(t)) return 'route';
  if (/^\*+\s*week/i.test(t)) return 'almanac';
  if (detectTrajectory(t) !== null) return 'trajectory';
  if (e === 'csv') return 'waypoints';
  if (e === 'txt') return 'script';
  return 'unknown';
}

export interface ImportResult {
  session: ReplicaSession;
  /** Texto do editor: o script ou log importado; null para regenerar do cenário. */
  script: string | null;
  diagnostics: Diagnostic[];
  /** Uma linha por arquivo: o que foi feito. */
  summary: string[];
}

const ORDER: readonly FileClass[] = [
  'scenario',
  'script',
  'log',
  'settings',
  'route',
  'waypoints',
  'almanac',
  'trajectory',
  'aux',
  'unknown',
];

/** Arquivos derivados do cenário num pacote do twin: com o JSON carregado, não são aplicados. */
const DERIVED: readonly FileClass[] = ['script', 'settings', 'route', 'waypoints'];

export function importFiles(prev: ReplicaSession, files: readonly InputFile[]): ImportResult {
  const diagnostics: Diagnostic[] = [];
  const summary: string[] = [];
  let s: ReplicaSession = { ...prev, running: false, t_s: 0 };
  let script: string | null = null;
  let changedAfterScript = false;
  const note = (file: string, ds: readonly Diagnostic[]): void => {
    for (const d of ds) diagnostics.push({ ...d, message: `${base(file)}: ${d.message}` });
  };
  const apply = (file: string, r: Result, what: string): void => {
    if (r.ok) {
      s = r.session;
      summary.push(`${base(file)}: ${what}`);
      changedAfterScript = true;
    } else {
      diagnostics.push(diag('file-value', 'error', `${base(file)}: ${r.error}`));
      summary.push(`${base(file)}: não aplicado`);
    }
  };
  const classified = files
    .map((f) => ({ f, c: classifyFile(f) }))
    .sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c));
  let baseSet = false;
  let fromScenario = false;

  for (const { f, c } of classified) {
    const name = base(f.name);
    if (fromScenario && DERIVED.includes(c)) {
      summary.push(`${name}: derivado do cenário do pacote; não aplicado`);
      continue;
    }
    switch (c) {
      case 'scenario': {
        if (baseSet) {
          summary.push(`${name}: segundo cenário ignorado`);
          break;
        }
        const r = parseScenarioJson(f.text);
        note(f.name, r.diagnostics);
        if (!r.scenario) {
          summary.push(`${name}: cenário inválido`);
          break;
        }
        s = { ...newSession(r.scenario), svs: prev.svs };
        baseSet = true;
        fromScenario = true;
        summary.push(`${name}: cenário carregado`);
        break;
      }
      case 'script':
      case 'log': {
        if (baseSet) {
          summary.push(`${name}: segundo script; não carregado`);
          break;
        }
        const scenName = sanitizeName(name.replace(/\.[^.]*$/, '')) || prev.scenario.name;
        let text = f.text;
        if (c === 'log') {
          const l = logToScript(f.text, scenName);
          note(f.name, l.diagnostics);
          text = l.text;
          summary.push(
            `${name}: log com ${l.stats.tx} comandos enviados, ${l.stats.rejected} rejeitados, ${l.stats.runs} execução(ões)`,
          );
        } else summary.push(`${name}: script carregado`);
        const loaded = loadScript(s, text, scenName);
        s = loaded.session;
        script = text;
        baseSet = true;
        break;
      }
      case 'settings': {
        const r = settingsFromXml(f.text, s.scenario);
        note(f.name, r.diagnostics);
        s = { ...s, scenario: r.scenario };
        changedAfterScript = true;
        summary.push(`${name}: settings aplicado`);
        break;
      }
      case 'route': {
        const r = routeFromXml(f.text);
        note(f.name, r.diagnostics);
        s = {
          ...s,
          scenario: {
            ...s.scenario,
            route: { ...s.scenario.route, points: r.points },
            files: { ...s.scenario.files, route: null },
          },
        };
        changedAfterScript = true;
        summary.push(`${name}: rota com ${r.points.length} ponto(s)`);
        break;
      }
      case 'waypoints': {
        const r = waypointsFromCsv(f.text);
        note(f.name, r.diagnostics);
        const codes = new Set(r.waypoints.map((w) => w.code));
        s = {
          ...s,
          scenario: {
            ...s.scenario,
            userWaypoints: [
              ...s.scenario.userWaypoints.filter((w) => !codes.has(w.code)),
              ...r.waypoints,
            ],
          },
        };
        changedAfterScript = true;
        summary.push(`${name}: ${r.waypoints.length} waypoint(s) de usuário`);
        break;
      }
      case 'almanac':
        apply(f.name, attachAlmanac(s, name, f.text), 'almanaque anexado');
        break;
      case 'trajectory':
        apply(f.name, attachTrajectory(s, name, f.text), 'trajetória anexada');
        break;
      case 'aux':
        summary.push(`${name}: ignorado`);
        break;
      case 'unknown':
        diagnostics.push(
          diag('file-format', 'warning', `${name}: tipo de arquivo não reconhecido; ignorado`),
        );
        summary.push(`${name}: não reconhecido`);
        break;
    }
  }
  return { session: s, script: changedAfterScript ? null : script, diagnostics, summary };
}
