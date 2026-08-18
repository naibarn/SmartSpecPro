# Kie.ai Image Fair Queue Design

## Goal

Make asynchronous Kie.ai image generation admit up to three in-flight provider
tasks per user without allowing one user's jobs to block another user behind the
three-process Celery media pool. Provider submission must remain globally rate
limited, durable, tenant scoped, and recoverable after process restarts.

## Evidence

- Production uses one `media` Celery worker with global concurrency `3`.
- At 20:59 Bangkok time, two tasks from one user and one task from another user
  occupied all three processes. A fourth task waited 49.4 seconds even though its
  owner had only two submitted tasks.
- The asynchronous HTTP endpoint creates a `media_tasks` row and enqueues
  `generate_image_task`, but the worker calls the shared gateway, forces
  `callback_url=""`, and polls Kie.ai until completion. Each provider task therefore
  holds one Celery process for roughly 1-4 minutes.
- The existing Vertical Drama count of three is browser-local bulk concurrency,
  not a durable per-user backend limit.

## Selected Approach

Use a database-backed per-user admission dispatcher and short-lived Kie.ai
submission/poll tasks.

Alternatives rejected:

1. Callback-only completion is operationally light, but the current production
   callback URL and webhook secret are unset. A lost or rejected callback would
   strand work without a polling safety net.
2. Increasing Celery process concurrency preserves global FIFO behavior and
   raises OOM risk in the current 2 GiB container. It does not implement the
   required per-user contract.

## State Model

The existing `media_tasks` table remains the durable ledger; no migration is
required.

- `pending`, `task_id IS NULL`: admitted record waiting for a per-user provider
  slot or a submission retry.
- `processing`, `task_id IS NOT NULL`: accepted by Kie.ai and counted against the
  user's limit of three.
- terminal states: `completed`, `failed`, or `cancelled`.

The Celery task ID identifies the most recent local dispatch attempt. Provider
task IDs remain in `task_id` and are the durable boundary for polling and
callback reconciliation.

## Admission and Fairness

1. The async HTTP endpoint creates the task row as today.
2. A dispatcher takes a PostgreSQL transaction-scoped advisory lock derived from
   the user ID. Under that lock it counts the user's `processing` image rows
   with a provider task ID and selects the user's oldest pending image rows.
3. It dispatches only enough rows to bring that user to three in-flight provider
   tasks. Different users have independent locks and can be admitted immediately.
4. Completion, failure, cancellation, and recovery trigger the same dispatcher
   for that user so the next pending task advances.
5. Submission is idempotent: a row that already has `task_id` is never submitted
   to Kie.ai again.

This design gives per-user isolation without a global scheduler table. FIFO is
preserved within each user, while users progress independently.

## Provider Submission and Polling

- `generate_image_task` becomes a short submission task for Kie.ai image models.
  It validates the request, resolves references, submits once, stores the provider
  task ID, changes the row to `processing`, schedules a poll, and exits.
- A dedicated Kie.ai poll task performs one status query. If still running, it
  reschedules itself with bounded backoff; if terminal, it updates the existing
  row and advances the user's pending queue.
- Existing synchronous image generation keeps its current blocking behavior.
- Existing non-Kie providers keep their current provider-specific paths unless
  they already support deferred polling.
- The existing signed Kie webhook remains an optional faster completion path.
  Polling is authoritative fallback and all terminal updates are idempotent.

## Global Rate Limit

Kie.ai task creation uses a Redis-backed token bucket shared by Python workers.
The default contract mirrors the repository policy of 20 submissions per 10
seconds, configurable by environment for the actual provider plan. Polling uses a
separate conservative bucket so result checks cannot starve submissions.

Rate-limit exhaustion reschedules the submission task; it does not fail the user
task or deduct credits again.

## Failure and Recovery

- Provider submission errors retain existing retry/non-retryable classification.
- A failed submission marks the row terminal only after retries are exhausted,
  sends the existing scoped notification, and advances that user's queue.
- A worker crash before provider ID persistence is retried through Celery. A
  provider ID is persisted immediately after successful creation to minimize the
  duplicate-submission window.
- Poll failures retry with bounded exponential backoff. Provider terminal failure
  maps to `failed`; timeout maps to a clear provider-poll timeout.
- `recover_stuck_tasks` continues to reconcile old processing rows and is extended
  to re-arm pending per-user dispatch safely.
- Cancellation prevents future submission for pending rows and prevents pollers
  from overwriting a terminal cancellation.

## Security and Observability

- All DB operations preserve the existing task owner and tenant scope.
- Logs contain task IDs, user IDs, provider states, wait times, and retry counts,
  but never prompts, provider response `param` payloads, signed download tokens,
  API keys, or full provider responses.
- Emit structured events for `pending`, `provider_submitted`, `poll_scheduled`,
  `completed`, `failed`, and `next_user_task_dispatched`.
- Queue metrics distinguish local pending rows, provider in-flight rows, Celery
  backlog, and provider rate-limit deferrals.

## Tests

Focused regressions must prove:

1. The first three tasks for one user submit; the fourth remains pending.
2. A different user's task submits even while the first user has three active.
3. Completing/failing/cancelling a task advances exactly one pending task for the
   same user.
4. Concurrent dispatch calls cannot exceed three provider tasks per user.
5. A Kie.ai async image worker exits after submission rather than waiting for the
   result.
6. Polling completes/fails/reschedules idempotently and never revives cancellation.
7. Rate-limit exhaustion reschedules without duplicate provider submission or
   duplicate credit reservation.
8. Logs redact prompts, signed URLs, and raw provider parameters.
9. Existing synchronous image and non-Kie media behavior remains unchanged.

## Deployment

Deploy code and restart the Python API, Celery media worker, and Celery beat so
new task registrations and schedules load. Do not increase worker concurrency as
part of this change. Verify with two controlled users, no more than three active
provider image tasks per user, near-immediate cross-user submission, bounded Kie
creation rate, empty stranded pending rows, and stable container memory.
