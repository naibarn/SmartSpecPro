# Storyboard Skill Framework Job Recovery and Cancellation Design

**Date:** 2026-09-14
**Status:** Implemented locally; focused verification passed; deployment proof pending
**Scope:** Skill Framework storyboard generation only
**Related contract:** Feature 186 Unified Job Control Plane

## Problem

Storyboard generation currently persists the run and its canonical
`worker_jobs.id`, but the UI keeps the run identifier only in component state.
After a refresh the page no longer knows which run to poll. In addition, an
unclassified image-provider error is converted into a permanent external wait
with a sentinel resume date, so the worker can remain in `waiting_external`
without a user repair path. Completed shots are durable, but the remaining
shots are not surfaced as a recoverable run on the page.

## Root-cause boundary and prevention

The observed failed shot was not a Redis, PostgreSQL-pull, or provider task
failure. The canonical job was published and claimed, but the failed shot had
no corresponding Python `media_tasks` row or provider request. The historical
worker converted the exception to `IMAGE_PROVIDER_UNKNOWN` without persisting
the inner message, so the exact pre-provider function cannot be reconstructed
from that old run. The evidence does prove the failure boundary: it occurred
after the old credit deduction and before media-generation submission.

The worker now records a bounded, redacted `detail`, safe `code`, optional
`statusCode`, `providerSubmissionStarted`, and
`creditSettledBeforeProvider` on the shot/run error. The media request also
exposes an internal submission boundary. Credit settlement runs only after
safety/model/reference preflight completes and immediately before the provider
request; therefore a future preflight failure cannot consume credits. The
stable per-shot settlement key still makes redelivery and provider retries
idempotent. Ambiguous failures after submission remain explicit review work and
are never silently retried with a new provider operation.

Permanent and unknown provider outcomes now call the canonical reporter
failure path, producing `failed` plus `operatorReviewRequired` instead of
pretending to be a healthy `waiting_external` job. A generic, audited
`recoverReviewGatedJob` transition requires a recorded recovery disposition and
creates exactly one next attempt and one outbox intent on the same canonical
ID. Storyboard repair is fail-closed unless shot evidence explicitly proves
that provider submission did not start; an unresolved provider operation must
be reconciled before any new operation key is allowed. Each shot also emits bounded stage
evidence for preflight, admission, provider response, durable artifact,
domain projection, and failure; the scoped run read exposes the latest safe
control-plane timeline for debugging.

## Goals

- Continue a recoverable storyboard run through the final shot without
  regenerating valid completed shots.
- Make provider failures bounded and visible instead of waiting forever.
- Allow a user to load an existing unfinished/recoverable run after refresh.
- Allow an explicit repair action on the same run and canonical job.
- Allow an explicit cancel action that permanently stops the old run and leaves
  the user free to create a new storyboard.
- Preserve tenant/user authorization, credit idempotency, lease fencing, and
  Feature 186 event history.

## Non-goals

- No new generic jobs table.
- No automatic creation of a replacement storyboard.
- No blind retry of an ambiguous provider operation with a new provider key.
- No deletion of completed shot assets or the original run on refresh/cancel.

## User-visible behavior

1. On initial page load, the page queries recent non-terminal storyboard runs
   owned by the authenticated user and current tenant.
2. The page displays a recovery panel with run status, completed/remaining
   shots, last safe error, updated time, and actions:
   - **Load / Continue:** selects the existing run and resumes polling.
   - **Repair:** explicitly retries eligible failed shots on the same run.
   - **Cancel job:** cancels the same run/job and prevents late worker writes.
3. Refreshing the page does not create a run and does not discard the existing
   run. The user may load it or start a new draft only after cancelling the
   active run.
4. A cancelled run remains visible in history but cannot resume or mutate. The
   existing create flow may create a new run only after the old active run is
   terminal/cancelled, with a new canonical job identity.

## Recovery policy

- Clearly retryable provider failures use bounded control-plane retry with
  persisted backoff and the same storyboard run. They do not make provider
  capacity a create-time rejection.
- Permanent/policy failures remain repairable only when the user changes or
  explicitly re-confirms the affected prompt/input.
- Unknown/ambiguous failures enter a terminal, user-repairable operator-review
  state rather than the old `9999-12-31` external-wait sentinel. The run and
  job remain visible with the safe reason and stage timeline. Repair is an
  explicit user action and retains the persisted operation-key evidence; it
  does not happen automatically or charge the storyboard shot a second time.
- The worker always skips succeeded shots and resumes at the first missing or
  explicitly repaired shot. A failed shot blocks later shots until repaired,
  so the final completion projection means all canonical shots succeeded.

## Server contract

- Add a tenant/user-scoped list endpoint for recent storyboard runs with safe
  job status projection and shot summary. It must never return raw provider
  responses, credentials, signed URLs, or unrestricted payloads.
- Keep `getRun` as the authoritative detail read and include canonical job
  status, operator-review state, safe recovery metadata, and a bounded,
  redacted control-plane event timeline.
- Make repair/retry idempotent and retain the same `runId` and `workerJobId`.
- Make cancel idempotent, fence the control-plane job, cancel unpublished
  dispatch intents, and preserve history/assets for review.
- Do not reopen a succeeded or cancelled run. A new storyboard request creates
  a new run/job only after the user explicitly chooses to create it.

## Client state model

- Persist the selected recovery run ID in the URL or local storage only as a
  locator; PostgreSQL remains authoritative.
- Hydrate the locator on mount, validate it through the scoped server query,
  and clear it only when the user explicitly dismisses the run or starts a new
  draft.
- Poll only while the loaded run is non-terminal or has unresolved recovery
  work.
- Show separate actions for `Continue/Repair` and `Cancel job`; never map a
  refresh or provider error to “create new.”

## Safety and verification

- Add service tests for list scoping, idempotent repair, cancel fencing,
  terminal-state conflicts, and same-run continuation.
- Add worker tests proving shot 1 success plus shot 2 failure can be repaired
  and continue through shot N without regenerating shot 1.
- Add tests proving an unknown failure no longer schedules an infinite
  external wait and that review recovery is idempotent on the same job ID.
- Add client tests proving refresh/reload restores the selected run and that
  cancel enables a new draft without mutating the cancelled run.
- Run focused storyboard tests and inspect the final diff; do not claim live
  provider or production recovery proof from local tests.
