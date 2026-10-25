# Avançado

Para engenharia: o script `.scpi`, a referência de comandos, a execução por runner e o ensaio contra o mock. Nada disto é necessário para o fluxo de pendrive e painel.

## O script

O script é a configuração em comandos SCPI, com diretivas do twin (linhas com `@`, como `@run`, `@stop`, `@pause`, `@expect`). As diretivas não são comandos do equipamento: quem as executa é o runner. Por isso o `.scpi` não é carregado direto no equipamento.

- Editar o texto recarrega a réplica após uma pausa na digitação.
- Diagnósticos: `error` (o equipamento rejeita ou o twin nunca emite: cabeçalho fora do modelo, faixa, parâmetro travado em execução, `*RST`, `GPS:SIM:TRUN` direto) e `warning` (aceito com risco: comando destrutivo sem `@pause` antes, faixa dependente do modo de unidades, sufixo de unidade não verificado, ação com instante mínimo depois de `@pause` ou `@input`). Observações (`info`) não entram na lista.
- Linhas que o cenário não representa (comando que o cenário não guarda, segunda execução, linha com erro) ficam no script até a réplica ser alterada; o twin pede confirmação antes de reescrever.
- "Aplicar correções conhecidas" corrige grafias alternativas do manual, troca `GPS:SIM:TRUN` por `@run`/`@stop` e reescreve na forma canônica. Em sondas deliberadas, enviar o script original: baixar com "Baixar .scpi" antes de aplicar.
- Unidades e formato de lat/long do Setup mudam só a exibição; o script é sempre emitido em SI, com a escolha de exibição no metadado `# twin-display:`.
- Waypoint do banco do equipamento numa rota: informar o código na tela Route, Add; o script emite `GPS:ROUT:ADD:WAYP`, e o ponto fica sem coordenadas no twin (fora do mapa e das checagens).
- Execução na réplica: Run, campo Elapsed e Stop geram `@at <t>` seguido do comando, e `@stop` no fim. Em execução só RF Level e edições de SV são aceitos. SV PRN, "Importar LIST? de log…" lê a resposta de `GPS:SVPR:GPS:LIST?` de um log.

## Referência de comandos

No menu da esquerda da Ajuda. Busca por cabeçalho, forma curta (`RFLV`) ou nome de parâmetro; filtros por categoria, tipo, "verificado em bancada" e "com divergência entre manuais".

| Marcador | Significado |
|---|---|
| verificado em bancada | Confirmado no equipamento |
| não verificado | Transcrito do manual, ainda não confirmado |
| trava em execução | Rejeitado com a simulação rodando |
| nunca emitido | O twin não gera o comando (`*RST`, calibração, senha) |
| divergência entre manuais | Os manuais se contradizem; passar o mouse mostra o resumo, e o comando aberto mostra o tratamento adotado |
| divergência resolvida | A contradição foi resolvida em bancada |

## Runner

O site não se conecta ao equipamento: o navegador não abre a conexão TCP crua da porta SCPI (5025). Quem envia o script é o runner, num PC na rede do equipamento: `runners/gpsg-run.ps1` (PowerShell) ou `runners/gpsg_run.py` (Python).

```
powershell -ExecutionPolicy Bypass -File runners\gpsg-run.ps1 -Address <ip> -Script <cenário>.scpi
```

O runner confere que nenhuma simulação está rodando, salva o estado anterior (`twin_bkp_<cenário>`), força unidades SI, pausa antes do `@run` para conferir porta e destino do sinal, e grava um log CSV. O log reabre no twin ("Abrir…") com a linha do tempo real.

Runner colável (o runner com o script embutido, para colar no console do PowerShell quando a política de execução bloqueia arquivos `.ps1`): o gerador está fora da interface do site por enquanto. Gerar pela linha de comando, com `--out` (redirecionar a saída de `npm run` com `>` inclui o cabeçalho do npm no arquivo):

```
npm run pasteable -- --script <cenário>.scpi --address <ip> --out <cenário>-colavel.ps1
```

## Ensaiar contra o mock

O mock é um equipamento simulado em Node, para depurar script e runner sem ocupar a bancada:

```
npm run mock
```

Com `-- --host 0.0.0.0` aceita conexões de outra máquina. Rodar o runner apontando para `127.0.0.1` (ou o IP da máquina do mock) e, para encurtar esperas, acrescentar `-TimeScale 0.01`. Ler o resumo `end of script ERR=.. WARN=..` e o log CSV.

O mock não simula sinal: listas de satélites são marcadores e a validação de rota só confere o número de pontos. Os códigos de erro são os SCPI padrão; os do equipamento real podem diferir.

## Regras do equipamento compartilhado

- Nunca enviar `*RST`, `GPS:CAL:*` (exceto consultas) nem `GPS:SYST:CPAS`.
- Nunca enviar `GPS:SIM:TRUN` direto: usar `@run` e `@stop`, que consultam o estado antes.
- Comandos que apagam (`CLeaRall`, `CLeaR`, `REMove`) só com confirmação, um por vez.
- Todo arquivo criado pelo twin começa com `twin_`.

## Se o script parar no meio

1. `GPS:SIM:TRUN?`: se `Running`, parar pela tela (Stop) ou com um script contendo só `@stop`.
2. Restaurar o estado anterior: `GPS:FIL:SET:LOAD "twin_bkp_<cenário>"` e `GPS:FIL:ROUT:LOAD "twin_bkp_<cenário>.rte"`.
3. Conferir na tela que settings e rota do usuário anterior voltaram.
4. Remover os arquivos `twin_` só depois de confirmada a restauração, um por vez.

## Pacote USB: detalhes

Na exportação, "Rota pelo pendrive", "Waypoints pelo pendrive" e "Settings pelo pendrive" fazem o script importar e carregar o arquivo (`IMP` e `LOAD`) no lugar dos comandos. Usar só depois de o formato ser confirmado em bancada.

- O settings XML só é gerado quando todos os valores do cenário têm grafia documentada; o aviso lista os campos que faltam.
- Rota com waypoint do banco do equipamento não gera `.rte`.
- Almanaque ou trajetória `twin_` referenciados e não anexados precisam já estar no equipamento.
- NMEA com extensão `.nmea` ou `.txt` vira `.nme`.

"Abrir…" aceita vários arquivos de uma vez:

| Arquivo | Efeito |
|---|---|
| `.zip` do twin | Cenário restaurado do `.json`, com almanaque e trajetória anexados |
| `.zip` ou arquivos exportados do equipamento | Settings, rota e waypoints aplicados sobre o cenário corrente |
| `.scpi` | Script no editor e réplica no estado correspondente |
| `.csv` de log do runner | Script reconstruído com os comandos aceitos, rejeitados comentados, e linha do tempo com os instantes reais |
| `.json` | Cenário |
| `.set`, `.rte`, `.csv` de waypoints | Settings, rota (substitui a corrente) ou waypoints (acrescentados; código repetido substituído) |
| `.alm`, `.gdt`, `.nme` | Anexado ao pacote |
