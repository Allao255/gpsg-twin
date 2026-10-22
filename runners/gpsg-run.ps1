<#
.SYNOPSIS
  Runner de scripts .scpi para o GPSG-1000 (TCP cru, porta 5025).
.DESCRIPTION
  Formato e diretivas: docs/02-interface-remota.md, secao 5. Log: secao 6.
  Compativel com Windows PowerShell 5.1 e PowerShell 7. Usa apenas System.Net.Sockets.TcpClient.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File runners\gpsg-run.ps1 -Address 192.168.0.10 -Script sessions\S01-sonda.scpi
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File runners\gpsg-run.ps1 -Script sessions\S01-sonda.scpi -DryRun
#>
param(
    [string]$Address = '127.0.0.1',
    [int]$Port = 5025,
    [Parameter(Mandatory = $true)][string]$Script,
    [string]$Log = '',
    [int]$QuietMs = 300,
    [int]$TimeoutMs = 3000,
    [double]$TimeScale = 1.0,
    [switch]$DryRun
)

function Invoke-GpsgScript {
    param(
        [string]$Address, [int]$Port, [string[]]$Lines, [string]$ScriptName, [string]$Log,
        [int]$QuietMs, [int]$TimeoutMs, [double]$TimeScale, [bool]$DryRun
    )

    $ErrorActionPreference = 'Stop'
    $S = @{
        Client = $null; Stream = $null
        Sw = [System.Diagnostics.Stopwatch]::StartNew()
        RunT0 = $null; ErrCheck = $false; Vars = @{}
        Counts = @{ ERR = 0; WARN = 0; EXPECT_PASS = 0; EXPECT_FAIL = 0 }
    }

    $logDir = Split-Path -Parent ([System.IO.Path]::GetFullPath($Log))
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
    $writer = New-Object System.IO.StreamWriter($Log, $false, (New-Object System.Text.UTF8Encoding($false)))
    $writer.WriteLine('utc_iso,t_session_s,t_run_s,kind,text')

    function Csv([string]$v) { '"' + $v.Replace('"', '""') + '"' }

    function Emit([string]$kind, [string]$text) {
        $now = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        $ts = ('{0:F3}' -f $S.Sw.Elapsed.TotalSeconds).Replace(',', '.')
        $tr = ''
        if ($null -ne $S.RunT0) { $tr = ('{0:F3}' -f ($S.Sw.Elapsed.TotalSeconds - $S.RunT0)).Replace(',', '.') }
        $flat = $text.Replace("`r", '').Replace("`n", '\n')
        $writer.WriteLine("$now,$ts,$tr,$kind," + (Csv $flat))
        $writer.Flush()
        if ($S.Counts.ContainsKey($kind)) { $S.Counts[$kind]++ }
        Write-Host ('[{0,9}] {1,-11} {2}' -f $ts, $kind, $text)
    }

    function Sleep-Scaled([double]$seconds) {
        $ms = [int]([Math]::Max(0, $seconds * $TimeScale * 1000))
        if ($ms -gt 0) { Start-Sleep -Milliseconds $ms }
    }

    function Drain {
        if ($null -eq $S.Stream) { return }
        $buf = New-Object byte[] 65536
        while ($S.Stream.DataAvailable) { [void]$S.Stream.Read($buf, 0, $buf.Length) }
    }

    function Send-Line([string]$cmd, [bool]$log = $true) {
        if ($log) { Emit 'TX' $cmd }
        if ($null -eq $S.Stream) { return }
        Drain
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($cmd + "`n")
        $S.Stream.Write($bytes, 0, $bytes.Length)
        $S.Stream.Flush()
    }

    function Read-Response {
        if ($null -eq $S.Stream) { return '' }
        $ms = New-Object System.IO.MemoryStream
        $buf = New-Object byte[] 65536
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        $last = $null
        while ($true) {
            $now = $timer.ElapsedMilliseconds
            if (($null -ne $last) -and (($now - $last) -ge $QuietMs)) { break }
            if ($now -ge $TimeoutMs) { break }
            if ($S.Stream.DataAvailable) {
                $n = $S.Stream.Read($buf, 0, $buf.Length)
                if ($n -le 0) { throw 'connection closed by instrument' }
                $ms.Write($buf, 0, $n)
                $last = $timer.ElapsedMilliseconds
            } else {
                Start-Sleep -Milliseconds 20
            }
        }
        return [System.Text.Encoding]::UTF8.GetString($ms.ToArray()).TrimEnd("`r", "`n")
    }

    function Clean([string]$r) { return $r.Trim().Trim('"').Trim() }

    function Is-Query([string]$cmd) { return ($cmd.Split(' ')[0]).EndsWith('?') }

    function Do-Query([string]$cmd) {
        Send-Line $cmd
        if ($null -eq $S.Stream) { return '' }
        $r = Read-Response
        if ($r -eq '') { Emit 'WARN' "no response to $cmd" } else { Emit 'RX' $r }
        return $r
    }

    function Check-Errors {
        if ($null -eq $S.Stream) { return }
        for ($i = 0; $i -lt 10; $i++) {
            Send-Line ':SYST:ERR?' $false
            $r = Read-Response
            if ($r -eq '') { Emit 'WARN' 'no response to :SYST:ERR?'; return }
            $code = ((Clean $r).Split(',')[0]).Trim()
            if ($code -eq '0' -or $code -eq '+0') { return }
            Emit 'ERR' $r
        }
    }

    function Do-Command([string]$cmd) {
        if (Is-Query $cmd) { [void](Do-Query $cmd) } else { Send-Line $cmd }
        if ($S.ErrCheck) { Check-Errors }
    }

    function Get-RunState {
        if ($null -eq $S.Stream) { return $null }
        return (Clean (Do-Query 'GPS:SIM:TRUN?')).ToLower()
    }

    function Ensure-Run([bool]$wantRunning) {
        $state = Get-RunState
        if ($null -eq $S.Stream) {
            Send-Line 'GPS:SIM:TRUN'
        } elseif (($state -eq 'running') -ne $wantRunning) {
            Send-Line 'GPS:SIM:TRUN'
            if ($S.ErrCheck) { Check-Errors }
            $target = 'stopped'
            if ($wantRunning) { $target = 'running' }
            $ok = $false
            for ($i = 0; $i -lt 20; $i++) {
                Sleep-Scaled 0.25
                if ((Get-RunState) -eq $target) { $ok = $true; break }
            }
            if (-not $ok) { Emit 'WARN' "state did not reach $target" }
        } else {
            Emit 'INFO' "already $state; TRUN not sent"
        }
        if ($wantRunning) {
            $S.RunT0 = $S.Sw.Elapsed.TotalSeconds
            Emit 'MARK' 't_run = 0'
        }
    }

    function Join-PollQueries([string[]]$tokens) {
        $out = New-Object System.Collections.Generic.List[string]
        foreach ($t in $tokens) {
            if ($out.Count -gt 0 -and -not ($t.Contains(':') -or $t.StartsWith('*'))) {
                $out[$out.Count - 1] = $out[$out.Count - 1] + ' ' + $t
            } else { $out.Add($t) }
        }
        return ,$out.ToArray()
    }

    function Do-Directive([string]$line) {
        $body = $line.Substring(1)
        $idx = $body.IndexOf(' ')
        if ($idx -lt 0) { $name = $body.ToLower(); $rest = '' }
        else { $name = $body.Substring(0, $idx).ToLower(); $rest = $body.Substring($idx + 1).Trim() }
        $inv = [System.Globalization.CultureInfo]::InvariantCulture
        switch ($name) {
            'wait' { Sleep-Scaled ([double]::Parse($rest, $inv)) }
            'run' { Ensure-Run $true }
            'stop' { Ensure-Run $false }
            'at' {
                if ($null -eq $S.RunT0) { throw '@at before @run' }
                $target = [double]::Parse($rest, $inv) * $TimeScale
                while (($S.Sw.Elapsed.TotalSeconds - $S.RunT0) -lt $target) { Start-Sleep -Milliseconds 10 }
            }
            'poll' {
                $p = $rest -split '\s+'
                $period = [double]::Parse($p[0], $inv) * $TimeScale
                $duration = [double]::Parse($p[1], $inv) * $TimeScale
                $queries = Join-PollQueries ($p[2..($p.Length - 1)])
                $end = $S.Sw.Elapsed.TotalSeconds + $duration
                $next = $S.Sw.Elapsed.TotalSeconds
                while ($S.Sw.Elapsed.TotalSeconds -lt $end) {
                    foreach ($q in $queries) { [void](Do-Query $q) }
                    $next += $period
                    $wait = $next - $S.Sw.Elapsed.TotalSeconds
                    if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]($wait * 1000)) }
                }
            }
            'expect' {
                $i = $rest.IndexOf(' ')
                $q = $rest.Substring(0, $i); $want = Clean ($rest.Substring($i + 1))
                $got = Clean (Do-Query $q)
                if ($got.ToLower() -eq $want.ToLower()) { Emit 'EXPECT_PASS' "$q expected=$want got=$got" }
                else { Emit 'EXPECT_FAIL' "$q expected=$want got=$got" }
            }
            'errcheck' { $S.ErrCheck = ($rest.ToLower() -eq 'on'); Emit 'INFO' ("errcheck " + $rest.ToLower()) }
            'mark' { Emit 'MARK' $rest }
            'pause' { Emit 'MARK' "PAUSE $rest"; [void](Read-Host ">>> $rest`n>>> Enter para continuar") }
            'set' {
                $i = $rest.IndexOf(' ')
                $S.Vars[$rest.Substring(0, $i)] = $rest.Substring($i + 1).Trim()
                Emit 'INFO' ($rest.Substring(0, $i) + '=' + $S.Vars[$rest.Substring(0, $i)])
            }
            'input' {
                $i = $rest.IndexOf(' ')
                $k = $rest.Substring(0, $i)
                $S.Vars[$k] = (Read-Host (">>> " + $rest.Substring($i + 1))).Trim()
                Emit 'INFO' "$k=$($S.Vars[$k])"
            }
            default { throw "unknown directive @$name" }
        }
    }

    function Strip-Comment([string]$line) {
        $quote = $null
        for ($i = 0; $i -lt $line.Length; $i++) {
            $ch = $line[$i]
            if ($null -ne $quote) { if ($ch -eq $quote) { $quote = $null } }
            elseif ($ch -eq '"' -or $ch -eq "'") { $quote = $ch }
            elseif ($ch -eq '#' -and $i -gt 0 -and [char]::IsWhiteSpace($line[$i - 1])) { return $line.Substring(0, $i).TrimEnd() }
        }
        return $line
    }

    function Substitute([string]$line, [int]$n) {
        return [regex]::Replace($line, '\$\{([A-Za-z_][A-Za-z0-9_]*)\}', {
            param($m)
            $k = $m.Groups[1].Value
            if (-not $S.Vars.ContainsKey($k)) { throw "line ${n}: undefined variable $k" }
            return $S.Vars[$k]
        })
    }

    $exit = 0
    try {
        Emit 'INFO' "script $ScriptName ($($Lines.Count) lines)"
        if (-not $DryRun) {
            $S.Client = New-Object System.Net.Sockets.TcpClient
            $S.Client.NoDelay = $true
            $S.Client.Connect($Address, $Port)
            $S.Stream = $S.Client.GetStream()
            Emit 'INFO' "connected ${Address}:$Port"
        }
        for ($n = 1; $n -le $Lines.Count; $n++) {
            $line = $Lines[$n - 1].Trim()
            if ($line -eq '' -or $line.StartsWith('#')) { continue }
            $line = Substitute (Strip-Comment $line) $n
            if ($line.StartsWith('@')) { Do-Directive $line } else { Do-Command $line }
        }
        $c = $S.Counts
        Emit 'INFO' "end of script ERR=$($c.ERR) WARN=$($c.WARN) EXPECT_FAIL=$($c.EXPECT_FAIL) EXPECT_PASS=$($c.EXPECT_PASS)"
    } catch {
        Emit 'ERR' ("runner: " + $_.Exception.Message)
        $exit = 1
    } finally {
        if ($null -ne $S.Client) { $S.Client.Close() }
        $writer.Close()
    }
    return $exit
}

# Execucao direta do arquivo (a variante colavel define a funcao e chama com as linhas embutidas)
if ($MyInvocation.InvocationName -ne '.') {
    if ($Log -eq '') {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($Script)
        $Log = Join-Path 'logs' ("{0}_{1}.csv" -f $base, (Get-Date -Format 'yyyyMMdd_HHmmss'))
    }
    $lines = Get-Content -Path $Script -Encoding UTF8
    $code = Invoke-GpsgScript -Address $Address -Port $Port -Lines $lines -ScriptName $Script -Log $Log `
        -QuietMs $QuietMs -TimeoutMs $TimeoutMs -TimeScale $TimeScale -DryRun $DryRun.IsPresent
    exit $code
}
