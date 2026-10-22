import { describe, expect, it } from 'vitest';
import { scenarioFromScript } from '../scenario/from-script';
import { parseScript } from '../script/parse';
import { isSessionLog, LOG_HEADER, logToScript, parseLogRows } from './session-log';

/** Linha de log no formato dos runners. */
const row = (tS: number, tR: number | null, kind: string, text: string): string =>
  `2026-01-01T00:00:00.000+00:00,${tS.toFixed(3)},${tR === null ? '' : tR.toFixed(3)},${kind},${/[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text}`;

// Sessão sintética com a forma exata do runner: @run e @stop consultam TRUN? antes e depois.
const LOG = [
  LOG_HEADER,
  row(0, null, 'INFO', 'script x.scpi (10 lines)'),
  row(0, null, 'MARK', 'ensaio inicio'),
  row(0.1, null, 'TX', 'GPS:SET:UNIT SI'),
  row(0.2, null, 'TX', 'GPS:SET:CLOC INTERNAL'),
  row(0.3, null, 'ERR', '-224,"Illegal parameter value"'),
  row(0.4, null, 'TX', 'GPS:SET:RFLV -120'),
  row(0.5, null, 'TX', 'GPS:SET:UNIT?'),
  row(0.6, null, 'RX', '"SI"'),
  row(0.7, null, 'MARK', 'PAUSE Confirmar porta'),
  row(1.0, null, 'TX', 'GPS:SIM:TRUN?'),
  row(1.1, null, 'RX', '"Stopped"'),
  row(1.1, null, 'TX', 'GPS:SIM:TRUN'),
  row(1.2, null, 'TX', 'GPS:SIM:TRUN?'),
  row(1.3, null, 'RX', '"Running"'),
  row(1.3, 0, 'MARK', 't_run = 0'),
  row(1.4, 0.1, 'INFO', 'PRN=5'),
  row(31.3, 30.0004, 'TX', 'GPS:SVPR:GPS:SAT 5,OFF,GOOD,0,0,0,0,3600'),
  row(31.4, 30.1, 'TX', 'GPS:SVPR:GPS:LIST?'),
  row(31.5, 30.2, 'RX', '"5,60,265"'),
  row(61.3, 60, 'TX', 'GPS:SET:RFLV -125'),
  row(61.4, 60.1, 'TX', 'GPS:SET:CARR L2'),
  row(61.5, 60.2, 'WARN', 'algo'),
  row(61.6, 60.3, 'ERR', '-221,"Settings conflict"'),
  row(91.3, 90, 'TX', 'GPS:SIM:TRUN?'),
  row(91.4, 90.1, 'RX', '"Running"'),
  row(91.4, 90.1, 'TX', 'GPS:SIM:TRUN'),
  row(91.5, 90.2, 'TX', 'GPS:SIM:TRUN?'),
  row(91.6, 90.3, 'RX', '"Stopped"'),
  '',
].join('\n');

describe('parseLogRows', () => {
  it('cabeçalho, campos e linhas malformadas', () => {
    expect(isSessionLog(`\uFEFF${LOG}`)).toBe(true);
    expect(isSessionLog('a,b')).toBe(false);
    const r = parseLogRows(LOG);
    expect(r.diagnostics).toEqual([]);
    expect(r.rows[4]).toEqual({
      utc: '2026-01-01T00:00:00.000+00:00',
      tSession_s: 0.3,
      tRun_s: null,
      kind: 'ERR',
      text: '-224,"Illegal parameter value"',
    });
    expect(parseLogRows('x').diagnostics[0]?.severity).toBe('error');
    expect(parseLogRows(`${LOG_HEADER}\na,b\nu,x,,TX,c`).diagnostics.map((d) => d.line)).toEqual([
      2, 3,
    ]);
  });
});

describe('logToScript', () => {
  it('comandos aceitos, rejeitados comentados, @run/@stop e instantes reais', () => {
    const r = logToScript(LOG, 'ensaio');
    expect(r.diagnostics).toEqual([]);
    expect(r.stats).toEqual({ tx: 14, rejected: 2, runs: 1 });
    expect(r.text).toBe(
      [
        '# twin-scenario: ensaio',
        '# reconstruído de log de sessão do runner',
        '@mark ensaio inicio',
        'GPS:SET:UNIT SI',
        '# rejeitado (-224,"Illegal parameter value"): GPS:SET:CLOC INTERNAL',
        'GPS:SET:RFLV -120',
        '# PAUSE Confirmar porta',
        '@run',
        '# entrada do operador: PRN=5',
        '@at 30',
        'GPS:SVPR:GPS:SAT 5,OFF,GOOD,0,0,0,0,3600',
        '@at 60',
        'GPS:SET:RFLV -125',
        '# rejeitado (-221,"Settings conflict"): GPS:SET:CARR L2',
        '@at 90.1',
        '@stop',
        '',
      ].join('\n'),
    );
  });

  it('o script reconstruído vira cenário com a linha do tempo do log', () => {
    const doc = parseScript(logToScript(LOG, 'ensaio').text);
    expect(doc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const sc = scenarioFromScript(doc).scenario;
    expect(sc.setup.rfLevel_dBm).toBe(-120);
    expect(sc.actions.map((a) => [a.t_s, a.type])).toEqual([
      [30, 'sv'],
      [60, 'rfLevel'],
    ]);
    expect(sc.run.stopAt_s).toBe(90.1);
  });

  it('log sem TX e log que termina rodando', () => {
    expect(logToScript(LOG_HEADER).diagnostics[0]?.message).toMatch(/sem comandos/);
    const cut = LOG.split('\n').slice(0, 22).join('\n');
    expect(logToScript(cut).diagnostics.map((d) => d.message)).toEqual([
      'log termina com a simulação rodando (sem @stop)',
    ]);
  });
});
