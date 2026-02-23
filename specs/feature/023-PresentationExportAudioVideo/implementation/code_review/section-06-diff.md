diff --git a/python-backend/app/api/v1/presentations_export.py b/python-backend/app/api/v1/presentations_export.py
new file mode 100644
index 0000000..543607c
--- /dev/null
+++ b/python-backend/app/api/v1/presentations_export.py
@@ -0,0 +1,166 @@
+"""
+Presentation Export API endpoints.
+
+POST /api/v1/presentations/export          — enqueue a Celery render task
+GET  /api/v1/presentations/export/{id}     — poll task status
+"""
+
+from typing import Optional
+
+import structlog
+from celery.result import AsyncResult
+from fastapi import APIRouter, Depends, HTTPException, status
+from pydantic import BaseModel, field_validator
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.core.auth import get_current_user
+from app.core.database import get_db
+from app.models.user import User
+
+logger = structlog.get_logger(__name__)
+router = APIRouter()
+
+# Import Celery task with graceful fallback (section-07 may not be implemented yet).
+# CELERY_ENABLED is patched in tests that exercise the task-dispatch path.
+try:
+    from app.tasks.presentation_render import render_presentation
+
+    CELERY_ENABLED = True
+except ImportError:
+    render_presentation = None  # type: ignore[assignment]
+    CELERY_ENABLED = False
+    logger.warning(
+        "presentation_render_task_not_available",
+        message="presentation_render Celery task not available; POST /export will return 503",
+    )
+
+
+# ============================================================
+# Pydantic models
+# ============================================================
+
+
+class PresentationExportRequest(BaseModel):
+    """Request body for POST /api/v1/presentations/export."""
+
+    render_spec: dict
+    quality: str  # "draft" | "standard" | "high"
+    format: str  # "png" | "jpg" | "pdf" | "mp4"
+
+    @field_validator("format")
+    @classmethod
+    def validate_format(cls, v: str) -> str:
+        allowed = {"png", "jpg", "pdf", "mp4"}
+        if v not in allowed:
+            raise ValueError(f"format must be one of {sorted(allowed)}, got '{v}'")
+        return v
+
+    @field_validator("quality")
+    @classmethod
+    def validate_quality(cls, v: str) -> str:
+        allowed = {"draft", "standard", "high"}
+        if v not in allowed:
+            raise ValueError(f"quality must be one of {sorted(allowed)}, got '{v}'")
+        return v
+
+
+class PresentationExportJobResponse(BaseModel):
+    """Response from POST — the enqueued Celery job."""
+
+    celery_task_id: str
+    status: str  # always "queued" on creation
+
+
+class PresentationExportStatusResponse(BaseModel):
+    """Response from GET — current task state."""
+
+    celery_task_id: str
+    state: str  # "queued" | "processing" | "done" | "error"
+    percent: int  # 0–100
+    stage: Optional[str] = None
+    output_url: Optional[str] = None
+    error_message: Optional[str] = None
+
+
+# ============================================================
+# Endpoints
+# ============================================================
+
+
+@router.post("/export", response_model=PresentationExportJobResponse)
+async def create_export_job(
+    request: PresentationExportRequest,
+    current_user: User = Depends(get_current_user),
+) -> PresentationExportJobResponse:
+    """Enqueue a Celery presentation render task and return the task id."""
+    if not CELERY_ENABLED:
+        raise HTTPException(
+            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+            detail="Export service unavailable",
+        )
+
+    try:
+        task = render_presentation.delay(request.render_spec, request.quality, request.format)
+    except Exception as exc:
+        logger.error("presentation_render_dispatch_failed", error=str(exc))
+        raise HTTPException(
+            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
+            detail="Export service temporarily unavailable",
+        )
+
+    logger.info(
+        "presentation_export_queued",
+        celery_task_id=task.id,
+        format=request.format,
+        user_id=current_user.id,
+    )
+    return PresentationExportJobResponse(celery_task_id=task.id, status="queued")
+
+
+@router.get("/export/{celery_task_id}", response_model=PresentationExportStatusResponse)
+async def get_export_status(
+    celery_task_id: str,
+    current_user: User = Depends(get_current_user),
+) -> PresentationExportStatusResponse:
+    """Poll the status of a presentation render task."""
+    result = AsyncResult(celery_task_id)
+
+    if result.state == "SUCCESS":
+        result_data = result.result or {}
+        return PresentationExportStatusResponse(
+            celery_task_id=celery_task_id,
+            state="done",
+            percent=100,
+            output_url=result_data.get("output_url"),
+        )
+
+    if result.state == "FAILURE":
+        return PresentationExportStatusResponse(
+            celery_task_id=celery_task_id,
+            state="error",
+            percent=0,
+            error_message=str(result.result),
+        )
+
+    if result.state == "PROGRESS":
+        info = result.info or {}
+        return PresentationExportStatusResponse(
+            celery_task_id=celery_task_id,
+            state="processing",
+            percent=info.get("percent", 0),
+            stage=info.get("stage"),
+        )
+
+    if result.state == "STARTED":
+        return PresentationExportStatusResponse(
+            celery_task_id=celery_task_id,
+            state="processing",
+            percent=0,
+        )
+
+    # PENDING, RETRY, or any unknown state — treat as queued
+    return PresentationExportStatusResponse(
+        celery_task_id=celery_task_id,
+        state="queued",
+        percent=0,
+    )
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index 2014365..1938a58 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -74,6 +74,7 @@ from app.api.v1 import (
     skill_customization,
     media_advanced,
     webhooks,
+    presentations_export,  # Presentation export endpoints
 )
 
 # Initialize Sentry before anything else (captures startup errors)
@@ -248,6 +249,11 @@ app.include_router(telegram_webhook.router, prefix="/webhook", tags=["Telegram W
 app.include_router(prompt_enhancement.router, prefix="/api/v1/prompt", tags=["Prompt Enhancement"])
 app.include_router(skill_customization.router, prefix="/api/v1", tags=["Skill Customization"])
 app.include_router(assets.router, prefix="/api/v1/assets", tags=["Asset Management"])
+app.include_router(
+    presentations_export.router,
+    prefix="/api/v1/presentations",
+    tags=["Presentation Export"],
+)
 
 # Media Job processing (FFmpeg worker bridge)
 from app.api.v1 import media_jobs as media_jobs_api
diff --git a/python-backend/tests/test_presentations_export_api.py b/python-backend/tests/test_presentations_export_api.py
new file mode 100644
index 0000000..50efe4d
--- /dev/null
+++ b/python-backend/tests/test_presentations_export_api.py
@@ -0,0 +1,271 @@
+"""
+Integration tests for the presentation export FastAPI endpoints.
+
+POST /api/v1/presentations/export  — enqueue a Celery render task
+GET  /api/v1/presentations/export/{celery_task_id}  — poll task status
+
+Uses httpx.AsyncClient + ASGITransport (async). Celery tasks and AsyncResult
+are mocked. Auth is bypassed via FastAPI's app.dependency_overrides.
+"""
+
+import pytest
+from unittest.mock import MagicMock, patch
+from httpx import AsyncClient, ASGITransport
+
+from app.main import app
+from app.core.auth import get_current_user
+
+
+def _mock_user() -> MagicMock:
+    """Create a minimal mock authenticated user."""
+    user = MagicMock()
+    user.id = 1
+    user.email = "test@example.com"
+    user.currentTenantId = "tenant-test"
+    user.is_active = True
+    return user
+
+
+def _override_auth():
+    """FastAPI dependency override that returns a mock user without DB or JWT checks."""
+    async def _inner():
+        return _mock_user()
+    return _inner
+
+
+_VALID_PAYLOAD = {
+    "render_spec": {"deck_id": 42, "slide_ids": [1, 2, 3]},
+    "quality": "standard",
+    "format": "png",
+}
+
+
+@pytest.mark.integration
+class TestPresentationExportPost:
+    """POST /api/v1/presentations/export"""
+
+    async def test_returns_celery_task_id_and_queued_status(self):
+        """Valid authenticated request enqueues Celery task and returns task id."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with (
+                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
+                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
+            ):
+                mock_task.delay.return_value = MagicMock(id="test-celery-task-id-123")
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.post(
+                        "/api/v1/presentations/export",
+                        json=_VALID_PAYLOAD,
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        data = response.json()
+        assert data["celery_task_id"] == "test-celery-task-id-123"
+        assert data["status"] == "queued"
+
+    async def test_returns_403_without_auth_header(self):
+        """Unauthenticated request is rejected (HTTPBearer returns 403)."""
+        # No dependency override — real HTTPBearer rejects missing Authorization header
+        transport = ASGITransport(app=app)
+        async with AsyncClient(transport=transport, base_url="http://test") as client:
+            response = await client.post(
+                "/api/v1/presentations/export",
+                json=_VALID_PAYLOAD,
+            )
+        assert response.status_code == 403
+
+    async def test_returns_422_for_invalid_format(self):
+        """Request with format not in (png, jpg, pdf, mp4) returns 422 validation error."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            payload = {**_VALID_PAYLOAD, "format": "gif"}
+            transport = ASGITransport(app=app)
+            async with AsyncClient(transport=transport, base_url="http://test") as client:
+                response = await client.post("/api/v1/presentations/export", json=payload)
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 422
+
+    async def test_returns_422_for_invalid_quality(self):
+        """Request with quality not in (draft, standard, high) returns 422."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            payload = {**_VALID_PAYLOAD, "quality": "ultra"}
+            transport = ASGITransport(app=app)
+            async with AsyncClient(transport=transport, base_url="http://test") as client:
+                response = await client.post("/api/v1/presentations/export", json=payload)
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 422
+
+    async def test_render_spec_passed_to_celery_task(self):
+        """The render_spec dict from the request body is forwarded to the Celery task unchanged."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            render_spec = {"deck_id": 7, "slides": [1, 2], "width": 1920, "height": 1080}
+            payload = {"render_spec": render_spec, "quality": "high", "format": "pdf"}
+            with (
+                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
+                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
+            ):
+                mock_task.delay.return_value = MagicMock(id="abc123")
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.post("/api/v1/presentations/export", json=payload)
+                call_args = mock_task.delay.call_args
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        assert call_args[0][0] == render_spec  # first positional arg is render_spec
+
+    async def test_format_and_quality_passed_to_celery_task(self):
+        """format and quality values from the request are forwarded to the Celery task."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            payload = {"render_spec": {}, "quality": "draft", "format": "mp4"}
+            with (
+                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
+                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
+            ):
+                mock_task.delay.return_value = MagicMock(id="abc")
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.post("/api/v1/presentations/export", json=payload)
+                call_args = mock_task.delay.call_args
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        assert call_args[0][1] == "draft"  # quality (second positional arg)
+        assert call_args[0][2] == "mp4"    # format (third positional arg)
+
+
+@pytest.mark.integration
+class TestPresentationExportGetStatus:
+    """GET /api/v1/presentations/export/{celery_task_id}"""
+
+    async def test_returns_percent_and_stage_for_pending_task(self):
+        """Polling a PENDING task returns state=queued, percent=0, stage=None."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
+                mock_result = MagicMock()
+                mock_result.state = "PENDING"
+                mock_result_cls.return_value = mock_result
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get(
+                        "/api/v1/presentations/export/some-task-id",
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        data = response.json()
+        assert data["state"] == "queued"
+        assert data["percent"] == 0
+        assert data["stage"] is None
+
+    async def test_returns_progress_for_in_progress_task(self):
+        """Polling a PROGRESS task returns state=processing with percent and stage from meta."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
+                mock_result = MagicMock()
+                mock_result.state = "PROGRESS"
+                mock_result.info = {"percent": 45, "stage": "rendering"}
+                mock_result_cls.return_value = mock_result
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get(
+                        "/api/v1/presentations/export/some-task-id",
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        data = response.json()
+        assert data["state"] == "processing"
+        assert data["percent"] == 45
+        assert data["stage"] == "rendering"
+
+    async def test_returns_done_and_output_url_for_successful_task(self):
+        """When AsyncResult state is SUCCESS, response includes state=done and output_url."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
+                mock_result = MagicMock()
+                mock_result.state = "SUCCESS"
+                mock_result.result = {
+                    "output_url": "https://example.com/export.png",
+                    "output_bytes": 1024,
+                }
+                mock_result_cls.return_value = mock_result
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get(
+                        "/api/v1/presentations/export/some-task-id",
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        data = response.json()
+        assert data["state"] == "done"
+        assert data["output_url"] == "https://example.com/export.png"
+        assert data["percent"] == 100
+
+    async def test_returns_error_and_message_for_failed_task(self):
+        """When AsyncResult state is FAILURE, response includes state=error and error_message."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
+                mock_result = MagicMock()
+                mock_result.state = "FAILURE"
+                mock_result.result = Exception("Playwright crashed during render")
+                mock_result_cls.return_value = mock_result
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get(
+                        "/api/v1/presentations/export/some-task-id",
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        data = response.json()
+        assert data["state"] == "error"
+        assert "Playwright crashed" in data["error_message"]
+
+    async def test_unknown_task_id_returns_queued_state(self):
+        """An unrecognised task_id returns state=queued (Celery PENDING), not 404."""
+        app.dependency_overrides[get_current_user] = _override_auth()
+        try:
+            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
+                mock_result = MagicMock()
+                mock_result.state = "PENDING"
+                mock_result_cls.return_value = mock_result
+                transport = ASGITransport(app=app)
+                async with AsyncClient(transport=transport, base_url="http://test") as client:
+                    response = await client.get(
+                        "/api/v1/presentations/export/unknown-task-xyz",
+                    )
+        finally:
+            app.dependency_overrides.pop(get_current_user, None)
+
+        assert response.status_code == 200
+        assert response.json()["state"] == "queued"
+
+    async def test_returns_403_without_auth_header(self):
+        """Unauthenticated status poll is rejected (HTTPBearer returns 403)."""
+        transport = ASGITransport(app=app)
+        async with AsyncClient(transport=transport, base_url="http://test") as client:
+            response = await client.get("/api/v1/presentations/export/some-task-id")
+        assert response.status_code == 403
