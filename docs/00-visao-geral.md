# Visão geral

## Objetivo

Ferramenta web estática para preparar, reproduzir e documentar sessões com o simulador VIAVI GPSG-1000 sem ocupar o equipamento. O equipamento é compartilhado e tem pouca disponibilidade; toda configuração, rota, trajetória e sequência de comandos deve chegar à bancada pronta, validada e versionada.

Requisitos de origem:

1. Operar uma réplica da interface do GPSG-1000 e obter o código equivalente.
2. Carregar um código existente e ver o estado resultante na mesma interface, com mapa.
3. Rodar no navegador do PC da empresa, sem instalação. Publicação via GitHub Pages e build alternativo em HTML único.
4. Reprodutibilidade: um ensaio é definido por arquivos versionáveis, não por memória de quem operou.

## O que o twin é e o que não é

O twin é um configurador espelho do GPSG-1000. O operador mexe nos controles de uma réplica da interface do equipamento e o twin produz o código e os arquivos equivalentes; no sentido inverso, um código ou arquivo carregado coloca a réplica no estado correspondente. O código gerado é o registro do ensaio e a base da reprodutibilidade.

O twin não gera sinal nem modela o receptor sob teste. O que ele garante é que a configuração é válida para o equipamento (comandos, faixas, travas durante a execução, ordem das operações), que pode ser reaplicada de forma idêntica e que o operador consegue ver o que um código pede antes de levá-lo à bancada.

Duas abas:

1. **Equipamento**: réplica da interface. Mexer nos controles gera código; carregar código coloca as telas no estado correspondente.
2. **Análise**: leitura do cenário inteiro de uma vez, para validar um código gerado pela réplica ou trazido pronto. Detalhada na seção seguinte.

Escopo:

| Incluído | Fora de escopo |
|---|---|
| Réplica das telas e dos controles, com as mesmas faixas, unidades e travas | Geração de sinal |
| Geração de SCPI e do pacote USB a partir da réplica | Resposta do receptor sob teste |
| Leitura de SCPI, logs e arquivos exportados para a réplica | Cinemática de rota de alta fidelidade (o caminho exato percorrido pelo equipamento; a Análise mostra só uma estimativa em linha reta) |
| Linha do tempo de comandos em execução (ações por SV com horário) | Modelo de multipercurso e fading |
| Aba Análise com satélites calculados a partir do almanaque do cenário | |

## Aba Análise

Mostra o que o código pede e o céu que resulta dele. A interface distingue o que é lido do código do que é calculado.

**Camada declarada** (exata, lida diretamente do código):

- Linha do tempo: cada comando com horário relativo ao `@run`, descrição do modelo, parâmetros e unidades; ao clicar, destaca a linha no script e o campo na aba Equipamento.
- Estado em qualquer instante do cursor da linha do tempo: modo, portadora, porta, nível, perdas, relógio, posição ou rota.
- Rota e trajetória no mapa: pontos com nome, velocidade, raio de curva e razão de subida; segmentos entre pontos; avisos de pontos mais próximos que 4 raios de curva e de velocidade ou aceleração acima do modelo de movimento.
- Posição estimada na rota (Dynamic) no instante do cursor, com velocidade, rumo e trecho. Estimativa de baixa fidelidade, rotulada como aproximada: grande círculo entre pontos, velocidade constante no trecho igual à do ponto de saída, altitude interpolada linearmente, sem raio de curva, aceleração nem razão de subida. Loop ON fecha no primeiro ponto e repete; Loop OFF para no último ponto (não verificado em bancada). Sem estimativa para rota por arquivo, waypoint do banco sem coordenadas ou velocidade zero. A cinemática de alta fidelidade continua fora do escopo.
- Manipulações por SV ao longo do tempo: seleção, saúde, Doppler, coerência, offset de amplitude, step error, com duração.
- Orçamento de nível: RF Level programado, perdas inseridas, acoplamento e cabo, nível por SV e composto previsto na entrada do receptor, faixa permitida pela porta.

**Camada calculada** (exige o arquivo de almanaque Yuma do cenário):

O céu simulado é determinístico: o GPSG-1000 gera as efemérides a partir do almanaque carregado (OP 6-1), então almanaque, data, hora e posição definem quais satélites estão em visada e com que elevação e azimute. O twin faz a mesma propagação com o mesmo arquivo. O almanaque é, portanto, parte do cenário e entra no pacote e no script (`GPS:FIL:ALM:LOAD`); um cenário sem almanaque fixado não é reprodutível. O único ponto aproximado é a escolha do subconjunto quando há mais satélites visíveis que canais, feita pelo equipamento por critério de DOP mínimo não documentado em detalhe, e a máscara de elevação usada.

- Satélites visíveis no ponto e horário simulados: skyplot, elevação, azimute, DOP.
- Conjunto simulado: exato quando os visíveis cabem nos canais; quando não cabem, aproximação de DOP mínimo reavaliada a cada 60 min (OP 6-1), marcada como aproximada até ser validada contra log.
- Intensidade relativa por SV em PRN Signal VARIABLE, mais os offsets declarados.
- Checagens cruzadas: comando de SV para PRN fora de visada ou fora do conjunto provável; geometria resultante quando SVs são desligados (por exemplo, RAIM com menos de 5 SVs).

Três modos, indicados de forma permanente no topo da aba:

| Modo | Condição | O que aparece |
|---|---|---|
| Fixado | O script carrega um almanaque conhecido (`GPS:FIL:ALM:LOAD` ou `GPS:FIL:ALM:DEF`) e o mesmo arquivo está carregado no twin | Céu calculado, igual ao do equipamento |
| Não fixado | O script usa o almanaque que estiver carregado no equipamento | Sem céu; apenas os PRNs citados no código e aviso de que o resultado depende do estado do equipamento |
| Referência | Não fixado, com um almanaque recente carregado pelo usuário só para visualização | Céu marcado como ilustrativo, com a data do almanaque e o aviso de que pode diferir do simulado |

Recomendação de procedimento: fixar o almanaque em todo cenário de ensaio. O arquivo vai no pacote USB, é carregado pelo script e fica guardado junto do cenário. O almanaque padrão do equipamento (semana 574, 2010) é exportado na sessão 1; ele obriga datas de simulação próximas de 2010, que alguns receptores podem rejeitar, então para ensaio preferir um almanaque recente baixado uma vez e versionado com o cenário.

Fonte do almanaque: arquivo Yuma publicado pela USCG NAVCEN. O carregamento é manual (arquivo baixado e aberto no twin). Download automático pelo navegador depende de a fonte permitir CORS e de o proxy corporativo liberar o acesso; avaliar em M6 e, se inviável, manter só o carregamento manual. Quando houver log de bancada do mesmo cenário, o calculado é sobreposto ao reportado (`GPS:SVPR:GPS:LIST?`, `GPS:SIM:GPS:PRN?`).

Validação: o modelo de comandos é confirmado em bancada (sessão 1, `GPS:? ALL` e sonda de discrepâncias). Um cenário está correto quando o código gerado é aceito pelo equipamento sem erro e o estado lido de volta coincide com o da réplica.

## Saídas

Um cenário gera três artefatos, todos baixáveis:

1. **Pacote USB**: árvore `/Instrument/{almanacs,Kml,Nmea,Routes,Settings,Waypoint}` com settings XML, rota XML, trajetória NMEA/GDT e almanaque Yuma. Importado no equipamento por `IMPort`. Não exige nenhum software no PC da empresa. É o caminho preferencial para tudo que é configuração pré-execução.
2. **Script de sessão** (`.scpi`): comandos SCPI mais diretivas de execução (`@run`, `@wait`, `@poll`, etc., ver `02-interface-remota.md`). Necessário para ações em tempo de execução: manipulações por SV com horário definido, captura de verdade de referência, controle de início e fim.
3. **Folha de sessão** (`.md` ou impressão): checklist físico, conexões, perdas a inserir, nível de RF previsto na entrada do receptor, linha do tempo esperada.

E aceita como entrada, para o caminho reverso:

- `.scpi` e logs de sessão (reconstrói o estado e a linha do tempo).
- Settings XML e rota XML exportados do equipamento.
- Trajetórias `.nme` e `.gdt`.
- Almanaque Yuma `.alm`.

## Arquitetura

```
model/commands.json ----------------------+
                                          |
                     +--------------------v-------------------+
                     |              core (TypeScript)          |
                     |  parser SCPI  <-> estado <-> emissor     |
                     |  validação de faixa/trava/estado         |
                     |  serializadores: settings XML, rota XML, |
                     |  GDT, NMEA, waypoints CSV                |
                     +----+--------------+--------------+------+
                          |              |              |
                    UI web (réplica   mock TCP 5025   runners
                    + mapa de         (Node, usa o    (PowerShell,
                    exibição +         mesmo core)     Python)
                    timeline)
```

Decisões:

- **Fonte única**: o core lê `model/commands.json`. Parser, emissor, validação e a lista de campos da UI derivam dele. Nenhum comando é escrito à mão fora do modelo.
- **Mock do instrumento**: servidor TCP na porta 5025, em Node, usando o mesmo core. Permite depurar scripts e runners em casa antes da sessão. É a principal ferramenta para economizar tempo de equipamento.
- **Runners**: o navegador não abre socket TCP. A execução contra o equipamento é feita por runner em PowerShell (disponível em qualquer Windows corporativo) ou Python. Ambos interpretam o mesmo formato `.scpi`.
- **Estático**: sem backend. Cenários ficam em arquivos locais do usuário, abertos por seletor de arquivo e salvos por download.

## Stack

- Vite + TypeScript, sem framework pesado na primeira versão (a UI do equipamento é simples: abas, campos, tabelas).
- Leaflet para o mapa, com camada de tiles opcional. Sem rede (PC corporativo bloqueando tiles), cair para contorno costeiro embutido (Natural Earth 1:50m em GeoJSON) e grade de lat/long.
- Vitest para testes; testes de ida e volta (`emit(parse(x)) == x`) e golden files obtidos em bancada.
- `vite-plugin-singlefile` para gerar `dist/gpsg-twin.html` autocontido, que abre por duplo clique e funciona offline.

## Confidencialidade

GitHub Pages publica o site como público mesmo a partir de repositório privado (exceto em GitHub Enterprise Cloud com controle de acesso). Regras:

- O repositório e o site contêm apenas a ferramenta e exemplos genéricos (os do próprio manual).
- Nenhum cenário de ensaio real, nome de equipamento sob teste, rota de interesse, resultado ou log de bancada entra no repositório. `.gitignore` bloqueia `scenarios/private/`, `logs/` e `refs/`.
- Os PDFs da VIAVI não são redistribuídos. Ficam em `refs/` local. O modelo de comandos referencia número de página.

## Estado atual do repositório

Marcos M0, M1 e M2 concluídos (2026-10-21) e M3 concluído (2026-10-22). M4 implementado (2026-10-22), com aceite pendente da sessão de bancada. M5 concluído (2026-10-22), com a posição estimada na rota acrescentada em 2026-10-26. M6 não iniciado.

- `model/commands.json`: 233 comandos transcritos do manual remoto, com faixas, aliases, travas e referências de página. Nenhum verificado em hardware. `model/commands.schema.json` valida o modelo no início dos testes e gera os tipos TypeScript (`npm run gen`).
- `src/core/`: core puro em TypeScript (M1).
  - `model/`: carga do modelo, árvore de cabeçalhos (nós irmãos com a mesma forma curta fundidos: `SET` e `SETup`).
  - `scpi/`: tokenizador, resolução de cabeçalho com sugestão, conversão tipada dos parâmetros para SI, validação (faixa, `range_by_port`, `range_by_units`, enum, número de parâmetros, trava em execução, `emit_allowed`, `TRUN` direto, destrutivos), emissão de comando.
  - `script/`: parser do formato `.scpi` (diretivas, variáveis, linha do tempo nominal), formatação `preserve` e `canonical`.
  - `scenario/`: `Scenario` versionado (`scenario_version` 2, com migração da 1), redutor `applyCommand`, emissor canônico, caminho reverso script para cenário, JSON, limites de movimento.
  - `script/correct.ts`: correções de grafias conhecidas do manual (D05, D06, D25) e `TRUN` trocado por `@run`/`@stop`.
  - `quirks.ts`: tratamentos provisórios de `04-discrepancias.md`, por ID.
  - `files/`: formatos do pacote USB (M4): rota `.rte`, settings `.set`, waypoints `.csv`, trajetórias GDT e NMEA, almanaque Yuma, XML e ZIP mínimos, log dos runners para script, montagem do pacote e folha de sessão.
- `src/analysis/`: camada declarada da aba Análise (M5): eventos do script com alvo na réplica, estado no instante, checagens de rota, posição estimada na rota em linha reta (`route-progress.ts`, baixa fidelidade; o eixo da linha do tempo cobre uma volta da rota).
- `src/replica/`: lógica pura da réplica (M3): catálogo de campos ligado ao modelo (travas, faixas, validação), unidades e formatos de exibição, sessão (RUN/STOP, instante Elapsed, ações por SV, rota, waypoints, arquivos), formulários de rota e waypoint, anexos do pacote e importação de arquivos (`import.ts`). Aceite do M3 em `procedures.test.ts`.
- `src/docs/`: referência de comandos gerada do modelo e de `04-discrepancias.md`.
- `src/mock/`: instrumento simulado (`npm run mock`), TCP na porta 5025, usando o core (M2). Ver `02-interface-remota.md` seção 7.1.
- `src/runner/`: gerador do runner PowerShell colável, usado pelo site e por `npm run pasteable`.
- `test/integration/`: runners Python e PowerShell contra o mock com S01 e com scripts emitidos pelo twin, incluindo a reconstrução do cenário pelo log (`npm run test:integration`).
- `src/ui/`: shell com as abas Equipamento, Análise e Ajuda (guia de uso e referência de comandos com busca e filtros).
  - `analysis/`: linha do tempo com cursor e faixas por SV, estado no instante (com a posição estimada na rota), orçamento, mapa Leaflet com contorno embutido e marcador do receptor que acompanha o cursor, checagens de rota e eventos ligados ao script e à réplica.
  - `replica/`: réplica das janelas do capítulo 3 do manual de operação, teclado e seletores, editor de script CodeMirror 6 sincronizado com a réplica, linha do tempo das ações em execução, cenário salvo no navegador, exportação do pacote USB e abertura de pacotes, arquivos do equipamento e logs (`files-view.ts`).
  - `pasteable-view.ts`: gerador do runner colável, abaixo do editor. Oculto por enquanto (`SHOW_RUNNER` em `replica/app.ts`): sem ele na interface e sem o bloco no pacote USB; continua disponível por `npm run pasteable`.
- Builds: `dist/site/` (Pages) e `dist/gpsg-twin.html` (autocontido, abre por `file://`). CI em `.github/workflows/ci.yml`.
- `docs/`: esta documentação. `docs/guia/`: guia de uso para usuário geral (primeiros passos, rota, Análise, pendrive e painel, glossário), com a parte técnica em `08-referencia-rapida.md` e `09-avancado.md`.
- `runners/`: runner PowerShell e runner Python do formato `.scpi`.
- `sessions/S01-sonda.scpi`: script da primeira sessão de bancada.
