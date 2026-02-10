# Section 09 - Observability, Backfill, and Operations

## Objective

Provide operational controls and telemetry required to run library indexing and callback reliability flows safely in staged rollout.

## Scope

- Metrics and structured logs for add/index/search/callback/DLQ paths.
- Backfill orchestration controls (dry-run, batch size, pause/resume, concurrency caps).
- Admin reprocess tooling for callback DLQ and index failures.

## Primary Files

- `python-backend/app/services/` (metrics/logging instrumentation)
- `python-backend/app/tasks/` (backfill control tasks)
- `apps/web/server/routers/` (admin reprocess APIs)
- Optional admin UI pages/components for status and reprocess actions

## Implementation Steps

1. Define metric names and tags for critical workflow edges.
2. Add structured logging with correlation IDs and redaction policy.
3. Implement backfill job orchestrator with controls.
4. Add admin endpoints for DLQ reprocess and failed index retry.
5. Add lightweight dashboard summary endpoints for operational visibility.

## Test-First Checklist

- Test: metrics emit for add/index/search/callback success/failure states.
- Test: backfill dry-run performs no writes and reports estimated work.
- Test: pause/resume preserves cursor and avoids duplicate processing.
- Test: DLQ reprocess endpoint transitions entries correctly.

## Verification

- Run integration tests for backfill control and reprocess flows.

## Exit Criteria

- Operators can observe, throttle, and recover from failures without manual DB edits.
