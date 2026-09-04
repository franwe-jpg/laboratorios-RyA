"""Tests for docsguard.pdftext (Phase 3: PDF -> Markdown converter).

Spec under test: pdf-to-markdown ("Conversion Scope and Output Location",
"Fidelity Target", "Deterministic Re-runs", "Interaction with Integrity
Update Flow") and the design.md converter decisions: fixed argv
``pdftotext -enc UTF-8 -q``, injectable binary path, missing/unusable/
failing child -> operational error (exit 3 class, never tamper), textual
heading promotion by dot depth, garbled-region omission with a visible
limitations note, and byte-deterministic re-runs.

Harness rule: stub/fake pdftotext binaries and synthetic PDF copies live
under /tmp fixtures only; the developer's real docs/ tree and store are
never mutated. One generic case exercises the real /usr/bin/pdftotext on
a COPY of the real course PDF and skips cleanly when either is absent.
"""

import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

from docsguard import pdftext

REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
SCRIPTS_SRC = os.path.join(REPO_ROOT, "scripts")
REAL_PDF = os.path.join(REPO_ROOT, "docs",
                        "unidad-01-conceptos-de-seguridad.pdf")
REAL_PDFTEXT = "/usr/bin/pdftotext"

PDF_MAGIC = b"%PDF-1.4\n%synthetic fixture pdf\n"

# Canned plain text emitted by the good stub: numbered headings at three
# depths, an IPv4-shaped line that must stay body text, an unnumbered
# short line that must stay body text, one garbled (PUA-laden) line, and
# a ligature to be folded.
CANNED_EXTRACTION = (
    "Guía de Redes\n"
    "\n"
    "1 Introducción\n"
    "Párrafo con acentos: conexión y seguridad.\n"
    "\f"
    "2.3 Subredes y máscaras\n"
    "Texto normal de la sección.\n"
    "192.168.0.1 es la pasarela por defecto.\n"
    "3.2.4 Detalle profundo\n"
    "signiﬁca plegado de ligaduras\n"
    "ﬁﬁﬁ\ue000\ue001 texto irrecuperable \ufffd\ufffd\n"
    "Cierre del documento.\n"
)

STUB_TEMPLATE = '''\
#!/usr/bin/env python3
"""Test stub standing in for /usr/bin/pdftotext."""
import sys

MODE = {mode!r}
CANNED = {canned!r}

args = [a for a in sys.argv[1:] if not a.startswith("-")]
if "-v" in sys.argv[1:]:
    sys.stderr.write("pdftotext version 99.stub-test\\n")
    raise SystemExit(0)
if MODE == "fail":
    sys.stderr.write("simulated pdftotext child failure\\n")
    raise SystemExit(7)
if MODE == "hang":
    import time
    time.sleep(5)
if len(args) >= 2:
    with open(args[1], "w", encoding="utf-8") as fh:
        fh.write(CANNED)
raise SystemExit(0)
'''


def _write_stub(directory, name, mode):
    """Materialize an executable fake pdftotext binary and return path."""
    path = os.path.join(directory, name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(STUB_TEMPLATE.format(mode=mode, canned=CANNED_EXTRACTION))
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR | stat.S_IXGRP
             | stat.S_IXOTH)
    return path


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


class PdtextTestCase(unittest.TestCase):
    """Harness: one temp dir holding stubs and a synthetic docs tree."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = tmp.name
        self.docs = os.path.join(tmp.name, "docs")
        self.subdir = os.path.join(self.docs, "nested")
        os.makedirs(self.subdir)
        self.pdf = os.path.join(self.docs, "unit.pdf")
        with open(self.pdf, "wb") as fh:
            fh.write(PDF_MAGIC)
        self.nested_pdf = os.path.join(self.subdir, "deep.pdf")
        with open(self.nested_pdf, "wb") as fh:
            fh.write(PDF_MAGIC)
        self.stubs = os.path.join(tmp.name, "stubs")
        os.makedirs(self.stubs)
        self.good_stub = _write_stub(self.stubs, "pdftotext-good", "good")
        self.fail_stub = _write_stub(self.stubs, "pdftotext-fail", "fail")
        self.hang_stub = _write_stub(self.stubs, "pdftotext-hang", "hang")


class OperationalFailureTests(PdtextTestCase):
    """Missing/unusable/failing pdftotext is operational (exit 3 class)."""

    def test_missing_binary_raises_operational_error_naming_path(self):
        missing = "/nonexistent/path/to/pdftotext"
        with self.assertRaises(pdftext.PdftextError) as ctx:
            pdftext.extract_text(self.pdf, binary_path=missing)
        self.assertIn(missing, str(ctx.exception))

    def test_unusable_binary_raises_operational_error_naming_path(self):
        unusable = os.path.join(self.tmp, "not-executable")
        with open(unusable, "w", encoding="utf-8") as fh:
            fh.write("#!/usr/bin/env python3\nprint('no exec bit')\n")
        with self.assertRaises(pdftext.PdftextError) as ctx:
            pdftext.extract_text(self.pdf, binary_path=unusable)
        self.assertIn(unusable, str(ctx.exception))

    def test_nonzero_child_exit_raises_operational_error(self):
        with self.assertRaises(pdftext.PdftextError) as ctx:
            pdftext.extract_text(self.pdf, binary_path=self.fail_stub)
        self.assertIn("7", str(ctx.exception))

    def test_child_timeout_raises_operational_error(self):
        with self.assertRaises(pdftext.PdftextError):
            pdftext.extract_text(self.pdf, binary_path=self.hang_stub,
                                 timeout_seconds=0.3)

    def test_banner_probe_returns_first_version_line(self):
        banner = pdftext.probe_banner(self.good_stub)
        self.assertEqual(banner, "pdftotext version 99.stub-test")

    def test_banner_probe_missing_binary_raises_operational_error(self):
        missing = "/nonexistent/path/to/pdftotext"
        with self.assertRaises(pdftext.PdftextError) as ctx:
            pdftext.probe_banner(missing)
        self.assertIn(missing, str(ctx.exception))


class ExtractionContractTests(PdtextTestCase):
    """Fixed argv, UTF-8 decoding, and banner attribution per run."""

    def test_extract_returns_text_and_banner(self):
        text, banner = pdftext.extract_text(self.pdf,
                                            binary_path=self.good_stub)
        self.assertEqual(banner, "pdftotext version 99.stub-test")
        self.assertIn("conexión y seguridad", text)

    def test_extract_passes_fixed_encoding_flag(self):
        # The stub strips option-looking argv entries before positional
        # handling; assert the fixed options were sent verbatim.
        probe = os.path.join(self.stubs, "argv-probe")
        seen_path = os.path.join(self.tmp, "seen.json")
        with open(probe, "w", encoding="utf-8") as fh:
            fh.write(
                "#!/usr/bin/env python3\n"
                "import json, sys\n"
                "with open(%r, 'w') as fh:\n"
                "    json.dump(sys.argv[1:], fh)\n" % seen_path
            )
        os.chmod(probe, 0o755)
        pdftext.extract_text(self.pdf, binary_path=probe)
        with open(seen_path, encoding="utf-8") as fh:
            argv = json.load(fh)
        self.assertEqual(argv[:2], ["-enc", "UTF-8"])
        self.assertIn("-q", argv)
        self.assertEqual(argv[-2], self.pdf)


class HeadingPromotionTests(PdtextTestCase):
    """Textual section-numbering promotion by dot depth (design lock)."""

    def test_single_number_promotes_to_h1(self):
        result = pdftext.build_markdown("1 Introducción\n")
        self.assertIn("# 1 Introducción", result.markdown)

    def test_two_component_number_promotes_to_h2(self):
        result = pdftext.build_markdown("2.3 Subredes\n")
        self.assertIn("## 2.3 Subredes", result.markdown)

    def test_three_component_number_promotes_to_h3(self):
        result = pdftext.build_markdown("3.2.4 Detalle\n")
        self.assertIn("### 3.2.4 Detalle", result.markdown)

    def test_trailing_dot_numbering_is_accepted(self):
        result = pdftext.build_markdown("4. Metodología\n")
        self.assertIn("# 4. Metodología", result.markdown)

    def test_ipv4_shaped_lines_stay_body_text(self):
        result = pdftext.build_markdown("192.168.0.1 es la pasarela.\n")
        markdown = result.markdown
        self.assertNotIn("# 192.168.0.1", markdown)
        self.assertNotIn("## 192.168.0.1", markdown)
        self.assertIn("192.168.0.1 es la pasarela.", markdown)

    def test_unnumbered_short_line_stays_body_text(self):
        result = pdftext.build_markdown("Introducción\n")
        self.assertNotIn("# ", result.markdown)
        self.assertIn("Introducción", result.markdown)

    def test_heading_count_reported_honestly_including_zero(self):
        empty = pdftext.build_markdown("Solo párrafos sueltos.\n")
        self.assertEqual(empty.headings, 0)
        counted = pdftext.build_markdown(
            "1 Uno\nbody\n2.3 Dos\nmás cuerpo\n9.9.9 Tres\n")
        self.assertEqual(counted.headings, 3)


class FidelityTests(PdtextTestCase):
    """Garbled regions omitted honestly; limitations note always visible."""

    def setUp(self):
        super().setUp()
        self.result = pdftext.build_markdown(CANNED_EXTRACTION)
        self.markdown = self.result.markdown

    def test_garbled_line_is_omitted_not_emitted(self):
        self.assertNotIn("\ue000", self.markdown)
        self.assertNotIn("\ufffd", self.markdown)
        self.assertNotIn("texto irrecuperable", self.markdown)

    def test_garbled_omission_count_is_reported(self):
        self.assertGreaterEqual(self.result.garbled_omitted, 1)

    def test_limitations_note_always_present(self):
        self.assertIn("Extraction limitations", self.markdown)

    def test_ligatures_folded_for_readability(self):
        self.assertIn("significa", self.markdown)
        self.assertNotIn("signiﬁca", self.markdown)

    def test_form_feed_page_markers_removed(self):
        self.assertNotIn("\f", self.markdown)

    def test_readable_content_survives_processing(self):
        for token in ("conexión y seguridad", "# 1 Introducción",
                      "## 2.3 Subredes", "### 3.2.4 Detalle",
                      "Cierre del documento.",
                      "192.168.0.1 es la pasarela por defecto."):
            self.assertIn(token, self.markdown)


class DeterminismTests(PdtextTestCase):
    """Re-runs are byte-identical; only the own sibling is overwritten."""

    def test_build_markdown_is_pure_and_deterministic(self):
        first = pdftext.build_markdown(CANNED_EXTRACTION).markdown
        second = pdftext.build_markdown(CANNED_EXTRACTION).markdown
        self.assertEqual(first.encode("utf-8"), second.encode("utf-8"))

    def test_convert_twice_byte_identical_overwriting_in_place(self):
        first = pdftext.convert_pdf(self.pdf, binary_path=self.good_stub)
        output = first.output_path
        self.assertEqual(output, os.path.join(self.docs, "unit.md"))
        with open(output, "rb") as fh:
            first_bytes = fh.read()
        listing_before = sorted(os.listdir(self.docs))
        second = pdftext.convert_pdf(self.pdf, binary_path=self.good_stub)
        self.assertEqual(second.output_path, output)
        with open(output, "rb") as fh:
            second_bytes = fh.read()
        self.assertEqual(first_bytes, second_bytes)
        self.assertEqual(sorted(os.listdir(self.docs)), listing_before,
                         "re-run must not create duplicate files")

    def test_source_pdf_hash_unchanged_after_conversion(self):
        before = _sha256(self.pdf)
        pdftext.convert_pdf(self.pdf, binary_path=self.good_stub)
        self.assertEqual(_sha256(self.pdf), before)

    def test_conversion_does_not_touch_other_files(self):
        other = os.path.join(self.docs, ".gitkeep")
        with open(other, "wb") as fh:
            fh.write(b"")
        keep_hash = _sha256(other)
        nested_hash = _sha256(self.nested_pdf)
        pdftext.convert_pdf(self.pdf, binary_path=self.good_stub)
        self.assertEqual(_sha256(other), keep_hash)
        self.assertEqual(_sha256(self.nested_pdf), nested_hash)
        self.assertFalse(os.path.exists(
            os.path.join(self.docs, "unit.md.md")))


class RealBinaryGenericTests(PdtextTestCase):
    """Generic behavior against the real Poppler binary on a COPY."""

    @unittest.skipUnless(os.path.isfile(REAL_PDFTEXT),
                         "real pdftotext binary not available")
    @unittest.skipUnless(os.path.isfile(REAL_PDF),
                         "real course PDF not available")
    def test_real_pdf_copy_converts_generically(self):
        copy = os.path.join(self.docs, "real-copy.pdf")
        shutil.copyfile(REAL_PDF, copy)
        source_hash = _sha256(copy)
        result = pdftext.convert_pdf(copy)
        self.assertTrue(os.path.isfile(result.output_path))
        self.assertEqual(_sha256(copy), source_hash)
        with open(result.output_path, encoding="utf-8") as fh:
            markdown = fh.read()
        self.assertIn("seguridad", markdown.lower())
        self.assertIn("Extraction limitations", markdown)


class CliConvertTests(PdtextTestCase):
    """convert-pdf CLI surface via the real entrypoint in a /tmp copy.

    Each test copies the real scripts/ tree into a fixture workspace and
    drives ``docs_guard.py convert-pdf`` with an isolated ENGRAM_DATA_DIR;
    nothing under the developer's real docs/ or store is touched. The CLI
    always invokes the real system pdftotext, so these end-to-end cases
    feed it copies of the real course PDF and skip cleanly when that PDF
    or the binary is unavailable; stub-driven coverage above stays hermetic.
    """

    @unittest.skipUnless(os.path.isfile(REAL_PDFTEXT),
                         "real pdftotext binary not available")
    @unittest.skipUnless(os.path.isfile(REAL_PDF),
                         "real course PDF not available")
    def setUp(self):
        super().setUp()
        # Replace synthetic fixtures with real-PDF copies so the genuine
        # Poppler child can parse them.
        shutil.copyfile(REAL_PDF, self.pdf)
        shutil.copyfile(REAL_PDF, self.nested_pdf)
        self.workspace = os.path.join(self.tmp, "ws")
        self.engram_data = os.path.join(self.tmp, "engram-data")
        os.makedirs(self.workspace)
        os.makedirs(self.engram_data)
        shutil.copytree(SCRIPTS_SRC,
                        os.path.join(self.workspace, "scripts"),
                        ignore=shutil.ignore_patterns("__pycache__"))
        fixture_docs = os.path.join(self.workspace, "docs")
        shutil.rmtree(fixture_docs)
        shutil.copytree(self.docs, fixture_docs)
        self.wdocs = fixture_docs
        self.entrypoint = os.path.join(self.workspace, "scripts",
                                       "docs_guard.py")

    def run_guard(self, *argv):
        env = dict(os.environ, ENGRAM_DATA_DIR=self.engram_data)
        return subprocess.run(
            [sys.executable, self.entrypoint, *argv],
            capture_output=True, text=True, cwd=self.workspace, env=env,
        )

    def bootstrap_baseline(self):
        proc = self.run_guard("update")
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def stored_baseline(self):
        snapshot = os.path.join(self.engram_data, "probe.json")
        subprocess.run(
            ["engram", "export", snapshot], capture_output=True, text=True,
            env=dict(os.environ, ENGRAM_DATA_DIR=self.engram_data),
            check=True,
        )
        with open(snapshot, encoding="utf-8") as fh:
            data = json.load(fh)
        matches = [
            obs for obs in data["observations"]
            if obs["project"] == "laboratorios"
            and obs["title"] == "docs-integrity/manifest"
        ]
        self.assertEqual(len(matches), 1)
        return matches[0]["content"]

    def read_wdoc(self, relpath):
        with open(os.path.join(self.wdocs, relpath), "rb") as fh:
            return fh.read()

    def test_convert_explicit_path_writes_sibling_md(self):
        proc = self.run_guard("convert-pdf", self.pdf)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(os.path.isfile(os.path.join(self.wdocs, "unit.md")))
        self.assertIn("CONVERTED", proc.stdout)

    def test_convert_rejects_path_outside_docs(self):
        outside = os.path.join(self.tmp, "outside.pdf")
        with open(outside, "wb") as fh:
            fh.write(PDF_MAGIC)
        proc = self.run_guard("convert-pdf", outside)
        self.assertEqual(proc.returncode, 3, proc.stdout)
        combined = proc.stdout + proc.stderr
        self.assertIn("docs", combined.lower())

    def test_convert_rejects_non_pdf_suffix(self):
        impostor = os.path.join(self.wdocs, "notes.txt")
        with open(impostor, "w", encoding="utf-8") as fh:
            fh.write("not a pdf\n")
        proc = self.run_guard("convert-pdf", impostor)
        self.assertEqual(proc.returncode, 3, proc.stdout)

    def test_convert_rejects_missing_path(self):
        proc = self.run_guard(
            "convert-pdf", os.path.join(self.wdocs, "ghost.pdf"))
        self.assertEqual(proc.returncode, 3, proc.stdout)

    def test_convert_without_paths_converts_every_pdf_recursive_sorted(self):
        proc = self.run_guard("convert-pdf")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(os.path.isfile(os.path.join(self.wdocs, "unit.md")))
        self.assertTrue(os.path.isfile(
            os.path.join(self.wdocs, "nested", "deep.md")))
        self.assertIn("deep.pdf", proc.stdout)

    def test_convert_reports_banner_and_counts(self):
        proc = self.run_guard("convert-pdf", self.pdf)
        combined = proc.stdout + proc.stderr
        self.assertIn("pdftotext version", combined)
        self.assertIn("headings=", combined)
        self.assertIn("garbled", combined.lower())

    def test_conversion_leaves_sources_and_baseline_untouched(self):
        self.bootstrap_baseline()
        baseline_before = self.stored_baseline()
        pdf_hash = _sha256(self.pdf)
        nested_hash = _sha256(self.nested_pdf)
        proc = self.run_guard("convert-pdf")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(_sha256(self.pdf), pdf_hash)
        self.assertEqual(_sha256(self.nested_pdf), nested_hash)
        self.assertEqual(self.stored_baseline(), baseline_before)

    def test_fresh_converted_md_is_untracked_exit_two_then_admitted_zero(self):
        self.bootstrap_baseline()
        proc = self.run_guard("convert-pdf", self.pdf)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        check = self.run_guard("check")
        self.assertEqual(check.returncode, 2, check.stdout)
        self.assertIn("unit.md", check.stdout)
        admit = self.run_guard("update")
        self.assertEqual(admit.returncode, 0, admit.stderr)
        green = self.run_guard("check")
        self.assertEqual(green.returncode, 0, green.stdout)

    def test_rerun_after_admission_stays_green(self):
        self.bootstrap_baseline()
        self.run_guard("convert-pdf", self.pdf)
        self.run_guard("update")
        rerun = self.run_guard("convert-pdf", self.pdf)
        self.assertEqual(rerun.returncode, 0, rerun.stderr)
        with open(os.path.join(self.wdocs, "unit.md"), "rb") as fh:
            regenerated = fh.read()
        self.assertIn(b"Extraction limitations", regenerated)
        green = self.run_guard("check")
        self.assertEqual(green.returncode, 0, green.stdout)


if __name__ == "__main__":
    unittest.main()
