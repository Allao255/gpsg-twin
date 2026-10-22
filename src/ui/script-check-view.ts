// Verificador de script provisório (até o editor do M3): diagnósticos, forma canônica e linha do tempo.
import { countBySeverity } from '../core/diagnostics';
import { formatScript } from '../core/script/format';
import { parseScript } from '../core/script/parse';
import { timeline } from '../core/script/timeline';
import runnerPs1 from '../../runners/gpsg-run.ps1?raw';
import { makePasteable } from '../runner/pasteable';
import { h } from './dom';

const EXAMPLE = `# exemplo S00 de docs/02-interface-remota.md
@errcheck on
GPS:SET:UNIT SI
GPS:SET:RFPR DIRECT
GPS:SET:RFLV -120
GPS:SET:STYP STATIC
GPS:SIM:LAT 39.2976
GPS:SIM:LONG -94.7139
GPS:SIM:ALT 300
@run
@at 40
GPS:SVPR:GPS:SAT 5,ON,GOOD,0,0,0,0,3600
@stop
`;

const fmtT = (t: number | null, exact: boolean): string =>
  t === null ? '' : `${exact ? '' : '≥ '}${t}`;

export function scriptCheckView(): HTMLElement {
  const input = h('textarea', {
    class: 'script',
    spellcheck: 'false',
    rows: '18',
    'aria-label': 'script .scpi',
  });
  input.value = EXAMPLE;
  const out = h('div', { class: 'check-out' });

  const run = (): void => {
    const doc = parseScript(input.value);
    const n = countBySeverity(doc.diagnostics);
    const diags = doc.diagnostics.map((d) =>
      h(
        'li',
        { class: `sev-${d.severity}` },
        h('span', { class: 'ln' }, `L${d.line ?? '?'}`),
        ` ${d.severity} `,
        h('code', {}, d.code),
        d.dRefs ? ` [${d.dRefs.join(', ')}]` : '',
        ` ${d.message}`,
      ),
    );
    const tl = timeline(doc).filter((e) => e.kind !== 'query' && e.kind !== 'mark');
    out.replaceChildren(
      h(
        'h3',
        {},
        `Diagnósticos: ${n.error} erros, ${n.warning} avisos, ${n.info} informações; ${doc.runs} execução(ões)`,
      ),
      h('ul', { class: 'diags' }, diags),
      h('h3', {}, 'Linha do tempo nominal'),
      h(
        'div',
        { class: 'scroll-x' },
        h(
          'table',
          { class: 'params' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['Linha', 't_session (s)', 't_run (s)', 'Evento'].map((t) => h('th', {}, t)),
            ),
          ),
          h(
            'tbody',
            {},
            tl.map((e) =>
              h(
                'tr',
                {},
                h('td', {}, String(e.lineNo)),
                h('td', {}, fmtT(e.tSession, e.exact)),
                h('td', {}, fmtT(e.tRun, e.exact)),
                h('td', {}, h('code', {}, e.label)),
              ),
            ),
          ),
        ),
      ),
      h('h3', {}, 'Forma canônica'),
      h('pre', { class: 'script' }, formatScript(doc, 'canonical')),
    );
  };

  let scriptName = 'script.scpi';
  const file = h('input', {
    type: 'file',
    accept: '.scpi,.txt',
    onchange: (ev: Event) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (f) {
        scriptName = f.name.replace(/[^A-Za-z0-9._-]/g, '_');
        void f.text().then((t) => {
          input.value = t;
          run();
        });
      }
    },
  });
  run();
  return h(
    'div',
    { class: 'checker' },
    h('h2', {}, 'Verificador de script'),
    h('div', { class: 'row' }, file, h('button', { type: 'button', onclick: run }, 'Verificar')),
    input,
    out,
    pasteableView(() => ({ name: scriptName, text: input.value })),
  );
}

/** Gera o runner PowerShell colável com o script do campo embutido. */
function pasteableView(current: () => { name: string; text: string }): HTMLElement {
  const address = h('input', {
    type: 'text',
    value: '192.168.0.10',
    'aria-label': 'endereço do equipamento',
    size: '16',
  });
  const port = h('input', {
    type: 'number',
    value: '5025',
    'aria-label': 'porta',
    min: '1',
    max: '65535',
  });
  const msg = h('p', { class: 'muted' });
  const generate = (): void => {
    const { name, text } = current();
    try {
      const block = makePasteable(runnerPs1, {
        scriptName: name,
        script: text,
        address: address.value.trim(),
        port: Number(port.value),
      });
      const url = URL.createObjectURL(new Blob([block], { type: 'text/plain;charset=utf-8' }));
      const a = h('a', { href: url, download: name.replace(/\.[^.]*$/, '') + '-colavel.ps1' });
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      msg.textContent = `Gerado: ${a.download}. Abrir o arquivo, copiar tudo e colar no console do PowerShell.`;
    } catch (e) {
      msg.textContent = `Não gerado: ${(e as Error).message}`;
    }
  };
  return h(
    'div',
    { class: 'pasteable' },
    h('h3', {}, 'Runner PowerShell colável'),
    h(
      'p',
      { class: 'muted' },
      'Para quando a política de execução bloqueia arquivos .ps1: o bloco é colado no console, que não é afetado por ela.',
    ),
    h(
      'div',
      { class: 'row' },
      h('label', {}, 'Endereço ', address),
      h('label', {}, 'Porta ', port),
      h('button', { type: 'button', onclick: generate }, 'Baixar bloco colável'),
    ),
    msg,
  );
}
