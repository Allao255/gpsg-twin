# Conferir na aba Análise

A aba Análise mostra, numa página só, o que foi montado na aba Equipamento. Ela se atualiza sozinha: é só abrir. Não precisa apertar Run nem nenhum outro botão.

## No alto

O nome do trabalho e, se houver, quantos erros existem. Os erros são corrigidos na aba Equipamento (veja [Avisos e erros](06-avisos-e-erros.md)).

## Linha do tempo

É uma régua de tempo, em segundos, a partir do momento em que a simulação começa.

- **Execução:** o período em que a simulação está rodando.
- **RF Level:** o nível do sinal ao longo do tempo.
- Uma faixa para cada satélite que tem alguma mudança programada.

Para ver como está tudo num instante, clique na régua ou arraste o cursor vermelho. Também dá para digitar o instante no campo **Cursor (s)**.

As setinhas sobre a régua são mudanças programadas para aquele instante. Clicar numa delas leva à aba Equipamento, no ponto onde a mudança foi feita.

Num ensaio de rota simples, a régua mostra só a faixa de execução. É normal.

## Estado no instante

A tabela à esquerda resume a configuração no instante do cursor:

| Linha | O que mostra |
|---|---|
| Simulação | Tipo (Static, Dynamic ou Trajectory) e sistema (GPS ou Galileo) |
| Porta e RF Level | Por qual saída o sinal sai e com que nível |
| Faixa da porta | Os níveis que aquela saída aceita |
| Composto na saída | A potência total, somando os satélites |
| Perdas | Perdas de cabos e acoplador informadas |
| Hora simulada | Data e hora que o receptor vai "ver" |
| Posição | Onde o receptor "está" |
| Modelo de movimento | O tipo de veículo escolhido |

## Mapa

- **Posição parada (Static):** aparece um ponto.
- **Rota (Dynamic):** aparecem os pontos numerados, ligados por linhas.
- **Ponto vermelho:** tem algum problema. Clique nele para ver o que é e os dados do ponto.
- Clicar num lugar vazio do mapa permite usar aquele lugar como posição ou acrescentá-lo à rota (veja [Montar uma rota](02-montar-uma-rota.md)).
- Os botões **+** e **−** aproximam e afastam.

## O que a aba confere na rota

- Se a velocidade passa do máximo do tipo de veículo.
- Se a aceleração passa do máximo do tipo de veículo.
- Se a curva é fechada demais para a velocidade.
- Se os pontos estão perto demais uns dos outros.

Mesmo sem nenhum aviso aqui, quem dá a palavra final é o equipamento, que também confere a rota ao carregá-la.

## O que ainda não aparece

Quais satélites estariam visíveis no céu e onde. Isso ainda está em desenvolvimento.

## Próximo passo

[Levar ao equipamento](04-levar-ao-equipamento.md).
