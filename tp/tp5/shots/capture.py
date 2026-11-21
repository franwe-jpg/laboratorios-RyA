"""Runs the TP5 academic commands in the lab and records their literal output.

Each shot is one terminal session on one lab host: the commands are executed
exactly as shown (inside that host's container) and stdout+stderr are kept
verbatim in shots/transcript.json, which render.py turns into terminal PNGs
for the Word report. Hidden `prep` steps only reset state (firewall, logs)
and are never rendered.

Run from tp/tp5 with the lab up:  python3 shots/capture.py
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ["docker", "compose", "-f", str(ROOT / "lab" / "compose.yaml")]
# Cowrie's image is distroless (no shell/tail): its log volume is read with a
# throwaway container of the lab's pinned Debian base, at the same path.
COWRIE_READER = ["docker", "run", "--rm", "-v", "tp5_cowrie-logs:/cowrie/cowrie-git/var/log/cowrie",
                 "-w", "/cowrie/cowrie-git",
                 "debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2"]
HOSTS = {"atacante": "attacker", "servidor": "server", "ids": "ids", "honeypot": None}
FAST = "/var/log/suricata/fast.log"

SHOTS = [
    {"name": "A-sin-firewall", "host": "atacante",
     "section": "A.1 — Conexión a un puerto no habilitado (8080)",
     "caption": "Antes del firewall: el 8080 se rechaza al instante (RST)",
     "prep": [("servidor", "nft delete table inet filtro 2>/dev/null; conntrack -F 2>/dev/null; true")],
     "steps": ["nc -zv -w3 10.0.0.10 8080"]},
    {"name": "A-reglas", "host": "servidor",
     "section": "Parte A — Firewall con nftables",
     "caption": "Aplicación del ruleset de la consigna en el servidor",
     "steps": [
         "nft add table inet filtro",
         "nft add chain inet filtro entrada '{ type filter hook input priority 0; policy drop; }'",
         "nft add rule inet filtro entrada ct state established,related accept",
         "nft add rule inet filtro entrada iif lo accept",
         "nft add rule inet filtro entrada tcp dport 22 accept",
         "nft list table inet filtro",
     ]},
    {"name": "A-con-firewall", "host": "atacante",
     "section": "A.1 — Conexión a un puerto no habilitado (8080)",
     "caption": "Con el firewall: 22 permitido; 8080, 8000 e ICMP descartados en silencio",
     "steps": ["nc -zv -w3 10.0.0.10 22", "nc -zv -w3 10.0.0.10 8080",
               "curl -sS -m3 http://10.0.0.10:8000", "ping -c1 -W1 10.0.0.10"]},
    {"name": "B-dnat", "host": "servidor",
     "section": "Problema 1 — Sintaxis del DNAT",
     "caption": "La regla DNAT de la consigna falla; con la dirección explícita se aplica",
     "steps": [
         "nft add chain inet filtro prerouting '{ type nat hook prerouting priority -100; }'",
         "nft add rule inet filtro prerouting tcp dport 80 dnat ip to :8000",
         "nft add rule inet filtro prerouting tcp dport 80 dnat ip to 10.0.0.10:8000",
     ]},
    {"name": "B-80-bloqueado", "host": "atacante",
     "section": "Problema 2 — La cadena input descarta el tráfico ya traducido",
     "caption": "Con el DNAT corregido, el 80 sigue sin responder",
     "steps": ["curl -sS -m3 http://10.0.0.10:80"]},
    {"name": "B-ct-status", "host": "servidor",
     "section": "B.1 — Verificación desde el atacante",
     "caption": "Regla que acepta solo las conexiones que entraron por el DNAT",
     "steps": ["nft add rule inet filtro entrada ct status dnat accept"]},
    {"name": "B-verificacion", "host": "atacante",
     "section": "B.1 — Verificación desde el atacante",
     "caption": "El 80 responde a través del DNAT; el 8000 directo sigue bloqueado",
     "steps": ["curl -sS -m3 http://10.0.0.10:80", "curl -sS -m3 http://10.0.0.10:8000"]},
    {"name": "B-conntrack", "host": "servidor",
     "section": "B.1 — Verificación desde el atacante",
     "caption": "Tabla de conexiones: ida al puerto 80, respuesta desde el 8000",
     "steps": ["conntrack -L -p tcp --orig-port-dst 80"]},
    {"name": "C-nmap", "host": "atacante",
     "section": "C.1 — Alertas generadas",
     "caption": "Escaneo de la Unidad 3 contra el servidor, con el firewall activo",
     "prep": [("ids", f": > {FAST}")],
     "steps": ["nmap -sS -sV 10.0.0.10"]},
    {"name": "C-fastlog", "host": "servidor",
     "section": "C.1 — Alertas generadas",
     "caption": "Alertas de Suricata generadas por el escaneo (fast.log)",
     "run_on": "ids",
     "steps": [f"cat {FAST}"]},
    {"name": "C-evasion", "host": "atacante",
     "section": "C.3 — ¿Firmas o anomalías?",
     "caption": "Mismo escaneo con otro User-Agent",
     "prep": [("ids", f": > {FAST}")],
     "steps": ["nmap -sS -sV --script-args http.useragent=Mozilla/5.0 10.0.0.10 | tail -n 6"]},
    {"name": "C-evasion-alertas", "host": "servidor",
     "section": "C.3 — ¿Firmas o anomalías?",
     "caption": "Con el User-Agent cambiado, la firma de Nmap no se dispara",
     "run_on": "ids",
     "steps": [f'grep -c "Nmap User-Agent" {FAST}', f'grep -c "SimpleHTTP" {FAST}']},
    {"name": "D-ataque", "host": "atacante",
     "section": "Parte D — Honeypot (Cowrie)",
     "caption": "Intentos de login SSH contra el honeypot y comandos tras el acceso",
     "prep": [("servidor", "nft delete table inet filtro 2>/dev/null; true"),
              ("atacante", "mkdir -p /root/.ssh && printf 'Host 10.0.0.20\\n  StrictHostKeyChecking no\\n"
                           "  UserKnownHostsFile /dev/null\\n  LogLevel ERROR\\n' > /root/.ssh/config")],
     "steps": [
         "sshpass -p root ssh root@10.0.0.20 'uname -a'",
         "sshpass -p 123456 ssh root@10.0.0.20 'uname -a'",
         "sshpass -p toor ssh root@10.0.0.20 'uname -a; whoami; cat /etc/passwd'",
     ]},
    {"name": "D-cowrie-log", "host": "honeypot",
     "section": "D.1 — Qué registró Cowrie",
     # The official image sends the text log (cowrie.log) to stdout; the persistent
     # record is cowrie.json, whose "message" field carries that same text.
     "caption": "Registro de la sesión en el honeypot (campo message de cowrie.json)",
     "steps": ["grep -o '\"message\":\"[^\"]*\"' var/log/cowrie/cowrie.json"
               ' | grep -E "New connection|login attempt|CMD" | grep -v 127.0.0.1 | tail -n 7']},
    {"name": "O-translate", "host": "servidor",
     "section": "Migrar reglas de iptables a nftables",
     "caption": "Traducción de reglas iptables a nftables con iptables-translate",
     "steps": [
         "iptables-translate -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
         "iptables-translate -A INPUT -i lo -j ACCEPT",
         "iptables-translate -A INPUT -p tcp --dport 22 -j ACCEPT",
         "iptables-translate -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 10.0.0.10:8000",
     ]},
]


def sh(host: str, command: str, timeout: int = 120) -> str:
    service = HOSTS[host]
    argv = (COWRIE_READER if service is None else COMPOSE + ["exec", "-T", service]) + ["sh", "-c", f"{command} 2>&1"]
    try:
        return subprocess.run(argv, capture_output=True, text=True, timeout=timeout).stdout.rstrip()
    except subprocess.TimeoutExpired:
        sys.exit(f"timeout running on {host}: {command}")


def main() -> None:
    transcript = []
    for shot in SHOTS:
        for host, command in shot.get("prep", []):
            sh(host, command)
        runner = shot.get("run_on", shot["host"])
        steps = [{"command": c, "output": sh(runner, c)} for c in shot["steps"]]
        transcript.append({k: shot[k] for k in ("name", "host", "section", "caption")} | {"steps": steps})
        print(f"captured {shot['name']}")
    sh("servidor", "nft delete table inet filtro 2>/dev/null; conntrack -F 2>/dev/null; true")  # restore
    (ROOT / "shots" / "transcript.json").write_text(json.dumps(transcript, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
