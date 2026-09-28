# Section 05 — Integration verification and gap closure

## Objective

Verify the complete path and close implementation gaps without broad cleanup.

## Verification

Run shared contract, skill-content, service/job/router, wizard/panel, and
existing Vertical Drama synthesis/story-bible focused tests. Run `git diff
--check` and a filtered TypeScript check for changed files. If a test fails,
fix the in-scope root cause using the repository's existing patterns; do not
mask failures with broad mocks.

Check that:

- the best candidate in job status is the candidate sent to create;
- forged client scores/reports cannot pass the server receipt gate;
- old bibles without QC still read and create paths without new receipt remain
  compatible;
- credits are not charged twice and reservations are refunded on error/cancel;
- queue init/close is wired once and no fake series id is used;
- Thai/English UI states all have copy and no status relies only on color;
- the new skill paired files and JSON schemas agree;
- `bible.draftQualityQc` is sanitized and bounded.

Record known repository-wide baseline diagnostics separately. Do not stage,
format, reset, or commit unrelated dirty-worktree changes.

## UI/UX Contract

This is a verification section and does not add a surface. UI fields are N/A;
section 04 owns browser-visible behavior.

### Target User / JTBD
N/A — verification only.

### Existing Pattern Reference
N/A — no UI is changed in this section.

### Surface Inventory
N/A — no UI surface.

### Component Map
N/A — no UI component.

### State Matrix
N/A — state coverage is defined in section 04.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no interactive surface.

### Copy Contract
N/A — localized copy is defined in section 04.

### Browser Evidence Required
N/A — final evidence reports section 04 browser status.

## Implementation notes (2026-08-12)

- Focused QC/shared/skill/job/panel/wizard verification passed; the final
  TypeScript check reports only pre-existing unrelated assembly/BGM and
  hyperframes worker errors, with no diagnostics from the new QC files or the
  modified wizard/router bootstrap paths.
- `git diff --check` is run on the focused implementation/spec files before
  handoff. The repository remains dirty and unrelated user changes were not
  staged, reset, or reformatted.
