// Orçamento de nível de RF (01-equipamento.md, seção 2): nível programado, faixa da porta com as
// perdas (D17), composto por número de SVs, nível na antena pelo acoplador e níveis por SV com os
// offsets de amplitude. Interpretação provisória D17: RF Level é nível por SV.
import { info } from '../model/load';
import { d17LossForPort, d17ShiftedRange } from '../quirks';
import type { Scenario } from './types';

/** Acoplamento típico do acoplador em 1575,42 MHz (OP 7-3). */
export const COUPLING_DB = 21.5;

export interface LevelBudget {
  port: Scenario['setup']['rfPort'];
  rfLevel_dBm: number;
  /** Perda considerada na porta (D17). */
  loss_dB: number;
  /** Faixa aceita para RF Level com as perdas (D17). */
  range_dBm: [number, number];
  inRange: boolean;
  /** Composto na saída para N SVs no mesmo nível: RF Level + 10 log10 N. */
  composite_dBm: (n: number) => number;
  /** Na antena pelo acoplador (porta COUPLER): RF Level - cabo do acoplador - acoplamento. */
  atAntenna_dBm: number | null;
}

export function levelBudget(sc: Scenario, rfLevel_dBm = sc.setup.rfLevel_dBm): LevelBudget {
  const port = sc.setup.rfPort;
  const base = info('GPS:SET:RFLeVel').params[0]?.range_by_port?.[port] ?? [0, 0];
  const range = d17ShiftedRange(base, port, sc.io);
  return {
    port,
    rfLevel_dBm,
    loss_dB: d17LossForPort(port, sc.io),
    range_dBm: range,
    inRange: rfLevel_dBm >= range[0] && rfLevel_dBm <= range[1],
    composite_dBm: (n) => rfLevel_dBm + 10 * Math.log10(n),
    atAntenna_dBm: port === 'COUPLER' ? rfLevel_dBm - sc.io.couplerCable_dB - COUPLING_DB : null,
  };
}
