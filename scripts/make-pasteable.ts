// Gera o bloco colável do runner PowerShell com um script embutido (mesma função do site).
// Uso: npm run pasteable -- --script sessions/S01-sonda.scpi --address 192.168.0.10 [--port 5025] --out S01-colavel.ps1
// Sem --out, o bloco vai para a saída padrão; redirecionar só com `npm run -s` (sem -s, o npm escreve o
// cabeçalho da execução na saída e o bloco deixa de colar).
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { makePasteable } from '../src/runner/pasteable';

const { values } = parseArgs({
  options: {
    script: { type: 'string' },
    address: { type: 'string' },
    out: { type: 'string' },
    port: { type: 'string', default: '5025' },
    'quiet-ms': { type: 'string', default: '300' },
    'timeout-ms': { type: 'string', default: '3000' },
    'time-scale': { type: 'string', default: '1' },
  },
});
if (!values.script || !values.address) {
  console.error(
    'uso: npm run pasteable -- --script <arquivo.scpi> --address <ip> [--port 5025] [--out <arquivo.ps1>]',
  );
  process.exit(2);
}
const root = resolve(import.meta.dirname, '..');
const runner = readFileSync(resolve(root, 'runners/gpsg-run.ps1'), 'utf8');
const text = makePasteable(runner, {
  scriptName: basename(values.script),
  script: readFileSync(values.script, 'utf8'),
  address: values.address,
  port: Number(values.port),
  quietMs: Number(values['quiet-ms']),
  timeoutMs: Number(values['timeout-ms']),
  timeScale: Number(values['time-scale']),
});
if (values.out) {
  writeFileSync(values.out, text);
  console.error(`bloco colável gravado em ${values.out}`);
} else {
  process.stdout.write(text);
}
