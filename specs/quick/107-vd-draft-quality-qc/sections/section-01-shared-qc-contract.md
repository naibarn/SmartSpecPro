# Section 01 — Shared QC contract and deterministic score engine

## Objective

Create a dependency-free shared contract for Draft QC so client, server, and
skill integration use one vocabulary. The server must be the only authority for
weighted scores and automatic pass.

## Files

- Add `apps/web/shared/verticalDramaSeries/draftQualityQc.ts`.
- Add `apps/web/shared/verticalDramaSeries/__tests__/draftQualityQc.test.ts`.
- Update the shared barrel only when needed by existing import conventions.

## Required behavior

Implement the eight approved criteria and weights from `request.md`. Provide
Zod schemas/types for raw judge criteria, computed breakdown, critical failures,
history entries, job status/progress, credit estimate, and server receipt.

Pure helpers must:

1. normalize/clamp a valid raw score only within the declared range;
2. reject duplicate or missing criterion ids;
3. compute each weighted criterion and total from raw scores;
4. produce `passed` only at 9.0 or higher with no critical fail;
5. distinguish strong-but-blocked from needs-work;
6. select a best candidate deterministically and never prefer a lower score;
7. compare candidate fingerprints without trusting UI-provided score fields;
8. bound round choices to 0, 1, 2, 3, 5, or 10 and provide a default.

Preserve compatibility by making all persisted QC fields optional and by keeping
legacy draft/series types valid.

## TDD

Write tests first for weight totals, score math, hard gates, tie-breaking,
round normalization, malformed criteria, and legacy absence.

## Completion evidence

Focused shared tests pass and `git diff --check` reports no whitespace errors.

## UI/UX Contract

This section is a non-visual shared contract. UI fields are N/A here because
the user-facing panel is owned by section 04; the exported status/breakdown
shapes are its interface.

### Target User / JTBD
N/A — shared logic only.

### Existing Pattern Reference
N/A — no UI is changed in this section.

### Surface Inventory
N/A — no UI surface.

### Component Map
N/A — no UI component.

### State Matrix
N/A — represented by shared status enums consumed by section 04.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no interactive surface.

### Copy Contract
N/A — localized copy is owned by section 04.

### Browser Evidence Required
N/A — focused contract tests are the evidence for this section.
