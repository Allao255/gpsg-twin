// Aba Ajuda: guia de uso (docs/guia/, embutido no build) e referência de comandos gerada do modelo.
import { renderMarkdown } from '../docs/markdown';
import { h } from './dom';
import { referenceView } from './reference-view';

const RAW = import.meta.glob<string>('../../docs/guia/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

interface Page {
  id: string;
  title: string;
  md: string;
}

const REFERENCE = 'referencia';

const PAGES: readonly Page[] = Object.entries(RAW)
  .map(([path, md]) => {
    const file = path.replace(/^.*\//, '');
    const id = file === 'README.md' ? 'inicio' : file.replace(/\.md$/, '');
    const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? id;
    return { id, title: id === 'inicio' ? 'Guia de uso' : title, md };
  })
  .sort((a, b) => (a.id === 'inicio' ? -1 : b.id === 'inicio' ? 1 : a.id.localeCompare(b.id)));

/** Link do guia: outra página do guia vira navegação interna; arquivo fora do guia, só texto. */
function resolveLink(href: string): string | null {
  if (/^https?:\/\//.test(href)) return href;
  const m = /^([\w-]+)\.md$/.exec(href);
  if (!m) return null;
  const id = m[1] === 'README' ? 'inicio' : (m[1] ?? '');
  return PAGES.some((p) => p.id === id) ? `#ajuda/${id}` : null;
}

export function helpView(): HTMLElement {
  let current = 'inicio';
  let reference: HTMLElement | null = null;
  const content = h('article', { class: 'help-content' });
  const nav = h('nav', { class: 'help-nav', 'aria-label': 'páginas da ajuda' });

  const show = (id: string): void => {
    current = id;
    for (const b of nav.querySelectorAll('button'))
      b.classList.toggle('active', b.dataset.page === id);
    if (id === REFERENCE) {
      reference ??= referenceView();
      content.replaceChildren(reference);
      window.scrollTo({ top: 0 });
      return;
    }
    const page = PAGES.find((p) => p.id === id) ?? PAGES[0];
    const div = h('div', { class: 'md' });
    div.innerHTML = page ? renderMarkdown(page.md, resolveLink) : '';
    content.replaceChildren(div);
    window.scrollTo({ top: 0 });
  };

  const item = (id: string, title: string): HTMLElement => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'help-link',
        onclick: () => {
          show(id);
        },
      },
      title,
    );
    b.dataset.page = id;
    return b;
  };
  nav.append(
    ...PAGES.map((p) => item(p.id, p.title)),
    h('hr', {}),
    item(REFERENCE, 'Referência de comandos'),
  );

  // Links internos do guia trocam de página sem mudar a aba.
  content.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a');
    const m = /^#ajuda\/([\w-]+)$/.exec(a?.getAttribute('href') ?? '');
    if (!m) return;
    e.preventDefault();
    show(m[1] ?? 'inicio');
  });

  show(current);
  return h('section', { class: 'help' }, nav, content);
}
