# Section 04 — Scheduler and Provider Admission

## Goal

Ensure local schedulers create durable canonical intent and provider admission
does not reject valid queue creation or hold a lease during external waits.

## Owned paths

- Existing web scheduler/job-intent modules and `jobScheduler` contracts.
- Provider admission/polling services and Python bridge tests.
- Cloudflare scheduled sweep contract and focused tests.

## Implementation

Classify all server business intervals from Section 01 and route them through
canonical intent. Cloudflare Cron only claims bounded due rows and creates or
advances jobs; it does not execute provider/billing/notification/cleanup logic
inline. Deterministic occurrence keys include schedule ID/version/timezone and
missed-occurrence policy; duplicates return the existing job and definition
changes conflict.

Keep provider capacity separate from create admission. PostgreSQL-backed
account-window, provider-running, and per-user reservations survive restart
and release only on terminal provider evidence or authorized recovery. A full
provider leaves a valid job queued. Before external submission, persist a
deterministic operation key; after acceptance, persist the provider reference,
move to `waiting_external`, release the execution lease, and persist poll
deadline/fencing. Poll/callback reacquisition is fenced and cannot blindly
resubmit or consume a generation token.

The Python `register-external-provider` route remains an explicitly temporary
compatibility bridge and must correlate to the same canonical job; it cannot
create another job.

## Tests

Duplicate occurrence and definition conflict, timezone/DST, missed occurrence,
no-inline-business-execution, provider saturation, fairness cooldown,
reservation release, polling restart, provider 429/5xx/ambiguous response,
operation-key reuse, and waiting-external lease release.

## Acceptance

Every business scheduler has an owner and canonical intent path. Provider
saturation remains queued, external waits release leases, and no scheduler
selects a retired Google runtime.

## Implemented

- Reused the Feature 186 PostgreSQL-backed scheduler, provider reservation,
  callback-free polling, and Python registration bridge.
- Added/retained canonical system schedules for cleanup, notification,
  maintenance, and memory waves; non-migrated in-process schedules are disabled
  under hard cutover and classified for Cloudflare Cron ownership.
- Existing focused scheduler/provider tests cover occurrence dedupe,
  saturation, reservation fencing, polling, and operation-key reuse.
