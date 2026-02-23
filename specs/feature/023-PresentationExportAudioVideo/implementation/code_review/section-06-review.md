# Section-06 Code Review: Python FastAPI Export API

**Verdict: NEEDS WORK**
**Date:** 2026-02-23

---

## HIGH

**H-1: IDOR on GET /export/{celery_task_id} — no ownership check**
- Any authenticated user can poll any task ID and receive `output_url` from another user's export
- Celery task IDs are random UUIDs (not enumerable), reducing practical exploitability
- Plan does not specify ownership enforcement; section-03 also does not store user→taskId association
- **Requires user decision:** Add ownership check, or accept risk given UUID entropy?

**H-2: `render_spec` is unconstrained dict — no size or content validation**
- A caller can POST megabytes of nested data; it goes directly to Redis via Celery serialization
- No max-size validator, no depth limit, no schema enforcement
- Fix: Add `@field_validator("render_spec")` checking `len(json.dumps(v)) <= 65536` (64KB limit)

**H-3: `AsyncResult` attribute accesses can raise on Redis connection failure**
- `result.state`, `result.result`, `result.info` are lazy Redis reads — can raise `ConnectionError` if broker is unreachable
- Section plan incorrectly states "AsyncResult construction itself never raises" — only construction is lazy; attribute access IS a network call
- These are not wrapped in try/except; a Redis outage returns a raw 500 with stack trace
- Fix: Wrap the status endpoint body in try/except for `Exception`, return `state=error` with safe message

---

## MEDIUM

**M-1: Dead imports — `AsyncSession` and `get_db` imported but never used**
- `from sqlalchemy.ext.asyncio import AsyncSession` — never referenced
- `from app.core.database import get_db` — never referenced
- Ruff F401 will flag these; fix: remove both imports

**M-2: Async test methods in class — pytest-asyncio auto mode compatibility**
- All test methods are `async def` inside `@pytest.mark.integration` classes
- With pytest-asyncio 0.23.x and `asyncio_mode = auto`, this works correctly — confirmed by test run
- No action needed (false positive from reviewer on this version)

**M-3: RETRY and REVOKED Celery states not tested**
- `RETRY` state returns `state=queued` (ambiguous for client tracking retries)
- `REVOKED` state (task cancelled) also falls through to `state=queued` — client waiting for terminal state will spin forever
- Fix: Add tests for RETRY→queued and REVOKED→error (or a new `cancelled` state)

**M-4: Plan says 401 for missing auth; implementation returns 403**
- HTTPBearer's `auto_error=True` returns 403 for missing Authorization header, not 401
- Tests correctly assert 403 — plan needs to be updated to reflect actual framework behavior
- No code fix needed; update section documentation only

**M-5: No test for broker-down 503 on POST**
- Section plan's Error Handling section specifies: if `render_presentation.delay()` raises, return 503
- No test exercises this path
- Fix: Add test where `render_presentation.delay` raises `Exception` → expect 503

---

## LOW

**L-1: `render_spec: dict` should be `render_spec: dict[str, Any]`**
- Mypy strict mode prefers explicit type params; fix: `from typing import Any` + `dict[str, Any]`

**L-2: POST returns 200 instead of 201 Created**
- Resource creation should return 201; fix: `@router.post("/export", ..., status_code=201)`

**L-3: `quality` not included in dispatch log event**
- Log event includes `format` and `user_id` but omits `quality` — useful for cost auditing
- Fix: Add `quality=request.quality` to the `logger.info` call

---

## Items Requiring User Decision

1. **H-1**: Should we add ownership enforcement to the GET status endpoint, or accept the UUID-entropy approach?
2. **M-3 REVOKED**: Should REVOKED → `error` or a new `cancelled` state?
