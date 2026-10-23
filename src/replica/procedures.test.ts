// Critério de aceite do M3: os procedimentos 4.1.2, 4.1.3 e 4.1.4 do manual de operação,
// executados na réplica, geram scripts equivalentes aos do capítulo 14 do manual remoto, com as
// correções conhecidas (grafias D05 e D06, TRUN trocado por @run); carregar esses scripts de volta
// reproduz as mesmas telas.
//
// Os exemplos do capítulo 14 não definem o modo de unidades; são lidos em IMPERIAL, unidade das
// faixas do RP para rota (ft, ft/min, mph, ft/s²). Em SI os valores de 14.3 ficariam fora de faixa
// (D04).
import { describe, expect, it } from 'vitest';
import { scenarioFromScript } from '../core/scenario/from-script';
import type { Scenario } from '../core/scenario/types';
import { applyKnownCorrections } from '../core/script/correct';
import { RP14_1, RP14_2, RP14_3, RP14_4 } from './rp14.test-util';
import { parseScript } from '../core/script/parse';
import { displayValue, FIELDS } from './fields';
import { formToPoint, newRouteForm, routeRows } from './route-form';
import {
  loadScript,
  newSession,
  routeInsert,
  routeSaveAs,
  run,
  sessionScript,
  setAlmanac,
  setField,
  setFile,
  stop,
  type ReplicaSession,
  type Result,
} from './session';

function must(r: Result): ReplicaSession {
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

function fields(s: ReplicaSession, values: [string, string][]): ReplicaSession {
  return values.reduce((acc, [id, v]) => must(setField(acc, id, v)), s);
}

/** Passos 1 a 5 e 7 comuns aos três procedimentos (Setup Simulation e I/O). */
function commonSetup(simulation: string, clock: string): ReplicaSession {
  return fields(newSession(), [
    ['setup.units', 'Imperial'],
    ['setup.gnss', 'GPS'],
    ['setup.carrier', 'L1'],
    ['setup.sbas', 'Off'],
    ['setup.simulationType', simulation],
    ['setup.rfPort', 'Direct'],
    ['setup.digitalNoise', 'On'],
    ['setup.fading', 'None'],
    ['setup.prnSignal', 'Fixed'],
    ['setup.positionSource', 'User'],
    ['setup.clock', clock],
    ['setup.rfLevel', '-120'],
    ['io.coupler', '0'],
    ['io.couplerCable', '0'],
    ['io.directCable', '0'],
    ['setup.extRef', 'OFF'],
    ['setup.referenceSource', 'INT'],
    ['setup.triggerSource', 'Auto'],
  ]);
}

function reference(text: string): { scenario: Scenario; assigned: string[]; headers: Set<string> } {
  const corrected = applyKnownCorrections(`GPS:SET:UNIT IMPERIAL\n${text}`).text;
  const doc = parseScript(corrected);
  expect(doc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const r = scenarioFromScript(doc);
  const headers = new Set(
    doc.lines.flatMap((l) =>
      l.type === 'command' && l.command.info ? [l.command.info.header as string] : [],
    ),
  );
  return { scenario: r.scenario, assigned: r.assigned.filter((p) => p !== 'setup.units'), headers };
}

function at(o: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);
}

function normalize(v: unknown, path: string): unknown {
  if (path === 'route.saveAs' && typeof v === 'string') return v.replace(/^twin_/, '');
  return v;
}

/** Equivalência: valores do cenário nos caminhos definidos pelo exemplo do capítulo 14. */
function expectEquivalent(replica: Scenario, ref: ReturnType<typeof reference>): void {
  for (const path of ref.assigned) {
    const a = normalize(at(replica, path), path);
    const b = normalize(at(ref.scenario, path), path);
    expect(JSON.parse(JSON.stringify(a, round)), path).toEqual(
      JSON.parse(JSON.stringify(b, round)),
    );
  }
}

const round = (_k: string, v: unknown): unknown =>
  typeof v === 'number' ? Number(v.toPrecision(10)) : v;

/** Mesmas telas: campos configurados pelo exemplo exibem o mesmo texto; mesma tabela de rota. */
function expectSameScreens(replica: ReplicaSession, refText: string): void {
  const ref = reference(refText);
  const loaded = loadScript(newSession(), sessionScript(replica).text).session.scenario;
  const fromRef = loadScript(
    newSession(),
    applyKnownCorrections(`GPS:SET:UNIT IMPERIAL\n${refText}`).text,
  ).session.scenario;
  for (const f of FIELDS.filter((x) => x.header && ref.headers.has(x.header))) {
    expect(displayValue(f, loaded), f.id).toBe(displayValue(f, fromRef));
  }
  expect(routeRows(loaded)).toEqual(routeRows(fromRef));
}

function emitted(s: ReplicaSession): Scenario {
  const text = sessionScript(s).text;
  const doc = parseScript(text);
  expect(doc.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  return scenarioFromScript(doc).scenario;
}

describe('procedimento 4.1.2: simulação estática básica', () => {
  // Passo 5: Clock = Internal não tem equivalente remoto (D12); usado User setting, como em 14.1.
  let s = commonSetup('Static', 'User setting');
  s = fields(s, [
    ['setup.date', 'Apr 14, 2013'],
    ['setup.time', '11:11:11'],
  ]);
  // Passo 6: File, Almanacs, Load (14.2).
  s = must(setAlmanac(s, { kind: 'file', name: 'Week648.alm' }));
  // Passo 9: PVT.
  s = fields(s, [
    ['position.lat', '4.444 N'],
    ['position.lon', '102.4533 E'],
    ['position.alt', '900'],
  ]);
  // Passos 10 e 11: RUN e STOP.
  const final = must(stop(must(run(s))));

  it('Internal aparece desabilitado com o motivo', () => {
    const r = setField(final, 'setup.clock', 'Internal');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/sem comando remoto/);
  });

  // 14.2 antes de 14.1: a carga do almanaque é feita antes de iniciar a simulação (RP 14-1).
  it('script equivalente a 14.2 seguido de 14.1', () => {
    expectEquivalent(emitted(final), reference(RP14_2 + RP14_1));
  });

  it('carregar 14.1 de volta reproduz as telas', () => {
    expectSameScreens(final, RP14_2 + RP14_1);
  });
});

describe('procedimento 4.1.3: simulação dinâmica básica', () => {
  let s = commonSetup('Dynamic', 'User setting');
  s = fields(s, [
    ['setup.date', '04/14/2013'],
    ['setup.time', '11:11:11'],
  ]);
  // Passo 6: Almanacs, Load Default.
  s = must(setAlmanac(s, { kind: 'default' }));
  // Passos 8 a 13: Route, Add, waypoint do banco, Next, Route Edit, Done.
  for (const code of ['SFO', 'LAX', 'SAN']) {
    const form = {
      ...newRouteForm(s.scenario, { code }),
      climb: '500',
      speed: '500',
      accel: '100',
      radius: '5000',
    };
    const p = formToPoint(s.scenario, form);
    if ('error' in p) throw new Error(p.error);
    s = must(routeInsert(s, p.point));
  }
  // Passo 14: Route, Manage, Save (prefixo twin_ obrigatório).
  s = must(routeSaveAs(s, 'California'));
  const final = must(stop(must(run(s))));

  it('arquivo gravado no equipamento leva o prefixo twin_', () => {
    expect(final.scenario.route.saveAs).toBe('twin_California');
    expect(sessionScript(final).text).toContain('GPS:ROUT:SAV "twin_California"');
  });

  it('script equivalente a 14.3', () => {
    expectEquivalent(emitted(final), reference(RP14_3));
  });

  it('carregar 14.3 de volta reproduz as telas', () => {
    expectSameScreens(final, RP14_3);
  });
});

describe('procedimento 4.1.4: simulação de trajetória básica', () => {
  let s = commonSetup('Trajectory', 'User setting');
  s = must(setAlmanac(s, { kind: 'default' }));
  // Passos 8 a 11 (gravação pelo GPS RX) não têm comando remoto de parada documentado (D15).
  // Passos 12 a 14: File, Trajectory, Load.
  s = must(setFile(s, 'nmea', 'short.nme'));
  const final = must(stop(must(run(s))));

  it('script equivalente a 14.4', () => {
    expectEquivalent(emitted(final), reference(RP14_4));
  });

  it('carregar 14.4 de volta reproduz as telas', () => {
    expectSameScreens(final, RP14_4);
  });
});
