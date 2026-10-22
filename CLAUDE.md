# CLAUDE.md

Instruções para o Claude Code neste repositório.

## Projeto

Configurador espelho do simulador GNSS VIAVI GPSG-1000 em duas abas: Equipamento (réplica da interface que gera e lê SCPI e pacote USB) e Análise (validação visual do que o código pede: linha do tempo, rota, satélites, intensidades). Não gera sinal nem modela o receptor. Propagação de almanaque existe apenas para a camada calculada da aba Análise; cinemática de rota de alta fidelidade está fora de escopo. Publicado em GitHub Pages e como HTML único offline. Leia `docs/00-visao-geral.md` antes de qualquer tarefa e `docs/05-roteiro.md` para saber o marco corrente.

## Fontes de verdade

1. `model/commands.json`: todo comando, parâmetro, faixa, alias e trava vem daqui. Não escrever comando SCPI à mão em código de produção; derivar do modelo.
2. `docs/04-discrepancias.md`: onde os manuais se contradizem. Tratamentos provisórios ficam todos em um único módulo (`quirks.ts`), cada um comentado com o ID `Dnn`.
3. Logs e golden files de bancada prevalecem sobre o manual. Quando um log contradiz o modelo, atualizar o modelo (com `verified_on_hw: true` e o ID da sessão em `notes`) e a tabela de discrepâncias no mesmo commit.

Os PDFs dos manuais ficam em `refs/` (ignorado pelo git). Se um detalhe não está no modelo nem nos docs, perguntar ou marcar como não verificado; não inventar comando, token de XML ou faixa.

## Regras

- Nunca gerar `*RST`, `GPS:CAL:*` (exceto consultas), `GPS:SYST:CPAS`. Respeitar `emit_allowed`.
- Nunca emitir `GPS:SIM:TRUN` diretamente; usar `@run` e `@stop`, que consultam o estado antes.
- Comandos destrutivos (`CLeaRall`, `CLeaR`, `REMove`) exigem confirmação explícita na UI e nunca em lote.
- Arquivos criados no equipamento pelo twin usam prefixo `twin_`.
- Nenhum dado de ensaio real no repositório: nomes de equipamentos sob teste, rotas de interesse, posições de laboratório, logs, resultados. Exemplos usam apenas coordenadas e nomes dos exemplos do manual. `scenarios/private/`, `golden/private/`, `logs/` e `refs/` são ignorados.
- A UI reproduz layout e comportamento do equipamento; não copiar logotipo, ícones ou marca da VIAVI.
- Na aba Análise, separar a camada declarada (lida do código) da calculada (propagação do almanaque do cenário). Céu calculado só no modo Fixado; no modo Referência, sempre rotulado como ilustrativo com a data do almanaque; no modo Não fixado, sem céu.

## Estilo de código

- TypeScript estrito. Funções puras no core; I/O e DOM só nas bordas.
- Unidades SI internas em todo o core. Conversão apenas na entrada e saída, conforme o modo de unidades do cenário.
- Ângulos em radianos internamente; graus só na interface e nos formatos de arquivo.
- Testes junto de cada módulo do core. Cada correção de bug vem com teste que falhava antes.

## Estilo de documentação

- Português, registro técnico de engenheiro para engenheiro: direto, impessoal, sem tom de conversa, sem explicar o óbvio, sem omitir o que é preciso para executar.
- Sem travessão (—). Usar vírgula, dois pontos, parênteses ou frase nova.
- Fórmulas em bloco de código em texto legível, não em LaTeX.
- Referenciar manual por `OP x-y` (operação), `RP x-y` (remoto), `DS` (datasheet).

## Comandos

Até o M0 existir, o repositório tem apenas ferramentas Python e PowerShell:

```
python tools/mock_minimal.py --port 5025
python runners/gpsg_run.py --script sessions/S01-sonda.scpi
pwsh runners/gpsg-run.ps1 -Script sessions/S01-sonda.scpi
python tools/make_pasteable.py --script sessions/S01-sonda.scpi --address <ip>
```

Teste rápido dos runners contra o mock (pausas e entrada do PRN alimentadas por stdin):

```
python tools/mock_minimal.py --port 5525 &
printf '\n\n5\n\n' | python runners/gpsg_run.py --port 5525 --script sessions/S01-sonda.scpi --time-scale 0.01 --quiet-ms 120
```

Resultado esperado hoje: `ERR=7 WARN=6`, todos provocados de propósito pela sonda (grafias alternativas e parâmetro travado).

Depois do M0: `npm test`, `npm run test:cov`, `npm run lint`, `npm run build`, `npm run build:single`, `npm run gen` (após mudar o modelo ou o schema). `npm run mock` a partir do M2.

## Ao terminar uma tarefa

- Rodar testes e build.
- Atualizar o guia de uso (`docs/guia/`) quando a tarefa mudar algo visível ao operador. A referência de comandos é gerada; não editar à mão.
- Atualizar `docs/05-roteiro.md` (marco e critério de aceite) se o escopo mudou.
- Atualizar a seção "Estado atual do repositório" de `docs/00-visao-geral.md`.
