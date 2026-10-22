// Linha do tempo nominal de um script: eventos com horário relativo ao @run.
import type { ScriptDoc } from './ast';

export type TimelineKind =
  | 'command'
  | 'query'
  | 'run'
  | 'stop'
  | 'wait'
  | 'at'
  | 'poll'
  | 'expect'
  | 'mark'
  | 'pause'
  | 'input';

export interface TimelineEvent {
  lineNo: number;
  kind: TimelineKind;
  label: string;
  tSession: number;
  tRun: number | null;
  /** false: tempo mínimo nominal (depois de @pause, @input ou espera variável). */
  exact: boolean;
  runIndex: number;
  /** Cabeçalho do modelo, para comandos resolvidos. */
  header: string | null;
}

export function timeline(doc: ScriptDoc): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const l of doc.lines) {
    const base = {
      lineNo: l.lineNo,
      tSession: l.time.tSession,
      tRun: l.time.tRun,
      exact: l.time.tRun === null ? l.time.sessionExact : l.time.runExact,
      runIndex: l.time.runIndex,
    };
    if (l.type === 'command') {
      const inf = l.command.info;
      out.push({
        ...base,
        kind: inf?.isQuery ? 'query' : 'command',
        label: l.body,
        header: inf?.header ?? null,
      });
    } else if (l.type === 'directive' && l.directive) {
      const d = l.directive;
      if (d.name === 'errcheck' || d.name === 'set') continue;
      out.push({ ...base, kind: d.name, label: l.body, header: null });
    }
  }
  return out;
}
