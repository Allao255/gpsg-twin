// Auxílio do editor de script: sugestões (cabeçalhos, diretivas, valores de enumeração) e dicas ao
// passar o mouse, derivados do modelo de comandos e da réplica. Funções puras sobre o texto da linha.
import { getIndex, type CommandInfo } from '../core/model/load';
import { EMIT_HEADER_OVERRIDE } from '../core/quirks';
import { resolveHeader } from '../core/scpi/header';
import { paramOf } from '../docs/reference';
import { FIELDS } from './fields';

export interface DirectiveDoc {
  name: string;
  syntax: string;
  text: string;
}

/** Diretivas do formato .scpi (02-interface-remota.md, seção 5). */
export const DIRECTIVES: readonly DirectiveDoc[] = [
  {
    name: 'run',
    syntax: '@run',
    text: 'Consulta GPS:SIM:TRUN?; se Stopped, inicia a simulação e confirma Running. Zera o relógio de execução.',
  },
  {
    name: 'stop',
    syntax: '@stop',
    text: 'Consulta GPS:SIM:TRUN?; se Running, para a simulação e confirma Stopped.',
  },
  {
    name: 'at',
    syntax: '@at <s>',
    text: 'Espera até o instante s desde o @run. Linha do tempo de ações em execução.',
  },
  { name: 'wait', syntax: '@wait <s>', text: 'Espera s segundos (aceita decimal).' },
  {
    name: 'poll',
    syntax: '@poll <período_s> <duração_s> <consulta> [<consulta> ...]',
    text: 'Repete as consultas no período, pela duração, registrando cada resposta.',
  },
  {
    name: 'expect',
    syntax: '@expect <consulta> <valor>',
    text: 'Envia a consulta e compara a resposta (sem aspas e sem diferenciar caixa). Registra PASS ou FAIL.',
  },
  {
    name: 'errcheck',
    syntax: '@errcheck on|off',
    text: 'Liga ou desliga a consulta automática de :SYST:ERR? após cada comando.',
  },
  { name: 'mark', syntax: '@mark <texto>', text: 'Registra uma marca no log.' },
  { name: 'pause', syntax: '@pause <texto>', text: 'Mostra o texto e espera Enter do operador.' },
  {
    name: 'set',
    syntax: '@set <NOME> <valor>',
    text: 'Define variável, usada depois como ${NOME}.',
  },
  {
    name: 'input',
    syntax: '@input <NOME> <texto>',
    text: 'Pede o valor ao operador e define a variável.',
  },
];

const KIND: Readonly<Record<string, string>> = { set: 'ajuste', query: 'consulta', action: 'ação' };

/** Comando que o twin nunca escreve à mão: emit_allowed falso ou TRUN direto (usar @run/@stop). */
function offered(inf: CommandInfo): boolean {
  return inf.cmd.emit_allowed && inf.header !== 'GPS:SIM:ToggleRUN';
}

/** Campo da réplica configurado pelo comando, para orientar quem vem da tela do equipamento. */
function fieldsOf(header: string): string[] {
  const set = header.endsWith('?') ? header.slice(0, -1) : header;
  return FIELDS.filter((f) => f.header === set).map((f) => f.label);
}

/** Texto da dica de um comando. */
export function commandDoc(inf: CommandInfo): string {
  const c = inf.cmd;
  const emitted = EMIT_HEADER_OVERRIDE[inf.header];
  const lines = [
    `${inf.shortHeader}  (${inf.longHeader})`,
    `${KIND[c.kind] ?? c.kind}, ${c.category}, RP ${c.manual_page}${c.verified_on_hw ? ', verificado em bancada' : ', não verificado em bancada'}`,
  ];
  if (emitted) lines.push(`O twin emite como ${emitted}.`);
  const fields = fieldsOf(inf.header);
  if (fields.length > 0) lines.push(`Na réplica: ${fields.join(', ')}.`);
  for (const p of inf.params) {
    const r = paramOf(inf, p);
    const rest = [r.range, r.unit, r.optional ? 'opcional' : ''].filter((x) => x !== '').join(', ');
    lines.push(`  ${r.name} (${r.type})${rest ? `: ${rest}` : ''}`);
  }
  if (c.locked_while_running === true) lines.push('Rejeitado com a simulação rodando.');
  if (!c.emit_allowed) lines.push('Nunca emitido pelo twin.');
  if (inf.header === 'GPS:SIM:ToggleRUN')
    lines.push('Alternância: usar @run e @stop, que consultam o estado antes.');
  if (c.example) lines.push(`Exemplo: ${c.example}`);
  if (c.discrepancies.length > 0)
    lines.push('Os manuais divergem neste comando; detalhes na referência de comandos.');
  if (c.notes) lines.push(`Nota: ${c.notes}`);
  return lines.join('\n');
}

export interface Completion {
  label: string;
  detail: string;
  info: string;
  type: 'keyword' | 'function' | 'enum';
}

export interface CompletionResult {
  /** Coluna onde começa o texto substituído. */
  from: number;
  options: Completion[];
}

/** Cabeçalho da linha e posição do cursor em relação a ele e aos parâmetros. */
function context(
  line: string,
  col: number,
): {
  start: number;
  headerEnd: number;
  header: string;
  paramIndex: number;
  paramStart: number;
} {
  const start = line.length - line.trimStart().length;
  let headerEnd = start;
  while (headerEnd < line.length && !/\s/.test(line[headerEnd] ?? '')) headerEnd++;
  const header = line.slice(start, headerEnd);
  let paramIndex = -1;
  let paramStart = headerEnd;
  if (col > headerEnd) {
    paramIndex = 0;
    paramStart =
      headerEnd + (line.slice(headerEnd).length - line.slice(headerEnd).trimStart().length);
    let q: string | null = null;
    for (let i = headerEnd; i < col; i++) {
      const ch = line[i];
      if (q) {
        if (ch === q) q = null;
      } else if (ch === '"' || ch === "'") q = ch;
      else if (ch === ',') {
        paramIndex++;
        paramStart = i + 1;
        while (line[paramStart] === ' ') paramStart++;
      }
    }
  }
  return { start, headerEnd, header, paramIndex, paramStart };
}

export function completeAt(line: string, col: number): CompletionResult | null {
  const before = line.slice(0, col);
  if (/^\s*#/.test(before)) return null;
  const ctx = context(line, col);
  if (ctx.paramIndex < 0) {
    if (before.trimStart().startsWith('@')) {
      return {
        from: ctx.start,
        options: DIRECTIVES.map((d) => ({
          label: `@${d.name}`,
          detail: d.syntax,
          info: d.text,
          type: 'keyword',
        })),
      };
    }
    const options: Completion[] = [];
    for (const inf of getIndex().infos) {
      if (!offered(inf)) continue;
      const info = commandDoc(inf);
      const detail = `${KIND[inf.cmd.kind] ?? inf.cmd.kind} · ${inf.cmd.category}`;
      options.push({ label: inf.shortHeader, detail, info, type: 'function' });
      if (inf.longHeader !== inf.shortHeader)
        options.push({ label: inf.longHeader, detail, info, type: 'function' });
    }
    return { from: ctx.start, options };
  }
  if (ctx.header.startsWith('@')) return null;
  const r = resolveHeader(ctx.header);
  if (!r.ok) return null;
  const p = r.info.params[ctx.paramIndex];
  if (!p?.values) return null;
  return {
    from: ctx.paramStart,
    options: p.values.map((v) => ({
      label: v,
      detail: p.name,
      info: paramOf(r.info, p).notes,
      type: 'enum',
    })),
  };
}

/** Dica para a coluna `col`: comando sob o cabeçalho, parâmetro sob o valor, ou diretiva. */
export function hoverAt(line: string, col: number): string | null {
  if (/^\s*#/.test(line)) return null;
  const ctx = context(line, col);
  if (col < ctx.start || ctx.header === '') return null;
  if (ctx.header.startsWith('@')) {
    if (col > ctx.headerEnd) return null;
    const d = DIRECTIVES.find((x) => x.name === ctx.header.slice(1).toLowerCase());
    return d ? `${d.syntax}\n${d.text}` : null;
  }
  const r = resolveHeader(ctx.header);
  if (!r.ok) return null;
  if (col <= ctx.headerEnd) return commandDoc(r.info);
  const p = r.info.params[ctx.paramIndex];
  if (!p) return null;
  const ref = paramOf(r.info, p);
  return [
    `${ref.name} (${ref.type}), parâmetro ${ctx.paramIndex + 1} de ${r.info.shortHeader}`,
    [ref.range, ref.unit].filter((x) => x !== '').join(', '),
    ref.notes,
  ]
    .filter((x) => x !== '')
    .join('\n');
}
