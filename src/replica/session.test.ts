import { describe, expect, it } from 'vitest';
import { degToRad } from '../core/geo';
import type { RoutePoint, UserWaypoint } from '../core/scenario/types';
import {
  channelDefaults,
  importSvList,
  loadScript,
  motionDefaults,
  newSession,
  removeAction,
  routeClear,
  routeDelete,
  routeInsert,
  routeLoop,
  routeMove,
  routeReplace,
  routeSaveAs,
  run,
  sessionScript,
  setAlmanac,
  setField,
  setFile,
  setNameDescription,
  setPrns,
  setTime,
  stop,
  SV_DEFAULT,
  svApply,
  svStateAt,
  toggleImport,
  twinFileName,
  waypointDelete,
  waypointUpsert,
  waypointUse,
  type ReplicaSession,
  type Result,
} from './session';

function must(r: Result): ReplicaSession {
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

function error(r: Result): string {
  return r.ok ? '' : r.error;
}

const running = (t = 0): ReplicaSession => must(setTime(must(run(newSession())), t));

const LEG = { climbRate_mps: 1, speed_mps: 10, accel_mps2: 1, turnRadius_m: 100 };
const wp = (code: string): RoutePoint => ({ kind: 'waypoint', code, ...LEG });
const MCI: UserWaypoint = {
  code: 'MCI',
  icao: 'KMCI',
  name: 'Kansas City Intl',
  city: 'Kansas City',
  state: 'MO',
  lat_rad: degToRad(39.2976),
  lon_rad: degToRad(-94.7139),
  alt_m: 312,
};

describe('campos', () => {
  it('fora de execução altera o cenário', () => {
    const s = must(setField(newSession(), 'setup.rfLevel', '-110'));
    expect(s.scenario.setup.rfLevel_dBm).toBe(-110);
    expect(s.scenario.actions).toEqual([]);
  });

  it('erro de entrada e campo travado', () => {
    expect(error(setField(newSession(), 'setup.rfLevel', 'x'))).toMatch(/número inválido/);
    expect(error(setField(running(), 'io.coupler', '3'))).toBe('Travado durante a execução');
  });

  it('em execução, RF Level vira ação no instante corrente', () => {
    const s = must(setField(running(30), 'setup.rfLevel', '-125'));
    expect(s.scenario.setup.rfLevel_dBm).toBe(-120);
    expect(s.scenario.actions).toEqual([{ t_s: 30, type: 'rfLevel', level_dBm: -125 }]);
    // Mesmo alvo no mesmo instante: substitui.
    const t = must(setField(s, 'setup.rfLevel', '-126'));
    expect(t.scenario.actions).toEqual([{ t_s: 30, type: 'rfLevel', level_dBm: -126 }]);
  });

  it('preferência de exibição em execução não entra na linha do tempo', () => {
    const s = must(setField(running(5), 'display.latLonFormat', 'DD.DD'));
    expect(s.scenario.display.latLonFormat).toBe('DD.DD');
    expect(s.scenario.actions).toEqual([]);
  });
});

describe('RUN, STOP e instante', () => {
  it('estado inválido', () => {
    expect(error(run(running()))).toMatch(/já está rodando/);
    expect(error(stop(newSession()))).toMatch(/não está rodando/);
    expect(error(setTime(newSession(), 5))).toMatch(/RUN/);
    expect(error(setTime(running(), -1))).toMatch(/maior ou igual/);
    expect(error(setTime(running(), Number.NaN))).toMatch(/maior ou igual/);
  });

  it('RUN zera o instante; instante arredondado ao ms', () => {
    expect(running(1.23456).t_s).toBe(1.235);
    const again = must(run(must(stop(running(10)))));
    expect(again.t_s).toBe(0);
  });

  it('STOP: sem ações em t=0 não define fim; senão, o maior entre instante e última ação', () => {
    expect(must(stop(running())).scenario.run.stopAt_s).toBeNull();
    expect(must(stop(running(40))).scenario.run.stopAt_s).toBe(40);
    const s = must(setTime(must(setField(running(50), 'setup.rfLevel', '-121')), 20));
    const stopped = must(stop(s));
    expect(stopped.running).toBe(false);
    expect(stopped.scenario.run.stopAt_s).toBe(50);
  });

  it('ação em t=0 define fim em 0', () => {
    const s = must(setField(running(), 'setup.rfLevel', '-121'));
    expect(must(stop(s)).scenario.run.stopAt_s).toBe(0);
  });
});

describe('ações', () => {
  it('remover: índice inválido', () => {
    expect(error(removeAction(newSession(), 0))).toBe('ação inexistente');
    expect(error(removeAction(newSession(), -1))).toBe('ação inexistente');
  });

  it('remover a última ação parada limpa o fim; em execução mantém', () => {
    const s = must(stop(must(setField(running(10), 'setup.rfLevel', '-121'))));
    expect(must(removeAction(s, 0)).scenario.run.stopAt_s).toBeNull();
    const r = must(setField(running(10), 'setup.rfLevel', '-121'));
    expect(must(removeAction(r, 0)).scenario.actions).toEqual([]);
  });

  it('fim anterior à última ação restante é estendido', () => {
    const s = newSession();
    s.scenario.actions = [
      { t_s: 10, type: 'rfLevel', level_dBm: -121 },
      { t_s: 50, type: 'rfLevel', level_dBm: -122 },
    ];
    s.scenario.run.stopAt_s = 20;
    expect(must(removeAction(s, 0)).scenario.run.stopAt_s).toBe(50);
  });
});

describe('SVs', () => {
  it('estado padrão por constelação', () => {
    const sc = newSession().scenario;
    expect(svStateAt(sc, 'GPS', 5, 0)).toEqual(SV_DEFAULT);
    expect(svStateAt(sc, 'GAL', 5, 0).health).toBe('CONNECTED');
  });

  it('edição em execução vira ação; estado vale a partir do instante', () => {
    const e = { ...SV_DEFAULT, select: 'OFF' as const, doppler_Hz: -50, duration_s: 10 };
    const s = must(svApply(running(30), 'GPS', 5, e));
    expect(s.scenario.actions).toEqual([
      { t_s: 30, type: 'sv', constellation: 'GPS', sv: 5, ...e },
    ]);
    expect(svStateAt(s.scenario, 'GPS', 5, 29).select).toBe('ON');
    expect(svStateAt(s.scenario, 'GPS', 5, 30)).toEqual(e);
    expect(svStateAt(s.scenario, 'GPS', 6, 30)).toEqual(SV_DEFAULT);
    // Outro SV no mesmo instante não substitui.
    const t = must(svApply(s, 'GAL', 5, { ...SV_DEFAULT, health: 'DISCONNECTED' }));
    expect(t.scenario.actions).toHaveLength(2);
    expect(sessionScript(t).text).toContain('GPS:SVPR:GAL:SAT 5,ON,DISCONNECTED');
  });

  it('fora de execução ou fora de faixa', () => {
    expect(error(svApply(newSession(), 'GPS', 5, SV_DEFAULT))).toMatch(/RUN/);
    expect(error(svApply(running(), 'GPS', 5, { ...SV_DEFAULT, doppler_Hz: 6000 }))).not.toBe('');
    expect(error(svApply(running(), 'GPS', 33, SV_DEFAULT))).not.toBe('');
  });

  it('lista de PRNs informada pelo operador', () => {
    const s = must(setPrns(newSession(), 'GPS', '9, 5 13;5'));
    expect(s.svs.GPS.map((x) => x.sv)).toEqual([5, 9, 13]);
    expect(error(setPrns(s, 'GPS', '33'))).toMatch(/1 a 32/);
    expect(error(setPrns(s, 'GPS', '2.5'))).toMatch(/PRN inválido/);
    expect(must(setPrns(s, 'GAL', '36')).svs.GAL.map((x) => x.sv)).toEqual([36]);
    expect(must(setPrns(s, 'GPS', '')).svs.GPS).toEqual([]);
  });

  it('PRNs mantidos preservam elevação e azimute importados', () => {
    const s = must(importSvList(newSession(), 'GPS', '5,45.5,120\n9,10,300'));
    const t = must(setPrns(s, 'GPS', '5 7'));
    expect(t.svs.GPS).toEqual([
      { sv: 5, elevation_deg: 45.5, azimuth_deg: 120 },
      { sv: 7, elevation_deg: null, azimuth_deg: null },
    ]);
  });

  it('importação de SVPR:LIST? de log', () => {
    const text = '"13,12.5,200,0,1\\n5,x,90"\nlixo\n0,1,1\n\n';
    const s = must(importSvList(newSession(), 'GAL', text));
    expect(s.svs.GAL).toEqual([
      { sv: 5, elevation_deg: null, azimuth_deg: 90 },
      { sv: 13, elevation_deg: 12.5, azimuth_deg: 200 },
    ]);
    expect(error(importSvList(newSession(), 'GPS', 'nada'))).toMatch(/nenhuma linha/);
  });
});

describe('rota', () => {
  const two = (): ReplicaSession =>
    must(routeInsert(must(routeInsert(newSession(), wp('SFO'))), wp('LAX')));
  const codes = (s: ReplicaSession): string[] =>
    s.scenario.route.points.map((p) => (p.kind === 'waypoint' ? p.code : p.name));

  it('inserir no fim ou na posição; trava em execução; faixa do modelo', () => {
    expect(codes(must(routeInsert(two(), wp('SAN'), 1)))).toEqual(['SFO', 'SAN', 'LAX']);
    expect(error(routeInsert(running(), wp('SFO')))).toMatch(/Em execução/);
    expect(error(routeInsert(newSession(), { ...wp('SFO'), speed_mps: 1000 }))).not.toBe('');
  });

  it('posição de inserção fora da lista é rejeitada', () => {
    expect(error(routeInsert(two(), wp('SAN'), -1))).toMatch(/posição/);
    expect(error(routeInsert(two(), wp('SAN'), 3))).toMatch(/posição/);
    expect(codes(must(routeInsert(two(), wp('SAN'), 2)))).toEqual(['SFO', 'LAX', 'SAN']);
  });

  it('limite de 9999 pontos (D08)', () => {
    const s = newSession();
    s.scenario.route.points = Array.from({ length: 9999 }, () => wp('SFO'));
    expect(error(routeInsert(s, wp('LAX')))).toMatch(/9999 pontos/);
  });

  it('ponto livre validado pelo modelo', () => {
    const p: RoutePoint = { kind: 'point', name: 'P', lat_rad: 0, lon_rad: 0, alt_m: 0, ...LEG };
    expect(must(routeInsert(newSession(), p)).scenario.route.points).toEqual([p]);
    expect(error(routeInsert(newSession(), { ...p, alt_m: 1e6 }))).not.toBe('');
  });

  it('substituir, apagar, mover', () => {
    expect(codes(must(routeReplace(two(), 1, wp('SAN'))))).toEqual(['SFO', 'SAN']);
    expect(error(routeReplace(two(), 5, wp('SAN')))).toBe('ponto inexistente');
    expect(error(routeReplace(two(), 0, { ...wp('SAN'), turnRadius_m: -1 }))).not.toBe('');
    expect(error(routeReplace(running(), 0, wp('SAN')))).toMatch(/Em execução/);
    expect(codes(must(routeDelete(two(), 0)))).toEqual(['LAX']);
    expect(error(routeDelete(two(), 2))).toBe('ponto inexistente');
    expect(error(routeDelete(running(), 0))).toMatch(/Em execução/);
    expect(codes(must(routeMove(two(), 0, 1)))).toEqual(['LAX', 'SFO']);
    expect(codes(must(routeMove(two(), 1, -1)))).toEqual(['LAX', 'SFO']);
    expect(error(routeMove(two(), 1, 1))).toMatch(/fora da lista/);
    expect(error(routeMove(running(), 0, 1))).toMatch(/Em execução/);
  });

  it('Clear All também descarta o arquivo de rota; loop', () => {
    const s = must(setFile(two(), 'route', 'twin_x.rte'));
    expect(s.scenario.route.points).toEqual([]);
    const c = must(routeClear(must(routeInsert(s, wp('SFO')))));
    expect(c.scenario.route.points).toEqual([]);
    expect(c.scenario.files.route).toBeNull();
    expect(error(routeClear(running()))).toMatch(/Em execução/);
    expect(must(routeLoop(two(), true)).scenario.route.loop).toBe('ON');
    expect(must(routeLoop(two(), false)).scenario.route.loop).toBe('OFF');
    expect(error(routeLoop(running(), true))).toMatch(/Em execução/);
  });

  it('gravar no equipamento com prefixo twin_', () => {
    expect(twinFileName(' rota ')).toBe('twin_rota');
    expect(twinFileName('twin_rota')).toBe('twin_rota');
    expect(must(routeSaveAs(two(), 'rota')).scenario.route.saveAs).toBe('twin_rota');
    expect(must(routeSaveAs(two(), null)).scenario.route.saveAs).toBeNull();
    expect(error(routeSaveAs(two(), ' '))).toBe('nome vazio');
    expect(error(routeSaveAs(running(), 'x'))).toMatch(/Em execução/);
  });
});

describe('waypoints', () => {
  it('incluir, editar com troca de código, apagar', () => {
    const s = must(waypointUpsert(newSession(), MCI));
    expect(s.scenario.userWaypoints).toEqual([MCI]);
    const e = must(waypointUpsert(s, { ...MCI, code: 'KC' }, 'MCI'));
    expect(e.scenario.userWaypoints.map((w) => w.code)).toEqual(['KC']);
    const same = must(waypointUpsert(e, { ...MCI, code: 'KC', alt_m: 0 }, 'KC'));
    expect(same.scenario.userWaypoints).toHaveLength(1);
    expect(same.scenario.userWaypoints[0]?.alt_m).toBe(0);
    expect(must(waypointDelete(same, 'KC')).scenario.userWaypoints).toEqual([]);
    expect(error(waypointDelete(same, 'MCI'))).toBe('waypoint inexistente');
  });

  it('código repetido: Add não sobrescreve, Edit não duplica', () => {
    const s = must(waypointUpsert(must(waypointUpsert(newSession(), MCI)), { ...MCI, code: 'KC' }));
    expect(error(waypointUpsert(s, { ...MCI, alt_m: 0 }))).toMatch(/já existe/);
    expect(error(waypointUpsert(s, { ...MCI, code: 'KC' }, 'MCI'))).toMatch(/já existe/);
    expect(s.scenario.userWaypoints.map((w) => w.code)).toEqual(['MCI', 'KC']);
  });

  it('erros', () => {
    expect(error(waypointUpsert(running(), MCI))).toMatch(/Em execução/);
    expect(error(waypointUpsert(newSession(), { ...MCI, code: ' ' }))).toBe('código vazio');
    expect(error(waypointUpsert(newSession(), { ...MCI, alt_m: 1e6 }))).not.toBe('');
    expect(error(waypointDelete(running(), 'MCI'))).toMatch(/Em execução/);
  });

  it('Use carrega a posição estática; travado em Dynamic', () => {
    const s = must(waypointUpsert(newSession(), MCI));
    const u = must(waypointUse(s, 'MCI'));
    expect(u.scenario.position).toEqual({ lat_rad: MCI.lat_rad, lon_rad: MCI.lon_rad, alt_m: 312 });
    expect(error(waypointUse(s, 'X'))).toBe('waypoint inexistente');
    expect(error(waypointUse(running(), 'MCI'))).toMatch(/Em execução/);
    const d = must(setField(s, 'setup.simulationType', 'Dynamic'));
    expect(error(waypointUse(d, 'MCI'))).toMatch(/OP 3-23/);
  });
});

describe('arquivos e padrões', () => {
  it('arquivos a carregar', () => {
    const s = must(setFile(newSession(), 'nmea', ' short.nme '));
    expect(s.scenario.files.nmea).toBe('short.nme');
    expect(must(setFile(s, 'nmea', null)).scenario.files.nmea).toBeNull();
    expect(error(setFile(s, 'kml', ''))).toBe('nome vazio');
    expect(error(setFile(running(), 'kml', 'a'))).toMatch(/Em execução/);
  });

  it('almanaque', () => {
    const s = must(setAlmanac(newSession(), { kind: 'file', name: ' Week648.alm ' }));
    expect(s.scenario.files.almanac).toEqual({ kind: 'file', name: 'Week648.alm' });
    expect(must(setAlmanac(s, { kind: 'equipment' })).scenario.files.almanac).toEqual({
      kind: 'equipment',
    });
    expect(error(setAlmanac(s, { kind: 'file', name: '' }))).toBe('nome vazio');
    expect(error(setAlmanac(running(), { kind: 'default' }))).toMatch(/Em execução/);
  });

  it('importações do pendrive alternam', () => {
    const s = must(toggleImport(must(toggleImport(newSession(), 'SET')), 'ALM'));
    expect(s.scenario.files.imports).toEqual(['SET', 'ALM']);
    expect(must(toggleImport(s, 'SET')).scenario.files.imports).toEqual(['ALM']);
    expect(error(toggleImport(running(), 'SET'))).toMatch(/Em execução/);
  });

  it('padrões de Motion e Channels', () => {
    const c = must(setField(newSession(), 'motion.model', 'Custom'));
    const e = must(setField(c, 'motion.maxVelocity', '100'));
    expect(e.scenario.motion.custom).not.toBeNull();
    expect(must(motionDefaults(e)).scenario.motion.custom).toBeNull();
    expect(error(motionDefaults(running()))).toMatch(/Em execução/);
    expect(must(channelDefaults(newSession())).scenario.channels).toMatchObject({
      dualGps: 6,
      dualGal: 6,
      dualSbas: 0,
    });
    expect(must(channelDefaults(newSession(), 6)).scenario.channels.dualGps).toBe(3);
    expect(error(channelDefaults(running()))).toMatch(/Em execução/);
  });

  it('nome e descrição', () => {
    const s = must(setNameDescription(newSession(), ' ensaio_1 ', 'texto'));
    expect([s.scenario.name, s.scenario.description]).toEqual(['ensaio_1', 'texto']);
    expect(error(setNameDescription(s, 'Ensaio', ''))).toMatch(/minúsculas/);
  });
});

describe('script', () => {
  it('ida e volta pela réplica', () => {
    let s = must(setField(newSession(), 'setup.rfLevel', '-110'));
    s = must(setField(must(run(s)), 'setup.rfLevel', '-111'));
    s = must(stop(must(setTime(s, 60))));
    const text = sessionScript(s).text;
    expect(text).toContain('@run\nGPS:SET:RFLV -111\n@at 60\n@stop');
    const back = loadScript(newSession(), text);
    expect(back.lostLines).toEqual([]);
    expect(back.session.scenario).toEqual(s.scenario);
    expect(back.session.running).toBe(false);
  });

  it('linhas não representadas, com erro ou de outra execução são marcadas', () => {
    const text = [
      'GPS:SET:RFLV -110', // 1
      'GPS:SET:XYZ 1', // 2: erro
      'GPS:STAT?', // 3: consulta antes do @run, não representada
      '@run', // 4
      '@wait 5', // 5
      'GPS:SET:EREF ON', // 6: em execução, não representado
      '@stop', // 7
      '@run', // 8: segunda execução
      'GPS:SET:RFLV -100', // 9
      '# comentário', // 10
      '@stop', // 11
    ].join('\n');
    const prev = must(setPrns(newSession(), 'GPS', '5'));
    const r = loadScript(prev, text, 'x');
    expect(r.lostLines).toEqual(expect.arrayContaining([2, 6, 8, 9, 11]));
    expect(r.lostLines).not.toContain(1);
    expect(r.lostLines).not.toContain(10);
    expect(r.session.svs.GPS.map((x) => x.sv)).toEqual([5]);
    expect(r.session.scenario.setup.rfLevel_dBm).toBe(-110);
    expect(r.diagnostics.some((d) => d.code === 'multi-run')).toBe(true);
  });
});
