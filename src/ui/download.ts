// Download de texto gerado no navegador (arquivo salvo pelo usuário).
import { h } from './dom';

export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
