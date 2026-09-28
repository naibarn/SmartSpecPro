# Section 06 — Migration and Release Gates

**Objective:** Safely connect legacy Credits/reservation/revenue paths and make
  rollout evidence explicit.

**Files:** compatibility adapters/tests, migration verification script or test,
release-gate documentation under this spec package and `orchestra/` progress.

**Tests first:** feature-off behavior; legacy read/write compatibility; repeatable
backfill; dry-run reconciliation; rollback metadata; absence of retired-system
callers.

**Implementation contract:** compatibility is additive and reversible; no
legacy data is deleted; production activation requires provider certification,
financial reconciliation and rollback drill evidence.

**Acceptance:** focused checks pass and remaining external gates are recorded
with exact evidence requirements rather than marked complete.

## UI/UX Contract

### Target User / JTBD
N/A; release tooling is not user-facing.
### Surface Inventory
N/A; no new route or visual surface.
### Component Map
N/A; release checks and adapters only.
### State Matrix
N/A; reports distinguish pass/blocked/unverified.
### Responsive Matrix
N/A; no layout changes.
### Accessibility Acceptance
N/A; no interactive UI.
### Copy Contract
Gate reports use explicit localizable status names.
### Browser Evidence Required
N/A; external browser proof belongs to owning feature.
