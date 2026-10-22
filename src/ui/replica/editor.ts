// Editor de script (CodeMirror 6) com destaque do formato .scpi e diagnósticos do core na linha.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Diagnostic } from '../../core/diagnostics';

/** Modo de destaque: comentários, diretivas, cabeçalho, strings, números, variáveis. */
const scpi = StreamLanguage.define<{ header: boolean }>({
  startState: () => ({ header: false }),
  token(stream, state) {
    if (stream.sol()) {
      stream.eatSpace();
      if (stream.peek() === '#') {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match(/^@\w+/)) return 'keyword';
      state.header = true;
    }
    if (stream.eatSpace()) {
      if (stream.peek() === '#') {
        stream.skipToEnd();
        return 'comment';
      }
      return null;
    }
    if (state.header) {
      state.header = false;
      if (stream.match(/^\S+/)) return 'typeName';
    }
    if (stream.match(/^"(?:[^"]|"")*"?/) || stream.match(/^'(?:[^']|'')*'?/)) return 'string';
    if (stream.match(/^\$\{\w+\}/)) return 'variableName';
    if (stream.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)) return 'number';
    stream.next();
    return null;
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--ed-comment)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--ed-directive)', fontWeight: 'bold' },
  { tag: tags.typeName, color: 'var(--ed-header)' },
  { tag: tags.string, color: 'var(--ed-string)' },
  { tag: tags.number, color: 'var(--ed-number)' },
  { tag: tags.variableName, color: 'var(--ed-var)' },
]);

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--code-bg)',
    color: 'var(--text)',
  },
  '.cm-content': { fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--ed-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--ed-active)' },
  '&.cm-focused': { outline: '1px solid var(--accent)' },
});

export interface ScriptEditor {
  view: EditorView;
  getText: () => string;
  /** Troca o texto sem disparar onChange. */
  setText: (text: string) => void;
  setDiagnostics: (diags: readonly Diagnostic[]) => void;
  revealLine: (line: number) => void;
}

export function createEditor(
  parent: HTMLElement,
  initial: string,
  onChange: (text: string) => void,
): ScriptEditor {
  let silent = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        scpi,
        syntaxHighlighting(highlight),
        theme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !silent) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });

  const lineRange = (n: number): { from: number; to: number } | null => {
    if (n < 1 || n > view.state.doc.lines) return null;
    const l = view.state.doc.line(n);
    return { from: l.from, to: l.to };
  };

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: (text) => {
      if (text === view.state.doc.toString()) return;
      silent = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      silent = false;
    },
    setDiagnostics: (diags) => {
      const out: CmDiagnostic[] = [];
      for (const d of diags) {
        if (d.line === undefined) continue;
        const r = lineRange(d.line);
        if (!r) continue;
        const from = d.span ? Math.min(r.to, r.from + d.span.start) : r.from;
        const to = d.span ? Math.min(r.to, r.from + d.span.end) : r.to;
        out.push({
          from,
          to: Math.max(from, to),
          severity: d.severity,
          message: d.dRefs ? `${d.message} [${d.dRefs.join(', ')}]` : d.message,
        });
      }
      view.dispatch(setDiagnostics(view.state, out));
    },
    revealLine: (n) => {
      const r = lineRange(n);
      if (!r) return;
      view.dispatch({ selection: { anchor: r.from, head: r.to }, scrollIntoView: true });
    },
  };
}
