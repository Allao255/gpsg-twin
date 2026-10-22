// Download de arquivo gerado no navegador (salvo pelo usuário).
import { h } from './dom';

export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(name, new Blob([text], { type }));
}

export function downloadBytes(name: string, data: Uint8Array, type = 'application/zip'): void {
  downloadBlob(name, new Blob([data.slice().buffer], { type }));
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
