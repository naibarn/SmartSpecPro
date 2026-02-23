# Section-06 Code Review Interview Transcript

**Date:** 2026-02-23
**Section:** section-06-python-fastapi-export
**Verdict after fixes:** APPROVED

---

## Items Presented to User

### H-1: IDOR on GET /export/{celery_task_id}

**Presented:** Any authenticated user can poll any task ID and receive output_url from another user's export. Celery task IDs are random UUIDs (not enumerable), reducing practical exploitability. Options: (a) Add ownership check via DB store of user→taskId; (b) Accept UUID entropy as sufficient protection.

**User decision:** Accept UUID entropy — no ownership check.

**Rationale recorded:** UUID entropy makes guessing infeasible; the overhead of a DB lookup on every status poll is not justified given that export results are not sensitive PII. If requirements change this can be revisited in a later section.

---

### M-3 REVOKED state handling

**Presented:** REVOKED (cancelled) tasks currently fall through to `state=queued`, causing clients waiting for a terminal state to spin indefinitely. Options: (a) Map REVOKED → `state=error`; (b) Add a new `state=cancelled`; (c) Map REVOKED → `state=queued` (keep current).

**User decision:** Map to error.

**Applied:** Added explicit `if state == "REVOKED"` branch returning `state="error"` with `error_message="Task was cancelled"`.

---

## Auto-Fixes Applied (No User Input Required)

### H-2: render_spec unconstrained dict size (auto-fix)

- Added `@field_validator("render_spec")` with `_RENDER_SPEC_MAX_BYTES = 65_536` limit.
- `json.dumps(v).encode()` length check raises `ValueError` → Pydantic returns 422.
- Test added: `test_returns_422_for_oversized_render_spec`.

### H-3: AsyncResult attribute accesses can raise on Redis outage (auto-fix)

- Wrapped the entire `get_export_status` body in `try/except Exception`.
- On exception: returns `state="error"` with `error_message="Status check temporarily unavailable"` (safe, non-leaking message).
- Structured log event `presentation_export_status_check_failed` captures the actual error server-side.

### M-1: Dead imports removed (auto-fix)

- Removed `from sqlalchemy.ext.asyncio import AsyncSession` (never used).
- Removed `from app.core.database import get_db` (never used).

### M-5: No test for broker-down 503 (auto-fix)

- Added `test_returns_503_when_celery_dispatch_raises`: patches `render_presentation.delay` to raise `Exception("Redis connection refused")` and asserts 503 response.

### L-1: render_spec dict type hint (auto-fix)

- Changed `render_spec: dict` to `render_spec: dict[str, Any]` with `from typing import Any` import.

### L-2: POST returns 200 instead of 201 (auto-fix)

- Added `status_code=201` to `@router.post("/export", ...)`.
- Updated all POST success test assertions from 200 → 201.

### L-3: quality missing from dispatch log (auto-fix)

- Added `quality=request.quality` to `logger.info("presentation_export_queued", ...)`.

---

## Items Noted But Not Fixed

### M-2: Async test methods in class (false positive)

- pytest-asyncio 0.23.x with `asyncio_mode = auto` handles `async def` methods in test classes without `@pytest.mark.asyncio`. All 15 tests run correctly. No fix needed.

### M-4: Plan says 401, implementation returns 403 (doc-only)

- HTTPBearer with `auto_error=True` returns 403 for missing Authorization header. This is a framework behavior, not a bug. Section documentation updated to reflect actual behavior. No code fix.

### H-1: IDOR accepted by user decision (see above)

---

## Final Test Count

- **15 tests** in `tests/test_presentations_export_api.py`
- **15/15 passing**
- Tests cover: POST (201 created, 403 unauth, 422 invalid format, 422 invalid quality, 422 oversized render_spec, 503 broker-down, render_spec forwarded, quality+format forwarded) and GET (PENDING→queued, PROGRESS→processing, SUCCESS→done, FAILURE→error, REVOKED→error, unknown→queued, 403 unauth)
