# Sessão 1: procedimento de bancada

Objetivo: em uma janela curta de equipamento, sair com a lista oficial de comandos do firmware, as discrepâncias resolvidas, golden files de todos os formatos e dois logs de referência (estático e dinâmico) do comportamento do equipamento. Nenhum DUT é necessário.

## Material

| Item | Uso | Obrigatório |
|---|---|---|
| PC com o runner (PowerShell ou Python) | Executar `S01-sonda.scpi` | sim |
| Cabo de rede e, se preciso, switch | Ethernet do GPSG-1000 | sim |
| Pendrive FAT32 dedicado | Exportação dos golden files | sim |
| Carga 50 Ω TNC ou atenuador | Terminar a porta DIRECT durante a parte E | sim, se não houver receptor |
| Receptor de referência com medidas brutas (u-blox M8T, F9P ou similar) mais atenuador | Observar pseudodistância, Doppler e C/N0 por SV para D17 e D18 | recomendado |
| Cabo DB-26 para Aux com adaptador USB-serial | Gravar o NMEA de verdade do pino 8 (4800 8N1) | recomendado |
| Analisador de espectro | Nível real na porta | opcional |

O receptor de referência transforma perguntas sem resposta pela interface remota (o degrau é absoluto ou incremental? qual a latência entre o comando e o efeito? o nível é por SV?) em medidas diretas. Com ele, a parte E fecha D17 e D18; sem ele, ficam pendentes.

## Antes do dia

1. Rodar o script contra o mock na mesma máquina que irá à bancada:
   ```
   python tools/mock_minimal.py
   powershell -ExecutionPolicy Bypass -File runners/gpsg-run.ps1 -Address 127.0.0.1 -Script sessions/S01-sonda.scpi
   ```
   Se a política de execução bloquear, usar a variante colável (seção 7 de `02-interface-remota.md`).
2. Confirmar quem usou o equipamento por último e se há configuração que precisa ser preservada. O script salva e restaura, mas a pessoa deve saber.
3. Levar o IP do equipamento (System, System Configuration, Network) ou planejar ligação direta com IP estático nos dois lados.

## No laboratório

1. Ligar o GPSG-1000 e conferir a tela Network. Em ligação direta, configurar o PC na mesma sub-rede.
2. Testar conectividade:
   ```
   Test-NetConnection <ip> -Port 5025
   ```
3. Conectar a porta DIRECT à carga ou, pelo atenuador, ao receptor de referência. Nada ligado à porta COUPLER. Nada irradiando.
4. Se houver, ligar o cabo Aux e iniciar a gravação serial do NMEA de verdade em arquivo, e iniciar o log bruto do receptor de referência.
5. Executar:
   ```
   powershell -ExecutionPolicy Bypass -File runners/gpsg-run.ps1 -Address <ip> -Script sessions/S01-sonda.scpi -Log logs/S01_<data>.csv
   ```
6. Responder aos `@pause` e ao `@input` do PRN (escolher um PRN alto em elevação na resposta de `GPS:SVPR:GPS:LIST?`).
7. Na parte G, inserir o pendrive; aguardar o fim de cada exportação (`GPS:STAT?`).
8. Ao final, conferir na tela que o settings e a rota do usuário anterior foram restaurados. Se o script tiver sido interrompido, carregar manualmente `twin_bkp_s01` e `twin_bkp_s01.rte`.

## Depois

1. Copiar `logs/S01_<data>.csv`, o NMEA da Aux, o log do receptor de referência e o conteúdo do pendrive para uma pasta fora do repositório.
2. Processar o log contra `04-discrepancias.md`; atualizar `model/commands.json` com `verified_on_hw: true` nos comandos confirmados e as faixas e tokens observados.
3. Gerar golden files sanitizados (sem arquivos de terceiros, sem posições de interesse) para `golden/`, e os completos em `golden/private/`.
4. Remover do equipamento `twin_bkp_s01` e `twin_bkp_s01.rte` depois de confirmada a restauração.

## Tempo estimado

| Parte | Conteúdo | Tempo |
|---|---|---|
| A | Identificação, backup, `GPS:? ALL`, snapshot | 3 min |
| B | Sintaxe e unidades | 3 min |
| C | Rota | 2 min |
| D | Tokens de settings | 3 min |
| E | Execução com RF, manipulações por SV, verdade a 1 Hz, dinâmico de 2 min | 10 min |
| G | Exportação | 3 a 5 min |
| F | Restauração e limpeza | 2 min |
| | Conexões, imprevistos | 10 min |
