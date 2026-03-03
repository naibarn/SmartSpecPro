# Section 05: Stream D Ready Gate Worker

## Objective
Eliminate long white pre-roll by implementing a strict readiness contract between slide renderer and Python worker.

## Scope
- Redefine `window.__slideReady` conditions.
- Implement timing contract (`200ms` poll, `5000ms` soft wait, `2x750ms` retries, `8000ms` hard degrade).
- Apply degrade-vs-fail branching with explicit timeout code rules.
- Align worker behavior with ready-gate outcomes.

## Dependencies
- Requires Section 01 outputs.

## Target Files
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `python-backend/app/tasks/presentation_render.py`
- `python-backend/tests/test_presentation_render_task.py`

## TDD First (Stubs)
- Stub: ready signal requires mount/measure, fonts resolved or timed out, assets loaded/degraded, and two stable frames.
- Stub: route timeout/retry/degrade branch behavior under contract timings.
- Stub: `E_SLIDE_READY_TIMEOUT` emitted only on base layout/text mount failure or invalid payload.
- Stub: worker consumes route readiness outcomes correctly.
- Stub: first-frame non-white threshold and motion checks in export quality fixtures.

## Implementation Tasks
1. Update slide-render route readiness evaluator and timeout loop.
2. Encode one retry-on-timeout before final degrade path.
3. Ensure hard fail only for structural failure conditions.
4. Align worker handling for degraded vs failed slides and preserve trim flow.

## Validation
- Timeout and retry tests pass with deterministic branch coverage.
- White pre-roll acceptance threshold (`<=100ms`) passes on validation fixtures.
- Motion capture checks pass for video slides.

## Risks and Rollback
- Risk: stricter readiness checks increase latency.
- Rollback: retain bounded retries and revert gate thresholds to baseline under feature flag if p95 regresses.

## Done Criteria
- Ready-gate contract is enforced end-to-end and worker tests pass.
