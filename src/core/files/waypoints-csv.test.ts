import { describe, expect, it } from 'vitest';
import { degToRad, radToDeg } from '../geo';
import type { UserWaypoint } from '../scenario/types';
import { splitCsvLine, waypointsFromCsv, waypointsToCsv } from './waypoints-csv';

// Exemplo do manual de operação (OP D-8): colunas A a J, altitude em ft.
const OP_D8 = `NY to RM 01,NA,,TR01,NA,49.0875,-45.3539,7000,0,0
NY to RM 02,NA,,TR02,NA,49.82806,-19.7547,7000,0,0
`;

const MCI: UserWaypoint = {
  code: 'MCI',
  icao: 'KMCI',
  name: 'Kansas City Intl',
  city: 'Kansas City',
  state: 'MO',
  lat_rad: degToRad(39.2976),
  lon_rad: degToRad(-94.7139),
  alt_m: 304.8,
};

describe('splitCsvLine', () => {
  it('aspas, aspas duplicadas e vírgula dentro de campo', () => {
    expect(splitCsvLine('a,"b,c","d ""e""",')).toEqual(['a', 'b,c', 'd "e"', '']);
  });
});

describe('waypointsFromCsv', () => {
  it('exemplo do manual', () => {
    const r = waypointsFromCsv(OP_D8);
    expect(r.diagnostics).toEqual([]);
    expect(r.waypoints.map((w) => [w.code, w.name, w.city, w.state, w.icao])).toEqual([
      ['TR01', 'NY to RM 01', 'NA', '', 'NA'],
      ['TR02', 'NY to RM 02', 'NA', '', 'NA'],
    ]);
    expect(radToDeg(r.waypoints[0]?.lat_rad ?? 0)).toBeCloseTo(49.0875, 12);
    expect(r.waypoints[0]?.alt_m).toBeCloseTo(2133.6, 9);
  });

  it('linhas inválidas, sem código, repetidas e fora de faixa', () => {
    const r = waypointsFromCsv(
      [
        'Nome,Cidade,País,Código,ICAO,Lat,Lon,Alt,UTC,0',
        'A,,,,,1,2,3,0,0',
        'B,,,B1,,1,2,3,0,0',
        'C,,,B1,,1,2,3,0,0',
        'D,,,D1,,1,2,999999,0,0',
        'curta,1,2',
        '',
      ].join('\r\n'),
    );
    expect(r.waypoints.map((w) => w.code)).toEqual(['B1', 'D1']);
    expect(r.diagnostics.map((d) => [d.line, d.code])).toEqual([
      [1, 'file-format'],
      [2, 'file-format'],
      [4, 'file-value'],
      [5, 'file-value'],
      [6, 'file-format'],
    ]);
  });
});

describe('waypointsToCsv', () => {
  it('colunas A a J, altitude em ft (D30), CRLF; ida e volta', () => {
    const r = waypointsToCsv([MCI]);
    expect(r.text).toBe('Kansas City Intl,Kansas City,MO,MCI,KMCI,39.2976,-94.7139,1000,0,0\r\n');
    expect(r.diagnostics.map((d) => d.dRefs)).toEqual([['D30']]);
    const back = waypointsFromCsv(r.text).waypoints[0];
    expect(back).toMatchObject({ code: 'MCI', name: 'Kansas City Intl', state: 'MO' });
    expect(back?.alt_m).toBeCloseTo(304.8, 9);
  });

  it('texto com vírgula ou aspas vai entre aspas, com aviso', () => {
    const r = waypointsToCsv([{ ...MCI, name: 'Kansas City, "Intl"' }]);
    expect(r.text.startsWith('"Kansas City, ""Intl""",')).toBe(true);
    expect(r.diagnostics[0]?.message).toMatch(/entre aspas/);
    expect(waypointsFromCsv(r.text).waypoints[0]?.name).toBe('Kansas City, "Intl"');
  });

  it('lista vazia', () => {
    expect(waypointsToCsv([])).toEqual({ text: '', diagnostics: [] });
  });
});
