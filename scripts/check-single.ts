// Confere o HTML único: um arquivo, sem script ou estilo externo, sem referência http(s) carregável.
// Move dist/single/index.html para dist/gpsg-twin.html.
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'dist/single/index.html');
const dst = resolve(root, 'dist/gpsg-twin.html');
if (!existsSync(src)) throw new Error(`build single ausente: ${src}`);
const html = readFileSync(src, 'utf8');

const problems: string[] = [];
for (const m of html.matchAll(
  /<(script|link|img|iframe)\b[^>]*\b(src|href)\s*=\s*["']([^"']+)["']/gi,
)) {
  const url = m[3] ?? '';
  if (!url.startsWith('data:') && !url.startsWith('#')) problems.push(`${m[1] ?? ''} ${url}`);
}
for (const m of html.matchAll(/url\(\s*["']?(https?:[^"')]+)/gi))
  problems.push(`css url ${m[1] ?? ''}`);
if (problems.length > 0) {
  throw new Error(`HTML único com recursos externos:\n${problems.join('\n')}`);
}
renameSync(src, dst);
rmSync(resolve(root, 'dist/single'), { recursive: true, force: true });
console.log(`dist/gpsg-twin.html: ${(html.length / 1024).toFixed(0)} KiB, sem recursos externos`);
