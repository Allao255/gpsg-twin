#!/usr/bin/env python3
"""Minimal GPSG-1000 mock for runner tests.

Recognizes headers from model/commands.json (long form, short form, aliases),
keeps an error queue, toggles run state, rejects locked parameters while running,
and answers queries with plausible placeholders. It is not the twin: no geometry,
no motion. Replaced by the Node mock in milestone M2.

Usage: python tools/mock_minimal.py [--port 5025] [--model model/commands.json]
"""
import argparse
import json
import os
import re
import socket
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def short_form(node: str) -> str:
    up = "".join(ch for ch in node if ch.isupper() or ch.isdigit() or ch in "*?/+")
    return up or node.upper()


def split_nodes(header: str):
    header = header.lstrip(":")
    is_query = header.endswith("?")
    core = header[:-1] if is_query else header
    return core.split(":"), is_query


class Model:
    def __init__(self, path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        self.entries = []
        for c in data["commands"]:
            nodes, is_q = split_nodes(c["header"])
            alias_last = [a.rstrip("?").upper() for a in c.get("aliases", [])]
            self.entries.append((nodes, is_q, alias_last, c))

    def resolve(self, header):
        nodes, is_q = split_nodes(header)
        for m_nodes, m_q, aliases, cmd in self.entries:
            if m_q != is_q or len(m_nodes) != len(nodes):
                continue
            ok = True
            for i, (got, want) in enumerate(zip(nodes, m_nodes)):
                g = got.upper()
                accepted = {want.upper(), short_form(want)}
                if i == len(nodes) - 1:
                    accepted |= set(aliases)
                if g not in accepted:
                    ok = False
                    break
            if ok:
                return cmd
        return None


class Instrument:
    def __init__(self, model):
        self.model = model
        self.errors = []
        self.running = False
        self.lock = threading.Lock()

    def handle(self, line):
        line = line.strip()
        if not line:
            return None
        header, _, args = line.partition(" ")
        if header.upper() == "GPS:?":
            return '"GPS:SET:RFPR <DIRECT|COUPLER>\nGPS:SIM:TRUN\nGPS:SIM:TRUN?\n(mock help, partial)"'
        cmd = self.model.resolve(header)
        with self.lock:
            if cmd is None:
                self.errors.append('-113,"Undefined header"')
                return None
            h = cmd["header"].upper()
            if h in (":SYSTEM:ERROR?",):
                return self.errors.pop(0) if self.errors else '0,"No error"'
            if h == "GPS:SIM:TOGGLERUN":
                self.running = not self.running
                return None
            if h == "GPS:SIM:TOGGLERUN?":
                return '"Running"' if self.running else '"Stopped"'
            if cmd["kind"] != "query" and self.running and cmd.get("locked_while_running") is True:
                self.errors.append('-221,"Settings conflict; simulation in progress"')
                return None
            if cmd["kind"] != "query":
                return None
            if h == "*IDN?":
                return "VIAVI,GPSG-1000,0000000000,0.0.0,mock"
            if h.endswith(":LIST?"):
                rows = [f"{sv},{45+sv%30}.0,{(sv*37)%360-180}.0,-130,0,0,0,0,3600,Good,ON,ON" for sv in (1, 5, 9, 13)]
                return '"' + "\n".join(rows) + '"'
            if h.endswith("STAT?"):
                return '"mock status OK"'
            return "0"


def serve(port, model_path):
    inst = Instrument(Model(model_path))
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(1)
    print(f"mock listening on 127.0.0.1:{port}", flush=True)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=client, args=(conn, inst), daemon=True).start()


def client(conn, inst):
    buf = b""
    with conn:
        while True:
            data = conn.recv(4096)
            if not data:
                return
            buf += data
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                resp = inst.handle(raw.decode("utf-8", "replace"))
                if resp is not None:
                    # multi-line answers are sent in two chunks to exercise the quiet-period reader
                    payload = (resp + "\n").encode()
                    half = len(payload) // 2
                    conn.sendall(payload[:half])
                    time.sleep(0.05)
                    conn.sendall(payload[half:])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5025)
    ap.add_argument("--model", default=os.path.join(HERE, "..", "model", "commands.json"))
    a = ap.parse_args()
    serve(a.port, a.model)
