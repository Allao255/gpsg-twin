# Roteiro de implementação

Marcos em ordem de dependência. Cada marco termina com testes passando e um critério de aceite verificável. A sessão 1 de bancada usa apenas os runners já entregues e pode acontecer antes de M0.

## M0. Base do projeto

- Vite + TypeScript estrito, ESLint, Prettier, Vitest.
- Tipos a partir de `model/commands.json`; carga do modelo validada por schema na inicialização dos testes.
- Dois builds: site para GitHub Pages (`base` relativo) e `dist/gpsg-twin.html` autocontido (`vite-plugin-singlefile`).
- GitHub Actions: testes, build, publicação em Pages, upload do HTML único como artefato.

Aceite: `npm test` e `npm run build` limpos; o HTML único abre por `file://` sem rede.

## M1. Core: modelo, parser, emissor, validação

- Tokenizador SCPI: forma longa e curta, aliases do modelo, sem diferenciar caixa, strings com aspas simples ou duplas e aspas duplicadas, números inteiros, decimais, `#B`, `#H`, sufixo de unidade.
- Resolução de cabeçalho para a entrada do modelo, com mensagem de erro que sugere o comando mais próximo.
- Validação: tipo, faixa (incluindo `range_by_port` e `range_by_units`), enum, número de parâmetros, `kind`, `locked_while_running` contra o estado, `emit_allowed`.
- Estado do cenário (`Scenario`): todos os parâmetros de Setup, I/O, Motion, Channels, posição estática, rota, waypoints de usuário, arquivos a carregar, ações por SV com horário. Serializa em JSON versionado (`scenario_version`).
- Emissor canônico: forma curta, um comando por linha, ordem determinística (configuração antes de `@run`, ações em execução por `@at`).
- Parser do formato `.scpi` com diretivas (`02-interface-remota.md` seção 5), variáveis e linha do tempo.
- Tratamentos provisórios de `04-discrepancias.md` centralizados em `quirks.ts`, cada um com o ID da discrepância.

Aceite: todos os `example` do modelo passam por parse sem erro, ou falham com erro documentado na discrepância correspondente; `emit(parse(s))` é idempotente para os scripts de `sessions/`; cobertura do core acima de 90%.

Decisões tomadas na implementação (2026-10-21):

- A idempotência vale para os dois modos de formatação de script (`preserve` e `canonical`, `02-interface-remota.md` seção 5.1). O modo `preserve` reproduz S01 byte a byte; o `canonical` reescreve conforme as regras de emissão e por isso não serve para sondas.
- Ida e volta de cenário: `emit(fromScript(emit(c))) == emit(c)`, testada em cenários fixos e em 60 cenários gerados com semente fixa.
- `Scenario` cobre uma configuração e uma execução. Script com vários `@run` é tratado inteiro como `ScriptDoc`; a conversão para cenário cobre a primeira execução e emite diagnóstico.
- D17: perdas consideradas por porta, não verificado: COUPLER = acoplador + cabo do acoplador + divisor; DIRECT = cabo direto + divisor.
- D25 criada (exemplo `STIME` de `KML:SamplingTIMe`).
- A aba Equipamento traz um verificador de script provisório (diagnósticos, linha do tempo e forma canônica) até o editor do M3.

## M2. Mock do instrumento e runners

- Servidor TCP em Node na porta 5025 usando o core: fila de erros, `GPS:STAT?`, alternância de `TRUN`, rejeição de parâmetros travados durante execução, respostas no formato do manual (aspas, multilinha). Respostas de consulta refletem o estado configurado; não há simulação.
- Testes de integração em CI executando os dois runners contra o mock com os scripts de `sessions/`.
- Variante "colável" do runner PowerShell gerada pelo próprio site.
- Substituir `tools/mock_minimal.py`.

Aceite: S01 roda completo contra o mock nos dois runners, com log conforme a especificação.

Decisões tomadas na implementação (2026-10-21):

- Códigos de erro SCPI padrão no mock, com o diagnóstico do twin no texto; a tabela real do equipamento fica para os logs (D16).
- Sem geometria: lista fixa de PRNs com a simulação rodando; elevação e azimute são marcadores.
- Além de S01, os testes de integração rodam scripts emitidos pelo twin e conferem que o estado final do mock coincide com o cenário.
- `tools/mock_minimal.py` e `tools/make_pasteable.py` removidos; substituídos por `npm run mock` e `npm run pasteable`. O mock exige Node; sem Node no PC da bancada, o mock roda em outra máquina da rede.
- S01 C passou a usar valores de rota válidos em SI e IMPERIAL; a sonda da unidade de subida ficou isolada em C2.

## M3. Réplica da interface (marco central)

- Telas conforme o manual de operação, capítulo 3: Simulation (abas GPS, Galileo, SBAS), Setup (Simulation, Channels, I/O, Motion), SV PRN (tabelas e janela de edição), Route (lista e edição), Waypoint (lista e edição), File (Almanacs, Routes, Settings, Trajectory, Kml, Waypoints), GPS RX (somente leitura), Diagnostics.
- Comportamento igual ao equipamento: campos travados com cadeado durante a execução ou conforme o modo (latitude travada em DYNAMIC, por exemplo), faixas e passos de cada campo, teclado numérico e seletores, unidades e formato de lat/long conforme o Setup, perdas deslocando a faixa de RF Level, Digital Noise acompanhando a porta.
- Estilo das figuras do manual: fundo preto, campos com contorno azul arredondado, abas em pílula, barra lateral de lançamento, indicador Running/Ready. Fidelidade de layout e comportamento, não de pixel; sem logotipo ou ícones do fabricante.
- Botão RUN/STOP da réplica alterna o estado de execução do cenário; a partir daí, o que for alterado na réplica entra na linha do tempo como ação em execução (`@at`).
- Tela SV PRN offline: a tabela aceita PRNs informados pelo operador, importados de um `GPS:SVPR:GPS:LIST?` de log ou, após M6, preenchidos pela camada calculada.
- Editor de script lado a lado (CodeMirror 6). Alterar a réplica atualiza o script; editar o script atualiza a réplica; erros aparecem na linha e no campo.

Aceite: os procedimentos 4.1.2, 4.1.3 e 4.1.4 do manual de operação podem ser executados na réplica e geram scripts equivalentes aos do capítulo 14 do manual remoto, com as correções de `quirks.ts`; carregar esses scripts de volta reproduz as mesmas telas.

## M4. Pacote USB e caminho reverso

- Exportação em `.zip` da árvore `/Instrument/...` com settings XML, `.rte`, `.gdt` ou `.nme`, `.csv` de waypoints e almanaque fornecido pelo usuário, mais `session.scpi`, runner colável e folha de sessão.
- Importação de qualquer um desses arquivos e de logs CSV para reconstruir estado e linha do tempo na réplica.
- Settings XML só com tokens observados em golden files; campos não observados geram aviso.

Aceite: um cenário exportado, importado no equipamento e exportado de volta produz settings XML e rota equivalentes (comparação semântica).

## M5. Aba Análise, camada declarada

Especificação em `00-visao-geral.md`, seção "Aba Análise".

- Linha do tempo com cursor; estado do cenário no instante do cursor; ligação bidirecional com o script e com a aba Equipamento.
- Mapa (Leaflet, fallback sem tiles): posição estática, rota com atributos por ponto, trajetória importada; clique no mapa preenche latitude e longitude do campo ativo. Segmentos retos entre pontos; sem cinemática.
- Avisos de rota equivalentes a `GPS:ROUT:VALD` que dependem só dos dados declarados (distância entre pontos menor que 4 raios, velocidade e aceleração acima do modelo de movimento).
- Tabela e gráfico das manipulações por SV ao longo do tempo.
- Orçamento de nível (`01-equipamento.md` seção 2).

Aceite: scripts do capítulo 14 do manual e S01 exibidos com linha do tempo, mapa e orçamento corretos; clicar em qualquer evento leva à linha do script e ao campo correspondente.

## M6. Aba Análise, camada calculada

- Parser Yuma; resolução de rollover de semana pela data de simulação.
- Propagação do almanaque conforme IS-GPS-200, ECEF para ENU do ponto simulado (ou do ponto da rota no instante do cursor, interpolado em linha reta), elevação, azimute, visibilidade, DOP.
- Conjunto simulado: todos os visíveis quando cabem nos canais; caso contrário, aproximação de DOP mínimo reavaliada a cada 60 min, respeitando substituições manuais do script, marcada como aproximada.
- Modos Fixado, Não fixado e Referência (`00-visao-geral.md`, seção "Aba Análise"), com indicação permanente do modo e, no modo Referência, rótulo de ilustrativo e data do almanaque.
- Detectar o modo a partir do script: presença de `GPS:FIL:ALM:LOAD` ou `GPS:FIL:ALM:DEF` antes do `@run` e correspondência com o arquivo carregado no twin.
- Avaliar download automático do Yuma da NAVCEN pelo navegador (CORS, proxy). Se inviável, só carregamento manual.
- Skyplot com cor por estado (simulado, visível fora do conjunto, desligado pelo script, saúde BAD) e tamanho ou cor por intensidade relativa (RF Level, PRN Signal, offsets).
- Checagens cruzadas listadas em `00-visao-geral.md`.
- Sobreposição com log de bancada quando disponível.

Aceite: com o almanaque padrão (semana 574) e o cenário E0 de S01, elevação e azimute dentro de 0,5° do log de bancada e mesmo conjunto de SVs. Até existir o log, aceite por comparação com uma implementação de referência (por exemplo, propagação Yuma em Python com teste cruzado).

## M7. Relatório de sessão

- A partir do log: linha do tempo, comandos com erro, `@expect` PASS e FAIL, estado lido do equipamento comparado ao estado da réplica.
- Sugestão de atualizações para `04-discrepancias.md` e `model/commands.json`.

Aceite: relatório gerado offline para o log de S01.

## Documentação de uso (contínua, a partir de M1)

Documentação para quem opera o twin e o equipamento, derivada de `docs/` e de `model/commands.json`, mais curta e orientada a tarefa. Os documentos técnicos de `docs/` continuam sendo a referência de projeto; a documentação de uso não repete justificativas nem discrepâncias, só o que é preciso para operar.

- **Referência de comandos gerada** (a partir de M1): página produzida no build a partir de `model/commands.json`, com busca. Por comando: forma longa e curta, parâmetros com faixa e unidade, se trava durante a execução, exemplo, página do manual, estado de verificação em bancada e link para a discrepância quando houver. Nunca editada à mão.
- **Guia de uso** (`docs/guia/`, publicado como aba Ajuda no site, a partir de M3): primeiros passos; montar um cenário na aba Equipamento; carregar um script e conferir na aba Análise; exportar pacote USB; executar na bancada com o runner (PowerShell, variante colável, Python); ler o log. Uma página por tarefa, passos numerados, captura de tela da réplica quando ajudar.
- **Folha de bancada de uma página** (a partir de M4): conexões, ordem de operações, regras do equipamento compartilhado (backup, prefixo `twin_`, nunca `*RST`), o que fazer se o script parar no meio. Formato para impressão.
- **Referência rápida do GPSG-1000** (a partir de M3): resumo de `docs/01-equipamento.md` em uma página: faixas de nível, perdas, manipulações por SV, conector Aux, formatos de arquivo.

Regras: mesmo estilo de `CLAUDE.md` (sem travessão, impessoal, engenheiro para engenheiro); cada página do guia é revisada no mesmo commit da funcionalidade que descreve; a referência de comandos é regenerada em todo build.

Aceite: aba Ajuda presente no site e no HTML único; referência de comandos com os 233 comandos e filtro por categoria e por "verificado em bancada".

## Opcionais, fora do escopo principal

- Gerador de arquivo de trajetória (GDT/NMEA) a partir de pontos e perfil de velocidade, para ensaios de deriva gradual. Gera arquivo; não simula.
