# Section 02 — Hard-Cutover Startup Safety

## Goal

Make hard-cutover startup fail closed for retired runtimes and prevent
process-local business timers from bypassing canonical jobs.

## Owned paths

- `apps/web/server/jobs/celeryMediaDoctorJob.ts`
- `apps/web/server/_core/index.ts`
- Existing `initialize*Job` startup modules and timer classification helper.
- Focused startup, Redis outage, timer, and runtime-target tests.

## Implementation

Use the shared runtime-target policy to skip or make Media Doctor observation-
only under `FEATURE_186_HARD_CUTOVER=true`. Apply the same policy to any
legacy publisher/worker initialization discovered by Section 01. Do not
remove historical code required for compatibility drain.

Classify every server-side interval into canonical business scheduler, health/
stream/cache maintenance, or product-integration maintenance. Business work
must create canonical intent or use an existing control-plane job. Health,
stream, and cache timers must not mutate job state or provider/billing data.
Google Drive cleanup remains allowed only as an authenticated product call with
canonical scheduling; Google Scheduler/Tasks, Cloud Run, OIDC, and Google
runtime publishers cannot be selected.

## Tests

- Hard-cutover boot initializes no BullMQ/Celery/Cloud Run/Cloud Tasks/Docker or
  Google runtime publisher.
- Media Doctor is disabled or observation-only under hard cutover.
- Redis outage cannot replace PostgreSQL job-control truth.
- Timer classification prevents inline provider, billing, notification,
  cleanup, and reconciliation side effects.
- Drive cleanup allowlist remains green without a Google runtime route.

## Acceptance

A hard-cutover boot has no retired side-effecting runtime path or untracked
business timer. Non-job presentation timers remain explicitly documented.

## Implemented

- `celeryMediaDoctorJob` now exits before creating its compatibility monitor in
  hard cutover.
- Added `feature192TimerPolicy.ts`; remaining in-process business timers and
  recovery sweeps are either canonical/product-integration paths or fail-closed
  as compatibility/external-scheduler paths.
- Added guards for billing, retention, approval, maintenance, team recovery,
  MCP recovery, and legacy media retry startup paths.
- Added regression coverage in `feature192TimerPolicy.test.ts` and the GDrive
  canonical-scheduling contract test.
