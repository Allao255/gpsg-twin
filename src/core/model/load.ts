// Carga do modelo de comandos e informações derivadas por comando.
// A validação contra model/commands.schema.json é feita no setup global dos testes.
import raw from '../../../model/commands.json';
import type { CommandHeader } from './headers.gen';
import type { Command, CommandModel, Param } from './types.gen';
import { buildTree, type TreeNode } from './tree';

export type { Command, CommandModel, Param } from './types.gen';
export type { CommandHeader, EnumValue, ModelEnums } from './headers.gen';

export const MODEL: CommandModel = raw as unknown as CommandModel;

export interface NodeSpec {
  /** Grafia do modelo, com maiúsculas marcando a forma curta (`CARRier`). */
  spec: string;
  short: string;
  long: string;
}

export interface CommandInfo {
  cmd: Command;
  header: CommandHeader;
  isQuery: boolean;
  leadingColon: boolean;
  nodes: NodeSpec[];
  /** Forma curta completa, com `?` nas consultas (`GPS:SET:CARR?`). */
  shortHeader: string;
  /** Forma longa completa em maiúsculas. */
  longHeader: string;
  /** Parâmetros aplicáveis: `params` em set e action, `query_params` em consultas. */
  params: Param[];
}

/** Forma curta de um nó: letras maiúsculas, dígitos e `*`. */
export function shortOf(spec: string): string {
  if (spec === '?') return '?';
  return spec.replace(/[^A-Z0-9*]/g, '');
}

export interface SplitHeader {
  nodes: string[];
  isQuery: boolean;
  leadingColon: boolean;
}

/** Separa um cabeçalho em nós. `GPS:?` tem o nó `?` e é consulta. */
export function splitHeader(header: string): SplitHeader {
  let body = header.trim();
  const leadingColon = body.startsWith(':');
  if (leadingColon) body = body.slice(1);
  if (body === '?' || body.endsWith(':?')) {
    const head = body.slice(0, -1).replace(/:$/, '');
    return { nodes: [...(head ? head.split(':') : []), '?'], isQuery: true, leadingColon };
  }
  const isQuery = body.endsWith('?');
  if (isQuery) body = body.slice(0, -1);
  return { nodes: body.split(':'), isQuery, leadingColon };
}

function joinHeader(nodes: readonly string[], isQuery: boolean, leadingColon: boolean): string {
  const last = nodes[nodes.length - 1];
  const body = nodes.join(':');
  const q = isQuery && last !== '?' ? '?' : '';
  return (leadingColon ? ':' : '') + body + q;
}

export function makeInfo(cmd: Command): CommandInfo {
  const sp = splitHeader(cmd.header);
  const nodes = sp.nodes.map((spec) => ({ spec, short: shortOf(spec), long: spec.toUpperCase() }));
  return {
    cmd,
    header: cmd.header as CommandHeader,
    isQuery: sp.isQuery,
    leadingColon: sp.leadingColon,
    nodes,
    shortHeader: joinHeader(
      nodes.map((n) => n.short),
      sp.isQuery,
      sp.leadingColon,
    ),
    longHeader: joinHeader(
      nodes.map((n) => n.long),
      sp.isQuery,
      sp.leadingColon,
    ),
    params: sp.isQuery ? cmd.query_params : cmd.params,
  };
}

export interface ModelIndex {
  model: CommandModel;
  infos: CommandInfo[];
  byHeader: ReadonlyMap<string, CommandInfo>;
  tree: TreeNode;
  /** Aliases de cabeçalho completo (`:SYST:ERR?`), normalizados em maiúsculas sem `:` inicial. */
  fullAliases: ReadonlyMap<string, CommandInfo>;
}

export function buildIndex(model: CommandModel): ModelIndex {
  const infos = model.commands.map(makeInfo);
  const byHeader = new Map(infos.map((i) => [i.header as string, i]));
  const { tree, fullAliases } = buildTree(infos);
  return { model, infos, byHeader, tree, fullAliases };
}

let cached: ModelIndex | null = null;

/** Índice do modelo do repositório, construído uma vez. */
export function getIndex(): ModelIndex {
  cached ??= buildIndex(MODEL);
  return cached;
}

/** Informação de um comando pelo cabeçalho exato do modelo. */
export function info(header: CommandHeader): CommandInfo {
  const i = getIndex().byHeader.get(header);
  if (!i) throw new Error(`cabeçalho ausente do modelo: ${header}`);
  return i;
}

/** Valores de enumeração de um parâmetro, lidos do modelo. */
export function enumValues(header: CommandHeader, param: string): readonly string[] {
  const p = info(header).params.find((x) => x.name === param);
  if (!p?.values) throw new Error(`parâmetro enum ausente: ${header} ${param}`);
  return p.values;
}
