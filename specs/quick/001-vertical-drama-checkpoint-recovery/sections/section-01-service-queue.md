# Section 01 — Service and queue recovery

## Ownership boundary

Own the Redis/BullMQ story-job service and its focused tests. Do not change the
story executor's prompt or credit calculation.

## Target files

- `apps/web/server/services/verticalDramaStoryJobs.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryJobs.test.ts`

## Required behavior

- reconcile BullMQ terminal failures into a failed domain record;
- preserve latest checkpoint and expose a bounded recoverable summary;
- recover only supported checkpoint-bearing `deep_generate`/`extend` jobs;
- use the same domain job id and prevent concurrent duplicate recovery;
- leave normal enqueue/dedupe and worker redelivery behavior intact.

## TDD expectations

Add fake-Redis tests before implementation for recoverable summary,
checkpoint-preserving requeue, idempotency, no-checkpoint refusal, and terminal
failure reconciliation. Keep BullMQ mocked and injectable.

## Acceptance checks

- no direct production Redis mutation is required by tests;
- all error paths are bounded and do not throw secrets or prompt content;
- TypeScript types remain compatible with existing queue initialization.

## Risk

The active pointer and recoverable pointer can race with a normal enqueue. Use a
compare/re-read guard and ensure a stale failed pointer cannot block fresh work.
