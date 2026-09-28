# Implementation plan

## Objective

Make stalled Vertical Drama jobs truthful, refresh-discoverable, and repairable
from the existing checkpoint through an owner-scoped UI action.

## Section 1 — Service and BullMQ lifecycle

Target: `apps/web/server/services/verticalDramaStoryJobs.ts` and its focused
test file.

- Extend the Redis adapter only with the smallest primitives needed for an
  idempotent recovery lock, or use an existing atomic Redis pattern if the
  current client supports it.
- Add a bounded recoverable pointer/read helper that returns a terminal record
  with a server-computed summary: `canResume`, completed episodes, remaining
  episodes, reason, and recovery attempts.
- Add an explicit recovery function that verifies the record is owned by the
  requested series, is `failed`, is a supported checkpoint kind, and has a
  checkpoint. It must preserve `input`, `checkpoint`, and domain `jobId`, set
  the record back to `queued`, refresh the active pointer, increment the
  persisted recovery attempt, and enqueue one BullMQ delivery.
- Make the operation idempotent under two tabs: an active queued/running record
  returns its existing state; a short-lived recovery lock prevents concurrent
  terminal-to-queued races.
- Refactor queue enqueue options into a small injectable helper so tests can
  assert a recovery delivery without a real BullMQ connection.
- Update the worker `failed` listener to reconcile a terminal BullMQ failure
  into the Redis record, preserve the checkpoint, store the failure reason, and
  publish the recoverable pointer. Do not automatically requeue after attempts
  are exhausted.
- Keep normal `getActiveVerticalDramaStoryJob` semantics for queued/running
  records; add a separate recoverable read to avoid changing other callers.

## Section 2 — Router contract

Target: `apps/web/server/routers/verticalDramaSeries.ts` and router tests.

- Add an owner-scoped `getStoryJobRecovery` query accepting only `seriesId`.
- Add an owner-scoped `repairStoryJob` mutation accepting `seriesId` and an
  optional expected `jobId`/idempotency key. The server must reject stale or
  foreign job ids and return the canonical recovery state.
- Use `loadOwnedSeries` and tenant/user checks before touching the queue.
- Map no record, no checkpoint, unsupported kind, and active job states to
  bounded tRPC responses; do not leak foreign job existence.
- Return the same domain job id for polling and a recovery summary so the client
  can attach to the normal poll loop.

## Section 3 — UI and regression proof

Target: `VerticalDramaDeepStoryDraftsPanel.tsx`, `verticalDramaCopy.ts`, and
focused client/router/service tests.

- Query recovery state on the deep-story panel.
- Render a failed/stalled banner with checkpoint progress and a primary
  `ซ่อมและทำต่อจาก checkpoint` action when the server says it is resumable.
- Reuse `AlertDialog` for the final confirmation; show completed/remaining
  episode counts and the credit warning before mutation.
- Disable all conflicting generation actions while recovery is pending and
  attach the same job to the existing poller on success.
- Render a truthful non-retryable explanation when no checkpoint is available.
- Add Thai/English copy, `data-testid`, keyboard/focus semantics, responsive
  wrapping, and `aria-live` status updates.

## Acceptance criteria

- A terminal stalled job is no longer displayed as indefinitely running.
- A recoverable job is visible after page refresh and has a repair/continue
  button.
- Two simultaneous recovery requests result in one BullMQ delivery.
- Recovery preserves the domain job id/checkpoint and does not recreate
  completed episodes.
- Foreign tenant/user requests cannot inspect or recover the job.
- Normal generate/extend behavior remains unchanged for queued/running and
  fresh jobs.
- Focused service/router/UI tests and affected TypeScript check pass.

## Risks and mitigations

- Redis race: use atomic lock/compare-and-set and re-read before enqueue.
- Credit duplication: do not deduct in recovery; preserve checkpoint and rely on
  existing executor admission/idempotency logic.
- Pointer loss: keep a bounded recoverable pointer separate from active pointer.
- UI drift: return server-computed recovery metadata and test both locales.
- Dirty worktree: stage and inspect only owned files; do not reset or format the
  repository globally.

## Rollout

Deploy separately from production recovery. After deployment, inspect the
current job, verify its recovery summary, and only then use the new UI button.
Browser proof must confirm the button transitions to queued/running and that
the same job id continues polling.
