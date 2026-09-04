"""Integration tests for the docs_guard.py CLI (Phase 2: check/update).

Spec under test: docs-integrity "Checker Outcomes and Exit Codes" and
"Update Flow Semantics". Each test copies the real scripts/ tree into a
fixture workspace under /tmp, seeds a synthetic docs/ tree, and runs the
actual entrypoint with an isolated ENGRAM_DATA_DIR. The developer's real
engram store and the real docs/ tree are never touched.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS_SRC = os.path.join(REPO_ROOT, "scripts")

GITKEEP = b""
PDF_BYTES = b"%PDF-1.4\n%fixture pdf bytes\n"

ENGRAM = "engram"


class CliTestCase(unittest.TestCase):
    """Harness: one fixture workspace + isolated engram data dir per test."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.workspace = os.path.join(tmp.name, "ws")
        self.engram_data = os.path.join(tmp.name, "engram-data")
        os.makedirs(os.path.join(self.workspace, "docs"))
        shutil.copytree(
            SCRIPTS_SRC,
            os.path.join(self.workspace, "scripts"),
            ignore=shutil.ignore_patterns("__pycache__"),
        )
        os.makedirs(self.engram_data)
        self.empty_path = os.path.join(tmp.name, "empty-path")
        os.makedirs(self.empty_path)
        self.write_docs(".gitkeep", GITKEEP)
        self.write_docs("unit.pdf", PDF_BYTES)

    def write_docs(self, relpath, content):
        dest = os.path.join(self.workspace, "docs", relpath)
        parent = os.path.dirname(dest)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(content)

    def read_docs(self, relpath):
        with open(os.path.join(self.workspace, "docs", relpath), "rb") as fh:
            return fh.read()

    def run_guard(self, *argv, path=None):
        env = dict(os.environ, ENGRAM_DATA_DIR=self.engram_data)
        if path is not None:
            env["PATH"] = path
        entrypoint = os.path.join(self.workspace, "scripts", "docs_guard.py")
        return subprocess.run(
            [sys.executable, entrypoint, *argv],
            capture_output=True, text=True, cwd=self.workspace, env=env,
        )

    def stored_baseline(self):
        """Export the isolated store and return the baseline content."""
        snapshot = os.path.join(self.engram_data, "probe.json")
        subprocess.run(
            [ENGRAM, "export", snapshot], capture_output=True,
            text=True, env=dict(os.environ, ENGRAM_DATA_DIR=self.engram_data),
            check=True,
        )
        with open(snapshot, encoding="utf-8") as fh:
            data = json.load(fh)
        matches = [
            obs for obs in data["observations"]
            if obs["project"] == "laboratorios"
            and obs["title"] == "docs-integrity/manifest"
        ]
        self.assertEqual(len(matches), 1, "expected exactly one baseline observation")
        return matches[0]["content"]

    def overwrite_baseline(self, raw_content):
        subprocess.run(
            [ENGRAM, "save", "docs-integrity/manifest", raw_content,
             "--type", "architecture", "--project", "laboratorios",
             "--scope", "project", "--topic", "docs-integrity/manifest"],
            capture_output=True, text=True,
            env=dict(os.environ, ENGRAM_DATA_DIR=self.engram_data), check=True,
        )


class CheckFlowTests(CliTestCase):

    def test_check_before_bootstrap_is_operational_exit_3(self):
        proc = self.run_guard("check")
        self.assertEqual(proc.returncode, 3)
        self.assertIn("baseline", proc.stderr.lower())

    def test_bootstrap_update_then_check_exits_zero(self):
        self.assertEqual(self.run_guard("update").returncode, 0)
        proc = self.run_guard("check")
        self.assertEqual(proc.returncode, 0)
        self.assertIn("clean", proc.stdout.lower())

    def test_modified_file_exits_one_with_expected_vs_actual(self):
        self.run_guard("update")
        tampered = PDF_BYTES + b"tampered\n"
        self.write_docs("unit.pdf", tampered)
        proc = self.run_guard("check")
        self.assertEqual(proc.returncode, 1)
        combined = proc.stdout + proc.stderr
        self.assertIn("unit.pdf", combined)
        self.assertIn("expected", combined.lower())
        self.assertIn("actual", combined.lower())

    def test_deleted_file_exits_one_marked_deleted(self):
        self.run_guard("update")
        os.remove(os.path.join(self.workspace, "docs", "unit.pdf"))
        proc = self.run_guard("check")
        self.assertEqual(proc.returncode, 1)
        combined = proc.stdout + proc.stderr
        self.assertIn("deleted", combined.lower())
        self.assertIn("unit.pdf", combined)

    def test_untracked_file_exits_two_naming_file_and_update_flow(self):
        self.run_guard("update")
        self.write_docs("notes.md", b"# notes\n")
        proc = self.run_guard("check")
        self.assertEqual(proc.returncode, 2)
        combined = proc.stdout + proc.stderr
        self.assertIn("notes.md", combined)
        self.assertIn("update", combined.lower())

    def test_missing_engram_binary_is_operational_not_tamper(self):
        self.run_guard("update")
        self.write_docs("unit.pdf", b"tampered")
        # PATH holds only an empty dir: sys.executable is absolute so the
        # entrypoint still launches, but the engram lookup must fail.
        proc = self.run_guard("check", path=self.empty_path)
        # Verification must fail operationally (3), never as tampering (1).
        self.assertEqual(proc.returncode, 3)

    def test_corrupted_baseline_is_operational_exit_3_never_verdict_1(self):
        self.run_guard("update")
        self.overwrite_baseline("definitely not a manifest blob")
        proc = self.run_guard("check")
        self.assertEqual(proc.returncode, 3)


class JsonFormatTests(CliTestCase):

    def test_json_format_reports_clean_structurally(self):
        self.run_guard("update")
        proc = self.run_guard("check", "--format", "json")
        self.assertEqual(proc.returncode, 0)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["outcome"], "clean")
        self.assertEqual(payload["exit_code"], 0)
        self.assertEqual(payload["modified"], [])
        self.assertEqual(payload["deleted"], [])
        self.assertEqual(payload["untracked"], [])

    def test_json_format_reports_tamper_and_untracked_together(self):
        self.run_guard("update")
        self.write_docs("unit.pdf", PDF_BYTES + b"x")
        self.write_docs("extra.md", b"new")
        proc = self.run_guard("check", "--format", "json")
        self.assertEqual(proc.returncode, 1)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["outcome"], "tamper")
        self.assertEqual(
            payload["modified"][0]["path"], "unit.pdf",
        )
        self.assertTrue(payload["modified"][0]["expected"])
        self.assertNotEqual(
            payload["modified"][0]["expected"],
            payload["modified"][0]["actual"],
        )
        self.assertEqual(payload["untracked"], ["extra.md"])


class UpdateFlowTests(CliTestCase):

    def test_update_admits_multiple_new_files_in_one_run(self):
        self.run_guard("update")
        self.write_docs("m1.md", b"one\n")
        self.write_docs("m2.md", b"two\n")
        self.assertEqual(self.run_guard("check").returncode, 2)
        proc = self.run_guard("update")
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(self.run_guard("check").returncode, 0)
        baseline = self.stored_baseline()
        self.assertIn(" m1.md\n", baseline)
        self.assertIn(" m2.md\n", baseline)

    def test_noop_update_rewrites_baseline_byte_identically(self):
        self.run_guard("update")
        before = self.stored_baseline()
        proc = self.run_guard("update")
        self.assertEqual(proc.returncode, 0)
        after = self.stored_baseline()
        self.assertEqual(before, after)

    def test_update_over_tamper_refuses_and_leaves_baseline_byte_unchanged(self):
        self.run_guard("update")
        before = self.stored_baseline()
        self.write_docs("unit.pdf", PDF_BYTES + b"tampered after baseline\n")
        proc = self.run_guard("update")
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(proc.returncode, 1)
        combined = proc.stdout + proc.stderr
        self.assertIn("unit.pdf", combined)
        self.assertEqual(self.stored_baseline(), before)

    def test_update_over_deleted_tracked_file_refuses_nonzero(self):
        self.run_guard("update")
        os.remove(os.path.join(self.workspace, "docs", ".gitkeep"))
        proc = self.run_guard("update")
        self.assertEqual(proc.returncode, 1)


if __name__ == "__main__":
    unittest.main()
