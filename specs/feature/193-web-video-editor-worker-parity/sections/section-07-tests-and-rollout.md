# Section 07 — Tests, review, and rollout

## Objective

Prove implementation/spec alignment before enabling each browser or Worker
path, then perform five explicit gap-review passes after implementation.

## Implementation status

Focused shared, browser, UI, and server contract tests pass. Five plan review
rounds and five implementation review rounds are recorded beside this section;
full browser fixture and target-account recovery evidence remain deployment
gates.

## Test scope

- Focused shared Vitest tests for evidence, planner, fingerprints, cut map, and
  contract versions.
- Browser service/component tests for capability, detector gaps, local silence,
  mode UI, state badges, and no-Worker editing.
- Server/job tests for operation mapping, outbox, claim, checkpoint, promotion,
  stale results, and render settlement.
- Playwright fixture (when available) for play/seek/render parity, keyboard
  focus, responsive state, and Worker-required messaging.

## Rollout

Use flags for browser Face Focus, Face + Activity, local Silence Cut,
composition scan, and canonical render. Disable the old side-effecting producer
before enabling its replacement. Rollback preserves canonical IDs/history and
routes new heavy work to the compatibility path.

## Five post-implementation reviews

1. Contract review: shared types, fingerprints, and aliases match spec.
2. Runtime review: browser play/seek and Worker render use one plan/cut map.
3. Reliability review: Feature 186 idempotency, lease, checkpoint, and stale
   fencing are complete.
4. UX/security review: no-Worker editing, accessibility, tenant scope, and
   truthful statuses are complete.
5. Evidence review: focused tests, browser evidence, diff, and rollout gates
   cover every spec acceptance criterion. Fix all safe gaps before completion.

## UI/UX Contract

### Target User / JTBD

Reviewers and creators need evidence that browser play and Worker render remain
consistent across rollout waves.

### Surface Inventory

Feature flags, editor status badges, job monitor, test fixtures, and rollout
evidence report.

### Component Map

Focused tests own contract evidence; editor surfaces own user state; rollout
manifest owns enablement and rollback metadata.

### State Matrix

Flag off preserves legacy behavior; canary exposes provenance; failed gate
blocks enablement; rollback routes new heavy work to compatibility path.

### Responsive Matrix

Operator evidence and editor status remain readable on supported viewport sizes.

### Accessibility Acceptance

Review reports and UI gates include keyboard/focus, contrast, reduced-motion,
and non-color-only checks.

### Copy Contract

Rollout-facing user copy remains concise Thai with English fallback and never
claims Worker success before settlement.

### Browser Evidence Required

Record focused test commands, browser fixture results, feature flag state, and
five review outcomes before marking a wave complete.
