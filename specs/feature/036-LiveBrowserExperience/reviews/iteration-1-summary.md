# Iteration 1 Review Summary

## Concrete Improvements

### 1. Runtime boundary for authoritative live sessions

- Severity: high
- Impact: high-impact
- Affected area: Python live session manager and execution model
- Rationale: Long-lived interactive sessions do not fit the current finite Celery task pattern cleanly. The plan should explicitly choose the runtime boundary for session ownership.
- Recommended action: decide whether `LiveBrowserSessionManager` runs as a dedicated long-lived Python service/runtime component rather than as Celery task orchestration.

### 2. Align tests with existing repo conventions

- Severity: medium
- Impact: low-impact
- Affected area: regression prevention strategy
- Rationale: The plan should tell implementers where the new tests belong and how they are expected to run.
- Recommended action: bind Python tests to `python-backend/tests` with `uv run pytest` and web tests to the existing Vitest setup under `apps/web`.

### 3. Make operational ownership explicit

- Severity: medium
- Impact: low-impact
- Affected area: operational and release plan
- Rationale: Alert routing and rollout ownership are easier to execute when responsibilities are named by tier.
- Recommended action: add frontend, Node, and Python ownership mapping for live-browser rollout and incident response.
