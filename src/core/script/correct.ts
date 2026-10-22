// Correções conhecidas de um script: grafias de cabeçalho fora do modelo com alvo em quirks.ts
// (D05, D06, D25) e TRUN direto trocado por @run/@stop (regra do twin: consultar o estado antes).
// O resultado ainda passa pela forma canônica para as demais regras de emissão (aspas, D07, D02).
import { resolveHeader } from '../scpi/header';
import { lexCommand } from '../scpi/lexer';
import { EMIT_HEADER_OVERRIDE } from '../quirks';
import { getIndex } from '../model/load';
import { splitComment } from './parse';

export interface Correction {
  line: number;
  from: string;
  to: string;
  dRefs: string[];
}

export function applyKnownCorrections(text: string): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  let running = false;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = lines.map((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return raw;
    const { body, comment } = splitComment(trimmed);
    const tail = comment === null ? '' : ` # ${comment}`;
    if (body.startsWith('@')) {
      const name = body.slice(1).split(/\s+/)[0]?.toLowerCase();
      if (name === 'run') running = true;
      if (name === 'stop') running = false;
      return raw;
    }
    const lx = lexCommand(body);
    const res = resolveHeader(lx.header);
    if (res.ok && res.info.header === 'GPS:SIM:ToggleRUN') {
      const to = running ? '@stop' : '@run';
      running = !running;
      corrections.push({ line: i + 1, from: body, to, dRefs: [] });
      return to + tail;
    }
    if (!res.ok && res.quirk?.target) {
      const target = getIndex().byHeader.get(res.quirk.target);
      if (target) {
        const header = EMIT_HEADER_OVERRIDE[target.header] ?? target.shortHeader;
        const to = header + body.slice(lx.headerSpan.end);
        corrections.push({ line: i + 1, from: body, to, dRefs: res.quirk.dRefs });
        return to + tail;
      }
    }
    return raw;
  });
  return { text: out.join('\n'), corrections };
}
