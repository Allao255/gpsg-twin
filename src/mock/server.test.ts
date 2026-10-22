import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startMock, type MockServer } from './server';

let mock: MockServer | null = null;
afterEach(async () => {
  await mock?.close();
  mock = null;
});

function exchange(port: number, lines: string[], waitMs = 150): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, '127.0.0.1', () => {
      s.write(lines.map((l) => l + '\n').join(''));
      setTimeout(() => {
        s.end();
      }, waitMs);
    });
    let out = '';
    s.on('data', (d: Buffer) => {
      out += d.toString('utf8');
    });
    s.on('close', () => {
      resolve(out);
    });
    s.on('error', reject);
  });
}

describe('servidor TCP do mock', () => {
  it('responde consultas linha a linha, inclusive em partes', async () => {
    const log: string[] = [];
    mock = await startMock({ port: 0, splitMs: 20, log: (l) => log.push(l) });
    // Regressão: com envio em duas partes, respostas seguidas se intercalavam ("-1125").
    const out = await exchange(mock.port, ['GPS:SET:RFLV -125\r', 'GPS:SET:RFLV?', '*OPC?']);
    expect(out).toBe('-125\n1\n');
    expect(log).toContain('<< GPS:SET:RFLV -125');
    expect(log).toContain('>> -125');
  });

  it('estado compartilhado entre conexões, sem atraso de envio', async () => {
    mock = await startMock({ port: 0, splitMs: 0 });
    await exchange(mock.port, ['GPS:SIM:TRUN']);
    expect(await exchange(mock.port, ['GPS:SIM:TRUN?'])).toBe('"Running"\n');
    expect(mock.instrument.running).toBe(true);
  });

  it('falha ao ocupar porta em uso', async () => {
    mock = await startMock({ port: 0 });
    await expect(startMock({ port: mock.port })).rejects.toThrow();
  });
});
