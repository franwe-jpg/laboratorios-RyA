"""Presentation helpers for the TP5 report notebook.

They turn the typed results returned by lab/ops.py into bounded Markdown
(verdict labels, tables, evidence references). Markdown is the only output
format, so the same cells render in Jupyter and in the .docx built from the
executed notebook. Nothing here runs commands or touches the lab.
"""

from __future__ import annotations

import sys
from pathlib import Path

from IPython.display import Markdown, display

ROOT = Path.cwd()  # notebook executes with tp/tp5 as working directory
sys.path.insert(0, str(ROOT / "lab"))

import ops  # noqa: E402  (lab contract, see lab/handoff.yaml)

LABELS = {
    "allowed": "PERMITIDO", "blocked": "BLOQUEADO", "refused": "RECHAZADO",
    "detected": "DETECTADO", "not_detected": "NO DETECTADO", "recorded": "REGISTRADO",
    "valid": "VÁLIDO", "invalid": "INVÁLIDO", "translated": "TRADUCIDO",
    "not_translated": "SIN TRADUCCIÓN",
}


def label(verdict: str) -> str:
    return f"**{LABELS.get(verdict, verdict.upper())}**"


def cell(value) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def table(rows: list[dict], columns: list[str] | None = None, limit: int = 25) -> str:
    """Markdown pipe table; rows beyond `limit` are summarised, never dumped."""
    if not rows:
        return "*Sin registros.*"
    columns = columns or list(rows[0])
    lines = ["| " + " | ".join(columns) + " |", "|" + "---|" * len(columns)]
    lines += ["| " + " | ".join(cell(r.get(c, "")) for c in columns) + " |" for r in rows[:limit]]
    if len(rows) > limit:
        lines.append(f"| *… {len(rows) - limit} filas más en el artefacto de evidencia* |" + " |" * (len(columns) - 1))
    return "\n".join(lines)


def code(text: str) -> str:
    return f"```\n{text.strip()}\n```"


def evidence(*results: dict) -> str:
    refs = [f"`{e['path']}` (sha256 `{e['sha256'][:12]}`)" for r in results for e in r.get("evidence", [])]
    return "*Evidencia:* " + "; ".join(refs) if refs else ""


def show(*parts: str) -> None:
    display(Markdown("\n\n".join(p for p in parts if p)))


def require_lab(run: "ops.Run") -> None:
    """Readiness gate: the lab is started from the terminal, never from here."""
    if ops.health(run)["verdict"] != "valid":
        raise RuntimeError("El laboratorio no está levantado: ejecutar `python lab/ops.py up` y reintentar.")
