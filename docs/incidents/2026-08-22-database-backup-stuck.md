# Incident: Admin database backup remained running

Date: 2026-08-22
Severity: SEV-3
Status: Fix prepared; production deploy/restart pending

## Summary

An admin backup job was created successfully but did not expose download
buttons. The production site and backup routes were live, but the in-process
BullMQ worker was not guaranteed to keep running after the enqueue request
finished.

## Evidence

- User-visible jobs later reached `ล้มเหลว` with
  `Backup worker stopped before completing the job`; the latest screenshot also
  shows a new job at 07:30 failing with the same message.
- `https://smartaihub.app` health check: HTTP 200, health endpoint up.
- Correct tRPC route exists in production and returns the expected anonymous
  admin permission error; the download route returns the expected anonymous
  admin error.
- Existing production-like images were checked directly:
  `smartspec-web-hyperframes-check-clean:latest` and
  `smartspec-node-api-hyperframes-check:latest` both returned
  `pg_dump: not found`.
- Both production Dockerfiles originally omitted `postgresql-client`.
- The production app runs the BullMQ backup worker in the Cloud Run web
  process. The deployment command did not set `--no-cpu-throttling` or keep one
  minimum instance, so background work could be throttled or interrupted after
  the HTTP enqueue request completed.

## Root cause

There were two independent reliability gaps. First, the backup worker invokes
`pg_dump`, but the Node Alpine production images did not install the PostgreSQL
client. Second, the worker runs as background work inside Cloud Run without
always-on CPU/minimum-instance settings. A worker interruption leaves the job
running until the next startup reconciliation marks it as stopped. The
child-process wrapper also did not handle the `spawn` error or enforce a
timeout, which hid the missing-binary failure mode.

## Fix

- Install `postgresql-client` in both production Node Dockerfiles.
- Handle `pg_dump` startup errors and add a ten-minute command timeout.
- Reconcile stale running jobs after worker restart and return a clear failed
  status instead of leaving the job indefinitely active.
- Require the backup worker to be ready before accepting a new backup request,
  log worker errors, and reject immediately when the worker is unavailable.
- Set Cloud Run `--min-instances=1` and `--no-cpu-throttling` for the node-api
  service in production and staging.

## Validation

- Focused backup/UI/menu tests: 8 files, 23 tests passed.
- Full TypeScript check still reports unrelated repository baseline errors; no
  diagnostics reference the backup changes.
- Production deploy and authenticated download/restore verification remain
  pending because they are external state changes. A new backup must be
  created after the fixed revision is deployed; failed jobs are not retried by
  browser refresh.
