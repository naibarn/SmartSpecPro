# Section 01 — Canonical Job Contracts

## Source coverage

Feature 195 sections 0–16, 43–50, 271, 279 and 294; canonical Job, status, transition, event, attempt, lease, idempotency and cross-spec contract requirements.

## Deliverable

Define the canonical TypeScript types and pure transition/policy helpers used by every Job admission, consumer, monitor and later Feature 196–200 adapter. Existing gateway/service names are reused where present; new exports must be documented in this section before consumers use them.

## Files

- Modify: `apps/web/server/services/jobControlPlaneTypes.ts`, `jobControlPlane.ts`, `jobControlPlaneGateway.ts`
- Test: adjacent `apps/web/server/services/__tests__/jobControlPlane*.test.ts`

## TDD steps

1. Add failing tests for valid transitions, illegal transitions, terminal immutability, tenant/idempotency scope and stale fence.
2. Run the focused Vitest files and confirm behavioral failures rather than import/configuration failures.
3. Add the minimal contract/transition implementation using existing status names and error conventions.
4. Rerun focused tests and `git diff --check`.

## Completion gate

No later section may define another Job status/ID/lease authority; all handoffs use the exported canonical types.

## UI/UX Contract

### Target User / JTBD
N/A — backend contract only; UI behavior is covered by section-05.

### Existing Pattern Reference
N/A — no UI is created in this section; section-05 reuses the existing job monitor.

### Surface Inventory
N/A — no route or component changes.

### Component Map
N/A — pure contracts are consumed by existing projections.

### State Matrix
N/A — state rendering is tested in section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence for Job states.
