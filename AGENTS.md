# AGENTS.md — Rules for AI Agents in This Workspace

## Purpose

Personal practice workspace for laboratory coursework — currently *Auditoría
y Seguridad de Sistemas* (ARyS · IF046 · UNPSJB Trelew), and, going forward,
any other lab-based coursework kept in this workspace. Course-provided PDF
material lives under `docs/` and is treated as immutable input.

## Hard rules

1. **Never modify `docs/`.** Do not create, edit, rename, move, or delete
   any file under `docs/` (except the `.gitkeep` placeholder). Reading from
   `docs/` is always allowed.
2. **Never regenerate or "fix" course PDFs** to make an integrity check
   pass. If verification fails, report it to the owner instead.
3. If a task seems to require changing `docs/`, stop and ask the owner.

## Docs integrity mechanism

`docs/` is protected by a deterministic SHA-256 manifest check:

- A manifest records the hash of every file in `docs/`, sorted by path, with
  LF line endings, so results are byte-for-byte reproducible on every run.
- A checker script recomputes hashes from the current folder contents and
  compares them against the manifest, exiting non-zero on any mismatch.

Agents must run the checker after any bulk file operation and report
failures immediately. The implementation lands under `scripts/` via SDD;
see `README.md`.

## Conventions

- Technical artifacts (code, comments, commit messages) in English.
- Conventional commits; no AI attribution lines.
