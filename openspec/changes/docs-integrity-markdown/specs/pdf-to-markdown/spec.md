# pdf-to-markdown Specification

## Purpose

Provide a generic converter that turns any PDF under `docs/` into a study-grade Markdown sibling inside `docs/`, so reading notes live next to source material without the source ever being touched.

## Requirements

### Requirement: Conversion Scope and Output Location

The converter MUST convert every `*.pdf` file under `docs/`, writing output to a sibling Markdown file with the same stem in the same directory. It MUST NOT modify the source PDF or any pre-existing file, and it MUST work for future PDFs without per-file code or configuration changes.

#### Scenario: Baseline unit converts

- GIVEN `unidad-01-conceptos-de-seguridad.pdf` exists under `docs/`
- WHEN conversion runs
- THEN `unidad-01-conceptos-de-seguridad.md` is created beside it and the source PDF is byte-identical to before

#### Scenario: Future PDF needs no code changes

- GIVEN a second, previously unseen PDF has been added through the update flow
- WHEN conversion runs
- THEN its sibling `.md` is produced using the same generic behavior

### Requirement: Fidelity Target

Output MUST target human study and reading quality: recognizable heading structure and readable paragraph text. Tables and images MAY degrade or be omitted; losslessness is explicitly NOT promised. When a region cannot be extracted meaningfully, the converter SHOULD mark or omit it rather than emit garbled filler, and SHOULD record extraction limitations visibly in the output.

#### Scenario: Study-grade readability on unit material

- GIVEN the unit-01 PDF converted successfully
- WHEN the generated Markdown is inspected
- THEN it contains heading structure and coherent paragraphs suitable for study use

#### Scenario: Degradable content does not promise fidelity

- GIVEN a page whose tables or figures resist text extraction
- WHEN conversion completes
- THEN such regions are degraded, marked, or omitted without breaking overall readability

### Requirement: Deterministic Re-runs

Converting an unchanged PDF twice MUST produce byte-identical Markdown: no timestamps or environment-derived content. Re-running conversion MAY overwrite only its own previously generated sibling `.md`.

#### Scenario: Repeated conversion is stable

- GIVEN the same unchanged PDF
- WHEN conversion runs twice
- THEN both outputs are byte-identical

#### Scenario: Re-run over already-converted PDF

- GIVEN a PDF whose sibling `.md` was already generated
- WHEN conversion runs again
- THEN the existing `.md` is replaced in place, no duplicate file appears, and the source PDF remains untouched

#### Scenario: Re-run after baseline admission stays green

- GIVEN a converted `.md` has been admitted to the integrity baseline and the PDF is unchanged
- WHEN conversion runs again
- THEN the regenerated `.md` is byte-identical and a subsequent checker run exits 0

### Requirement: Interaction with Integrity Update Flow

Conversion itself MUST NOT update the integrity baseline. Between conversion and admission, the generated `.md` is untracked and checks exit 2; after the update flow admits it, checks exit 0.

#### Scenario: Converted file is untracked until admitted

- GIVEN a freshly converted `.md` that is not yet in the baseline
- WHEN the checker runs
- THEN it exits 2 naming the new `.md`

#### Scenario: Admission closes the loop

- GIVEN the untracked converted `.md`
- WHEN the update flow runs and the checker re-runs
- THEN the checker exits 0 with the `.md` tracked
