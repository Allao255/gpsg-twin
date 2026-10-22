# Verificar um script antes da bancada

O verificador é o editor de script da aba Equipamento (desde o M3). Montar um cenário pela réplica: [04-montar-cenario.md](04-montar-cenario.md).

1. Abrir o site ou `gpsg-twin.html` (duplo clique; funciona sem rede).
2. Na aba Equipamento, clicar em "Abrir…" e escolher o `.scpi`, ou colar o script no editor (substituindo o texto). Ao escrever à mão, o editor sugere cabeçalhos, diretivas e valores de enumeração (ao digitar ou com Ctrl+Espaço); passar o mouse sobre um comando mostra parâmetros, faixas, trava em execução, exemplo, página do manual e discrepâncias.
3. Ler os diagnósticos, sublinhados na linha e listados abaixo do editor (clicar leva à linha):
   - `error`: o equipamento rejeita ou o twin nunca emite (cabeçalho fora do modelo, faixa, parâmetro travado com a simulação rodando, `*RST`, `TRUN` direto). Corrigir antes da bancada, salvo em sonda deliberada.
   - `warning`: aceito, mas com risco ou fora da forma do twin (comando destrutivo sem `@pause` antes, faixa que depende do modo de unidades, sufixo de unidade não verificado, ação depois de `@pause` ou `@input` com tempo mínimo nominal).
   - `[Dnn]`: discrepância de `docs/04-discrepancias.md` envolvida.
   - Observações (`info`) não aparecem na lista.
4. Conferir na réplica o estado lido: os campos configurados pelo script e, na tabela "Linha do tempo", as ações em execução com o instante relativo ao `@run`. Campos ligados a uma linha com erro ficam marcados.
5. O aviso acima do editor lista as linhas que o cenário não representa (segunda execução, comandos fora do cenário). Elas continuam no script enquanto a réplica não for alterada.
6. "Aplicar correções conhecidas" mostra o script na forma canônica, com as grafias conhecidas corrigidas. Para sondas, enviar o script original, não a forma canônica: baixar com "Baixar .scpi" antes de aplicar, ou manter o arquivo de origem.
