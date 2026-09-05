"""Command-line interface for the docs integrity guard.

Subcommands (design.md): ``check [--project NAME] [--format human|json]``
loads the baseline, scans ``docs/``, classifies, reports, and exits
0/1/2/3 by spec precedence -- operational failures short-circuit before
any comparison. ``update [--project NAME]`` recomputes the manifest and
replaces the persisted baseline: refuses with exit 1 (old blob left byte
untouched) when any tracked file was modified or deleted, admits any
number of new files at once, rewrites byte-identically on no-op runs,
and bootstraps a fresh baseline when none exists.

PDF-to-Markdown conversion was dropped: the course material is authored
in Markdown, so no conversion step is needed.

Exit-code note: argparse errors would exit 2, reserved here for the
untracked warning; usage errors therefore map to exit 3 instead.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from docsguard import checker, manifest
from docsguard.store import EngramStore, StoreError

UPDATE_HINT = "(admit via: python3 scripts/docs_guard.py update)"


def default_docs_root() -> str:
    """``docs/`` directory of the workspace shipping this package.

    cli.py sits at ``<workspace>/scripts/docsguard/cli.py``, so three
    dirname steps climb back to the workspace root.
    """
    workspace = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    return os.path.join(workspace, "docs")


class _GuardParser(argparse.ArgumentParser):

    def error(self, message):  # noqa: D401 - argparse contract
        self.print_usage(sys.stderr)
        sys.stderr.write(f"docs_guard.py: error: {message}\n")
        raise SystemExit(checker.EXIT_OPERATIONAL)


def build_parser() -> _GuardParser:
    parser = _GuardParser(
        prog="docs_guard.py",
        description="Integrity guard for the immutable docs/ tree.",
    )
    subparsers = parser.add_subparsers(dest="command")
    check_cmd = subparsers.add_parser(
        "check", help="compare docs/ against the persisted baseline"
    )
    check_cmd.add_argument("--project", default="laboratorios")
    check_cmd.add_argument("--format", choices=("human", "json"),
                           default="human")
    update_cmd = subparsers.add_parser(
        "update", help="recompute the manifest and replace the baseline"
    )
    update_cmd.add_argument("--project", default="laboratorios")
    return parser


# --------------------------------------------------------------------------
# reporting helpers


def _finding_lines(result: checker.CheckResult):
    """Deterministic human-readable lines for every finding, tamper first."""
    for relpath, expected, actual in result.modified:
        yield f"MODIFIED {relpath} expected={expected} actual={actual}"
    for relpath in result.deleted:
        yield f"DELETED {relpath}"
    for relpath in result.untracked:
        yield f"UNTRACKED {relpath} {UPDATE_HINT}"


def _report_check(result: checker.CheckResult, fmt: str) -> int:
    if fmt == "json":
        payload = {
            "command": "check",
            "outcome": result.outcome,
            "exit_code": result.exit_code,
            "modified": [
                {"path": relpath, "expected": expected, "actual": actual}
                for relpath, expected, actual in result.modified
            ],
            "deleted": list(result.deleted),
            "untracked": list(result.untracked),
        }
        print(json.dumps(payload))
        return result.exit_code

    if result.outcome == "clean":
        print("OK (clean): all tracked files match; no untracked files.")
    elif result.outcome == "tamper":
        print("TAMPERING: tracked files were modified or deleted "
              f"(exit {checker.EXIT_TAMPER}).")
    else:
        print("WARNING: untracked regular files present, tracked intact "
              f"(exit {checker.EXIT_UNTRACKED}).")
    for line in _finding_lines(result):
        print(line)
    return result.exit_code


def _fail_operational(exc: Exception, fmt: str) -> int:
    if fmt == "json":
        print(json.dumps({
            "command": "check",
            "outcome": "operational",
            "exit_code": checker.EXIT_OPERATIONAL,
            "error": str(exc),
        }))
    else:
        sys.stderr.write(
            f"OPERATIONAL ERROR (exit {checker.EXIT_OPERATIONAL}): {exc}\n"
        )
    return checker.EXIT_OPERATIONAL


# --------------------------------------------------------------------------
# subcommands


def cmd_check(args, docs_root: str) -> int:
    try:
        raw = EngramStore(project=args.project).load_baseline()
    except StoreError as exc:
        return _fail_operational(exc, args.format)
    try:
        baseline_entries = manifest.parse_manifest(raw)
        current_entries = manifest.scan_entries(docs_root)
    except manifest.ManifestError as exc:
        # Missing/corrupt baseline bytes or an unscannable tree are
        # operational errors -- never tampering verdicts.
        return _fail_operational(exc, args.format)
    result = checker.classify(baseline_entries, current_entries)
    return _report_check(result, args.format)


def cmd_update(args, docs_root: str) -> int:
    store = EngramStore(project=args.project)
    try:
        raw = store.load_baseline()
    except StoreError as exc:
        if exc.kind != "missing":
            return _fail_operational(exc, "human")
        raw = None  # first run: nothing to protect, bootstrap fresh

    baseline_entries = None
    previous_blob = None
    if raw is not None:
        try:
            baseline_entries = manifest.parse_manifest(raw)
        except manifest.ManifestError as exc:
            # Never overwrite a baseline we cannot understand.
            return _fail_operational(exc, "human")
        previous_blob = raw

    try:
        current_entries = manifest.scan_entries(docs_root)
        new_blob = manifest.serialize_entries(current_entries)
    except manifest.ManifestError as exc:
        return _fail_operational(exc, "human")

    if baseline_entries is not None:
        verdict = checker.classify(baseline_entries, current_entries)
        if verdict.outcome == "tamper":
            # Refuse rebaselining over tampering; the persisted baseline
            # stays byte-unchanged because save_baseline is never called.
            print("UPDATE REFUSED (exit %d): tracked files were modified or "
                  "deleted; baseline left untouched."
                  % checker.EXIT_TAMPER)
            for line in _finding_lines(verdict):
                print(line)
            return checker.EXIT_TAMPER

    store.save_baseline(new_blob)
    if previous_blob == new_blob:
        print(f"Baseline rewritten byte-identically (no-op); "
              f"{len(current_entries)} entries.")
    else:
        print(f"Baseline updated: {len(current_entries)} entries.")
    return checker.EXIT_CLEAN


COMMANDS = {"check": cmd_check, "update": cmd_update}


def main(argv=None, docs_root=None) -> int:
    args = build_parser().parse_args(list(argv) if argv is not None else None)
    handler = COMMANDS.get(args.command)
    if handler is None:
        build_parser().print_usage(sys.stderr)
        return checker.EXIT_OPERATIONAL  # convert-pdf lands in Phase 3
    return handler(args, docs_root or default_docs_root())
