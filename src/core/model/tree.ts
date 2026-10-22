// Árvore de nós de cabeçalho para resolução de comandos.
//
// Normalização do modelo: nós irmãos com a mesma forma curta são fundidos. O modelo transcreve o
// mesmo nó ora como `SET`, ora como `SETup` (forma curta SET nas duas); fundidos, o nó aceita SET e
// SETUP em todos os comandos, o que concorda com o exemplo `GPS:SETUP:RFPORT` do capítulo 14 (D05).
// `SIM` e `SIMU` têm formas curtas diferentes e continuam separados (D20).
import type { CommandInfo } from './load';

export interface TreeNode {
  short: string;
  /** Grafias aceitas, em maiúsculas: forma curta, forma longa e aliases do modelo. */
  spellings: Set<string>;
  children: TreeNode[];
  set: CommandInfo | null;
  query: CommandInfo | null;
}

function newNode(short: string): TreeNode {
  return { short, spellings: new Set([short]), children: [], set: null, query: null };
}

function normalizeAliasNode(alias: string): string {
  return alias.trim().toUpperCase().replace(/\?$/, '');
}

export function normalizeFullHeader(h: string): string {
  return h.trim().toUpperCase().replace(/^:/, '');
}

export function buildTree(infos: readonly CommandInfo[]): {
  tree: TreeNode;
  fullAliases: Map<string, CommandInfo>;
} {
  const root = newNode('');
  const fullAliases = new Map<string, CommandInfo>();
  for (const inf of infos) {
    let node = root;
    inf.nodes.forEach((n, i) => {
      let child = node.children.find((c) => c.short === n.short);
      if (!child) {
        child = newNode(n.short);
        node.children.push(child);
      }
      child.spellings.add(n.long);
      if (i === inf.nodes.length - 1) {
        for (const a of inf.cmd.aliases) {
          if (a.includes(':')) fullAliases.set(normalizeFullHeader(a), inf);
          else child.spellings.add(normalizeAliasNode(a));
        }
      }
      node = child;
    });
    const slot = inf.isQuery ? 'query' : 'set';
    const prev = node[slot];
    if (prev) throw new Error(`comandos colidem no mesmo nó: ${prev.header} e ${inf.header}`);
    node[slot] = inf;
  }
  checkCollisions(root, '');
  return { tree: root, fullAliases };
}

function checkCollisions(node: TreeNode, path: string): void {
  const seen = new Map<string, string>();
  for (const c of node.children) {
    for (const s of c.spellings) {
      const other = seen.get(s);
      if (other !== undefined && other !== c.short) {
        throw new Error(`grafia ambígua "${s}" em ${path || '(raiz)'}: ${other} e ${c.short}`);
      }
      seen.set(s, c.short);
    }
    checkCollisions(c, path ? `${path}:${c.short}` : c.short);
  }
}

/** Filho cuja grafia coincide com o token (sem diferenciar caixa). */
export function findChild(node: TreeNode, token: string): TreeNode | null {
  const t = token.toUpperCase();
  return node.children.find((c) => c.spellings.has(t)) ?? null;
}
