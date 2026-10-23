# Montar um cenário na aba Equipamento

A aba Equipamento tem a réplica da interface do GPSG-1000 à esquerda e o script `.scpi` correspondente à direita. Os dois ficam sincronizados: mexer na réplica reescreve o script; editar o script recoloca a réplica no estado lido.

## Configurar na réplica

1. Abrir o site ou `gpsg-twin.html` (duplo clique; funciona sem rede). A aba Equipamento abre com o último cenário editado no navegador ou, na primeira vez, com o cenário padrão (Kansas City, 04/14/2013 11:11:11, almanaque padrão).
2. Escolher a janela pela barra lateral (Simulation, Setup, SV PRN, Route, Waypoint, GPS RX, File, Diagnostics), como no equipamento (OP capítulo 3).
3. Clicar no campo a alterar:
   - Campos numéricos abrem o teclado com a faixa aceita. Valor fora da faixa é recusado com o motivo; o campo não muda.
   - Seletores mostram as opções da tela. Opções que só existem na UI do equipamento aparecem desabilitadas, com o motivo (Clock Internal, PRN Signal Traj File, portadora L1 no P(y)).
   - Latitude e longitude aceitam graus decimais com sinal ou hemisfério (`39.2976 N`), graus e minutos (`39 17.856 N`) ou graus, minutos e segundos (`39 17 51.36 N`). Sinal só nos graus.
   - Data aceita `mm/dd/aaaa`, `aaaa-mm-dd` ou `Aug 14, 2013`; hora em `hh:mm:ss` UTC.
4. Campo com cadeado está travado. O motivo aparece ao clicar: modo (latitude travada fora de Static, data e hora só com Clock User setting, limites de movimento só com Motion Model Custom) ou execução.
5. Unidades e formato de lat/long do Setup mudam só a exibição. O script é sempre emitido em SI; a escolha de exibição vai no metadado `# twin-display:` do script.
6. Perdas do Setup I/O deslocam a faixa de RF Level da porta selecionada. Trocar a porta força Digital Noise (Coupler: Off; Direct: On).

## Rota

1. Route, Add. A lista Stored Waypoints mostra os waypoints de usuário do cenário. O banco de waypoints do equipamento não está no twin: para usar um ponto do banco, informar o código (ex.: `SFO`) no campo abaixo da lista.
2. Next abre o Route Edit. Preencher Altitude Rate, Speed, Acceleration e Turn Radius nas unidades exibidas. Para waypoint do banco, latitude, longitude e altitude ficam em branco e somente leitura (vêm do equipamento; o script emite `GPS:ROUT:ADD:WAYP`). "Ponto livre" abre o formulário com coordenadas editáveis (`GPS:ROUT:ADD:POIN`).
3. Done inclui o ponto no fim da lista, ou logo após o ponto selecionado.
4. Selecionar uma linha habilita Delete, Edit, Move Up e Move Down. Clear All pede confirmação.
5. Manage grava a rota no equipamento depois de montada (`GPS:ROUT:SAV`). O nome recebe o prefixo `twin_`.
6. A rota só é emitida com Simulation = Dynamic.

## Waypoints de usuário

1. Waypoint, Add: código, ICAO, nome, cidade, Country (parâmetro remoto `state`), latitude, longitude, altitude. Código repetido é recusado.
2. Edit altera o waypoint selecionado; Delete remove; Defaults remove todos, com confirmação.
3. Use copia latitude, longitude e altitude do waypoint para a posição estática. Travado com Simulation = Dynamic (OP 3-23).

## Arquivos

1. File, aba do tipo (Almanacs, Routes, Settings, Trajectory, KML, Waypoints).
2. Load pede o nome do arquivo no equipamento. Almanacs, Default usa o almanaque padrão (semana 574); GPS Rx deixa o cenário sem almanaque fixado (aviso no script e na Análise).
3. Import From USB marca a importação do pendrive antes da carga (`IMP`). Clicar de novo desmarca.
4. Botões sem comando remoto ou destrutivos (Manage, Clear, Export) aparecem desabilitados com o motivo.

## Execução e linha do tempo

1. Run inicia a execução no cenário (no script: `@run`). O indicador muda para Running e a configuração trava, como no equipamento.
2. O campo Elapsed da janela Simulation define o instante em que as próximas alterações entram. Não é relógio real: digitar o instante em segundos ou `hh:mm:ss`.
3. Em execução, só RF Level e edições de SV entram na linha do tempo, como `@at <t>` seguido do comando. Os demais campos ficam travados.
4. SV PRN: informar os PRNs em simulação (PRNs…) ou colar a resposta de `GPS:SVPR:GPS:LIST?` de um log (Importar LIST? de log…). Clicar num SV abre a edição (Select, Health, Doppler, coerência, offset, step error, duração). Reset volta todos os SVs ao padrão no instante corrente.
5. A tabela "Linha do tempo" abaixo do editor lista as ações; Remover apaga uma ação.
6. Stop encerra a execução no maior entre o instante Elapsed e a última ação (no script: `@at <t>` e `@stop`).

## Editar o script

1. O script pode ser editado diretamente. Após uma pausa na digitação, a réplica é recarregada a partir do texto.
2. Erros e avisos aparecem sublinhados na linha, na lista de diagnósticos e no campo correspondente da réplica. Clicar num diagnóstico leva à linha.
3. Linhas que o cenário não representa (comando que o cenário não guarda, segunda execução, linha com erro) são listadas no aviso acima do editor. Alterar a réplica depois disso reescreve o script a partir do cenário e perde essas linhas; o twin pede confirmação antes.
4. "Aplicar correções conhecidas" troca grafias conhecidas do manual e `GPS:SIM:TRUN` por `@run`/`@stop`, e reescreve o script na forma canônica.

## Salvar e abrir

- Baixar .scpi: o script como está no editor.
- Baixar cenário .json: o cenário completo, versionado (`scenario_version`).
- Abrir…: `.scpi`, `.json`, pacote `.zip`, arquivos do equipamento e logs do runner ([05-pacote-usb.md](05-pacote-usb.md)).
- Exportar pacote .zip…: arquivos para o pendrive, script, runner colável e folha de sessão ([05-pacote-usb.md](05-pacote-usb.md)).
- Novo: volta ao cenário padrão, com confirmação.
- O cenário corrente e os anexos ficam salvos no navegador e voltam ao reabrir a página (anexos grandes podem não caber; nesse caso só o cenário é salvo). Para guardar ou versionar, baixar o pacote, o `.scpi` ou o `.json`.

Para executar o script, ver [03-ensaiar-com-o-mock.md](03-ensaiar-com-o-mock.md) (mock e runner colável).
