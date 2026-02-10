# Code Review - Section 04 (Indexing Pipeline)

## Scope Reviewed

- `python-backend/app/services/library_indexing_service.py`
- `python-backend/tests/unit/services/test_library_indexing_service.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/core/celery_app.py`

## Findings

1. `MEDIUM`: Re-index attempts can create inconsistent chunk/vector mapping if chunk writes happen without deterministic vector IDs.
- Mitigation applied: stable vector IDs (`lib:{tenant}:{item}:{chunk}`) and replace-on-reindex behavior.

2. `LOW`: Retry loops may stall without explicit due-job selection for both fresh and retry jobs.
- Mitigation applied: scheduler selects due `pending` and `retry_pending` jobs.

3. `LOW`: Metadata extraction drift can reduce recall for mixed media/document payloads.
- Mitigation applied: extraction merges core fields with prioritized metadata keys and deterministic normalization.

## Test Coverage Added

- Success flow: enqueue/process/chunk persistence
- Transient failure: retry scheduling + attempt increment
- Terminal failure: failed status + `last_error` diagnostics

## Residual Risks

- Vector backend adapter is unit-tested via injected stub, not yet with live Chroma persistence.
- End-to-end trigger path from API to Celery enqueue is deferred to upcoming sections.
