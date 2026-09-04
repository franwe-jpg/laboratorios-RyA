# docs-governance-policy Specification

## Purpose

Codify the two-tier immutability policy for `docs/` in `AGENTS.md` and keep workspace configuration consistent with it, so agents follow the integrity system instead of the superseded blanket mutation ban.

## Requirements

### Requirement: AGENTS.md Rule #1 Content Contract

Rewritten rule #1 MUST state, in neutral professional English, all of:

1. Existing files under `docs/` are never edited, renamed, moved, or deleted.
2. Adding files is permitted only through the manifest update flow.
3. Agents run the integrity checker after bulk file operations.
4. Integrity failures are reported immediately and never auto-fixed by mutating `docs/`.
5. Course PDFs are never regenerated or "fixed" to make verification pass.

It MUST NOT retain wording implying that no change under `docs/` may ever occur, and its terminology MUST align with the docs-integrity specification.

#### Scenario: Content contract satisfied

- GIVEN the rewritten rule #1
- WHEN reviewed against this list
- THEN all five clauses appear and no blanket-ban wording remains

#### Scenario: Terminology consistency

- GIVEN the rewritten rule #1 and the docs-integrity spec
- WHEN compared
- THEN policy terms (update flow, checker, baseline) refer to the same behaviors

### Requirement: Agent Obligations

Agents operating in this workspace MUST: run the checker after any bulk operation affecting `docs/`; report hard failures and operational errors to the owner immediately; treat warnings (untracked files) as invitations to use the update flow, not as license to bypass it; and never delete, restore, or regenerate files under `docs/` to force a passing result.

#### Scenario: Bulk operation triggers check

- GIVEN an agent completed a bulk copy sanctioned by the update flow
- WHEN the operation finishes
- THEN the agent runs the checker and reports its outcome

#### Scenario: Hard failure escalates, not self-heals

- GIVEN the checker exits 1 after an operation
- WHEN the agent responds
- THEN it reports the failing paths to the owner and performs no further writes under `docs/`

### Requirement: Configuration Consistency Refresh

The stale `rules.proposal` entry forbidding all changes under `docs/` MUST be refreshed in `openspec/config.yaml` during this same change so it reflects the two-tier policy. After the change, `AGENTS.md`, `openspec/config.yaml`, and the specs MUST NOT contradict one another regarding `docs/` mutability.

#### Scenario: Proposal rules updated in lockstep

- GIVEN the config refresh task executes
- WHEN `rules.proposal` is read
- THEN additions via the update flow are recognized as sanctioned and only unsanctioned edits remain forbidden

#### Scenario: Cross-document consistency holds

- GIVEN the updated `AGENTS.md`, `openspec/config.yaml`, and specs ship together
- WHEN scanned for contradictions about `docs/`
- THEN no document states a mutability rule incompatible with the two-tier policy
