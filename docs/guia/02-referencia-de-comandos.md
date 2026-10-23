# Consultar a referência de comandos

1. Abrir a aba Ajuda.
2. Buscar por cabeçalho, forma curta (`RFLV`), ou nome de parâmetro.
3. Filtrar por categoria, tipo (ajuste, consulta, ação), "verificado em bancada" ou "com divergência entre manuais".
4. Abrir o comando para ver forma longa, parâmetros com faixa e unidade, retorno, exemplo do manual, página `RP x-y` e, quando os manuais divergem, a divergência e o tratamento provisório adotado pelo twin.

Marcadores:

| Marcador | Significado |
|---|---|
| verificado em bancada | Confirmado no equipamento (`verified_on_hw`) |
| trava em execução | Rejeitado com a simulação rodando |
| nunca emitido | O twin não gera o comando (`*RST`, calibração, senha) |
| divergência entre manuais | Os manuais se contradizem neste comando; passar o mouse mostra o resumo |
| divergência resolvida | A contradição foi resolvida em bancada |
