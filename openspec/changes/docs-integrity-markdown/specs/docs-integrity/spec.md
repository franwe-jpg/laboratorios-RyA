# docs-integrity Specification

## Purpose

Detect modification or deletion of files under `docs/` against a persisted SHA-256 baseline; additions enter only through an explicit update flow. An unchanged tree MUST yield a byte-identical manifest, so mismatches mean tampering only.

## Requirements

### Requirement: Manifest Coverage

The system MUST compute a SHA-256 manifest over every regular file under `docs/`, keyed by forward-slash relative path. Dotfiles like `.gitkeep` count as regular files; directories and symlinks do not.

#### Scenario: Full coverage

- GIVEN `docs/` holds `.gitkeep` and `unidad-01-conceptos-de-seguridad.pdf`
- WHEN a manifest is generated
- THEN it has exactly one entry per regular file with its hash

#### Scenario: Empty directory

- GIVEN `docs/` contains only `.gitkeep`
- WHEN a manifest is generated
- THEN it has exactly that single entry

### Requirement: Manifest Determinism

Serialization MUST be byte-reproducible across runs and environments (locale, timezone, working directory): entries sorted by relative path ascending bytewise, LF line endings, lowercase hex hashes; no timestamps or environment-derived values.

#### Scenario: Repeated generation on unchanged tree

- GIVEN an unchanged tree
- WHEN the manifest is generated twice
- THEN outputs are byte-identical

### Requirement: Baseline Persistence via Engram

The baseline MUST persist as one observation titled `docs-integrity/manifest`, read and written through the `engram` CLI. Store unreachability, missing baseline, or unparseable content are operational errors — never tampering evidence.

#### Scenario: Stored baseline retrievable

- GIVEN the update flow persisted a baseline
- WHEN retrieval requests title `docs-integrity/manifest` via the `engram` CLI
- THEN exact canonical content returns

#### Scenario: Missing engram CLI

- GIVEN the `engram` executable is unavailable
- WHEN verification runs
- THEN exit 3 names the missing dependency

#### Scenario: Corrupted baseline observation

- GIVEN stored baseline content cannot be parsed into path-to-hash entries
- WHEN verification runs
- THEN exit 3 reports corruption, never an integrity-failure verdict

### Requirement: Checker Outcomes and Exit Codes

Verification MUST exit `0` when all tracked files match and none are untracked; `1` when any tracked file was modified or deleted; `2` as warning when untracked regular files exist with tracked intact; `3` for operational errors preventing verification. Hard failure outranks warning. Messages MUST name each offending path (expected vs actual hash; deletions marked), classify the outcome, and point untracked files to the update flow.

#### Scenario: Clean tree succeeds

- GIVEN all tracked files match and none are untracked
- WHEN the checker runs
- THEN it exits 0

#### Scenario: Modified known file fails hard

- GIVEN any tracked file's bytes changed
- WHEN the checker runs
- THEN it exits 1 listing expected vs actual hashes

#### Scenario: Deleted known file fails hard

- GIVEN a tracked file absent from `docs/`
- WHEN the checker runs
- THEN it exits 1 reporting that path as deleted

#### Scenario: Untracked file warns

- GIVEN a new regular file absent from the baseline, tracked intact
- WHEN the checker runs
- THEN it exits 2 naming the file and pointing to the update flow

#### Scenario: Tamper plus addition reports both

- GIVEN one tracked file modified AND one untracked addition
- WHEN the checker runs
- THEN both findings appear and the process exits 1

### Requirement: Update Flow Semantics

An explicit update command MUST recompute the manifest and replace the persisted baseline. It MUST refuse when any previously tracked file was modified or deleted, leaving the old baseline untouched. Multiple new files MAY be admitted in one run; no-op runs replace it byte-identically.

#### Scenario: Admit several new files at once

- GIVEN two converted Markdown files untracked and all tracked files match
- WHEN the update flow runs once
- THEN the baseline includes both and subsequent checks exit 0

#### Scenario: Refuse rebaselining over tamper

- GIVEN a tracked file's bytes differ from the baseline
- WHEN the update flow runs
- THEN it aborts non-zero without replacing the baseline
