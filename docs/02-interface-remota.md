# Interface remota e formato de script

## 1. Transporte

- TCP cru na porta 5025, compatível com telnet (RP 1-10). Sem VISA, sem driver.
- Cada mensagem termina em LF (0x0A).
- Comandos não diferenciam maiúsculas de minúsculas. Aceita a forma longa ou a forma curta (letras maiúsculas do cabeçalho); outras abreviações não (RP 1-2).
- Consultas retornam a forma curta (por exemplo `VAR`, `FIX`).
- Parâmetros separados por vírgula, com espaço entre cabeçalho e parâmetros. Strings entre aspas simples ou duplas, sem misturar.
- Ponto e vírgula encadeia comandos no mesmo nó (`:A:B:E;F;G`). O twin não deve emitir encadeamento; um comando por linha facilita log e diagnóstico.
- Erros: `:SYSTem:ERRor?` devolve `<código>,"<texto>"` e remove a entrada da fila; fila vazia devolve `0,"No error"` (RP 1-4).
- Barra de status: `GPS:STAT?`. É onde aparecem os resultados de `GPS:ROUT:VALD` e `GPS:SET:CHAN:APPL`.
- Respostas podem ter várias linhas dentro de aspas (`LIST?`, `FLST?`). O leitor não pode assumir uma linha por resposta.
- Não há comandos sobrepostos no instrumento; `*OPC?` retorna 1 imediatamente (RP 2-3). Sincronização com o equipamento é por consulta de estado, não por `*OPC`.

## 2. Máquina de estados

Dois estados relevantes: parado e rodando (`GPS:SIM:TRUN?` devolve `Stopped` ou `Running`).

- Parâmetros marcados `locked_while_running: true` em `model/commands.json` são rejeitados com a simulação rodando: portadora, GNSS, tipo de simulação, porta de RF, perdas, relógio, data e hora, posição estática, ruído digital, fading, PRN signal, modelo de movimento, canais, carga de almanaque e de KML.
- Em execução são válidos: consultas, `GPS:SET:RFLV` (a confirmar), `GPS:SVPR:*:SAT`, `GPS:SIM:TRUN`.
- `GPS:SIM:TRUN` é alternância: o mesmo comando liga e desliga. Enviado duas vezes por engano, para a simulação. O twin e os runners nunca emitem `TRUN` sem antes consultar `TRUN?` (diretivas `@run` e `@stop`).
- Com `GPS:SET:TSRC EXTERNAL`, `TRUN` apenas arma a simulação; o relógio GPS só avança na borda de subida do trigger.

## 3. Unidades

O modo de unidades (`GPS:SET:UNIT`) altera os valores devolvidos pela interface remota. O manual diz que a sessão começa em SI (RP 1-10) e também que o padrão é IMPERIAL (RP 10-21). As faixas de `ROUT:ADD` estão em ft, ft/min, mph e ft/s², mas o exemplo de `ROUT:LIST?` devolve valores em SI. Até a sessão 1 resolver (D04):

- Todo script gerado pelo twin começa com `GPS:SET:UNIT SI` e confirma com `GPS:SET:UNIT?`.
- Todo valor com unidade é emitido com o sufixo explícito quando o comando aceita `[unit]`, se a sessão 1 confirmar a sintaxe do sufixo.

## 4. Regras para um equipamento compartilhado

1. Antes de qualquer alteração, salvar o estado de quem usou antes: `GPS:FIL:SET:SAV "twin_bkp_<cenário>"` e `GPS:FIL:ROUT:SAV "twin_bkp_<cenário>.rte"`. O nome é derivado do cenário, não da data, para que o script gerado seja determinístico; o backup é sobrescrito a cada execução do mesmo cenário. Ao final, o script traz a restauração (`GPS:FIL:SET:LOAD`, `GPS:FIL:ROUT:LOAD`) em comentário, para execução manual.
2. Nunca emitir: `*RST`, `GPS:CAL:*` (exceto consultas), `GPS:SYST:CPAS`.
3. `CLeaRall`, `CLeaR`, `REMove` e `GPS:WAYP:CLR` apagam arquivos de outros usuários. O twin só os emite com confirmação explícita e nunca em lote.
4. Arquivos criados no equipamento levam prefixo identificável (por exemplo `twin_`), para limpeza sem risco.
5. Antes de `@run`, confirmar porta de RF e destino físico do sinal. Saída COUPLER sem acoplador conectado a uma antena de DUT, ou qualquer arranjo que irradie, está fora do procedimento.

## 5. Formato `.scpi`

Texto UTF-8, uma instrução por linha. Linhas vazias e linhas iniciadas por `#` são ignoradas. Comentário no fim da linha com ` #` (espaço antes) é removido, exceto dentro de aspas.

Linhas sem `@` são enviadas ao equipamento como estão. Uma linha cujo cabeçalho termina em `?` é consulta e tem a resposta lida e registrada.

Diretivas:

| Diretiva | Efeito |
|---|---|
| `@wait <s>` | Espera `s` segundos (aceita decimal) |
| `@run` | Consulta `GPS:SIM:TRUN?`; se `Stopped`, envia `GPS:SIM:TRUN` e confirma `Running`. Zera o relógio de execução `t_run` |
| `@stop` | Consulta `GPS:SIM:TRUN?`; se `Running`, envia `GPS:SIM:TRUN` e confirma `Stopped` |
| `@at <s>` | Espera até `t_run >= s`. Usado para linha do tempo de eventos durante a execução |
| `@poll <periodo_s> <duracao_s> <consulta> [<consulta> ...]` | Repete as consultas no período, pela duração, registrando cada resposta |
| `@expect <consulta> <valor>` | Envia a consulta e compara a resposta (sem aspas, sem espaços nas pontas, sem diferenciar caixa). Registra PASS ou FAIL |
| `@errcheck on\|off` | Liga ou desliga a consulta automática de `:SYST:ERR?` após cada comando |
| `@mark <texto>` | Registra marca no log |
| `@pause <texto>` | Mostra o texto e espera Enter do operador |
| `@set <NOME> <valor>` | Define variável |
| `@input <NOME> <texto>` | Pede o valor ao operador e define a variável |

Variáveis são substituídas em qualquer linha posterior na forma `${NOME}`. Variável indefinida interrompe o script antes de enviar a linha.

Exemplo:

```
# S00: estático genérico, porta DIRECT, para validar o runner
@errcheck on
GPS:FIL:SET:SAV "bkp_twin"
GPS:SET:UNIT SI
GPS:SET:RFPR DIRECT
GPS:SET:RFLV -120
GPS:SET:CARR L1/E1
GPS:SET:CLOC USER
GPS:SET:TIM "11:11:11"
GPS:SET:DAT "04/14/2013"
GPS:SET:STYP STATIC
GPS:SIM:LAT 39.2976
GPS:SIM:LONG -94.7139
GPS:SIM:ALT 300
@pause Confirmar carga de 50 ohm ou DUT na porta DIRECT
@run
@poll 1 30 GPS:SIM:LAT? GPS:SIM:LONG? GPS:SIM:TIM?
@at 40
GPS:SVPR:GPS:LIST?
@stop
```

### 5.1 Formatação e scripts gerados pelo twin

O core lê o script com a mesma semântica dos runners e o reescreve em dois modos:

| Modo | Uso | Efeito |
|---|---|---|
| `preserve` | Scripts de sonda (S01), cujas grafias alternativas são o objeto do ensaio | Só normaliza espaços nas pontas e o espaçamento do comentário de fim de linha |
| `canonical` | Scripts do twin | Forma curta, enum sem aspas, string com aspas duplas, número normalizado, lat/long em graus decimais (D07), `SVPR:SAT` com 8 parâmetros (D02). Linha com erro fica como escrita |

O script gerado a partir de um cenário segue ordem fixa: metadados, `@expect GPS:SIM:TRUN? Stopped` e `@pause` de confirmação, backup, `UNIT SI` (D04), importação e carga de arquivos, setup, I/O, movimento, almanaque, waypoints, posição ou rota ou trajetória conforme o tipo de simulação, RF Level, `@pause` de confirmação física, `@run`, ações em `@at` crescente, `@stop`.

Comentários de metadado lidos de volta pelo twin (ignorados pelos runners):

```
# twin-scenario: <nome>
# twin-description: <texto em uma linha>
# twin-channels: gnss=11 sbas=1 (D09: não emitido)
```

Linha do tempo nominal: comandos não consomem tempo; `@wait`, `@poll` e `@at` sim. Depois de `@pause`, `@input` ou espera que depende de variável, o tempo exibido é o mínimo (marcado com `≥`). `t_run` volta a ser exato a cada `@run`.

## 6. Log de sessão

CSV com cabeçalho, uma linha por evento:

```
utc_iso,t_session_s,t_run_s,kind,text
```

`kind` em `TX`, `RX`, `ERR`, `MARK`, `EXPECT_PASS`, `EXPECT_FAIL`, `INFO`, `WARN`. `RX` multilinha é gravado com quebras de linha escapadas como `\n`. `t_run_s` fica vazio antes do primeiro `@run`. Os logs alimentam o caminho reverso do twin (estado e linha do tempo reconstruídos na réplica). Logs não entram no repositório.

Caminho reverso (`src/core/files/session-log.ts`): o log vira um script `.scpi` com o que o equipamento aceitou.

- `TX` de comando vira linha do script; consultas e o controle de `TRUN` feito pelos runners não entram.
- `TX` seguido de `ERR` antes do próximo `TX` foi rejeitado: entra comentado, com o erro.
- `MARK t_run = 0` vira `@run`; `TRUN` enviado com a simulação rodando vira `@stop`.
- Durante a execução, cada comando recebe `@at <t_run_s>` do log: instantes reais, não os nominais do script de origem.
- Outras marcas viram `@mark`; pausas e entradas do operador (`INFO NOME=valor`) viram comentário.

## 7. Execução no PC da empresa

- PowerShell: `runners/gpsg-run.ps1`. Usa apenas `System.Net.Sockets.TcpClient`, presente em qualquer Windows.
- Se a política de execução bloquear scripts (`Get-ExecutionPolicy`), há duas saídas sem pedir exceção: `powershell -ExecutionPolicy Bypass -File gpsg-run.ps1 ...` (bloqueado se a política vier por GPO) ou colar o conteúdo da função no console interativo, que não é afetado pela política de scripts. A versão colável, com o script embutido, é gerada pelo site (aba Equipamento, "Baixar bloco colável") ou por `npm run pasteable -- --script <arquivo> --address <ip>`. O script não pode ter linha começando com `'@`, que encerraria a here-string.
- Python: `runners/gpsg_run.py`, mesma semântica, para máquinas que tenham Python.
- Sem PC ou sem rede até o equipamento: usar somente o pacote USB para configuração e operar a execução pela tela.

## 7.1 Mock do instrumento

`npm run mock -- [--port 5025] [--host 127.0.0.1] [--split-ms 50] [--prns 1,5,9] [--gal-prns 2,7] [--channels 12] [--verbose]`

Servidor TCP que usa o core do twin: resolve e valida cada comando com o modelo, mantém o estado pelo mesmo redutor do cenário e responde às consultas com o estado configurado. Não simula sinal nem geometria.

- Fila de erros com códigos SCPI padrão (`-113` cabeçalho, `-222` faixa, `-224` valor, `-221` parâmetro travado em execução, `-256` arquivo inexistente, entre outros). O texto traz o diagnóstico do twin. Os códigos reais do equipamento são desconhecidos (D16).
- Consulta com cabeçalho rejeitado não tem resposta, como no equipamento.
- `TRUN` alterna o estado; tempo decorrido e hora simulada avançam com o relógio real.
- Arquivos salvos (`SAV`) ficam em memória e podem ser carregados, listados e removidos. O almanaque padrão existe como `default.alm`.
- PRNs simulados: lista fixa (`--prns`), presente só com a simulação rodando. Elevação e azimute em `SVPR:LIST?` são marcadores, não geometria.
- `--split-ms` envia cada resposta em duas partes para exercitar a leitura por silêncio (seção 8).
- `STAT?` informa a última operação; `ROUT:VALD` só confere o número de pontos.

## 8. Leitura de resposta

O instrumento não sinaliza fim de resposta multilinha. Os runners leem até haver silêncio por um intervalo (`QuietMs`, padrão 300 ms) depois do primeiro byte, com tempo máximo total (`TimeoutMs`, padrão 3000 ms). Consulta sem resposta dentro do tempo máximo é registrada como `WARN`.
