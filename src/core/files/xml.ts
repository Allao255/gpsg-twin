// XML mínimo para os arquivos do equipamento (rota e settings, OP D-5 a D-7): elementos, atributos,
// texto e entidades. Sem namespaces, CDATA ou instruções além de serem ignoradas.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Texto direto do elemento, sem espaços nas pontas. */
  text: string;
}

export type XmlResult = { root: XmlElement } | { error: string };

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m: string, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NAME = '[A-Za-z_][\\w.-]*';
const TAG_RE = new RegExp(`^<(/?)(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"]*"|'[^']*'))*)\\s*(/?)>`);
const ATTR_RE = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g');

/** Lê um documento XML com um elemento raiz. */
export function parseXml(text: string): XmlResult {
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let i = 0;
  const s = text.replace(/^\uFEFF/, '');
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const chunk = s.slice(i, lt < 0 ? s.length : lt);
    const top = stack.at(-1);
    if (chunk.trim() !== '') {
      if (!top) return { error: `texto fora do elemento raiz: "${chunk.trim().slice(0, 20)}"` };
      top.text += decode(chunk);
    }
    if (lt < 0) break;
    const rest = s.slice(lt);
    const skip = /^<!--[\s\S]*?-->|^<\?[\s\S]*?\?>|^<!DOCTYPE[^>]*>/i.exec(rest);
    if (skip) {
      i = lt + skip[0].length;
      continue;
    }
    const m = TAG_RE.exec(rest);
    if (!m) return { error: `marcação inválida perto de "${rest.slice(0, 30)}"` };
    const [whole, closing, name = '', attrText = '', selfClose] = m;
    i = lt + whole.length;
    if (closing) {
      const open = stack.pop();
      if (open?.name !== name) return { error: `</${name}> sem abertura correspondente` };
      open.text = open.text.trim();
      continue;
    }
    const el: XmlElement = { name, attrs: {}, children: [], text: '' };
    for (const a of attrText.matchAll(ATTR_RE)) el.attrs[a[1] ?? ''] = decode(a[2] ?? a[3] ?? '');
    if (top) top.children.push(el);
    else if (root) return { error: 'mais de um elemento raiz' };
    else root = el;
    if (!selfClose) stack.push(el);
  }
  if (stack.length > 0) return { error: `<${stack.at(-1)?.name ?? ''}> não fechado` };
  if (!root) return { error: 'documento sem elemento' };
  return { root };
}

export function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}
