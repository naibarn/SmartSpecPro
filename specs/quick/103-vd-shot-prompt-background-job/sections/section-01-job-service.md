# Section 01 — Job Service

## Ownership

- New `apps/web/server/services/verticalDramaShotPromptJobs.ts`
- New focused service tests only

## Work

Define serializable job input/result/status types, Redis records with TTL,
active-shot and idempotency pointers, queue submission, terminal transitions,
pointer cleanup, and BullMQ worker lifecycle. Use bounded concurrency and one
attempt.

## TDD expectations

Write tests first for enqueue, dedupe, distinct shots, idempotency, stale
pointers, queue failure, worker success/failure, and owner-scoped status.

## Acceptance checks

- No live Redis/provider is required by unit tests.
- Enqueue failure cannot leave a job permanently queued.
- Different shots never share an active pointer.

## Coordination risks

The worker dynamically imports the router executor to avoid a static service ->
router import cycle. Keep the executor's wire input JSON-safe.
