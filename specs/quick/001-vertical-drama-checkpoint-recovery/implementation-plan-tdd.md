# TDD plan

## Service tests first

1. Failed record with checkpoint returns a recoverable summary.
2. Failed record without checkpoint returns `canResume: false` and a bounded
   reason.
3. Recovery preserves the domain job id/checkpoint, increments the attempt,
   restores active pointer, and calls the injected enqueue function once.
4. A second recovery while queued/running is idempotent and does not enqueue a
   second delivery.
5. Worker-level terminal failure writes `failed` state and recoverable metadata.
6. A tenant/series mismatch returns null/denies recovery.

## Router tests

1. Query/mutation reject invalid series ids and foreign ownership.
2. Query exposes completed/remaining checkpoint summary.
3. Mutation returns the canonical job id and recovery status.
4. Missing checkpoint and unsupported kind map to precondition failure without
   queue or credit side effects.

## UI tests

1. Failed recoverable state renders the Thai repair action and counts.
2. English locale renders equivalent copy.
3. Confirmation dialog states completed content is retained and disables the
   action while pending.
4. Successful mutation starts normal polling for the same domain job id.
5. Non-recoverable state has no repair button and does not start generation.

## Commands

- `cd apps/web && pnpm exec vitest run server/services/__tests__/verticalDramaStoryJobs.test.ts`
- `cd apps/web && pnpm exec vitest run server/routers/__tests__/verticalDramaSeries.deepStoryDrafts.test.ts`
- `cd apps/web && pnpm exec vitest run client/src/components/verticalDramaSeries/...recovery.test.tsx`
- `cd apps/web && pnpm check`

If existing baseline failures appear, separate them from changed-path failures
and report the exact command/output.
