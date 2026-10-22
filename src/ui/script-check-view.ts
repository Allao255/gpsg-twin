// Verificador de script provisório (até o editor do M3): diagnósticos, forma canônica e linha do tempo.
import { countBySeverity } from '../core/diagnostics';
import { formatScript } from '../core/script/format';
import { parseScript } from '../core/script/parse';
import { timeline } from '../core/script/timeline';
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

  const file = h('input', {
    type: 'file',
    accept: '.scpi,.txt',
    onchange: (ev: Event) => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (f)
        void f.text().then((t) => {
          input.value = t;
          run();
        });
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
  );
}
