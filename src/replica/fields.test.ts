import { describe, expect, it } from 'vitest';
import { degToRad } from '../core/geo';
import { defaultScenario } from '../core/scenario/defaults';
import type { Scenario } from '../core/scenario/types';
import {
  applyField,
  displayValue,
  field,
  fieldRange,
  fieldsForHeader,
  fieldUnit,
  FIELDS,
  lockReason,
  parseInput,
  type FieldDef,
} from './fields';

function with_(mutate: (s: Scenario) => void): Scenario {
  const s = defaultScenario();
  mutate(s);
  return s;
}

function set(s: Scenario, id: string, text: string): Scenario {
  const f = field(id);
  const r = parseInput(f, s, text);
  if ('error' in r) throw new Error(r.error);
  return applyField(f, s, r.value);
}

function error(f: FieldDef, s: Scenario, text: string): string {
  const r = parseInput(f, s, text);
  return 'error' in r ? r.error : '';
}

describe('catálogo', () => {
  it('ids únicos e campo inexistente', () => {
    expect(new Set(FIELDS.map((f) => f.id)).size).toBe(FIELDS.length);
    expect(() => field('nao.existe')).toThrow(/campo inexistente/);
  });

  it('campos por comando', () => {
    expect(fieldsForHeader('GPS:SET:DATe').map((f) => f.id)).toEqual(['setup.date']);
    expect(fieldsForHeader('GPS:SET:CLOCk').map((f) => f.id)).toEqual(['setup.clock']);
    expect(fieldsForHeader('GPS:SIM:TRUN')).toEqual([]);
  });

  it('todo campo tem valor exibível no cenário padrão', () => {
    const s = defaultScenario();
    for (const f of FIELDS) expect(typeof displayValue(f, s), f.id).toBe('string');
  });

  it('applyField não altera o cenário de origem', () => {
    const s = defaultScenario();
    const n = applyField(field('setup.rfLevel'), s, -100);
    expect(n.setup.rfLevel_dBm).toBe(-100);
    expect(s.setup.rfLevel_dBm).toBe(-120);
  });
});

describe('GNSS e portadora (D11)', () => {
  it('troca de GNSS mantém a portadora quando ela existe na nova lista', () => {
    const s = set(set(defaultScenario(), 'setup.gnss', 'GPS+Galileo'), 'setup.carrier', 'L5/E5');
    expect(displayValue(field('setup.carrier'), s)).toBe('L5/E5');
    // Mesmo token L5/E5, rótulo L5 em GPS.
    const g = set(s, 'setup.gnss', 'GPS');
    expect(displayValue(field('setup.carrier'), g)).toBe('L5');
    expect(g.setup.carrier).toEqual({ command: 'GPS:SET:CARRier', token: 'L5/E5' });
  });

  it('troca de GNSS sem a portadora na nova lista: primeira opção', () => {
    const s = set(set(defaultScenario(), 'setup.gnss', 'Galileo'), 'setup.carrier', 'E5A');
    const g = set(s, 'setup.gnss', 'GPS');
    expect(displayValue(field('setup.carrier'), g)).toBe('L1');
    expect(g.setup.carrier).toEqual({ command: 'GPS:SET:CARRier', token: 'L1/E1' });
  });

  it('Galileo E5A emitida por CaRrierGAl', () => {
    const s = set(set(defaultScenario(), 'setup.gnss', 'Galileo'), 'setup.carrier', 'E5A');
    expect(s.setup.carrier).toEqual({ command: 'GPS:SET:CaRrierGAl', token: 'E5a' });
  });

  it('L1 no P(y) aparece desabilitada com a referência', () => {
    const f = field('setup.carrier');
    const s = defaultScenario();
    expect(f.options?.(s).find((o) => o.value === 'L1 no P(y)')?.disabled).toMatch(/D11/);
    expect(error(f, s, 'L1 no P(y)')).toMatch(/D11/);
    // set direto com opção sem equivalente remoto não altera a portadora.
    expect(applyField(f, s, 'L1 no P(y)').setup.carrier).toEqual(s.setup.carrier);
  });

  it('opções só da UI de Clock e PRN Signal', () => {
    expect(error(field('setup.clock'), defaultScenario(), 'Internal')).toMatch(/D12/);
    expect(error(field('setup.prnSignal'), defaultScenario(), 'Traj File')).toMatch(/D13/);
    expect(error(field('setup.prnSignal'), defaultScenario(), 'Nada')).toMatch(/inexistente/);
  });

  it('enum aceita valor ou rótulo', () => {
    expect(set(defaultScenario(), 'setup.fading', 'VEHICLE').setup.fading).toBe('VEHICLE');
    expect(set(defaultScenario(), 'setup.fading', 'Land Vehicle').setup.fading).toBe('VEHICLE');
  });
});

describe('porta e ruído digital', () => {
  it('Digital Noise acompanha a porta (OP 3-6)', () => {
    const c = set(defaultScenario(), 'setup.rfPort', 'Coupler');
    expect(c.setup.digitalNoise).toBe('OFF');
    expect(set(c, 'setup.rfPort', 'Direct').setup.digitalNoise).toBe('ON');
  });

  it('faixa de RF Level depende da porta e das perdas (D17)', () => {
    const f = field('setup.rfLevel');
    expect(fieldRange(f, defaultScenario())).toEqual({ min: -155, max: -93, unit: 'dBm' });
    const s = with_((x) => {
      x.setup.rfPort = 'COUPLER';
      x.io.coupler_dB = 10;
    });
    const r = fieldRange(f, s);
    expect(r?.max).toBeLessThan(-68);
    expect(error(f, defaultScenario(), '-92')).not.toBe('');
    expect(error(f, defaultScenario(), '-93')).toBe('');
  });
});

describe('travas', () => {
  it('modo: posição só em Static, data e hora só com Clock User, Motion só em Custom', () => {
    const dyn = with_((x) => (x.setup.simulationType = 'DYNAMIC'));
    expect(lockReason(field('position.lat'), dyn, false)).toMatch(/Dynamic/);
    expect(lockReason(field('position.alt'), dyn, false)).toMatch(/Dynamic/);
    expect(lockReason(field('position.lat'), defaultScenario(), false)).toBeNull();
    const gps = with_((x) => (x.setup.clock = 'GPSRX'));
    expect(lockReason(field('setup.date'), gps, false)).toMatch(/User setting/);
    expect(lockReason(field('setup.time'), defaultScenario(), false)).toBeNull();
    expect(lockReason(field('motion.maxVelocity'), defaultScenario(), false)).toMatch(/Custom/);
    const custom = with_((x) => (x.motion.model = 'CUSTOM'));
    expect(lockReason(field('motion.maxVelocity'), custom, false)).toBeNull();
  });

  it('em execução: RF Level livre, travados pelo modelo, demais fora da linha do tempo', () => {
    const s = defaultScenario();
    expect(lockReason(field('setup.rfLevel'), s, true)).toBeNull();
    expect(lockReason(field('io.coupler'), s, true)).toBe('Travado durante a execução');
    expect(lockReason(field('setup.rfPort'), s, true)).toBe('Travado durante a execução');
    expect(lockReason(field('setup.extRef'), s, true)).toMatch(/linha do tempo/);
    expect(lockReason(field('display.latLonFormat'), s, true)).toBeNull();
    expect(lockReason(field('setup.units'), s, true)).toBeNull();
  });
});

describe('exibição', () => {
  it('unidade do campo: por modo, fixa ou nenhuma', () => {
    const s = defaultScenario();
    expect(fieldUnit(field('position.alt'), s)).toBe('ft');
    expect(fieldUnit(field('position.alt'), set(s, 'setup.units', 'SI'))).toBe('m');
    expect(fieldUnit(field('setup.rfLevel'), s)).toBe('dBm');
    expect(fieldUnit(field('setup.gnss'), s)).toBe('');
  });

  it('texto como na tela', () => {
    const s = defaultScenario();
    expect(displayValue(field('setup.date'), s)).toBe('Apr 14, 2013');
    expect(displayValue(field('setup.time'), s)).toBe('11:11:11');
    expect(displayValue(field('position.lat'), s)).toBe('39° 17\' 51.3600" N');
    expect(displayValue(field('position.alt'), s)).toBe('984');
    expect(displayValue(field('setup.rfLevel'), s)).toBe('-120');
    expect(displayValue(field('setup.fading'), s)).toBe('None');
    expect(displayValue(field('channels.gnss'), s)).toBe('');
    expect(displayValue(field('io.coupler'), set(s, 'io.coupler', '3.25'))).toBe('3.3');
  });

  it('enum com valor fora das opções exibe o valor', () => {
    const s = with_((x) => (x.setup.carrier = { command: 'GPS:SET:CaRrierGAl', token: 'E5a' }));
    expect(displayValue(field('setup.carrier'), s)).toBe('E5A');
  });

  it('Motion Custom: exibe limites de fábrica até ser editado', () => {
    const s = with_((x) => (x.motion.model = 'CUSTOM'));
    expect(field('motion.maxLateral').get(s)).toBe(98);
    const e = set(s, 'motion.maxVelocity', '100');
    expect(e.motion.custom).toEqual({
      maxLateral_mps2: 98,
      maxLongitudinal_mps2: 98,
      maxVelocity_mps: 44.704,
    });
    expect(field('motion.maxVelocity').get(e)).toBeCloseTo(44.704, 9);
    expect(set(e, 'motion.maxLateral', '10').motion.custom?.maxLateral_mps2).toBeCloseTo(3.048);
  });
});

describe('entrada', () => {
  it('número em unidade de exibição vira SI', () => {
    expect(set(defaultScenario(), 'position.alt', '900').position.alt_m).toBeCloseTo(274.32, 9);
    const si = set(defaultScenario(), 'setup.units', 'SI');
    expect(set(si, 'position.alt', '900').position.alt_m).toBe(900);
  });

  it('latitude, longitude, data e hora', () => {
    let s = set(defaultScenario(), 'position.lat', '4.444 S');
    s = set(s, 'position.lon', '102 27 11.88 E');
    expect(s.position.lat_rad).toBeCloseTo(degToRad(-4.444), 12);
    expect(s.position.lon_rad).toBeCloseTo(degToRad(102.4533), 9);
    s = set(s, 'setup.date', '2020-02-29');
    s = set(s, 'setup.time', '23:59:58');
    expect(s.setup.userTime_s).toBe(Date.UTC(2020, 1, 29, 23, 59, 58) / 1000);
  });

  it('erros de formato e de faixa do modelo', () => {
    const s = defaultScenario();
    expect(error(field('position.alt'), s, '9e3')).toMatch(/número inválido/);
    expect(error(field('position.alt'), s, '100001')).not.toBe('');
    expect(error(field('position.lat'), s, '91')).toMatch(/±90/);
    expect(error(field('setup.date'), s, 'ontem')).toMatch(/formato/);
    expect(error(field('setup.time'), s, '25:00')).toMatch(/inválida/);
    expect(error(field('io.coupler'), s, '41')).not.toBe('');
    expect(error(field('channels.gnss'), s, '12')).not.toBe('');
  });

  it('Lat/Long Format sem comando: só exibição', () => {
    const f = field('display.latLonFormat');
    const s = set(defaultScenario(), f.id, 'DD.DD');
    expect(s.display.latLonFormat).toBe('DD.DD');
    expect(displayValue(field('position.lat'), s)).toBe('39.297600° N');
  });
});

describe('fieldRange', () => {
  it('faixa convertida para a unidade de exibição', () => {
    const f = field('position.alt');
    expect(fieldRange(f, defaultScenario())).toEqual({ min: -3281, max: 100000, unit: 'ft' });
    const si = with_((x) => (x.setup.units = 'SI'));
    expect(fieldRange(f, si)).toEqual({ min: -1000.049, max: 30480, unit: 'm' });
  });

  it('faixa sem unidade, sem faixa no modelo, campo não numérico', () => {
    const s = defaultScenario();
    expect(fieldRange(field('io.coupler'), s)).toEqual({ min: 0, max: 40, unit: 'dB' });
    expect(fieldRange(field('channels.gnss'), s)).toEqual({ min: 1, max: 11, unit: '' });
    expect(fieldRange(field('motion.maxVelocity'), s)).toBeNull();
    expect(fieldRange(field('setup.gnss'), s)).toBeNull();
    expect(fieldRange(field('display.latLonFormat'), s)).toBeNull();
  });
});
