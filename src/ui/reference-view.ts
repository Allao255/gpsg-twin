// Aba Ajuda: referência de comandos gerada do modelo, com busca e filtros.
import discrepancyMd from '../../docs/04-discrepancias.md?raw';
import { getIndex } from '../core/model/load';
import { parseDiscrepancies } from '../docs/discrepancies';
import {
  buildReference,
  categories,
  filterReference,
  type ReferenceEntry,
  type ReferenceFilter,
} from '../docs/reference';
import { h } from './dom';

const KIND_LABEL: Record<string, string> = { set: 'ajuste', query: 'consulta', action: 'ação' };

/** Um selo por comando: divergência aberta prevalece sobre resolvida; o texto vai no title. */
function discrepancyBadge(e: ReferenceEntry): HTMLElement | null {
  if (e.discrepancies.length === 0) return null;
  const open = e.discrepancies.some((d) => !d.resolved);
  return h(
    'span',
    {
      class: open ? 'badge warn' : 'badge',
      title: e.discrepancies.map((d) => d.divergence).join('\n'),
    },
    open ? 'divergência entre manuais' : 'divergência resolvida',
  );
}

function entryView(e: ReferenceEntry): HTMLElement {
  const badges = [
    h('span', { class: `badge kind-${e.kind}` }, KIND_LABEL[e.kind] ?? e.kind),
    h('span', { class: 'badge' }, e.category),
    e.verified
      ? h('span', { class: 'badge ok' }, 'verificado em bancada')
      : h('span', { class: 'badge muted' }, 'não verificado'),
    e.locked === true ? h('span', { class: 'badge warn' }, 'trava em execução') : null,
    !e.emitAllowed ? h('span', { class: 'badge danger' }, 'nunca emitido') : null,
    discrepancyBadge(e),
  ];
  return h(
    'details',
    { class: 'cmd' },
    h(
      'summary',
      {},
      h('code', { class: 'short' }, e.shortHeader),
      h('span', { class: 'long' }, e.header),
      h('span', { class: 'badges' }, badges),
    ),
    h(
      'div',
      { class: 'cmd-body' },
      h(
        'dl',
        {},
        h('dt', {}, 'Forma longa'),
        h('dd', {}, h('code', {}, e.longHeader)),
        e.emittedAs
          ? [h('dt', {}, 'Emitido pelo twin como'), h('dd', {}, h('code', {}, e.emittedAs))]
          : null,
        e.aliases.length ? [h('dt', {}, 'Aliases'), h('dd', {}, e.aliases.join(', '))] : null,
        h('dt', {}, 'Manual'),
        h('dd', {}, e.page),
        e.example
          ? [h('dt', {}, 'Exemplo do manual'), h('dd', {}, h('code', {}, e.example))]
          : null,
        e.returns ? [h('dt', {}, 'Retorno'), h('dd', {}, e.returns)] : null,
        e.notes ? [h('dt', {}, 'Notas'), h('dd', {}, e.notes)] : null,
      ),
      e.params.length
        ? h(
            'div',
            { class: 'scroll-x' },
            h(
              'table',
              { class: 'params' },
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  ['Parâmetro', 'Tipo', 'Faixa ou valores', 'Unidade', 'Observações'].map((t) =>
                    h('th', {}, t),
                  ),
                ),
              ),
              h(
                'tbody',
                {},
                e.params.map((p) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, p.name + (p.optional ? ' (opcional)' : '')),
                    h('td', {}, p.type),
                    h('td', {}, p.range),
                    h('td', {}, p.unit),
                    h('td', {}, p.notes),
                  ),
                ),
              ),
            ),
          )
        : null,
      e.discrepancies.length
        ? h(
            'ul',
            { class: 'disc' },
            e.discrepancies.map((d) =>
              h(
                'li',
                {},
                d.divergence,
                d.provisional ? h('em', {}, ` Tratamento provisório: ${d.provisional}`) : null,
              ),
            ),
          )
        : null,
    ),
  );
}

export function referenceView(): HTMLElement {
  const entries = buildReference(getIndex(), parseDiscrepancies(discrepancyMd));
  const filter: ReferenceFilter = {
    text: '',
    category: '',
    kind: '',
    verifiedOnly: false,
    withDiscrepancyOnly: false,
  };
  const list = h('div', { class: 'cmd-list' });
  const count = h('span', { class: 'count' });

  const refresh = (): void => {
    const shown = filterReference(entries, filter);
    count.textContent = `${shown.length} de ${entries.length} comandos`;
    list.replaceChildren(...shown.map(entryView));
  };
  const select = (
    label: string,
    options: [string, string][],
    onChange: (v: string) => void,
  ): HTMLElement =>
    h(
      'label',
      {},
      label,
      ' ',
      h(
        'select',
        {
          onchange: (ev: Event) => {
            onChange((ev.target as HTMLSelectElement).value);
            refresh();
          },
        },
        options.map(([v, t]) => h('option', { value: v }, t)),
      ),
    );
  const check = (label: string, onChange: (v: boolean) => void): HTMLElement =>
    h(
      'label',
      {},
      h('input', {
        type: 'checkbox',
        onchange: (ev: Event) => {
          onChange((ev.target as HTMLInputElement).checked);
          refresh();
        },
      }),
      ` ${label}`,
    );

  const view = h(
    'section',
    { class: 'reference' },
    h('h1', {}, 'Referência de comandos'),
    h(
      'p',
      { class: 'muted' },
      'Gerada de model/commands.json e docs/04-discrepancias.md a cada build. Páginas no formato RP x-y (manual de programação remota).',
    ),
    h(
      'div',
      { class: 'filters' },
      h('input', {
        type: 'search',
        placeholder: 'buscar: cabeçalho, forma curta, parâmetro, Dnn',
        'aria-label': 'buscar',
        oninput: (ev: Event) => {
          filter.text = (ev.target as HTMLInputElement).value;
          refresh();
        },
      }),
      select(
        'Categoria',
        [['', 'todas'], ...categories(entries).map((c): [string, string] => [c, c])],
        (v) => {
          filter.category = v as ReferenceFilter['category'];
        },
      ),
      select(
        'Tipo',
        [
          ['', 'todos'],
          ['set', 'ajuste'],
          ['query', 'consulta'],
          ['action', 'ação'],
        ],
        (v) => {
          filter.kind = v as ReferenceFilter['kind'];
        },
      ),
      check('verificado em bancada', (v) => {
        filter.verifiedOnly = v;
      }),
      check('com divergência entre manuais', (v) => {
        filter.withDiscrepancyOnly = v;
      }),
      count,
    ),
    list,
  );
  refresh();
  return view;
}
