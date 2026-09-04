"""``/usr/bin/pdftotext`` subprocess wrapper + Markdown post-processing.

Contract (openspec/changes/docs-integrity-markdown/design.md,
"PDF extraction strategy"; specs/pdf-to-markdown/spec.md):

- Fixed argv ``<binary> -enc UTF-8 -q <pdf> <out>`` run with argv lists,
  ``shell=False``, captured stdout/stderr, and a timeout. Only paths --
  never file contents -- are interpolated into the command.
- The binary path is injectable for tests; production uses
  :data:`DEFAULT_BINARY`.
- Binary missing/unusable, child timeout, or non-zero child exit raise
  :class:`PdftextError`: an operational failure mapped to exit code 3
  upstream -- never exit 1 and never a tampering verdict.
- Each run captures the first ``pdftotext -v`` banner line so conversion
  reports are attributable to a Poppler version. Output bytes remain a
  pure function of (PDF bytes x Poppler version).
- Post-processing is textual only (plain pdftotext carries no font-size
  metadata): lines whose leading token matches section numbering
  (``N``, ``N.M``, ``N.M.K``) promote to Markdown headings by dot depth;
  IPv4-shaped or longer dotted tokens stay body text. Garbled regions
  (private-use/replacement/control-character runs or ``(cid:N)``
  artifacts) are omitted rather than emitted as garbled filler, counted
  honestly, and recorded in a always-visible limitations note.
- Re-runs over an unchanged PDF are byte-identical; conversion may
  overwrite only its own previously generated sibling ``<stem>.md``.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from dataclasses import dataclass

DEFAULT_BINARY = "/usr/bin/pdftotext"
DEFAULT_TIMEOUT_SECONDS = 30.0

_PROBE_TIMEOUT_SECONDS = 10.0

# Typographic ligatures folded deterministically for readability/search.
_LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
    "ﬅ": "st", "ﬆ": "st",
}

# Section numbering: 1-3 digit components, at most three dot-separated
# parts (so IPv4 addresses like 192.168.0.1 and years never promote),
# optional trailing dot, optional trailing title text.
_HEADING_RE = re.compile(r"^(\d{1,3}(?:\.\d{1,3}){0,2})\.?(?:\s+(.+))?$")

_CID_ARTIFACT_RE = re.compile(r"\(cid:\d+\)")

#: A line is garbled when at least this share of its visible characters
#: are private-use, replacement, or C1 control characters.
_GARBLED_RATIO_THRESHOLD = 0.3


class PdftextError(Exception):
    """Operational converter failure; maps to exit code 3 upstream."""


@dataclass(frozen=True)
class BuiltMarkdown:
    """Post-processing result for one extracted document."""

    markdown: str
    headings: int
    garbled_omitted: int


@dataclass(frozen=True)
class ConversionResult:
    """Outcome of converting one PDF into its sibling Markdown file."""

    source: str
    output_path: str
    headings: int
    garbled_omitted: int


# --------------------------------------------------------------------------
# subprocess layer


def probe_banner(binary_path: str) -> str:
    """Return the first non-empty ``<binary> -v`` output line.

    Raises :class:`PdftextError` when the binary cannot be executed at
    all (missing, not executable, exec-format) or prints nothing.
    """
    try:
        proc = subprocess.run(
            [binary_path, "-v"],
            capture_output=True, shell=False,
            timeout=_PROBE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PdftextError(
            f"pdftotext binary missing or unusable: {binary_path} ({exc})"
        ) from exc
    combined = proc.stdout.decode("utf-8", "replace") + \
        proc.stderr.decode("utf-8", "replace")
    for line in combined.splitlines():
        line = line.strip()
        if line:
            return line
    raise PdftextError(
        f"pdftotext produced no version banner: {binary_path}"
    )


def extract_text(pdf_path: str, *, binary_path: str = DEFAULT_BINARY,
                 timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
                 ) -> tuple[str, str]:
    """Extract UTF-8 text from ``pdf_path``; return ``(text, banner)``."""
    pdf_abs = os.path.abspath(pdf_path)
    if not os.path.isfile(pdf_abs):
        raise PdftextError(
            f"input PDF does not exist or is not a regular file: {pdf_abs}"
        )
    workdir = tempfile.TemporaryDirectory(prefix="docsguard-pdftext-")
    with workdir:
        out_path = os.path.join(workdir.name, "extracted.txt")
        argv = [binary_path, "-enc", "UTF-8", "-q", pdf_abs, out_path]
        try:
            proc = subprocess.run(
                argv, capture_output=True, shell=False,
                timeout=timeout_seconds,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise PdftextError(
                f"pdftotext binary missing, unusable, or timed out: "
                f"{binary_path} ({exc})"
            ) from exc
        if proc.returncode != 0:
            stderr_lines = [
                line.strip() for line in
                proc.stderr.decode("utf-8", "replace").splitlines()
                if line.strip()
            ]
            detail = stderr_lines[-1] if stderr_lines else \
                f"no diagnostic captured"
            raise PdftextError(
                f"pdftotext failed on {pdf_abs}: {detail} "
                f"(exit code {proc.returncode})"
            )
        with open(out_path, "rb") as fh:
            raw = fh.read()

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Undecodable bytes become U+FFFD and are handled as garbled
        # content by post-processing instead of crashing the conversion.
        text = raw.decode("utf-8", "replace")

    try:
        banner = probe_banner(binary_path)
    except PdftextError:
        banner = ""  # attribution is best-effort; extraction succeeded
    return text, banner


# --------------------------------------------------------------------------
# textual post-processing


def _is_garbled(line: str) -> bool:
    """True when ``line`` looks unextractable rather than meaningful."""
    if _CID_ARTIFACT_RE.search(line):
        return True
    visible = [ch for ch in line if not ch.isspace()]
    if not visible:
        return False
    hits = sum(
        1 for ch in visible
        if ch == "\ufffd" or 0xE000 <= ord(ch) <= 0xF8FF
        or 0x80 <= ord(ch) <= 0x9F
    )
    return hits / len(visible) >= _GARBLED_RATIO_THRESHOLD


def _heading_line(line: str) -> str | None:
    """Return the promoted heading for ``line``, or None for body text."""
    match = _HEADING_RE.match(line)
    if match is None:
        return None
    token, title = match.group(1), match.group(2)
    depth = min(6, token.count(".") + 1)
    text = f"{token} {title}" if title else token
    return f"{'#' * depth} {text}".rstrip()


def build_markdown(text: str) -> BuiltMarkdown:
    """Post-process extracted plain text into study-grade Markdown.

    Pure function of ``text``: same input always yields byte-identical
    output. Normalizes line endings, removes page-break markers, folds
    typographic ligatures, promotes section-numbered headings by dot
    depth, omits garbled lines, collapses blank-line runs, and appends
    the deterministic limitations note.
    """
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = normalized.replace("\f", "\n")
    normalized = normalized.translate(str.maketrans(_LIGATURES))
    normalized = normalized.replace("\t", " ")
    normalized = "".join(
        ch for ch in normalized if ord(ch) >= 0x20 or ch == "\n"
    )

    headings = 0
    garbled_omitted = 0
    body_lines: list[str] = []
    for raw_line in normalized.split("\n"):
        line = raw_line.strip()
        if not line:
            body_lines.append("")
            continue
        if _is_garbled(line):
            garbled_omitted += 1
            continue
        heading = _heading_line(line)
        if heading is not None:
            headings += 1
            body_lines.append(heading)
        else:
            body_lines.append(line)

    collapsed: list[str] = []
    for line in body_lines:
        if line == "" and (not collapsed or collapsed[-1] == ""):
            continue  # never more than one blank line between blocks
        collapsed.append(line)
    while collapsed and collapsed[-1] == "":
        collapsed.pop()

    note_lines = [
        "",
        "---",
        "",
        "> **Extraction limitations** (docs_guard convert-pdf): plain-text",
        "> extraction carries no font-size metadata, so Markdown headings are",
        f"> inferred only from section numbering (`1`, `1.2`, ...); this "
        f"document yielded {headings} heading(s).",
        f"> {garbled_omitted} unextractable/garbled line(s) were omitted "
        f"rather than emitted as garbled filler.",
        "> Tables and figures may be degraded or lost. Page-break markers",
        "> were removed and typographic ligatures folded.",
    ]
    markdown = "\n".join(collapsed + note_lines) + "\n"
    return BuiltMarkdown(markdown=markdown, headings=headings,
                         garbled_omitted=garbled_omitted)


def convert_pdf(pdf_path: str, *, binary_path: str = DEFAULT_BINARY,
                timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
                ) -> ConversionResult:
    """Convert ``pdf_path`` into its sibling ``<stem>.md``.

    Writes only the sibling Markdown file derived from this PDF and
    never touches the source or any other file. Deterministic: an
    unchanged PDF yields byte-identical output across re-runs.
    """
    pdf_abs = os.path.abspath(pdf_path)
    text, _banner = extract_text(
        pdf_abs, binary_path=binary_path, timeout_seconds=timeout_seconds
    )
    built = build_markdown(text)
    output_abs = os.path.splitext(pdf_abs)[0] + ".md"
    with open(output_abs, "wb") as fh:
        fh.write(built.markdown.encode("utf-8"))
    return ConversionResult(source=pdf_abs, output_path=output_abs,
                            headings=built.headings,
                            garbled_omitted=built.garbled_omitted)
