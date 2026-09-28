# Section 03: Runtime State, Leases, Events, and Finalization

## Objective

Implement the Postgres-backed orchestration state machine around the existing
BullMQ/Redis delivery path.

## Owned paths

- `apps/web/server/services/verticalDramaStoryGenerationRuntime.ts`
- `apps/web/server/services/verticalDramaStoryJobs.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryGenerationRuntime.test.ts`
- runtime trace/checkpoint helpers only where required

## Required behavior

- Admission is idempotent and creates a parent run plus first attempt before
  queue delivery. Queue IDs are deterministic from run key/attempt.
- Every worker claims a lease and fence token. Writes from stale workers are
  rejected; late provider results are reconciled by provider request ID.
- Checkpoint after context, each generated unit/chunk, each validation/repair
  round, and finalization. Resume starts from the last durable checkpoint.
- Map Redis/BullMQ failure to a truthful persisted state; Redis is never the
  only source of completion.
- Implement cancel, approve/reject, resume, repair, and provider reconciliation
  transitions with actor/reason/contract/output/idempotency evidence.
- Commit candidate output and final run status atomically and make repeated
  finalization a no-op using `finalizationKey`.
- Replayed event cursors do not duplicate side effects.

## TDD and proof

Test stale fence, duplicate queue delivery, crash after provider submission,
unknown provider outcome, cancellation during inflight work, replayed event
cursor, lease expiry recovery, and finalization retry. Use fake repository and
provider boundaries first, then a focused database integration test where the
existing test harness supports it.

## UI/UX Contract

### Target User / JTBD
N/A: runtime state is server-owned and is surfaced by section 06.

### Existing Pattern Reference
N/A; reuse existing run-status payload conventions.

### Surface Inventory
None.

### Component Map
None.

### State Matrix
N/A; state display is specified and tested in section 06.

### Responsive Matrix
N/A; no UI is changed.

### Accessibility Acceptance
N/A; no UI is changed.

### Copy Contract
N/A; runtime reason codes are localized by the client.

### Browser Evidence Required
None for this section; service tests are sufficient.
