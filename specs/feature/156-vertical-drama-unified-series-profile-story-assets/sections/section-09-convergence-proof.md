# Section 09 — Convergence and Proof

## Objective

Close the feature only after focused tests, typecheck, static contract checks,
five-plus review loops, and explicit separation of unperformed browser/provider/
deployment proof.

## Target Files

- `specs/feature/156-vertical-drama-unified-series-profile-story-assets/`
- focused test files touched by sections 01–08
- `implementation/implementation-status.md`

## Tests First

1. Run profile, persistence, router, service, and wizard focused Vitest suites.
2. Run `npm --workspace apps/web run typecheck` and separate baseline noise from
   feature-owned errors.
3. Run section manifest, UI-contract, formatting, and whitespace checks.
4. Run browser proof when the browser harness is available; otherwise record it
   as unperformed, never as passed.
5. Execute at least five adversarial review loops over spec, plan, implementation,
   security/tenant scope, idempotency, UI states, and production boundaries.

## Implementation

- Record each convergence loop with findings, fixes, and remaining proof gaps.
- Re-run tests after every fix and keep the final evidence command/output in the
  implementation status file.
- Verify every spec requirement maps to a code path and a test or documented
  external boundary. Verify no section is marked complete while a block remains.
- Treat provider/API, migration execution, deployment, and real browser proof as
  distinct gates requiring the appropriate runtime; do not infer them from unit
  tests.

## UI/UX Contract

### Target User / JTBD

Trust the final readiness result and know what has actually been verified.

### Surface Inventory

Readiness summary, test/evidence status, and actionable unresolved item list.

### Component Map

FeatureReadinessSummary, EvidenceStatus, UnresolvedItem.

### State Matrix

Verified, partially verified, blocked, external-proof-pending, and failed.

### Responsive Matrix

Summary is readable as a compact list on mobile and a table on desktop.

### Accessibility Acceptance

Expose status in text and maintain heading hierarchy and focus order.

### Copy Contract

Never call an unperformed browser/provider/deployment check “ผ่านแล้ว”.

### Browser Evidence Required

Attach final screenshots or explicitly record the browser boundary as pending.

## Acceptance

- All nine sections have implementation and proof status.
- Five or more review loops produce no remaining in-scope blocking gap.
- Final report distinguishes completed code, focused test proof, and external
  checks not run.
