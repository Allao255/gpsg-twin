// Bloco colável do runner PowerShell: a função Invoke-GpsgScript de runners/gpsg-run.ps1 mais o
// script .scpi embutido em here-string. Para quando a política de execução bloqueia arquivos .ps1;
// o console interativo não é afetado por ela (02-interface-remota.md seção 7).

export const FUNCTION_START = 'function Invoke-GpsgScript {';
export const FUNCTION_END = '# Execucao direta do arquivo';

export interface PasteableOptions {
  scriptName: string;
  script: string;
  address: string;
  port?: number;
  quietMs?: number;
  timeoutMs?: number;
  timeScale?: number;
}

const ADDRESS_RE = /^[A-Za-z0-9.:-]{1,253}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,120}$/;

/** Extrai a função do runner (entre a declaração e o bloco de execução direta). */
export function extractRunnerFunction(runnerSource: string): string {
  const i = runnerSource.indexOf(FUNCTION_START);
  const j = runnerSource.indexOf(FUNCTION_END);
  if (i < 0 || j < 0 || j < i) throw new Error('runner PowerShell sem os marcadores esperados');
  return runnerSource.slice(i, j).trimEnd();
}

function positiveInt(name: string, v: number): number {
  if (!Number.isInteger(v) || v <= 0) throw new Error(`${name} inválido: ${v}`);
  return v;
}

export function makePasteable(runnerSource: string, o: PasteableOptions): string {
  if (!ADDRESS_RE.test(o.address)) throw new Error(`endereço inválido: "${o.address}"`);
  if (!NAME_RE.test(o.scriptName)) throw new Error(`nome de script inválido: "${o.scriptName}"`);
  const port = positiveInt('porta', o.port ?? 5025);
  const quiet = positiveInt('QuietMs', o.quietMs ?? 300);
  const timeout = positiveInt('TimeoutMs', o.timeoutMs ?? 3000);
  const scale = o.timeScale ?? 1;
  if (!(scale > 0)) throw new Error(`TimeScale inválido: ${scale}`);
  const lines = o.script.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const bad = lines.findIndex((l) => l.startsWith("'@"));
  if (bad >= 0) throw new Error(`linha ${bad + 1} começa com '@ e encerraria a here-string`);
  const base = o.scriptName.replace(/\.[^.]*$/, '');
  return [
    `# Bloco colavel gerado de ${o.scriptName}. Colar inteiro no console do PowerShell.`,
    extractRunnerFunction(runnerSource),
    '',
    "$gpsgLines = @'",
    ...lines,
    '\'@ -split "`r?`n"',
    `$gpsgLog = Join-Path (Get-Location) ("${base}_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')`,
    `$gpsgExit = Invoke-GpsgScript -Address '${o.address}' -Port ${port} -Lines $gpsgLines -ScriptName '${o.scriptName}' -Log $gpsgLog ` +
      `-QuietMs ${quiet} -TimeoutMs ${timeout} -TimeScale ${String(scale)} -DryRun $false`,
    'Write-Host "codigo de saida: $gpsgExit  log: $gpsgLog"',
    '',
  ].join('\n');
}
