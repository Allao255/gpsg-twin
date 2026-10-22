import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatTime,
  mmddyyyy,
  parseDate,
  parseTime,
  withDate,
  withTime,
} from './datetime';

const T = Date.UTC(2013, 7, 10, 13, 51, 23) / 1000;
const DAYS_2013_04_14 = Date.UTC(2013, 3, 14) / 86400000;

const err = (r: object): string => ('error' in r ? String(r.error) : '');

describe('formatação como na tela', () => {
  it('data, hora e mm/dd/aaaa', () => {
    expect(formatDate(T)).toBe('Aug 10, 2013');
    expect(formatTime(T)).toBe('13:51:23');
    expect(mmddyyyy(T)).toBe('08/10/2013');
  });

  it('hora de instante anterior a 1970 continua no intervalo do dia', () => {
    expect(formatTime(-1)).toBe('23:59:59');
  });
});

describe('parseDate', () => {
  it('três formatos aceitos', () => {
    expect(parseDate('04/14/2013')).toEqual({ days: DAYS_2013_04_14 });
    expect(parseDate('4/14/2013')).toEqual({ days: DAYS_2013_04_14 });
    expect(parseDate('2013-04-14')).toEqual({ days: DAYS_2013_04_14 });
    expect(parseDate('Apr 14, 2013')).toEqual({ days: DAYS_2013_04_14 });
    expect(parseDate(' april 14 2013 ')).toEqual({ days: DAYS_2013_04_14 });
  });

  it('formato desconhecido e data inexistente', () => {
    expect(err(parseDate('14.04.2013'))).toMatch(/formato/);
    expect(err(parseDate('02/30/2013'))).toMatch(/inexistente/);
    expect(err(parseDate('2013-13-01'))).toMatch(/inexistente/);
    expect(err(parseDate('Foo 10, 2013'))).toMatch(/inexistente/);
  });
});

describe('parseTime', () => {
  it('hh:mm:ss e hh:mm', () => {
    expect(parseTime('11:11:11')).toEqual({ seconds: 40271 });
    expect(parseTime('7:05')).toEqual({ seconds: 25500 });
  });

  it('formato e faixa', () => {
    expect(err(parseTime('11h11'))).toMatch(/formato/);
    expect(err(parseTime('24:00:00'))).toMatch(/inválida/);
    expect(err(parseTime('10:60'))).toMatch(/inválida/);
    expect(err(parseTime('10:00:60'))).toMatch(/inválida/);
  });
});

describe('withDate e withTime', () => {
  it('trocam só a data ou só a hora', () => {
    const d = withDate(T, DAYS_2013_04_14);
    expect(formatDate(d)).toBe('Apr 14, 2013');
    expect(formatTime(d)).toBe('13:51:23');
    const t = withTime(T, 40271);
    expect(formatDate(t)).toBe('Aug 10, 2013');
    expect(formatTime(t)).toBe('11:11:11');
  });
});
