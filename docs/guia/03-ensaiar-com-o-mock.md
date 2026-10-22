# Ensaiar um script contra o mock

Para depurar script e runner antes da bancada, sem ocupar o equipamento. Exige Node na máquina que roda o mock.

1. Iniciar o mock:
   ```
   npm run mock
   ```
   Para aceitar conexões de outra máquina da rede: `npm run mock -- --host 0.0.0.0`.
2. Rodar o runner apontando para o mock (`127.0.0.1` ou o IP da máquina do mock):
   ```
   powershell -ExecutionPolicy Bypass -File runners\gpsg-run.ps1 -Address 127.0.0.1 -Script sessions\S01-sonda.scpi
   ```
   Para encurtar esperas e polls, acrescentar `-TimeScale 0.01` (só contra o mock).
3. Ler o resumo no fim (`end of script ERR=.. WARN=..`) e o log CSV em `logs/`.
4. Erros no mock têm código SCPI padrão e, no texto, o motivo apontado pelo twin (por exemplo, faixa ou cabeçalho fora do modelo). Os códigos do equipamento real podem diferir.

O mock não simula sinal: listas de satélites, elevação e azimute são marcadores, e a validação de rota só confere o número de pontos.

## Runner colável

Quando a política de execução bloqueia arquivos `.ps1`:

1. Na aba Equipamento, carregar o script e preencher endereço e porta do equipamento.
2. Clicar em "Baixar bloco colável".
3. Abrir o arquivo baixado, copiar tudo e colar no console do PowerShell.
