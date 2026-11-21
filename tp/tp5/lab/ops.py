"""TP5 lab operations: the contract between the Docker lab and the report.

Every operation runs silently, records a full diagnostic record (invocations,
stdout, stderr, exit codes, durations) under evidence/runs/<run-id>/diagnostics/
and returns a typed dict with a semantic verdict. The report renders those
dicts; it never parses console text nor sees `docker compose exec` mechanics.

Lifecycle stays in the terminal, outside the notebook:

    python lab/ops.py up         # build images and start the lab (waits for health)
    python lab/ops.py validate   # run every scenario end to end with assertions
    python lab/ops.py down       # stop and remove containers/network (volumes kept)

Standard library only, so it runs from the host python or the report venv.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

LAB = Path(__file__).resolve().parent
ROOT = LAB.parent  # tp/tp5: evidence paths are reported relative to it
COMPOSE = ["docker", "compose", "--project-directory", str(LAB), "-f", str(LAB / "compose.yaml")]

SERVER, HONEYPOT, ATTACKER = "10.0.0.10", "10.0.0.20", "10.0.0.5"
EVE = "/var/log/suricata/eve.json"
COWRIE_JSON = "/cowrie/cowrie-git/var/log/cowrie/cowrie.json"
SSH_OPTS = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=5", "-o", "LogLevel=ERROR"]


# ---------------------------------------------------------------- run + diagnostics
@dataclass
class Run:
    """One execution of the scenarios; owns a non-overwriting evidence directory."""

    run_id: str
    seq: int = 0
    calls: list = field(default_factory=list)

    @classmethod
    def new(cls) -> "Run":
        run = cls(datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        (run.dir / "diagnostics").mkdir(parents=True, exist_ok=False)
        return run

    @property
    def dir(self) -> Path:
        return ROOT / "evidence" / "runs" / self.run_id

    def artifact(self, name: str, data: str | bytes) -> dict:
        path = self.dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = data.encode() if isinstance(data, str) else data
        path.write_bytes(raw)
        return {"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(raw).hexdigest()}

    def finish(self, op: str, result: dict) -> dict:
        self.seq += 1
        record = {"op": op, "calls": self.calls, "result": result}
        name = f"diagnostics/{self.seq:02d}-{op}.json"
        result["diagnostic"] = self.artifact(name, json.dumps(record, indent=2, ensure_ascii=False))["path"]
        self.calls = []
        return result


def _exec(run: Run, service: str, argv: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    cmd = COMPOSE + ["exec", "-T", service, *argv]
    start = time.monotonic()
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        cp = subprocess.CompletedProcess(cmd, 124, exc.stdout or "", f"timeout after {timeout}s")
    run.calls.append({"service": service, "argv": argv, "exit_code": cp.returncode,
                      "duration_seconds": round(time.monotonic() - start, 3),
                      "stdout": cp.stdout, "stderr": cp.stderr})
    return cp


def _lines(run: Run, service: str, path: str) -> int:
    cp = _exec(run, service, ["sh", "-c", f"wc -l < {path} 2>/dev/null || echo 0"]) if service == "ids" \
        else _exec(run, service, ["/cowrie/cowrie-env/bin/python3", "-c",
                                  f"import os;p='{path}';print(sum(1 for _ in open(p)) if os.path.exists(p) else 0)"])
    return int(cp.stdout.strip() or 0)


def _tail_json(run: Run, service: str, path: str, after: int) -> list[dict]:
    if service == "ids":
        cp = _exec(run, service, ["sh", "-c", f"tail -n +{after + 1} {path}"])
    else:  # Cowrie image is distroless: no shell, only its python
        cp = _exec(run, service, ["/cowrie/cowrie-env/bin/python3", "-c",
                                  f"import sys;sys.stdout.writelines(open('{path}').readlines()[{after}:])"])
    return [json.loads(line) for line in cp.stdout.splitlines() if line.strip()]


# ---------------------------------------------------------------- lab state
def health(run: Run) -> dict:
    cp = subprocess.run(COMPOSE + ["ps", "--format", "json"], capture_output=True, text=True)
    run.calls.append({"argv": ["compose", "ps"], "exit_code": cp.returncode, "stdout": cp.stdout, "stderr": cp.stderr})
    services = [json.loads(line) for line in cp.stdout.splitlines() if line.strip()]
    rows = [{"servicio": s["Service"], "estado": s["State"], "salud": s.get("Health") or "-"} for s in services]
    ok = len(rows) == 4 and all(r["estado"] == "running" and r["salud"] in ("healthy", "-") for r in rows)
    return run.finish("lab.health", {"verdict": "valid" if ok else "invalid", "services": rows})


def isolation(run: Run) -> dict:
    checks = [
        ("atacante → servidor", ["ping", "-c1", "-W1", SERVER], True),
        ("atacante → honeypot", ["ping", "-c1", "-W1", HONEYPOT], True),
        ("atacante → internet (1.1.1.1:80)", ["curl", "-sS", "-m3", "http://1.1.1.1"], False),
    ]
    rows = []
    for label, argv, expected in checks:
        reached = _exec(run, "attacker", argv).returncode == 0
        rows.append({"flujo": label, "esperado": "alcanzable" if expected else "sin salida",
                     "observado": "alcanzable" if reached else "sin salida", "ok": reached == expected})
    return run.finish("lab.isolation", {"verdict": "valid" if all(r["ok"] for r in rows) else "invalid", "checks": rows})


# ---------------------------------------------------------------- firewall (server)
def fw_reset(run: Run) -> dict:
    """Restore: drop only our table; Docker's embedded-DNS `ip nat` table stays."""
    _exec(run, "server", ["sh", "-c", "nft delete table inet filtro 2>/dev/null; conntrack -F 2>/dev/null; true"])
    return run.finish("fw.reset", {"verdict": "valid"})


def nft(run: Run, command: str) -> dict:
    """Apply one nft command exactly as the student would type it (without sudo)."""
    cp = _exec(run, "server", ["sh", "-c", command])
    error = cp.stderr.strip().splitlines()[0] if cp.returncode else None
    return run.finish("fw.nft", {"command": command, "verdict": "valid" if cp.returncode == 0 else "invalid",
                                 "error": error, "error_detail": cp.stderr.strip() if cp.returncode else None})


def fw_table(run: Run) -> dict:
    cp = _exec(run, "server", ["nft", "list", "table", "inet", "filtro"])
    full = _exec(run, "server", ["nft", "list", "ruleset"])
    tables = [line.removesuffix(" {") for line in full.stdout.splitlines() if line.startswith("table ")]
    art = run.artifact("part-a/ruleset.nft", full.stdout)
    return run.finish("fw.table", {"verdict": "valid" if cp.returncode == 0 else "invalid",
                                   "table": cp.stdout.strip(), "all_tables": tables, "evidence": [art]})


# ---------------------------------------------------------------- probes (attacker)
def probe_tcp(run: Run, port: int, host: str = SERVER) -> dict:
    """TCP connect from the attacker: allowed (handshake), refused (RST) or blocked (no answer)."""
    start = time.monotonic()
    cp = _exec(run, "attacker", ["nc", "-zv", "-w3", host, str(port)])
    elapsed = round(time.monotonic() - start, 1)
    if cp.returncode == 0:
        verdict, detail = "allowed", "conexión establecida"
    elif "refused" in cp.stderr:
        verdict, detail = "refused", "rechazada al instante (RST)"
    else:
        verdict, detail = "blocked", "sin respuesta, timeout 3 s"
    return run.finish("probe.tcp", {"academic_command": f"nc -zv -w3 {host} {port}", "port": port, "host": host,
                                    "verdict": verdict, "detail": detail, "elapsed_s": elapsed})


def probe_http(run: Run, port: int, host: str = SERVER) -> dict:
    cp = _exec(run, "attacker", ["curl", "-sS", "-m3", f"http://{host}:{port}/"])
    if cp.returncode == 0:
        verdict, detail = "allowed", cp.stdout.strip().splitlines()[0]
    elif "Could not connect" in cp.stderr or "refused" in cp.stderr:
        verdict, detail = "refused", "rechazada al instante (RST)"
    else:
        verdict, detail = "blocked", "sin respuesta, timeout 3 s"
    return run.finish("probe.http", {"academic_command": f"curl http://{host}:{port}", "port": port,
                                     "verdict": verdict, "detail": detail})


def probe_ping(run: Run, host: str = SERVER) -> dict:
    cp = _exec(run, "attacker", ["ping", "-c1", "-W1", host])
    return run.finish("probe.ping", {"academic_command": f"ping -c1 {host}", "host": host,
                                     "verdict": "allowed" if cp.returncode == 0 else "blocked",
                                     "detail": "responde" if cp.returncode == 0 else "100 % de pérdida"})


def conntrack(run: Run, dport: int = 80) -> dict:
    """Original vs reply tuple of tracked connections to `dport`: the NAT evidence."""
    cp = _exec(run, "server", ["conntrack", "-L", "-p", "tcp", "--orig-port-dst", str(dport)])
    rows = []
    for line in cp.stdout.splitlines():
        kv = [tok.split("=", 1) for tok in line.split() if "=" in tok]
        orig, reply = dict(kv[:4]), dict(kv[4:8])
        rows.append({"ida (original)": f"{orig['src']}:{orig['sport']} → {orig['dst']}:{orig['dport']}",
                     "vuelta (respuesta)": f"{reply['src']}:{reply['sport']} → {reply['dst']}:{reply['dport']}"})
    art = run.artifact("part-b/conntrack.txt", cp.stdout)
    translated = any(r["vuelta (respuesta)"].split(" → ")[0].endswith(":8000") for r in rows)
    return run.finish("nat.conntrack", {"academic_command": f"conntrack -L -p tcp --orig-port-dst {dport}",
                                        "verdict": "translated" if translated else "not_translated",
                                        "entries": rows, "evidence": [art]})


def translate(run: Run, rule: str) -> dict:
    """iptables -> nftables syntax, using the iptables-translate tool on the server."""
    cp = _exec(run, "server", ["sh", "-c", f"iptables-translate {rule}"])
    nft_rule = cp.stdout.strip().removeprefix("nft ").strip("'")
    return run.finish("fw.translate", {"academic_command": f"iptables-translate {rule}", "iptables": f"iptables {rule}",
                                       "nftables": nft_rule, "verdict": "valid" if cp.returncode == 0 else "invalid"})


# ---------------------------------------------------------------- IDS
def ids_scan(run: Run, extra: list[str] | None = None, label: str = "scan") -> dict:
    """nmap from the attacker; returns open ports and the Suricata alerts it caused."""
    before = _lines(run, "ids", EVE)
    argv = ["nmap", "-sS", "-sV", *(extra or []), SERVER]
    start = time.monotonic()
    cp = _exec(run, "attacker", [*argv[:-1], "-oX", "-", SERVER], timeout=300)
    duration = round(time.monotonic() - start, 1)
    time.sleep(4)  # let Suricata flush eve.json
    events = _tail_json(run, "ids", EVE, before)
    alerts = [e for e in events if e.get("event_type") == "alert"]
    ports = _nmap_ports(cp.stdout)
    xml = run.artifact(f"part-c/{label}-nmap.xml", cp.stdout)
    eve = run.artifact(f"part-c/{label}-alerts.json", json.dumps(alerts, indent=2))
    summary: dict[int, dict] = {}
    for a in alerts:
        sig = a["alert"]
        row = summary.setdefault(sig["signature_id"], {
            "sid": sig["signature_id"], "firma": sig["signature"], "prioridad": sig["severity"],
            "cantidad": 0, "sentido": _direction(a)})
        row["cantidad"] += 1
    return run.finish("ids.scan", {
        "academic_command": " ".join(argv), "verdict": "detected" if alerts else "not_detected",
        "scan_completed": cp.returncode == 0, "duration_s": duration, "ports": ports,
        "filtered_ports": _nmap_filtered(cp.stdout), "alerts": sorted(summary.values(), key=lambda r: r["prioridad"]),
        "evidence": [xml, eve]})


def _direction(alert: dict) -> str:
    """Show the server-side port only, so one row summarises every alert of a SID."""
    if alert["src_ip"] == SERVER:
        return f"servidor:{alert['src_port']} → atacante"
    return f"atacante → servidor:{alert['dest_port']}"


def _nmap_ports(xml: str) -> list[dict]:
    import xml.etree.ElementTree as ET
    if not xml.strip():
        return []
    ports = []
    for p in ET.fromstring(xml).iter("port"):
        svc = p.find("service")
        version = " ".join(filter(None, [svc.get("product"), svc.get("version")])) if svc is not None else ""
        ports.append({"puerto": f"{p.get('portid')}/{p.get('protocol')}", "estado": p.find("state").get("state"),
                      "servicio": svc.get("name") if svc is not None else "", "versión": version})
    return ports


def _nmap_filtered(xml: str) -> int:
    import xml.etree.ElementTree as ET
    if not xml.strip():
        return 0
    extra = ET.fromstring(xml).find(".//extraports")
    return int(extra.get("count")) if extra is not None and extra.get("state") == "filtered" else 0


# ---------------------------------------------------------------- honeypot
def honeypot_attack(run: Run, passwords: list[str], commands: list[str]) -> dict:
    """SSH logins from the attacker against Cowrie; returns what Cowrie recorded."""
    before = _lines(run, "honeypot", COWRIE_JSON)
    attempts = []
    for pw in passwords:
        cp = _exec(run, "attacker", ["sshpass", "-p", pw, "ssh", *SSH_OPTS, f"root@{HONEYPOT}", "; ".join(commands)])
        granted = "Permission denied" not in cp.stderr
        attempts.append({"contraseña": pw, "resultado": "acceso" if granted else "rechazada",
                         "respuesta": cp.stdout.strip().splitlines()[0][:100] if granted and cp.stdout.strip() else ""})
    time.sleep(2)
    events = _tail_json(run, "honeypot", COWRIE_JSON, before)
    art = run.artifact("part-d/cowrie-events.json", json.dumps(events, indent=2))
    keep = {"cowrie.session.connect", "cowrie.client.version", "cowrie.login.failed", "cowrie.login.success",
            "cowrie.command.input", "cowrie.session.closed"}
    rows = []
    for e in events:
        # 127.0.0.1 sessions are the container healthcheck, not attacker activity.
        if e.get("eventid") not in keep or e.get("src_ip") == "127.0.0.1":
            continue
        detail = {"cowrie.client.version": e.get("version"), "cowrie.command.input": e.get("input"),
                  "cowrie.session.closed": f"duración {e.get('duration_ms', 0) / 1000:.1f} s"}.get(e["eventid"], "")
        if e["eventid"].startswith("cowrie.login"):
            detail = f"{e.get('username')} / {e.get('password')}"
        rows.append({"hora": e["timestamp"][11:19], "sesión": e.get("session"), "origen": e.get("src_ip"),
                     "evento": e["eventid"].removeprefix("cowrie."), "detalle": detail})
    return run.finish("honeypot.attack", {
        "academic_command": f"ssh root@{HONEYPOT}", "verdict": "recorded" if rows else "not_recorded",
        "attempts": attempts, "events": rows, "evidence": [art]})


# ---------------------------------------------------------------- CLI
PART_A = [
    "nft add table inet filtro",
    "nft add chain inet filtro entrada '{ type filter hook input priority 0; policy drop; }'",
    "nft add rule inet filtro entrada ct state established,related accept",
    "nft add rule inet filtro entrada iif lo accept",
    "nft add rule inet filtro entrada tcp dport 22 accept",
]
PART_B_CHAIN = "nft add chain inet filtro prerouting '{ type nat hook prerouting priority -100; }'"
PART_B_LITERAL = "nft add rule inet filtro prerouting tcp dport 80 dnat ip to :8000"
PART_B_FIXED = "nft add rule inet filtro prerouting tcp dport 80 dnat ip to 10.0.0.10:8000"
PART_B_ALLOW = "nft add rule inet filtro entrada ct status dnat accept"


def _check(label: str, cond: bool) -> bool:
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond


def validate() -> bool:
    run = Run.new()
    print(f"run {run.run_id}")
    ok = [_check("lab healthy", health(run)["verdict"] == "valid"),
          _check("isolation (lab reachable, no Internet)", isolation(run)["verdict"] == "valid")]
    try:
        fw_reset(run)
        ok.append(_check("no firewall: 8080 refused", probe_tcp(run, 8080)["verdict"] == "refused"))
        ok.append(_check("no firewall: 8000 http allowed", probe_http(run, 8000)["verdict"] == "allowed"))
        ok.append(_check("part A rules apply", all(nft(run, c)["verdict"] == "valid" for c in PART_A)))
        fw_table(run)
        ok.append(_check("A: 22 allowed", probe_tcp(run, 22)["verdict"] == "allowed"))
        ok.append(_check("A: 8080 blocked", probe_tcp(run, 8080)["verdict"] == "blocked"))
        ok.append(_check("A: 8000 blocked", probe_http(run, 8000)["verdict"] == "blocked"))
        ok.append(_check("A: ping blocked", probe_ping(run)["verdict"] == "blocked"))
        ok.append(_check("B: nat chain", nft(run, PART_B_CHAIN)["verdict"] == "valid"))
        literal = nft(run, PART_B_LITERAL)
        ok.append(_check("B: literal dnat is a syntax error", literal["verdict"] == "invalid" and "syntax error" in literal["error"]))
        ok.append(_check("B: fixed dnat applies", nft(run, PART_B_FIXED)["verdict"] == "valid"))
        ok.append(_check("B: 80 blocked by input chain", probe_http(run, 80)["verdict"] == "blocked"))
        ok.append(_check("B: ct status dnat accept", nft(run, PART_B_ALLOW)["verdict"] == "valid"))
        ok.append(_check("B: 80 allowed via DNAT", probe_http(run, 80)["verdict"] == "allowed"))
        ok.append(_check("B: 8000 direct still blocked", probe_http(run, 8000)["verdict"] == "blocked"))
        ok.append(_check("B: conntrack shows 80 -> 8000", conntrack(run)["verdict"] == "translated"))
        scan = ids_scan(run)
        ok.append(_check("C: scan completed (IDS does not block)", scan["scan_completed"]))
        ok.append(_check("C: sid 2024364 alert", any(a["sid"] == 2024364 for a in scan["alerts"])))
        evasion = ids_scan(run, ["--script-args", "http.useragent=Mozilla/5.0"], label="evasion")
        ok.append(_check("C: custom User-Agent evades sid 2024364", not any(a["sid"] == 2024364 for a in evasion["alerts"])))
        hp = honeypot_attack(run, ["root", "123456", "toor"], ["uname -a", "whoami", "cat /etc/passwd"])
        kinds = [e["evento"] for e in hp["events"]]
        ok.append(_check("D: failed + successful logins recorded", "login.failed" in kinds and "login.success" in kinds))
        ok.append(_check("D: commands recorded", "command.input" in kinds))
    finally:
        fw_reset(run)
    print(f"{'VALID' if all(ok) else 'INVALID'}: {sum(ok)}/{len(ok)} checks · evidence/runs/{run.run_id}/")
    return all(ok)


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "validate"
    if action == "up":
        subprocess.run(COMPOSE + ["up", "-d", "--build", "--wait"], check=True)
    elif action == "down":
        subprocess.run(COMPOSE + ["down"], check=True)
    elif action == "validate":
        sys.exit(0 if validate() else 1)
    else:
        sys.exit(f"unknown action: {action}")
