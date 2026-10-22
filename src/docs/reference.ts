// Referência de comandos gerada a partir de model/commands.json e docs/04-discrepancias.md.
// Regenerada em todo build; nunca editada à mão.
import type { CommandInfo, ModelIndex, Param } from '../core/model/load';
import type { Category, CommandKind } from '../core/model/types.gen';
import { EMIT_HEADER_OVERRIDE, rangeOverride } from '../core/quirks';
import type { Discrepancy } from './discrepancies';

export interface ReferenceParam {
  name: string;
  type: string;
  range: string;
  unit: string;
  optional: boolean;
  notes: string;
}

export interface ReferenceDiscrepancy {
  id: string;
  divergence: string;
  provisional: string;
  resolved: boolean;
}

export interface ReferenceEntry {
  header: string;
  shortHeader: string;
  longHeader: string;
  /** Forma emitida pelo twin quando difere da forma curta (tratamento provisório). */
  emittedAs: string | null;
  kind: CommandKind;
  category: Category;
  aliases: string[];
  params: ReferenceParam[];
  returns: string | null;
  locked: boolean | null;
  example: string | null;
  page: string;
  verified: boolean;
  emitAllowed: boolean;
  notes: string | null;
  discrepancies: ReferenceDiscrepancy[];
  /** Texto normalizado para busca. */
  search: string;
}

function rangeText(inf: CommandInfo, p: Param): string {
  const ov = rangeOverride(inf.header, p.name);
  const ovText = ov ? ` (twin: ${ov.min ?? p.min ?? ''}..${ov.max ?? p.max ?? ''}, ${ov.dRefs.join(', ')})` : '';
  if (p.range_by_port) {
    const r = p.range_by_port;
    return `DIRECT ${r.DIRECT[0]}..${r.DIRECT[1]}; COUPLER ${r.COUPLER[0]}..${r.COUPLER[1]}`;
  }
  if (p.range_by_units) {
    return Object.entries(p.range_by_units)
      .map(([u, r]) => `${r[0]}..${r[1]} ${u}`)
      .join('; ');
  }
  if (p.values) return p.values.join(' | ');
  if (p.min !== undefined && p.max !== undefined) return `${p.min}..${p.max}${ovText}`;
  if (p.type === 'string') {
    const parts = [p.format ? `formato ${p.format}` : '', p.maxlen ? `até ${p.maxlen} caracteres` : ''];
    return parts.filter((x) => x !== '').join(', ');
  }
  if (p.type === 'lat' || p.type === 'lon') return 'graus decimais com sinal (D07)';
  if (p.type === 'unit') return 'unidade opcional';
  return '';
}

export function paramOf(inf: CommandInfo, p: Param): ReferenceParam {
  const unit = p.unit ?? (p.unit_suffix ? 'conforme modo de unidades' : '');
  const notes = [p.notes ?? '', p.step !== undefined ? `passo ${p.step}` : '', p.default !== undefined ? `padrão ${p.default}` : '']
    .filter((x) => x !== '')
    .join('; ');
  return { name: p.name, type: p.type, range: rangeText(inf, p), unit, optional: p.optional ?? false, notes };
}

function returnsText(inf: CommandInfo): string | null {
  const r = inf.cmd.returns;
  if (!r) return null;
  const parts = [
    r.type,
    r.values ? r.values.join(' | ') : '',
    r.range ? `${r.range[0]}..${r.range[1]}` : '',
    r.unit ?? '',
    r.format ?? r.format_header ?? '',
    r.example ?? r.example_row ? `ex.: ${r.example ?? r.example_row ?? ''}` : '',
    r.notes ?? '',
  ];
  return parts.filter((x) => x !== '').join('; ');
}

export function buildReference(index: ModelIndex, discrepancies: readonly Discrepancy[]): ReferenceEntry[] {
  const byId = new Map(discrepancies.map((d) => [d.id, d]));
  return index.infos.map((inf) => {
    const c = inf.cmd;
    const ds = c.discrepancies.map((id) => {
      const d = byId.get(id);
      return {
        id,
        divergence: d?.divergence ?? '(sem entrada em docs/04-discrepancias.md)',
        provisional: d?.provisional ?? '',
        resolved: d?.resolved ?? false,
      };
    });
    const emitted = EMIT_HEADER_OVERRIDE[inf.header] ?? null;
    const entry: Omit<ReferenceEntry, 'search'> = {
      header: c.header,
      shortHeader: inf.shortHeader,
      longHeader: inf.longHeader,
      emittedAs: emitted,
      kind: c.kind,
      category: c.category,
      aliases: c.aliases,
      params: inf.params.map((p) => paramOf(inf, p)),
      returns: returnsText(inf),
      locked: c.locked_while_running,
      example: c.example,
      page: `RP ${c.manual_page}`,
      verified: c.verified_on_hw,
      emitAllowed: c.emit_allowed,
      notes: c.notes,
      discrepancies: ds,
    };
    const search = [
      c.header,
      inf.shortHeader,
      inf.longHeader,
      ...c.aliases,
      c.category,
      c.notes ?? '',
      ...inf.params.map((p) => p.name),
      ...c.discrepancies,
    ]
      .join(' ')
      .toLowerCase();
    return { ...entry, search };
  });
}

export interface ReferenceFilter {
  text?: string;
  category?: Category | '';
  kind?: CommandKind | '';
  verifiedOnly?: boolean;
  withDiscrepancyOnly?: boolean;
}

export function filterReference(entries: readonly ReferenceEntry[], f: ReferenceFilter): ReferenceEntry[] {
  const terms = (f.text ?? '').toLowerCase().split(/\s+/).filter((t) => t !== '');
  return entries.filter(
    (e) =>
      (!f.category || e.category === f.category) &&
      (!f.kind || e.kind === f.kind) &&
      (!f.verifiedOnly || e.verified) &&
      (!f.withDiscrepancyOnly || e.discrepancies.length > 0) &&
      terms.every((t) => e.search.includes(t)),
  );
}

export function categories(entries: readonly ReferenceEntry[]): Category[] {
  return [...new Set(entries.map((e) => e.category))].sort();
}
