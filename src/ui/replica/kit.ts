// Componentes da réplica: grupos, abas em pílula, campos, botões, tabelas e diálogos.
// Estilo das figuras do manual (fundo preto, contorno azul arredondado), sem marca do fabricante.
import type { CommandHeader } from '../../core/model/load';
import type { Result, ReplicaSession } from '../../replica/session';
import { h } from '../dom';

export type WindowId =
  'simulation' | 'setup' | 'svprn' | 'route' | 'waypoint' | 'gpsrx' | 'file' | 'diagnostics';

export interface AppApi {
  readonly session: ReplicaSession;
  readonly fieldErrors: ReadonlyMap<string, string>;
  /** Aplica o resultado de uma ação da sessão; mostra o erro, se houver. Retorna true se aplicou. */
  act: (r: Result) => boolean;
  /** Redesenha a réplica (mudança só de estado de tela). */
  redraw: () => void;
  editField: (id: string) => void;
  revealHeader: (header: CommandHeader | null) => void;
  message: (text: string, kind?: 'info' | 'error') => void;
}

type Child = Node | string | null | undefined | false;

export function group(title: string, ...children: Child[]): HTMLElement {
  return h('fieldset', { class: 'grp' }, h('legend', {}, title), ...children);
}

export function row(...children: Child[]): HTMLElement {
  return h('div', { class: 'r' }, ...children);
}

export function pills(
  tabs: readonly [string, string][],
  active: string,
  onSelect: (id: string) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'pills', role: 'tablist' },
    tabs.map(([id, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: id === active ? 'pill on' : 'pill',
          'aria-selected': id === active ? 'true' : 'false',
          onclick: () => {
            onSelect(id);
          },
        },
        label,
      ),
    ),
  );
}

/** Caixa somente leitura (display component). */
export function infoBox(label: string, value: string, unit = '', cls = ''): HTMLElement {
  return h(
    'div',
    { class: `fld ro ${cls}` },
    h('span', { class: 'lbl' }, label),
    h(
      'span',
      { class: 'line' },
      h('span', { class: 'box' }, value === '' ? ' ' : value),
      unit ? h('span', { class: 'unit' }, unit) : null,
    ),
  );
}

/** Caixa clicável genérica (abre diálogo próprio). */
export function actionBox(
  label: string,
  value: string,
  onclick: () => void,
  opts: { unit?: string; lock?: string | null; cls?: string; title?: string } = {},
): HTMLElement {
  return h(
    'div',
    {
      class: `fld ${opts.lock ? 'locked' : ''} ${opts.cls ?? ''}`,
      title: opts.lock ?? opts.title ?? undefined,
    },
    h('span', { class: 'lbl' }, label),
    h(
      'span',
      { class: 'line' },
      h(
        'button',
        { type: 'button', class: 'box', onclick },
        h('span', { class: 'val' }, value === '' ? ' ' : value),
        opts.lock ? h('span', { class: 'lock', 'aria-label': 'travado' }, '🔒') : null,
      ),
      opts.unit ? h('span', { class: 'unit' }, opts.unit) : null,
    ),
  );
}

export function button(
  label: string,
  onclick: () => void,
  opts: { disabled?: string | null; cls?: string } = {},
): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: `btn ${opts.cls ?? ''}`,
      disabled: Boolean(opts.disabled),
      title: opts.disabled ?? undefined,
      onclick,
    },
    label,
  );
}

export function table(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  opts: {
    selected?: number | null;
    onSelect?: (i: number) => void;
    rowClass?: (i: number) => string;
  } = {},
): HTMLElement {
  return h(
    'div',
    { class: 'tbl-wrap' },
    h(
      'table',
      { class: 'tbl' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          columns.map((c) => h('th', {}, c)),
        ),
      ),
      h(
        'tbody',
        {},
        rows.length === 0
          ? h('tr', {}, h('td', { colspan: String(columns.length), class: 'empty' }, '(vazio)'))
          : rows.map((r, i) =>
              h(
                'tr',
                {
                  class: `${opts.selected === i ? 'sel' : ''} ${opts.rowClass?.(i) ?? ''}`,
                  onclick: opts.onSelect
                    ? () => {
                        opts.onSelect?.(i);
                      }
                    : undefined,
                },
                r.map((c) => h('td', {}, c)),
              ),
            ),
      ),
    ),
  );
}

export function note(text: string): HTMLElement {
  return h('p', { class: 'note' }, text);
}

// ---------------------------------------------------------------- diálogos

let overlay: HTMLElement | null = null;

export function closeDialog(): void {
  overlay?.remove();
  overlay = null;
}

/**
 * Executa a ação do diálogo e fecha só este diálogo: a ação pode ter aberto outro (por exemplo,
 * a confirmação antes de reescrever o script), que não deve ser fechado junto.
 */
function runAndClose(action: () => string | null, err: HTMLElement): void {
  const mine = overlay;
  const e = action();
  if (e) err.textContent = e;
  else if (overlay === mine) closeDialog();
}

function openDialog(title: string, body: HTMLElement, buttons: HTMLElement[]): HTMLElement {
  closeDialog();
  const dlg = h(
    'div',
    { class: 'dlg', role: 'dialog', 'aria-label': title },
    h('h3', {}, title),
    body,
    h('div', { class: 'dlg-btns' }, buttons),
  );
  overlay = h(
    'div',
    {
      class: 'overlay',
      onclick: (e: Event) => {
        if (e.target === overlay) closeDialog();
      },
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Escape') closeDialog();
      },
    },
    dlg,
  );
  document.body.append(overlay);
  return dlg;
}

export interface EntryOptions {
  title: string;
  initial: string;
  hint?: string;
  keypad?: boolean;
  multiline?: boolean;
  /** Retorna mensagem de erro (diálogo continua aberto) ou null (fecha). */
  onOk: (text: string) => string | null;
}

/** Entrada de valor com teclado numérico opcional. */
export function entryDialog(o: EntryOptions): void {
  const input = o.multiline
    ? h('textarea', { class: 'dlg-in', rows: '8', spellcheck: 'false' })
    : h('input', { class: 'dlg-in', type: 'text', spellcheck: 'false', autocomplete: 'off' });
  input.value = o.initial;
  const err = h('p', { class: 'dlg-err', role: 'alert' });
  const ok = (): void => {
    runAndClose(() => o.onOk(input.value), err);
  };
  input.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter' && !o.multiline) ok();
  });
  const key = (k: string): HTMLElement =>
    h(
      'button',
      {
        type: 'button',
        class: 'key',
        onclick: () => {
          const v = input.value;
          if (k === '←') input.value = v.slice(0, -1);
          else if (k === 'C') input.value = '';
          else if (k === '±') input.value = v.startsWith('-') ? v.slice(1) : `-${v}`;
          else input.value = v + k;
          input.focus();
        },
      },
      k,
    );
  const pad = o.keypad
    ? h(
        'div',
        { class: 'keypad' },
        ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '.', '←', 'C'].map(key),
      )
    : null;
  openDialog(
    o.title,
    h('div', {}, o.hint ? h('p', { class: 'dlg-hint' }, o.hint) : null, input, pad, err),
    [button('Cancel', closeDialog), button('OK', ok, { cls: 'primary' })],
  );
  input.focus();
  if (!o.multiline) input.select();
}

export interface ChoiceOption {
  value: string;
  label: string;
  disabled?: string;
}

/** Lista de seleção (drop down da tela). */
export function choiceDialog(
  title: string,
  options: readonly ChoiceOption[],
  current: string,
  onPick: (value: string) => string | null,
): void {
  const err = h('p', { class: 'dlg-err', role: 'alert' });
  const list = h(
    'div',
    { class: 'choices' },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: `choice ${o.value === current ? 'on' : ''}`,
          disabled: Boolean(o.disabled),
          title: o.disabled ?? undefined,
          onclick: () => {
            runAndClose(() => onPick(o.value), err);
          },
        },
        o.label,
        o.disabled ? h('small', {}, ` (${o.disabled})`) : null,
      ),
    ),
  );
  openDialog(title, h('div', {}, list, err), [button('Cancel', closeDialog)]);
}

export function confirmDialog(title: string, text: string, onYes: () => void): void {
  openDialog(title, h('p', {}, text), [
    button('Cancel', closeDialog),
    button(
      'Confirmar',
      () => {
        closeDialog();
        onYes();
      },
      { cls: 'primary' },
    ),
  ]);
}
