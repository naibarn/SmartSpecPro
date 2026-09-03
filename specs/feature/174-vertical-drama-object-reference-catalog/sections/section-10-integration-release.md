# Section 10 — Integration and Release

## Goal

Prove Feature 174 end to end and keep the completion claim honest.

## Implementation and proof

- Add integration tests for migration/legacy parity and owner isolation.
- Add browser flow for catalog create/import, local/Library/History drop, shot
  review/remove/reset, Special commercial binding, and optional failure.
- Run focused Vitest with jsdom where needed, targeted typecheck, `git diff
--check`, and Vite build.
- Verify provider-cap and managed-media fixtures without paid production work.
- Produce a release matrix for the four capability keys, migration dry-run/apply,
  rollback/disable, browser proof, live provider proof, and deployment proof.

## Tests first

The integration tests are the section's first implementation artifact. Browser
and live runtime gates must be marked separately when unavailable.

## Ownership and acceptance

Own integration/release tests and completion documentation. Fix defects in the
responsible earlier section rather than hiding failures in this section.

## UI/UX Contract

### Target User / JTBD

Release owner needs evidence that the creator flow is usable and optional
failures do not block production.

### Surface Inventory

Browser smoke flow, capability matrix, migration report, and release checklist.

### Component Map

The browser flow covers catalog, picker, storyboard, and Special dialog owners;
this section only coordinates proof.

### State Matrix

The release evidence must include loading, empty, success, warning, conflict,
archived, and disabled capability screenshots or assertions.

### Responsive Matrix

Run desktop and a narrow viewport smoke check; record unavailable viewport proof
instead of implying full responsive coverage.

### Accessibility Acceptance

Browser evidence includes keyboard operation, focus visibility, labelled drop
fallback, and readable non-color statuses.

### Copy Contract

Release assertions use the Thai-first labels and English fallback from section
8 and reject raw/internal error strings.

### Browser Evidence Required

Record owner-scoped create/import/drop, shot review, Special binding, and
non-blocking failure with route/build/runtime details.

## Implementation Record

Focused Feature 174/continuity Vitest (45 tests), followed by browser-facing
focused Vitest with jsdom (86 tests), targeted TypeScript, `git diff --check`,
section/UI contract checks, and Vite production build passed. A full repository Vitest run
was attempted but produced broad unrelated/environment failures and stalled;
it is documented in audit round 5 and is not used as Feature 174 evidence.
Twelve post-implementation audits are recorded under `implementation/reviews/`;
local migration, report/apply backfill, and unauthenticated browser smoke
evidence are recorded separately. Authenticated browser and live provider proof
remain explicit environment gates; no legacy candidates were found in the local
database.
