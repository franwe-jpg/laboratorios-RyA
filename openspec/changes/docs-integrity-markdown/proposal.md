# Proposal: docs/ Integrity + Markdown Pipeline

## Intent

docs/ has a blanket mutation ban: no integrity evidence, no sanctioned adds. Replace it with two tiers — existing files byte-immutable; additions pass a deterministic SHA-256 manifest.

**Motivation**: course material is trusted input for every future agent session. Any agent-side modification of a file under docs/ must be reliably detectable after the fact by comparing freshly computed SHA-256 hashes against a previously recorded manifest. Determinism is a hard requirement, not a nicety: the same unchanged tree must always produce a byte-identical manifest, so a hash mismatch can only mean real tampering — never reordering, timestamps, or locale noise causing false positives.

## Scope

### In Scope

- SHA-256 manifest over all regular files in docs/: sorted relative paths, LF endings, byte-reproducible; no timestamps, locale formats, absolute paths.
- Checker under scripts/: tampered/deleted known file → hard failure; untracked file → distinct warning exit inviting update flow; full match → success 0.
- Explicit manifest update command for legitimate additions.
- Generic PDF→Markdown converter under scripts/: any docs/*.pdf → sibling .md inside docs/; study-grade fidelity; tables/images may degrade; zero code changes per new PDF.
- AGENTS.md rule #1 rewritten: existing immutable; add via update flow only; run checker after bulk operations; report failures, never regenerate PDFs.
- Refresh stale `rules.proposal` line in openspec/config.yaml.

### Out of Scope

Git hooks/CI, signing beyond SHA-256, auto-restoring corrupted files, README.md creation.

## Capabilities

### New Capabilities

- `docs-integrity`: manifest determinism, checker outcomes, update flow.
- `pdf-to-markdown`: conversion behavior, output location, fidelity target.
- `docs-governance-policy`: agent rules codified in AGENTS.md.

### Modified Capabilities

None — openspec/specs/ is empty.

## Approach

Python 3.12 stdlib-only: one CLI under scripts/ with check / update / convert-pdf subcommands. Hash baseline persists in the Engram store (SQLite, owner decision): one dedicated observation titled `docs-integrity/manifest`, read and written through the `engram` CLI (v1.20.0 verified installed); `engram export` gives a portable JSON snapshot when needed. If unit-01 readability fails, propose a vetted library (owner approval). PDF/.gitkeep untouched.

## Proposal Question Round

Owner decisions already locked (no longer open):

1. Baseline persisted in Engram SQLite store via `engram` CLI (owner decision).
2. Stdlib converter preferred; library needs approval.
3. Exit codes fixed at spec.

## Affected Areas

- `AGENTS.md` — modified: rule #1 → two-tier policy
- `scripts/` — new: integrity CLI + converter
- Engram store — new observation: `docs-integrity/manifest` baseline
- `openspec/config.yaml` — modified: stale rule refreshed
- `docs/*.md` — new via flow: generated notes

## Risks

- Extraction below study-grade (Medium): validate on unit-01; library choice at design.
- Old ban keeps blocking agents (Medium): ship AGENTS.md + config.yaml together.
- Warnings ignored (Low): distinct exit code pointing at update flow.
- Baseline coupled to Engram store (Low): losing it breaks verification until re-baseline; mitigate with periodic `engram export` snapshots.

## Rollback Plan

No git repo: archive pre-edit AGENTS.md rule #1 text here first. Revert = restore that text, undo config.yaml line, delete scripts/ plus manifest. docs/ gains only flow-approved files; PDF/.gitkeep untouched throughout.

## Dependencies

Python 3.12 stdlib only.

## Success Criteria

- [ ] Byte-identical manifests across repeated runs on unchanged trees.
- [ ] Tamper → failure exit; untracked → warning exit; clean → 0.
- [ ] Update flow admits converted .md; checker then exits 0.
- [ ] Unit-01 PDF converts readably; future PDFs need no code changes.
- [ ] AGENTS.md reflects policy; PDF/.gitkeep byte-identical afterward.
