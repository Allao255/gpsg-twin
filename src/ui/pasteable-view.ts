// Gerador do runner PowerShell colável com o script corrente embutido.
import runnerPs1 from '../../runners/gpsg-run.ps1?raw';
import { makePasteable } from '../runner/pasteable';
import { h } from './dom';
import { downloadText } from './download';

export interface PasteableView {
  el: HTMLElement;
  /** Endereço e porta informados, usados também no pacote USB. */
  target: () => { address: string; port: number };
}

export function pasteableView(current: () => { name: string; text: string }): PasteableView {
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
      const file = name.replace(/\.[^.]*$/, '') + '-colavel.ps1';
      downloadText(file, block);
      msg.textContent = `Gerado: ${file}. Abrir o arquivo, copiar tudo e colar no console do PowerShell.`;
    } catch (e) {
      msg.textContent = `Não gerado: ${(e as Error).message}`;
    }
  };
  const el = h(
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
  return { el, target: () => ({ address: address.value.trim(), port: Number(port.value) }) };
}
