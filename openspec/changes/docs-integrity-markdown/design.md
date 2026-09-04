# Design: docs/ Integrity + Markdown Pipeline

## Technical Approach

One stdlib-only Python 3.12 CLI (`scripts/docs_guard.py`) exposing `check`, `update`, `convert-pdf`. The integrity layer serializes a byte-reproducible SHA-256 manifest over every regular file under `docs/` and compares it against a baseline stored as one Engram observation titled `docs-integrity/manifest`, accessed through the verified `engram` CLI (v1.20.0). The converter shells out to the verified system binary `/usr/bin/pdftotext` (Poppler) through a thin wrapper module and post-processes its UTF-8 text into Markdown. Governance texts land in `AGENTS.md` and `openspec/config.yaml` in the same change. Implements specs: docs-integrity, pdf-to-markdown, docs-governance-policy.

## Architecture Decisions

### Decision: Canonical manifest serialization

**Choice**: UTF-8 bytes. Line 1: `docs-integrity-manifest v1\n`. Then one line per file: `<lowercase-64-hex><single ASCII space><relpath>\n`. Relpath is forward-slash, relative to `docs/`, sorted ascending by UTF-8 byte order (`str` sort ≡ UTF-8 byte order; encode explicitly anyway). LF everywhere including after the final entry; no timestamps or environment-derived values.
**Alternatives**: coreutils `sha256sum -c` format (two-space separator + text/binary marker ambiguity); JSON manifest (key-order and escaping pitfalls).
**Rationale**: fixed-width hash + one separator parses unambiguously even for filenames with spaces (`split(" ", 1)`); version header makes corruption triage trivial; pure byte-level determinism satisfies Manifest Determinism.
Edge: filenames containing LF or CR cannot be represented → scanner aborts exit 3 naming the path (it can never be baselined safely).

### Decision: Baseline persistence & retrieval via engram CLI

Verified empirically this session (probe observation created, inspected, deleted):

| Need | Verified mechanism |
|---|---|
| Write/upsert | `engram save "docs-integrity/manifest" "<blob>" --type architecture --project open-code --scope project --topic docs-integrity/manifest` |
| Read | `engram export <tmp.json>` → parse JSON → filter `observations[]` where `project=="open-code"` AND `title=="docs-integrity/manifest"` → take max(`id`) → use `content` verbatim |
| Failure | engram absent / non-zero exit / invalid JSON / zero matches / blob unparseable → exit 3 |

**Choice**: upsert through `--topic` (v1.20.0 supports it — corrects earlier env facts; probe confirmed same-id in-place update on repeated save). Reads use `export` JSON, never `search` (human-formatted output, preview truncation). Title and topic are pinned identical so exactly one live observation exists; max(`id`) deterministically disambiguates any legacy duplicates.
**Rationale**: export is structured and full-content; store unreachability, missing baseline (empty match set), and unparseable blobs are operational errors mapped to exit 3, never tampering verdicts.

### Decision: CLI surface

| Command | Behavior |
|---|---|
| `check [--project NAME] [--format human\|json]` | exits 0/1/2/3 per spec precedence; names each offending path (expected vs actual hash; deletions marked); points untracked files to `update`; classifies outcome |
| `update [--project NAME]` | recomputes manifest, replaces baseline; refuses exit 1 leaving old blob untouched if any tracked file was modified/deleted; admits multiple new files at once; no-op run rewrites byte-identically |
| `convert-pdf [PATH]...` | PATH must be `.pdf` under `docs/`; no PATH converts every `*.pdf` under `docs/`; writes sibling `<stem>.md`; never touches sources; pdftotext missing/unusable or non-zero exit → operational exit 3 |

`--project` defaults to `open-code` and is always passed explicitly so cwd changes or folder renames cannot redirect the store. Conversion does not update the baseline (spec: converted `.md` stays untracked → check exits 2 until admitted).

### Decision: Module layout & error taxonomy

```
scripts/
├── docs_guard.py        # thin entrypoint: argv dispatch only
└── docsguard/
    ├── manifest.py      # scan docs/, serialize/parse/compare
    ├── store.py         # engram subprocess wrapper (save/export/filter)
    ├── checker.py       # outcome classification + exit codes
    ├── pdftext.py       # /usr/bin/pdftotext subprocess wrapper + MD post-process
    └── cli.py           # subcommands + messaging
scripts/tests/           # stdlib unittest suite
```

| Outcome class | Exit | Precedence |
|---|---|---|
| Tracked file modified/deleted (any untracked also reported) | 1 | highest verdict |
| Untracked regular files, tracked intact | 2 | warning |
| Operational: engram missing/failing, pdftotext missing/unusable, missing/unparseable baseline, LF filename | 3 | short-circuits before comparison |
| Clean | 0 | — |

Scanner covers dotfiles (regular files only), excludes directories/symlinks (`lstat`), never follows links. Subprocess safety (engram + pdftotext): fixed argv lists, `shell=False`, only paths — never file contents — interpolated into commands, captured stdout/stderr, 30 s timeout.

### Decision: PDF extraction strategy (owner-revised)

Unit-01 inspected: PDF 1.4, 46 FlateDecode streams, 9 Type0 fonts each carrying a ToUnicode CMap, no encryption, classic xref table — facts that made a hand-written parser feasible but do not justify owning one.

| Option | Tradeoff | Verdict |
|---|---|---|
| (a) stdlib naive (no CMap decode) | simple but emits mojibake for accented Spanish through Type0 fonts | rejected |
| (b) subprocess `/usr/bin/pdftotext` (Poppler, verified installed) | battle-tested Type0/CMap handling, zero owned extraction code; external binary becomes version-pinned dependency | **primary** |
| (c) custom stdlib extractor (~400 lines: zlib streams, BT/ET/Tj/TJ, ToUnicode bfchar/bfrange, WinAnsi/Differences, font-size headings) | deterministic by construction but large unmaintained surface | documented contingency; activation is an owner decision |
| (d) pypdf library | best fidelity, third-party install | documented contingency; requires explicit owner approval (locked decision #2) |

**Wrapper contract** (`docsguard/pdftext.py`): run `pdftotext -enc UTF-8 -q <pdf> <tmp>` with fixed argv, `shell=False`, timeout, captured stderr. Binary absent/unusable or non-zero exit → exit 3 (operational error), never exit 1 and never a tamper verdict.

**Determinism**: converter output is a pure function of (PDF bytes × Poppler version). The wrapper captures the first `pdftotext -v` banner line and attaches it to each conversion report so runs are attributable; after any Poppler upgrade, re-run the validation gate before trusting prior conversions. Converted `.md` stays untracked until admitted via `update`, so cross-version drift surfaces as exit 2, never silent tamper.

**Structuring limits (stated plainly)**: plain pdftotext output carries no font-size or outline metadata (`-layout` adds only whitespace fidelity, no semantics). Markdown headings are therefore formed textually: lines matching section numbering (`N`, `N.M`, …) promote to `#`/`##`/… by dot depth; other short standalone lines remain body text. Structure fidelity is intentionally weaker than contingency (c)'s font-size heuristics — accepted tradeoff.

**Validation gate at apply (retained)**: convert unit-01 → automated spot-checks — accented tokens ("seguridad"/"conexión") present; garbled-character ratio below threshold; ≥1 heading candidate from the numbering heuristic (zero reported honestly, feasibility-limited); plus owner eyeball review. Gate fails → stop and lay out contingencies (c)/(d); switching strategy is the owner's call, pypdf additionally needs install approval. Limitations recorded visibly in output per Fidelity Target (tables/images MAY degrade).

### Decision: Governance text refresh

Exact replacement texts in Interfaces below ship together so AGENTS.md, config.yaml, and specs stay mutually consistent (governance spec requirement).

## Data Flow

```
docs/*.pdf ──convert-pdf──▶ docs/<stem>.md ──(untracked)──▶ check ─▶ exit 2
                                                                    │
docs tree ──scan+sha256──▶ manifest blob ──update──▶ engram store ◀─┘ admitted
                                   │                    │
                                   └──check── compare ◀─┘ ──▶ 0 clean / 1 tamper / 3 operational
```

`check`: read baseline (export JSON) → classify store errors (exit 3) → scan+hash tree → diff tracked (modified/deleted → 1 candidates) and untracked (→ 2 candidates) → report both classes when mixed, exit by precedence.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/docs_guard.py` | Create | executable entrypoint (argv dispatch) |
| `scripts/docsguard/{manifest,store,checker,pdftext,cli}.py` | Create | modules as laid out above |
| `scripts/tests/*_test.py` | Create | unittest suites (hermetic: temp dirs + isolated `ENGRAM_DATA_DIR`) |
| `AGENTS.md` | Modify | replace rule #1 (text below); keep rules #2/#3 semantics aligned |
| `openspec/config.yaml` | Modify | refresh stale `rules.proposal` line |

Nothing under `docs/` is created, edited, or deleted by implementation code; generated `.md` files enter only via owner-run flow afterward.

## Interfaces / Contracts

Manifest bytes (canonical example):

```
docs-integrity-manifest v1
<64-hex> .gitkeep
<64-hex> unidad-01-conceptos-de-seguridad.pdf
```

Replacement AGENTS.md rule #1 (five-clause contract, neutral English):

> 1. **Existing files under `docs/` are immutable.** Never edit, rename, move, or delete any file already present there; reading is always allowed.
> 2. **Adding files requires the update flow.** New files may be created under `docs/` only through the sanctioned manifest update flow (`python3 scripts/docs_guard.py update`), which admits them into the integrity baseline.
> 3. **Run the checker after bulk operations.** After any operation affecting multiple files under `docs/`, run `python3 scripts/docs_guard.py check` and report its outcome.
> 4. **Integrity failures are reported, never self-healed.** If the checker reports tampering (exit 1) or an operational error (exit 3), notify the owner immediately and perform no further writes under `docs/`.
> 5. **Course PDFs are never regenerated or "fixed"** to make verification pass.

Config.yaml `rules.proposal` replacement line:

```yaml
    - Existing files under docs/ are immutable course material; additions enter only via the sanctioned integrity update flow (see AGENTS.md)
```

## Testing Strategy

RED tests first (unittest, hermetic fixtures; store tests use isolated `ENGRAM_DATA_DIR`):

| Layer | What to Test | Approach |
|---|---|---|
| Unit | serialization determinism (double-run byte-equal), parse round-trip, sort/case/LF rules | temp trees, golden bytes |
| Unit | outcome classification incl. tamper+addition → exit 1 reporting both; refusal-to-rebaseline leaves old blob untouched | fake manifests |
| Integration | engram mapping: missing binary → 3; empty store → 3 (missing baseline); corrupted blob → 3; save/export round-trip via real CLI against temp data dir | subprocess to `/tmp` data dir |
| Integration | converter: missing/unusable pdftotext → 3 (binary path injectable for tests); convert twice → byte-identical; sibling overwrite in place; source PDF hash unchanged; converted `.md` untracked (2) then admitted → 0 | unit-01 + synthetic PDFs + stub binaries |
| E2E | full loop on workspace copy: bootstrap `update` → `check` 0 → tamper fixture → 1 → add file → 2 → `update` → 0 | scripted scenario |

## Threat Matrix

| Boundary | Applicability | Reason / Design response |
|---|---|---|
| Documentation-like paths | N/A | No executable docs classification; docs files are read/hashed only |
| Git repository selection | N/A | Tool never invokes git. Environment fact corrected: the workspace IS a git repo (master, zero commits), kept per owner decision; used only for apply-phase work-unit commits |
| Commit state | N/A (tool) | No commit automation inside `docs_guard.py`; apply-phase work-unit commits are orchestration convention covering `scripts/`, `AGENTS.md`, `openspec/` only — never anything under `docs/` |
| Push state | N/A | No git automation |
| PR commands | N/A | No PR automation |

Real process boundaries are two subprocesses — engram and `/usr/bin/pdftotext`: both covered by the shared safety contract (fixed argv lists, `shell=False`, timeout, captured output) and RED-tested (missing/unusable binary maps to exit 3, never traceback, never exit 1).

## Migration / Rollout

Bootstrap order at apply: land code → run `update` once (creates initial baseline over `.gitkeep` + unit-01 PDF) → `check` exits 0 → run validation gate on converter. Rollback: restore archived prior rule #1 text, revert config.yaml line, delete `scripts/`, delete baseline observation via `engram delete`. Mitigate store loss with periodic `engram export` snapshots (proposal risk). Environment assumption (corrected, authoritative): the workspace IS a git repository (master branch, zero commits) and the owner keeps it; the apply phase plans work-unit commits — guard core, converter, governance texts, and tests as separate units — staging only `scripts/`, `AGENTS.md`, and `openspec/`, never anything under `docs/`. Rollback gains `git revert` alongside manual restoration.

## Open Questions

None blocking. Contingencies (custom stdlib extractor; pypdf) are documentation-only escape hatches: either activates solely if the apply-phase validation gate fails, and both remain the owner's call (pypdf additionally requires install approval).
