# Referência rápida do GPSG-1000

Resumo de `docs/01-equipamento.md` para consulta durante a preparação. Itens com `Dnn` têm divergência entre manuais (aba Ajuda, referência de comandos).

## Níveis e perdas

| Item | Valor |
|---|---|
| RF Level, porta DIRECT | -155 a -93 dBm, passo 1 dB, ±2 dB (OP 7-1) |
| RF Level, porta COUPLER | -130 a -68 dBm, passo 1 dB, ±2 dB |
| Nível recomendado para a maioria dos receptores | -115 a -120 dBm (OP 4-2) |
| Composto na saída | RF Level + 10 log10(N SVs); 12 SVs: +10,8 dB |
| Acoplador | -21,5 dB típico em L1; isolação > 25 dB |
| Perdas inseríveis | acoplador 0 a 40 dB; cabos 0 a 12 dB; divisor 0 a 10 dB; resolução 0,1 dB |
| Efeito das perdas | parte inteira desloca a faixa de RF Level para baixo (D17) |
| Potência reversa máxima na porta TX | 100 mW |

Com PRN Signal FIXED, todos os SVs saem no RF Level; com VARIABLE, os níveis relativos seguem a geometria.

## Manipulações por SV (em execução)

| Parâmetro | Faixa |
|---|---|
| Select | ON, OFF |
| Health | GOOD, BAD (Galileo: CONNECTED, DISCONNECTED) |
| Doppler error | ±5000 Hz, passo 1 Hz, com duração (padrão 3600 s) |
| Code/carrier coherence | ±2 m/s, passo 1 mm/s |
| Amplitude offset | ±15 dB, passo 0,1 dB |
| Step error | ±1000 m (twin; D01), semântica absoluta ou incremental a confirmar (D18) |

Comando: `GPS:SVPR:GPS:SAT <sv>,<select>,<health>,<doppler>,<coerência>,<offset>,<step>,<duração>` (8 parâmetros, D02). Galileo: `GPS:SVPR:GAL:SAT`, PRN 1 a 36 (D10).

Degrau igual em todos os SVs vai para o relógio do receptor e não move a posição. Para deslocar a posição de `dr` (ENU, m), cada SV recebe `s_i = -(e_i . dr) + b`, com `e_i` o vetor de visada pela elevação e azimute.

## Execução

- `@run` e `@stop` sempre; nunca `GPS:SIM:TRUN` direto (alternância).
- Com a simulação rodando, só RF Level e manipulações por SV; porta, portadora, perdas, relógio, posição e modelo de movimento são rejeitados.
- Trigger externo (`GPS:SET:TSRC EXTERNAL`): `@run` só arma; o relógio avança na borda de subida do pino 19 do Aux.
- Seleção automática de SVs por DOP mínimo, refeita a cada 60 min.

## Limites dos modelos de movimento (fábrica, D27)

| Modelo | Aceleração lateral e longitudinal | Velocidade |
|---|---|---|
| Pedestrian | 2,94 m/s² | 24 mph |
| Automobile | 9,8 m/s² | 200 mph |
| Marine | 6,86 m/s² | 100 mph |
| Low Performance Aircraft | 19,6 e 9,8 m/s² | 500 mph |
| High Performance Aircraft | 88,2 e 49 m/s² | 1000 mph |
| Unlimited | 98 m/s² | 1150 mph |

Rota: raio mínimo de curva `v² / a`; distância entre pontos maior que 4 raios de curva. Até 9999 pontos (D08). Trajetórias usam os limites de Unlimited.

## Conector Aux (DB-26)

| Pino | Sinal |
|---|---|
| 19 | Trigger in, LVTTL 3,3 V, borda de subida |
| 17 | Trigger out, LVTTL 3,3 V |
| 25 | 1 PPS, alinhado ao RF em ±30 ns típico |
| 8 | RS-232 TX: NMEA GGA, RMC, GSV do céu simulado, 4800 8N1 (verdade de referência) |
| 26 | GND |

Painel traseiro: REF IN 10 MHz (0,25 a 6 Vpp, 50 Ω), REF OUT 10 MHz, Ethernet (porta 5025), USB host 1 e 2 (FAT16/FAT32).

## Tempo e almanaque

- Clock USER: data e hora arbitrárias (ensaios de tempo). INTERNAL existe só na tela (D12).
- Almanaque padrão: semana 574, 22/08/2010. Preferir almanaque recente, anexado ao pacote; data de simulação ao menos um dia depois do almanaque (OP 4-3).
- Almanaque Galileo fixo.

## Arquivos (pendrive, `Instrument/`)

| Pasta | Formato |
|---|---|
| `almanacs/` | Yuma `.alm` |
| `Routes/` | XML `.rte`, SI e graus decimais |
| `Settings/` | XML `GpsgPowerupConfig` (tokens só do manual, D31) |
| `Waypoint/` | CSV sem cabeçalho, altitude em ft (D30) |
| `Nmea/` | NMEA `.nme` (GGA, RMC, GSV) ou GDT `.gdt` |
| `Kml/` | KML do Google Earth, convertido no equipamento |

## Diagnóstico

Mode CW ou MODULATED emite portadora ou um SV estacionário em 1176, 1207, 1227, 1278 ou 1575 MHz e trava a simulação (OP 5-9). Útil só como gerador de teste de baixo nível; não faz parte do cenário.
