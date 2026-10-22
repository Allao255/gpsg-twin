// Shell da aplicação: abas Equipamento, Análise e Ajuda.
import './styles.css';
import { h } from './dom';
import { referenceView } from './reference-view';
import { createReplicaApp } from './replica/app';

// A réplica é criada uma vez e reaproveitada ao trocar de aba (mantém o estado e o editor).
let replica: HTMLElement | null = null;

type TabId = 'equipamento' | 'analise' | 'ajuda';

const TABS: { id: TabId; label: string; render: () => HTMLElement }[] = [
  {
    id: 'equipamento',
    label: 'Equipamento',
    render: () => {
      replica ??= createReplicaApp();
      return replica;
    },
  },
  {
    id: 'analise',
    label: 'Análise',
    render: () =>
      h(
        'section',
        {},
        h(
          'p',
          { class: 'notice' },
          'Aba Análise: camada declarada no marco M5, camada calculada no M6.',
        ),
      ),
  },
  { id: 'ajuda', label: 'Ajuda', render: () => referenceView() },
];

function initialTab(): TabId {
  const id = location.hash.replace('#', '');
  return TABS.some((t) => t.id === id) ? (id as TabId) : 'equipamento';
}

function render(root: HTMLElement, active: TabId): void {
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];
  const select = (id: TabId): void => {
    // O hash é só memória da aba; em data: ou contexto restrito, replaceState pode falhar.
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      /* sem histórico disponível */
    }
    render(root, id);
  };
  root.replaceChildren(
    h(
      'header',
      { class: 'topbar' },
      h('span', { class: 'brand' }, 'gpsg-twin'),
      h(
        'nav',
        { class: 'tabs', role: 'tablist' },
        TABS.map((t) =>
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: t.id === active ? 'tab active' : 'tab',
              'aria-selected': t.id === active ? 'true' : 'false',
              onclick: () => {
                select(t.id);
              },
            },
            t.label,
          ),
        ),
      ),
    ),
    h('main', {}, tab ? tab.render() : null),
  );
}

const root = document.getElementById('app');
if (root) render(root, initialTab());
