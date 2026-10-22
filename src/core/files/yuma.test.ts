import { describe, expect, it } from 'vitest';
import { parseYuma } from './yuma';

// Exemplo do manual de operação (OP D-1).
const BLOCK = (
  prn: string,
  week = '799',
): string => ` ******** Week ${week} almanac for PRN-${prn} ********
ID:                         ${prn}
Health:                     000
Eccentricity:               0.3730297089E-002
Time of Applicability(s): 61440.0000
Orbital Inclination(rad):   0.9613649345
Rate of Right Ascen(r/s): -0.7863184676E-008
SQRT(A) (m 1/2):            5153.619629
Right Ascen at Week(rad):   0.9558857469E+000
Argument of Perigee(rad):   0.444257464
Mean Anom(rad):            -0.1754657556E+001
Af0(s):                    -0.1144409180E-004
Af1(s/s):                   0.0000000000E+000
week:                        ${week}
`;

describe('parseYuma', () => {
  it('bloco do manual', () => {
    const a = parseYuma(BLOCK('01'));
    expect(a.diagnostics).toEqual([]);
    expect(a.weeks).toEqual([799]);
    expect(a.entries).toEqual([
      {
        prn: 1,
        health: 0,
        eccentricity: 0.003730297089,
        toa_s: 61440,
        inclination_rad: 0.9613649345,
        rateOfRightAscen_rps: -7.863184676e-9,
        sqrtA: 5153.619629,
        rightAscenAtWeek_rad: 0.9558857469,
        argOfPerigee_rad: 0.444257464,
        meanAnomaly_rad: -1.754657556,
        af0_s: -1.14440918e-5,
        af1_sps: 0,
        week: 799,
      },
    ]);
  });

  it('vários PRNs em ordem; repetido, incompleto e inválido', () => {
    const text = [
      BLOCK('05'),
      BLOCK('02'),
      BLOCK('05'),
      BLOCK('07').replace(/^Health:.*$/m, ''),
      BLOCK('09').replace('Af1(s/s):                   0.0000000000E+000', 'Af1(s/s): x'),
      BLOCK('40', '1823'),
      'lixo solto',
    ].join('\n');
    const a = parseYuma(text);
    expect(a.entries.map((e) => e.prn)).toEqual([2, 5, 40]);
    expect(a.weeks).toEqual([799]);
    expect(a.diagnostics.map((d) => d.message)).toEqual([
      'PRN 5 repetido; ignorado',
      'bloco sem health; ignorado',
      'Af1(s/s): valor inválido',
      'bloco sem af1_sps; ignorado',
      'linha fora de bloco de PRN',
      'PRN 40 fora de 1 a 32',
    ]);
  });

  it('semanas diferentes e arquivo vazio', () => {
    expect(parseYuma(BLOCK('01') + BLOCK('02', '800')).diagnostics[0]?.message).toMatch(/799, 800/);
    expect(parseYuma('').diagnostics[0]?.severity).toBe('error');
  });
});
