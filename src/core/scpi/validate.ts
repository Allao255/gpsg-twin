// Validação de um comando SCPI completo: cabeçalho, parâmetros, tipo de comando, trava durante a
// execução e regras do twin para o equipamento compartilhado.
import { diag, type Diagnostic } from '../diagnostics';
import type { CommandHeader, CommandInfo } from '../model/load';
import { D02_SVPR_HEADERS, D15_NOT_EMITTED } from '../quirks';
import { resolveHeader } from './header';
import { lexCommand, type LexedCommand } from './lexer';
import { parseParams, UNKNOWN_CONTEXT, type CommandContext, type ParamValue } from './params';

export interface CheckedCommand {
  text: string;
  lexed: LexedCommand;
  info: CommandInfo | null;
  values: (ParamValue | undefined)[];
  /** Apaga dados no equipamento (CLeaRall, CLeaR, REMove). */
  destructive: boolean;
  diagnostics: Diagnostic[];
}

const DESTRUCTIVE_NODES = new Set(['CLEARALL', 'CLEAR', 'REMOVE']);
const TRUN: CommandHeader = 'GPS:SIM:ToggleRUN';
const SVPR = new Set<string>(D02_SVPR_HEADERS);
const NOT_EMITTED_D15 = new Set<string>(D15_NOT_EMITTED);

export function isDestructive(inf: CommandInfo): boolean {
  const last = inf.nodes[inf.nodes.length - 1];
  return !inf.isQuery && last !== undefined && DESTRUCTIVE_NODES.has(last.long);
}

export function checkCommand(text: string, ctx: CommandContext = UNKNOWN_CONTEXT): CheckedCommand {
  const lexed = lexCommand(text);
  const diagnostics: Diagnostic[] = [...lexed.diagnostics];
  const base = { text, lexed, values: [] as (ParamValue | undefined)[], destructive: false };
  if (lexed.header === '') return { ...base, info: null, diagnostics };

  const res = resolveHeader(lexed.header);
  const span = lexed.headerSpan;
  if (!res.ok) {
    const sug = res.suggestion ? `; mais próximo: ${res.suggestion.shortHeader}` : '';
    if (res.quirk) {
      diagnostics.push(
        diag(
          'known-misspelling',
          'error',
          `"${lexed.header}" não está no modelo (${res.quirk.note})${sug}`,
          { span, dRefs: res.quirk.dRefs },
        ),
      );
    } else if (res.reason === 'no-query-form') {
      diagnostics.push(
        diag('no-query-form', 'error', `"${lexed.header}" não tem forma de consulta${sug}`, {
          span,
        }),
      );
    } else if (res.reason === 'no-set-form') {
      diagnostics.push(
        diag(
          'no-set-form',
          'error',
          `"${lexed.header}" só existe como consulta (falta "?")${sug}`,
          { span },
        ),
      );
    } else {
      diagnostics.push(
        diag('unknown-header', 'error', `comando desconhecido "${lexed.header}"${sug}`, { span }),
      );
    }
    return { ...base, info: null, diagnostics };
  }

  const inf = res.info;
  if (res.quirk) {
    diagnostics.push(
      diag(
        'known-misspelling',
        'info',
        `"${lexed.header}" aceito como ${inf.shortHeader} (${res.quirk.note})`,
        {
          span,
          dRefs: res.quirk.dRefs,
        },
      ),
    );
  }

  const parsed = parseParams(inf, lexed.params, ctx);
  diagnostics.push(...parsed.diagnostics);

  if (!inf.cmd.emit_allowed) {
    diagnostics.push(
      diag(
        'emit-forbidden',
        'error',
        `${inf.shortHeader} nunca é emitido pelo twin (calibração, senha ou *RST)`,
        {
          span,
        },
      ),
    );
  }
  if (inf.header === TRUN) {
    diagnostics.push(
      diag(
        'trun-direct',
        'error',
        'TRUN é alternância; usar @run e @stop, que consultam o estado antes',
        { span },
      ),
    );
  }
  if (NOT_EMITTED_D15.has(inf.header)) {
    diagnostics.push(
      diag(
        'emit-forbidden',
        'warning',
        `${inf.shortHeader}: forma de parar a gravação não descrita`,
        {
          span,
          dRefs: ['D15'],
        },
      ),
    );
  }
  if (!inf.isQuery && inf.cmd.locked_while_running === true && ctx.running === true) {
    diagnostics.push(
      diag(
        'locked-while-running',
        'error',
        `${inf.shortHeader} é rejeitado com a simulação rodando`,
        { span },
      ),
    );
  }
  if (SVPR.has(inf.header) && ctx.running === false) {
    diagnostics.push(
      diag(
        'runtime-only',
        'warning',
        `${inf.shortHeader} altera SV em simulação; sem efeito com a simulação parada`,
        {
          span,
        },
      ),
    );
  }
  return {
    ...base,
    info: inf,
    values: parsed.values,
    destructive: isDestructive(inf),
    diagnostics,
  };
}
