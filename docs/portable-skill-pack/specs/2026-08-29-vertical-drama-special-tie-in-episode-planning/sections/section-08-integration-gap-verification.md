# Section 08 — Integration, evidence, and gap closure

## Goal

Prove cross-section compatibility and close implementation gaps before handoff.

## Owned files

- integration/focused test additions under existing test directories
- `implementation/ui-browser-evidence.md`
- `implementation/gap-audit-round-{1..5}.md`
- `implementation/usage.md` and final verification notes

## Implementation and verification

- Run focused contracts/migration, service/job, marketplace/media, skill, router, and UI
  suites, then typecheck/lint/build and full `cd apps/web && pnpm test`.
- Check migration state without claiming production execution. Capture browser evidence
  at required viewports if tooling is available; otherwise record skipped checks and the
  exact blocker.
- Review exports/imports, API shapes, DB fields, model isolation, auth, billing, and
  normal-flow non-regression across all sections.
- Perform at least five distinct post-implementation audits: data/API, skill/runtime,
  Marketplace/media security, UI/accessibility/responsive, and regression/operations.
  Record findings, auto-fix all high-confidence must-fix items, rerun affected tests, and
  repeat until no known must-fix gap remains.

## TDD

The integration suite must cover a realistic special creation through prompt-ready output,
retry/stale state, Marketplace reference selection, and the normal episode path in the
same run where feasible.

## Acceptance

All required focused checks pass or have exact documented blockers; five audit files exist;
no known must-fix gap remains; unrelated dirty files are untouched.

## UI/UX Contract

### Target User / JTBD
N/A — verification and evidence section; it validates the UI contracts owned by sections
06–07 rather than adding a new surface.

### Existing Pattern Reference
Reuse the existing browser verification and normal episode regression surfaces.

### Surface Inventory
Special creation dialog, Marketplace Capture picker, special episode workspace, and
normal episode entry regression surface.

### Component Map
N/A — this section coordinates evidence and tests; component ownership remains in 06–07.

### State Matrix
Verify loading, empty, error, success, partial, disabled, hover, focus, and selected.

### Responsive Matrix
Verify mobile 390x844, tablet 768x1024, desktop 1440x900, plus small-mobile 360x800,
laptop 1024x768, and wide-desktop 1280x800 for dense picker/sidebar risk.

### Accessibility Acceptance
Verify keyboard order/focus, labels, semantics, contrast, hidden-control tab order, and
reduced motion; mark unavailable browser tooling as skipped with blocker.

### Copy Contract
Verify Thai-first required labels and English fallback/error copy from sections 05–07.

### Browser Evidence Required
Write `implementation/ui-browser-evidence.md` in the required format; skipped evidence is
not reported as pass.
