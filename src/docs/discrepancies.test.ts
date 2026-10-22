import { describe, expect, it } from 'vitest';
import { parseDiscrepancies } from './discrepancies';

describe('tabela de discrepâncias', () => {
  it('lê linhas da tabela e da seção Resolvidos', () => {
    const md = [
      '| ID | a | b | c | d |',
      '|---|---|---|---|---|',
      '| D01 | x `a\\|b` | RP 1 | prov | S01 |',
      '## Outra',
      '| nada | |',
      '## Resolvidos',
      '| D02 | y | RP 2 | - | S01 E1 |',
    ].join('\n');
    expect(parseDiscrepancies(md)).toEqual([
      { id: 'D01', divergence: 'x `a|b`', sources: 'RP 1', provisional: 'prov', resolution: 'S01', resolved: false },
      { id: 'D02', divergence: 'y', sources: 'RP 2', provisional: '-', resolution: 'S01 E1', resolved: true },
    ]);
  });
});
