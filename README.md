# gpsg-twin

Configurador espelho do simulador GNSS VIAVI GPSG-1000: a configuração é feita numa réplica da interface e vira código e arquivos reaplicáveis, para preparar, reproduzir e documentar sessões de ensaio fora do equipamento.

- Réplica da interface do equipamento com geração e leitura de scripts SCPI.
- Pacote USB de configuração (settings, rota, trajetória, almanaque) nos formatos nativos do equipamento.
- Aba Análise para validar visualmente o que um código pede: linha do tempo, rota no mapa, satélites calculados a partir do almanaque do cenário, intensidades e orçamento de nível.
- Não gera sinal nem modela o receptor sob teste.
- Runners em PowerShell e Python para executar os scripts pela porta 5025, com log CSV.

Projeto independente, sem vínculo com a VIAVI Solutions. GPSG-1000 é marca do fabricante.

## Estrutura

```
model/commands.json      modelo de comandos do manual de programação remota
model/commands.schema.json  schema do modelo (validação e tipos gerados)
src/core/                core TypeScript: parser SCPI, validação, script .scpi, cenário, quirks
src/core/files/          formatos do pacote USB, log dos runners, ZIP, folha de sessão
src/replica/             lógica da réplica da interface: campos, travas, sessão, rota, waypoints
src/docs/                referência de comandos gerada do modelo
src/analysis/            camada declarada da aba Análise: eventos, estado no instante, checagens de rota
src/ui/                  site (abas Equipamento, Análise, Ajuda)
src/mock/                mock TCP do instrumento (npm run mock)
src/runner/              gerador do runner PowerShell colável
docs/                    visão geral, equipamento, interface remota, formatos, discrepâncias, roteiro, sessão 1
docs/guia/               guia de uso
sessions/                scripts .scpi de sessão
runners/                 gpsg-run.ps1, gpsg_run.py
refs/                    manuais do fabricante, somente local (ver refs/README.md)
```

## Uso dos runners

```
powershell -ExecutionPolicy Bypass -File runners\gpsg-run.ps1 -Address <ip> -Script sessions\S01-sonda.scpi
python runners/gpsg_run.py --address <ip> --script sessions/S01-sonda.scpi
```

Formato `.scpi` e de log: `docs/02-interface-remota.md`.

## Desenvolvimento

Node 22 (`.nvmrc`).

```
npm ci
npm test              # testes (valida o modelo contra o schema antes)
npm run test:cov      # testes com cobertura (limiar 90%)
npm run lint
npm run build         # dist/site/ para GitHub Pages
npm run build:single  # dist/gpsg-twin.html autocontido
npm run gen           # regenera tipos após mudar o modelo ou o schema
npm run mock          # instrumento simulado na porta 5025
npm run test:integration  # runners Python e PowerShell contra o mock
```

## Estado

M0 a M3 concluídos: base do projeto, core (modelo, parser, validação, emissor, cenário), referência de comandos gerada, mock do instrumento em Node, testes de integração dos runners, runner PowerShell colável gerado pelo site e réplica da interface sincronizada com o editor de script. M4 (pacote USB e caminho reverso) implementado, com aceite pendente da sessão de bancada. M5 (aba Análise, camada declarada: linha do tempo, mapa, orçamento, checagens de rota) concluído. Próximo marco: M6 (satélites calculados a partir do almanaque). Nenhum comando verificado em hardware. Plano em `docs/05-roteiro.md`.
