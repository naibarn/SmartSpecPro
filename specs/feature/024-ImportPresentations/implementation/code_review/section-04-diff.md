diff --git a/python-backend/app/api/v1/presentation_import.py b/python-backend/app/api/v1/presentation_import.py
new file mode 100644
index 0000000..ad0e70c
--- /dev/null
+++ b/python-backend/app/api/v1/presentation_import.py
@@ -0,0 +1,196 @@
+"""
+Presentation Import API endpoints.
+
+POST   /api/v1/presentation-import/start                  — enqueue import task
+GET    /api/v1/presentation-import/status/{conversion_id} — poll status
+DELETE /api/v1/presentation-import/{conversion_id}        — cancel (best-effort)
+"""
+
+from typing import Optional, Self
+
+import structlog
+from fastapi import APIRouter, Depends, HTTPException, status
+from pydantic import BaseModel, field_validator, model_validator
+from sqlalchemy import text
+
+from app.core.auth import get_current_user
+from app.core.database import AsyncSessionLocal
+from app.models.user import User
+
+logger = structlog.get_logger(__name__)
+router = APIRouter()
+
+# Import Celery task with graceful fallback (worker may not be installed yet).
+try:
+    from app.tasks.presentation_import_tasks import import_presentation_task
+
+    CELERY_ENABLED = True
+except ImportError:
+    import_presentation_task = None  # type: ignore[assignment]
+    CELERY_ENABLED = False
+    logger.warning("presentation_import_task_not_available")
+
+
+# ---------------------------------------------------------------------------
+# Pydantic models
+# ---------------------------------------------------------------------------
+
+
+_ALLOWED_SOURCE_TYPES = frozenset({"pptx", "google_slides"})
+
+
+class StartImportRequest(BaseModel):
+    """Request body for POST /api/v1/presentation-import/start.
+
+    Validators:
+    - source_type must be "pptx" or "google_slides"
+    - pptx requires source_library_item_id
+    - google_slides requires slides_url
+    """
+
+    conversion_id: int
+    source_type: str
+    source_library_item_id: Optional[int] = None
+    slides_url: Optional[str] = None
+    user_id: int
+    tenant_id: str
+
+    @field_validator("source_type")
+    @classmethod
+    def validate_source_type(cls, v: str) -> str:
+        if v not in _ALLOWED_SOURCE_TYPES:
+            raise ValueError(
+                f"source_type must be one of {sorted(_ALLOWED_SOURCE_TYPES)}, got '{v}'"
+            )
+        return v
+
+    @model_validator(mode="after")
+    def validate_cross_fields(self) -> Self:
+        if self.source_type == "pptx" and self.source_library_item_id is None:
+            raise ValueError("source_library_item_id is required for pptx imports")
+        if self.source_type == "google_slides" and not self.slides_url:
+            raise ValueError("slides_url is required for google_slides imports")
+        return self
+
+
+class StartImportResponse(BaseModel):
+    task_id: str
+
+
+class ImportStatusResponse(BaseModel):
+    status: str
+    progress: int
+    fidelity_warnings: Optional[list[str]] = None
+    deck_library_item_id: Optional[int] = None
+    error: Optional[str] = None
+
+
+# ---------------------------------------------------------------------------
+# Endpoints
+# ---------------------------------------------------------------------------
+
+
+@router.post("/start", response_model=StartImportResponse, status_code=202)
+async def start_import(
+    request: StartImportRequest,
+    current_user: User = Depends(get_current_user),
+) -> StartImportResponse:
+    """Validate request and enqueue import_presentation_task."""
+    if not CELERY_ENABLED:
+        raise HTTPException(
+            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+            detail="Import service unavailable",
+        )
+
+    try:
+        task = import_presentation_task.apply_async(
+            kwargs={
+                "conversion_id": request.conversion_id,
+                "source_type": request.source_type,
+                "user_id": request.user_id,
+                "tenant_id": request.tenant_id,
+                "source_item_id": request.source_library_item_id,
+                "slides_url": request.slides_url,
+            },
+            queue="presentation_import",
+        )
+    except Exception as exc:
+        logger.error("presentation_import_dispatch_failed", error=str(exc))
+        raise HTTPException(
+            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+            detail="Import service temporarily unavailable",
+        )
+
+    logger.info(
+        "presentation_import_queued",
+        celery_task_id=task.id,
+        conversion_id=request.conversion_id,
+        source_type=request.source_type,
+        user_id=current_user.id,
+    )
+    return StartImportResponse(task_id=task.id)
+
+
+@router.get("/status/{conversion_id}", response_model=ImportStatusResponse)
+async def get_import_status(
+    conversion_id: int,
+    current_user: User = Depends(get_current_user),
+) -> ImportStatusResponse:
+    """Return status of an import job.
+
+    Enforces tenant isolation: filters by both conversion_id AND tenant_id from auth context.
+    Returns 404 if record not found or belongs to a different tenant.
+    """
+    async with AsyncSessionLocal() as session:
+        result = await session.execute(
+            text(
+                """
+                SELECT status, progress, fidelity_warnings, deck_library_item_id
+                FROM presentation_conversion_records
+                WHERE id = :cid AND tenant_id = :tid
+                """
+            ),
+            {"cid": conversion_id, "tid": current_user.currentTenantId},
+        )
+        row = result.fetchone()
+
+    if not row:
+        raise HTTPException(
+            status_code=status.HTTP_404_NOT_FOUND,
+            detail="Conversion record not found",
+        )
+
+    return ImportStatusResponse(
+        status=row.status,
+        progress=row.progress,
+        fidelity_warnings=row.fidelity_warnings,
+        deck_library_item_id=row.deck_library_item_id,
+        error=None,
+    )
+
+
+@router.delete("/{conversion_id}", status_code=200)
+async def cancel_import(
+    conversion_id: int,
+    current_user: User = Depends(get_current_user),
+) -> dict:
+    """Best-effort task cancellation.
+
+    The conversion record status is managed by the Node.js callback handler, not here.
+    Returns {"cancelled": true} regardless of revoke success.
+    """
+    try:
+        from app.core.celery_app import celery_app
+
+        # We don't store the Celery task ID on the conversion record, so we can
+        # only log the intent here. The Node.js tRPC cancelImport procedure sets
+        # the DB status to "cancelled" independently.
+        logger.info(
+            "presentation_import_cancel_requested",
+            conversion_id=conversion_id,
+            user_id=current_user.id,
+        )
+    except Exception as exc:
+        logger.warning("presentation_import_cancel_warning", error=str(exc))
+
+    return {"cancelled": True}
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index 1938a58..56d12e0 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -75,6 +75,7 @@ from app.api.v1 import (
     media_advanced,
     webhooks,
     presentations_export,  # Presentation export endpoints
+    presentation_import,   # Presentation import endpoints
 )
 
 # Initialize Sentry before anything else (captures startup errors)
@@ -254,6 +255,11 @@ app.include_router(
     prefix="/api/v1/presentations",
     tags=["Presentation Export"],
 )
+app.include_router(
+    presentation_import.router,
+    prefix="/api/v1/presentation-import",
+    tags=["Presentation Import"],
+)
 
 # Media Job processing (FFmpeg worker bridge)
 from app.api.v1 import media_jobs as media_jobs_api
diff --git a/python-backend/app/tasks/presentation_import_tasks.py b/python-backend/app/tasks/presentation_import_tasks.py
new file mode 100644
index 0000000..3287fc9
--- /dev/null
+++ b/python-backend/app/tasks/presentation_import_tasks.py
@@ -0,0 +1,311 @@
+"""
+Celery task for importing presentations from PPTX files or Google Slides.
+
+Worker startup (import queue):
+  celery -A app.core.celery_app worker -Q presentation_import -c 4 --hostname=import@%h
+
+Environment variables required:
+  NODE_INTERNAL_URL           — http://localhost:3000 (default)
+  SMARTSPEC_WEB_GATEWAY_TOKEN — shared secret for internal callback auth
+"""
+
+import json
+import os
+import re
+
+import httpx
+import structlog
+from sqlalchemy import text
+
+from app.core.celery_app import celery_app
+from app.core.database import AsyncSessionLocal
+from app.services.google_token_service import GoogleTokenService
+from app.services.gslides_importer import GSlidesImporter
+from app.services.pptx_importer import PptxImporter
+from app.services.r2_storage_service import get_r2_storage_service
+from app.tasks.media_tasks import _run_async  # reuse canonical implementation
+
+logger = structlog.get_logger(__name__)
+
+NODE_INTERNAL_URL = os.environ.get("NODE_INTERNAL_URL", "http://localhost:3000")
+WEB_GATEWAY_TOKEN = os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN", "")
+
+# Threshold for truncating slides JSON payload (8 MB)
+_SLIDES_JSON_MAX_BYTES = 8 * 1024 * 1024
+
+
+# ---------------------------------------------------------------------------
+# Celery task entry point
+# ---------------------------------------------------------------------------
+
+
+@celery_app.task(
+    name="tasks.import_presentation",
+    bind=True,
+    max_retries=2,
+    default_retry_delay=30,
+    acks_late=True,
+    reject_on_worker_lost=True,
+    time_limit=600,
+    soft_time_limit=540,
+)
+def import_presentation_task(
+    self,
+    conversion_id: int,
+    source_type: str,
+    user_id: int,
+    tenant_id: str,
+    source_item_id: int | None = None,
+    slides_url: str | None = None,
+):
+    """Outer sync entry point — delegates to async inner function via _run_async."""
+    return _run_async(
+        _import_async(self, conversion_id, source_type, user_id, tenant_id, source_item_id, slides_url)
+    )
+
+
+# ---------------------------------------------------------------------------
+# DB helper
+# ---------------------------------------------------------------------------
+
+
+async def _update_conversion(
+    conversion_id: int,
+    status: str | None = None,
+    progress: int | None = None,
+    fidelity_warnings: list[str] | None = None,
+) -> None:
+    """Update presentation_conversion_records using raw SQL."""
+    sets: list[str] = []
+    params: dict = {"cid": conversion_id}
+
+    if status is not None:
+        sets.append("status = :status")
+        params["status"] = status
+    if progress is not None:
+        sets.append("progress = :progress")
+        params["progress"] = progress
+    if fidelity_warnings is not None:
+        sets.append("fidelity_warnings = :fw::json")
+        params["fw"] = json.dumps(fidelity_warnings)
+
+    if not sets:
+        return
+
+    sets.append("updated_at = now()")
+    sql = f"UPDATE presentation_conversion_records SET {', '.join(sets)} WHERE id = :cid"
+    async with AsyncSessionLocal() as session:
+        await session.execute(text(sql), params)
+        await session.commit()
+
+
+# ---------------------------------------------------------------------------
+# Async implementation
+# ---------------------------------------------------------------------------
+
+
+async def _import_async(
+    task,
+    conversion_id: int,
+    source_type: str,
+    user_id: int,
+    tenant_id: str,
+    source_item_id: int | None,
+    slides_url: str | None,
+) -> None:
+    """Async implementation of the import task.
+
+    Steps:
+    1. Set status → "processing", progress → 5 in DB.
+    2. Dispatch to the appropriate importer (PptxImporter or GSlidesImporter).
+    3. After parsing: set progress → 90.
+    4. Truncate slides JSON if > 8 MB.
+    5. Notify Node.js callback.
+    6. Set status → "done", progress → 100 in DB.
+    7. On any exception: set status → "failed", notify Node.js with error, re-raise.
+    """
+    s3_prefix = f"{tenant_id}/presentations/imports/{conversion_id}"
+    r2 = get_r2_storage_service()
+
+    try:
+        # Step 1: Mark as processing
+        await _update_conversion(conversion_id, status="processing", progress=5)
+
+        if source_type == "pptx":
+            result = await _run_pptx_import(conversion_id, source_item_id, s3_prefix, r2)
+        elif source_type == "google_slides":
+            result = await _run_gslides_import(conversion_id, user_id, slides_url, s3_prefix, r2)
+        else:
+            raise ValueError(f"Unknown source_type: {source_type!r}")
+
+        # Step 3: Progress 90 after parsing
+        await _update_conversion(conversion_id, progress=90)
+
+        # Step 4: Truncate slides JSON if > 8 MB
+        slides = result.slides
+        fidelity_warnings = list(result.fidelity_warnings)
+
+        serialized = json.dumps(slides)
+        if len(serialized.encode()) > _SLIDES_JSON_MAX_BYTES:
+            slides, fidelity_warnings = _truncate_slides(slides, fidelity_warnings)
+
+        # Step 5: Notify Node.js
+        await _notify_nodejs(
+            conversion_id,
+            "done",
+            slides=slides,
+            fidelity_warnings=fidelity_warnings,
+        )
+
+        # Step 6: Update DB: done
+        await _update_conversion(
+            conversion_id,
+            status="done",
+            progress=100,
+            fidelity_warnings=fidelity_warnings,
+        )
+
+        logger.info("presentation_import_complete", conversion_id=conversion_id)
+
+    except Exception as exc:
+        user_msg = (
+            str(exc)
+            if isinstance(exc, (ImportError, ValueError))
+            else "Import failed due to an internal error"
+        )
+        logger.error("presentation_import_failed", conversion_id=conversion_id, error=str(exc))
+        await _update_conversion(conversion_id, status="failed")
+        await _notify_nodejs(conversion_id, "failed", error=user_msg)
+        raise
+
+
+# ---------------------------------------------------------------------------
+# Path-specific helpers
+# ---------------------------------------------------------------------------
+
+
+async def _run_pptx_import(
+    conversion_id: int,
+    source_item_id: int | None,
+    s3_prefix: str,
+    r2,
+):
+    """Download the PPTX file and run PptxImporter."""
+    async with AsyncSessionLocal() as session:
+        result = await session.execute(
+            text("SELECT source_url FROM library_items WHERE id = :item_id"),
+            {"item_id": source_item_id},
+        )
+        row = result.fetchone()
+        if not row or not row.source_url:
+            raise ValueError(f"Library item {source_item_id} has no source URL")
+        s3_url = row.source_url
+
+    async with httpx.AsyncClient(timeout=120.0) as client:
+        resp = await client.get(s3_url, follow_redirects=True)
+        resp.raise_for_status()
+        pptx_bytes = resp.content
+
+    importer = PptxImporter(r2_service=r2)
+    return await importer.import_file(pptx_bytes, s3_prefix)
+
+
+async def _run_gslides_import(
+    conversion_id: int,
+    user_id: int,
+    slides_url: str | None,
+    s3_prefix: str,
+    r2,
+):
+    """Retrieve the access token and run GSlidesImporter."""
+    async with AsyncSessionLocal() as session:
+        token_service = GoogleTokenService(session)
+        access_token = await token_service.get_valid_access_token(user_id)
+
+    match = re.search(
+        r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)",
+        slides_url or "",
+    )
+    if not match:
+        raise ValueError("Invalid Google Slides URL")
+    presentation_id = match.group(1)
+
+    importer = GSlidesImporter(access_token=access_token, r2_service=r2)
+    return await importer.import_presentation(presentation_id, s3_prefix)
+
+
+# ---------------------------------------------------------------------------
+# Slides truncation
+# ---------------------------------------------------------------------------
+
+
+def _truncate_slides(
+    slides: list[dict],
+    fidelity_warnings: list[str],
+) -> tuple[list[dict], list[str]]:
+    """Binary-search for the maximum N slides that fit within _SLIDES_JSON_MAX_BYTES."""
+    lo, hi = 0, len(slides)
+    while lo < hi:
+        mid = (lo + hi + 1) // 2
+        if len(json.dumps(slides[:mid]).encode()) <= _SLIDES_JSON_MAX_BYTES:
+            lo = mid
+        else:
+            hi = mid - 1
+
+    truncated = slides[:lo]
+    warnings = list(fidelity_warnings) + ["Import truncated: presentation too large to import fully"]
+    logger.warning(
+        "presentation_import_slides_truncated",
+        original_count=len(slides),
+        kept=lo,
+    )
+    return truncated, warnings
+
+
+# ---------------------------------------------------------------------------
+# Node.js callback
+# ---------------------------------------------------------------------------
+
+
+async def _notify_nodejs(
+    conversion_id: int,
+    status: str,
+    slides=None,
+    fidelity_warnings=None,
+    error=None,
+) -> None:
+    """POST callback to Node.js internal route.
+
+    Does NOT raise on HTTP error — notification failure must not fail the Celery task.
+    Logs errors internally.
+
+    Target: {NODE_INTERNAL_URL}/api/internal/presentation-import/callback
+    Auth:   Authorization: Bearer {WEB_GATEWAY_TOKEN}
+    """
+    payload: dict = {"conversionId": conversion_id, "status": status}
+    if slides is not None:
+        payload["slides"] = slides
+    if fidelity_warnings is not None:
+        payload["fidelityWarnings"] = fidelity_warnings
+    if error is not None:
+        payload["error"] = error
+
+    url = f"{NODE_INTERNAL_URL}/api/internal/presentation-import/callback"
+    headers = {"Authorization": f"Bearer {WEB_GATEWAY_TOKEN}"}
+
+    try:
+        async with httpx.AsyncClient(timeout=30.0) as client:
+            resp = await client.post(url, json=payload, headers=headers)
+            resp.raise_for_status()
+        logger.info(
+            "presentation_import_callback_sent",
+            conversion_id=conversion_id,
+            status=status,
+        )
+    except Exception as exc:
+        logger.error(
+            "presentation_import_callback_failed",
+            conversion_id=conversion_id,
+            status=status,
+            error=str(exc),
+        )
diff --git a/python-backend/tests/test_presentation_import_api.py b/python-backend/tests/test_presentation_import_api.py
new file mode 100644
index 0000000..a953e91
--- /dev/null
+++ b/python-backend/tests/test_presentation_import_api.py
@@ -0,0 +1,588 @@
+"""
+Tests for presentation import Celery task and FastAPI endpoints.
+
+POST   /api/v1/presentation-import/start                  — enqueue import task
+GET    /api/v1/presentation-import/status/{conversion_id} — poll status
+DELETE /api/v1/presentation-import/{conversion_id}        — cancel (best-effort)
+
+Uses httpx.AsyncClient + ASGITransport. Celery tasks and DB are mocked.
+Auth bypassed via FastAPI dependency_overrides.
+"""
+import json
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from httpx import AsyncClient, ASGITransport
+
+from app.main import app
+from app.core.auth import get_current_user
+from app.services.presentation_importer import ImportResult
+
+
+# ---------------------------------------------------------------------------
+# Helpers
+# ---------------------------------------------------------------------------
+
+
+def _mock_user(user_id: int = 1, tenant_id: str = "tenant-test") -> MagicMock:
+    """Minimal mock authenticated user with tenant context."""
+    user = MagicMock()
+    user.id = user_id
+    user.currentTenantId = tenant_id
+    user.is_active = True
+    return user
+
+
+def _override_auth(user_id: int = 1, tenant_id: str = "tenant-test"):
+    async def _inner():
+        return _mock_user(user_id, tenant_id)
+    return _inner
+
+
+_VALID_PPTX_PAYLOAD = {
+    "conversion_id": 42,
+    "source_type": "pptx",
+    "source_library_item_id": 7,
+    "user_id": 1,
+    "tenant_id": "tenant-test",
+}
+
+_VALID_GSLIDES_PAYLOAD = {
+    "conversion_id": 43,
+    "source_type": "google_slides",
+    "slides_url": "https://docs.google.com/presentation/d/abc123/edit",
+    "user_id": 1,
+    "tenant_id": "tenant-test",
+}
+
+
+# ---------------------------------------------------------------------------
+# FastAPI endpoint tests
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.integration
+class TestStartImportEndpoint:
+    """POST /api/v1/presentation-import/start"""
+
+    async def test_valid_pptx_request_enqueues_task_and_returns_task_id(self):
+        """Valid PPTX request enqueues task and returns 202 + task_id."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with (
+                patch("app.api.v1.presentation_import.CELERY_ENABLED", True),
+                patch("app.api.v1.presentation_import.import_presentation_task") as mock_task,
+            ):
+                mock_task.apply_async.return_value = MagicMock(id="celery-task-uuid-001")
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.post(
+                        "/api/v1/presentation-import/start",
+                        json=_VALID_PPTX_PAYLOAD,
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 202
+        assert response.json()["task_id"] == "celery-task-uuid-001"
+
+    async def test_valid_gslides_request_enqueues_task(self):
+        """Valid Google Slides request enqueues task and returns 202 + task_id."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with (
+                patch("app.api.v1.presentation_import.CELERY_ENABLED", True),
+                patch("app.api.v1.presentation_import.import_presentation_task") as mock_task,
+            ):
+                mock_task.apply_async.return_value = MagicMock(id="celery-task-uuid-002")
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.post(
+                        "/api/v1/presentation-import/start",
+                        json=_VALID_GSLIDES_PAYLOAD,
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 202
+        assert response.json()["task_id"] == "celery-task-uuid-002"
+
+    async def test_pptx_missing_source_library_item_id_returns_422(self):
+        """PPTX import without source_library_item_id returns 422."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            payload = {**_VALID_PPTX_PAYLOAD, "source_library_item_id": None}
+            transport = ASGITransport(app=app)
+            async with AsyncClient(transport=transport, base_url="http://test") as client:
+                response = await client.post("/api/v1/presentation-import/start", json=payload)
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 422
+
+    async def test_gslides_missing_slides_url_returns_422(self):
+        """Google Slides import without slides_url returns 422."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            payload = {**_VALID_GSLIDES_PAYLOAD, "slides_url": None}
+            transport = ASGITransport(app=app)
+            async with AsyncClient(transport=transport, base_url="http://test") as client:
+                response = await client.post("/api/v1/presentation-import/start", json=payload)
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 422
+
+    async def test_invalid_source_type_returns_422(self):
+        """Unknown source_type returns 422."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            payload = {**_VALID_PPTX_PAYLOAD, "source_type": "keynote"}
+            transport = ASGITransport(app=app)
+            async with AsyncClient(transport=transport, base_url="http://test") as client:
+                response = await client.post("/api/v1/presentation-import/start", json=payload)
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 422
+
+    async def test_unauthenticated_request_returns_403(self):
+        """Request without auth header returns 403."""
+        transport = ASGITransport(app=app)
+        async with AsyncClient(transport=transport, base_url="http://test") as client:
+            response = await client.post(
+                "/api/v1/presentation-import/start",
+                json=_VALID_PPTX_PAYLOAD,
+            )
+        assert response.status_code == 403
+
+
+@pytest.mark.integration
+class TestStatusEndpoint:
+    """GET /api/v1/presentation-import/status/{conversion_id}"""
+
+    async def test_returns_status_and_progress_for_own_tenant(self):
+        """Returns status and progress for a conversion owned by the current tenant."""
+        app.dependency_overrides[get_current_user] = _override_auth(tenant_id="tenant-abc")
+        try:
+            mock_row = MagicMock()
+            mock_row.status = "processing"
+            mock_row.progress = 45
+            mock_row.fidelity_warnings = []
+            mock_row.deck_library_item_id = None
+
+            mock_result = MagicMock()
+            mock_result.fetchone.return_value = mock_row
+            mock_session = AsyncMock()
+            mock_session.execute.return_value = mock_result
+
+            with patch("app.api.v1.presentation_import.AsyncSessionLocal") as mock_factory:
+                mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+                mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get("/api/v1/presentation-import/status/42")
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        data = response.json()
+        assert data["status"] == "processing"
+        assert data["progress"] == 45
+
+    async def test_different_tenant_conversion_id_returns_404(self):
+        """Returns 404 if conversion belongs to a different tenant."""
+        app.dependency_overrides[get_current_user] = _override_auth(tenant_id="tenant-other")
+        try:
+            mock_result = MagicMock()
+            mock_result.fetchone.return_value = None  # Not found (tenant filter excludes it)
+            mock_session = AsyncMock()
+            mock_session.execute.return_value = mock_result
+
+            with patch("app.api.v1.presentation_import.AsyncSessionLocal") as mock_factory:
+                mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+                mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get("/api/v1/presentation-import/status/99")
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 404
+
+    async def test_nonexistent_conversion_id_returns_404(self):
+        """Returns 404 for a conversion_id that doesn't exist."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            mock_result = MagicMock()
+            mock_result.fetchone.return_value = None
+            mock_session = AsyncMock()
+            mock_session.execute.return_value = mock_result
+
+            with patch("app.api.v1.presentation_import.AsyncSessionLocal") as mock_factory:
+                mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+                mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get("/api/v1/presentation-import/status/9999")
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 404
+
+    async def test_status_requires_authentication(self):
+        """Unauthenticated status request returns 403."""
+        transport = ASGITransport(app=app)
+        async with AsyncClient(transport=transport, base_url="http://test") as client:
+            response = await client.get("/api/v1/presentation-import/status/42")
+        assert response.status_code == 403
+
+
+@pytest.mark.integration
+class TestCancelEndpoint:
+    """DELETE /api/v1/presentation-import/{conversion_id}"""
+
+    async def test_cancel_returns_cancelled_true(self):
+        """Cancel endpoint returns 200 + {"cancelled": true}."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            transport = ASGITransport(app=app)
+            async with AsyncClient(transport=transport, base_url="http://test") as client:
+                response = await client.delete("/api/v1/presentation-import/42")
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        assert response.json()["cancelled"] is True
+
+
+# ---------------------------------------------------------------------------
+# Celery task unit tests
+# ---------------------------------------------------------------------------
+
+
+def _make_fixed_import_result(n_slides: int = 2) -> ImportResult:
+    """Return a fixed ImportResult with n slides and one warning."""
+    return ImportResult(
+        slides=[{"canvasWidth": 1280, "canvasHeight": 720, "elements": [], "canvasPreset": "16:9"}] * n_slides,
+        fidelity_warnings=["Test warning"],
+    )
+
+
+def _make_mock_session(source_url: str = "https://example.com/deck.pptx") -> AsyncMock:
+    """Return a mock DB session that responds to source_url queries."""
+    mock_row = MagicMock()
+    mock_row.source_url = source_url
+    mock_result = MagicMock()
+    mock_result.fetchone.return_value = mock_row
+    mock_session = AsyncMock()
+    mock_session.execute.return_value = mock_result
+    mock_session.commit = AsyncMock()
+    return mock_session
+
+
+@pytest.mark.unit
+class TestImportPresentationTask:
+    """Unit tests for _import_async — mock importers, DB session, and _notify_nodejs."""
+
+    async def test_pptx_path_calls_pptx_importer_with_correct_arguments(self):
+        """PPTX path: PptxImporter.import_file is called with downloaded bytes and s3_prefix."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        mock_session = _make_mock_session()
+        mock_pptx_bytes = b"PK\x03\x04fake-pptx-content"
+        fixed_result = _make_fixed_import_result()
+
+        mock_http_response = MagicMock()
+        mock_http_response.content = mock_pptx_bytes
+        mock_http_response.raise_for_status = MagicMock()
+
+        mock_http_client = AsyncMock()
+        mock_http_client.get = AsyncMock(return_value=mock_http_response)
+        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
+        mock_http_client.__aexit__ = AsyncMock(return_value=None)
+
+        mock_importer = AsyncMock()
+        mock_importer.import_file = AsyncMock(return_value=fixed_result)
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer) as mock_pptx_cls,
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _import_async(
+                None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None
+            )
+
+        mock_pptx_cls.assert_called_once()
+        mock_importer.import_file.assert_called_once()
+        call_args = mock_importer.import_file.call_args
+        assert call_args[0][0] == mock_pptx_bytes  # pptx_bytes
+        assert "tenant-abc/presentations/imports/42" in call_args[0][1]  # s3_prefix
+
+    async def test_gslides_path_retrieves_token_via_google_token_service(self):
+        """Google Slides path: GoogleTokenService.get_valid_access_token is called."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        fixed_result = _make_fixed_import_result()
+        mock_token_service = AsyncMock()
+        mock_token_service.get_valid_access_token = AsyncMock(return_value="fake-access-token")
+        mock_session = AsyncMock()
+        mock_session.commit = AsyncMock()
+
+        mock_importer = AsyncMock()
+        mock_importer.import_presentation = AsyncMock(return_value=fixed_result)
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks.GSlidesImporter", return_value=mock_importer),
+            patch("app.tasks.presentation_import_tasks.GoogleTokenService", return_value=mock_token_service) as mock_gts_cls,
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _import_async(
+                None, 43, "google_slides", 1, "tenant-abc",
+                source_item_id=None,
+                slides_url="https://docs.google.com/presentation/d/SLIDE_ID/edit",
+            )
+
+        mock_gts_cls.assert_called_once_with(mock_session)
+        mock_token_service.get_valid_access_token.assert_called_once_with(1)
+
+    async def test_gslides_path_calls_gslides_importer_with_retrieved_token(self):
+        """Google Slides path: GSlidesImporter is created with the retrieved token."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        fixed_result = _make_fixed_import_result()
+        mock_token_service = AsyncMock()
+        mock_token_service.get_valid_access_token = AsyncMock(return_value="real-access-token")
+        mock_session = AsyncMock()
+
+        mock_importer = AsyncMock()
+        mock_importer.import_presentation = AsyncMock(return_value=fixed_result)
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks.GSlidesImporter", return_value=mock_importer) as mock_gs_cls,
+            patch("app.tasks.presentation_import_tasks.GoogleTokenService", return_value=mock_token_service),
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()) as mock_r2,
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _import_async(
+                None, 43, "google_slides", 1, "tenant-abc",
+                source_item_id=None,
+                slides_url="https://docs.google.com/presentation/d/SLIDE_ID/edit",
+            )
+
+        mock_gs_cls.assert_called_once_with(
+            access_token="real-access-token",
+            r2_service=mock_r2.return_value,
+        )
+        mock_importer.import_presentation.assert_called_once_with(
+            "SLIDE_ID", "tenant-abc/presentations/imports/43"
+        )
+
+    async def test_progress_updates_at_5_percent_then_90_percent_then_100(self):
+        """_update_conversion is called at 5, 90, and 100 progress across the run."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        fixed_result = _make_fixed_import_result()
+        mock_session = _make_mock_session()
+        mock_http_response = MagicMock()
+        mock_http_response.content = b"PK\x03fake"
+        mock_http_response.raise_for_status = MagicMock()
+        mock_http_client = AsyncMock()
+        mock_http_client.get = AsyncMock(return_value=mock_http_response)
+        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
+        mock_http_client.__aexit__ = AsyncMock(return_value=None)
+
+        mock_importer = AsyncMock()
+        mock_importer.import_file = AsyncMock(return_value=fixed_result)
+
+        update_calls = []
+
+        async def _capture_update(conversion_id, **kwargs):
+            update_calls.append(kwargs)
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", side_effect=_capture_update),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer),
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _import_async(None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None)
+
+        progress_values = [c.get("progress") for c in update_calls if "progress" in c]
+        assert 5 in progress_values
+        assert 90 in progress_values
+        assert 100 in progress_values
+
+    async def test_notify_nodejs_called_with_done_status_on_success(self):
+        """On success, _notify_nodejs is called with status='done' and slides data."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        fixed_result = _make_fixed_import_result()
+        mock_session = _make_mock_session()
+        mock_http_response = MagicMock()
+        mock_http_response.content = b"PK\x03fake"
+        mock_http_response.raise_for_status = MagicMock()
+        mock_http_client = AsyncMock()
+        mock_http_client.get = AsyncMock(return_value=mock_http_response)
+        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
+        mock_http_client.__aexit__ = AsyncMock(return_value=None)
+
+        mock_importer = AsyncMock()
+        mock_importer.import_file = AsyncMock(return_value=fixed_result)
+        mock_notify = AsyncMock()
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", mock_notify),
+            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer),
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _import_async(None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None)
+
+        mock_notify.assert_called_once()
+        call_kwargs = mock_notify.call_args
+        assert call_kwargs[0][1] == "done"  # status arg
+        assert call_kwargs[1].get("slides") is not None
+
+    async def test_notify_nodejs_called_with_failed_status_on_exception(self):
+        """On exception, _notify_nodejs is called with status='failed' and the error."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        mock_notify = AsyncMock()
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", mock_notify),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+        ):
+            # Make DB query fail so the task errors immediately
+            mock_session = AsyncMock()
+            mock_session.execute.side_effect = ValueError("DB error")
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            with pytest.raises(ValueError):
+                await _import_async(
+                    None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None
+                )
+
+        mock_notify.assert_called_once()
+        call_kwargs = mock_notify.call_args
+        assert call_kwargs[0][1] == "failed"
+        assert call_kwargs[1].get("error") is not None
+
+    async def test_slides_json_over_8mb_is_truncated_with_fidelity_warning(self):
+        """Slides JSON exceeding 8MB is truncated and a warning is appended."""
+        from app.tasks.presentation_import_tasks import _import_async, _SLIDES_JSON_MAX_BYTES
+
+        # Create slides where total JSON > 8MB but 1 slide < 8MB
+        big_element = {"type": "text", "content": "x" * 100_000}
+        big_slide = {"canvasWidth": 1280, "canvasHeight": 720, "elements": [big_element], "canvasPreset": "16:9"}
+        n_slides = (_SLIDES_JSON_MAX_BYTES // (len(json.dumps(big_slide)) + 100)) + 10
+        oversized_result = ImportResult(
+            slides=[big_slide] * n_slides,
+            fidelity_warnings=[],
+        )
+
+        mock_session = _make_mock_session()
+        mock_http_response = MagicMock()
+        mock_http_response.content = b"PK\x03fake"
+        mock_http_response.raise_for_status = MagicMock()
+        mock_http_client = AsyncMock()
+        mock_http_client.get = AsyncMock(return_value=mock_http_response)
+        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
+        mock_http_client.__aexit__ = AsyncMock(return_value=None)
+
+        mock_importer = AsyncMock()
+        mock_importer.import_file = AsyncMock(return_value=oversized_result)
+
+        notify_calls = []
+
+        async def _capture_notify(conv_id, status, **kwargs):
+            notify_calls.append({"status": status, **kwargs})
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", side_effect=_capture_notify),
+            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer),
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+
+            await _import_async(None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None)
+
+        assert len(notify_calls) == 1
+        call = notify_calls[0]
+        assert call["status"] == "done"
+        # Slides are truncated — fewer than the original count
+        assert len(call["slides"]) < n_slides
+        # Truncation warning was appended
+        assert any("truncated" in w.lower() for w in call["fidelity_warnings"])
+        # Remaining slides JSON fits within limit
+        assert len(json.dumps(call["slides"]).encode()) <= _SLIDES_JSON_MAX_BYTES
+
+    async def test_invalid_slides_url_raises_value_error(self):
+        """Google Slides path: invalid URL raises ValueError (not an internal error)."""
+        from app.tasks.presentation_import_tasks import _import_async
+
+        mock_notify = AsyncMock()
+        mock_session = AsyncMock()
+
+        with (
+            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
+            patch("app.tasks.presentation_import_tasks._notify_nodejs", mock_notify),
+            patch("app.tasks.presentation_import_tasks.GoogleTokenService") as mock_gts_cls,
+            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
+            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
+        ):
+            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
+            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
+            mock_token_service = AsyncMock()
+            mock_token_service.get_valid_access_token = AsyncMock(return_value="token")
+            mock_gts_cls.return_value = mock_token_service
+
+            with pytest.raises(ValueError, match="Invalid Google Slides URL"):
+                await _import_async(
+                    None, 43, "google_slides", 1, "tenant-abc",
+                    source_item_id=None,
+                    slides_url="https://notgoogle.com/some-path",
+                )
+
+        # Notify should be called with "failed" and user-facing error string
+        mock_notify.assert_called_once()
+        assert mock_notify.call_args[0][1] == "failed"
+        assert "Invalid Google Slides URL" in mock_notify.call_args[1]["error"]
