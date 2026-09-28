# Research notes

## Existing flow

- `apps/web/server/services/verticalDramaStoryJobs.ts` owns the Redis record,
  active pointer, checkpoint persistence, BullMQ queue, and worker runner.
- `runVerticalDramaStoryJob` resumes from `record.checkpoint` on a normal
  worker redelivery, but the BullMQ `failed` listener currently only logs.
- `getActiveVerticalDramaStoryJob` deletes terminal pointers, so a failed job
  is not refresh-discoverable by the current panel.
- `enqueueVerticalDramaStoryJob` dedupes only queued/running records and can
  create a fresh domain job after terminal cleanup.
- `apps/web/server/routers/verticalDramaSeries.ts` exposes status and active-job
  reads plus the normal deep-generation mutation. The existing
  `resumeStoryGeneration` belongs to the separate durable assurance-run path
  and cannot recover the incident's legacy Redis-only job.
- `VerticalDramaDeepStoryDraftsPanel.tsx` already polls active jobs and has a
  confirmation dialog, so recovery can be additive and reuse the existing
  status/progress patterns.

## Runtime evidence carried into implementation

- Series 58's domain job has a checkpoint through episodes 1-7 and BullMQ
  marked its delivery stalled after a service restart.
- Redis and Postgres data were inspected read-only; no authored rows were
  deleted and no recovery call was executed.

## Data/security boundaries

- All router operations must call `requireTenantId`, `loadOwnedSeries`, and
  verify the record's `userId`/`tenantId`/`seriesId`.
- Redis keys are scoped by tenant and series; recovery must not accept an
  arbitrary payload that can change job ownership or kind.
- The recovery endpoint must never deduct credits itself. It should requeue the
  existing domain job and let the executor's existing admission/idempotency
  path decide remaining work.

## Test/config scan

- `apps/web/server/services/__tests__/verticalDramaStoryJobs.test.ts` already
  provides an injectable fake Redis and BullMQ mocks.
- `apps/web/server/routers/__tests__/verticalDramaSeries.deepStoryDrafts.test.ts`
  mocks the story-job service and uses a minimal tRPC procedure composer.
- Client tests live beside the Vertical Drama components and use Vitest/jsdom.
- App package manager is pnpm; focused tests use `pnpm exec vitest run` from
  `apps/web` with the repository's `JWT_SECRET` convention when required.

## Discovery limitation

SocratiCode MCP was unavailable, so targeted `rg` and narrow file reads are the
discovery fallback. Runtime evidence is separate from local test evidence.
