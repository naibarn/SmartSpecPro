# Section 01 - Reliability Foundation

## Objective

Stabilize provider result retrieval and callback handling so media completion no longer relies on manual fetch as the primary recovery mechanism.

## Scope

- Strict `provider_task_id` contract enforcement across APIs and service boundaries.
- Durable callback event persistence.
- Retry + DLQ behavior for callback processing failures.
- Idempotent callback state transitions.
- Reconciliation alignment with parser/endpoint model config.

## Primary Files

- `python-backend/app/api/v1/media_generation.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- `apps/web/server/routers/media.ts`
- `apps/web/drizzle/schema.ts` (new callback reliability tables)

## Implementation Steps

1. Define callback persistence schema (`media_callback_events`, `media_callback_dlq`) and status enums.
2. Refactor callback endpoint to write durable event records before task mutation.
3. Add idempotency checks for duplicate callback payloads and terminal task states.
4. Implement retry worker logic with exponential backoff and attempt counters.
5. Route terminal callback failures to DLQ with full diagnostic context.
6. Ensure fetch-result and reconcile paths use explicit provider task identifier.
7. Add feature flag for persistent callback pipeline and transition-safe behavior.

## Test-First Checklist

- Test: duplicate callback payload does not create duplicate terminal updates.
- Test: transient callback processing failure retries and eventually succeeds.
- Test: terminal callback failure enters DLQ with expected metadata.
- Test: reconcile job updates stale processing tasks correctly for success/fail provider states.
- Test: invalid or missing `provider_task_id` contract errors are explicit.

## Verification

- Run targeted Python integration tests for callback/reconcile paths.
- Run web router tests for fetch-result contract validation.

## Exit Criteria

- Persistent callback path is functional and idempotent.
- Retry and DLQ behavior is observable and operator-actionable.
- Provider task ID mapping ambiguity is removed from result-query flow.
