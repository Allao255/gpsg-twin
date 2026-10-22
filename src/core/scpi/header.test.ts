import { describe, expect, it } from 'vitest';
import { levenshtein, resolveHeader, suggest } from './header';

function header(h: string): string | null {
  const r = resolveHeader(h);
  return r.ok ? r.info.header : null;
}

describe('resolução de cabeçalho', () => {
  it('aceita formas curta e longa, sem diferenciar caixa', () => {
    expect(header('GPS:SET:CARR')).toBe('GPS:SET:CARRier');
    expect(header('gps:set:carrier')).toBe('GPS:SET:CARRier');
    expect(header('GPS:SET:CARR?')).toBe('GPS:SET:CARRier?');
    expect(header(':GPS:SET:CARR')).toBe('GPS:SET:CARRier');
  });

  it('funde SET e SETUP (forma longa de SETup)', () => {
    expect(header('GPS:SETUP:RFPORT')).toBe('GPS:SET:RFPoRt');
    expect(header('GPS:SET:RFPORT?')).toBe('GPS:SET:RFPoRt?');
    expect(header('GPS:SETUP:CCAB')).toBe('GPS:SETup:CouplerCABle');
    expect(header('GPS:SET:CCAB')).toBe('GPS:SETup:CouplerCABle');
  });

  it('aceita aliases do modelo', () => {
    expect(header(':SYST:ERR?')).toBe(':SYSTem:ERRor?');
    expect(header(':SYSTEM:ERROR?')).toBe(':SYSTem:ERRor?');
    expect(header('GPS:SET:CHAN:AVAL?')).toBe('GPS:SET:CHAN:AVAILable?');
    expect(header('GPS:SET:CHAN:AVAIL?')).toBe('GPS:SET:CHAN:AVAILable?');
    expect(header('GPS:GPSR:ASATELLITE?')).toBe('GPS:GPSR:ActiveSATellite?');
  });

  it('comandos comuns e GPS:?', () => {
    expect(header('*idn?')).toBe('*IDN?');
    expect(header('GPS:?')).toBe('GPS:?');
  });

  it('diferencia consulta e ajuste', () => {
    const q = resolveHeader('GPS:SIM:TRUN');
    expect(q.ok && q.info.header).toBe('GPS:SIM:ToggleRUN');
    const noSet = resolveHeader('GPS:SIM:LAT');
    expect(noSet.ok).toBe(true);
    const r = resolveHeader('GPS:SIM:ETIM');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('no-set-form');
    const r2 = resolveHeader('GPS:SIM:TO');
    expect(!r2.ok && r2.reason).toBe('no-set-form');
    const r3 = resolveHeader('GPS:ROUT:CLR?');
    expect(!r3.ok && r3.reason).toBe('no-query-form');
  });

  it('rejeita grafias fora do modelo com discrepância', () => {
    for (const [h, d] of [
      ['GPS:SET:PORT', 'D05'],
      ['GPS:SET:PORT?', 'D05'],
      ['GPS:SETUP:STYPE?', 'D06'],
      ['GPS:FILE:KML:STIME', 'D25'],
      ['GPS:SET:CHAN:SINGLE?', 'D09'],
    ] as const) {
      const r = resolveHeader(h);
      expect(r.ok, h).toBe(false);
      expect(r.quirk?.dRefs, h).toContain(d);
    }
    const port = resolveHeader('GPS:SET:PORT');
    expect(!port.ok && port.suggestion?.header).toBe('GPS:SET:RFPoRt');
  });

  it('aceita SIM:SPD? como SIMU:SPeeD? (D20)', () => {
    const r = resolveHeader('GPS:SIM:SPD?');
    expect(r.ok && r.info.header).toBe('GPS:SIMU:SPeeD?');
    expect(r.quirk?.dRefs).toEqual(['D20']);
    expect(header('GPS:SIMU:SPD?')).toBe('GPS:SIMU:SPeeD?');
  });

  it('sugere o comando mais próximo', () => {
    const r = resolveHeader('GPS:SET:CARX');
    expect(!r.ok && r.suggestion?.header).toBe('GPS:SET:CARRier');
    expect(suggest('ZZZZZZZZZZZZZZZZZZZZZZ')).toBeNull();
    const e = resolveHeader('  ');
    expect(!e.ok && e.reason).toBe('empty');
  });

  it('distância de edição', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'ab')).toBe(2);
  });
});
