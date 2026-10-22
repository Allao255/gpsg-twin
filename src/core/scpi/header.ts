// Resolução de cabeçalho SCPI para a entrada do modelo.
// Aceita forma longa ou curta por nó (RP 1-2), aliases do modelo, sem diferenciar caixa e com ou
// sem `:` inicial. Em caso de falha, sugere o comando mais próximo.
import { getIndex, splitHeader, type CommandInfo, type ModelIndex } from '../model/load';
import { findChild, normalizeFullHeader } from '../model/tree';
import { HEADER_QUIRKS, type HeaderQuirk } from '../quirks';

export type HeaderFailure = 'unknown-node' | 'no-query-form' | 'no-set-form' | 'empty';

export type HeaderResolution =
  | { ok: true; info: CommandInfo; quirk: HeaderQuirk | null }
  | {
      ok: false;
      reason: HeaderFailure;
      /** Índice do nó que falhou. */
      failedNode: number;
      quirk: HeaderQuirk | null;
      suggestion: CommandInfo | null;
    };

export function resolveHeader(header: string, idx: ModelIndex = getIndex()): HeaderResolution {
  const h = header.trim();
  if (h === '' || h === ':') {
    return { ok: false, reason: 'empty', failedNode: 0, quirk: null, suggestion: null };
  }
  const full = idx.fullAliases.get(normalizeFullHeader(h));
  if (full) return { ok: true, info: full, quirk: null };

  const sp = splitHeader(h);
  let node = idx.tree;
  const shorts: string[] = [];
  for (let i = 0; i < sp.nodes.length; i++) {
    const tok = sp.nodes[i] ?? '';
    const child = findChild(node, tok);
    if (!child) {
      const key = quirkKey(shorts, sp.nodes.slice(i), sp.isQuery);
      return fail(idx, h, 'unknown-node', i, key);
    }
    shorts.push(child.short);
    node = child;
  }
  const leaf = sp.isQuery ? node.query : node.set;
  if (!leaf) {
    const key = quirkKey(shorts, [], sp.isQuery);
    return fail(idx, h, sp.isQuery ? 'no-query-form' : 'no-set-form', sp.nodes.length - 1, key);
  }
  return { ok: true, info: leaf, quirk: null };
}

function quirkKey(shorts: readonly string[], rest: readonly string[], isQuery: boolean): string {
  const nodes = [...shorts, ...rest.map((r) => r.toUpperCase())];
  const last = nodes[nodes.length - 1];
  return nodes.join(':') + (isQuery && last !== '?' ? '?' : '');
}

function fail(
  idx: ModelIndex,
  header: string,
  reason: HeaderFailure,
  failedNode: number,
  key: string,
): HeaderResolution {
  const quirk = HEADER_QUIRKS.find((q) => q.key === key) ?? null;
  if (quirk?.accept && quirk.target) {
    const target = idx.byHeader.get(quirk.target);
    if (target) return { ok: true, info: target, quirk };
  }
  const fromQuirk = quirk?.target ? (idx.byHeader.get(quirk.target) ?? null) : null;
  return {
    ok: false,
    reason,
    failedNode,
    quirk,
    suggestion: fromQuirk ?? suggest(header, idx),
  };
}

/** Comando mais próximo por distância de edição sobre as formas curta e longa completas. */
export function suggest(header: string, idx: ModelIndex = getIndex()): CommandInfo | null {
  const input = normalizeFullHeader(header);
  const wantQuery = input.endsWith('?');
  let best: CommandInfo | null = null;
  let bestD = Infinity;
  for (const inf of idx.infos) {
    const s = normalizeFullHeader(inf.shortHeader);
    const l = normalizeFullHeader(inf.longHeader);
    let d = Math.min(levenshtein(input, s), levenshtein(input, l));
    if (inf.isQuery !== wantQuery) d += 1;
    if (d < bestD) {
      bestD = d;
      best = inf;
    }
  }
  const limit = Math.max(2, Math.floor(input.length / 3));
  return bestD <= limit ? best : null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}
