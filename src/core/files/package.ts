// Pacote USB do cenário (`.zip`): árvore /Instrument/ com os arquivos do equipamento (rota, waypoints,
// settings, almanaque e trajetória anexados), mais script de sessão, cenário JSON, runner colável e
// folha de sessão. Todo arquivo para o equipamento tem prefixo twin_ (03-formatos-de-arquivo.md).
//
// Por padrão o script configura tudo por comandos e os arquivos de rota, waypoints e settings vão
// como registro. As opções `via*` trocam os comandos pela importação e carga do arquivo; os formatos
// ainda não foram verificados em bancada (D29 a D31).
import { diag, type Diagnostic } from '../diagnostics';
import { emitScenario } from '../scenario/emit';
import { serializeScenario } from '../scenario/json';
import type { FileKind, Scenario } from '../scenario/types';
import { routeToXml } from './route-xml';
import { settingsToXml } from './settings-xml';
import { sessionSheet, type SheetFile } from './sheet';
import { waypointsToCsv } from './waypoints-csv';
import { zip } from './zip';

export const TWIN_PREFIX = 'twin_';

export interface Attachment {
  /** Nome no equipamento, com prefixo twin_. */
  name: string;
  text: string;
}

export interface PackageAttachments {
  almanac?: Attachment;
  trajectory?: Attachment;
}

export interface PackageOptions {
  viaRoute: boolean;
  viaWaypoints: boolean;
  viaSettings: boolean;
  /** Bloco colável do runner já montado para o script (null: não incluir). */
  pasteable: ((script: string, scriptName: string) => string) | null;
}

export const DEFAULT_PACKAGE_OPTIONS: PackageOptions = {
  viaRoute: false,
  viaWaypoints: false,
  viaSettings: false,
  pasteable: null,
};

export interface PackageFile {
  path: string;
  text: string;
}

export interface UsbPackage {
  files: PackageFile[];
  /** Cenário usado no script (com as trocas por arquivo aplicadas). */
  scriptScenario: Scenario;
  diagnostics: Diagnostic[];
}

/** Ordem de importação (03-formatos-de-arquivo.md, seção 1). */
const IMPORT_ORDER: readonly FileKind[] = ['SET', 'ROUT', 'NMEA', 'ALM', 'WAYP'];

const DIRS = {
  route: 'Instrument/Routes',
  waypoints: 'Instrument/Waypoint',
  settings: 'Instrument/Settings',
  almanac: 'Instrument/almanacs',
  trajectory: 'Instrument/Nmea',
} as const;

function withImport(sc: Scenario, k: FileKind): void {
  if (!sc.files.imports.includes(k))
    sc.files.imports = IMPORT_ORDER.filter((x) => x === k || sc.files.imports.includes(x));
}

export function buildPackage(
  sc: Scenario,
  att: PackageAttachments = {},
  opts: PackageOptions = DEFAULT_PACKAGE_OPTIONS,
): UsbPackage {
  const diagnostics: Diagnostic[] = [];
  const run = structuredClone(sc);
  const files: (PackageFile & { sheet: SheetFile })[] = [];
  const base = `${TWIN_PREFIX}${sc.name}`;
  // Rota, waypoints e settings: formatos só do manual (D29 a D31).
  const UNVERIFIED = 'formato não verificado em bancada';
  const add = (path: string, text: string, loaded: boolean, note = ''): void => {
    files.push({ path, text, sheet: { path, loaded, note } });
  };

  for (const [kind, a] of [
    ['almanaque', att.almanac],
    ['trajetória', att.trajectory],
  ] as const) {
    if (a && !a.name.startsWith(TWIN_PREFIX))
      diagnostics.push(diag('file-value', 'error', `${kind} anexado sem prefixo twin_: ${a.name}`));
  }

  // Rota.
  if (sc.route.points.length > 0) {
    const r = routeToXml(sc);
    diagnostics.push(...r.diagnostics);
    if (r.text !== null) {
      const name = `${base}.rte`;
      const via = opts.viaRoute && sc.setup.simulationType === 'DYNAMIC';
      add(`${DIRS.route}/${name}`, r.text, via, UNVERIFIED);
      if (via) {
        run.files.route = name;
        run.route.points = [];
        withImport(run, 'ROUT');
      }
    }
  }

  // Waypoints de usuário.
  if (sc.userWaypoints.length > 0) {
    const w = waypointsToCsv(sc.userWaypoints);
    diagnostics.push(...w.diagnostics);
    add(`${DIRS.waypoints}/${base}.csv`, w.text, opts.viaWaypoints, UNVERIFIED);
    if (opts.viaWaypoints) {
      run.userWaypoints = [];
      withImport(run, 'WAYP');
    }
  }

  // Settings.
  const st = settingsToXml(sc);
  diagnostics.push(...st.diagnostics);
  if (st.text !== null) {
    const name = `${base}.set`;
    add(`${DIRS.settings}/${name}`, st.text, opts.viaSettings, UNVERIFIED);
    if (opts.viaSettings) {
      run.files.settings = name;
      withImport(run, 'SET');
    }
  }

  // Almanaque e trajetória anexados: carregados quando o cenário os referencia.
  const alm = sc.files.almanac;
  if (att.almanac) {
    const used = alm.kind === 'file' && alm.name === att.almanac.name;
    add(`${DIRS.almanac}/${att.almanac.name}`, att.almanac.text, used);
    if (used) withImport(run, 'ALM');
    else
      diagnostics.push(
        diag(
          'file-value',
          'warning',
          `almanaque ${att.almanac.name} anexado e não usado pelo cenário`,
        ),
      );
  } else if (alm.kind === 'file' && alm.name.startsWith(TWIN_PREFIX)) {
    diagnostics.push(
      diag(
        'file-value',
        'warning',
        `almanaque ${alm.name} não anexado: precisa já estar no equipamento`,
      ),
    );
  }
  if (att.trajectory) {
    const used = sc.files.nmea === att.trajectory.name;
    // O emissor só carrega a trajetória com Simulation = Trajectory; a importação vale sempre.
    const loaded = used && sc.setup.simulationType === 'TRAJECTORY';
    add(
      `${DIRS.trajectory}/${att.trajectory.name}`,
      att.trajectory.text,
      loaded,
      used && !loaded ? 'Carregada só com Simulation = Trajectory' : '',
    );
    if (used) withImport(run, 'NMEA');
    else
      diagnostics.push(
        diag(
          'file-value',
          'warning',
          `trajetória ${att.trajectory.name} anexada e não usada pelo cenário`,
        ),
      );
  } else if (sc.files.nmea?.startsWith(TWIN_PREFIX)) {
    diagnostics.push(
      diag(
        'file-value',
        'warning',
        `trajetória ${sc.files.nmea} não anexada: precisa já estar no equipamento`,
      ),
    );
  }

  const emitted = emitScenario(run);
  diagnostics.push(...emitted.diagnostics.filter((d) => d.severity !== 'info'));
  const scriptName = `${sc.name}.scpi`;
  const out: PackageFile[] = files.map(({ path, text }) => ({ path, text }));
  out.push({ path: scriptName, text: emitted.text });
  out.push({ path: `${sc.name}.json`, text: serializeScenario(sc) });
  if (opts.pasteable)
    out.push({ path: `${sc.name}-colavel.ps1`, text: opts.pasteable(emitted.text, scriptName) });
  out.push({
    path: `${sc.name}-folha.md`,
    text: sessionSheet(
      run,
      files.map((f) => f.sheet),
      scriptName,
    ),
  });
  return { files: out, scriptScenario: run, diagnostics };
}

const enc = new TextEncoder();

/** Pacote em ZIP: `Instrument/` e os demais arquivos na raiz, para descompactar na raiz do pendrive. */
export function packageZip(pkg: UsbPackage): Uint8Array {
  return zip(pkg.files.map((f) => ({ path: f.path, data: enc.encode(f.text) })));
}
