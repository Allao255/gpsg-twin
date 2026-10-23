# Conferir um script na aba Análise

A aba Análise mostra o que o script da aba Equipamento pede, de uma vez: linha do tempo, estado em qualquer instante, nível de RF, mapa e checagens de rota. Tudo é lido do script e do cenário (camada declarada); satélites calculados a partir do almanaque ainda não estão disponíveis.

1. Carregar ou montar o script na aba Equipamento ("Abrir…", réplica ou editor).
2. Abrir a aba Análise. O topo mostra o nome do cenário e quantos erros o script tem; os erros são vistos e corrigidos no editor.

## Linha do tempo

- Faixas: Execução (do `@run` ao `@stop`; tracejada sem `@stop`), RF Level (degraus com o valor) e uma faixa por SV manipulado.
- Cores dos SVs: âmbar com manipulação em vigor (Doppler, coerência, offset, step), vermelho com saúde BAD ou DISCONNECTED, cinza com o SV desligado (Select OFF).
- O erro de Doppler vale pela duração informada; os demais campos ficam até a próxima ação do mesmo SV (interpretação provisória: o manual é ambíguo).
- Clicar ou arrastar na linha do tempo, ou digitar o instante no campo Cursor, move o cursor.
- Cada marcador é uma linha do script em execução; marcador âmbar tem instante mínimo (depois de `@pause` ou `@input`). Clicar leva à aba Equipamento, seleciona a linha no editor e destaca o campo da réplica.
- Ações por SV escritas com variável (`${PRN}`) não têm faixa: o SV só é conhecido na bancada.

## Estado no instante

- Tipo de simulação, portadora, porta e RF Level vigente (com o instante da última mudança).
- Faixa de RF Level da porta com as perdas, composto na saída para 6 e 12 SVs e, na porta COUPLER, nível na antena pelo acoplador (21,5 dB típico).
- Hora simulada no instante (Clock User), posição, rota ou trajetória e modelo de movimento.
- Tabela dos SVs manipulados: Select, Health, Doppler em vigor, coerência, offset, step e nível por SV (RF Level mais offset).

## Mapa

- Mostra o que o tipo de simulação usa: posição estática (Static), rota com os pontos numerados (Dynamic) ou a trajetória anexada (Trajectory).
- Ponto de rota em vermelho tem aviso; clicar no ponto mostra altitude, velocidade, raio de curva, aceleração, subida, distância ao próximo e os avisos.
- Clicar no mapa mostra as coordenadas no formato do Setup e, conforme o tipo, "Usar como posição estática" ou "Acrescentar à rota" (ponto livre com os parâmetros de trecho do último ponto). A alteração vai para a réplica e o script.
- O fundo é o contorno costeiro embutido com grade de latitude e longitude, sem rede. O mapa base online (OpenStreetMap) é opcional e fica desligado: ligado, as coordenadas visíveis vão para o servidor de tiles, então não usar com posições ou rotas de interesse.

## Checagens de rota

Equivalentes às que dependem só dos dados declarados (OP 3-21), feitas contra o modelo de movimento do cenário:

- trecho entre pontos não maior que 4 raios de curva;
- raio de curva menor que `v² / a` (velocidade no ponto, aceleração lateral máxima do modelo);
- velocidade acima do máximo do modelo; aceleração acima do máximo longitudinal.

Waypoint do banco do equipamento não tem coordenadas no twin: aparece com `?` e fica fora do mapa e das distâncias. A validação completa continua sendo `GPS:ROUT:VALD` no equipamento.

## Eventos do script

Tabela com o instante, a linha e o texto de cada comando em execução; linhas já passadas pelo cursor ficam esmaecidas. Clicar leva à linha e ao campo, como os marcadores.
