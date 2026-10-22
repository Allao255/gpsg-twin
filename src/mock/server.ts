// Servidor TCP do instrumento simulado (porta 5025, uma mensagem por linha terminada em LF).
// Linha de comando em scripts/mock.ts (npm run mock).
import { createServer, type Server, type Socket } from 'node:net';
import { Instrument, type InstrumentOptions } from './instrument';

export interface MockServerOptions extends InstrumentOptions {
  port?: number;
  host?: string;
  /**
   * Resposta enviada em duas partes separadas por este intervalo (ms), para exercitar a leitura
   * por silêncio dos runners (02-interface-remota.md seção 8). 0 envia de uma vez.
   */
  splitMs?: number;
  log?: (line: string) => void;
}

export interface MockServer {
  server: Server;
  instrument: Instrument;
  port: number;
  close: () => Promise<void>;
}

/** Inicia o mock. Um instrumento compartilhado por todas as conexões, como o equipamento. */
export function startMock(opts: MockServerOptions = {}): Promise<MockServer> {
  const instrument = new Instrument(opts);
  const splitMs = opts.splitMs ?? 50;
  const log = opts.log;
  const sockets = new Set<Socket>();

  const server = createServer((sock) => {
    sockets.add(sock);
    sock.setNoDelay(true);
    let buf = '';
    // Envios encadeados: a resposta seguinte só começa depois da anterior inteira.
    let chain: Promise<void> = Promise.resolve();
    sock.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        log?.(`<< ${line}`);
        const resp = instrument.handle(line);
        if (resp !== null) {
          log?.(`>> ${resp.replace(/\n/g, '\\n')}`);
          chain = chain.then(() => send(sock, resp + '\n', splitMs));
        }
      }
    });
    sock.on('error', () => {
      sockets.delete(sock);
    });
    sock.on('close', () => {
      sockets.delete(sock);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 5025, opts.host ?? '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 5025);
      resolve({
        server,
        instrument,
        port,
        close: () =>
          new Promise<void>((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

function send(sock: Socket, payload: string, splitMs: number): Promise<void> {
  if (sock.destroyed) return Promise.resolve();
  if (splitMs <= 0 || payload.length < 2) {
    sock.write(payload);
    return Promise.resolve();
  }
  const half = Math.floor(payload.length / 2);
  sock.write(payload.slice(0, half));
  return new Promise((done) => {
    setTimeout(() => {
      if (!sock.destroyed) sock.write(payload.slice(half));
      done();
    }, splitMs);
  });
}
