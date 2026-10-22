import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRunnerFunction, makePasteable } from './pasteable';

const runner = readFileSync(resolve(import.meta.dirname, '../../runners/gpsg-run.ps1'), 'utf8');

describe('runner colável', () => {
  it('embute a função do runner e o script', () => {
    const out = makePasteable(runner, {
      scriptName: 'S00.scpi',
      script: '@run\r\nGPS:SIM:LAT?\n\n',
      address: '192.168.0.10',
    });
    expect(out).toContain('function Invoke-GpsgScript {');
    expect(out).not.toContain('# Execucao direta do arquivo');
    expect(out).toContain("$gpsgLines = @'\n@run\nGPS:SIM:LAT?\n'@ -split");
    expect(out).toContain(
      "-Address '192.168.0.10' -Port 5025 -Lines $gpsgLines -ScriptName 'S00.scpi'",
    );
    expect(out).toContain('-QuietMs 300 -TimeoutMs 3000 -TimeScale 1 -DryRun $false');
    expect(out).toContain('("S00_" + (Get-Date');
  });

  it('opções', () => {
    const out = makePasteable(runner, {
      scriptName: 'a.scpi',
      script: 'x',
      address: 'h',
      port: 5526,
      quietMs: 40,
      timeoutMs: 500,
      timeScale: 0.01,
    });
    expect(out).toContain('-Port 5526');
    expect(out).toContain('-QuietMs 40 -TimeoutMs 500 -TimeScale 0.01');
  });

  it('recusa entradas que quebrariam o bloco', () => {
    const base = { scriptName: 'a.scpi', script: 'x', address: 'h' };
    expect(() => makePasteable(runner, { ...base, address: "1.2.3.4'; rm" })).toThrow(/endereço/);
    expect(() => makePasteable(runner, { ...base, scriptName: "a'.scpi" })).toThrow(/nome/);
    expect(() => makePasteable(runner, { ...base, script: "ok\n'@ fim" })).toThrow(/linha 2/);
    expect(() => makePasteable(runner, { ...base, port: 0 })).toThrow(/porta/);
    expect(() => makePasteable(runner, { ...base, timeScale: 0 })).toThrow(/TimeScale/);
    expect(() => extractRunnerFunction('nada')).toThrow(/marcadores/);
  });
});
