// Instrumento simulado na porta 5025 (02-interface-remota.md seção 7.1).
// Uso: npm run mock -- [--port 5025] [--host 127.0.0.1] [--split-ms 50] [--prns 1,5,9] [--gal-prns 2,7] [--channels 12] [--verbose]
import { parseArgs } from 'node:util';
import { startMock } from '../src/mock/server';

function parsePrns(s: string | undefined): number[] | undefined {
  return s ? s.split(',').map((x) => Number(x.trim())) : undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '5025' },
      host: { type: 'string', default: '127.0.0.1' },
      'split-ms': { type: 'string', default: '50' },
      prns: { type: 'string' },
      'gal-prns': { type: 'string' },
      channels: { type: 'string', default: '12' },
      verbose: { type: 'boolean', default: false },
    },
  });
  const gps = parsePrns(values.prns);
  const gal = parsePrns(values['gal-prns']);
  const m = await startMock({
    port: Number(values.port),
    host: values.host,
    splitMs: Number(values['split-ms']),
    channels: values.channels === '6' ? 6 : 12,
    ...(gps || gal
      ? { prns: { GPS: gps ?? [1, 5, 9, 13, 17, 22], GAL: gal ?? [2, 7, 11, 19] } }
      : {}),
    ...(values.verbose
      ? {
          log: (l: string) => {
            console.log(l);
          },
        }
      : {}),
  });
  console.log(`mock GPSG-1000 em ${values.host}:${m.port} (Ctrl+C para encerrar)`);
}

void main();
