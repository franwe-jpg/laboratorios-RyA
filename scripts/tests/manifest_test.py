"""Unit tests for docsguard.manifest (Phase 1: manifest foundation).

Specs under test: docs-integrity "Manifest Coverage", "Manifest
Determinism" and the design contract for canonical serialization.
All fixtures are hermetic temp trees; nothing under the real docs/ is read.
"""

import hashlib
import os
import re
import tempfile
import unittest

from docsguard import manifest


HEX_RE = re.compile(r"[0-9a-f]{64}")


class ManifestTestCase(unittest.TestCase):
    """Base harness: an isolated temp tree per test."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = tmp.name

    def write(self, relpath, content):
        dest = os.path.join(self.root, relpath.replace("/", os.sep))
        parent = os.path.dirname(dest)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(content)

    @staticmethod
    def digest(content):
        return hashlib.sha256(content).hexdigest()

    def relpaths_of(self, data):
        return [relpath for relpath, _ in manifest.parse_manifest(data)]


class CoverageTests(ManifestTestCase):

    def test_empty_tree_yields_header_only(self):
        data = manifest.generate_manifest(self.root)
        self.assertEqual(data, manifest.MANIFEST_HEADER)

    def test_unit_pdf_plus_gitkeep_yields_two_entries(self):
        self.write(".gitkeep", b"")
        self.write(
            "unidad-01-conceptos-de-seguridad.pdf",
            b"%PDF-1.4\n%fake fixture bytes\n",
        )
        entries = manifest.parse_manifest(manifest.generate_manifest(self.root))
        self.assertEqual(len(entries), 2)
        self.assertEqual(
            [path for path, _ in entries],
            [".gitkeep", "unidad-01-conceptos-de-seguridad.pdf"],
        )
        self.assertEqual(entries[0][1], self.digest(b""))

    def test_gitkeep_alone_yields_single_entry(self):
        self.write(".gitkeep", b"")
        entries = manifest.parse_manifest(manifest.generate_manifest(self.root))
        self.assertEqual(entries, [(".gitkeep", self.digest(b""))])

    def test_nested_file_uses_forward_slash_relpath(self):
        self.write("sub/dir/notes.txt", b"nested")
        entries = manifest.parse_manifest(manifest.generate_manifest(self.root))
        self.assertIn(("sub/dir/notes.txt", self.digest(b"nested")), entries)


class DeterminismTests(ManifestTestCase):

    def setUp(self):
        super().setUp()
        self.write(".gitkeep", b"")
        self.write("a.txt", b"alpha")
        self.write("B.txt", b"bravo")

    def test_double_run_is_byte_identical(self):
        first = manifest.generate_manifest(self.root)
        second = manifest.generate_manifest(self.root)
        self.assertEqual(first, second)

    def test_hashes_are_lowercase_hex(self):
        data = manifest.generate_manifest(self.root)
        for _, digest in manifest.parse_manifest(data):
            self.assertRegex(digest, HEX_RE)

    def test_lf_endings_everywhere_including_final_line(self):
        data = manifest.generate_manifest(self.root)
        self.assertTrue(data.endswith(b"\n"))
        self.assertNotIn(b"\r", data)
        expected_newlines = len(manifest.parse_manifest(data)) + 1  # + header
        self.assertEqual(data.count(b"\n"), expected_newlines)

    def test_entries_sorted_bytewise_by_relpath(self):
        self.write("á.txt", "áccented".encode("utf-8"))
        order = self.relpaths_of(manifest.generate_manifest(self.root))
        # UTF-8 byte order: "." (2E) < "B" (42) < "a" (61) < "á" (C3...)
        self.assertEqual(order, [".gitkeep", "B.txt", "a.txt", "á.txt"])

    def test_golden_bytes_exact_serialization(self):
        content = b"hello docs"
        self.write("g.txt", content)
        data = manifest.generate_manifest(self.root)
        expected = (
            manifest.MANIFEST_HEADER
            + self.digest(b"").encode("ascii") + b" .gitkeep\n"
            + self.digest(b"bravo").encode("ascii") + b" B.txt\n"
            + self.digest(b"alpha").encode("ascii") + b" a.txt\n"
            + self.digest(content).encode("ascii") + b" g.txt\n"
        )
        self.assertEqual(data, expected)


class RoundTripTests(ManifestTestCase):

    def test_parse_round_trip_recovers_sorted_entries(self):
        self.write(".gitkeep", b"")
        self.write("sub/dir/file.txt", b"payload")
        self.write("z last.txt", b"spaces are fine")
        generated = manifest.parse_manifest(manifest.generate_manifest(self.root))
        parsed = manifest.parse_manifest(manifest.MANIFEST_HEADER + b"".join(
            digest.encode("ascii") + b" " + path.encode("utf-8") + b"\n"
            for path, digest in generated
        ))
        self.assertEqual(parsed, generated)

    def test_parse_rejects_unknown_header_and_malformed_lines(self):
        with self.assertRaises(manifest.ManifestError):
            manifest.parse_manifest(b"not-a-manifest v9\n")
        with self.assertRaises(manifest.ManifestError):
            manifest.parse_manifest(manifest.MANIFEST_HEADER + b"no-space-here\n")
        with self.assertRaises(manifest.ManifestError):
            manifest.parse_manifest(
                manifest.MANIFEST_HEADER + b"z" * 64 + b" x.txt\n"
            )
        with self.assertRaises(manifest.ManifestError):
            manifest.parse_manifest(
                manifest.MANIFEST_HEADER + b"a" * 63 + b" x.txt\n"
            )


class WalkSemanticsTests(ManifestTestCase):

    def test_symlink_to_file_is_excluded(self):
        self.write("real.txt", b"target")
        os.symlink(
            os.path.join(self.root, "real.txt"),
            os.path.join(self.root, "link.txt"),
        )
        paths = self.relpaths_of(manifest.generate_manifest(self.root))
        self.assertEqual(paths, ["real.txt"])

    def test_symlinked_directory_is_not_followed(self):
        self.write("real/inner.txt", b"inside")
        os.symlink(
            os.path.join(self.root, "real"),
            os.path.join(self.root, "dirlink"),
        )
        paths = self.relpaths_of(manifest.generate_manifest(self.root))
        self.assertEqual(paths, ["real/inner.txt"])

    def test_filename_with_newline_aborts_scan_naming_path(self):
        with open(os.path.join(self.root, "bad\nname.txt"), "wb") as fh:
            fh.write(b"x")
        with self.assertRaises(manifest.ManifestError) as ctx:
            manifest.generate_manifest(self.root)
        self.assertIn("bad\nname.txt", str(ctx.exception))

    def test_filename_with_carriage_return_aborts_scan_naming_path(self):
        with open(os.path.join(self.root, "bad\rname.txt"), "wb") as fh:
            fh.write(b"x")
        with self.assertRaises(manifest.ManifestError) as ctx:
            manifest.generate_manifest(self.root)
        self.assertIn("bad\rname.txt", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
