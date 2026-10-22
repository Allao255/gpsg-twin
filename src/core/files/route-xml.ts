// Rota do equipamento (`.rte`, OP D-5 e D-6): XML com um <Waypoint> por ponto, sempre em SI e graus
// decimais com sinal, independentemente do modo de unidades. D29: semântica de MaxAcceleration e
// MaxClimbRate iguais a 0 não documentada; lidos e gravados como estão.
import { diag, type Diagnostic } from '../diagnostics';
import { degToRad, radToDeg } from '../geo';
import type { RoutePoint, Scenario } from '../scenario/types';
import { formatCommand } from '../scpi/format';
import type { CommandContext } from '../scpi/params';
import { checkCommand } from '../scpi/validate';
import { escapeXml, parseXml } from './xml';

/** Ordem dos atributos como no exemplo do manual (OP D-5). */
const ATTRS = [
  'Longitude',
  'MaxAcceleration',
  'MaxClimbRate',
  'Name',
  'Latitude',
  'Altitude',
  'TargetSpeed',
  'TurningCircleRadius',
] as const;

/** Validação dos valores emitidos em SI (D04), fora de execução. */
export const SI_CONTEXT: CommandContext = { running: false, units: 'SI', port: null, losses: null };

/**
 * Número como o equipamento grava: 16 algarismos significativos sem zeros à direita (`%.16g`).
 * Reproduz todos os valores do exemplo do manual (9.8 aparece como 9.800000000000001).
 */
export function g16(x: number): string {
  if (x === 0) return '0';
  const s = x.toPrecision(16);
  const [mant = '', exp] = s.split('e');
  const m = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant;
  return exp === undefined ? m : `${m}e${exp}`;
}

const num = g16;
const deg = (rad: number): string => g16(radToDeg(rad));

export interface RouteXmlResult {
  /** null quando algum ponto não pode ser escrito (waypoint do banco sem coordenadas). */
  text: string | null;
  diagnostics: Diagnostic[];
}

/**
 * Pontos da rota -> `.rte`. Waypoint de usuário do cenário entra com as coordenadas dele; waypoint
 * do banco do equipamento não tem coordenadas no twin e impede o arquivo.
 */
export function routeToXml(sc: Scenario): RouteXmlResult {
  const lines = ['<Route>'];
  const missing: string[] = [];
  for (const p of sc.route.points) {
    const pos =
      p.kind === 'point'
        ? { name: p.name, lat_rad: p.lat_rad, lon_rad: p.lon_rad, alt_m: p.alt_m }
        : (() => {
            const w = sc.userWaypoints.find((x) => x.code === p.code);
            return w
              ? { name: w.code, lat_rad: w.lat_rad, lon_rad: w.lon_rad, alt_m: w.alt_m }
              : null;
          })();
    if (!pos) {
      missing.push(p.kind === 'waypoint' ? p.code : '');
      continue;
    }
    const v: Record<(typeof ATTRS)[number], string> = {
      Longitude: deg(pos.lon_rad),
      MaxAcceleration: num(p.accel_mps2),
      MaxClimbRate: num(p.climbRate_mps),
      Name: escapeXml(pos.name),
      Latitude: deg(pos.lat_rad),
      Altitude: num(pos.alt_m),
      TargetSpeed: num(p.speed_mps),
      TurningCircleRadius: num(p.turnRadius_m),
    };
    lines.push(`\t<Waypoint ${ATTRS.map((a) => `${a}="${v[a]}"`).join(' ')}/>`);
  }
  lines.push('</Route>');
  if (missing.length > 0) {
    return {
      text: null,
      diagnostics: [
        diag(
          'file-omitted',
          'warning',
          `rota com waypoint do banco do equipamento (${missing.join(', ')}): coordenadas só no equipamento; .rte não gerado, rota enviada por comandos`,
        ),
      ],
    };
  }
  return { text: lines.join('\n') + '\n', diagnostics: [] };
}

export interface RouteReadResult {
  points: RoutePoint[];
  diagnostics: Diagnostic[];
}

/** `.rte` -> pontos de rota (todos como ponto livre), validados pela faixa de ROUT:ADD:POIN. */
export function routeFromXml(text: string): RouteReadResult {
  const r = parseXml(text);
  if ('error' in r) return { points: [], diagnostics: [diag('file-format', 'error', r.error)] };
  if (r.root.name !== 'Route')
    return {
      points: [],
      diagnostics: [diag('file-format', 'error', `raiz <${r.root.name}>, esperado <Route>`)],
    };
  const points: RoutePoint[] = [];
  const diagnostics: Diagnostic[] = [];
  r.root.children.forEach((el, i) => {
    const n = i + 1;
    if (el.name !== 'Waypoint') {
      diagnostics.push(diag('file-format', 'warning', `ponto ${n}: <${el.name}> ignorado`));
      return;
    }
    const val: Record<string, number> = {};
    for (const a of ATTRS) {
      if (a === 'Name') continue;
      const s = el.attrs[a];
      const x = s === undefined || s.trim() === '' ? NaN : Number(s);
      if (!Number.isFinite(x)) {
        diagnostics.push(diag('file-format', 'error', `ponto ${n}: ${a} ausente ou inválido`));
        return;
      }
      val[a] = x;
    }
    const p: RoutePoint = {
      kind: 'point',
      name: el.attrs.Name ?? '',
      lat_rad: degToRad(val.Latitude ?? 0),
      lon_rad: degToRad(val.Longitude ?? 0),
      alt_m: val.Altitude ?? 0,
      climbRate_mps: val.MaxClimbRate ?? 0,
      speed_mps: val.TargetSpeed ?? 0,
      accel_mps2: val.MaxAcceleration ?? 0,
      turnRadius_m: val.TurningCircleRadius ?? 0,
    };
    const line = formatCommand('GPS:ROUT:ADD:POINt', [
      p.name,
      p.lat_rad,
      p.lon_rad,
      p.alt_m,
      p.climbRate_mps,
      p.speed_mps,
      p.accel_mps2,
      p.turnRadius_m,
    ]);
    for (const d of checkCommand(line, SI_CONTEXT).diagnostics)
      if (d.severity === 'error')
        diagnostics.push(diag('file-value', 'warning', `ponto ${n} (${p.name}): ${d.message}`));
    points.push(p);
  });
  if (points.length > 9999)
    diagnostics.push(diag('file-value', 'error', `${points.length} pontos; máximo 9999 (D08)`));
  return { points, diagnostics };
}
