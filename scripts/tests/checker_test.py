"""Tests for docsguard.checker (Phase 2: outcome classification).

Spec under test: docs-integrity "Checker Outcomes and Exit Codes".
Classification runs on fake manifest entries; no filesystem or store
is involved at this layer.
"""

import unittest

from docsguard import checker


def entries(*pairs):
    return list(pairs)


class ClassificationTests(unittest.TestCase):

    def test_clean_tree_is_exit_zero(self):
        result = checker.classify(
            entries((".gitkeep", "aa"), ("a.pdf", "bb")),
            entries((".gitkeep", "aa"), ("a.pdf", "bb")),
        )
        self.assertEqual(result.outcome, "clean")
        self.assertEqual(result.exit_code, checker.EXIT_CLEAN)

    def test_modified_tracked_file_fails_hard_with_expected_vs_actual(self):
        baseline = entries(("a.pdf", "expected-hash"))
        current = entries(("a.pdf", "actual-hash"))
        result = checker.classify(baseline, current)
        self.assertEqual(result.exit_code, checker.EXIT_TAMPER)
        self.assertEqual(
            result.modified, [("a.pdf", "expected-hash", "actual-hash")]
        )

    def test_deleted_tracked_file_fails_hard_marked_deleted(self):
        result = checker.classify(entries(("gone.pdf", "bb")), entries())
        self.assertEqual(result.exit_code, checker.EXIT_TAMPER)
        self.assertEqual(result.deleted, ["gone.pdf"])

    def test_untracked_file_warns_naming_it(self):
        result = checker.classify(entries((".gitkeep", "aa")),
                                  entries((".gitkeep", "aa"), ("new.md", "cc")))
        self.assertEqual(result.exit_code, checker.EXIT_UNTRACKED)
        self.assertEqual(result.untracked, ["new.md"])
        self.assertIn("new.md", str(result))

    def test_tamper_plus_addition_reports_both_and_exits_one(self):
        result = checker.classify(
            entries(("a.pdf", "old"), ("b.txt", "keep")),
            entries(("a.pdf", "new"), ("b.txt", "keep"), ("c.md", "add")),
        )
        self.assertEqual(result.exit_code, checker.EXIT_TAMPER)
        self.assertEqual(result.modified, [("a.pdf", "old", "new")])
        self.assertEqual(result.untracked, ["c.md"])

    def test_hard_failure_outranks_warning(self):
        # deleted + untracked together must still be exit 1.
        result = checker.classify(
            entries(("gone.pdf", "bb")),
            entries(("fresh.md", "cc")),
        )
        self.assertEqual(result.exit_code, checker.EXIT_TAMPER)
        self.assertEqual(result.deleted, ["gone.pdf"])
        self.assertEqual(result.untracked, ["fresh.md"])


class TaxonomyTests(unittest.TestCase):

    def test_exit_code_taxonomy_matches_spec(self):
        self.assertEqual(checker.EXIT_CLEAN, 0)
        self.assertEqual(checker.EXIT_TAMPER, 1)
        self.assertEqual(checker.EXIT_UNTRACKED, 2)
        self.assertEqual(checker.EXIT_OPERATIONAL, 3)

    def test_findings_are_sorted_deterministically(self):
        result = checker.classify(
            entries(("z.pdf", "1"), ("a.pdf", "2")),
            entries(("z.pdf", "9"), ("a.pdf", "X"), ("m.md", "8")),
        )
        self.assertEqual(
            result.modified, [("a.pdf", "2", "X"), ("z.pdf", "1", "9")]
        )
        self.assertEqual(result.deleted, [])
        self.assertEqual(result.untracked, ["m.md"])


if __name__ == "__main__":
    unittest.main()
