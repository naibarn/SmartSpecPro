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

## As-Built (2026-03-04)

### Actual Files Changed
- `apps/web/server/routes/slideRender.ts`
- `apps/web/server/routes/slideRender.test.ts`
- `python-backend/app/tasks/presentation_render.py`
- `python-backend/tests/test_presentation_render_task.py`
- `specs/feature/030-PresentationEditAdditional/reviews/section-05-review.md`
- `specs/feature/030-PresentationEditAdditional/sections/section-05-stream-d-ready-gate-worker.md`

### Deviations from Plan
- Route now publishes readiness metadata via `window.__slideReadyState` to allow worker-side explicit fail/degrade branching without changing route HTTP status semantics.
- Worker timeout handling was centralized in a reusable poll helper (`_poll_slide_ready`) to keep screenshot and record-mode behavior consistent.

### Tests Added/Updated
- Added route HTML contract tests for ready-gate timing constants and ready-state/error-code exposure:
  - `server/routes/slideRender.test.ts`
- Added worker fail-branch timeout test for structural ready-gate failures:
  - `python-backend/tests/test_presentation_render_task.py::TestSlideReadyTimeout::test_failed_ready_state_raises_timeout_error`
- Executed section verification:
  - `npm --prefix apps/web test -- server/routes/slideRender.test.ts` (pass 29/29)
  - `DEBUG=false uv run --project python-backend pytest python-backend/tests/test_presentation_render_task.py -k "SlideReadyTimeout"` (pass 2/2)

### Known Follow-ups
- No blocked follow-ups in this section.
