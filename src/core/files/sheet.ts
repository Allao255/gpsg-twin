// Folha de sessão (`.md`): checklist físico, conexões, perdas, nível de RF previsto, arquivos do
// pendrive, ordem de operações e linha do tempo esperada. Impressa ou aberta ao lado do equipamento.
import { COUPLING_DB, levelBudget } from '../scenario/budget';
import { backupName, sortedActions } from '../scenario/emit';
import type { Scenario, TimedAction } from '../scenario/types';
import { formatNumber } from '../units';

/** Ação temporizada em texto (tabela da linha do tempo da réplica e folha de sessão). */
export function describeAction(a: TimedAction): string {
  if (a.type === 'rfLevel') return `RF Level ${formatNumber(a.level_dBm, 1)} dBm`;
  const parts = [`${a.constellation} ${a.sv}`, a.select, a.health];
  if (a.doppler_Hz) parts.push(`Doppler ${formatNumber(a.doppler_Hz, 0)} Hz`);
  if (a.incoherence_mps) parts.push(`coerência ${formatNumber(a.incoherence_mps, 3)} m/s`);
  if (a.ampOffset_dB) parts.push(`offset ${formatNumber(a.ampOffset_dB, 1)} dB`);
  if (a.stepError_m) parts.push(`step ${formatNumber(a.stepError_m, 3)} m`);
  parts.push(`duração ${a.duration_s} s`);
  return parts.join(', ');
}

export interface SheetFile {
  path: string;
  /** O script importa e carrega o arquivo. */
  loaded: boolean;
  note: string;
}

const db = (x: number): string => formatNumber(x, 1);

export function sessionSheet(
  sc: Scenario,
  files: readonly SheetFile[],
  scriptName: string,
): string {
  const s = sc.setup;
  const L: string[] = [];
  const p = (...x: string[]): void => {
    L.push(...x);
  };
  p(`# Folha de sessão: ${sc.name}`, '');
  if (sc.description.trim() !== '') p(sc.description.trim(), '');
  p(
    `Gerada pelo gpsg-twin a partir do cenário \`${sc.name}\` (scenario_version ${sc.scenario_version}). Script: \`${scriptName}\`.`,
    '',
  );

  const usb = files.filter((f) => f.loaded);
  p('## Antes da bancada', '');
  p('- [ ] Script ensaiado contra o mock (`npm run mock`), sem erro.');
  if (usb.length > 0)
    p('- [ ] Pendrive FAT32 com a pasta `Instrument/` deste pacote na raiz (só arquivos `twin_`).');
  p('- [ ] IP do equipamento e caminho de rede até a porta 5025 conferidos.');
  p(
    '- [ ] Combinado com quem usou o equipamento por último (o script salva o estado anterior).',
    '',
  );

  p('## Conexões', '');
  p(
    `- Porta de RF: **${s.rfPort}**. Destino: carga de 50 Ω, atenuador ou receptor em bancada. Nada irradiando.`,
  );
  if (s.rfPort === 'COUPLER')
    p('- Acoplador sobre a antena do receptor; nada ligado à porta DIRECT.');
  else p('- Nada ligado à porta COUPLER.');
  p(
    `- Perdas inseridas: acoplador ${db(sc.io.coupler_dB)} dB, cabo do acoplador ${db(sc.io.couplerCable_dB)} dB, cabo direto ${db(sc.io.directCable_dB)} dB, divisor ${db(sc.io.splitter_dB)} dB.`,
  );
  if (s.referenceSource === 'EXTERNAL')
    p('- Referência de 10 MHz externa conectada (Reference Source = EXT).');
  if (s.extRef === 'ON') p('- Saída de referência externa ligada (Ext Ref Out = ON).');
  if (s.triggerSource === 'EXTERNAL')
    p('- Trigger externo conectado: o relógio só avança na borda de subida (TSRC EXTERNAL).');
  p('');

  const b = levelBudget(sc);
  p('## Nível de RF previsto', '');
  p(
    `- RF Level programado: **${db(s.rfLevel_dBm)} dBm** por SV${s.prnSignal === 'FIXED' ? ' (PRN Signal FIXED: todos os SVs no mesmo nível)' : ' (PRN Signal VARIABLE: níveis relativos seguem a geometria)'}. Interpretação provisória D17.`,
  );
  p(
    `- Faixa da porta com as perdas (D17): ${b.range_dBm[0]} a ${b.range_dBm[1]} dBm (perda considerada ${db(b.loss_dB)} dB).`,
  );
  p(
    `- Composto na saída: ${db(b.composite_dBm(6))} dBm com 6 SVs, ${db(b.composite_dBm(12))} dBm com 12 SVs (RF Level + 10 log10 N).`,
  );
  if (b.atAntenna_dBm !== null)
    p(
      `- Na antena, pelo acoplador: RF Level - cabo do acoplador - ${COUPLING_DB} dB = ${db(b.atAntenna_dBm)} dBm (acoplamento típico, OP 7-3).`,
    );
  p('- Faixa adequada para a maioria dos receptores: -115 a -120 dBm (OP 4-2).', '');

  if (files.length > 0) {
    p('## Arquivos do pacote', '');
    p('| Arquivo | Uso |', '|---|---|');
    for (const f of files)
      p(
        `| \`${f.path}\` | ${f.loaded ? 'importado e carregado pelo script' : 'registro; não carregado pelo script'}${f.note ? `. ${f.note}` : ''} |`,
      );
    p('');
  }

  p('## Ordem de operações', '');
  const steps = [
    'Conferir que nenhuma simulação de outro usuário está rodando (o script consulta `GPS:SIM:TRUN?` e pausa).',
    ...(usb.length > 0
      ? ['Inserir o pendrive antes de iniciar o script (o script importa os arquivos).']
      : []),
    `Executar o runner: \`powershell -ExecutionPolicy Bypass -File gpsg-run.ps1 -Address <ip> -Script ${scriptName}\`, ou colar o bloco colável no console.`,
    'Responder aos `@pause`: confirmar porta e destino do sinal antes do `@run`.',
    'Acompanhar a linha do tempo abaixo; o log CSV fica em `logs/`.',
    'Ao final, conferir na tela que a simulação parou e guardar o log fora do repositório.',
  ];
  steps.forEach((t, i) => {
    p(`${i + 1}. ${t}`);
  });
  p('');

  p('## Linha do tempo esperada', '');
  p('| t (s) | Evento |', '|---|---|', '| 0 | `@run`: início da simulação |');
  for (const a of sortedActions(sc.actions))
    p(`| ${formatNumber(a.t_s, 3)} | ${describeAction(a)} |`);
  if (sc.run.stopAt_s !== null)
    p(`| ${formatNumber(sc.run.stopAt_s, 3)} | \`@stop\`: fim da simulação |`);
  else p('| | Sem `@stop`: a simulação continua rodando ao fim do script |');
  p('');

  p('## Se o script parar no meio', '');
  p(
    '1. Consultar `GPS:SIM:TRUN?`. Se `Running`, parar pela tela (STOP) ou com um script contendo só `@stop`.',
  );
  p(
    `2. Restaurar o estado anterior: \`GPS:FIL:SET:LOAD "${backupName(sc)}"\` e \`GPS:FIL:ROUT:LOAD "${backupName(sc)}.rte"\`.`,
  );
  p(
    '3. Arquivos criados pelo twin no equipamento começam com `twin_`; remover só depois de confirmar a restauração, um por vez.',
  );
  p('4. Nunca enviar `*RST`.');
  return L.join('\n') + '\n';
}
