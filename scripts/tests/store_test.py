"""Tests for docsguard.store (Phase 2: engram-backed baseline persistence).

Spec under test: docs-integrity "Baseline Persistence via Engram".
Every test runs against an isolated ENGRAM_DATA_DIR in /tmp; the
developer's real engram store is never touched.
"""

import os
import tempfile
import unittest

from docsguard import manifest, store


CANONICAL_BLOB = (
    manifest.MANIFEST_HEADER + b"ab" * 32 + b" .gitkeep\n"
)


class StoreTestCase(unittest.TestCase):
    """Harness: isolated engram data dir per test."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.data_dir = os.path.join(tmp.name, "engram-data")
        os.makedirs(self.data_dir)
        self._old_env = os.environ.get("ENGRAM_DATA_DIR")
        os.environ["ENGRAM_DATA_DIR"] = self.data_dir
        self.addCleanup(self._restore_env)

    def _restore_env(self):
        if self._old_env is None:
            os.environ.pop("ENGRAM_DATA_DIR", None)
        else:
            os.environ["ENGRAM_DATA_DIR"] = self._old_env

    def save_via_cli_shim(self, blob: bytes) -> None:
        store.EngramStore().save_baseline(blob)


class MissingBinaryTests(StoreTestCase):

    def test_load_with_absent_binary_raises_store_error_naming_it(self):
        missing = "/nonexistent/path/to/engram"
        with self.assertRaises(store.StoreError) as ctx:
            store.EngramStore(binary=missing).load_baseline()
        self.assertIn(missing, str(ctx.exception))

    def test_save_with_absent_binary_raises_store_error_naming_it(self):
        missing = "/nonexistent/path/to/engram"
        with self.assertRaises(store.StoreError) as ctx:
            store.EngramStore(binary=missing).save_baseline(CANONICAL_BLOB)
        self.assertIn(missing, str(ctx.exception))


class MissingBaselineTests(StoreTestCase):

    def test_empty_store_reports_missing_baseline_kind(self):
        # update-flow bootstrap must tell "absent" apart from "broken":
        # only the absent case may bootstrap a fresh baseline.
        with self.assertRaises(store.StoreError) as ctx:
            store.EngramStore().load_baseline()
        self.assertIn("missing baseline", str(ctx.exception).lower())
        self.assertEqual(ctx.exception.kind, "missing")


class CorruptedBlobTests(StoreTestCase):

    def test_corrupted_blob_returns_verbatim_and_parses_as_manifest_error(self):
        # LF-terminated garbage: engram strips the final byte on save and
        # the adapter restores it, so what comes back is exactly what a
        # canonical writer would have persisted.
        garbage = b"this is not a manifest\n"
        self.save_via_cli_shim(garbage)
        raw = store.EngramStore().load_baseline()
        self.assertEqual(raw, garbage)
        # Corruption surfaces as ManifestError -> operational exit 3
        # upstream; it never becomes a tampering verdict.
        with self.assertRaises(manifest.ManifestError):
            manifest.parse_manifest(raw)


class RoundTripTests(StoreTestCase):

    def test_save_then_load_round_trips_canonical_bytes(self):
        blob = CANONICAL_BLOB
        self.save_via_cli_shim(blob)
        loaded = store.EngramStore().load_baseline()
        # engram strips the trailing LF on save; the adapter restores the
        # canonical form so strict parsing keeps working after round-trips.
        self.assertEqual(loaded, blob)
        entries = manifest.parse_manifest(loaded)
        self.assertEqual(entries, [(".gitkeep", "ab" * 32)])

    def test_header_only_blob_round_trips(self):
        self.save_via_cli_shim(manifest.MANIFEST_HEADER)
        loaded = store.EngramStore().load_baseline()
        self.assertEqual(loaded, manifest.MANIFEST_HEADER)

    def test_repeated_saves_upsert_to_latest_content(self):
        first = CANONICAL_BLOB
        second = manifest.MANIFEST_HEADER + b"cd" * 32 + b" new.txt\n"
        self.save_via_cli_shim(first)
        self.save_via_cli_shim(second)
        loaded = store.EngramStore().load_baseline()
        self.assertEqual(loaded, second)


if __name__ == "__main__":
    unittest.main()
