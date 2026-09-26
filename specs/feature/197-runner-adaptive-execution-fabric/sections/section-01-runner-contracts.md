# Section 01 — Runner and Control Contracts

## Source coverage

Feature 197 sections 0–3, 8, 12–13, 29, 41–53, 57–64, 68–79.

## Deliverable

Define shared Runner identity, device/runtime, capability snapshot, WorkOffer, ExecutionAttempt/Session, ControlCommand, ControlEvent, ACK and reconciliation message contracts in Rust/Web-compatible forms.

## TDD steps

Write failing Cargo/Web tests for serialization/version negotiation, correlation, ACK idempotency, desired/observed/unknown state and stale-fence rejection; implement minimal types; rerun tests and format.

## Completion gate

Realtime messages cannot be interpreted as durable completion, and no later section defines a second Runner protocol.

## UI/UX Contract

### Target User / JTBD
N/A — protocol contract only; Runner UI is covered by section-05.

### Existing Pattern Reference
N/A — no UI is created; section-05 reuses `/workers/connect`.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — serialization/protocol layer only.

### State Matrix
N/A — state rendering is covered by section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
