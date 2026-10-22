// Conversão dos parâmetros brutos em valores tipados (SI, radianos) e validação de tipo, faixa,
// enumeração, comprimento e formato, conforme o modelo e o estado conhecido.
import { diag, type Diagnostic, type Span } from '../diagnostics';
import { AXIS_LIMIT_DEG, degToRad, isHemisphere, parseDegMin, type Axis } from '../geo';
import type { CommandInfo, Param } from '../model/load';
import type { Range } from '../model/types.gen';
import {
  D02_SVPR_HEADERS,
  D04_MODE_UNITS,
  D04_RANGE_KEY_SYSTEM,
  D06_QUOTED_ENUM_DREFS,
  D07_LATLON_DREFS,
  D17_RANGE_SHIFT_HEADERS,
  ENUM_HINTS,
  d04Quantity,
  d04System,
  d17ShiftedRange,
  rangeOverride,
  type Losses,
  type Port,
  type UnitsMode,
} from '../quirks';
import { findUnit, toSI } from '../units';
import type { RawParam } from './lexer';

/** Estado conhecido no ponto do comando; null quando desconhecido. */
export interface CommandContext {
  running: boolean | null;
  units: UnitsMode | null;
  port: Port | null;
  losses: Losses | null;
}

export const UNKNOWN_CONTEXT: CommandContext = {
  running: null,
  units: null,
  port: null,
  losses: null,
};

export type ParamValue =
  | { kind: 'number'; value: number; raw: string; suffix: string | null }
  | { kind: 'enum'; value: string; raw: string; quoted: boolean }
  | { kind: 'string'; value: string; raw: string; quoted: boolean }
  | { kind: 'angle'; value: number; raw: string; form: 'decimal' | 'deg-min' }
  | { kind: 'unit'; value: string; raw: string }
  | { kind: 'var'; names: string[]; raw: string };

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function varNames(text: string): string[] {
  return [...text.matchAll(VAR_RE)].map((m) => m[1] ?? '');
}

const NUM_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:\s*([A-Za-z][A-Za-z0-9/²]*))?$/;

export function parseNumberToken(
  text: string,
): { value: number; suffix: string | null } | { error: string } {
  const t = text.trim();
  const bin = /^#[Bb]([01]+)$/.exec(t);
  if (bin) return { value: parseInt(bin[1] ?? '', 2), suffix: null };
  const hex = /^#[Hh]([0-9A-Fa-f]+)$/.exec(t);
  if (hex) return { value: parseInt(hex[1] ?? '', 16), suffix: null };
  const m = NUM_RE.exec(t);
  if (!m) return { error: `número inválido: "${t}"` };
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return { error: `número inválido: "${t}"` };
  return { value, suffix: m[2] ?? null };
}

export interface ParsedParams {
  values: (ParamValue | undefined)[];
  diagnostics: Diagnostic[];
}

const SVPR = new Set<string>(D02_SVPR_HEADERS);

export function parseParams(
  inf: CommandInfo,
  raw: readonly RawParam[],
  ctx: CommandContext,
): ParsedParams {
  const out: Diagnostic[] = [];
  const cmdRefs = inf.cmd.discrepancies;
  const push = (d: Diagnostic): void => {
    d.dRefs = unique([...(d.dRefs ?? []), ...cmdRefs]);
    if (d.dRefs.length === 0) delete d.dRefs;
    out.push(d);
  };
  const ps = inf.params;
  const values: (ParamValue | undefined)[] = [];
  const required = ps.filter((p) => !p.optional).length;
  let r = 0;
  for (const p of ps) {
    if (r >= raw.length) {
      if (p.optional) {
        values.push(undefined);
        if (SVPR.has(inf.header)) {
          push(
            diag(
              'optional-omitted',
              'warning',
              `"${p.name}" omitido; o twin emite os 8 parâmetros (padrão ${String(p.default ?? '')})`,
              { dRefs: ['D02'] },
            ),
          );
        }
        continue;
      }
      push(
        diag(
          'arity',
          'error',
          `faltam parâmetros: esperado ${arityText(required, ps.length)}, recebido ${raw.length}`,
        ),
      );
      return { values, diagnostics: out };
    }
    const isAngle = p.type === 'lat' || p.type === 'lon';
    const take =
      isAngle && raw.length - r >= 3 && isHemisphere(raw[r + 2]?.text ?? '', p.type as Axis)
        ? 3
        : 1;
    const slice = raw.slice(r, r + take);
    r += take;
    values.push(convertParam(inf, p, slice, ctx, push));
  }
  if (r < raw.length) {
    const first = raw[r];
    push(
      diag(
        'arity',
        'error',
        `parâmetros a mais: esperado ${arityText(required, ps.length)}, recebido ${raw.length}`,
        first ? { span: first.span } : {},
      ),
    );
  }
  return { values, diagnostics: out };
}

function arityText(required: number, total: number): string {
  return required === total ? `${total}` : `${required} a ${total}`;
}

function unique(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

function spanOf(slice: readonly RawParam[]): Span {
  const a = slice[0];
  const b = slice[slice.length - 1];
  return { start: a?.span.start ?? 0, end: b?.span.end ?? 0 };
}

type Push = (d: Diagnostic) => void;

function convertParam(
  inf: CommandInfo,
  p: Param,
  slice: readonly RawParam[],
  ctx: CommandContext,
  push: Push,
): ParamValue | undefined {
  const span = spanOf(slice);
  const rawText = slice.map((s) => s.text).join(',');
  const names = varNames(rawText);
  if (names.length > 0) return { kind: 'var', names, raw: rawText };
  const first = slice[0];
  if (!first) return undefined;

  switch (p.type) {
    case 'int':
    case 'real':
      return convertNumber(inf, p, first, ctx, push, span);
    case 'enum':
      return convertEnum(inf, p, first, push, span);
    case 'string':
      return convertString(p, first, push, span);
    case 'lat':
    case 'lon':
      return convertAngle(p.type, slice, push, span);
    case 'unit': {
      const u = findUnit(first.value);
      if (!u) {
        push(diag('unit-unknown', 'error', `unidade desconhecida: "${first.text}"`, { span }));
        return undefined;
      }
      push(
        diag('unit-suffix-unverified', 'info', 'unidade na consulta: sintaxe não verificada', {
          span,
          dRefs: ['D04'],
        }),
      );
      return { kind: 'unit', value: u.token, raw: first.text };
    }
  }
}

function within(v: number, [lo, hi]: Range, scale = 1): boolean {
  const tol = 1e-9 * Math.max(1, Math.abs(lo), Math.abs(hi)) * scale;
  return v >= lo - tol && v <= hi + tol;
}

function fmtRange([lo, hi]: Range, unit: string | undefined): string {
  return `${lo}..${hi}${unit ? ` ${unit}` : ''}`;
}

function convertNumber(
  inf: CommandInfo,
  p: Param,
  rp: RawParam,
  ctx: CommandContext,
  push: Push,
  span: Span,
): ParamValue | undefined {
  if (rp.quote !== null) {
    push(diag('type', 'error', `"${p.name}" deve ser numérico, recebido string`, { span }));
    return undefined;
  }
  const n = parseNumberToken(rp.text);
  if ('error' in n) {
    push(diag('type', 'error', `"${p.name}": ${n.error}`, { span }));
    return undefined;
  }
  if (p.type === 'int' && !Number.isInteger(n.value)) {
    push(diag('type', 'error', `"${p.name}" deve ser inteiro: ${rp.text}`, { span }));
    return undefined;
  }
  const quantity = d04Quantity(p);
  const ov = rangeOverride(inf.header, p.name);
  const baseRange: Range | null =
    p.min !== undefined && p.max !== undefined ? [ov?.min ?? p.min, ov?.max ?? p.max] : null;
  const ovRefs = ov?.dRefs ?? [];

  // Sufixo de unidade.
  let suffixUnit: string | null = null;
  if (n.suffix !== null) {
    const u = findUnit(n.suffix);
    if (!p.unit_suffix) {
      push(
        diag('unit-suffix-not-allowed', 'error', `"${p.name}" não aceita sufixo de unidade`, {
          span,
        }),
      );
      return undefined;
    }
    const expectDim = quantity
      ? findUnit(D04_MODE_UNITS.SI[quantity])?.dim
      : findUnit(p.unit ?? '')?.dim;
    if (!u || (expectDim !== undefined && u.dim !== expectDim)) {
      push(
        diag('unit-unknown', 'error', `unidade incompatível com "${p.name}": ${n.suffix}`, {
          span,
        }),
      );
      return undefined;
    }
    suffixUnit = u.token;
    push(
      diag(
        'unit-suffix-unverified',
        'warning',
        `sufixo de unidade "${n.suffix}": sintaxe não verificada`,
        {
          span,
          dRefs: ['D04'],
        },
      ),
    );
  }

  const value = (si: number): ParamValue => ({
    kind: 'number',
    value: si,
    raw: rp.text,
    suffix: n.suffix,
  });

  // Faixa por unidade (KML MVEL, MTR).
  if (p.range_by_units) {
    const systems = ctx.units ? [d04System(ctx.units).system] : (['SI', 'IMPERIAL'] as const);
    const results = systems.map((sys) => {
      const key = Object.keys(p.range_by_units ?? {}).find((k) => D04_RANGE_KEY_SYSTEM[k] === sys);
      const rg = key ? p.range_by_units?.[key] : undefined;
      return { sys, key, ok: rg ? within(n.value, rg) : true, rg };
    });
    reportModeRange(p, results, ctx, push, span, ovRefs);
    const chosen = results[0];
    return value(chosen?.key ? toSI(n.value, chosen.key) : n.value);
  }

  // Grandeza dependente do modo de unidades.
  if (quantity) {
    if (ctx.units && !d04System(ctx.units).verified) {
      push(
        diag(
          'units-aero-unverified',
          'warning',
          `modo ${ctx.units}: unidade de "${p.name}" não verificada`,
          {
            span,
            dRefs: ['D04'],
          },
        ),
      );
    }
    const rangeSI: Range | null =
      baseRange && p.unit ? [toSI(baseRange[0], p.unit), toSI(baseRange[1], p.unit)] : null;
    if (suffixUnit) {
      const si = toSI(n.value, suffixUnit);
      if (rangeSI && !within(si, rangeSI)) {
        push(
          diag(
            'range',
            'error',
            `"${p.name}" fora da faixa ${fmtRange(baseRange ?? [0, 0], p.unit)}`,
            {
              span,
              dRefs: ['D04', ...ovRefs],
            },
          ),
        );
      }
      return value(si);
    }
    const systems = ctx.units ? [d04System(ctx.units).system] : (['SI', 'IMPERIAL'] as const);
    const results = systems.map((sys) => {
      const unit = D04_MODE_UNITS[sys][quantity];
      const si = toSI(n.value, unit);
      return { sys, key: unit, ok: rangeSI ? within(si, rangeSI) : true, rg: undefined };
    });
    if (rangeSI) reportModeRange(p, results, ctx, push, span, ovRefs, baseRange);
    const sys = systems[0] ?? 'SI';
    return value(toSI(n.value, D04_MODE_UNITS[sys][quantity]));
  }

  // Unidade fixa ou adimensional.
  const unitDef = p.unit ? findUnit(p.unit) : null;
  const si = suffixUnit ? toSI(n.value, suffixUnit) : unitDef ? n.value * unitDef.factor : n.value;
  const inModelUnit = suffixUnit && unitDef ? si / unitDef.factor : n.value;

  if (p.range_by_port) {
    checkPortRange(inf, p, inModelUnit, ctx, push, span);
  } else if (baseRange && !within(inModelUnit, baseRange)) {
    push(
      diag(
        'range',
        'error',
        `"${p.name}" fora da faixa ${fmtRange(baseRange, p.unit)}: ${rp.text}`,
        {
          span,
          dRefs: ovRefs,
        },
      ),
    );
  }
  if (p.step !== undefined && !onStep(inModelUnit, p.step)) {
    push(
      diag(
        'step',
        'warning',
        `"${p.name}" fora do passo de ${p.step}${p.unit ? ` ${p.unit}` : ''}: ${rp.text}`,
        {
          span,
        },
      ),
    );
  }
  return value(si);
}

function onStep(v: number, step: number): boolean {
  const k = v / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

function reportModeRange(
  p: Param,
  results: readonly { sys: string; key: string | undefined; ok: boolean; rg: Range | undefined }[],
  ctx: CommandContext,
  push: Push,
  span: Span,
  ovRefs: readonly string[],
  baseRange?: Range | null,
): void {
  const bad = results.filter((x) => !x.ok);
  if (bad.length === 0) return;
  const desc = (x: (typeof results)[number]): string =>
    x.rg ? fmtRange(x.rg, x.key) : `${fmtRange(baseRange ?? [0, 0], p.unit)} (em ${x.key})`;
  if (bad.length === results.length) {
    push(
      diag(
        'range',
        'error',
        `"${p.name}" fora da faixa ${bad.map(desc).join(' e ')}${ctx.units ? '' : ' em qualquer modo de unidades'}`,
        { span, dRefs: ['D04', ...ovRefs] },
      ),
    );
  } else {
    push(
      diag(
        'range-depends-on-units',
        'warning',
        `"${p.name}" fora da faixa no modo ${bad.map((x) => x.sys).join(', ')}; modo de unidades desconhecido neste ponto`,
        { span, dRefs: ['D04', ...ovRefs] },
      ),
    );
  }
}

function checkPortRange(
  inf: CommandInfo,
  p: Param,
  v: number,
  ctx: CommandContext,
  push: Push,
  span: Span,
): void {
  const rbp = p.range_by_port;
  if (!rbp) return;
  const shift = D17_RANGE_SHIFT_HEADERS.includes(inf.header);
  const rangeFor = (port: Port): Range =>
    shift && ctx.losses ? d17ShiftedRange(rbp[port], port, ctx.losses) : rbp[port];
  const refs = shift ? ['D17'] : [];
  if (ctx.port) {
    const rg = rangeFor(ctx.port);
    if (!within(v, rg)) {
      push(
        diag(
          'range',
          'error',
          `"${p.name}" fora da faixa da porta ${ctx.port}: ${fmtRange(rg, p.unit)}`,
          {
            span,
            dRefs: refs,
          },
        ),
      );
    }
    return;
  }
  const ports: Port[] = ['DIRECT', 'COUPLER'];
  const okPorts = ports.filter((pt) => within(v, rangeFor(pt)));
  if (okPorts.length === 0) {
    push(
      diag(
        'range',
        'error',
        `"${p.name}" fora da faixa de qualquer porta (DIRECT ${fmtRange(rangeFor('DIRECT'), p.unit)}, COUPLER ${fmtRange(rangeFor('COUPLER'), p.unit)})`,
        { span, dRefs: refs },
      ),
    );
  } else if (okPorts.length === 1) {
    push(
      diag(
        'range-unknown',
        'info',
        `"${p.name}" válido só na porta ${okPorts[0] ?? ''}; porta desconhecida neste ponto`,
        { span, dRefs: refs },
      ),
    );
  }
}

const normEnum = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

function convertEnum(
  inf: CommandInfo,
  p: Param,
  rp: RawParam,
  push: Push,
  span: Span,
): ParamValue | undefined {
  const values = p.values ?? [];
  const want = normEnum(rp.value);
  const hit = values.find((v) => normEnum(v) === want);
  if (!hit) {
    const hint = ENUM_HINTS.find((h) => h.header === inf.header && normEnum(h.token) === want);
    push(
      diag(
        'enum',
        'error',
        `"${p.name}" = "${rp.value}" não é aceito; valores: ${values.join(', ')}${hint ? ` (${hint.note})` : ''}`,
        { span, dRefs: hint?.dRefs ?? [] },
      ),
    );
    return undefined;
  }
  if (rp.quote !== null) {
    push(
      diag('enum-quoted', 'warning', `"${p.name}" entre aspas; o twin emite sem aspas`, {
        span,
        dRefs: D06_QUOTED_ENUM_DREFS,
      }),
    );
  }
  return { kind: 'enum', value: hit, raw: rp.text, quoted: rp.quote !== null };
}

function convertString(p: Param, rp: RawParam, push: Push, span: Span): ParamValue | undefined {
  if (rp.quote === null) {
    push(
      diag('string-unquoted', 'warning', `"${p.name}" sem aspas; o twin emite entre aspas`, {
        span,
      }),
    );
  }
  const s = rp.value;
  if (p.maxlen !== undefined && s.length > p.maxlen) {
    push(
      diag('maxlen', 'error', `"${p.name}" com ${s.length} caracteres; máximo ${p.maxlen}`, {
        span,
      }),
    );
  }
  if (p.format !== undefined) {
    const err = checkFormat(p.format, s);
    if (err) push(diag('format', 'error', `"${p.name}" ${err}`, { span }));
  }
  return { kind: 'string', value: s, raw: rp.text, quoted: rp.quote !== null };
}

/** Valida os formatos de data e hora do modelo. Retorna mensagem de erro ou null. */
export function checkFormat(format: string, s: string): string | null {
  if (format === 'mm/dd/yyyy') {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) return `deve estar no formato mm/dd/yyyy: "${s}"`;
    const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      return `data inexistente: "${s}"`;
    }
    return null;
  }
  if (format === 'hh:mm:ss') {
    const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m) return `deve estar no formato hh:mm:ss: "${s}"`;
    if (Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3]) > 59) return `hora inválida: "${s}"`;
    return null;
  }
  return null;
}

function convertAngle(
  axis: Axis,
  slice: readonly RawParam[],
  push: Push,
  span: Span,
): ParamValue | undefined {
  const raw = slice.map((s) => s.text).join(',');
  if (slice.length === 3) {
    const r = parseDegMin(slice[0]?.text ?? '', slice[1]?.text ?? '', slice[2]?.text ?? '', axis);
    if ('error' in r) {
      push(
        diag('type', 'error', `${axis === 'lat' ? 'latitude' : 'longitude'}: ${r.error}`, { span }),
      );
      return undefined;
    }
    push(
      diag(
        'latlon-dm',
        'warning',
        'forma graus,minutos,hemisfério; o twin emite graus decimais com sinal',
        {
          span,
          dRefs: D07_LATLON_DREFS,
        },
      ),
    );
    return { kind: 'angle', value: degToRad(r.deg), raw, form: 'deg-min' };
  }
  const n = parseNumberToken(raw);
  if ('error' in n || n.suffix !== null) {
    push(
      diag('type', 'error', `${axis === 'lat' ? 'latitude' : 'longitude'} inválida: "${raw}"`, {
        span,
        dRefs: D07_LATLON_DREFS,
      }),
    );
    return undefined;
  }
  const lim = AXIS_LIMIT_DEG[axis];
  if (Math.abs(n.value) > lim) {
    push(diag('range', 'error', `fora de ±${lim}°: ${raw}`, { span }));
  }
  return { kind: 'angle', value: degToRad(n.value), raw, form: 'decimal' };
}
