import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDiscrepancies } from '../docs/discrepancies';
import { getIndex } from './model/load';
import {
  DEFERRED,
  HEADER_QUIRKS,
  d04System,
  d19CleanResponse,
  ENUM_HINTS,
  RANGE_OVERRIDES,
} from './quirks';

const root = resolve(import.meta.dirname, '../..');
const table = parseDiscrepancies(readFileSync(resolve(root, 'docs/04-discrepancias.md'), 'utf8'));
const quirksSource = readFileSync(resolve(import.meta.dirname, 'quirks.ts'), 'utf8');

describe('quirks', () => {
  it('toda discrepância aberta tem tratamento em quirks.ts ou marco em DEFERRED', () => {
    expect(table.length).toBeGreaterThanOrEqual(25);
    for (const d of table.filter((x) => !x.resolved)) {
      const inCode = new RegExp(`\\b${d.id}\\b`).test(
        quirksSource.replace(/DEFERRED[\s\S]*?\};/, ''),
      );
      expect(inCode || d.id in DEFERRED, d.id).toBe(true);
    }
  });

  it('IDs citados no modelo existem na tabela', () => {
    const ids = new Set(table.map((d) => d.id));
    for (const inf of getIndex().infos)
      for (const d of inf.cmd.discrepancies) expect(ids.has(d), `${inf.header} ${d}`).toBe(true);
  });

  it('alvos de quirks existem no modelo', () => {
    const idx = getIndex();
    for (const q of HEADER_QUIRKS)
      if (q.target) expect(idx.byHeader.has(q.target), q.key).toBe(true);
    for (const h of ENUM_HINTS) expect(idx.byHeader.has(h.header)).toBe(true);
    for (const o of RANGE_OVERRIDES)
      expect(idx.byHeader.get(o.header)?.params.some((p) => p.name === o.param)).toBe(true);
  });

  it('modos de unidades', () => {
    expect(d04System('AERO/IMPERIAL')).toEqual({ system: 'IMPERIAL', verified: false });
    expect(d04System('IMPERIAL')).toEqual({ system: 'IMPERIAL', verified: true });
  });

  it('limpeza tolerante de resposta (D19)', () => {
    expect(d19CleanResponse(' "Running" ')).toBe('Running');
    expect(d19CleanResponse("'12.5 °'")).toBe('12.5');
    expect(d19CleanResponse('45.3°')).toBe('45.3');
    expect(d19CleanResponse('"')).toBe('"');
  });
});
