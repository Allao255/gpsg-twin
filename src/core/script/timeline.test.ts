import { describe, expect, it } from 'vitest';
import { parseScript } from './parse';
import { timeline } from './timeline';

describe('linha do tempo', () => {
  it('lista eventos com horário relativo ao @run', () => {
    const doc = parseScript(
      '@errcheck on\n@set A 1\nGPS:SET:RFLV -120\n@pause p\n@run\n@at 10\nGPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0,3600\nGPS:SIM:LAT?\n@bogus\n@stop',
    );
    const ev = timeline(doc);
    expect(ev.map((e) => [e.kind, e.tRun, e.exact])).toEqual([
      ['command', null, true],
      ['pause', null, true],
      ['run', null, false],
      ['at', 0, true],
      ['command', 10, true],
      ['query', 10, true],
      ['stop', 10, true],
    ]);
    expect(ev[4]?.header).toBe('GPS:SVPR:GPS:SATellite');
    expect(timeline(parseScript('GPS:NADA 1'))[0]?.header).toBeNull();
  });
});
