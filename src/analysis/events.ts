// Eventos do script para a aba Análise: cada linha relevante com o instante relativo ao @run, uma
// descrição e o alvo na réplica (campo, janela ou SV), para a ligação script <-> réplica <-> análise.
import type { ScriptDoc } from '../core/script/ast';
import { timeline, type TimelineKind } from '../core/script/timeline';
import { fieldsForHeader } from '../replica/fields';

export type Target =
  | { kind: 'field'; id: string }
  | { kind: 'window'; win: 'route' | 'waypoint' | 'file' | 'svprn' }
  | { kind: 'sv'; constellation: 'GPS' | 'GAL'; sv: number };

export interface AnalysisEvent {
  line: number;
  /** Instante desde o @run da primeira execução; null para a configuração antes do @run. */
  t_s: number | null;
  /** false: mínimo nominal (depois de @pause ou @input). */
  exact: boolean;
  kind: TimelineKind;
  label: string;
  target: Target | null;
}

function targetOf(header: string | null, label: string): Target | null {
  if (!header) return null;
  const set = header.endsWith('?') ? header.slice(0, -1) : header;
  const f = fieldsForHeader(set)[0];
  if (f) return { kind: 'field', id: f.id };
  const sat = /^GPS:SVPR:(GPS|GAL):SATellite$/.exec(set);
  if (sat) {
    const sv = Number(/^\S+\s+(\d+)/.exec(label)?.[1]);
    return Number.isInteger(sv)
      ? { kind: 'sv', constellation: sat[1] === 'GPS' ? 'GPS' : 'GAL', sv }
      : { kind: 'window', win: 'svprn' };
  }
  if (set.startsWith('GPS:SVPR:')) return { kind: 'window', win: 'svprn' };
  if (set.startsWith('GPS:ROUT:') || set.startsWith('GPS:FILe:ROUT:'))
    return { kind: 'window', win: 'route' };
  if (set.startsWith('GPS:WAYP:') || set.startsWith('GPS:FILe:WAYP:'))
    return { kind: 'window', win: 'waypoint' };
  if (set.startsWith('GPS:FILe:')) return { kind: 'window', win: 'file' };
  return null;
}

/** Eventos da configuração e da primeira execução (o cenário cobre só a primeira, como a réplica). */
export function analysisEvents(doc: ScriptDoc): AnalysisEvent[] {
  const out: AnalysisEvent[] = [];
  let runs = 0;
  for (const e of timeline(doc)) {
    if (e.kind === 'run' && ++runs > 1) break;
    if (e.kind === 'at' || e.kind === 'mark') continue;
    out.push({
      line: e.lineNo,
      t_s: runs === 0 ? null : e.kind === 'run' ? 0 : e.tRun,
      exact: e.exact,
      kind: e.kind,
      label: e.label,
      target: targetOf(e.header, e.label),
    });
  }
  return out;
}
