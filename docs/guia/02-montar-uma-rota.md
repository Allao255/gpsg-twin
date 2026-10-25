# Montar uma rota

Uma rota é uma lista de pontos no mapa. O simulador faz o receptor "acreditar" que está passando por esses pontos, na ordem da lista, com a velocidade que você definir.

## Antes de começar

1. Janela Setup, aba Simulation: no campo **Simulation** (tipo de simulação), escolha **Dynamic**. Sem isso, a rota é ignorada.
2. Na mesma aba, em **Motion Model**, escolha o tipo de veículo. Ele limita a velocidade e a aceleração. Na dúvida, use **Unlimited**, que tem os limites mais altos.
3. Recomendado: Units em **SI**, para trabalhar em metros e km/h (veja [Primeiros passos](01-primeiros-passos.md)).

## Jeito 1: digitando os pontos

Melhor quando você já tem as coordenadas.

1. Abra a janela **Route** e clique em **Add**.
2. Clique em **Ponto livre**.
3. Preencha os campos:

| Campo | O que é |
|---|---|
| Name | Um nome para o ponto, só para você se localizar |
| Latitude e Longitude | Onde fica o ponto |
| Altitude | Altura do ponto |
| Altitude Rate | Quanto sobe ou desce por minuto até o próximo ponto. Número negativo: descendo. Zero: mesma altura |
| Speed | Velocidade ao passar pelo ponto |
| Acceleration | Aceleração máxima para mudar de velocidade e fazer curvas |
| Turn Radius | Raio da curva neste ponto: quanto maior, mais suave a curva |

4. Clique em **Done**. O ponto entra na lista.
5. Repita para os outros pontos.

Para mudar um ponto, clique na linha dele na lista. Aparecem os botões **Edit** (alterar), **Delete** (apagar), **Move Up** e **Move Down** (mudar a ordem).

## Jeito 2: clicando no mapa

Melhor para esboçar um caminho.

1. Abra a aba **Análise**.
2. Clique no mapa onde quer o ponto. Abre um quadrinho com as coordenadas.
3. Clique em **Acrescentar à rota**. O ponto entra no fim da lista, com a mesma velocidade, aceleração e raio de curva do ponto anterior.
4. Volte à janela Route para dar nome e ajustar altitude e velocidade.

O mapa que funciona sem internet mostra só o contorno das costas e uma grade de latitude e longitude, sem cidades nem ruas. Embaixo dele há a opção de ligar um mapa da internet (OpenStreetMap). Atenção: com ela ligada, as coordenadas na tela são enviadas para o servidor do mapa. **Não use com locais sigilosos ou de interesse do ensaio.**

## Quantos pontos?

- **Dois pontos bastam.** O receptor vai em linha reta de um ao outro.
- **Três ou mais** fazem curvas, e aí valem duas regras:
  - quanto mais rápido, maior precisa ser o raio da curva;
  - os pontos precisam estar longe uns dos outros: mais de 4 vezes o raio da curva.

Exemplo: a 200 km/h com aceleração de 9,8 m/s², o raio da curva precisa ser de pelo menos 315 m, e os pontos precisam estar a mais de 1,3 km um do outro.

Não precisa fazer a conta: a aba Análise avisa quando uma regra não é cumprida, pintando o ponto de vermelho (veja [Conferir na aba Análise](03-conferir-na-analise.md)).

## Ida e volta (Loop)

Na janela Route, o botão **Loop** liga e desliga a repetição:

- **Loop On:** ao chegar no último ponto, volta para o primeiro e recomeça.
- **Loop Off:** percorre a lista uma vez. O que o equipamento faz ao chegar no último ponto ainda vai ser conferido na bancada.

## Próximo passo

[Conferir na aba Análise](03-conferir-na-analise.md).
