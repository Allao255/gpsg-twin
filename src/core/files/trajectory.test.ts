import { describe, expect, it } from 'vitest';
import { radToDeg } from '../geo';
import { checkSentence, detectTrajectory, nmeaChecksum, parseTrajectory } from './trajectory';

// Exemplos do manual de operação (OP D-2 e D-3).
const GDT = `Notes,Date,Time,Latitude,Longitude,Alt,Desc
$GDT,20000101,000144.00,38.9425699612859,-94.7561817577427,0.000000,3D,*16
$GDT,20000101,000145.00,38.9425695029864,-94.7561783124509,-0.000004,3D,*3F
$GDT,20000101,000146.00,38.9425681280874,-94.7561679765759,-0.000018,3D,*34
$GDT,20000101,000147.00,38.9425658365869,-94.7561507501185,-0.000039,3D,*39
`;
const NMEA = `$GPGGA,150923.000,3856.4506,N,09445.2627,W,1,07,1.1,332.2,M,-30.1,M,,0000*68
$GPGSV,3,1,11,29,65,303,50,05,63,046,52,26,36,124,45,02,31,082,49*73
$GPGSV,3,2,11,25,25,230,43,15,24,164,47,21,19,285,40,12,11,198,40*7B
$GPGSV,3,3,11,10,08,049,40,30,06,321,41,18,04,230,36*40
$GPRMC,150923.000,A,3856.4506,N,09445.2627,W,0.09,154.82,290113,,,A*79
`;

/** Sentença com checksum calculado. */
const s = (body: string): string => `$${body}*${nmeaChecksum(body)}`;

describe('checksum', () => {
  it('confere os exemplos do manual', () => {
    for (const l of [...GDT.split('\n').slice(1), ...NMEA.split('\n')].filter((x) => x !== ''))
      expect(checkSentence(l), l).toHaveProperty('body');
  });

  it('rejeita checksum errado e sentença sem checksum', () => {
    expect(checkSentence('$GPGGA,1*00')).toEqual({
      error: expect.stringContaining('checksum 00') as string,
    });
    expect(checkSentence('GPGGA,1')).toHaveProperty('error');
  });
});

describe('detectTrajectory', () => {
  it('formatos', () => {
    expect(detectTrajectory(GDT)).toBe('GDT');
    expect(detectTrajectory(NMEA)).toBe('NMEA');
    expect(detectTrajectory('xyz')).toBeNull();
  });
});

describe('parseTrajectory', () => {
  it('GDT do manual: 4 pontos a 1 Hz, datados', () => {
    const t = parseTrajectory(GDT);
    expect(t.diagnostics).toEqual([]);
    expect(t.format).toBe('GDT');
    expect(t.dated).toBe(true);
    expect(t.points).toHaveLength(4);
    expect(t.period_s).toBe(1);
    expect(new Date((t.points[0]?.t_s ?? 0) * 1000).toISOString()).toBe('2000-01-01T00:01:44.000Z');
    expect(radToDeg(t.points[0]?.lat_rad ?? 0)).toBeCloseTo(38.9425699612859, 12);
    expect(t.points[1]?.alt_m).toBe(-0.000004);
  });

  it('NMEA do manual: GGA e RMC na mesma época viram um ponto, altitude elipsoidal', () => {
    const t = parseTrajectory(NMEA);
    expect(t.diagnostics).toEqual([]);
    expect(t.points).toHaveLength(1);
    const p = t.points[0];
    expect(new Date((p?.t_s ?? 0) * 1000).toISOString()).toBe('2013-01-29T15:09:23.000Z');
    expect(radToDeg(p?.lat_rad ?? 0)).toBeCloseTo(38 + 56.4506 / 60, 12);
    expect(radToDeg(p?.lon_rad ?? 0)).toBeCloseTo(-(94 + 45.2627 / 60), 12);
    expect(p?.alt_m).toBeCloseTo(302.1, 9);
    expect(t.period_s).toBeNull();
  });

  it('NMEA só com GGA: sem data; RMC antes de GGA; ano de dois dígitos', () => {
    const gga = parseTrajectory(
      [
        s('GPGGA,000001,0100.0,S,00100.0,E,1,5,1,10,M,,M,,'),
        s('GPGGA,000002,0100.0,S,00100.0,E,1,5,1,,M,,M,,'),
      ].join('\n'),
    );
    expect(gga.dated).toBe(false);
    expect(gga.points.map((p) => p.t_s)).toEqual([1, 2]);
    expect(gga.points[0]?.alt_m).toBe(10);
    expect(gga.points[1]?.alt_m).toBeNull();
    expect(gga.diagnostics.map((d) => d.message)).toEqual([
      'NMEA sem RMC: a data vem do Setup (OP D-3)',
    ]);
    const rmc = parseTrajectory(
      [
        s('GNRMC,120000,A,0100.0,N,00100.0,W,0,0,311299,,'),
        s('GNGGA,120000,0100.0,N,00100.0,W,1,5,1,7,M,1,M,,'),
      ].join('\n'),
    );
    expect(new Date((rmc.points[0]?.t_s ?? 0) * 1000).toISOString()).toBe(
      '1999-12-31T12:00:00.000Z',
    );
    expect(rmc.points[0]?.alt_m).toBe(8);
  });

  it('linhas inválidas viram aviso; ordem dos instantes', () => {
    const t = parseTrajectory(
      [
        s('GPGGA,000002,0100.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
        '$GPGGA,1*00',
        s('GPGGA,xx,0100.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
        s('GPGGA,000003,0100.0,N,00100.0,E,0,5,1,10,M,0,M,,'),
        s('GPGGA,000003,9960.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
        s('GPRMC,000003,V,0100.0,N,00100.0,E,0,0,010120,,'),
        s('GPRMC,000003,A,0100.0,N,00100.0,E,0,0,0101,,'),
        s('GPVTG,1,2'),
        s('GPGGA,000001,0100.0,N,00100.0,X,1,5,1,10,M,0,M,,'),
        s('GPGGA,000001,0100.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
      ].join('\n'),
    );
    const msgs = t.diagnostics.map((d) => d.message);
    expect(msgs).toEqual([
      'checksum 00, calculado 4B',
      'GGA: hora inválida',
      'GGA sem fix (qualidade 0); ignorada',
      'GGA: latitude ou longitude inválida',
      'RMC com status V (inválido); ignorada',
      'RMC: posição ou data inválida',
      'GGA: latitude ou longitude inválida',
      'NMEA sem RMC: a data vem do Setup (OP D-3)',
      'instante não crescente no ponto 2',
    ]);
    expect(t.points.map((p) => p.t_s)).toEqual([2, 1]);
  });

  it('GDT com linhas inválidas', () => {
    const t = parseTrajectory(
      [
        s('GDT,20000101,000144.00,1,2,3,3D,'),
        s('GPGGA,000001,0100.0,N,00100.0,E,1,5,1,10,M,0,M,,'),
        s('GDT,2000011,000145.00,1,2,3,3D,'),
        s('GDT,20000101,000146.00,95,2,3,3D,'),
      ].join('\n'),
    );
    expect(t.points).toHaveLength(1);
    expect(t.diagnostics.map((d) => d.message)).toEqual([
      'sentença GPGGA em arquivo GDT',
      'campos de data, hora ou posição inválidos',
      'latitude ou longitude fora da faixa',
    ]);
  });

  it('não reconhecida ou vazia', () => {
    expect(parseTrajectory('abc').diagnostics[0]?.severity).toBe('error');
    expect(parseTrajectory('Notes,Date\n$GDT,1*00').diagnostics.at(-1)?.message).toMatch(
      /nenhum ponto/,
    );
  });
});
