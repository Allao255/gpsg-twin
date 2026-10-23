# Exportar o pacote USB e abrir arquivos

O pacote reúne em um `.zip` tudo o que vai para a bancada: arquivos do equipamento na pasta `Instrument/`, script de sessão, cenário, runner colável e folha de sessão.

## Anexar almanaque e trajetória

1. Janela File, aba Almanacs (ou Trajectory).
2. "Anexar arquivo…" e escolher o `.alm` Yuma (ou o `.gdt` ou NMEA). Arquivo sem bloco de PRN ou sem ponto de trajetória válido é recusado com o motivo.
3. O arquivo recebe o prefixo `twin_` e o cenário passa a importá-lo do pendrive e a carregá-lo (`IMP` e `LOAD`). NMEA com extensão `.nmea` ou `.txt` vira `.nme`.
4. O quadro mostra o resumo do anexo (PRNs e semana; formato, pontos e período). "Remover anexo" tira o arquivo do pacote e a importação; o nome continua no cenário, para um arquivo que já esteja no equipamento.
5. A trajetória só é carregada com Simulation = Trajectory.

## Exportar

1. "Exportar pacote .zip…" abaixo da réplica.
2. Conferir a lista de arquivos e os avisos:
   - settings XML só é gerado quando todos os valores do cenário têm token documentado; o aviso lista os campos que faltam. A configuração vai pelo script de qualquer forma.
   - rota com waypoint do banco do equipamento não gera `.rte` (as coordenadas estão só no equipamento).
   - almanaque ou trajetória com prefixo `twin_` referenciados pelo cenário e não anexados precisam já estar no equipamento.
3. Opcional: marcar "Rota pelo pendrive", "Waypoints pelo pendrive" ou "Settings pelo pendrive" para o script importar e carregar o arquivo no lugar dos comandos. Usar só depois de o formato ser confirmado em bancada.
4. Endereço e porta do runner colável vêm dos campos "Runner PowerShell colável", abaixo do editor.
5. "Baixar .zip". Descompactar na raiz do pendrive FAT32: a pasta `Instrument/` precisa ficar na raiz.

## Abrir arquivos

"Abrir…" aceita vários arquivos de uma vez:

| Arquivo | Efeito |
|---|---|
| `.zip` do twin | Cenário restaurado do `.json`, com almanaque e trajetória anexados; os demais arquivos do pacote são derivados e não são reaplicados |
| `.zip` ou arquivos exportados do equipamento | Settings, rota e waypoints aplicados sobre o cenário corrente |
| `.scpi` | Script no editor e réplica no estado correspondente |
| `.csv` de log do runner | Script reconstruído com os comandos aceitos, rejeitados comentados, e linha do tempo com os instantes reais |
| `.json` | Cenário |
| `.set`, `.rte`, `.csv` de waypoints | Settings, rota (substitui a rota corrente) ou waypoints (acrescentados; código repetido substituído) |
| `.alm`, `.gdt`, `.nme` | Anexado ao pacote, como na janela File |

Ao abrir mais de um arquivo, ou quando há avisos, um quadro lista o que foi feito com cada arquivo. Tokens de settings inferidos e não verificados aparecem com aviso.
