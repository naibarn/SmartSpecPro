# Section 04 - Indexing Pipeline

## Objective

Build asynchronous library indexing pipeline for extract/chunk/embed/upsert with retryable state transitions.

## Implemented Scope

- Added Python indexing service with deterministic state machine:
  - enqueue index job
  - process single job (extract -> chunk -> embed -> vector upsert)
  - retry due jobs
- Added text extraction from library item core fields and metadata sources.
- Added deterministic chunking with token-count metadata and overlap.
- Integrated embedding generation through existing embedding service abstraction.
- Added vector upsert adapter using `VectorCollection` with stable vector IDs.
- Added Celery tasks for single-job processing and periodic retry processing.
- Added Celery route + beat schedule wiring for retry loop.

## Actual Files Added

- `python-backend/app/services/library_indexing_service.py`
- `python-backend/tests/unit/services/test_library_indexing_service.py`
- `specs/reviews/section-04-review.md`
- `specs/reviews/section-04-interview.md`

## Actual Files Modified

- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/core/celery_app.py`

## Key Implementation Notes

1. Job state transitions:
- `pending -> processing -> completed`
- transient errors: `processing -> retry_pending` with exponential backoff.
- terminal errors (`ValueError` or max-attempt reached): `processing -> failed`.

2. Item/chunk persistence behavior:
- Item status set to `indexing` at enqueue, then `ready` on completion.
- Re-index path clears existing `library_chunks` rows and rewrites chunk/vector mapping.
- `vector_ref_id` uses stable IDs: `lib:{tenant_id}:{item_id}:{chunk_index}`.

3. Retry loop:
- Due jobs include `pending` jobs with due `run_at` and `retry_pending` jobs with due `next_retry_at`.
- Periodic Celery beat task executes every minute.

4. Observability:
- Structured logs added for enqueue/completion/retry/terminal-failure events.

## Tests Added (TDD)

- enqueue + successful pipeline persists chunks and completes state transitions
- transient failure schedules retry and increments attempt count
- terminal failure preserves actionable `last_error` metadata

Run commands used:
- `cd python-backend && uv run pytest -o addopts='' tests/unit/services/test_library_indexing_service.py -q`
- `cd python-backend && uv run pytest -o addopts='' tests/unit/services/test_media_callback_service.py tests/unit/models/test_library_models.py tests/unit/services/test_library_indexing_service.py -q`

Results:
- 3 passed (section tests)
- 10 passed (section + regression subset)

## Deviations from Initial Plan

1. Worker tasks were added under `media_tasks.py` (extended existing task module) instead of creating a separate new task module.
- Rationale: keeps queue/retry orchestration in the current media pipeline task entrypoint where related periodic jobs already exist.

## Remaining Follow-ups

- Add integration test against real Chroma persistence path (current tests use injected vector upsert adapter).
- Add API trigger endpoint wiring (Section 05/06) so new jobs are enqueued from user-facing flows.
