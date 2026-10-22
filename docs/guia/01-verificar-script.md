# Verificar um script antes da bancada

Disponível na aba Equipamento enquanto a réplica (M3) não existe.

1. Abrir o site ou `gpsg-twin.html` (duplo clique; funciona sem rede).
2. Na aba Equipamento, colar o script no campo ou carregar o arquivo `.scpi` com "Escolher arquivo".
3. Clicar em Verificar.
4. Ler os diagnósticos, por linha:
   - `error`: o equipamento rejeita ou o twin nunca emite (cabeçalho fora do modelo, faixa, parâmetro travado com a simulação rodando, `*RST`, `TRUN` direto). Corrigir antes da bancada, salvo em sonda deliberada.
   - `warning`: aceito, mas com risco ou fora da forma do twin (comando destrutivo sem `@pause` antes, faixa que depende do modo de unidades, sufixo de unidade não verificado).
   - `info`: observação, sem ação.
   - `[Dnn]`: discrepância de `docs/04-discrepancias.md` envolvida.
5. Conferir a linha do tempo: `t_run` de cada evento em relação ao `@run`. Valores com `≥` são mínimos (houve `@pause` ou `@input` antes).
6. A forma canônica mostra o script como o twin o emitiria. Para sondas, enviar o script original, não a forma canônica.
