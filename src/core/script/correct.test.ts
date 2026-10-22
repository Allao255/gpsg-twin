import { describe, expect, it } from 'vitest';
import { applyKnownCorrections } from './correct';

describe('correções conhecidas', () => {
  it('troca grafias com alvo e TRUN direto', () => {
    const src = [
      '# exemplo',
      'GPS:SET:PORT DIRECT # porta',
      'GPS:SET:STYPE TRAJECTORY',
      'GPS:FILE:KML:STIME 4 Hz',
      'GPS:SET:CHAN:SINGLE?',
      'GPS:SIM:TRUN',
      '@wait 1',
      'GPS:SIM:TRUN',
      '@run',
      '@stop',
      'GPS:SIM:TRUN',
      '',
    ].join('\n');
    const r = applyKnownCorrections(src);
    expect(r.text.split('\n')).toEqual([
      '# exemplo',
      'GPS:SET:RFPR DIRECT # porta',
      'GPS:SET:STYP TRAJECTORY',
      'GPS:FIL:KML:STIM 4 Hz',
      'GPS:SET:CHAN:SINGLE?',
      '@run',
      '@wait 1',
      '@stop',
      '@run',
      '@stop',
      '@run',
      '',
    ]);
    expect(r.corrections.map((c) => [c.line, c.dRefs.join()])).toEqual([
      [2, 'D05'],
      [3, 'D06'],
      [4, 'D25'],
      [6, ''],
      [8, ''],
      [11, ''],
    ]);
  });
});
