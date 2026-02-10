# Section 01 - Reliability Foundation

## Objective

Stabilize provider result retrieval and callback handling so media completion no longer relies on manual fetch as the primary recovery mechanism.

## Implemented Scope

- Strict `provider_task_id` contract messaging and validation in callback/result update paths.
- Durable callback event persistence model (`media_callback_events`) and DLQ model (`media_callback_dlq`) in Python backend.
- Idempotent callback state handling (duplicate callback payload does not re-apply terminal update).
- Retry scheduling for transient callback failures with exponential backoff.
- Periodic callback retry worker integrated into Celery beat.
- Transition-safe feature-flag behavior for persistent callback pipeline with legacy fallback.

## Actual Files Added

- `python-backend/app/models/media_callback_event.py`
- `python-backend/app/services/media_callback_service.py`
- `python-backend/tests/unit/services/test_media_callback_service.py`
- `specs/reviews/section-01-review.md`
- `specs/reviews/section-01-interview.md`

## Actual Files Modified

- `python-backend/app/api/v1/media_generation.py`
- `python-backend/app/services/media_task_service.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/core/celery_app.py`
- `python-backend/app/models/__init__.py`
- `python-backend/app/core/database.py`
- `apps/web/drizzle/schema.ts`

## Key Implementation Notes

1. Durable callback pipeline feature flag:
- `MEDIA_CALLBACK_PERSISTENT_PIPELINE_ENABLED` (default enabled)
- If durable path errors (e.g., rollout/migration lag), endpoint falls back to legacy callback flow.

2. Idempotency model:
- Callback events are fingerprinted by normalized payload and stored uniquely.
- Duplicate completed events return as duplicate/no-op.
- Terminal media task states are not overwritten by later conflicting terminal callbacks.

3. Retry + DLQ behavior:
- Missing media task for `provider_task_id` is treated as transient (retry pending).
- Missing `provider_task_id` in callback payload is treated as terminal and sent to DLQ.
- New periodic task `retry_media_callback_events` runs every minute.

4. Provider task ID contract:
- `fetch-result` now returns explicit provider task ID error message.
- `update_task_by_external_id` now rejects empty external/provider task ID.

## Tests Added (TDD)

- `test_duplicate_callback_is_idempotent`
- `test_transient_missing_task_retries_then_completes`
- `test_missing_provider_task_id_goes_to_dlq`

Run command used:
- `cd python-backend && uv run pytest -o addopts='' tests/unit/services/test_media_callback_service.py -q`

Result:
- 3 passed

## Deviations from Initial Plan

1. `apps/web/server/routers/media.ts` was not modified in this section.
- Rationale: strict provider-task enforcement was implemented in backend callback/fetch-result paths first, where provider query execution actually happens.

2. `python-backend/app/llm_proxy/providers/kie_ai_provider.py` was not changed.
- Rationale: existing endpoint fallback/normalization logic was already sufficient for this section; reliability gains came from durable callback processing and retry orchestration.

## Remaining Follow-ups

- Generate/apply Drizzle migration SQL for the new callback tables before production rollout.
- Add staging integration test for full webhook -> durable event -> retry worker -> task update pipeline.
