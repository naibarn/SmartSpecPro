# Section 09 — Verification, migration, and rollout

## Objective

Integrate all runtime sections and prove release readiness without overstating
browser, Windows, deployment, or production evidence.

## Files and ownership

- Add/update focused test manifests and migration rehearsal tests.
- Update implementation completion/review documentation in this feature
  directory.
- Add feature-flag/rollback notes where current rollout conventions require.

## Required checks

- Focused Vitest and Rust tests for all changed contracts and adapters.
- Migration journal/schema consistency and rollback rehearsal.
- Golden/determinism, lease/chaos, security/tenant, and performance corpus.
- Browser evidence for save conflict, capability states, degraded review,
  render/QC, artifact commit, and legacy rollback.
- Windows Worker evidence only after real executor/capability exists.

## Acceptance

All section tests pass; no unresolved MUST_FIX item; all unsupported features
have a visible capability/release gate; completion documents distinguish local
tests from external runtime proof.

## UI/UX Contract

### Target User / JTBD
Release owner needs evidence that user-visible runtime states are truthful.

### Surface Inventory
Authenticated browser evidence matrix, rollout flag, rollback route, and
completion/review records.

### Component Map
Test suites produce proof; Web evidence captures UI; rollout docs classify gates.

### State Matrix
Pass, blocked, unsupported, degraded, rollback, and external-proof-pending.

### Responsive Matrix
Evidence must cover mobile, tablet, laptop, and desktop where UI is changed.

### Accessibility Acceptance
Browser evidence includes keyboard, focus, live status, contrast, and reduced
motion checks.

### Copy Contract
Completion records distinguish tested, manually verified, and not proven.

### Browser Evidence Required
Authenticated browser artifacts plus explicit Windows/deployment/production
status; never infer those from unit tests.
