import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('títulos, parágrafo de várias linhas, inline', () => {
    expect(renderMarkdown('# Título `x`\n\nUma linha\ncontinua **forte** e <tag> & `<b>`.')).toBe(
      '<h1>Título <code>x</code></h1>\n<p>Uma linha continua <strong>forte</strong> e &lt;tag&gt; &amp; <code>&lt;b&gt;</code>.</p>',
    );
  });

  it('lista numerada com sublista e bloco de código recuados', () => {
    const md = ['1. Passo um:', '   ```', '   npm run mock', '   ```', '   Texto do passo.', '2. Passo dois', '   - a', '   - b', '', 'Fim.'].join('\n');
    expect(renderMarkdown(md)).toBe(
      '<ol><li>Passo um:<pre><code>npm run mock</code></pre>\n<p>Texto do passo.</p></li>' +
        '<li>Passo dois<ul><li>a</li><li>b</li></ul></li></ol>\n<p>Fim.</p>',
    );
  });

  it('lista com linha em branco entre itens e início diferente de 1', () => {
    expect(renderMarkdown('3. c\n\n4. d\n\n   continuação')).toBe(
      '<ol start="3"><li>c</li><li>d<p>continuação</p></li></ol>',
    );
    expect(renderMarkdown('- a\n1. b')).toBe('<ul><li>a</li></ul>\n<ol><li>b</li></ol>');
  });

  it('tabela', () => {
    expect(renderMarkdown('| A | B |\n|---|---|\n| `x` | 2 |\n\ndepois')).toBe(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>x</code></td><td>2</td></tr></tbody></table>\n<p>depois</p>',
    );
    // Linha com | sem separador não é tabela.
    expect(renderMarkdown('| a |')).toBe('<p>| a |</p>');
  });

  it('links pelo resolvedor; null mostra só o texto', () => {
    const link = (h: string): string | null => (h.endsWith('.md') ? `#guia/${h}` : null);
    expect(renderMarkdown('Ver [página](04-x.md) e [fora](../y.ts).', link)).toBe(
      '<p>Ver <a href="#guia/04-x.md">página</a> e fora.</p>',
    );
    expect(renderMarkdown('[a](b)')).toBe('<p><a href="b">a</a></p>');
  });

  it('bloco de código sem fechamento vai até o fim; escape', () => {
    expect(renderMarkdown('```\n<a>')).toBe('<pre><code>&lt;a&gt;</code></pre>');
    expect(escapeHtml('"&')).toBe('&quot;&amp;');
  });

  it('todas as páginas do guia viram HTML sem marcação Markdown solta', () => {
    const dir = resolve(import.meta.dirname, '../../docs/guia');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const html = renderMarkdown(readFileSync(resolve(dir, f), 'utf8'));
      const text = html.replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, '');
      expect(text, f).not.toMatch(/```|^#|\]\(|\*\*|^\s*\|/m);
    }
  });

  it('o guia não cita marcos (Mn) nem IDs de discrepância (Dnn)', () => {
    const dir = resolve(import.meta.dirname, '../../docs/guia');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      expect(readFileSync(resolve(dir, f), 'utf8'), f).not.toMatch(/\b[MD]\d{1,2}\b/);
    }
  });
});
