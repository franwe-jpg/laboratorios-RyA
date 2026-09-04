# laboratorios — Lab Practice Workspace

Practice repository for laboratory coursework — currently *Auditoría y
Seguridad de Sistemas* (ARyS · IF046 · UNPSJB Trelew).
Exercises, notes, and small scripts live here; official course material
(PDFs) lives in `docs/`.

## Structure

| Path        | Purpose                                                          |
| ----------- | ---------------------------------------------------------------- |
| `docs/`     | Knowledge source: course PDFs + derived Markdown study material. |
| `AGENTS.md` | Standing rules that AI agents must follow here.                  |
| `scripts/`  | Integrity checker and PDF→Markdown tooling (via SDD).            |

## Docs policy (two-tier)

- **Existing** files in `docs/` are immutable: never edit, rename, move,
  or delete them.
- **Adding** new files to `docs/` (e.g., converted Markdown) is allowed,
  but must go through the manifest update flow.
- Reading from `docs/` is always allowed.

Integrity of the folder is enforced deterministically: a SHA-256 manifest
(sorted paths, LF endings) plus a checker script that hard-fails on any
modification/deletion of known files and warns on untracked additions.
See `AGENTS.md` for agent-facing rules and usage.
