# Implementation Loop (Codex)

Per-section execution workflow for `deep-implement`.

## Overview

For each `section-NN-*` in manifest order:

1. Read section requirements
2. Define minimal implementation slice
3. Write/adjust tests first (red)
4. Implement minimal code (green)
5. Run regression subset
6. Stage + review + fix

## Step Details

### 1) Read Section File

Read:
- `sections/section-NN-*.md`
- relevant entries in `implementation-plan.md`
- matching test intent in `implementation-plan-tdd.md`

Extract:
- required behavior
- files to create/modify
- acceptance criteria

### 2) Define Minimal Slice

Before coding, write a short checklist for this section:
- tests to add/update
- production files to touch
- done criteria

### 3) Tests First (Red)

Add tests based on section TDD guidance.

Run targeted tests and confirm failures are expected.

### 4) Implement (Green)

Implement the smallest change set that satisfies tests.

Keep scope constrained to current section objective.

### 5) Validate

Run:
- targeted tests for touched area
- quick regression subset for nearby behavior

If failures persist after 3 focused attempts, stop and ask user whether to:
- `debug` = continue debugging
- `skip` = skip current section
- `pause` = pause workflow

### 6) Stage for Review

Stage all section changes:

```bash
git add -u
git add <new_files_if_any>
```

Proceed to `code-review-protocol.md`.
