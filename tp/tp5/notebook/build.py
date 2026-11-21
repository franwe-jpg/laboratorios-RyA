"""Build pipeline for the TP5 report.

    python notebook/build.py generate   # content.py -> notebook/TP5.ipynb (no outputs)
    python notebook/build.py execute    # TP5.ipynb -> build/TP5.executed.ipynb
    python notebook/build.py check      # presentation/evidence gates on both notebooks
    python notebook/build.py docx       # executed notebook -> TP5.docx
    python notebook/build.py all        # generate, execute, check, docx

The notebook is the working report; TP5.docx is rendered from the executed
copy (build_docx.js) so the document always matches the validated evidence.

Run from tp/tp5/ with the local venv. Generation is deterministic: the source
notebook never stores outputs or execution counts.
"""

import hashlib
import re
import subprocess
import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient

import content

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "notebook" / "TP5.ipynb"
EXECUTED = ROOT / "build" / "TP5.executed.ipynb"
KERNEL = "tp5"


def _cell(spec):
    kind, source, *rest = spec
    if kind == "md":
        return nbformat.v4.new_markdown_cell(source)
    tags = rest[0] if rest else []
    return nbformat.v4.new_code_cell(source, metadata={"tags": tags})


def _cover():
    m = content.META
    return (
        f"# {m['title']}\n\n"
        f"**{m['course']}**  \n{m['institution']}\n\n"
        f"**Alumno:** {m['student']}  \n**Fecha:** {m['date']}"
    )


def generate():
    cells = [nbformat.v4.new_markdown_cell(_cover(), metadata={"tags": ["cover"]})]
    cells += [_cell(c) for c in content.SETUP]
    for title, body in content.SECTIONS:
        if body is None:
            cells.append(nbformat.v4.new_markdown_cell(f"## {title}\n\n*Sección pendiente.*"))
        else:
            cells += [_cell(c) for c in body]
    nb = nbformat.v4.new_notebook(cells=cells)
    nb.metadata["tp5"] = content.META
    nb.metadata["kernelspec"] = {"name": KERNEL, "display_name": "TP5 (venv)", "language": "python"}
    # Stable cell ids keep regenerations diff-free.
    for i, cell in enumerate(nb.cells):
        cell.id = f"cell-{i:03d}"
    nbformat.write(nb, SOURCE)
    print(f"generated {SOURCE.relative_to(ROOT)} ({len(cells)} cells)")


def execute():
    nb = nbformat.read(SOURCE, as_version=4)
    NotebookClient(nb, kernel_name=KERNEL, timeout=600, resources={"metadata": {"path": str(ROOT)}}).execute()
    EXECUTED.parent.mkdir(exist_ok=True)
    nbformat.write(nb, EXECUTED)
    print(f"executed -> {EXECUTED.relative_to(ROOT)}")


def check():
    """Validation gates from the arys-practical-notebook contract; exits non-zero on failure."""
    failures = []
    src = nbformat.read(SOURCE, as_version=4)
    if any(c.get("outputs") or c.get("execution_count") for c in src.cells if c.cell_type == "code"):
        failures.append("source notebook stores outputs or execution counts")
    nb = nbformat.read(EXECUTED, as_version=4)
    rendered = []
    for c in nb.cells:
        for o in c.get("outputs", []):
            if o.output_type == "error":
                failures.append(f"error output: {o.ename}: {o.evalue}")
            elif o.output_type == "stream":
                failures.append(f"raw console stream in report: {o.text[:80]!r}")
            else:
                rendered.append(str(o.get("data", {}).get("text/markdown", "")))
    text = "\n".join(rendered)
    for pattern, why in [(r"/home/|/tmp/|/root/", "absolute host path"), (r"docker compose", "runner wrapper")]:
        if re.search(pattern, text):
            failures.append(f"{why} in rendered output")
    refs = re.findall(r"`(evidence/runs/[^`]+)` \(sha256 `([0-9a-f]{12})`\)", text)
    for path, short in refs:
        file = ROOT / path
        if not file.exists():
            failures.append(f"missing evidence: {path}")
        elif hashlib.sha256(file.read_bytes()).hexdigest()[:12] != short:
            failures.append(f"hash mismatch: {path}")
    for f in failures:
        print(f"  [FAIL] {f}")
    print(f"check: {'PASS' if not failures else 'FAIL'} ({len(refs)} evidence references verified)")
    if failures:
        sys.exit(1)


def docx():
    subprocess.run(["node", "build_docx.js"], cwd=ROOT, check=True)


if __name__ == "__main__":
    steps = {"generate": [generate], "execute": [execute], "check": [check], "docx": [docx], "all": [generate, execute, check, docx]}
    for step in steps[sys.argv[1] if len(sys.argv) > 1 else "all"]:
        step()
