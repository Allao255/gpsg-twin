# Outros ajustes

Ajustes comuns além da rota. Todos ficam na aba Equipamento.

## Posição parada

Para o receptor "ficar parado" num lugar:

1. Janela Setup, aba Simulation: no campo **Simulation**, escolha **Static**.
2. Janela Simulation: preencha **Latitude**, **Longitude** e **Altitude**.

Outro jeito: na aba Análise, clique no mapa e escolha **Usar como posição estática**.

## Nível do sinal

O nível do sinal fica no campo **RF Level** (janela Simulation, ou Setup, aba Simulation). A unidade é dBm: quanto mais negativo, mais fraco.

- Para a maioria dos receptores, o manual recomenda entre **-115 e -120 dBm**.
- O site já mostra a faixa aceita ao clicar no campo.

A saída do sinal fica no campo **RF Port**:

| Saída | Quando usar |
|---|---|
| Direct | Cabo direto até o receptor, uma carga ou um atenuador |
| Coupler | Acoplador colocado sobre a antena do receptor |

Nunca use as duas saídas ao mesmo tempo. E nada pode irradiar pelo ar.

Se houver cabos ou acoplador no caminho, informe as perdas em Setup, aba I/O. O site leva isso em conta na faixa aceita.

## Data e hora

1. Janela Setup, aba Simulation: em **Clock**, escolha **User setting**.
2. Preencha **Date** e **Time**. A hora é UTC.

Data aceita `04/14/2013` (mês/dia/ano), `2013-04-14` ou `Apr 14, 2013`. Hora no formato `11:11:11`.

## Almanaque

O almanaque é a tabela de posições dos satélites que o simulador usa.

- **Default:** o de fábrica do equipamento. Basta para a maioria dos ensaios.
- **Arquivo:** um almanaque mais recente, anexado ao pacote (veja [Levar ao equipamento](04-levar-ao-equipamento.md)). A data da simulação deve ser pelo menos um dia depois da data do almanaque.

Fica na janela File, aba Almanacs.

## Waypoints

Waypoints são pontos com nome que você pode guardar e reaproveitar em rotas.

1. Janela **Waypoint**, botão **Add**.
2. Preencha código, nome, latitude, longitude e altitude. Os demais campos são opcionais.
3. Para usar numa rota: janela Route, **Add**, escolha o waypoint na lista e clique em **Next**.

## Mudanças durante a simulação

O site permite programar mudanças para um instante da simulação, como baixar o nível do sinal aos 60 segundos ou desligar um satélite.

1. Na janela Simulation, aperte **Run**. A tela passa a representar o equipamento rodando, e a configuração trava.
2. No campo **Elapsed**, digite o instante desejado, em segundos.
3. Mude o RF Level, ou edite um satélite na janela SV PRN.
4. Repita para outros instantes. Aperte **Stop** para marcar o fim.

As mudanças aparecem na linha do tempo da aba Análise.

Atenção: essas mudanças **não vão pelo pendrive**. No equipamento, elas precisam ser feitas à mão, na hora certa. Para um ensaio só de rota, deixe o Run do site desligado.
