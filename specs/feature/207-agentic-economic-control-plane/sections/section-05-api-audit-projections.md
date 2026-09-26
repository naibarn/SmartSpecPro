# Section 05 — API, Audit and Projections

**Objective:** Expose safe tenant-scoped economic reads and controls and produce
data contracts for later Finance and workflow UI surfaces.

**Files:** create `apps/web/server/routers/economicControlPlane.ts`; add tests;
use existing auth/router/audit conventions; do not create a new UI design here.

**Tests first:** authenticated tenant isolation; payload override rejection;
redaction; intent preview/approval; hold/settlement read; freeze/emergency
control; audit actor/policy/idempotency correlation.

**Implementation contract:** every mutation derives authority from server
context, validates Zod input, emits an audit/outbox fact and returns stable
state rather than provider secrets or raw credentials.

**Acceptance:** API tests pass with tenant and role coverage; UI consumers can
render loading/empty/error/blocked data states without inventing financial
authority.

## UI/UX Contract

### Target User / JTBD
Users/operators need safe, explainable economic status and recovery data.
### Surface Inventory
Existing finance/runtime projections; no new visual design here.
### Component Map
API owns authority; existing cards/drawers own presentation.
### State Matrix
Loading, empty, denied, frozen, approval-required, reconciliation-required, success and error.
### Responsive Matrix
Existing consumer layouts remain responsible for mobile/tablet/desktop.
### Accessibility Acceptance
Consumers expose text reason/status, labels and keyboard-safe recovery.
### Copy Contract
Thai/English clients localize all reason/status codes.
### Browser Evidence Required
Downstream UI route evidence; this section supplies API fixtures.
