"""Outcome classification and exit-code taxonomy for docs integrity checks.

Contract (openspec/changes/docs-integrity-markdown/specs/docs-integrity/
spec.md, "Checker Outcomes and Exit Codes"):

======  ==========================================================  =========
Exit    Outcome                                                     Priority
======  ==========================================================  =========
1       tracked file modified or deleted (tampering)                hard
2       untracked regular files present, all tracked intact         warning
0       clean                                                       --
3       operational error (store/scan); short-circuits upstream,    --
        before any comparison happens
======  ==========================================================  =========

Hard failure outranks warning: a run with both tampering and additions
reports both and exits 1. This module never touches the filesystem or the
store; callers feed it manifest entries (``(relpath, hash)`` pairs).
"""

from __future__ import annotations

EXIT_CLEAN = 0
EXIT_TAMPER = 1
EXIT_UNTRACKED = 2
EXIT_OPERATIONAL = 3


class CheckResult:
    """Classified diff between baseline and freshly scanned manifests."""

    __slots__ = ("modified", "deleted", "untracked")

    def __init__(self, modified, deleted, untracked) -> None:
        #: ``(relpath, expected_hash, actual_hash)`` triples, sorted by path.
        self.modified = modified
        #: relpaths present in the baseline but absent from the tree.
        self.deleted = deleted
        #: relpaths present in the tree but absent from the baseline.
        self.untracked = untracked

    @property
    def outcome(self) -> str:
        if self.modified or self.deleted:
            return "tamper"
        if self.untracked:
            return "untracked"
        return "clean"

    @property
    def exit_code(self) -> int:
        return {
            "clean": EXIT_CLEAN,
            "tamper": EXIT_TAMPER,
            "untracked": EXIT_UNTRACKED,
        }[self.outcome]

    def __str__(self) -> str:
        lines = []
        for relpath, expected, actual in self.modified:
            lines.append(
                f"MODIFIED {relpath} expected={expected} actual={actual}"
            )
        for relpath in self.deleted:
            lines.append(f"DELETED {relpath}")
        for relpath in self.untracked:
            lines.append(f"UNTRACKED {relpath}")
        return "\n".join(lines)


def classify(baseline_entries, current_entries) -> CheckResult:
    """Compare baseline vs current manifest entries.

    Entries are iterables of ``(relpath, sha256hex)`` pairs. Findings are
    sorted by relpath so reports are deterministic regardless of scan or
    parse order.
    """
    baseline = dict(baseline_entries)
    current = dict(current_entries)

    modified = sorted(
        (relpath, baseline[relpath], current[relpath])
        for relpath in baseline.keys() & current.keys()
        if baseline[relpath] != current[relpath]
    )
    deleted = sorted(baseline.keys() - current.keys())
    untracked = sorted(current.keys() - baseline.keys())
    return CheckResult(modified, deleted, untracked)
