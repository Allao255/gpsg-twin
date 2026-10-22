// Representação de um script .scpi (02-interface-remota.md seção 5).
import type { Diagnostic } from '../diagnostics';
import type { CheckedCommand } from '../scpi/validate';

/** Argumento numérico de diretiva; value null quando depende de variável de execução. */
export interface NumArg {
  raw: string;
  value: number | null;
}

export type Directive =
  | { name: 'wait'; seconds: NumArg }
  | { name: 'run' }
  | { name: 'stop' }
  | { name: 'at'; seconds: NumArg }
  | { name: 'poll'; period: NumArg; duration: NumArg; queries: CheckedCommand[] }
  | { name: 'expect'; query: CheckedCommand; expected: string }
  | { name: 'errcheck'; on: boolean }
  | { name: 'mark'; text: string }
  | { name: 'pause'; text: string }
  | { name: 'set'; varName: string; value: string }
  | { name: 'input'; varName: string; prompt: string };

export type DirectiveName = Directive['name'];

/**
 * Tempo nominal no início da linha. Comandos não consomem tempo; @wait, @at e @poll sim.
 * Exatidão false depois de @pause, @input ou espera que depende de variável: o tempo é o mínimo.
 */
export interface LineTime {
  tSession: number;
  sessionExact: boolean;
  /** Relógio de execução, zerado a cada @run; null antes do primeiro @run. */
  tRun: number | null;
  /** Exatidão de tRun; volta a true a cada @run. */
  runExact: boolean;
  /** 0 antes do primeiro @run; k na k-ésima execução (inclusive após o @stop dela). */
  runIndex: number;
  /** Estado de execução conhecido: null antes de @run ou @stop. */
  running: boolean | null;
}

interface LineBase {
  lineNo: number;
  raw: string;
  /** Comentário de fim de linha (texto depois de ` #`), sem o `#`. */
  comment: string | null;
  time: LineTime;
  diagnostics: Diagnostic[];
}

export type ScriptLine =
  | (LineBase & { type: 'blank' })
  | (LineBase & { type: 'comment'; text: string })
  | (LineBase & { type: 'directive'; body: string; directive: Directive | null })
  | (LineBase & { type: 'command'; body: string; command: CheckedCommand });

export interface ScriptDoc {
  lines: ScriptLine[];
  diagnostics: Diagnostic[];
  /** Número de @run no script. */
  runs: number;
}
