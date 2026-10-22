// Critério de aceite do M2: S01 roda completo contra o mock nos dois runners, com log conforme a
// especificação. Também roda scripts emitidos pelo twin e confere o estado final do mock.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { degToRad } from '../../src/core/geo';
import { defaultScenario } from '../../src/core/scenario/defaults';
import { emitScenario } from '../../src/core/scenario/emit';
import type { Scenario } from '../../src/core/scenario/types';
import { startMock, type MockServer } from '../../src/mock/server';
import { makePasteable } from '../../src/runner/pasteable';
import { parseLog, type LogRow } from './csv';

const ROOT = resolve(import.meta.dirname, '../..');
const TMP = mkdtempSync(join(tmpdir(), 'gpsg-twin-it-'));
const TIMING = { timeScale: 0.01, quietMs: 40, timeoutMs: 400 };

const has = (cmd: string, args: string[]): boolean =>
  spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PYTHON = has('python3', ['--version']) ? 'python3' : 'python';
const HAS_PWSH = has('pwsh', ['-NoProfile', '-Command', 'exit 0']);
if (!HAS_PWSH && process.env.CI)
  throw new Error('pwsh ausente no CI: o runner PowerShell precisa ser testado');

let mock: MockServer | null = null;
afterEach(async () => {
  await mock?.close();
  mock = null;
});

type Runner = 'python' | 'powershell' | 'pasteable';

function command(
  runner: Runner,
  script: string,
  port: number,
  log: string,
): { cmd: string; args: string[] } {
  const t = TIMING;
  if (runner === 'python') {
    return {
      cmd: PYTHON,
      args: [
        resolve(ROOT, 'runners/gpsg_run.py'),
        '--address',
        '127.0.0.1',
        '--port',
        String(port),
        '--script',
        script,
        '--log',
        log,
        '--time-scale',
        String(t.timeScale),
        '--quiet-ms',
        String(t.quietMs),
        '--timeout-ms',
        String(t.timeoutMs),
      ],
    };
  }
  if (runner === 'powershell') {
    return {
      cmd: 'pwsh',
      args: [
        '-NoProfile',
        '-File',
        resolve(ROOT, 'runners/gpsg-run.ps1'),
        '-Address',
        '127.0.0.1',
        '-Port',
        String(port),
        '-Script',
        script,
        '-Log',
        log,
        '-TimeScale',
        String(t.timeScale),
        '-QuietMs',
        String(t.quietMs),
        '-TimeoutMs',
        String(t.timeoutMs),
      ],
    };
  }
  // Bloco colável gravado em arquivo; o log vai para o diretório corrente (cwd = TMP).
  const block = makePasteable(readFileSync(resolve(ROOT, 'runners/gpsg-run.ps1'), 'utf8'), {
    scriptName: 'colavel.scpi',
    script: readFileSync(script, 'utf8'),
    address: '127.0.0.1',
    port,
    ...t,
  });
  const file = join(TMP, `colavel-${port}.ps1`);
  writeFileSync(file, block);
  return { cmd: 'pwsh', args: ['-NoProfile', '-File', file] };
}

function run(
  runner: Runner,
  script: string,
  port: number,
  stdin: string,
): Promise<{ code: number; log: string; out: string }> {
  const log = join(TMP, `${runner}-${port}.csv`);
  const { cmd, args } = command(runner, script, port, log);
  return new Promise((done, fail) => {
    const p = spawn(cmd, args, { cwd: TMP });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.stderr.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', fail);
    p.on('close', (code) => {
      let logFile = log;
      if (runner === 'pasteable') {
        const m = /log: (\S+\.csv)/.exec(out);
        logFile = m?.[1] ?? log;
      }
      done({ code: code ?? -1, log: readFileSync(logFile, 'utf8'), out });
    });
    p.stdin.end(stdin);
  });
}

function summary(rows: LogRow[]): Record<string, number> {
  const end = rows.findLast((r) => r.kind === 'INFO' && r.text.startsWith('end of script'));
  if (!end) throw new Error('log sem "end of script"');
  const out: Record<string, number> = {};
  for (const m of end.text.matchAll(/(\w+)=(\d+)/g)) out[m[1] ?? ''] = Number(m[2]);
  return out;
}

function checkLogFormat(header: string[], rows: LogRow[]): void {
  expect(header).toEqual(['utc_iso', 't_session_s', 't_run_s', 'kind', 'text']);
  const kinds = new Set(['TX', 'RX', 'ERR', 'MARK', 'EXPECT_PASS', 'EXPECT_FAIL', 'INFO', 'WARN']);
  let started = false;
  for (const r of rows) {
    expect(kinds.has(r.kind), r.kind).toBe(true);
    expect(r.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|\+00:00)$/);
    expect(r.tSession).toMatch(/^\d+\.\d{3}$/);
    if (r.kind === 'MARK' && r.text === 't_run = 0') started = true;
    if (!started) expect(r.tRun).toBe('');
    else expect(r.tRun).toMatch(/^-?\d+\.\d{3}$/);
    expect(r.text).not.toMatch(/\n/);
  }
  expect(rows.some((r) => r.kind === 'ERR' && r.text.startsWith('runner:'))).toBe(false);
}

const S01 = resolve(ROOT, 'sessions/S01-sonda.scpi');
// Pausas de S01: A1, E0, G1; @input do PRN em E1.
const S01_STDIN = '\n\n5\n\n\n\n';
// Erros provocados de propósito pela sonda (grafias alternativas, tokens só de UI, faixas, trava).
const S01_ERRORS = { '-113': 3, '-224': 2, '-222': 4, '-221': 1 };

function errorCodes(rows: LogRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows.filter((x) => x.kind === 'ERR')) {
    const code = r.text.replace(/^"/, '').split(',')[0] ?? '';
    out[code] = (out[code] ?? 0) + 1;
  }
  return out;
}

function staticScenario(): Scenario {
  const sc = defaultScenario();
  sc.name = 'it_estatico';
  sc.setup.rfLevel_dBm = -130;
  sc.io.directCable_dB = 2.5;
  sc.actions = [
    {
      t_s: 5,
      type: 'sv',
      constellation: 'GPS',
      sv: 5,
      select: 'ON',
      health: 'BAD',
      doppler_Hz: 50,
      incoherence_mps: 0,
      ampOffset_dB: -6,
      stepError_m: 100,
      duration_s: 10,
    },
    { t_s: 8, type: 'rfLevel', level_dBm: -125 },
  ];
  sc.run.stopAt_s = 10;
  return sc;
}

function dynamicScenario(): Scenario {
  const sc = defaultScenario();
  sc.name = 'it_dinamico';
  sc.setup.simulationType = 'DYNAMIC';
  sc.setup.rfPort = 'COUPLER';
  sc.setup.digitalNoise = 'OFF';
  sc.setup.rfLevel_dBm = -115;
  sc.io = { coupler_dB: 21.5, couplerCable_dB: 2.3, directCable_dB: 0, splitter_dB: 0 };
  sc.motion = {
    model: 'CUSTOM',
    custom: { maxLateral_mps2: 9.8, maxLongitudinal_mps2: 4.9, maxVelocity_mps: 89.41 },
  };
  const leg = { climbRate_mps: 5.08, speed_mps: 44.704, accel_mps2: 9.8, turnRadius_m: 100 };
  sc.route.points = [
    {
      kind: 'point',
      name: 'twin_p1',
      lat_rad: degToRad(39.2976),
      lon_rad: degToRad(-94.7139),
      alt_m: 312,
      ...leg,
    },
    {
      kind: 'point',
      name: 'twin_p3',
      lat_rad: degToRad(37.6499),
      lon_rad: degToRad(-97.4331),
      alt_m: 406,
      ...leg,
    },
  ];
  sc.route.loop = 'ON';
  sc.run.stopAt_s = 3;
  return sc;
}

const RUNNERS: { runner: Runner; enabled: boolean }[] = [
  { runner: 'python', enabled: true },
  { runner: 'powershell', enabled: HAS_PWSH },
  { runner: 'pasteable', enabled: HAS_PWSH },
];

for (const { runner, enabled } of RUNNERS) {
  describe.skipIf(!enabled)(`runner ${runner} contra o mock`, () => {
    it('S01 completo, log conforme a especificação', async () => {
      mock = await startMock({ port: 0, splitMs: 10 });
      const r = await run(runner, S01, mock.port, S01_STDIN);
      expect(r.code, r.out.slice(-2000)).toBe(0);
      const { header, rows } = parseLog(r.log);
      checkLogFormat(header, rows);
      expect(summary(rows)).toEqual({ ERR: 10, WARN: 3, EXPECT_FAIL: 0, EXPECT_PASS: 0 });
      expect(errorCodes(rows)).toEqual(S01_ERRORS);
      expect(rows.filter((x) => x.kind === 'WARN').map((x) => x.text)).toEqual([
        'no response to GPS:SET:PORT?',
        'no response to GPS:SET:STYPE?',
        'no response to GPS:SET:CHAN:SINGLE?',
      ]);
      // Parte F: estado do usuário anterior restaurado e arquivos de sonda removidos.
      expect(mock.instrument.loaded.SET).toBe('twin_bkp_s01');
      expect([...mock.instrument.files.SET.keys()]).toEqual(['twin_bkp_s01']);
      expect([...mock.instrument.files.ROUT.keys()]).toEqual(['twin_bkp_s01.rte']);
    });

    for (const make of [staticScenario, dynamicScenario]) {
      it(`script emitido pelo twin (${make().name}): sem erro e estado igual ao cenário`, async () => {
        const sc = make();
        const emitted = emitScenario(sc);
        expect(emitted.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
        const file = join(TMP, `${sc.name}.scpi`);
        writeFileSync(file, emitted.text);
        mock = await startMock({ port: 0, splitMs: 10 });
        const r = await run(runner, file, mock.port, '\n'.repeat(5));
        expect(r.code, r.out.slice(-2000)).toBe(0);
        const { header, rows } = parseLog(r.log);
        checkLogFormat(header, rows);
        expect(summary(rows)).toEqual({ ERR: 0, WARN: 0, EXPECT_FAIL: 0, EXPECT_PASS: 2 });
        const st = mock.instrument.state;
        const lastRf = sc.actions.findLast((a) => a.type === 'rfLevel');
        expect(st.setup).toEqual({
          ...sc.setup,
          rfLevel_dBm: lastRf?.type === 'rfLevel' ? lastRf.level_dBm : sc.setup.rfLevel_dBm,
        });
        expect(st.io).toEqual(sc.io);
        expect(st.motion).toEqual(sc.motion);
        expect(st.route.loop).toBe(sc.route.loop);
        expect(st.route.points.length).toBe(sc.route.points.length);
        for (const [i, p] of sc.route.points.entries()) {
          const q = st.route.points[i];
          expect(q?.kind).toBe(p.kind);
          if (p.kind === 'point' && q?.kind === 'point') {
            expect(q.name).toBe(p.name);
            expect(q.lat_rad).toBeCloseTo(p.lat_rad, 12);
            expect(q.alt_m).toBeCloseTo(p.alt_m, 6);
            expect(q.speed_mps).toBeCloseTo(p.speed_mps, 6);
          }
        }
        if (sc.setup.simulationType === 'STATIC') {
          expect(st.position.lat_rad).toBeCloseTo(sc.position.lat_rad, 12);
          expect(st.position.alt_m).toBeCloseTo(sc.position.alt_m, 6);
        }
        expect(mock.instrument.running).toBe(false);
        expect(mock.instrument.files.SET.has(`twin_bkp_${sc.name}`)).toBe(true);
        for (const a of sc.actions) {
          if (a.type !== 'sv') continue;
          expect(mock.instrument.sv.GPS.get(a.sv)).toMatchObject({
            health: a.health,
            doppler: a.doppler_Hz,
            step: a.stepError_m,
          });
        }
      });
    }
  });
}
