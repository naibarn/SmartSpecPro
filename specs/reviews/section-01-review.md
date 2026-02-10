# Code Review - Section 01 (Reliability Foundation)

## Scope Reviewed

- `python-backend/app/api/v1/media_generation.py`
- `python-backend/app/services/media_callback_service.py`
- `python-backend/app/models/media_callback_event.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/core/celery_app.py`
- `python-backend/app/services/media_task_service.py`
- `apps/web/drizzle/schema.ts`
- `python-backend/tests/unit/services/test_media_callback_service.py`

## Findings

1. `MEDIUM`: Durable callback pipeline can fail at runtime if new DB tables are not present yet.
- Mitigation applied: callback endpoint now has transition-safe fallback to legacy path when durable pipeline throws.

2. `LOW`: Callback status endpoint previously mixed enum/string handling and could return invalid status serialization.
- Mitigation applied: normalized string-based status checks and response payload.

3. `LOW`: External task ID contract was implicit in fetch-result flow.
- Mitigation applied: explicit `provider_task_id` error message in fetch-result path and hard validation in `update_task_by_external_id`.

## Test Coverage Added

- `test_duplicate_callback_is_idempotent`
- `test_transient_missing_task_retries_then_completes`
- `test_missing_provider_task_id_goes_to_dlq`

## Residual Risks

- No full integration test was run against live Postgres + Celery worker + webhook path in this section.
- Drizzle schema was updated, but migration SQL generation/apply is still pending and should be done before production rollout.
