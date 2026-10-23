// Pacote USB na aba Equipamento: leitura de arquivos e ZIP abertos pelo operador, diálogo de
// exportação do pacote e quadro de anexo (almanaque e trajetória) da janela File.
import runnerPs1 from '../../../runners/gpsg-run.ps1?raw';
import type { Diagnostic } from '../../core/diagnostics';
import {
  buildPackage,
  DEFAULT_PACKAGE_OPTIONS,
  packageZip,
  type PackageOptions,
} from '../../core/files/package';
import { parseTrajectory } from '../../core/files/trajectory';
import { parseYuma } from '../../core/files/yuma';
import { unzip } from '../../core/files/zip';
import { formatNumber } from '../../core/units';
import { makePasteable } from '../../runner/pasteable';
import type { InputFile } from '../../replica/import';
import {
  attachAlmanac,
  attachTrajectory,
  detach,
  type AttachmentKind,
} from '../../replica/session';
import { h } from '../dom';
import { downloadBytes } from '../download';
import { button, closeDialog, openDialog, pickFiles, type AppApi } from './kit';

/** Deflate dos ZIP de compactadores comuns, pela API do navegador. */
async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw.slice().buffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** UTF-8; se inválido, Windows-1252 (arquivo gravado pelo equipamento com °, D31). */
function decode(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1252').decode(data);
  }
}

/** Lê os arquivos escolhidos; ZIP é expandido nas suas entradas. */
export async function readInputFiles(files: readonly File[]): Promise<InputFile[]> {
  const out: InputFile[] = [];
  for (const f of files) {
    const data = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name)) {
      for (const e of await unzip(data, inflateRaw))
        out.push({ name: e.path, text: decode(e.data) });
    } else out.push({ name: f.name, text: decode(data) });
  }
  return out;
}

function diagItem(d: Diagnostic): HTMLElement {
  return h('li', { class: `sev-${d.severity}` }, d.message);
}

/** Resultado de uma importação: o que foi feito com cada arquivo e os diagnósticos. */
export function importReport(summary: readonly string[], diagnostics: readonly Diagnostic[]): void {
  openDialog(
    'Importação',
    h(
      'div',
      { class: 'report' },
      h(
        'ul',
        {},
        summary.map((s) => h('li', {}, s)),
      ),
      diagnostics.length > 0 ? h('ul', { class: 'diags' }, diagnostics.map(diagItem)) : null,
    ),
    [button('OK', closeDialog, { cls: 'primary' })],
  );
}

export interface RunnerTarget {
  address: string;
  port: number;
}

/** Diálogo de exportação do pacote USB: opções, lista de arquivos, avisos e download. */
export function exportPackageDialog(app: AppApi, target: () => RunnerTarget): void {
  const opts: PackageOptions = { ...DEFAULT_PACKAGE_OPTIONS };
  const list = h('div', { class: 'report' });
  const pasteable = (script: string, scriptName: string): string => {
    const t = target();
    return makePasteable(runnerPs1, { scriptName, script, address: t.address, port: t.port });
  };
  const build = (): ReturnType<typeof buildPackage> =>
    buildPackage(app.session.scenario, app.session.attachments, { ...opts, pasteable });
  const refresh = (): void => {
    const p = build();
    list.replaceChildren(
      h('h4', {}, 'Arquivos'),
      h(
        'ul',
        { class: 'files' },
        p.files.map((f) => h('li', {}, h('code', {}, f.path))),
      ),
      ...(p.diagnostics.length > 0
        ? [h('h4', {}, 'Avisos'), h('ul', { class: 'diags' }, p.diagnostics.map(diagItem))]
        : []),
    );
  };
  const check = (key: 'viaRoute' | 'viaWaypoints' | 'viaSettings', label: string): HTMLElement => {
    const input = h('input', {
      type: 'checkbox',
      onchange: (e: Event) => {
        opts[key] = (e.target as HTMLInputElement).checked;
        refresh();
      },
    });
    return h('label', { class: 'chk' }, input, ` ${label}`);
  };
  refresh();
  openDialog(
    'Exportar pacote USB',
    h(
      'div',
      {},
      h(
        'p',
        { class: 'dlg-hint' },
        'Descompactar na raiz do pendrive. Por padrão o script configura tudo por comandos; marcar abaixo para importar e carregar o arquivo no lugar dos comandos (formatos não verificados em bancada).',
      ),
      check('viaRoute', 'Rota pelo pendrive (.rte)'),
      check('viaWaypoints', 'Waypoints pelo pendrive (.csv)'),
      check('viaSettings', 'Settings pelo pendrive (.set)'),
      list,
    ),
    [
      button('Cancel', closeDialog),
      button(
        'Baixar .zip',
        () => {
          const p = build();
          downloadBytes(`${app.session.scenario.name}-pacote.zip`, packageZip(p));
          closeDialog();
          app.message(`Pacote gerado: ${p.files.length} arquivos.`);
        },
        { cls: 'primary' },
      ),
    ],
  );
}

const ATTACH: Readonly<
  Record<AttachmentKind, { accept: string; label: string; act: typeof attachAlmanac }>
> = {
  almanac: { accept: '.alm,.txt', label: 'almanaque Yuma', act: attachAlmanac },
  trajectory: {
    accept: '.gdt,.nme,.nmea,.txt',
    label: 'trajetória GDT ou NMEA',
    act: attachTrajectory,
  },
};

/** Resumo do anexo, calculado uma vez por anexo. */
const summaries = new WeakMap<object, string>();

function summarize(kind: AttachmentKind, text: string, key: object): string {
  const cached = summaries.get(key);
  if (cached !== undefined) return cached;
  let s: string;
  if (kind === 'almanac') {
    const a = parseYuma(text);
    s = `${a.entries.length} PRNs, semana ${a.weeks.join('/')} (módulo 1024)`;
  } else {
    const t = parseTrajectory(text);
    const span = (t.points.at(-1)?.t_s ?? 0) - (t.points[0]?.t_s ?? 0);
    s = `${t.format}, ${t.points.length} pontos, ${formatNumber(span, 1)} s${t.period_s !== null ? `, período ${formatNumber(t.period_s, 3)} s` : ''}${t.dated ? '' : ', sem data'}`;
  }
  summaries.set(key, s);
  return s;
}

/** Anexo do pacote na janela File (Almanacs ou Trajectory). */
export function attachmentRow(app: AppApi, kind: AttachmentKind): HTMLElement {
  const a = app.session.attachments[kind];
  const cfg = ATTACH[kind];
  const locked = app.session.running ? 'Em execução: a configuração está travada' : null;
  return h(
    'div',
    { class: 'attach' },
    h(
      'span',
      { class: 'attach-info' },
      a
        ? `Anexo do pacote: ${a.name} (${summarize(kind, a.text, a)})`
        : `Sem ${cfg.label} anexado ao pacote.`,
    ),
    button(
      a ? 'Trocar anexo…' : 'Anexar arquivo…',
      () => {
        pickFiles(cfg.accept, false, (files) => {
          const f = files[0];
          if (!f) return;
          void readInputFiles([f]).then(([x]) => {
            if (x) app.act(cfg.act(app.session, f.name, x.text));
          });
        });
      },
      { disabled: locked },
    ),
    a
      ? button(
          'Remover anexo',
          () => {
            app.act(detach(app.session, kind));
          },
          { disabled: locked },
        )
      : null,
  );
}
