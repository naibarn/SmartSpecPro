# Section 03: Worker Dispatch, Idempotency, and Retries

## Objective
Align Celery worker execution with selected vector provider and harden job processing semantics for idempotency, retry safety, and dead-letter handling.

## Scope
- Ensure worker task entrypoints resolve provider through shared resolver, not hardcoded defaults.
- Implement idempotency guarantees for duplicate/retried job keys.
- Standardize retry classification and terminal-failure routing.
- Ensure dead-letter outcomes are auditable and replayable.
- Enforce tenant guardrails during worker execution.

## Out of Scope
- API enqueue emission logic (Section 02).
- Backfill orchestration/reporting (Section 05).

## Dependencies
- section-01-provider-abstraction-foundation
- section-02-api-enqueue-hooks-and-job-contract

## Implementation Tasks
1. Integrate provider resolver into worker dispatch path for index/delete operations.
2. Implement idempotency check strategy to avoid duplicate vectors for repeated jobs.
3. Define retry policy by error class (transient vs permanent) and wire Celery retry metadata updates.
4. Implement terminal failure/dead-letter path with sufficient diagnostic context.
5. Add deterministic parsing for versioned payloads and reject malformed jobs safely.
6. Enforce tenant context validation before provider operation execution.

## TDD-First Test Stubs
- Worker dispatches to configured provider from effective settings.
- Duplicate dedupe key does not create duplicate vector records.
- Retry path preserves payload integrity and increments retry metadata.
- Terminal failures enter dead-letter path with auditable event.
- Payload parsing supports legacy and current schema versions.
- Tenant context mismatch is rejected and recorded.

## Risk Controls
- Guard against config/runtime drift by centralizing resolver usage in worker entrypoint.
- Ensure retry loops cannot create unbounded duplicates.
- Preserve replayability and diagnostics for dead-letter operations.

## Done Criteria
- Worker provider dispatch behavior matches control-plane settings.
- Idempotency/retry/dead-letter tests pass.
- Legacy payload compatibility remains intact during transition.

## As-Built (2026-02-16)

### Actual files changed
- `python-backend/app/services/library_indexing_service.py`
- `python-backend/tests/unit/services/test_library_indexing_service.py`

### Deviations from plan
- Worker job ingestion currently accepts optional payload metadata (`job_payload`) but task-entry wiring remains follow-up; existing callers continue to process jobs without payload object.
- Provider resolution is env-backed (`LIBRARY_VECTOR_PROVIDER` / `VECTOR_DB_PROVIDER`) and not yet integrated with persisted switch-state settings.

### Tests added/updated
- Updated: `python-backend/tests/unit/services/test_library_indexing_service.py`
  - worker resolves provider from effective env-backed settings when no explicit upsert function is injected
  - duplicate dedupe key short-circuits duplicate job processing
  - payload parser supports both `v2` and legacy schemas
  - tenant mismatch fails as permanent and records dead-letter metric
  - non-transient runtime errors classify as permanent terminal failures

### Known follow-ups
- Pass queue payload metadata into `process_library_index_job` at the Celery task boundary so parser/tenant guardrails are always exercised.
