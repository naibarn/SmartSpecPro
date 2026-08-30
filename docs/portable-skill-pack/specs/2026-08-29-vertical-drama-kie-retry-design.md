# Vertical Drama Kie image admission and retry design

## Goal

Prevent Kie.ai image generation bursts from failing immediately when a provider
submission is rate-limited or Kie cannot fetch a reference image. A user must
have at most three admitted Kie image tasks in flight. Retry must reuse the same
internal media task and credit reservation, wait between attempts, and notify
the user only after three delayed retries are exhausted.

## Current contract

- Python already has a PostgreSQL-advisory-lock dispatcher with
  `KIE_IMAGE_MAX_IN_FLIGHT_PER_USER=3` for newly created image tasks.
- The image API must not switch to an inline path just because a worker health
  probe is temporarily negative; that would bypass the dispatcher.
- Some recovery paths bypassed that dispatcher by calling Celery directly.
- Kie normal `state=fail` is currently terminal, including `Image fetch failed`.
- The task has one persisted credit reservation; a retry must not deduct again.

## Design

1. Keep admission authoritative in the Python dispatcher. Every new or
   recovered image task must enter through `_dispatch_pending_image_tasks_async`.
   The dispatcher claims at most three occupied/claimed image rows per user;
   direct Celery dispatch from periodic retry is removed. The image API uses
   this path whenever the Celery module is available, even during worker
   restart/health-probe uncertainty.
2. Add a bounded provider-retry state to the existing task JSON result. For
   retryable Kie fetch/rate-limit failures, clear the provider task id, retain
   the original input URLs, set the task back to `pending`, and enqueue it via
   the same dispatcher after an exponential delay (15, 30, 60 seconds with a
   small deterministic testable jitter-free policy). Count provider retries
   separately from Celery delivery retries; maximum is three.
3. Treat other policy, malformed-input, credit, and permanent provider errors
   as terminal. Once the retry budget is exhausted, mark the task failed,
   notify the owner, dispatch the next queued user task, and let the existing
   idempotent credit reconciliation refund the single reservation.
4. Expose retry progress in `result_data.polling` and task error state so the
   client can show `กำลังลองใหม่ครั้งที่ n/3` without presenting a terminal
   error. No JWT or raw provider payload is logged.

## Failure and credit safety

- A provider retry never creates a second `media_tasks` row or credit
  transaction.
- The provider task id is cleared only after a terminal provider response has
  been persisted under the row lock.
- A task already completed/failed remains idempotent under duplicate Celery
  delivery.
- The existing `extra_params`/`extraParams` compatibility fix is required for
  terminal refunds.

## Verification

- Unit test dispatcher cap: four queued tasks for one user dispatch only three.
- Unit test fetch failure: delayed retry 1/2/3, same internal task, no extra
  credit charge.
- Unit test retry exhaustion: fourth failure becomes terminal and notifies once.
- Unit test recovery path: periodic retry calls the dispatcher, not direct
  Celery enqueue.
- Focused Python task tests plus existing web credit reconciliation tests.

## Boundaries

This change does not make tenant media public and does not claim to fix an
unknown Kie-side regional fetch condition. A future provider upload adapter can
replace broker URLs without changing the retry/admission contract.
