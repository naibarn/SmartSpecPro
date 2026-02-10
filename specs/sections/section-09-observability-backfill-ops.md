# Section 09 - Observability, Backfill, and Operations

## Objective

Provide operational controls and telemetry required to run library indexing and callback reliability flows safely in staged rollout.

## Implemented Scope

- Added lightweight observability primitives for library/callback reliability:
  - in-memory counters for `index`, `callback`, `retry`, and `DLQ` transitions
  - structured log helper with recursive secret redaction
  - correlation IDs on critical index/callback transitions
- Instrumented core reliability services:
  - `library_indexing_service`: enqueue/completed/failed/retry metrics + retry-batch log
  - `media_callback_service`: processed/failed/retry/DLQ metrics + payload-safe structured logs
- Added backfill orchestration controls:
  - tenant-scoped candidate selection
  - dry-run reporting with estimated remaining work
  - pause/resume cursor semantics
  - batch throttling via `max_enqueue` cap
  - idempotent duplicate avoidance (skip items with existing chunks or active jobs)
- Exposed operator execution path in Celery:
  - `run_library_backfill_batch_task` with dry-run/pause/resume knobs
- Added admin operations endpoints for callback/index recovery:
  - `libraryOps.getSummary`
  - `libraryOps.reprocessCallbackDlq`
  - `libraryOps.retryFailedIndexJobs`

## Actual Files Added

- `python-backend/app/services/library_observability.py`
- `python-backend/app/services/library_backfill_service.py`
- `python-backend/tests/unit/services/test_library_backfill_service.py`
- `apps/web/server/services/libraryOpsService.ts`
- `apps/web/server/services/libraryOpsService.test.ts`
- `apps/web/server/routers/libraryOps.ts`
- `specs/reviews/section-09-review.md`
- `specs/reviews/section-09-interview.md`

## Actual Files Modified

- `python-backend/app/services/library_indexing_service.py`
- `python-backend/app/services/media_callback_service.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/tests/unit/services/test_library_indexing_service.py`
- `python-backend/tests/unit/services/test_media_callback_service.py`
- `apps/web/server/routers.ts`

## Tests Added (TDD)

- `test_indexing_metrics_emit_for_success_and_failure`
- `test_callback_metrics_emit_for_success_and_dlq_failure`
- `test_backfill_dry_run_reports_work_without_writes`
- `test_backfill_pause_resume_preserves_cursor_without_duplicates`
- `reprocessCallbackDlqEntry` service tests (success + not found paths)

Run commands used:

- `cd python-backend && uv run pytest -o addopts='' tests/unit/services/test_library_indexing_service.py tests/unit/services/test_media_callback_service.py tests/unit/services/test_library_backfill_service.py -q`
- `npm run -w @smartspec/web test -- server/routers/library.test.ts server/services/libraryService.test.ts server/services/libraryOpsService.test.ts`
- `npm run -w @smartspec/web build`

Result:

- Python: `10 passed`
- Web tests: `12 passed`
- Web build: successful

## Verification

- Dry-run backfill reports workload without creating `library_index_jobs`.
- Pause/resume preserves cursor and prevents duplicate enqueue on restarted scans.
- DLQ reprocess logic marks DLQ as `reprocessed` and returns callback event to `retry_pending`.

## Deviations from Initial Plan

1. Observability is implemented as lightweight in-process counters/logging helpers, not external Prometheus/StatsD export.
- Rationale: keeps rollout-safe instrumentation testable without introducing new infra dependencies in this section.

2. Admin UI dashboard was deferred; only admin tRPC operations were added.
- Rationale: operational recovery APIs were prioritized first, UI can build on these contracts in Section 10+.
