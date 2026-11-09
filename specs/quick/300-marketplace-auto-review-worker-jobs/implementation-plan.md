# Implementation Plan

## Objective

Make the Marketplace Auto Review workflow durable and scalable by ensuring each LLM or long-running operation is admitted to canonical `worker_jobs` plus its dispatch outbox before execution. Keep the existing run/checkpoint model and UI polling as the user-facing domain view.

## Approach

1. Add a typed Marketplace Auto Review canonical job contract and executor. Bind each job to the existing run owner and tenant, use bounded inputs with run IDs/operation parameters, reload authoritative domain state inside the executor, and use the existing lease heartbeat and retry policy.
2. Replace feature-local and in-process scheduling for new QC, repair, initialization, advancement, story redraft, prompt authoring and provider reconciliation work with canonical job admission. Persist idempotency and expose worker job reference/status through the existing run state projection where needed.
3. Prevent double execution by making the legacy scheduler a compatibility dispatcher only for pending historical rows (or safely closing it if no such rows remain), then retire its direct LLM execution path. Ensure enqueue failures update the run with a safe actionable failure state so it can be retried.
4. Preserve existing checkpoint approval, credit, media dispatch, cancellation and tenant ownership rules. A worker job must not itself bypass user approval.

## Affected areas

- Marketplace Auto Review run/service scheduling and staged checkpoint router/service.
- Canonical job type allowlist, executor registry and Marketplace Auto Review job adapter.
- Existing Marketplace Auto Review job scheduler, only for migration/recovery and eliminating duplicate execution.
- Focused server/router/UI tests for admission, worker execution, duplicate requests, failure visibility and checkpoint invariants.

## Acceptance criteria

- Starting Creative QC writes a canonical `worker_jobs` row and dispatch outbox entry; no QC LLM call runs in the HTTP mutation.
- Story generation/redraft and per-shot LLM prompt generation in the active Auto Review flow are executed by a canonical worker job.
- Long-running continuation/reconciliation work is canonical; no timer or feature-specific worker executes new LLM work.
- Jobs carry only bounded owner-scoped references and parameters; executor reloads the run and validates tenant/user scope.
- Duplicate submissions return the same operation/job; stale run revisions fail without spending duplicate credits.
- The UI continues to poll the durable run projection and shows queued/running/failed/passed states with an actionable retry path.
- Existing queued feature-local jobs are safely migrated/re-enqueued or surfaced for recovery without duplicate LLM/media spend.
- Focused checks pass; integrated revision is deployed only to `legacy-debian-dev` and runtime health is verified.

## Rollback

Keep existing run metadata and terminal feature-local outbox records. If canonical execution must be rolled back, disable new canonical admission only after the worker path is known unhealthy, then resume the preserved domain queue through a controlled owner migration; never re-enable both executors for the same idempotency key. No schema destructive migration is planned.

## Required checks

- Focused Vitest suites for changed service/router/job executor/UI behavior.
- `git diff --check`, repository fast integration gate, canonical SHA reconciliation.
- Debian release target preflight and runtime health for `legacy-debian-dev`.
- Do not run `npm run typecheck` locally.
