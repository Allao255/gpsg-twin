// Aba Equipamento: réplica da interface do GPSG-1000 ao lado do editor de script.
// Réplica -> script: cada alteração regenera o script canônico do cenário.
// Script -> réplica: a edição recarrega as telas; erros aparecem na linha e no campo.
import type { Diagnostic } from '../../core/diagnostics';
import type { PackageAttachments } from '../../core/files/package';
import { describeAction } from '../../core/files/sheet';
import type { CommandHeader } from '../../core/model/load';
import { scenarioChecks, sortedActions } from '../../core/scenario/emit';
import { parseScenarioJson, serializeScenario } from '../../core/scenario/json';
import type { ScriptDoc } from '../../core/script/ast';
import { applyKnownCorrections } from '../../core/script/correct';
import { formatScript } from '../../core/script/format';
import { parseScript } from '../../core/script/parse';
import { formatNumber } from '../../core/units';
import type { Target } from '../../analysis/events';
import { importFiles } from '../../replica/import';
import {
  displayValue,
  field,
  fieldRange,
  fieldsForHeader,
  fieldUnit,
  lockReason,
} from '../../replica/fields';
import {
  loadScript,
  newSession,
  removeAction,
  run,
  sessionScript,
  setField,
  setNameDescription,
  stop,
  type ReplicaSession,
  type Result,
} from '../../replica/session';
import { h } from '../dom';
import { downloadText } from '../download';
import { pasteableView } from '../pasteable-view';
import { createEditor, type ScriptEditor } from './editor';
import { exportPackageDialog, importReport, readInputFiles } from './files-view';
import { button, confirmDialog, entryDialog, pickFiles, type AppApi } from './kit';
import './replica.css';
import {
  enumChooser,
  fieldLocation,
  initialUi,
  windowBody,
  windowTitle,
  WINDOWS,
  type UiState,
} from './screens';

const STORAGE_KEY = 'gpsg-twin.replica';

const HINTS: Record<string, string> = {
  lat: 'Graus decimais com sinal ou hemisfério (39.2976 N), graus e minutos (39 17.856 N) ou graus, minutos e segundos (39 17 51.36 N).',
  lon: 'Graus decimais com sinal ou hemisfério (94.7139 W), graus e minutos ou graus, minutos e segundos.',
  date: 'mm/dd/aaaa, aaaa-mm-dd ou "Aug 14, 2013".',
  time: 'hh:mm:ss (UTC).',
};

interface Stored {
  scenario: string;
  svs: ReplicaSession['svs'];
  attachments?: PackageAttachments;
}

function loadStored(): ReplicaSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return newSession();
    const st = JSON.parse(raw) as Stored;
    const r = parseScenarioJson(st.scenario);
    return r.scenario
      ? { ...newSession(r.scenario), svs: st.svs, attachments: st.attachments ?? {} }
      : newSession();
  } catch {
    return newSession();
  }
}

function saveStored(s: ReplicaSession): void {
  const st: Stored = { scenario: serializeScenario(s.scenario), svs: s.svs };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...st, attachments: s.attachments }));
  } catch {
    // Armazenamento cheio (anexos grandes): grava sem os anexos; indisponível: sem persistência.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch {
      /* sem persistência */
    }
  }
}

/** Acesso da aba Análise à réplica: estado corrente e navegação até a linha e o campo. */
export interface ReplicaHandle {
  session: () => ReplicaSession;
  script: () => string;
  act: (r: Result) => boolean;
  /** Mostra a linha no editor e o alvo na réplica (campo, janela ou SV). */
  reveal: (line: number | null, target: Target | null) => void;
  /** Avisa a cada mudança do cenário ou do script. */
  onChange: (cb: () => void) => void;
}

export function createReplicaApp(): { el: HTMLElement; handle: ReplicaHandle } {
  const listeners: (() => void)[] = [];
  const notify = (): void => {
    for (const cb of listeners) cb();
  };
  let session = loadStored();
  const ui: UiState = initialUi();
  let doc: ScriptDoc = parseScript('');
  let diagnostics: Diagnostic[] = [];
  let lostLines: number[] = [];
  let fieldErrors = new Map<string, string>();

  const device = h('div', { class: 'gpsg', 'aria-label': 'réplica do GPSG-1000' });
  const msg = h('div', { class: 'msg', role: 'status' });
  const banner = h('div', { class: 'banner' });
  const diagList = h('ul', { class: 'diags' });
  const actionsBox = h('div', { class: 'actions' });
  const nameInput = h('input', { type: 'text', 'aria-label': 'nome do cenário', size: '20' });
  const descInput = h('input', { type: 'text', 'aria-label': 'descrição', class: 'desc' });
  const editorHost = h('div', { class: 'editor' });
  let editor: ScriptEditor | null = null;

  const message = (text: string, kind: 'info' | 'error' = 'info'): void => {
    msg.textContent = text;
    msg.className = `msg ${kind}`;
  };

  const analyze = (text: string): void => {
    doc = parseScript(text);
    const loaded = loadScript(session, text, session.scenario.name);
    // Leitura do script mais as checagens de consistência do cenário (as mesmas do emissor).
    diagnostics = [...loaded.diagnostics, ...scenarioChecks(loaded.session.scenario)];
    lostLines = loaded.lostLines;
    fieldErrors = new Map();
    for (const d of diagnostics) {
      if (d.line === undefined || d.severity === 'info') continue;
      const l = doc.lines[d.line - 1];
      const header = l?.type === 'command' ? l.command.info?.header : undefined;
      if (!header) continue;
      for (const f of fieldsForHeader(header))
        if (!fieldErrors.has(f.id)) fieldErrors.set(f.id, `linha ${d.line}: ${d.message}`);
    }
    editor?.setDiagnostics(diagnostics);
  };

  /** Aplica uma nova sessão vinda da réplica: regenera o script. */
  const commit = (next: ReplicaSession): void => {
    session = next;
    const text = sessionScript(session).text;
    editor?.setText(text);
    analyze(text);
    saveStored(session);
    redraw();
    notify();
  };

  const act = (r: Result): boolean => {
    if (!r.ok) {
      message(r.error, 'error');
      return false;
    }
    if (lostLines.length > 0) {
      confirmDialog(
        'Reescrever o script',
        `O script tem ${lostLines.length} linha(s) que o cenário não representa (${lostLines.slice(0, 8).join(', ')}${lostLines.length > 8 ? ', …' : ''}). Alterar a réplica reescreve o script a partir do cenário e as perde.`,
        () => {
          lostLines = [];
          commit(r.session);
        },
      );
      return false;
    }
    message('');
    commit(r.session);
    return true;
  };

  const revealHeader = (header: CommandHeader | null): void => {
    if (!header || !editor) return;
    const l = doc.lines.find((x) => x.type === 'command' && x.command.info?.header === header);
    if (l) editor.revealLine(l.lineNo);
  };

  const editField = (id: string): void => {
    const f = field(id);
    revealHeader(f.header);
    const sc = session.scenario;
    const lock = lockReason(f, sc, session.running);
    if (lock) {
      message(`${f.label}: ${lock}`, 'error');
      return;
    }
    const apply = (text: string): string | null => {
      const r = setField(session, id, text);
      if (!r.ok) return r.error;
      act(r);
      return null;
    };
    if (f.kind === 'enum') {
      enumChooser(api, id, apply);
      return;
    }
    const range = fieldRange(f, sc);
    const unit = fieldUnit(f, sc);
    const hint = [
      HINTS[f.kind] ?? '',
      range
        ? `Faixa: ${range.min} a ${range.max}${range.unit ? ` ${range.unit}` : ''} (modelo).`
        : '',
      session.running && f.runtime
        ? `Em execução: entra na linha do tempo em t = ${session.t_s} s.`
        : '',
    ]
      .filter((x) => x !== '')
      .join(' ');
    entryDialog({
      title: `${f.label}${unit ? ` (${unit})` : ''}`,
      initial: displayValue(f, sc),
      hint,
      keypad: f.kind === 'number',
      onOk: apply,
    });
  };

  const api: AppApi = {
    get session() {
      return session;
    },
    get fieldErrors() {
      return fieldErrors;
    },
    act,
    redraw: () => {
      redraw();
    },
    editField,
    revealHeader,
    message,
  };

  function redrawDevice(): void {
    const running = session.running;
    device.replaceChildren(
      h(
        'nav',
        { class: 'launch', 'aria-label': 'barra de lançamento' },
        WINDOWS.map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              class: id === ui.win && !ui.sub ? 'on' : '',
              onclick: () => {
                ui.win = id;
                ui.sub = null;
                redraw();
              },
            },
            label,
          ),
        ),
      ),
      h(
        'div',
        { class: 'screen' },
        h('div', { class: 'body' }, windowBody(api, ui)),
        h(
          'div',
          { class: 'foot' },
          h('span', { class: 'title' }, windowTitle(ui)),
          h(
            'span',
            { class: `led ${running ? 'run' : ''}` },
            running ? `Running  t = ${formatNumber(session.t_s, 3)} s` : 'Ready',
          ),
          h(
            'button',
            {
              type: 'button',
              class: `runbtn ${running ? 'stop' : ''}`,
              onclick: () => {
                act(running ? stop(session) : run(session));
              },
            },
            running ? 'Stop' : 'Run',
          ),
        ),
      ),
    );
  }

  function redrawSide(): void {
    nameInput.value = session.scenario.name;
    descInput.value = session.scenario.description;
    banner.replaceChildren();
    if (lostLines.length > 0) {
      banner.append(
        h(
          'p',
          {},
          `O script tem ${lostLines.length} linha(s) que o cenário não representa (${lostLines.slice(0, 12).join(', ')}${lostLines.length > 12 ? ', …' : ''}). Alterar a réplica reescreve o script e as perde.`,
        ),
      );
    }
    const shown = diagnostics.filter((d) => d.severity !== 'info');
    diagList.replaceChildren(
      ...(shown.length === 0
        ? [h('li', { class: 'sev-ok' }, 'Sem erros nem avisos.')]
        : shown.map((d) =>
            h(
              'li',
              {
                class: `sev-${d.severity}`,
                onclick: () => {
                  if (d.line !== undefined) editor?.revealLine(d.line);
                },
              },
              h('span', { class: 'ln' }, d.line === undefined ? '' : `L${d.line}`),
              ` ${d.message}`,
            ),
          )),
    );
    const sc = session.scenario;
    const acts = sortedActions(sc.actions);
    actionsBox.replaceChildren(
      h('h3', {}, 'Linha do tempo (ações em execução)'),
      acts.length === 0 && sc.run.stopAt_s === null
        ? h(
            'p',
            { class: 'muted' },
            'Sem ações. Em execução (Run), RF Level e edições de SV entram aqui no instante Elapsed.',
          )
        : h(
            'table',
            { class: 'params' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ['t (s)', 'Ação', ''].map((t) => h('th', {}, t)),
              ),
            ),
            h(
              'tbody',
              {},
              acts.map((a) =>
                h(
                  'tr',
                  {},
                  h('td', {}, formatNumber(a.t_s, 3)),
                  h('td', {}, describeAction(a)),
                  h(
                    'td',
                    {},
                    button('Remover', () => {
                      act(removeAction(session, sc.actions.indexOf(a)));
                    }),
                  ),
                ),
              ),
              sc.run.stopAt_s === null
                ? null
                : h(
                    'tr',
                    {},
                    h('td', {}, formatNumber(sc.run.stopAt_s, 3)),
                    h('td', {}, 'Stop'),
                    h('td', {}),
                  ),
            ),
          ),
    );
  }

  function redraw(): void {
    redrawDevice();
    redrawSide();
  }

  const loadText = (text: string, name?: string): void => {
    const loaded = loadScript(session, text, name ?? session.scenario.name);
    session = loaded.session;
    editor?.setText(text);
    analyze(text);
    saveStored(session);
    redraw();
    notify();
  };

  const paste = pasteableView(() => ({
    name: `${session.scenario.name}.scpi`,
    text: editor?.getText() ?? '',
  }));

  const openFiles = (files: File[]): void => {
    if (files.length === 0) return;
    readInputFiles(files)
      .then((inputs) => {
        const r = importFiles(session, inputs);
        lostLines = [];
        if (r.script !== null) {
          session = r.session;
          editor?.setText(r.script);
          analyze(r.script);
          saveStored(session);
          redraw();
          notify();
        } else commit(r.session);
        message(`Aberto: ${files.map((f) => f.name).join(', ')}`);
        if (inputs.length > 1 || r.diagnostics.length > 0) importReport(r.summary, r.diagnostics);
      })
      .catch((e: unknown) => {
        message(`Não aberto: ${(e as Error).message}`, 'error');
      });
  };

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    button('Novo', () => {
      confirmDialog('Novo cenário', 'Descarta o cenário atual e começa do padrão.', () => {
        lostLines = [];
        commit(newSession());
      });
    }),
    button('Abrir…', () => {
      pickFiles('.scpi,.txt,.json,.zip,.csv,.rte,.set,.alm,.gdt,.nme,.nmea,.xml', true, openFiles);
    }),
    button('Baixar .scpi', () => {
      downloadText(
        `${session.scenario.name}.scpi`,
        editor?.getText() ?? sessionScript(session).text,
      );
    }),
    button('Exportar pacote .zip…', () => {
      exportPackageDialog(api, paste.target);
    }),
    button('Baixar cenário .json', () => {
      downloadText(
        `${session.scenario.name}.json`,
        serializeScenario(session.scenario),
        'application/json',
      );
    }),
    button('Aplicar correções conhecidas', () => {
      const text = editor?.getText() ?? '';
      const r = applyKnownCorrections(text);
      const canonical = formatScript(parseScript(r.text), 'canonical');
      loadText(canonical);
      message(
        r.corrections.length === 0
          ? 'Forma canônica aplicada; nenhuma grafia conhecida a corrigir.'
          : `${r.corrections.length} correção(ões): ${r.corrections.map((c) => `L${c.line} ${c.to}`).join('; ')}`,
      );
    }),
  );

  nameInput.addEventListener('change', () => {
    act(setNameDescription(session, nameInput.value, session.scenario.description));
  });
  descInput.addEventListener('change', () => {
    act(setNameDescription(session, session.scenario.name, descInput.value));
  });

  const root = h(
    'div',
    { class: 'replica-app' },
    h('div', { class: 'device-col' }, device, msg),
    h(
      'div',
      { class: 'side' },
      h(
        'div',
        { class: 'scen' },
        h('label', {}, 'Cenário ', nameInput),
        h('label', { class: 'grow' }, 'Descrição ', descInput),
      ),
      toolbar,
      banner,
      editorHost,
      h('h3', {}, 'Diagnósticos'),
      diagList,
      actionsBox,
      paste.el,
    ),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const initial = sessionScript(session).text;
  editor = createEditor(editorHost, initial, (text) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const loaded = loadScript(session, text, session.scenario.name);
      session = { ...loaded.session, running: false, t_s: 0 };
      analyze(text);
      saveStored(session);
      redraw();
      notify();
    }, 400);
  });
  analyze(initial);
  redraw();

  const reveal = (line: number | null, target: Target | null): void => {
    if (line !== null) editor?.revealLine(line);
    ui.sub = null;
    if (target?.kind === 'field') {
      const loc = fieldLocation(target.id);
      ui.win = loc.win;
      if (loc.setupTab) ui.tab.setup = loc.setupTab;
    } else if (target?.kind === 'window') ui.win = target.win;
    else if (target?.kind === 'sv') {
      ui.win = 'svprn';
      ui.tab.svprn = target.constellation;
    }
    redraw();
    const el =
      target?.kind === 'field' ? device.querySelector(`[data-field="${target.id}"]`) : null;
    (el ?? device).scrollIntoView({ block: 'center' });
    if (el) {
      el.classList.add('flash');
      setTimeout(() => {
        el.classList.remove('flash');
      }, 1600);
    }
  };

  return {
    el: root,
    handle: {
      session: () => session,
      script: () => editor?.getText() ?? sessionScript(session).text,
      act,
      reveal,
      onChange: (cb) => {
        listeners.push(cb);
      },
    },
  };
}
