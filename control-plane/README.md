# Control Plane — Phase 3 Additions (Task Registry + Gates)

This patch adds Phase 3 primitives on top of the Control Plane:
- Task Registry with deterministic dedupe
- Gate Evaluator (tasks/tests/coverage/security)
- Endpoints to record latest test run, coverage run, and security check

## New/Updated Endpoints

### Tasks
- `GET /api/v1/sessions/:sessionId/tasks`
- `PUT /api/v1/sessions/:sessionId/tasks` (upsert by `dedupeKey`)

### Test Runs
- `POST /api/v1/sessions/:sessionId/test-runs`
- `GET /api/v1/sessions/:sessionId/test-runs/latest`

### Coverage Runs
- `POST /api/v1/sessions/:sessionId/coverage-runs`
- `GET /api/v1/sessions/:sessionId/coverage-runs/latest`

### Security Checks
- `POST /api/v1/sessions/:sessionId/security-checks`
- `GET /api/v1/sessions/:sessionId/security-checks/latest`

### Gate Evaluation
- `GET /api/v1/sessions/:sessionId/gates/evaluate`
  - `tasks`: OK when no planned/doing/blocked tasks remain
  - `tests`: OK when latest testRun.passed == true
  - `coverage`: OK when latest coverage >= COVERAGE_MIN_PERCENT (default 70)
  - `security`: OK when latest status == pass (default pass if none recorded)

## Notes
- This phase focuses on contracts and evaluation; how tests/coverage are produced is runner/CI responsibility.
