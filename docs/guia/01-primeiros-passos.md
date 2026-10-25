# Primeiros passos

## Abrir o site

Há dois jeitos, com o mesmo resultado:

- Pelo endereço do site, no navegador.
- Dando dois cliques no arquivo `gpsg-twin.html`. Ele abre no navegador e funciona sem internet.

## As três abas

No alto da página há três abas:

| Aba | O que tem |
|---|---|
| Equipamento | Uma cópia das telas do GPSG-1000, e embaixo o mesmo conteúdo escrito em texto (o "script") |
| Análise | A rota no mapa, a linha do tempo e um resumo do que foi configurado |
| Ajuda | Este guia |

Na aba Equipamento, a tela e o texto andam juntos: mudou um, o outro acompanha. Você não precisa mexer no texto; dá para fazer tudo pela tela.

## Mudar um valor

1. Na coluna da esquerda da tela do equipamento, clique na janela desejada: Simulation, Setup, SV PRN, Route, Waypoint, GPS RX, File ou Diagnostics. São as mesmas janelas do aparelho.
2. Clique no campo que quer mudar. Abre uma janelinha que mostra os valores aceitos.
3. Digite o valor e clique em **OK**.

Se o valor não for aceito, aparece uma mensagem com o motivo e o campo não muda. Nada se estraga.

Outras marcas que podem aparecer:

- **Cadeado** no campo: ele está travado agora. Clique para ver o motivo. Exemplo: a latitude só muda quando o tipo de simulação é Static.
- **Opção apagada** (cinza) numa lista: ela existe no aparelho, mas não pode ser escolhida por aqui. O motivo aparece ao lado, entre parênteses.

## Unidades

O site mostra pés e milhas por hora, como o aparelho vem de fábrica. Para ver metros e km/h:

1. Janela Setup, aba Simulation.
2. Campo Units: escolha **SI**.

Isso muda só o que aparece na tela. Os arquivos gerados ficam iguais.

## Como digitar coordenadas

Latitude e longitude aceitam qualquer um destes jeitos:

| Jeito | Exemplo |
|---|---|
| Graus com casas decimais | `39.2976 N` ou `39.2976` |
| Graus e minutos | `39 17.856 N` |
| Graus, minutos e segundos | `39 17 51.36 N` |

Sul e oeste: use `S` e `W`, ou um sinal de menos na frente (`-94.7139`).

## Salvar e abrir

- **Salvamento automático:** o trabalho fica guardado no navegador deste computador e volta quando você reabre o site. Se limpar o navegador ou usar outro computador, ele não estará lá.
- **Baixar cenário .json:** baixa um arquivo com tudo o que você montou. É o jeito seguro de guardar ou passar para um colega.
- **Abrir…:** reabre um arquivo baixado antes.
- **Novo:** começa do zero. O site pede confirmação antes.

O campo **Cenário**, acima do texto, é o nome do trabalho. Ele vira o nome dos arquivos gerados. Acentos e espaços são trocados automaticamente.

## Próximo passo

[Montar uma rota](02-montar-uma-rota.md).
