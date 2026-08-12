# Implementation Plan

## Objective

Make `generateShotVideoPrompt` a fast, durable admission mutation backed by a
BullMQ/Redis job worker. Preserve the existing executor behavior while adding
per-episode FIFO, active-shot dedupe, status polling, reload recovery, and
clear queued/running/success/failure UI states.

## Affected files

### New

- `apps/web/server/services/verticalDramaShotVideoPromptJobs.ts`
- `apps/web/server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts`
- `apps/web/client/src/pages/__tests__/VerticalDramaEpisodePage.shotVideoPromptQueue.test.ts`

### Modified

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts` or the narrow shared
  response-normalization boundary used by motion-contract validation
- `apps/web/server/_core/index.ts`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`
- existing `generateShotVideoPrompt` router/service tests

## Execution order

1. Add queue record types, Redis adapter seams, fingerprint/key helpers,
   per-episode sequence and lock lifecycle, BullMQ initialization, fail-fast
   enqueue, worker execution, terminal record writes, and stale-running safety.
2. Extract the current mutation body after its fast preconditions into an
   executor callable by the worker. Keep the executor's final persistence and
   error mapping unchanged. Add status and active-list procedures with full
   tenant/user/series/episode ownership checks.
3. Register the queue at web startup and close it during graceful shutdown.
   Log readiness/concurrency without logging prompt contents.
4. Update the page's submit handlers to store job IDs, poll active jobs, disable
   only active shots, surface dedup/conflict messages, invalidate episode detail
   after success, and resume after reload. Cover both plain generate and
   instruction/AI-adjust consumers.
5. Add strict boolean-string normalization at the smallest shared response
   boundary and regression tests for valid booleans, strict string coercion,
   and invalid values.
6. Run focused tests, changed-surface typecheck, diff checks, and a bounded
   browser/evidence pass if available. Separate unrelated baseline failures.

## Queue contract

The submit result is `{ jobId, status, deduplicated, queuePosition,
activeJobCount }`. The job record includes owner scope, request fingerprint,
full executor input, sequence, status, timestamps, phase/timing metadata,
bounded result metadata, and sanitized error. Redis operations that check
idempotency, active-shot pointer, and sequence assignment must be atomic.

The queue uses attempts=1 for logical LLM jobs. Enqueue failure marks the job
failed immediately. A stale running lease is marked retryable/failed rather
than automatically re-running a potentially charged executor.

## Security and data boundaries

Status lookups must re-check database ownership; Redis keys are not auth.
Fingerprint and key material must be opaque/bounded. Error text is sanitized
and capped. Do not log prompts, images, or raw provider responses.

## Acceptance criteria

- Submit returns without waiting for an LLM call.
- Same episode: multiple shots are accepted immediately and execute FIFO.
- Different episodes execute concurrently up to configured worker concurrency.
- Same active shot and same fingerprint returns the existing job.
- Same active shot with a different instruction returns a conflict.
- Queue failure is never presented as queued.
- Success persists before status becomes `succeeded`.
- Failure is visible and user retry is explicit.
- UI state survives refetch/reload and does not resubmit automatically.
- Focused tests pass; no changed-file diagnostics remain.
