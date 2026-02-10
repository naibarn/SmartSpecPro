# Code Review - Section 09 (Observability, Backfill, and Operations)

## Scope Reviewed

- `python-backend/app/services/library_observability.py`
- `python-backend/app/services/library_backfill_service.py`
- `python-backend/app/services/library_indexing_service.py`
- `python-backend/app/services/media_callback_service.py`
- `python-backend/app/tasks/media_tasks.py`
- `apps/web/server/services/libraryOpsService.ts`
- `apps/web/server/routers/libraryOps.ts`

## Findings

1. `MEDIUM`: In-memory metric counters reset on process restart and are not scrape-ready.
- Mitigation applied: metric helper is isolated and can be swapped with exporter backend later; current behavior is deterministic for unit tests.

2. `LOW`: Backfill orchestrator currently uses DB polling only and no distributed lock.
- Mitigation applied: duplicate prevention is enforced by active-job/chunk checks + enqueue idempotency guard.

3. `LOW`: `libraryOps.reprocessCallbackDlq` is API-first and currently lacks UI affordance.
- Mitigation applied: endpoint contract is now stable for dashboard wiring in follow-up section.

## Test Coverage Added

- index pipeline metrics emitted on enqueue/success/failure
- callback pipeline metrics emitted on success and DLQ path
- backfill dry-run no-write behavior with estimated workload
- backfill pause/resume cursor continuity and duplicate avoidance
- DLQ reprocess transition logic to retry pipeline

## Residual Risks

- High-volume observability export/retention is still pending (external sink integration not included).
- Multi-worker backfill scheduling can still create operational contention without global coordinator.
