I now have all the context needed to write a thorough, self-contained section. Here is the generated markdown content:

# Section 04: Python — Celery Task + FastAPI Endpoint

## Overview

This section implements the Python-side async processing layer for the presentation import feature. It connects the two importers built in Sections 02 and 03 to a Celery background task and exposes two FastAPI endpoints for Node.js to drive the workflow.

**Dependencies:** Sections 02 (PPTX Importer) and 03 (Google Slides Importer) must be complete before this section can be implemented. The `ImportResult` dataclass, `PptxImporter`, and `GSlidesImporter` classes must already exist.

**Blocks:** Section 05 (tRPC Router) — Node.js cannot start imports until these endpoints exist.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_import_tasks.py` | Create new |
| `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/presentation_import.py` | Create new |
| `/home/dev/projects/SmartSpecPro/python-backend/app/main.py` | Modify — register new router |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_import_api.py` | Create new |

---

## Tests First

**File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_import_api.py`**

Use the same patterns established in `tests/test_presentations_export_api.py`: `httpx.AsyncClient` with `ASGITransport`, FastAPI `dependency_overrides` for auth bypass, and `unittest.mock.patch` for Celery task dispatch and DB calls.

### FastAPI Endpoint Tests

```python
"""
Tests for POST /api/v1/presentation-import/start
         GET  /api/v1/presentation-import/status/{conversion_id}
         DELETE /api/v1/presentation-import/{conversion_id}

Uses httpx.AsyncClient + ASGITransport. Celery tasks and DB are mocked.
Auth bypassed via FastAPI dependency_overrides.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.auth import get_current_user


def _mock_user(user_id: int = 1, tenant_id: int = 10) -> MagicMock:
    """Minimal mock authenticated user with tenant context."""
    user = MagicMock()
    user.id = user_id
    user.currentTenantId = tenant_id
    user.is_active = True
    return user


def _override_auth(user_id: int = 1, tenant_id: int = 10):
    async def _inner():
        return _mock_user(user_id, tenant_id)
    return _inner


@pytest.mark.integration
class TestStartEndpoint:
    """POST /api/v1/presentation-import/start"""

    async def test_pptx_missing_source_library_item_id_returns_422(self): ...
    async def test_gslides_missing_slides_url_returns_422(self): ...
    async def test_invalid_source_type_returns_422(self): ...
    async def test_valid_pptx_request_enqueues_task_and_returns_task_id(self): ...
    async def test_unauthenticated_request_returns_401(self): ...


@pytest.mark.integration
class TestStatusEndpoint:
    """GET /api/v1/presentation-import/status/{conversion_id}"""

    async def test_returns_status_and_progress_for_own_tenant(self): ...
    async def test_different_tenant_conversion_id_returns_404(self): ...
    async def test_nonexistent_conversion_id_returns_404(self): ...
```

### Celery Task Unit Tests

```python
@pytest.mark.unit
class TestImportPresentationTask:
    """Unit tests for _import_async — mock importers, DB session, and _notify_nodejs."""

    async def test_pptx_path_calls_pptx_importer_with_correct_arguments(self): ...
    async def test_gslides_path_retrieves_token_via_google_token_service(self): ...
    async def test_gslides_path_calls_gslides_importer_with_retrieved_token(self): ...
    async def test_progress_updates_at_5_percent_then_90_percent_then_100(self): ...
    async def test_notify_nodejs_called_with_done_status_on_success(self): ...
    async def test_notify_nodejs_called_with_failed_status_on_exception(self): ...
    async def test_slides_json_over_8mb_is_truncated_with_fidelity_warning(self): ...
```

**Key mock targets for task tests:**
- `app.tasks.presentation_import_tasks.PptxImporter` — replace with `AsyncMock` returning a fixed `ImportResult`
- `app.tasks.presentation_import_tasks.GSlidesImporter` — same
- `app.tasks.presentation_import_tasks.GoogleTokenService` — mock `get_valid_access_token` to return `"fake-token"`
- `app.tasks.presentation_import_tasks._notify_nodejs` — mock with `AsyncMock` to assert call args
- `app.tasks.presentation_import_tasks.AsyncSessionLocal` — use `AsyncMock` context manager

---

## Implementation: Celery Task

**File: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/presentation_import_tasks.py`**

This follows the exact `_run_async()` pattern from `media_tasks.py` — import `_run_async` from there rather than redefining it.

```python
"""
Celery task for importing presentations from PPTX files or Google Slides.

Worker startup (import queue):
  celery -A app.core.celery_app worker -Q presentation_import -c 4 --hostname=import@%h

Environment variables required:
  NODE_INTERNAL_URL          — http://localhost:3000 (default)
  SMARTSPEC_WEB_GATEWAY_TOKEN — shared secret for internal callback auth
"""

import json
import os
import re
import structlog
import httpx
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.tasks.media_tasks import _run_async  # reuse canonical implementation
from app.services.pptx_importer import PptxImporter
from app.services.gslides_importer import GSlidesImporter
from app.services.google_token_service import GoogleTokenService
from app.services.generation.r2_storage import get_r2_storage

logger = structlog.get_logger(__name__)

NODE_INTERNAL_URL = os.environ.get("NODE_INTERNAL_URL", "http://localhost:3000")
WEB_GATEWAY_TOKEN = os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN", "")

# Threshold for truncating slides JSON payload (8 MB)
_SLIDES_JSON_MAX_BYTES = 8 * 1024 * 1024


@celery_app.task(
    name="tasks.import_presentation",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
    time_limit=600,
    soft_time_limit=540,
)
def import_presentation_task(
    self,
    conversion_id: int,
    source_type: str,
    user_id: int,
    tenant_id: int,
    source_item_id: int | None = None,
    slides_url: str | None = None,
):
    """Outer sync entry point — delegates to async inner function via _run_async."""
    return _run_async(
        _import_async(self, conversion_id, source_type, user_id, tenant_id, source_item_id, slides_url)
    )


async def _import_async(task, conversion_id, source_type, user_id, tenant_id, source_item_id, slides_url):
    """
    Async implementation of the import task.

    Steps:
    1. Set status → "processing", progress → 5 in DB.
    2. Dispatch to the appropriate importer (PptxImporter or GSlidesImporter).
    3. Track progress per slide (formula: 5 + int(slide_idx / total * 75)); update DB every 5 slides.
    4. After parsing: set progress → 90.
    5. Truncate slides JSON if > 8 MB.
    6. Notify Node.js callback.
    7. Set status → "done", progress → 100 in DB.
    8. On any exception: set status → "failed", notify Node.js with error, re-raise.
    """
    ...


async def _notify_nodejs(
    conversion_id: int,
    status: str,
    slides=None,
    fidelity_warnings=None,
    error=None,
):
    """
    POST callback to Node.js internal route.
    Does NOT raise on HTTP error — notification failure must not fail the Celery task.
    Logs errors internally.

    Target: {NODE_INTERNAL_URL}/api/internal/presentation-import/callback
    Auth:   Authorization: Bearer {WEB_GATEWAY_TOKEN}
    """
    ...
```

### Task Implementation Details

**DB updates** use `AsyncSessionLocal` as an async context manager. Use a SQLAlchemy `update()` statement targeting `presentationConversionRecords` by `conversion_id`. Do not use the ORM model instance pattern — issue parameterized updates directly to avoid stale state.

**PPTX path:**
1. Query DB for the library item's S3 URL using `source_item_id`.
2. Download PPTX bytes: `async with httpx.AsyncClient() as client: resp = await client.get(s3_url, timeout=120.0)`.
3. Instantiate `PptxImporter(r2_service)` and call `await importer.import_file(pptx_bytes, s3_prefix)`.

**Google Slides path:**
1. Open DB session; instantiate `GoogleTokenService(db)` and call `await token_service.get_valid_access_token(user_id)`.
2. Extract `presentation_id` using anchored regex: `re.search(r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)", slides_url)`. If no match, raise `ValueError("Invalid Google Slides URL")`.
3. Instantiate `GSlidesImporter(access_token, r2_service)` and call `await importer.import_presentation(presentation_id, s3_prefix)`.

**S3 prefix:** `f"{tenant_id}/presentations/imports/{conversion_id}"` — computed in the task, not passed from outside.

**Progress reporting:** Each importer accepts an optional `on_progress` async callback: `async def on_progress(slide_index: int, total: int) -> None`. The task provides a closure that computes `5 + int(slide_index / total * 75)` and writes to DB only if `slide_index % 5 == 0` to throttle writes.

**Slides JSON truncation:** After receiving `ImportResult`, serialize `result.slides` with `json.dumps`. If `len(serialized.encode()) > _SLIDES_JSON_MAX_BYTES`, binary-search for the largest N slides that fit, truncate, and append `"Import truncated: presentation too large to import fully"` to `fidelity_warnings`.

**Exception handling pattern:**
```python
except Exception as exc:
    user_msg = str(exc) if isinstance(exc, (ImportError, ValueError)) else "Import failed due to an internal error"
    # update DB: status="failed", error=user_msg
    await _notify_nodejs(conversion_id, "failed", error=user_msg)
    raise  # re-raise so Celery marks task as FAILURE and retries if configured
```

---

## Implementation: FastAPI Router

**File: `/home/dev/projects/SmartSpecPro/python-backend/app/api/v1/presentation_import.py`**

```python
"""
Presentation Import API endpoints.

POST   /api/v1/presentation-import/start                   — enqueue import task
GET    /api/v1/presentation-import/status/{conversion_id}  — poll status
DELETE /api/v1/presentation-import/{conversion_id}         — cancel (best-effort)
"""
from typing import Optional, Self

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator, model_validator

from app.core.auth import get_current_user
from app.core.database import AsyncSessionLocal
from app.models.user import User

logger = structlog.get_logger(__name__)
router = APIRouter()

try:
    from app.tasks.presentation_import_tasks import import_presentation_task
    CELERY_ENABLED = True
except ImportError:
    import_presentation_task = None  # type: ignore[assignment]
    CELERY_ENABLED = False
    logger.warning("presentation_import_task_not_available")


class StartImportRequest(BaseModel):
    """
    Request body for POST /api/v1/presentation-import/start.

    Validators:
    - source_type must be "pptx" or "google_slides"
    - PPTX requires source_library_item_id
    - google_slides requires slides_url
    """
    conversion_id: int
    source_type: str
    source_library_item_id: Optional[int] = None
    slides_url: Optional[str] = None
    user_id: int
    tenant_id: int

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str: ...

    @model_validator(mode="after")
    def validate_cross_fields(self) -> Self: ...


class StartImportResponse(BaseModel):
    task_id: str


class ImportStatusResponse(BaseModel):
    status: str
    progress: int
    fidelity_warnings: Optional[list[str]] = None
    deck_library_item_id: Optional[int] = None
    error: Optional[str] = None


@router.post("/start", response_model=StartImportResponse, status_code=202)
async def start_import(
    request: StartImportRequest,
    current_user: User = Depends(get_current_user),
) -> StartImportResponse:
    """Validate request and enqueue import_presentation_task."""
    ...


@router.get("/status/{conversion_id}", response_model=ImportStatusResponse)
async def get_import_status(
    conversion_id: int,
    current_user: User = Depends(get_current_user),
) -> ImportStatusResponse:
    """
    Return status of an import job.
    Enforces tenant isolation: filters by both conversion_id AND tenant_id from auth context.
    Returns 404 if record not found or belongs to a different tenant.
    """
    ...


@router.delete("/{conversion_id}", status_code=200)
async def cancel_import(
    conversion_id: int,
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Best-effort task cancellation.
    Calls celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM").
    The conversion record status is managed by the Node.js callback handler, not here.
    Returns {"cancelled": true} regardless of revoke success.
    """
    ...
```

### Endpoint Implementation Notes

**`POST /start`:** The endpoint does NOT validate file size — that is enforced at library upload time. It also does NOT accept an OAuth access token — the Celery task retrieves it from the DB via `GoogleTokenService`. The endpoint's job is only to validate the request shape and enqueue the task.

```python
task = import_presentation_task.apply_async(
    kwargs={
        "conversion_id": request.conversion_id,
        "source_type": request.source_type,
        "user_id": request.user_id,
        "tenant_id": request.tenant_id,
        "source_item_id": request.source_library_item_id,
        "slides_url": request.slides_url,
    },
    queue="presentation_import",
)
return StartImportResponse(task_id=task.id)
```

**`GET /status/{conversion_id}`:** Query `presentationConversionRecords` (SQLAlchemy model or raw SQL) where `id = conversion_id AND tenant_id = current_user.currentTenantId`. If no row found: raise `HTTPException(status_code=404)`. Map DB columns to `ImportStatusResponse` fields.

**`DELETE /{conversion_id}`:** Look up the `task_id` stored on the conversion record (if tracked). Revoke via `celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")`. This is best-effort — do not raise on failure. The Node.js tRPC `cancelImport` procedure handles setting the DB status to `"cancelled"`.

---

## Registering the Router in main.py

**File: `/home/dev/projects/SmartSpecPro/python-backend/app/main.py`**

Add to the `from app.api.v1 import (...)` block:

```python
from app.api.v1 import (
    ...
    presentations_export,
    presentation_import,  # add this line
)
```

Add the `include_router` call after the `presentations_export` router registration:

```python
app.include_router(
    presentations_export.router,
    prefix="/api/v1/presentations",
    tags=["Presentation Export"],
)
app.include_router(
    presentation_import.router,
    prefix="/api/v1/presentation-import",
    tags=["Presentation Import"],
)
```

---

## Environment Variables

Two variables are consumed by the task (read via `os.environ.get` at module import time, consistent with other tasks):

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_INTERNAL_URL` | `http://localhost:3000` | Base URL for `_notify_nodejs` callback |
| `SMARTSPEC_WEB_GATEWAY_TOKEN` | `""` | Shared secret added as `Authorization: Bearer` header on callback |

These must already be set in `python-backend/.env`. The `SMARTSPEC_WEB_GATEWAY_TOKEN` must match the value checked by the Node.js internal route handler (built in Section 06).

---

## Data Flow

```
Node.js tRPC startImport
  → POST /api/v1/presentation-import/start
    → Validate Pydantic model (source_type, cross-field)
    → import_presentation_task.apply_async(kwargs=..., queue="presentation_import")
    → return {task_id}

Celery worker picks up task:
  → _import_async(...)
    → DB: status="processing", progress=5
    → PPTX path: download PPTX bytes → PptxImporter.import_file()
    → GSlides path: GoogleTokenService.get_valid_access_token() → GSlidesImporter.import_presentation()
    → progress callbacks every 5 slides
    → DB: progress=90
    → truncate slides JSON if >8MB
    → _notify_nodejs(conversion_id, "done", slides, fidelity_warnings)
    → DB: status="done", progress=100

  On failure:
    → _notify_nodejs(conversion_id, "failed", error=user_msg)
    → DB: status="failed", error=user_msg
    → re-raise (Celery retries up to max_retries=2)

_notify_nodejs:
  → POST {NODE_INTERNAL_URL}/api/internal/presentation-import/callback
  → Authorization: Bearer {WEB_GATEWAY_TOKEN}
  → Body: {conversionId, status, slides?, fidelityWarnings?, error?}
  → Does NOT raise on HTTP error (logs only)
```

---

## Implementation Notes (Actual vs Planned)

### Files Created/Modified

| File | Status |
|------|--------|
| `python-backend/app/tasks/presentation_import_tasks.py` | Created |
| `python-backend/app/api/v1/presentation_import.py` | Created |
| `python-backend/app/main.py` | Modified — added `presentation_import` router registration |
| `python-backend/tests/test_presentation_import_api.py` | Created |

### Deviations from Plan

1. **R2 storage import path**: Spec said `from app.services.generation.r2_storage import get_r2_storage`. Changed to `from app.services.r2_storage_service import get_r2_storage_service` because `PptxImporter` and `GSlidesImporter` both depend on `r2_storage_service.R2StorageService` with `upload_bytes(key, data, content_type)` signature. The `generation/r2_storage` has a different argument order.

2. **`tenant_id` type**: Spec showed `tenant_id: int` in `StartImportRequest`. Changed to `str` to match DB schema (`varchar(36)`).

3. **`user_id`/`tenant_id` cross-validation added** (code review H1): The endpoint validates that `request.user_id == current_user.id` AND `request.tenant_id == current_user.currentTenantId` to prevent horizontal privilege escalation.

4. **`_update_conversion` now requires `tenant_id`** (code review H2): Added `AND tenant_id = :tid` to UPDATE WHERE clause for tenant isolation.

5. **PPTX download HTTPS-only** (code review S04-05): Added URL scheme validation before `httpx.AsyncClient().get()`. `follow_redirects=True` removed.

6. **Per-slide progress reporting not implemented**: The spec described per-slide `on_progress` callbacks, but `PptxImporter` and `GSlidesImporter` (sections 02/03) were committed without this parameter. Progress jumps directly from 5 → 90 → 100.

7. **Cancel endpoint non-functional**: `presentation_conversion_records` schema lacks a `celery_task_id` column, so revoke is not implementable. Cancel returns `{"cancelled": True}` with a log entry. The Node.js tRPC `cancelImport` handles DB status update independently.

8. **error field always None in status response**: The DB schema has no `error` column on `presentation_conversion_records`. Error details are delivered exclusively via the Node.js callback.

### Tests: 21 tests (all passing)

- `TestStartImportEndpoint` (8 tests): valid pptx/gslides, cross-field validation, identity mismatch 403, unauth 403
- `TestStatusEndpoint` (4 tests): own tenant 200, other tenant 404, not found 404, unauth 403
- `TestCancelEndpoint` (1 test): returns cancelled=true
- `TestImportPresentationTask` (8 tests): pptx path, gslides path (token + importer), progress updates, notify on success/failure, truncation, invalid slides URL

---

## Key Implementation Constraints

- **Do not** accept or forward Google OAuth tokens through HTTP request bodies. The access token is retrieved exclusively within the Celery task via `GoogleTokenService.get_valid_access_token(user_id)`.
- **Do not** log the access token at any level (not even DEBUG).
- **Do not** log `contentUrl` values from Google Slides (they contain embedded auth credentials).
- The `_notify_nodejs` function must catch all exceptions and log them — a callback failure must not cause the Celery task to fail or retry.
- Use `_run_async` imported from `app.tasks.media_tasks` — do not redefine it. This avoids the "event loop is closed" issue in long-running Celery workers.
- `acks_late=True` and `reject_on_worker_lost=True` ensure at-least-once delivery. The Node.js callback handler (Section 06) implements idempotency to handle duplicate callbacks from retries.

---

## Test Command

```bash
cd /home/dev/projects/SmartSpecPro/python-backend
uv run pytest tests/test_presentation_import_api.py -v --cov=app -k "import_api or import_task"
```

Full suite with coverage enforcement:
```bash
uv run pytest --cov=app --cov-fail-under=80
```