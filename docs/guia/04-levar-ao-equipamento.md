# Levar ao equipamento

O site não se conecta ao equipamento. O caminho é o **pendrive**: o site gera os arquivos, você os copia para o pendrive e carrega pelo painel do aparelho.

## O que vai no pendrive e o que é feito à mão

| Item | Como chega ao equipamento |
|---|---|
| Rota | Arquivo no pendrive |
| Almanaque ou trajetória que você anexou | Arquivo no pendrive |
| Configuração (tipo de simulação, saída, nível do sinal etc.) | Arquivo no pendrive **só quando o site consegue gerar**. Senão, à mão no painel |
| Mudanças programadas para durante a simulação | À mão no painel, na hora certa |

O arquivo de configuração nem sempre sai porque o manual não mostra como o equipamento escreve alguns valores nesse arquivo. O site prefere não gerar a arriscar um arquivo errado. Quando isso acontece, a janela de exportação avisa.

Importante: os arquivos de rota e de configuração seguem o exemplo do manual, mas **ainda não foram testados no equipamento**. Se algo não carregar, veja "Se algo der errado" no fim da página.

## Passo a passo

### 1. Gerar o pacote

1. Na aba Equipamento, confira o nome no campo **Cenário**. Ele vira o nome dos arquivos.
2. Clique em **Exportar pacote .zip…**.
3. Leia a lista de arquivos e os avisos.
4. Clique em **Baixar .zip**.

### 2. Preparar o pendrive

1. O pendrive precisa estar formatado em FAT32 (o formato mais comum).
2. No computador, clique com o botão direito no arquivo `.zip` baixado e escolha **Extrair tudo**.
3. Copie o conteúdo extraído para o pendrive. A pasta `Instrument` tem que ficar **direto no pendrive**, e não dentro de outra pasta.

### 3. No equipamento

1. Veja se ninguém está usando o equipamento.
2. Coloque o pendrive.
3. Na tela **File**, aba **Routes**: use **Import From USB** para trazer a rota do pendrive e depois **Load** para carregá-la. O arquivo começa com `twin_`.
4. Ajuste no painel o que não veio por arquivo. Dica: deixe o site aberto ao lado do aparelho. As telas do site são iguais às do equipamento: abra a mesma janela nos dois e copie os valores campo por campo, principalmente:

| Janela | Campos |
|---|---|
| Setup, aba Simulation | GNSS, Carrier, SBAS, Simulation (tipo), Digital Noise, PRN Signal, Clock com data e hora, RF Level, RF Port, Motion Model |
| Setup, aba I/O | Perdas, referência e trigger |
| File, aba Almanacs | Almanaque |
| Route | Loop |

5. Confira as ligações: a saída do sinal vai para o receptor, uma carga ou um atenuador. **Nada pode irradiar pelo ar.**
6. Aperte **Run**.

## A folha de sessão

O pacote traz um arquivo terminado em `-folha.md`, que abre no Bloco de Notas. Ele resume a saída usada, o nível do sinal previsto e os arquivos do pacote. Vale imprimir e levar para a bancada.

## Cuidados com o equipamento compartilhado

- Não apague arquivos de outras pessoas. Os arquivos criados pelo site sempre começam com `twin_`.
- Antes de mudar a configuração, confirme com quem usou o equipamento por último.
- Ao terminar, pare a simulação (botão Stop do painel).

## Se algo der errado

Anote o que aconteceu: a mensagem que apareceu, em qual tela, e se os pontos aparecem diferentes na tela Route. Guarde o pendrive como está. Essa informação serve para corrigir o formato dos arquivos no site.

## Anexar almanaque ou trajetória (opcional)

O almanaque diz ao simulador onde estão os satélites. O equipamento já tem um de fábrica (Default), que basta para a maioria dos ensaios. Para usar um mais recente:

1. Janela **File**, aba **Almanacs**.
2. Clique em **Anexar arquivo…** e escolha o arquivo `.alm`.
3. O arquivo vai junto no pacote, com o nome começando por `twin_`.

A trajetória (um caminho gravado, em vez de pontos) funciona do mesmo jeito, na aba **Trajectory**, e só é usada quando o tipo de simulação é Trajectory.
