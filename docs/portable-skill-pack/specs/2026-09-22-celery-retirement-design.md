# Celery Retirement and Canonical Worker Cutover Design

Date: 2026-09-22
Status: Design approved in chat; implementation pending plan review
Scope: All active asynchronous execution paths in SmartSpecPro

## Intent

Retire Celery as an execution transport. New work must enter the canonical
`worker_jobs` plus outbox control plane and execute through the approved
PostgreSQL-pull Node/Python workers (or an explicitly approved future adapter).
Celery, Celery Beat, Redis queue delivery, and inline legacy execution must not
be used as a producer or fallback for new work.

Historical data and legacy identifiers may remain readable during retention,
but no new job may depend on them for execution truth.

## Current evidence

- `media.generateImageAsync` still reaches the Python async media endpoint for
  non-Hermes/MCP models.
- That endpoint returns the Celery-specific 503 when
  `FEATURE_186_HARD_CUTOVER` is false or missing and no media worker responds.
- `dispatch_python_task` still contains a compatibility branch that publishes
  through Celery when hard cutover is disabled.
- The PostgreSQL-pull Python worker requires both hard-cutover flags and the
  new Compose worker is currently opt-in.
- The repository contains additional Celery producers/tasks for media,
  presentation, Drive, social, browser, maintenance and scheduled work.

## Target contract

1. Every accepted asynchronous request first creates one tenant-scoped
   `worker_jobs` row and one outbox intent.
2. Publication and execution use the canonical job ID, lease, attempt,
   heartbeat, idempotency, retry and terminal-state contract.
3. Transport/runtime unavailable means the canonical job remains queued or
   enters a typed retryable/blocked state. It never switches to Celery or an
   inline background fallback.
4. `FEATURE_186_HARD_CUTOVER` becomes a readiness/deployment gate, not a
   compatibility switch. A disabled or inconsistent configuration fails
   startup/readiness instead of activating the legacy path.
5. Existing `celery_task_id` values remain historical dispatch references only;
   new code must not create or require them.

## Migration boundaries

### Producer boundary

Remove active Celery dispatch from the shared Python producer boundary and all
call sites. Convert each producer to the existing canonical control-plane
creation gateway with an explicit job type, tenant, idempotency key and
executor contract.

### Executor boundary

Reuse business handlers only where they can run without Celery transport state.
Where a handler is coupled to Celery task context, extract a transport-neutral
executor and keep the domain behavior unchanged. The PostgreSQL-pull workers
claim and fence the canonical job before invoking it.

### Scheduling and operations

Move periodic work to the canonical scheduler/control-plane path. Remove
Celery Beat startup, Celery queue health as execution readiness, automatic
Celery restart actions, and dashboard states that imply Celery is required.

### Deployment

Make the Node and Python PostgreSQL-pull workers mandatory for the supported
deployment. Remove the legacy media Compose/systemd startup path after a
drain/readiness gate. Do not delete historical database rows or tables as part
of this change.

## Failure behavior

- Missing worker: persist the job, expose canonical readiness/blocked status,
  and allow the outbox/recovery loop to retry publication.
- Provider failure: use the canonical business retry/attempt policy.
- Restart or duplicate delivery: recover through lease fencing and
  idempotency on the same `worker_jobs.id`.
- Configuration with legacy transport enabled: fail readiness and emit a
  typed configuration error; never silently fall back.

## Verification contract

- Static audit: zero active `.delay()`, `.apply_async()`, `send_task()` or
  equivalent Celery producers outside explicitly inert historical tooling.
- Runtime tests: canonical job creation, outbox publication, claim/lease,
  provider wait/recovery, retry and terminal settlement for each migrated
  domain.
- Negative regression tests: hard-cutover configuration cannot import or call
  Celery dispatch; worker unavailability cannot invoke inline or legacy paths.
- Deployment checks: Compose/systemd contains only the canonical workers;
  readiness requires both worker capabilities; no Celery media consumer is
  required or started.
- Proof boundary: local tests/static audits do not claim production cutover;
  production requires deployed revision, effective environment, worker
  heartbeat, a real canonical enqueue, and an observed `worker_jobs` lifecycle.

## Non-goals

- No new queue, ledger, job table or parallel execution authority.
- No destructive deletion of historical Celery records.
- No unrelated cleanup of existing dirty-worktree changes.
- No production restart or deployment from this implementation session without
  a separate explicit operational approval.
