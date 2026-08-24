# Tasks: docs-integrity-markdown

## Review Workload Forecast

Estimated changed lines: ~1300–1550.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

Tests: `python3 -m unittest <module>`. Commits stage only `scripts/`, `AGENTS.md`, `openspec/`, never `docs/`.

1. **WU1→PR 1** manifest core. Test manifest_test. Harness /tmp fixtures. Rollback delete `manifest.py`+test.
2. **WU2→PR 2** store/checker/cli. Test store_test checker_test. Harness isolated `ENGRAM_DATA_DIR` driving `docs_guard.py`. Rollback revert those modules; baseline untouched.
3. **WU3→PR 3** converter. Test pdftext_test. Harness stub binaries+PDF copies /tmp. Rollback delete `pdftext.py`+test.
4. **WU4→PR 4** governance+E2E+gate. Test discover scripts/tests. Harness scripted /tmp docs loop. Rollback restore archived rule #1+config line.

## Phase 1: Manifest Foundation

- [x] 1.1 Scaffold `docsguard/__init__.py`, `tests/__init__.py`, stub `docs_guard.py`.
- [x] 1.2 RED `manifest_test`: unit-01+.gitkeep=two entries; `.gitkeep` alone=one; double-run byte-identical; lowercase hex; LF endings; bytewise sort; parse round-trip.
- [x] 1.3 RED: LF/CR filename=scanner aborts exit3 naming path.
- [x] 1.4 GREEN `manifest.py`: lstat walk regular+dotfiles, no symlink follow; SHA-256; v1 header+`<64-hex> <relpath>` LF lines; golden-byte check.

## Phase 2: Store+Checker+Update (dep 1)

- [x] 2.1 RED `store_test` injectable engram path: absent binary=exit3 naming it; empty matches=exit3 missing baseline; corrupted blob=exit3, not tamper; save/export round-trip vs temp dir.
- [x] 2.2 GREEN `store.py`: argv lists, shell=False, 30s timeout; upsert `engram save --topic docs-integrity/manifest`; reads via `engram export`.
- [x] 2.3 RED `checker_test` fake manifests: clean=exit0; modified=exit1 expected-vs-actual; deleted=exit1 marked; untracked=exit2 names file+flow pointer; mixed=both reported, exit1.
- [x] 2.4 Explicit RED: `update` over tamper aborts non-zero; persisted baseline blob byte-unchanged.
- [x] 2.5 GREEN `checker.py`: precedence tamper=1 untracked=2 clean=0; operational exit3 short-circuits pre-comparison.
- [x] 2.6 GREEN `cli.py`: `check [--project open-code] [--format human\|json]`; `update` admits multiple files; no-op rewrite byte-identical.

## Phase 3: Converter (dep 1)

- [ ] 3.1 RED `pdftext_test` injectable path: missing/unusable=exit3 never exit1/tamper; child failure=exit3; twice=byte-identical; re-run overwrites sibling in-place; source hash unchanged; synthetic PDF generic; fresh `.md` untracked=2, admitted=0.
- [ ] 3.2 GREEN `pdftext.py`: `pdftotext -enc UTF-8 -q` fixed argv; capture stderr+`-v` banner.
- [ ] 3.3 GREEN post-process: numbering (`N`,`N.M`) promotes headings by dot depth; mark/omit garbled regions; visible limitations note; deterministic bytes.
- [ ] 3.4 GREEN `convert-pdf [PATH]...`: PATH must be `.pdf` under `docs/`; no PATH=all `*.pdf` there; sources+baseline untouched.

## Phase 4: Governance (one unit)

- [ ] 4.1 Archive old AGENTS.md rule #1 into rollback notes; write five-clause design text verbatim; align #2/#3 semantics; verify zero blanket-ban residue+spec-matching terms.
- [ ] 4.2 Refresh stale `rules.proposal` in `openspec/config.yaml` with design wording; cross-scan AGENTS/config/specs for contradictions.

## Phase 5: Bootstrap+Gate (deps 1–4)

- [ ] 5.1 E2E /tmp copy: bootstrap update=0; tamper fixture=1; add file=2; update=0; admitted `.md` re-run identical.
- [ ] 5.2 Gate A: convert unit-01 PDF; spot-checks — "seguridad"/"conexión" present, garbled ratio below threshold, heading count reported honestly (zero allowed).
- [ ] 5.3 Gate B: owner eyeball review BEFORE update-flow admission; fail=stop; contingencies (custom extractor/pypdf) owner's call.
- [ ] 5.4 Bootstrap real workspace: `update` once (.gitkeep+unit-01)=check0; record Poppler banner; advise periodic `engram export` snapshot.

## Phase 6: Cleanup

- [ ] 6.1 Purge scratch fixtures/stubs; verify commits touched only `scripts/`, `AGENTS.md`, `openspec/`.
