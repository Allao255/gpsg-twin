# GPSG-1000: características relevantes para os ensaios

Consolidação do manual de operação (22165258 Rev. 502), do manual de programação remota (22165259 Rev. 501) e do datasheet. Referências no formato `OP x-y` (operação), `RP x-y` (remoto) e `DS` (datasheet). Itens marcados com `Dnn` têm divergência entre documentos; ver `04-discrepancias.md`.

## 1. Arquitetura do gerador

- Portadora única por vez (OP 1-2, OP 7-1). GPS e Galileo podem ser misturados na mesma portadora (L1/E1 ou L5/E5). Não há como emitir L1 e L2 ao mesmo tempo.
- 6 ou 12 canais, conforme opção instalada (`GPS:SET:CHAN:AVAL?`). SBAS em AUTO consome canal: restam 5 ou 11 SVs GNSS (OP 3-6).
- Efemérides geradas por extrapolação do almanaque Yuma carregado. Elementos de efeméride ausentes no almanaque são zerados. Nova efeméride a cada 4 h. Posições calculadas em tempo real (OP 6-1).
- Consequência: a constelação simulada não coincide com a real. O manual exige que o receptor sob teste não receba o céu real durante a simulação (OP 4-3).
- Seleção automática de SVs aproximando o DOP mínimo, refeita a cada 60 min. Substituição manual permitida; o SV escolhido manualmente permanece até sair de visada (OP 6-1).
- Não há entrada de céu real nem retransmissão (o receptor interno serve apenas para almanaque, hora, posição e gravação de trajetória).

## 2. Saídas de RF e níveis

| Item | Valor | Ref. |
|---|---|---|
| Porta DIRECT | -155 a -93 dBm, passo 1 dB, ±2 dB | OP 7-1 |
| Porta COUPLER | -130 a -68 dBm, passo 1 dB, ±2 dB | OP 7-1 |
| Offset de amplitude por SV | ±15 dB, passo 0,1 dB | OP 3-16 |
| Espúrios | < -35 dBc em 40 MHz | OP 7-1 |
| Harmônicos | < -45 dBc | OP 7-1 |
| Isolação DC na saída | 50 V | OP 7-1 |
| Potência reversa máxima na porta TX | 100 mW | OP viii |
| Entrada RX (receptor interno) | máximo -20 dBm | OP viii |
| Acoplador: acoplamento | -21,5 dB típico em 1575,42 MHz | OP 7-3 |
| Acoplador: isolação | > 25 dB, 30 dB típico | OP 7-3 |
| Cabo coaxial fornecido | 50 ft, perda calibrada marcada no cabo | OP 7-5 |

Perdas inseríveis (OP 3-14, RP 10-2 a 10-18): acoplador 0 a 40 dB, cabo do acoplador 0 a 12 dB, cabo direto 0 a 12 dB, divisor 0 a 10 dB, resolução 0,1 dB. A parte fracionária é compensada elevando a saída; a parte inteira é subtraída da faixa de nível disponível. Interpretação a confirmar (D17): com as perdas inseridas, o valor de RF Level passa a significar o nível entregue no receptor.

Nível por SV e nível composto: com PRN Signal = FIXED, todos os SVs saem no RF Level (OP 3-6). A potência composta na saída é

```
P_total = RF_Level + 10*log10(N_sv)        (12 SVs: +10,8 dB)
```

Com VARIABLE, os níveis relativos seguem a geometria (pseudodistância).

Orçamento típico no acoplador sobre a antena:

```
P_antena = RF_Level(porta COUPLER) - perda_cabo - acoplamento(21,5 dB)
céu real residual sob o acoplador = P_real - isolação (>= 25 dB)
```

Para o manual, -115 a -120 dBm é adequado para a maioria dos receptores (OP 4-2). Sensibilidade típica de rastreio citada: -142 dBm (OP 4-9). Relação C/N0 linear com potência abaixo da saturação do chipset (tabela OP 4-11).

## 3. Sinais e serviços

| GNSS | Portadora | Serviços |
|---|---|---|
| GPS | L1 | C/A, pseudo P(Y) |
| GPS | L1 no P(y) | C/A |
| GPS | L1C | L1C |
| GPS | L2 | L2C, pseudo P(Y) |
| GPS | L5 | SoL |
| Galileo | E1 | I/NAV, pseudo G/NAV |
| Galileo | E5, E5a, E5b | I/NAV, F/NAV |
| GPS+Galileo | L1/E1, L5/E5 | combinação |
| SBAS | L1, L5 | WAAS/EGNOS, PRN 120 a 138 |

P(Y) e G/NAV são códigos pseudoaleatórios longos sem criptografia real (OP 7-2). Não há M-code nem SAASM: receptores que dependem de código criptografado não podem ser ensaiados nesses sinais.

## 4. Dinâmica e precisão

| Item | Valor | Ref. |
|---|---|---|
| Velocidade relativa máxima (range rate) | ±1000 kt (514 m/s) | OP 7-3 |
| Jerk relativo máximo | ±500 m/s³ | OP 7-3 |
| Altitude máxima | 100.000 ft | OP 7-3 |
| Pseudodistância | < 0,1 m | OP 7-3 |
| Taxa de pseudodistância | < 0,01 m/s RMS | OP 7-3 |
| Delta de pseudodistância | < 2 mm RMS | OP 7-3 |
| Alinhamento de código entre canais | ±0,02 m RSS | OP 7-3 |
| Alinhamento de portadora entre canais | ±0,265 mm RSS | OP 7-3 |
| Pontos de rota | até 9.999 | OP 3-18 |

Limites dos modelos de movimento (valores de fábrica, settings XML em OP D-7, SI):

| Modelo | Acel. lateral (m/s²) | Acel. longitudinal (m/s²) | Velocidade (m/s) |
|---|---|---|---|
| Pedestrian | 2,94 | 2,94 | 10,72896 (24 mph) |
| Automobile | 9,8 | 9,8 | 89,408 (200 mph) |
| Marine | 6,86 | 6,86 | 44,704 (100 mph) |
| Low Performance Aircraft | 19,6 | 9,8 | 223,52 (500 mph) |
| High Performance Aircraft | 88,2 | 49 | 447,04 (1000 mph) |
| Custom | editável | editável | editável |
| Unlimited | 98 | 98 | 514,096 (1150 mph) |

Trajetórias (NMEA/GDT) usam sempre os limites de Unlimited (OP 3-8). Rotas são validadas contra o modelo corrente (`GPS:ROUT:VALD`, resultado em `GPS:STAT?`).

Regras de rota (OP 3-21):

```
raio_minimo = v^2 / a                 (v em m/s, a em m/s^2)
distância entre pontos > 4 * raio_de_curva
```

## 5. Manipulações por SV em tempo de execução

Janela SV PRN Edit (OP 3-16) e `GPS:SVPR:GPS:SAT` (RP 12-5). Aplicáveis com a simulação rodando.

| Parâmetro | Faixa | Uso |
|---|---|---|
| Select | ON, OFF, substituir | Geometria ruim, perda de SV, teste de RAIM com N reduzido |
| Health | GOOD, BAD (Galileo: CONNECTED, DISCONNECTED) | Exclusão por saúde na mensagem de navegação |
| Doppler error | ±5 kHz, passo 1 Hz, com duração (padrão 3600 s) | Degrau de Doppler (RAIM, consistência código/portadora) |
| Code/carrier coherence | faixa de 2 m/s, passo 1 mm/s | Divergência código/portadora |
| Amplitude offset | ±15 dB, passo 0,1 dB | Sobrepotência ou atenuação de SV individual |
| Step error | ±1000 m em 0,001 m (OP 3-16); ±1 km ou 32.808 ft (OP 7-1); ±10 km em 1 m (DS) | Degrau de pseudodistância (D01) |

Implicação para desenho de ensaio. Essas manipulações produzem observáveis inconsistentes entre si (degrau de código sem degrau de portadora, Doppler fora da dinâmica). Servem para exercitar monitores de integridade (RAIM/FDE, filtros de suavização de código, checagem código/portadora). Um céu falso consistente, que é o caso realista de spoofing contra um receptor que já perdeu o céu verdadeiro, se faz por rota ou trajetória: o simulador gera código, portadora e mensagem coerentes com o movimento.

Deslocamento de posição por degraus de pseudodistância. Para um deslocamento aparente `dr` (ENU, metros) com vetores de visada unitários `e_i` calculados de elevação e azimute:

```
e_i   = [ cos(el_i)*sin(az_i),  cos(el_i)*cos(az_i),  sin(el_i) ]    (E, N, U)
s_i   = -(e_i . dr) + b                                              (step error do SV i)
```

`b` é comum a todos os SVs e vai para o relógio do receptor; um degrau igual em todos os SVs não move a posição. O twin deve oferecer esse cálculo usando elevação e azimute lidos de `GPS:SVPR:GPS:LIST?` ou previstos pelo modelo L1, e deve indicar que o resultado é um salto e não uma rampa. Semântica do step error (valor absoluto ou incremental, efeito da duração) a confirmar (D18).

## 6. Tempo, almanaque e trajetória

- Fonte de relógio: GPSRX (receptor interno), USER (data e hora digitadas) e, só na UI, INTERNAL (RTC do equipamento) (D12). Com USER, a data e hora de início são arbitrárias: permite ensaios de tempo (data muito à frente ou atrás, proximidade de segundo intercalar; o manual afirma que o anúncio de leap second é transmitido a partir de cerca de 60 dias antes, OP 3-7).
- O manual recomenda almanaque datado ao menos um dia antes da simulação; alguns receptores não fixam com tempo anterior ao almanaque (OP 4-3).
- Almanaque padrão: semana 574, 22/08/2010 (OP 3-32). O almanaque Galileo é fixo.
- Trajetória NMEA: precisa de GGA ou RMC; sem RMC, a data vem do Setup. Para reproduzir a constelação da gravação, carregar o almanaque da mesma semana (OP 4-7). Com "Traj File" no PRN Signal (só UI, D13), o nível por SV acompanha o SNR gravado.
- Gravação: o receptor interno grava NMEA a 1 Hz em `MMDDYYYY_HHMMSS.nme` (requer fixo 3D).
- KML: convertido no equipamento para `.gdt` com velocidade máxima, taxa de amostragem (1, 2, 4, 5 Hz) e raio mínimo de curva.

## 7. Interfaces de sincronismo e de verdade de referência

Conector Aux, DB-26 (OP A-3):

| Pino | Sinal | Uso no ensaio |
|---|---|---|
| 19 | Trigger in, LVTTL 3,3 V, borda de subida, push-pull | Início da simulação sincronizado com SDR, gravador ou DUT (`GPS:SET:TSRC EXTERNAL`) |
| 17 | Trigger out, LVTTL 3,3 V | Marca de tempo para osciloscópio ou gravador |
| 25 | 1 PPS, alinhado ao RF em ±30 ns típico | Referência temporal do céu simulado |
| 8 | RS-232 TX, NMEA GGA, RMC, GSV do que está sendo emitido, 4800 8N1 | Verdade de referência gravada no mesmo PC que registra a saída do DUT |
| 10, 7, 9 | RS-232 RX, CTS, RTS | |
| 1, 2, 4, 5 | ARINC 429 RX e TX canal 1 | Reservado pelo fabricante para expansão |
| 26 | GND | |

Painel traseiro: REF IN 10 MHz (0,25 a 6 Vpp, 50 Ω, 10 MHz ±10 Hz), REF OUT 10 MHz (1,5 Vpp), Ethernet (IP estático ou DHCP, controle remoto na porta 5025), USB host 1 e 2 (FAT16/FAT32).

Oscilador interno: TCXO 10 MHz, ±0,05 ppm em temperatura, envelhecimento ±0,3 ppm/ano, incerteza ±1 ppm (OP 7-3). Para ensaios de tempo e Doppler com SDR, amarrar SDR e GPSG-1000 à mesma referência de 10 MHz.

## 8. Modelos de desvanecimento

Rice de dois estados por canal, sem atraso de multipercurso (OP 3-9).

| Modelo | Parâmetros |
|---|---|
| None | sem desvanecimento |
| Static | K = 20 dB, banda de fading 0,025 Hz, sem sombreamento |
| Pedestrian | bom: K = 11,9 dB, 40 s; ruim: K = 5,9 dB, 10 s, -5 dB; fading 0,5 Hz; sombreamento 1 Hz, 2 dB 1σ |
| Land | bom: K = 13,2 dB, 9 s; ruim: K = 7,2 dB, 1 s, -10 dB; fading 7,3 Hz; sombreamento 2 Hz, 2 dB 1σ |
| Aeronautical | K = 20,2 dB, fading 0,01 Hz, sem sombreamento |

## 9. Modo de diagnóstico

`GPS:DIAG:MOD CW|MODULATED` emite uma portadora CW ou um único SV estacionário modulado em 1176, 1207, 1227, 1278 ou 1575 MHz, com Doppler fixo de ±5 kHz e nível na faixa da porta. Útil como gerador de teste de baixo nível (verificação de cadeia, interferência CW fraca em L1), mas exclui a simulação por ser portadora única. Interferência real continua sendo feita por SDR.

Ao somar SDR e GPSG-1000 por combinador, garantir isolação para que a potência reversa na porta TX do GPSG-1000 fique abaixo de 100 mW.

## 10. Mapeamento para os tipos de ensaio

| Pergunta de ensaio | Recurso do GPSG-1000 | Observação |
|---|---|---|
| O DUT aceita um céu falso? | Estático, partida a frio, morna e quente | Sem céu real na antena. Registrar TTFF e posição |
| Aceita salto de posição? | Parar, alterar posição, reiniciar; ou degraus por SV | Parar a simulação também corta o sinal |
| Aceita deslocamento gradual coerente? | Trajetória NMEA/GDT sintetizada (início na posição verdadeira e deriva) | Caso realista de captura após perda do céu real |
| Detecta inconsistência? | Step error, Doppler error, code/carrier coherence, health | Monitores de integridade |
| Aceita tempo falso? | Clock USER com data e hora arbitrárias | Inclui proximidade de leap second |
| Comportamento por nível | RF Level, offset por SV, PRN Variable/Fixed | Sensibilidade, captura por sobrepotência |
| Interferência | SDR externo (DIAG CW só como teste fraco) | Fora do escopo do GPSG-1000 |

## 11. O que medir em bancada para fechar a caracterização

1. Nível real na porta DIRECT e COUPLER contra o valor programado, em pelo menos 5 pontos da faixa, com analisador de espectro (RBW estreito, um SV, PRN FIXED). Obter erro e linearidade.
2. Potência composta com 1, 6 e 12 SVs para confirmar a relação `+10*log10(N)` e a semântica de RF Level (D17).
3. Acoplamento real do acoplador do laboratório com a antena do DUT no lugar (substituição por antena de referência ou medida com SDR calibrado).
4. Latência de comando: tempo entre o envio de `GPS:SVPR:GPS:SAT` e o efeito na saída (SDR ou DUT), e entre `TRUN` e o início do RF.
5. Atraso entre trigger in e início da simulação; alinhamento 1 PPS e frame sync.
6. Conferência do twin: o estado lido do equipamento após aplicar um cenário coincide com o estado da réplica.
