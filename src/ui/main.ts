// Shell da aplicação: abas Equipamento, Análise e Ajuda (guia de uso e referência de comandos).
import './styles.css';
import { h } from './dom';
import { helpView } from './help-view';
import { createReplicaApp } from './replica/app';

// Réplica e ajuda são criadas uma vez e reaproveitadas ao trocar de aba (mantêm estado e posição).
let replica: HTMLElement | null = null;
let help: HTMLElement | null = null;

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
  {
    id: 'ajuda',
    label: 'Ajuda',
    render: () => {
      help ??= helpView();
      return help;
    },
  },
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
