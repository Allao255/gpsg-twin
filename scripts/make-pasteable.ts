// Gera o bloco colável do runner PowerShell com um script embutido (mesma função do site).
// Uso: npm run pasteable -- --script sessions/S01-sonda.scpi --address 192.168.0.10 [--port 5025] > S01-colavel.ps1
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { makePasteable } from '../src/runner/pasteable';

const { values } = parseArgs({
  options: {
    script: { type: 'string' },
    address: { type: 'string' },
    port: { type: 'string', default: '5025' },
    'quiet-ms': { type: 'string', default: '300' },
    'timeout-ms': { type: 'string', default: '3000' },
    'time-scale': { type: 'string', default: '1' },
  },
});
if (!values.script || !values.address) {
  console.error('uso: npm run pasteable -- --script <arquivo.scpi> --address <ip> [--port 5025]');
  process.exit(2);
}
const root = resolve(import.meta.dirname, '..');
const runner = readFileSync(resolve(root, 'runners/gpsg-run.ps1'), 'utf8');
process.stdout.write(
  makePasteable(runner, {
    scriptName: basename(values.script),
    script: readFileSync(values.script, 'utf8'),
    address: values.address,
    port: Number(values.port),
    quietMs: Number(values['quiet-ms']),
    timeoutMs: Number(values['timeout-ms']),
    timeScale: Number(values['time-scale']),
  }),
);
