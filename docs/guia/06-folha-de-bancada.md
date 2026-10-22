# Folha de bancada

Uma página, para imprimir e deixar ao lado do equipamento. A folha de sessão de cada cenário (`<cenário>-folha.md`, no pacote) traz os valores específicos: porta, perdas, nível previsto, arquivos e linha do tempo.

## Conexões

- Porta DIRECT ligada a carga de 50 Ω, atenuador ou receptor em bancada; porta COUPLER só com o acoplador sobre a antena do receptor. Nunca as duas.
- Nada irradiando. O receptor sob teste não pode receber o céu real durante a simulação.
- Ethernet até a porta 5025 do equipamento (`Test-NetConnection <ip> -Port 5025`).
- Pendrive FAT32 com `Instrument/` na raiz, se o script importar arquivos.

## Ordem de operações

1. Confirmar com quem usou o equipamento por último.
2. Inserir o pendrive, se houver arquivos a importar.
3. Executar o runner com o script do pacote:
   ```
   powershell -ExecutionPolicy Bypass -File gpsg-run.ps1 -Address <ip> -Script <cenário>.scpi
   ```
   Com a política de execução bloqueando `.ps1`: abrir `<cenário>-colavel.ps1`, copiar tudo e colar no console do PowerShell.
4. O script confere que nenhuma simulação está rodando, salva o estado anterior (`twin_bkp_<cenário>`) e força unidades SI.
5. No `@pause` antes do `@run`: conferir porta e destino do sinal.
6. Acompanhar a linha do tempo da folha de sessão. O log CSV fica em `logs/`.
7. Ao final, guardar o log fora do repositório. Ele reabre no twin ("Abrir…") com a linha do tempo real.

## Regras do equipamento compartilhado

- Nunca enviar `*RST`, `GPS:CAL:*` (exceto consultas) nem `GPS:SYST:CPAS`.
- Nunca enviar `GPS:SIM:TRUN` direto: usar `@run` e `@stop`, que consultam o estado antes.
- Comandos que apagam (`CLeaRall`, `CLeaR`, `REMove`) só com confirmação, um por vez.
- Todo arquivo criado pelo twin começa com `twin_`.

## Se o script parar no meio

1. `GPS:SIM:TRUN?`: se `Running`, parar pela tela (STOP) ou com um script contendo só `@stop`.
2. Restaurar o estado anterior: `GPS:FIL:SET:LOAD "twin_bkp_<cenário>"` e `GPS:FIL:ROUT:LOAD "twin_bkp_<cenário>.rte"`.
3. Conferir na tela que settings e rota do usuário anterior voltaram.
4. Remover os arquivos `twin_` só depois de confirmada a restauração, um por vez.
