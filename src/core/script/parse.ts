// Parser do formato .scpi com diretivas, variáveis e linha do tempo nominal.
// Semântica alinhada a runners/gpsg_run.py: comentário de linha inteira com `#`, comentário de fim
// de linha com ` #` fora de aspas, substituição de `${NOME}` antes de interpretar a linha.
import { diag, type Diagnostic, type Span } from '../diagnostics';
import { applyCommand } from '../scenario/apply';
import { defaultScenario } from '../scenario/defaults';
import type { Scenario } from '../scenario/types';
import type { CommandContext } from '../scpi/params';
import { checkCommand, type CheckedCommand } from '../scpi/validate';
import type { Directive, LineTime, NumArg, ScriptDoc, ScriptLine } from './ast';

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Separa comentário de fim de linha (`#` precedido de espaço, fora de aspas). */
export function splitComment(line: string): { body: string; comment: string | null } {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && i > 0 && /\s/.test(line[i - 1] ?? '')) {
      return { body: line.slice(0, i).trimEnd(), comment: line.slice(i + 1).trim() };
    }
  }
  return { body: line, comment: null };
}

/** Variáveis: valor conhecido (@set) ou null quando só se conhece em execução (@input). */
export type VarTable = Map<string, string | null>;

/** Substitui variáveis conhecidas; as de execução ficam como `${NOME}`. */
export function expandVars(
  text: string,
  vars: VarTable,
): { text: string; undefinedNames: string[]; runtimeNames: string[] } {
  const undefinedNames: string[] = [];
  const runtimeNames: string[] = [];
  const out = text.replace(VAR_RE, (m: string, name: string) => {
    if (!vars.has(name)) {
      undefinedNames.push(name);
      return m;
    }
    const v = vars.get(name);
    if (v === null || v === undefined) {
      runtimeNames.push(name);
      return m;
    }
    return v;
  });
  return { text: out, undefinedNames, runtimeNames };
}

/** Separa consultas de @poll: token sem `:` nem `*` inicial é argumento da consulta anterior. */
export function rejoinPollQueries(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const last = out.length - 1;
    if (last >= 0 && !(t.includes(':') || t.startsWith('*'))) out[last] = `${out[last] ?? ''} ${t}`;
    else out.push(t);
  }
  return out;
}

interface Tracker {
  state: Scenario;
  known: Set<string>;
  running: boolean | null;
  tSession: number;
  tRun: number | null;
  sessionExact: boolean;
  runExact: boolean;
  runIndex: number;
  vars: VarTable;
  prevSignificant: ScriptLine | null;
}

function context(t: Tracker): CommandContext {
  const k = t.known;
  const anyLoss = [...k].some((x) => x.startsWith('io.'));
  return {
    running: t.running,
    units: k.has('setup.units') ? t.state.setup.units : null,
    port: k.has('setup.rfPort') ? t.state.setup.rfPort : null,
    losses: anyLoss ? t.state.io : null,
  };
}

function snapshot(t: Tracker): LineTime {
  return {
    tSession: t.tSession,
    sessionExact: t.sessionExact,
    tRun: t.tRun,
    runExact: t.runExact,
    runIndex: t.runIndex,
    running: t.running,
  };
}

function inexact(t: Tracker): void {
  t.sessionExact = false;
  t.runExact = false;
}

function advance(t: Tracker, dt: number | null): void {
  if (dt === null) {
    inexact(t);
    return;
  }
  t.tSession += dt;
  if (t.tRun !== null) t.tRun += dt;
}

export function parseScript(source: string): ScriptDoc {
  const t: Tracker = {
    state: defaultScenario(),
    known: new Set(),
    running: null,
    tSession: 0,
    tRun: null,
    sessionExact: true,
    runExact: true,
    runIndex: 0,
    vars: new Map(),
    prevSignificant: null,
  };
  const lines: ScriptLine[] = [];
  const rawLines = source.replace(/\r\n?/g, '\n').split('\n');
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

  rawLines.forEach((raw, i) => {
    const lineNo = i + 1;
    const time = snapshot(t);
    const trimmed = raw.trim();
    if (trimmed === '') {
      lines.push({ type: 'blank', lineNo, raw, comment: null, time, diagnostics: [] });
      return;
    }
    if (trimmed.startsWith('#')) {
      lines.push({
        type: 'comment',
        lineNo,
        raw,
        comment: null,
        text: trimmed.slice(1).trim(),
        time,
        diagnostics: [],
      });
      return;
    }
    const indent = raw.length - raw.trimStart().length;
    const { body, comment } = splitComment(trimmed);
    const diagnostics: Diagnostic[] = [];
    const ex = expandVars(body, t.vars);
    for (const n of ex.undefinedNames) {
      diagnostics.push(
        diag(
          'var-undefined',
          'error',
          `variável \${${n}} não definida antes desta linha; o runner interrompe aqui`,
        ),
      );
    }
    const line: ScriptLine = body.startsWith('@')
      ? {
          type: 'directive',
          lineNo,
          raw,
          comment,
          body,
          directive: parseDirective(ex.text, t, diagnostics),
          time,
          diagnostics,
        }
      : {
          type: 'command',
          lineNo,
          raw,
          comment,
          body,
          command: runCommand(ex.text, ex.text === body ? indent : null, t, diagnostics),
          time,
          diagnostics,
        };
    for (const d of diagnostics) d.line = lineNo;
    lines.push(line);
    if (!(line.type === 'directive' && line.directive?.name === 'mark')) t.prevSignificant = line;
  });

  return {
    lines,
    diagnostics: lines.flatMap((l) => l.diagnostics),
    runs: t.runIndex,
  };
}

function shiftSpan(span: Span | undefined, offset: number | null): Span | undefined {
  if (!span || offset === null) return undefined;
  return { start: span.start + offset, end: span.end + offset };
}

function runCommand(
  text: string,
  offset: number | null,
  t: Tracker,
  out: Diagnostic[],
): CheckedCommand {
  const cmd = checkCommand(text, context(t));
  for (const d of cmd.diagnostics) {
    const s = shiftSpan(d.span, offset);
    const copy = { ...d };
    if (s) copy.span = s;
    else delete copy.span;
    out.push(copy);
  }
  if (cmd.destructive) {
    const prev = t.prevSignificant;
    const confirmed = prev?.type === 'directive' && prev.directive?.name === 'pause';
    if (prev?.type === 'command' && prev.command.destructive) {
      out.push(
        diag(
          'destructive-batch',
          'warning',
          'comando destrutivo em sequência; o twin nunca emite destrutivos em lote',
        ),
      );
    } else if (!confirmed) {
      out.push(
        diag(
          'destructive',
          'warning',
          'comando destrutivo sem @pause de confirmação imediatamente antes',
        ),
      );
    }
  }
  const r = applyCommand(t.state, cmd);
  if (r.kind === 'applied') {
    t.state = r.state;
    for (const k of r.touched) t.known.add(k);
    if (cmd.info?.header === 'GPS:FILe:SET:LOAD') {
      // Settings carregado de arquivo: conteúdo desconhecido para o contexto.
      for (const k of [...t.known]) {
        if (k.startsWith('setup.') || k.startsWith('io.') || k.startsWith('motion.'))
          t.known.delete(k);
      }
    }
    out.push(...r.diagnostics);
  }
  return cmd;
}

function numArg(raw: string, out: Diagnostic[], what: string): NumArg {
  const s = raw.trim();
  if (s.includes('${')) return { raw: s, value: null };
  const v = Number(s);
  if (s === '' || !Number.isFinite(v) || v < 0) {
    out.push(
      diag('directive-args', 'error', `${what}: número não negativo esperado, recebido "${s}"`),
    );
    return { raw: s, value: null };
  }
  return { raw: s, value: v };
}

function partition(s: string): [string, string] {
  const m = /^(\S*)\s*(.*)$/s.exec(s.trim());
  return [m?.[1] ?? '', m?.[2] ?? ''];
}

function queryArg(text: string, t: Tracker, out: Diagnostic[], what: string): CheckedCommand {
  const cmd = checkCommand(text, context(t));
  out.push(...cmd.diagnostics.map(stripSpan));
  if (cmd.info && !cmd.info.isQuery) {
    out.push(diag('expect-not-query', 'error', `${what}: "${text}" não é consulta`));
  }
  return cmd;
}

function stripSpan(d: Diagnostic): Diagnostic {
  const { span: _span, ...rest } = d;
  return rest;
}

function parseDirective(text: string, t: Tracker, out: Diagnostic[]): Directive | null {
  const [head, rest] = partition(text.slice(1));
  const name = head.toLowerCase();
  switch (name) {
    case 'wait': {
      const seconds = numArg(rest, out, '@wait');
      advance(t, seconds.value);
      return { name, seconds };
    }
    case 'run': {
      if (t.running === true) {
        out.push(
          diag(
            'run-twice',
            'warning',
            '@run com a simulação já rodando: TRUN não é enviado, t_run é zerado',
          ),
        );
      }
      t.running = true;
      t.tRun = 0;
      t.runExact = true;
      t.runIndex++;
      return { name };
    }
    case 'stop': {
      if (t.running === false) {
        out.push(
          diag('stop-not-running', 'warning', '@stop com a simulação parada: TRUN não é enviado'),
        );
      }
      t.running = false;
      return { name };
    }
    case 'at': {
      const seconds = numArg(rest, out, '@at');
      if (t.tRun === null) {
        out.push(diag('at-before-run', 'error', '@at antes de @run; o runner interrompe aqui'));
        return { name, seconds };
      }
      if (seconds.value === null) {
        inexact(t);
      } else if (seconds.value < t.tRun) {
        out.push(
          diag(
            'at-past',
            'warning',
            `@at ${seconds.raw} já passou (t_run nominal ${t.tRun}); sem espera`,
          ),
        );
      } else {
        advance(t, seconds.value - t.tRun);
      }
      return { name, seconds };
    }
    case 'poll': {
      const parts = rest.split(/\s+/).filter((x) => x !== '');
      const period = numArg(parts[0] ?? '', out, '@poll período');
      const duration = numArg(parts[1] ?? '', out, '@poll duração');
      const qs = rejoinPollQueries(parts.slice(2));
      if (qs.length === 0) out.push(diag('directive-args', 'error', '@poll sem consultas'));
      if (period.value === 0) out.push(diag('directive-args', 'error', '@poll com período zero'));
      const queries = qs.map((q) => queryArg(q, t, out, '@poll'));
      advance(t, duration.value);
      return { name, period, duration, queries };
    }
    case 'expect': {
      const [q, expected] = partition(rest);
      if (q === '' || expected === '') {
        out.push(diag('directive-args', 'error', '@expect exige consulta e valor esperado'));
      }
      return { name, query: queryArg(q, t, out, '@expect'), expected: expected.trim() };
    }
    case 'errcheck': {
      const v = rest.trim().toLowerCase();
      if (v !== 'on' && v !== 'off')
        out.push(diag('directive-args', 'error', '@errcheck aceita on ou off'));
      return { name, on: v === 'on' };
    }
    case 'mark':
    case 'pause':
      if (name === 'pause') inexact(t);
      return { name, text: rest.trim() };
    case 'set':
    case 'input': {
      const [varName, value] = partition(rest);
      if (!NAME_RE.test(varName)) {
        out.push(
          diag('directive-args', 'error', `@${name}: nome de variável inválido "${varName}"`),
        );
        return null;
      }
      if (name === 'set') {
        t.vars.set(varName, value.trim());
        return { name, varName, value: value.trim() };
      }
      t.vars.set(varName, null);
      inexact(t);
      return { name, varName, prompt: value.trim() };
    }
    default:
      out.push(diag('directive-unknown', 'error', `diretiva desconhecida "@${head}"`));
      return null;
  }
}
