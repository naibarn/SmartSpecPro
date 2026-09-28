# Section 01 — Chat Request and State Contracts

## Source coverage

Feature 198 sections 1–12, 21–31, 47–52, 82–120, 134–138, 153, 160–161 and 193.

## Deliverable

Define request/page-context/state contracts for source/capability chips, plan, approval, live task, result, unknown, event correlation and canonical Job hydration. Keep Chat presentation separate from 196 semantics and 195 truth.

## TDD steps

Test normalization, tenant/page scope, duplicate submit, reconnect hydration, empty provider and unknown state; implement minimal contracts/adapters; rerun focused tests.

## Completion gate

No Chat state implies completion without durable Job/event evidence.

## UI/UX Contract

### Target User / JTBD
N/A — state contract only; visual behavior is covered by section-04.

### Existing Pattern Reference
N/A — no component is created here; section-04 reuses current Chat patterns.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — state/domain layer only.

### State Matrix
N/A — rendering matrix is tested in section-04.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-04 owns browser evidence.
