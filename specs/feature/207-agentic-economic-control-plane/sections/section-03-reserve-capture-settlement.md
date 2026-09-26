# Section 03 — Reserve, Capture, Release and Settlement

**Objective:** Implement idempotent economic state transitions around canonical
Job receipts and outbox delivery.

**Files:** create/modify `economicControlPlane.ts`,
`economicSettlementService.ts`, tests, and only the existing outbox integration
needed to publish facts.

**Tests first:** legal/illegal transitions; duplicate reserve/capture/release;
provider timeout; late receipt; partial capture; release after failure;
duplicate settlement delivery; reversal and reconciliation-required status.

**Implementation contract:** reserve creates a hold and journal fact atomically;
capture requires a verified receipt; release is bounded and idempotent; external
finality is never inferred from enqueue/ACK alone.

**Acceptance:** replaying any transition cannot double-charge or strand the
hold; all results expose canonical IDs and explainable state.

## UI/UX Contract

### Target User / JTBD
N/A; supplies state to finance/runtime UI.
### Surface Inventory
N/A; no new screen.
### Component Map
N/A; projection remains separate from transitions.
### State Matrix
N/A; expose held/captured/released/failed/reconciliation-required.
### Responsive Matrix
N/A; no layout changes.
### Accessibility Acceptance
N/A; consumers must not use color alone.
### Copy Contract
State/reason codes need Thai/English labels.
### Browser Evidence Required
N/A; owning UI section verifies projections.
