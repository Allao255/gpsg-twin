#!/usr/bin/env python3
"""Runner for .scpi session scripts against a GPSG-1000 (raw TCP, port 5025).

Format and directives: docs/02-interface-remota.md, section 5.
Log format: docs/02-interface-remota.md, section 6.

Usage:
  python runners/gpsg_run.py --address 192.168.0.10 --script sessions/S01-sonda.scpi
  python runners/gpsg_run.py --script sessions/S01-sonda.scpi --dry-run
Options --time-scale < 1 shortens waits and polls; use only against the mock.
"""
import argparse
import csv
import datetime as dt
import os
import re
import select
import socket
import sys
import time

VAR_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def strip_comment(line: str) -> str:
    """Remove ' #' trailing comments outside quotes."""
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and i > 0 and line[i - 1].isspace():
            return line[:i].rstrip()
    return line


def is_query(cmd: str) -> bool:
    return cmd.split(" ", 1)[0].endswith("?")


def clean(resp: str) -> str:
    return resp.strip().strip('"').strip()


class Session:
    def __init__(self, args):
        self.args = args
        self.sock = None
        self.t0 = time.monotonic()
        self.t_run0 = None
        self.vars = {}
        self.errcheck = False
        os.makedirs(os.path.dirname(os.path.abspath(args.log)), exist_ok=True)
        self.logf = open(args.log, "w", newline="", encoding="utf-8")
        self.log = csv.writer(self.logf)
        self.log.writerow(["utc_iso", "t_session_s", "t_run_s", "kind", "text"])
        self.counts = {"ERR": 0, "WARN": 0, "EXPECT_FAIL": 0, "EXPECT_PASS": 0}

    # ---------- logging ----------
    def emit(self, kind, text):
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds")
        ts = f"{time.monotonic() - self.t0:.3f}"
        tr = f"{time.monotonic() - self.t_run0:.3f}" if self.t_run0 is not None else ""
        flat = text.replace("\r", "").replace("\n", "\\n")
        self.log.writerow([now, ts, tr, kind, flat])
        self.logf.flush()
        if kind in self.counts:
            self.counts[kind] += 1
        print(f"[{ts:>9}] {kind:<11} {text}", flush=True)

    # ---------- transport ----------
    def connect(self):
        if self.args.dry_run:
            return
        self.sock = socket.create_connection((self.args.address, self.args.port), timeout=5)
        self.sock.setblocking(False)
        self.emit("INFO", f"connected {self.args.address}:{self.args.port}")

    def drain(self):
        if self.sock is None:
            return
        while select.select([self.sock], [], [], 0)[0]:
            if not self.sock.recv(65536):
                break

    def send(self, cmd):
        self.emit("TX", cmd)
        if self.sock is not None:
            self.drain()
            self.sock.sendall((cmd + "\n").encode("utf-8"))

    def read_response(self):
        if self.sock is None:
            return ""
        quiet = self.args.quiet_ms / 1000.0
        deadline = time.monotonic() + self.args.timeout_ms / 1000.0
        buf = b""
        last = None
        while True:
            now = time.monotonic()
            if last is not None and now - last >= quiet:
                break
            if now >= deadline:
                break
            wait = min(0.05, deadline - now)
            if select.select([self.sock], [], [], wait)[0]:
                chunk = self.sock.recv(65536)
                if not chunk:
                    raise ConnectionError("connection closed by instrument")
                buf += chunk
                last = time.monotonic()
        return buf.decode("utf-8", "replace").rstrip("\r\n")

    def query(self, cmd, log_kind="RX"):
        self.send(cmd)
        if self.sock is None:
            return ""
        resp = self.read_response()
        if resp == "":
            self.emit("WARN", f"no response to {cmd}")
        else:
            self.emit(log_kind, resp)
        return resp

    def check_errors(self):
        if self.sock is None:
            return
        for _ in range(10):
            self.sock.sendall(b":SYST:ERR?\n")
            resp = self.read_response()
            if not resp:
                self.emit("WARN", "no response to :SYST:ERR?")
                return
            code = clean(resp).split(",", 1)[0].strip()
            if code in ("0", "+0"):
                return
            self.emit("ERR", resp)

    def command(self, cmd):
        if is_query(cmd):
            self.query(cmd)
        else:
            self.send(cmd)
        if self.errcheck:
            self.check_errors()

    # ---------- directives ----------
    def sleep(self, seconds):
        time.sleep(max(0.0, seconds * self.args.time_scale))

    def run_state(self):
        if self.sock is None:
            return None
        return clean(self.query("GPS:SIM:TRUN?")).lower()

    def ensure(self, want_running: bool):
        state = self.run_state()
        if self.sock is None:
            self.send("GPS:SIM:TRUN")
        elif (state == "running") != want_running:
            self.send("GPS:SIM:TRUN")
            if self.errcheck:
                self.check_errors()
            target = "running" if want_running else "stopped"
            for _ in range(20):
                self.sleep(0.25)
                if self.run_state() == target:
                    break
            else:
                self.emit("WARN", f"state did not reach {target}")
        else:
            self.emit("INFO", f"already {state}; TRUN not sent")
        if want_running:
            self.t_run0 = time.monotonic()
            self.emit("MARK", "t_run = 0")

    def directive(self, line):
        name, _, rest = line[1:].partition(" ")
        name = name.lower()
        rest = rest.strip()
        if name == "wait":
            self.sleep(float(rest))
        elif name == "run":
            self.ensure(True)
        elif name == "stop":
            self.ensure(False)
        elif name == "at":
            if self.t_run0 is None:
                raise RuntimeError("@at before @run")
            target = float(rest) * self.args.time_scale
            while time.monotonic() - self.t_run0 < target:
                time.sleep(0.01)
        elif name == "poll":
            parts = rest.split()
            period, duration, queries = float(parts[0]), float(parts[1]), parts[2:]
            queries = self._rejoin(queries)
            end = time.monotonic() + duration * self.args.time_scale
            nxt = time.monotonic()
            while time.monotonic() < end:
                for q in queries:
                    self.query(q)
                nxt += period * self.args.time_scale
                time.sleep(max(0.0, nxt - time.monotonic()))
        elif name == "expect":
            q, _, want = rest.partition(" ")
            got = clean(self.query(q))
            ok = got.lower() == clean(want).lower()
            self.emit("EXPECT_PASS" if ok else "EXPECT_FAIL", f"{q} expected={want} got={got}")
        elif name == "errcheck":
            self.errcheck = rest.lower() == "on"
            self.emit("INFO", f"errcheck {rest.lower()}")
        elif name == "mark":
            self.emit("MARK", rest)
        elif name == "pause":
            self.emit("MARK", f"PAUSE {rest}")
            input(f"\n>>> {rest}\n>>> Enter para continuar: ")
        elif name == "set":
            k, _, v = rest.partition(" ")
            self.vars[k] = v.strip()
            self.emit("INFO", f"{k}={self.vars[k]}")
        elif name == "input":
            k, _, prompt = rest.partition(" ")
            self.vars[k] = input(f"\n>>> {prompt}: ").strip()
            self.emit("INFO", f"{k}={self.vars[k]}")
        else:
            raise RuntimeError(f"unknown directive @{name}")

    @staticmethod
    def _rejoin(tokens):
        """Queries in @poll are separated by spaces; a token not containing ':' or '*' is an argument of the previous query."""
        out = []
        for t in tokens:
            if out and not (":" in t or t.startswith("*")):
                out[-1] += " " + t
            else:
                out.append(t)
        return out

    def substitute(self, line, lineno):
        def rep(m):
            k = m.group(1)
            if k not in self.vars:
                raise RuntimeError(f"line {lineno}: undefined variable {k}")
            return self.vars[k]
        return VAR_RE.sub(rep, line)

    def run(self, path):
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        self.emit("INFO", f"script {path} ({len(lines)} lines)")
        self.connect()
        for n, raw in enumerate(lines, 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            line = self.substitute(strip_comment(line), n)
            if line.startswith("@"):
                self.directive(line)
            else:
                self.command(line)
        self.emit("INFO", "end of script " + " ".join(f"{k}={v}" for k, v in self.counts.items()))

    def close(self):
        if self.sock is not None:
            self.sock.close()
        self.logf.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--address", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5025)
    ap.add_argument("--script", required=True)
    ap.add_argument("--log", default=None)
    ap.add_argument("--quiet-ms", type=int, default=300)
    ap.add_argument("--timeout-ms", type=int, default=3000)
    ap.add_argument("--time-scale", type=float, default=1.0)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.log is None:
        stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        a.log = os.path.join("logs", f"{os.path.splitext(os.path.basename(a.script))[0]}_{stamp}.csv")
    s = Session(a)
    try:
        s.run(a.script)
    except KeyboardInterrupt:
        s.emit("WARN", "interrupted by operator")
        return 130
    except Exception as e:  # noqa: BLE001
        s.emit("ERR", f"runner: {e}")
        return 1
    finally:
        s.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
