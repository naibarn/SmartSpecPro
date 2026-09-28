# Marketplace AI image edit background reconciliation design

## Goal

Make `แก้ไขภาพด้วย AI` in the Marketplace Auto Review sequential shot editor a
durable background workflow. Submitting an image-to-image edit must return
quickly, while provider work may continue for five minutes, thirty minutes, or
longer without the browser declaring a false timeout.

## Evidence and root cause

- `editMarketplaceAutoReviewSequentialShotImage()` already calls
  `mediaGenerationService.generateImageAsync()`, which submits to the async
  media endpoint and persists a provider task reference.
- `MarketplaceAutoReviewWorkflowPage.tsx` then performs its own foreground loop
  for exactly `120 * 2.5s = 300s`, after which it writes
  `sequential_shot_image_edit_timeout` even when the provider task is still
  pending.
- The candidate remains `submitted` until the browser observes completion and
  the user accepts it; a page reload therefore cannot reliably show a durable
  completed candidate.
- Marketplace Auto Review already has a durable outbox, scheduler, signed
  background token, unified media-task polling, and R2 durability boundary.

## Chosen design

Reuse the existing Marketplace Auto Review outbox/scheduler for a dedicated
`sequential_image_edit_reconciliation` job. The submit mutation will persist
the candidate as `submitted` and enqueue one reconciliation job. The worker
will poll the unified media task once per scheduled job:

```text
user submit
  -> async provider task + submitted candidate
  -> outbox reconciliation job
  -> poll provider task / durable R2 result
  -> submitted (requeue) | completed | failed + refund
  -> UI run query observes persisted candidate
  -> user accepts or discards candidate
```

Each pending poll schedules a new idempotent outbox record keyed by run, shot,
provider task, and poll sequence. The current job is allowed to complete before
the next job becomes due, avoiding an in-place lock/status race. Provider
status/read failures do not become image failures; they keep the candidate
pending and are retried by the background schedule. A provider-declared failed
task becomes terminal and refunds the reserved credit exactly once.

## UI behavior

- Remove the five-minute foreground polling loop and its false timeout.
- After submission, show the existing pending state and let the run query refresh
  the persisted candidate.
- Keep polling the run query while any image-edit candidate is `submitted`, even
  if the overall run itself is otherwise terminal.
- Completed candidates render from persisted `afterUrl` after refresh/reopen.
- Accept/discard remains an explicit user action; the active frame is never
  replaced automatically.

## Scope and safety

- No schema migration or new dependency is needed; outbox payload JSON carries
  the shot/task/poll data.
- Existing run ownership, tenant scoping, background token creation, unified
  task polling, R2 durability, and credit refund paths remain authoritative.
- Only the targeted image-edit candidate is changed. Existing unrelated run
  advancement and media generation paths remain untouched.
- A stale or missing task is not silently retried as a second provider
  generation; only the already-submitted task is reconciled.

## Test contract

Focused tests must prove:

1. submission enqueues the reconciliation job after persisting the candidate;
2. a pending task schedules the next poll without marking timeout or failure;
3. a completed task persists a durable candidate URL and completion state;
4. a failed task persists failure and refunds once;
5. the scheduler recognizes and executes the new job type;
6. the UI no longer has a five-minute timeout loop and continues run refresh
   while a candidate is pending.

Live provider completion, authenticated browser verification, deployment, and
production scheduler execution remain deployment-time evidence gates.
