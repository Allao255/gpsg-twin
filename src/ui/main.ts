// Shell da aplicação: abas Equipamento, Análise e Ajuda (guia de uso e referência de comandos).
import './styles.css';
import type { Target } from '../analysis/events';
import { analysisView } from './analysis/analysis-view';
import { h } from './dom';
import { helpView } from './help-view';
import { createReplicaApp } from './replica/app';

// A réplica existe desde o início (a Análise lê o estado dela); ajuda e análise são criadas uma vez
// e reaproveitadas ao trocar de aba (mantêm estado e posição).
const replica = createReplicaApp();
let help: HTMLElement | null = null;

type TabId = 'equipamento' | 'analise' | 'ajuda';

let select: (id: TabId) => void = () => undefined;

const analysis = analysisView(replica.handle, (line: number | null, target: Target | null) => {
  select('equipamento');
  replica.handle.reveal(line, target);
});

const TABS: { id: TabId; label: string; render: () => HTMLElement }[] = [
  { id: 'equipamento', label: 'Equipamento', render: () => replica.el },
  { id: 'analise', label: 'Análise', render: () => analysis.el },
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
  select = (id: TabId): void => {
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
  // O mapa precisa estar no documento para medir o tamanho.
  if (active === 'analise') analysis.show();
}

const root = document.getElementById('app');
if (root) render(root, initialTab());
