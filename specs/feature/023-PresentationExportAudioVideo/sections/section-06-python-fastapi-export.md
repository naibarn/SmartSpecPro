Now I have enough context to generate the section content. Let me compile the complete section.

# Section 06: Python Backend — FastAPI Export API

## Overview

This section implements the FastAPI endpoints that bridge the Node.js backend to the Celery presentation render task. It is the Python-side counterpart to the Node.js export service (section-03) and must be in place before the Celery render task (section-07) can be integrated end-to-end.

**Implementation position in the dependency graph:** This section is in Batch 4 and depends on section-14 (Infrastructure / Docker environment). It can be developed in parallel with section-04 (tRPC router). It is a hard dependency of section-07 (Celery render task).

**Prerequisites (must be complete before starting):**
- Section 14 (Infrastructure): Playwright/Chromium installed in Docker image, `JWT_SECRET` and `INTERNAL_RENDER_BASE_URL` env vars set, `presentation_export` queue registered in `celery_app.py`.

---

## Tests First

Write these tests before implementing the module. Test file location:

```
python-backend/tests/test_presentations_export_api.py
```

All tests in this file are `@pytest.mark.integration` — they use FastAPI's `TestClient` and mock the Celery `AsyncResult` / `delay()` calls.

### Test Stubs

```python
"""
Integration tests for the presentation export FastAPI endpoints.

Uses FastAPI TestClient (synchronous). Celery tasks and AsyncResult are
mocked — no real Celery broker required.
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# The app fixture and auth_headers fixture are assumed to come from conftest.py
# (same pattern used by other integration tests in this test suite).


@pytest.mark.integration
class TestPresentationExportPost:
    """POST /api/v1/presentations/export"""

    def test_returns_celery_task_id_and_queued_status(self, client: TestClient, auth_headers: dict):
        """Valid authenticated request enqueues Celery task and returns task id."""
        ...

    def test_returns_401_without_auth_header(self, client: TestClient):
        """Unauthenticated request is rejected with 401."""
        ...

    def test_returns_422_for_invalid_format(self, client: TestClient, auth_headers: dict):
        """Request with format not in (png, jpg, pdf, mp4) returns 422 validation error."""
        ...

    def test_returns_422_for_invalid_quality(self, client: TestClient, auth_headers: dict):
        """Request with quality not in (draft, standard, high) returns 422."""
        ...

    def test_render_spec_passed_to_celery_task(self, client: TestClient, auth_headers: dict):
        """The render_spec dict from the request body is forwarded to the Celery task unchanged."""
        ...

    def test_format_and_quality_passed_to_celery_task(self, client: TestClient, auth_headers: dict):
        """format and quality values from the request are forwarded to the Celery task."""
        ...


@pytest.mark.integration
class TestPresentationExportGetStatus:
    """GET /api/v1/presentations/export/{celery_task_id}"""

    def test_returns_percent_and_stage_for_pending_task(self, client: TestClient, auth_headers: dict):
        """Polling a PENDING task returns state=queued, percent=0, stage=None."""
        ...

    def test_returns_progress_for_in_progress_task(self, client: TestClient, auth_headers: dict):
        """Polling a PROGRESS task returns state=processing with percent and stage from meta."""
        ...

    def test_returns_done_and_output_url_for_successful_task(self, client: TestClient, auth_headers: dict):
        """When AsyncResult state is SUCCESS, response includes state=done and output_url."""
        ...

    def test_returns_error_and_message_for_failed_task(self, client: TestClient, auth_headers: dict):
        """When AsyncResult state is FAILURE, response includes state=error and error_message."""
        ...

    def test_unknown_task_id_returns_queued_state(self, client: TestClient, auth_headers: dict):
        """An unrecognised task_id returns state=queued (Celery PENDING), not 404."""
        ...

    def test_returns_401_without_auth_header(self, client: TestClient):
        """Unauthenticated status poll is rejected with 401."""
        ...
```

### Key Mocking Pattern

Because Celery is not running during tests, patch the task's `.delay()` and `AsyncResult`:

```python
# In test body — mock render_presentation.delay
with patch("app.api.v1.presentations_export.render_presentation") as mock_task:
    mock_task.delay.return_value = MagicMock(id="test-celery-task-id-123")
    response = client.post("/api/v1/presentations/export", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["celery_task_id"] == "test-celery-task-id-123"
    assert response.json()["status"] == "queued"

# Mock AsyncResult for status endpoint
with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
    mock_result = MagicMock()
    mock_result.state = "PROGRESS"
    mock_result.info = {"percent": 45, "stage": "rendering"}
    mock_result_cls.return_value = mock_result
    response = client.get(f"/api/v1/presentations/export/test-celery-task-id-123", headers=auth_headers)
    assert response.json()["state"] == "processing"
    assert response.json()["percent"] == 45
```

---

## Implementation

### File to Create

```
python-backend/app/api/v1/presentations_export.py
```

### Pydantic Models

Define three models in the module. Follow the existing pattern from `media_generation.py` (class-based Pydantic `BaseModel`, no `@validator` — use `field_validator` for Pydantic v2 if validation is needed):

```python
from pydantic import BaseModel
from typing import Optional


class PresentationExportRequest(BaseModel):
    """Request body for POST /api/v1/presentations/export."""
    render_spec: dict
    quality: str   # "draft" | "standard" | "high"
    format: str    # "png" | "jpg" | "pdf" | "mp4"


class PresentationExportJobResponse(BaseModel):
    """Response from POST — the enqueued Celery job."""
    celery_task_id: str
    status: str  # always "queued" on creation


class PresentationExportStatusResponse(BaseModel):
    """Response from GET — current task state."""
    celery_task_id: str
    state: str              # "queued" | "processing" | "done" | "error"
    percent: int            # 0–100
    stage: Optional[str]    # e.g. "rendering", "encoding", "uploading"
    output_url: Optional[str]
    error_message: Optional[str]
```

Add Pydantic field validators on `PresentationExportRequest` to enforce allowed values:
- `format` must be one of `{"png", "jpg", "pdf", "mp4"}`
- `quality` must be one of `{"draft", "standard", "high"}`

Return a clear 422 error if either constraint is violated (Pydantic validation errors are automatically returned as 422 by FastAPI).

### Router and Endpoints

```python
import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User

logger = structlog.get_logger(__name__)
router = APIRouter()
```

**Import the Celery task with a graceful fallback** (same pattern used in `media_generation.py`):

```python
try:
    from app.tasks.presentation_render import render_presentation
    CELERY_ENABLED = True
except ImportError:
    CELERY_ENABLED = False
    logger.warning("presentation_render_task_not_available")
```

**`POST /api/v1/presentations/export`**

- Requires authentication via `Depends(get_current_user)`.
- Validates the request body as `PresentationExportRequest`.
- If `CELERY_ENABLED` is `False`, raises `HTTPException(503, "Export service unavailable")`.
- Calls `render_presentation.delay(request.render_spec, request.quality, request.format)`.
- Returns `PresentationExportJobResponse(celery_task_id=task.id, status="queued")`.
- Log the dispatch at `INFO` level with `celery_task_id` and `format`.

**`GET /api/v1/presentations/export/{celery_task_id}`**

- Requires authentication via `Depends(get_current_user)`.
- Constructs `AsyncResult(celery_task_id)` from the Celery result backend.
- Translates Celery state to the response model:

| Celery state | `state` field | Notes |
|---|---|---|
| `PENDING` | `"queued"` | Task not yet picked up by worker |
| `STARTED` | `"processing"` | Worker started, no progress yet |
| `PROGRESS` | `"processing"` | `result.info` contains `percent` and `stage` |
| `SUCCESS` | `"done"` | `result.result` is `{"output_url": ..., "output_bytes": ...}` |
| `FAILURE` | `"error"` | `result.result` is the exception; convert to string |
| Any other | `"queued"` | Treat unknown states as pending |

- For `PROGRESS` state, `result.info` is the `meta` dict passed to `self.update_state()` in the task. Extract `percent` (default `0`) and `stage` (default `None`).
- For `SUCCESS`, extract `output_url` from `result.result`.
- For `FAILURE`, extract the error string from `result.result` (may be an `Exception` — use `str(result.result)`).
- Returns `PresentationExportStatusResponse`.

### Router Registration

Add the import and `include_router` call to `python-backend/app/main.py`.

**Import** (add to the `from app.api.v1 import (...)` block):

```python
from app.api.v1 import (
    ...
    # existing imports
    presentations_export,  # Presentation export endpoints
)
```

**Router registration** (add near the other `/api/v1` routers, e.g. after `media_advanced`):

```python
app.include_router(
    presentations_export.router,
    prefix="/api/v1/presentations",
    tags=["Presentation Export"],
)
```

This makes the endpoints available at:
- `POST /api/v1/presentations/export`
- `GET /api/v1/presentations/export/{celery_task_id}`

---

## Authentication

Both endpoints use the existing `get_current_user` dependency from `app.core.auth`. This validates the `Authorization: Bearer <token>` header using the existing JWT infrastructure. Unauthenticated requests get a `401 Unauthorized` automatically from the dependency.

The auth token in this context is the internal service-to-service JWT signed by Node.js with `signBearerToken({ scopes: ["internal:render"] })`. The existing `get_current_user` dependency validates the signature using `JWT_SECRET` (shared between Node.js and Python). No special scope-checking logic is needed in this endpoint — bearer token presence and validity is sufficient.

---

## Celery State Machine Reference

The task defined in section-07 calls `self.update_state()` at each stage. The status endpoint observes these states via `AsyncResult`. The mapping is:

```
Task calls:                          Status endpoint observes:
  self.update_state(                   result.state == "PROGRESS"
    state="PROGRESS",                  result.info == {"percent": N, "stage": "..."}
    meta={"percent": 45, "stage": "rendering"}
  )

  return {"output_url": ..., ...}      result.state == "SUCCESS"
                                       result.result == {"output_url": "...", "output_bytes": N}

  raise Exception("...")               result.state == "FAILURE"
                                       result.result == Exception("...")
```

Celery's default `PENDING` state (before a worker picks up the task, or for an unknown task ID) maps to `"queued"` in the API response. This is intentional: an unknown task ID should not return 404, because the Node.js backend may poll briefly before the Celery broker has acknowledged the task.

---

## Error Handling

- If `render_presentation.delay()` raises (e.g., broker connectivity error), catch the exception, log it, and return `HTTP 503 Service Unavailable` with a human-readable message. Do not expose internal Celery connection details in the response body.
- For the status endpoint, `AsyncResult` construction itself never raises — it only reads from Redis lazily. No additional error handling is needed beyond the Celery state translation above.

---

## Code Style Requirements

Follow the Python backend conventions (from `CLAUDE.md`):
- **Black**: 100 character line length
- **isort**: Black-compatible profile
- **Ruff**: E, W, F, I, B, C4, UP rules
- **mypy**: Gradual typing — all function signatures should have type annotations
- **structlog**: Use `logger = structlog.get_logger(__name__)` for logging; never `print()`
- **Pydantic v2**: Use `.model_dump()` not `.dict()`, `field_validator` not `validator`
- **Absolute imports**: `from app.api.v1.presentations_export import ...` not relative

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `python-backend/app/api/v1/presentations_export.py` | Create (new module) |
| `python-backend/app/main.py` | Modify — add import and `include_router` call |
| `python-backend/tests/test_presentations_export_api.py` | Create (new test file) |

---

## Dependencies on Other Sections

- **Section 14 (Infrastructure)** — must be complete first. The `presentation_export` Celery queue must be registered in `celery_app.py` before this module can import `render_presentation`. The graceful `try/except ImportError` fallback handles the case where section-07 is not yet implemented.
- **Section 07 (Python Celery Task)** — the `render_presentation` task imported here. Until section-07 is implemented, the `CELERY_ENABLED = False` fallback path will be taken and the `POST` endpoint returns `503`.
- **Section 03 (Node.js Export Service)** — the Node.js service calls these endpoints. The contract between Node.js and Python is: Node sends `{ render_spec, quality, format }`, Python returns `{ celery_task_id, status }`. This must match exactly.

---

## Implementation Results

**Status:** Complete — committed 2026-02-23

### Deviations from Plan

1. **Test client pattern changed:** Plan specified `fastapi.testclient.TestClient` with `client` + `auth_headers` fixtures from `conftest.py`. The conftest.py SQLite test DB is incompatible with JSONB columns used elsewhere in the app. Instead, tests use `httpx.AsyncClient + ASGITransport(app=app)` with `app.dependency_overrides[get_current_user]` — the correct FastAPI async integration test pattern, consistent with `test_api_workflows.py`.

2. **Auth returns 403 not 401:** Plan stated unauthenticated requests return 401. FastAPI's `HTTPBearer(auto_error=True)` actually returns 403 for missing Authorization header. Tests assert 403. This is framework behavior, not configurable.

3. **POST returns 201 not 200:** Code review (L-2) correctly flagged that resource creation should return 201. Added `status_code=201` to the `@router.post` decorator.

4. **render_spec size validation added:** Code review (H-2) — added `@field_validator("render_spec")` checking `len(json.dumps(v).encode()) <= 65_536` (64KB limit). Returns 422 for oversized payloads.

5. **REVOKED state mapped to error:** Code review (M-3) + user decision — `REVOKED` tasks (cancelled) return `state="error"` with `error_message="Task was cancelled"`, preventing clients from waiting indefinitely for a terminal state.

6. **AsyncResult wrapped in try/except:** Code review (H-3) — `AsyncResult` attribute accesses are lazy Redis reads that raise on broker outage. Wrapped entire `get_export_status` body in `try/except Exception` returning `state="error"` with safe message.

7. **Dead imports removed:** `AsyncSession` and `get_db` were in the plan's import snippet but never used. Removed.

8. **`render_spec: dict[str, Any]`:** Changed from untyped `dict` for mypy strict compliance.

9. **quality added to dispatch log:** Code review (L-3) — `quality=request.quality` added to the `logger.info` call for cost auditing.

### Files Created / Modified

| File | Action |
|------|--------|
| `python-backend/app/api/v1/presentations_export.py` | Created |
| `python-backend/app/main.py` | Modified — added import + `include_router` |
| `python-backend/tests/test_presentations_export_api.py` | Created |

### Test Count

**15 tests, 15/15 passing**

POST (8): celery_task_id returned, 403 unauth, 422 invalid format, 422 invalid quality, 422 oversized render_spec, 503 broker-down, render_spec forwarded to task, quality+format forwarded to task

GET (7): PENDING→queued, PROGRESS→processing (with meta), SUCCESS→done+output_url, FAILURE→error+message, REVOKED→error, unknown→queued, 403 unauth