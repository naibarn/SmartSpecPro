# Code Review: Section 01 — Capability and catalog

**Date:** 2026-08-04

## Triage

The review returned four actionable findings. None requires product input; all
are objective contract/completeness fixes and are being auto-fixed.

### Auto-fix 1 — Complete static fallback parity

Add static fallback definitions/configuration for all target models that are
available from the Kie seed catalog: GPT Image 2, base Nano Banana, Nano Banana
Pro/Edit, and Seedream 5 Pro, in addition to the existing Nano Banana 2 rows.
Keep DB/static metadata aligned without changing the target prompt limits.

### Auto-fix 2 — Structured prompt-budget error metadata

Introduce a typed error carrying `modelId`, `family`, `maxPromptChars`, and
`promptLength` as bounded properties. Include family in the human-readable
message while keeping the prompt body out of the error.

### Auto-fix 3 — Complete parity and precedence tests

Add DB-over-static conflict tests, reference-route context parity, structured
error/no-prompt assertions, complete static target coverage, and a legacy
non-target catalog regression. Keep the existing model budget test suite in the
focused section verification.

### Auto-fix 4 — Reject fractional configured limits

Validate the raw configured numeric value before the existing integer budget
parser floors it. Fractional, non-finite, non-positive, or non-matrix target
limits fail closed.

### Auto-fix 5 — Canonical routing and exact catalog parity

Make the selected canonical model ID the sole capability authority even when a
reference-image route is present. Add the exact `google-nano-banana-pro` Kie
seed upsert and complete Seedream 3/4/4.5/5 Pro static/seed parity. Reset the
static-registry mock between tests and add real-registry route, non-target, and
exact structured-error assertions.

## User interview

Not required. The findings do not change the product behavior selected in the
approved spec: target limits remain GPT Image 2/Nano Banana 20,000 and Seedream
5,000, with target negative omission handled in later sections.
