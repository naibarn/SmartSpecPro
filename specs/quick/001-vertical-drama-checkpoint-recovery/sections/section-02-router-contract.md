# Section 02 — Router recovery contract

## Ownership boundary

Own the vertical drama tRPC query/mutation and router tests. Do not change the
database schema or expose Redis keys to the client.

## Target files

- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/routers/__tests__/verticalDramaSeries.deepStoryDrafts.test.ts`

## Required behavior

- add `getStoryJobRecovery({ seriesId })`;
- add `repairStoryJob({ seriesId, jobId, idempotencyKey? })`;
- verify tenant, user, and owned series before service access;
- return server-computed completed/remaining episodes and reason;
- return the canonical existing job id for polling after recovery;
- use `NOT_FOUND` for foreign/missing records and `PRECONDITION_FAILED` for
  non-recoverable records.

## TDD expectations

Extend the existing mocked-service router tests for ownership, invalid input,
recoverable response shape, no-checkpoint refusal, and enqueue delegation.

## Acceptance checks

- no credit service call is introduced by recovery;
- the normal generation mutations and their existing tests remain unchanged;
- client-visible output contains no tenant-specific Redis detail.
