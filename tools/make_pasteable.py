#!/usr/bin/env python3
"""Builds a paste-into-console PowerShell block with the runner function and an embedded .scpi script.

Used when the execution policy blocks .ps1 files: the interactive console is not subject to it.

Usage: python tools/make_pasteable.py --script sessions/S01-sonda.scpi --address 192.168.0.10 > S01-colavel.ps1
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, "..", "runners", "gpsg-run.ps1")
START = "function Invoke-GpsgScript {"
END = "# Execucao direta do arquivo"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", required=True)
    ap.add_argument("--address", required=True)
    ap.add_argument("--port", type=int, default=5025)
    ap.add_argument("--quiet-ms", type=int, default=300)
    ap.add_argument("--timeout-ms", type=int, default=3000)
    ap.add_argument("--time-scale", type=float, default=1.0)
    a = ap.parse_args()

    src = open(RUNNER, encoding="utf-8").read()
    i, j = src.index(START), src.index(END)
    func = src[i:j].rstrip()

    body = open(a.script, encoding="utf-8").read()
    if any(line.startswith("'@") for line in body.splitlines()):
        sys.exit("script contains a line starting with '@ and cannot be embedded in a here-string")

    name = os.path.basename(a.script)
    base = os.path.splitext(name)[0]
    out = [
        f"# Bloco colavel gerado de {name}. Colar inteiro no console do PowerShell.",
        func,
        "",
        "$gpsgLines = @'",
        body.rstrip("\n"),
        "'@ -split \"`r?`n\"",
        f"$gpsgLog = Join-Path (Get-Location) (\"{base}_\" + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')",
        f"$gpsgExit = Invoke-GpsgScript -Address '{a.address}' -Port {a.port} -Lines $gpsgLines -ScriptName '{name}' -Log $gpsgLog "
        f"-QuietMs {a.quiet_ms} -TimeoutMs {a.timeout_ms} -TimeScale {a.time_scale} -DryRun $false",
        "Write-Host \"codigo de saida: $gpsgExit  log: $gpsgLog\"",
        "",
    ]
    sys.stdout.write("\n".join(out))


if __name__ == "__main__":
    main()
