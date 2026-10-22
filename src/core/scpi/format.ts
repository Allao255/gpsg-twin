// Emissão de um comando a partir do cabeçalho do modelo e de valores em SI.
// Forma curta, sem sufixo de unidade (D04), valores no modo de unidades SI forçado pelo twin.
import { radToDeg } from '../geo';
import { info, type CommandHeader, type Param } from '../model/load';
import {
  D04_FORCED_UNITS,
  D04_MODE_UNITS,
  EMIT_HEADER_OVERRIDE,
  d04Quantity,
  d04System,
  type UnitsMode,
} from '../quirks';
import { decimalsOfStep, findUnit, formatNumber } from '../units';
import { quoteString } from './lexer';

/** Argumento de emissão: número em SI (ângulos em rad), token de enum ou string. */
export type EmitArg = number | string;

const QUANTITY_DECIMALS = 4;
const DEG_DECIMALS = 9;
const DEFAULT_DECIMALS = 6;

/** Casas decimais de emissão de um parâmetro numérico, na unidade de emissão. */
export function emitDecimals(p: Param): number {
  if (p.type !== 'real' && p.type !== 'int' && p.type !== 'lat' && p.type !== 'lon') return 0;
  if (d04Quantity(p)) return QUANTITY_DECIMALS;
  if (p.unit === 'deg' || p.type === 'lat' || p.type === 'lon') return DEG_DECIMALS;
  if (p.type === 'int') return 0;
  if (p.step !== undefined) return decimalsOfStep(p.step);
  return DEFAULT_DECIMALS;
}

/** Valor SI na unidade do parâmetro para um modo de unidades (padrão: SI forçado, D04). */
export function siToEmitUnit(p: Param, si: number, mode: UnitsMode = D04_FORCED_UNITS): number {
  if (p.type === 'lat' || p.type === 'lon') return radToDeg(si);
  const q = d04Quantity(p);
  if (q) {
    const unit = D04_MODE_UNITS[d04System(mode).system][q];
    return si / (findUnit(unit)?.factor ?? 1);
  }
  const u = p.unit ? findUnit(p.unit) : null;
  return u ? si / u.factor : si;
}

/** Número SI formatado na unidade do parâmetro para o modo de unidades dado. */
export function formatNumberInMode(p: Param, si: number, mode: UnitsMode): string {
  return formatNumber(siToEmitUnit(p, si, mode), emitDecimals(p));
}

export function formatArg(p: Param, a: EmitArg): string {
  switch (p.type) {
    case 'enum':
    case 'unit':
      return String(a);
    case 'string':
      return quoteString(String(a));
    case 'int':
    case 'real':
    case 'lat':
    case 'lon': {
      if (typeof a !== 'number') throw new Error(`"${p.name}" espera número`);
      return formatNumber(siToEmitUnit(p, a), emitDecimals(p));
    }
  }
}

/** Linha SCPI canônica para um comando do modelo. */
export function formatCommand(header: CommandHeader, args: readonly EmitArg[] = []): string {
  const inf = info(header);
  if (args.length > inf.params.length) throw new Error(`${header}: argumentos a mais`);
  const h = EMIT_HEADER_OVERRIDE[header] ?? inf.shortHeader;
  if (args.length === 0) return h;
  const parts = args.map((a, i) => {
    const p = inf.params[i];
    if (!p) throw new Error(`${header}: parâmetro ${i} ausente`);
    return formatArg(p, a);
  });
  return `${h} ${parts.join(',')}`;
}
