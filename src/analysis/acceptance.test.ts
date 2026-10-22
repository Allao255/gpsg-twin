// Critério de aceite do M5 (camada declarada): os scripts do capítulo 14 do manual remoto e S01 são
// exibidos com linha do tempo, rota e orçamento corretos, e todo evento leva à linha do script e a
// um alvo existente na réplica.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { radToDeg } from '../core/geo';
import { levelBudget } from '../core/scenario/budget';
import { applyKnownCorrections } from '../core/script/correct';
import { parseScript } from '../core/script/parse';
import { field } from '../replica/fields';
import { RP14_1, RP14_2, RP14_3, RP14_4 } from '../replica/rp14.test-util';
import { loadScript, newSession } from '../replica/session';
import { analysisEvents } from './events';
import { checkRoute } from './route-checks';
import { stateAt, timelineEnd } from './state';

const S01 = readFileSync(resolve(import.meta.dirname, '../../sessions/S01-sonda.scpi'), 'utf8');

/** Como o operador abriria: correções conhecidas e unidades IMPERIAL do capítulo 14 (D04). */
function open(text: string): {
  doc: ReturnType<typeof parseScript>;
  sc: ReturnType<typeof loadScript>['session']['scenario'];
} {
  const t = applyKnownCorrections(`GPS:SET:UNIT IMPERIAL\n${text}`).text;
  return { doc: parseScript(t), sc: loadScript(newSession(), t).session.scenario };
}

function expectLinked(doc: ReturnType<typeof parseScript>): void {
  const ev = analysisEvents(doc);
  expect(ev.length).toBeGreaterThan(0);
  for (const e of ev) {
    expect(doc.lines[e.line - 1]?.lineNo).toBe(e.line);
    if (e.target?.kind === 'field')
      expect(() => field(e.target?.kind === 'field' ? e.target.id : '')).not.toThrow();
  }
}

describe('capítulo 14 na aba Análise', () => {
  it('14.2 + 14.1: estático, posição e orçamento', () => {
    const { doc, sc } = open(RP14_2 + RP14_1);
    expectLinked(doc);
    expect(sc.setup.simulationType).toBe('STATIC');
    expect(radToDeg(sc.position.lat_rad)).toBeCloseTo(4.444, 9);
    expect(radToDeg(sc.position.lon_rad)).toBeCloseTo(102.4533, 9);
    expect(sc.position.alt_m).toBeCloseTo(900 * 0.3048, 6);
    const b = levelBudget(sc);
    expect([b.port, b.rfLevel_dBm, b.inRange]).toEqual(['DIRECT', -120, true]);
    const ev = analysisEvents(doc);
    expect(ev.find((e) => e.label.startsWith('GPS:SETUP:RFPORT'))?.target).toEqual({
      kind: 'field',
      id: 'setup.rfPort',
    });
    expect(ev.find((e) => e.label.startsWith('GPS:FILE:ALM:LOAD'))?.target).toEqual({
      kind: 'window',
      win: 'file',
    });
    expect(ev.find((e) => e.kind === 'run')?.t_s).toBe(0);
    // Sem @stop: o eixo vai até o mínimo de 60 s e a simulação segue rodando.
    expect(timelineEnd(sc)).toBe(60);
    expect(stateAt(sc, 60).running).toBe(true);
  });

  it('14.3: rota de waypoints do banco, sem coordenadas no twin', () => {
    const { doc, sc } = open(RP14_3);
    expectLinked(doc);
    const r = checkRoute(sc);
    expect(r.points.map((p) => p.name)).toEqual(['SFO', 'LAX', 'SAN']);
    expect(r.warnings).toEqual([
      'waypoints do banco do equipamento sem coordenadas no twin: SFO, LAX, SAN',
    ]);
    expect(
      analysisEvents(doc).filter((e) => e.target?.kind === 'window' && e.target.win === 'route'),
    ).toHaveLength(4);
  });

  it('14.4: trajetória', () => {
    const { doc, sc } = open(RP14_4);
    expectLinked(doc);
    expect([sc.setup.simulationType, sc.files.nmea]).toEqual(['TRAJECTORY', 'short.nme']);
  });
});

describe('S01 na aba Análise', () => {
  const doc = parseScript(S01);
  const sc = loadScript(newSession(), S01).session.scenario;

  it('eventos da configuração e da primeira execução, ligados ao script e à réplica', () => {
    expectLinked(doc);
    const ev = analysisEvents(doc);
    const runLine = ev.find((e) => e.kind === 'run')?.line ?? 0;
    expect(ev.filter((e) => e.kind === 'run')).toHaveLength(1);
    expect(ev.every((e) => (e.line < runLine ? e.t_s === null : e.t_s !== null))).toBe(true);
    // Ações por SV da parte E usam ${PRN} (entrada do operador): alvo na janela SV PRN.
    const svprn = ev.filter((e) => e.label.startsWith('GPS:SVPR:GPS:SAT '));
    expect(svprn.length).toBeGreaterThan(0);
    expect(svprn.every((e) => e.target?.kind === 'window' && e.target.win === 'svprn')).toBe(true);
  });

  it('estado, eixo e orçamento calculados sem erro', () => {
    const end = timelineEnd(sc);
    expect(end).toBeGreaterThanOrEqual(60);
    for (const t of [0, end / 2, end]) expect(stateAt(sc, t).rfLevel_dBm).toBeLessThan(-60);
    expect(levelBudget(sc).range_dBm[0]).toBeLessThan(levelBudget(sc).range_dBm[1]);
    expect(() => checkRoute(sc)).not.toThrow();
  });
});
