import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getIndex } from '../core/model/load';
import { parseDiscrepancies } from './discrepancies';
import { buildReference, categories, filterReference } from './reference';

const md = readFileSync(resolve(import.meta.dirname, '../../docs/04-discrepancias.md'), 'utf8');
const ref = buildReference(getIndex(), parseDiscrepancies(md));
const get = (h: string) => {
  const e = ref.find((x) => x.header === h);
  if (!e) throw new Error(h);
  return e;
};

describe('referência de comandos', () => {
  it('cobre os 233 comandos', () => {
    expect(ref).toHaveLength(233);
    expect(categories(ref)).toContain('svprn');
  });

  it('formas, faixas, unidades e discrepâncias', () => {
    const rflv = get('GPS:SET:RFLeVel');
    expect(rflv.shortHeader).toBe('GPS:SET:RFLV');
    expect(rflv.params[0]?.range).toBe('DIRECT -155..-93; COUPLER -130..-68');
    expect(rflv.discrepancies[0]?.id).toBe('D17');
    expect(rflv.discrepancies[0]?.provisional).toMatch(/Por SV/);
    expect(get('GPS:ROUT:EDIT').params[0]?.range).toBe('1..10000 (twin: 1..9999)');
    expect(get('GPS:FILe:KML:MaxVELocity').params[0]?.range).toBe('0..1118 mph; 0..1800 km/h');
    expect(get('GPS:SET:GNSS').params[0]?.range).toBe('GPS | GALILEO | GAL+GPS');
    expect(get('GPS:SET:DATe').params[0]?.range).toBe('formato mm/dd/yyyy');
    expect(get('GPS:SIM:LATitude').params[0]?.range).toBe('graus decimais com sinal');
    expect(get('GPS:SIM:ALTitude?').params[0]?.range).toBe('unidade opcional');
    expect(get('GPS:SET:MaxVELocity').params[0]?.unit).toBe('conforme modo de unidades');
    expect(get('GPS:SVPR:GPS:SATellite').params[7]?.optional).toBe(true);
    expect(get('GPS:SIMU:SPeeD?').emittedAs).toBe('GPS:SIM:SPD?');
    expect(get('GPS:SET:CHAN:SBAS').params[0]?.notes).toBe('');
    expect(get('GPS:ROUT:DISPlay?').returns).toMatch(/csv/);
    expect(get('*RST').emitAllowed).toBe(false);
    expect(get('GPS:CAL:RLCV:VALue').params[0]?.range).toBe('');
  });

  it('discrepância ausente da tabela', () => {
    const r = buildReference(getIndex(), []);
    expect(r.find((x) => x.header === 'GPS:SET:RFLeVel')?.discrepancies[0]?.divergence).toMatch(/sem entrada/);
  });

  it('filtros', () => {
    expect(filterReference(ref, { text: 'rflv' }).map((e) => e.header)).toEqual(['GPS:SET:RFLeVel', 'GPS:SET:RFLeVel?']);
    expect(filterReference(ref, { text: 'D25' }).map((e) => e.header)).toEqual(['GPS:FILe:KML:SamplingTIMe']);
    expect(filterReference(ref, { category: 'svprn', kind: 'set' })).toHaveLength(2);
    expect(filterReference(ref, { verifiedOnly: true })).toHaveLength(0);
    expect(filterReference(ref, { withDiscrepancyOnly: true }).length).toBeGreaterThan(20);
    expect(filterReference(ref, {})).toHaveLength(233);
  });
});
