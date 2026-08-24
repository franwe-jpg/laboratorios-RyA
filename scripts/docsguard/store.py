"""Engram-backed persistence adapter for the docs integrity baseline.

Contract (design.md): write via ``engram save <title> <blob> --type
architecture --project <project> --scope project --topic
docs-integrity/manifest`` -- title and topic pinned identical so exactly
one live observation exists and repeated saves upsert in place. Read via
``engram export <snapshot.json>`` -> filter observations by project AND
title -> take max(id) -> use ``content`` verbatim (export, never search,
whose output is human-formatted and truncated).

Any failure (binary absent, non-zero exit, timeout, invalid JSON export,
zero matches, non-text content) raises :class:`StoreError`: an
operational error mapping to exit 3 upstream, never a tampering verdict.
Subprocess safety: fixed argv lists, ``shell=False``, captured output,
30 s timeout; contents travel as one argv value, never through a shell.

Storage quirk (verified against engram v1.20.0): ``engram save`` strips
the trailing newline of stored content. Canonical manifest bytes always
end with LF, so :meth:`EngramStore.load_baseline` restores that single
stripped byte after taking the content verbatim; strict parsing keeps
working across round-trips while any other corruption still surfaces as
:class:`ManifestError`.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile

BASELINE_TITLE = "docs-integrity/manifest"
DEFAULT_TIMEOUT_SECONDS = 30


class StoreError(Exception):
    """Operational store failure; maps to exit code 3 upstream.

    ``kind`` distinguishes the expected bootstrap case ("missing": no
    baseline observation exists yet) from genuine store failures
    ("error"), so the update flow can bootstrap a fresh baseline while
    still refusing to proceed over an unreachable or broken store.
    """

    def __init__(self, message: str, *, kind: str = "error") -> None:
        super().__init__(message)
        self.kind = kind


def _restore_trailing_newline(blob: bytes) -> bytes:
    """Re-append the final LF that engram's save path strips."""
    if not blob or blob.endswith(b"\n"):
        return blob
    return blob + b"\n"


class EngramStore:
    """Read/write access to the single baseline observation."""

    def __init__(
        self,
        binary: str = "engram",
        project: str = "open-code",
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.binary = binary
        self.project = project
        self.timeout = timeout

    def _run(self, argv: list[str]) -> None:
        """Run the engram binary with fixed argv; raise StoreError on trouble."""
        try:
            completed = subprocess.run(
                [self.binary, *argv],
                capture_output=True,
                text=True,
                shell=False,
                timeout=self.timeout,
            )
        except FileNotFoundError as exc:
            raise StoreError(
                f"required engram executable not found: {self.binary}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise StoreError(
                f"engram timed out after {self.timeout}s: {self.binary}"
            ) from exc
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise StoreError(
                f"engram exited with status {completed.returncode}: {detail}"
            )

    def save_baseline(self, blob: bytes) -> None:
        """Upsert the canonical manifest ``blob`` as the baseline observation."""
        self._run([
            "save",
            BASELINE_TITLE,
            blob.decode("utf-8"),
            "--type", "architecture",
            "--project", self.project,
            "--scope", "project",
            "--topic", BASELINE_TITLE,
        ])

    def load_baseline(self) -> bytes:
        """Return the persisted baseline bytes (canonical, LF-terminated).

        Raises :class:`StoreError` with ``kind="missing"`` when no
        matching observation exists, and ``kind="error"`` for every other
        operational failure.
        """
        fd, snapshot_path = tempfile.mkstemp(
            prefix="docsguard-export-", suffix=".json"
        )
        os.close(fd)
        try:
            self._run(["export", snapshot_path])
            try:
                with open(snapshot_path, encoding="utf-8") as handle:
                    snapshot = json.load(handle)
            except (OSError, ValueError) as exc:
                raise StoreError(
                    f"engram export snapshot unreadable or invalid JSON: {exc}"
                ) from exc
        finally:
            try:
                os.unlink(snapshot_path)
            except OSError:
                pass

        if not isinstance(snapshot, dict):
            raise StoreError("engram export has unexpected top-level structure")
        observations = snapshot.get("observations")
        # A fresh store exports ``null`` for every collection; that is the
        # bootstrap case, not a broken export.
        if observations is None:
            observations = []
        elif not isinstance(observations, list):
            raise StoreError("engram export lacks an observations list")

        matches = [
            obs
            for obs in observations
            if isinstance(obs, dict)
            and obs.get("project") == self.project
            and obs.get("title") == BASELINE_TITLE
        ]
        if not matches:
            raise StoreError(
                "missing baseline observation "
                f"(title {BASELINE_TITLE!r}, project {self.project!r}); "
                "run 'docs_guard.py update' once to bootstrap it",
                kind="missing",
            )
        latest = max(matches, key=lambda obs: int(obs.get("id", 0)))
        content = latest.get("content")
        if not isinstance(content, str):
            raise StoreError(
                f"baseline observation #{latest.get('id')} has non-text content"
            )
        return _restore_trailing_newline(content.encode("utf-8"))
