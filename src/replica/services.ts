// Serviços exibidos na janela Simulation conforme GNSS e portadora (OP 3-3).
import type { EnumValue } from '../core/model/load';

type Gnss = EnumValue<'GPS:SET:GNSS', 'gnss'>;

const GPS: Readonly<Record<string, string>> = {
  L1: 'C/A, Pseudo P(Y)',
  'L1 no P(y)': 'C/A',
  L1C: 'L1C',
  L2: 'L2C, Pseudo P(Y)',
  L2C: 'L2C',
  L5: 'SoL',
  'L1/E1': 'C/A, Pseudo P(Y)',
  'L5/E5': 'SoL',
};

const GAL: Readonly<Record<string, string>> = {
  E1: 'I/NAV, Pseudo-G/NAV',
  E5: 'I/NAV, F/NAV',
  E5A: 'I/NAV, F/NAV',
  'L1/E1': 'I/NAV, Pseudo-G/NAV',
  'L5/E5': 'I/NAV, F/NAV',
};

/** Portadora e serviços por aba (GPS ou Galileo) da janela Simulation. */
export function servicesFor(
  gnss: Gnss,
  carrierLabel: string,
  tab: 'GPS' | 'GAL',
): { carrier: string; services: string } {
  const active = tab === 'GPS' ? gnss !== 'GALILEO' : gnss !== 'GPS';
  if (!active) return { carrier: '', services: '' };
  const table = tab === 'GPS' ? GPS : GAL;
  const carrier =
    gnss === 'GAL+GPS'
      ? (carrierLabel.split('/')[tab === 'GPS' ? 0 : 1] ?? carrierLabel)
      : carrierLabel;
  return { carrier, services: table[carrierLabel] ?? '' };
}
