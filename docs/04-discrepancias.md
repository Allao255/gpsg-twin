# Discrepâncias entre documentos

Divergências entre o manual remoto (RP), o manual de operação (OP) e o datasheet (DS), e lacunas que afetam o twin. Cada item tem a parte do script `sessions/S01-sonda.scpi` que o resolve. Até a resolução, o twin adota o "tratamento provisório" e exibe o item como não verificado.

| ID | Divergência | Fontes | Tratamento provisório | Resolução |
|---|---|---|---|---|
| D01 | Faixa do step error: ±1000 m em 0,001 m; ±1 km em 0,1 m ou 32.808,4 ft (equivale a 10 km); ±10 km em 1 m | OP 3-16, OP 7-1, DS | Limitar a ±1000 m | S01 E4 |
| D02 | `SVPR:SAT`: assinatura com 8 parâmetros (com `duration`), exemplo com 7; Doppler int32 no Galileo e real64 no GPS; valores de `select` e `health` não enumerados | RP 12-2, RP 12-5 | Emitir 8 parâmetros; `ON/OFF`, `GOOD/BAD` | S01 E2, E3, E6 |
| D03 | `SVPR:LIST?`: cabeçalho com 10 campos, linhas de exemplo com 12; sinal do RFLevel inconsistente | RP 12-1, RP 12-4 | Parser tolerante; ordem provável SV, El, Az, RFLevel, AmpOffset, Doppler, Corr, Step, Duration, Health, Select, Simd | S01 E1 |
| D04 | Unidades: sessão começa em SI (RP 1-10) ou IMPERIAL (RP 10-21); `ROUT:ADD` com faixas em ft, ft/min, mph, ft/s², exemplo de `ROUT:LIST?` em SI; sintaxe do sufixo `[unit]` não exemplificada | RP 1-10, 9-1, 9-7, 10-21 | Forçar `UNIT SI` no início; sem sufixo | S01 B3, B4, C1, C2 |
| D05 | Porta de RF: `GPS:SETUP:RFPORT` (exemplo cap. 14), `GPS:SET:RFPoRt` alias `RFPR` (cabeçalho), `GPS:SET:PORT` (exemplo do próprio comando) | RP 10-15, 14-1 | Emitir `GPS:SET:RFPR` | S01 B1 |
| D06 | `STYP` e `STYPE` (cap. 14); `PSRC "USER"` com aspas | RP 14-2 | `STYP`, sem aspas | S01 B2 |
| D07 | Formato de lat/long em `SIM:LAT/LONG`: faixa escrita como `90,00.0000,N`, exemplo `105,45.8912,W` e exemplo decimal `45.3458` | RP 11-4 | Decimal com sinal | S01 B5 |
| D08 | Linha de rota: 1..100 (cabeçalho), 1..9999 (`DEL`, `DISP?`), 1..10000 (`EDIT`); UI até 9999 pontos | RP 9-4, 9-5, OP 3-18 | 1..9999 | `GPS:? ROUTE` em S01 A3 |
| D09 | `CHAN:SBAS` faixa 1..4 com exemplo 6; UI 0..4; `CHAN:SINGLE` citado em `APPL` e não documentado; default dual 3/3/0 (RP) e 6/6/0 em 12 canais (OP) | RP 10-22 a 10-26, OP 3-13 | Não emitir alocação de canais na v1 | S01 A3, B7 |
| D10 | PRN Galileo 1..36 (RP, DS) e 1..30 (OP 7-1) | | 1..36 | S01 A3 |
| D11 | Portadoras: UI tem `L1 no P(y)`, enums remotos não; sobreposição de `CARR` com `CRGP`, `CRGA`, `CRGG`; tabela de especificação atribui 1191,795 MHz ao E5a (é o centro do E5) | RP 10-1 a 10-4, OP 3-5, OP 7-1 | Emitir `CARR` com os tokens do RP | S01 A3, D1 a D3 |
| D12 | Relógio: UI tem INTERNAL, remoto só `GPSRX` e `USER`; procedimento estático do manual usa Internal | RP 10-4, OP 3-7, OP 4-2 | `USER` | S01 B8 |
| D13 | PRN Signal: opção "Traj File" na UI (Apêndice E), remoto só `VARIABLE` e `FIXED` | RP 10-13, OP E-5 | Não emitir | S01 B8 |
| D14 | `SLOS` faixa 0..10, exemplo 12,2 | RP 10-18 | 0..10 | S01 A3 |
| D15 | `GPSR:RTRJ` inicia gravação; forma de parar não descrita (provavelmente alternância) | RP 8-4 | Não emitir | Teste manual com `RTRJ?` |
| D16 | `:SYST:ERR?` citado no cap. 1, sem tabela de códigos | RP 1-4 | Registrar código e texto | Acumular dos logs |
| D17 | Semântica de RF Level: nível por SV (implícito com FIXED) ou composto; efeito exato das perdas na faixa; se é alterável em execução | RP 10-15, OP 3-3, OP 3-6 | Por SV; perdas deslocam a faixa pela parte inteira | S01 E7 e medição com analisador |
| D18 | Semântica do step error (absoluto ou incremental) e da duração (só Doppler ou todos os erros) | OP 3-16 | Absoluto; duração só para Doppler | S01 E5, E6 com receptor de referência com medidas brutas |
| D19 | Precisão e formatação numérica das respostas (`SIM:LAT?` com 15 casas, `HEAD?` com símbolo de grau, aspas variáveis) | RP cap. 11 | Parser tolerante: remover aspas, unidade e símbolo | S01 E8 |
| D20 | `GPS:SIMU:SPeeD?` com nó `SIMU`, os demais com `SIM` | RP 11-5 | Emitir `GPS:SIM:SPD?` se aceito | S01 B6 |
| D21 | `DIAG:FREQ` aceita 1278 (E6), que não aparece em nenhuma lista de portadora | RP 6-3 | Expor só como diagnóstico | `GPS:? DIAG` |
| D22 | Fading: remoto `VEHICLE`, `AIRCRAFT`; UI "Land Vehicle", "Aircraft"; tabela "Land", "Aeronautical" | RP 10-9, OP 3-6, OP 3-10 | Tokens do RP | S01 D1 a D3 |
| D23 | Modelo de movimento: remoto `AUTOMOTIVE`, UI e settings XML `Automobile` | RP 10-5, OP D-7 | Token do RP no SCPI, token do XML no XML | S01 D3 |
| D24 | Almanaque: não há `GPS:FIL:ALM:SAVe` remoto. Almanaque obtido por `GPS:GPSR:REL` e `GPS:FIL:ALM:REL` fica em memória; salvar em arquivo só pela UI (Manage Almanacs). Formato de retorno de `GPS:FIL:ALM:FNAM?` para almanaque em memória não salvo não documentado | RP 7-1 a 7-3, OP 3-32 | Cenário de ensaio sempre carrega almanaque de arquivo por `LOAD` | S01 A2, G1; teste manual com almanaque do receptor interno |
| D25 | Exemplo de `GPS:FILe:KML:SamplingTIMe` escrito `GPS:FILE:KML:STIME 4 Hz`: `STIME` não é a forma curta (`STIM`) nem a longa (`SAMPLINGTIME`) | RP 7-11 | Emitir `STIM`; `STIME` rejeitado pelo parser com referência a D25 | `GPS:? FILE` em S01 A3 |
| D26 | Faixas de posição e rota na UI diferem do RP: altitude 0 a 100.000 ft ou 0 a 18.288 m (valores não equivalentes; RP -3.281 a 100.000 ft); raio de curva 3,281 a 328.084 ft ou 1 a 100.000 m (RP a partir de 0); velocidade 0 a 1.150 mph ou 0 a 1.850,745 km/h (RP 1.150,003 mph); razão de subida ±1.800 m/min | OP 3-3, 3-21, 3-22; RP 9-1 | Réplica valida pelas faixas do RP (modelo) | Teste manual na tela Route Edit e S01 C |
| D27 | Limites de movimento: UI com máximo de 328,083 ft/s² (100 m/s²) e 1.150,782 mph, 1.852 km/h ou 999 kt; settings XML com Unlimited em 98 m/s² e 514,10 m/s | OP 3-12, OP D-7 | Valores do settings XML como limites de fábrica (`01-equipamento.md` seção 4); entrada do CUSTOM sem faixa | S01 A4, B3, B4 (`MLAT?`, `MVEL?`) |
| D28 | Waypoint: UI tem o campo Country; remoto tem `state` (`WAYP:NEW`, `WAYP:EDIT`, `WAYP:DISP?`) | OP 3-26, RP 13-2 a 13-4 | Campo único rotulado Country/State, emitido como quinto parâmetro | Teste manual: criar pela UI e ler por `WAYP:DISP?` |

## Observações sem impacto direto

- `*IDN?` de exemplo retorna fabricante `Aeroflex`; unidades atuais podem retornar `VIAVI` ou `Cobham`. O twin não deve depender do fabricante.
- O manual remoto cita "GPS-1010" e "GPST-1000" em trechos copiados; tratar como erro de edição.
- Os exemplos explicativos de NMEA no Apêndice D têm hora e data inconsistentes com as próprias sentenças.

## Procedimento de atualização

1. Após cada sessão, comparar o log com esta tabela.
2. Para cada item resolvido: atualizar `model/commands.json` (faixa, tokens, `verified_on_hw: true`, nota com o ID da sessão), mover o item para a seção "Resolvidos" abaixo com o resultado observado e remover o tratamento provisório do código.
3. Itens novos recebem o próximo ID livre.

## Resolvidos

Nenhum até a sessão S01.
