"""
Integration tests for the presentation export FastAPI endpoints.

POST /api/v1/presentations/export  — enqueue a Celery render task
GET  /api/v1/presentations/export/{celery_task_id}  — poll task status

Uses httpx.AsyncClient + ASGITransport (async). Celery tasks and AsyncResult
are mocked. Auth is bypassed via FastAPI's app.dependency_overrides.
"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport
from jose import jwt
from fastapi import HTTPException

from app.main import app
from app.core.auth import get_current_user
from app.core.config import settings
from app.api.v1.presentations_export import download_local_export_file


def _mock_user() -> MagicMock:
    """Create a minimal mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.email = "test@example.com"
    user.currentTenantId = "tenant-test"
    user.is_active = True
    return user


def _override_auth():
    """FastAPI dependency override that returns a mock user without DB or JWT checks."""
    async def _inner():
        return _mock_user()
    return _inner


_VALID_PAYLOAD = {
    "render_spec": {"deck_id": 42, "slide_ids": [1, 2, 3]},
    "quality": "standard",
    "format": "png",
}


def _render_auth_token(user_id: int = 1, tenant_id: str = "tenant-test") -> str:
    return jwt.encode(
        {
            "sub": str(user_id),
            "userId": user_id,
            "tenantId": tenant_id,
            "tokenUse": "presentation_render",
            "scopes": ["presentation:export"],
            "type": "access",
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )


@pytest.mark.integration
class TestPresentationExportPost:
    """POST /api/v1/presentations/export"""

    async def test_returns_celery_task_id_and_queued_status(self):
        """Valid authenticated request enqueues Celery task and returns task id."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
            ):
                mock_task.delay.return_value = MagicMock(id="test-celery-task-id-123")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/presentations/export",
                        json=_VALID_PAYLOAD,
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        data = response.json()
        assert data["celery_task_id"] == "test-celery-task-id-123"
        assert data["status"] == "queued"

    async def test_returns_401_without_auth_header(self):
        """Unauthenticated request is rejected by the app auth layer."""
        # No dependency override — the app returns 401 for missing auth in this setup
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/presentations/export",
                json=_VALID_PAYLOAD,
            )
        assert response.status_code == 401

    async def test_returns_422_for_invalid_format(self):
        """Request with format not in (png, jpg, pdf, mp4) returns 422 validation error."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {**_VALID_PAYLOAD, "format": "gif"}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/presentations/export", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 422

    async def test_returns_422_for_invalid_quality(self):
        """Request with quality not in (draft, standard, high) returns 422."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {**_VALID_PAYLOAD, "quality": "ultra"}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/presentations/export", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 422

    async def test_returns_422_for_oversized_render_spec(self):
        """render_spec exceeding 64KB returns 422 validation error."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            # Build a payload that exceeds _RENDER_SPEC_MAX_BYTES (65536 bytes)
            big_string = "x" * 70_000
            payload = {**_VALID_PAYLOAD, "render_spec": {"data": big_string}}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/presentations/export", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 422

    async def test_returns_503_when_celery_dispatch_raises(self):
        """If render_presentation.delay() raises, endpoint returns 503."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
            ):
                mock_task.delay.side_effect = Exception("Redis connection refused")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=_VALID_PAYLOAD)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 503

    async def test_render_spec_passed_to_celery_task(self):
        """The render_spec dict from the request body is forwarded to the Celery task unchanged."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            render_spec = {"deck_id": 7, "slides": [1, 2], "width": 1920, "height": 1080}
            payload = {"render_spec": render_spec, "quality": "high", "format": "pdf"}
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
            ):
                mock_task.delay.return_value = MagicMock(id="abc123")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=payload)
                call_args = mock_task.delay.call_args
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        assert call_args[0][0] == render_spec  # first positional arg is render_spec

    async def test_format_and_quality_passed_to_celery_task(self):
        """format and quality values from the request are forwarded to the Celery task."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {"render_spec": {}, "quality": "draft", "format": "mp4"}
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
            ):
                mock_task.delay.return_value = MagicMock(id="abc")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=payload)
                call_args = mock_task.delay.call_args
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        assert call_args[0][1] == "draft"  # quality (second positional arg)
        assert call_args[0][2] == "mp4"    # format (third positional arg)

    async def test_render_auth_is_forwarded_for_authenticated_actor(self):
        """Tenant-scoped actor is forwarded to the Celery task for protected media."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {
                **_VALID_PAYLOAD,
                "render_auth": {"user_id": 1, "tenant_id": "tenant-test"},
            }
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.api.v1.presentations_export.render_presentation") as mock_task,
            ):
                mock_task.delay.return_value = MagicMock(id="actor-task")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/presentations/export",
                        json=payload,
                        headers={"X-Presentation-Render-Token": _render_auth_token()},
                    )
                call_args = mock_task.delay.call_args
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        assert len(call_args[0]) == 3
        assert call_args[0][0]["__presentation_render_auth"] == {
            "user_id": 1,
            "tenant_id": "tenant-test",
        }

    async def test_render_auth_must_match_authenticated_actor(self):
        """A caller cannot use another user's tenant-scoped media identity."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {
                **_VALID_PAYLOAD,
                "render_auth": {"user_id": 999, "tenant_id": "tenant-test"},
            }
            with patch("app.api.v1.presentations_export.CELERY_ENABLED", True):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403


@pytest.mark.integration
class TestPresentationExportGetStatus:
    """GET /api/v1/presentations/export/{celery_task_id}"""

    async def test_returns_percent_and_stage_for_pending_task(self):
        """Polling a PENDING task returns state=queued, percent=0, stage=None."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
                mock_result = MagicMock()
                mock_result.state = "PENDING"
                mock_result_cls.return_value = mock_result
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/some-task-id",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "queued"
        assert data["percent"] == 0
        assert data["stage"] is None

    async def test_returns_progress_for_in_progress_task(self):
        """Polling a PROGRESS task returns state=processing with percent and stage from meta."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
                mock_result = MagicMock()
                mock_result.state = "PROGRESS"
                mock_result.info = {"percent": 45, "stage": "rendering"}
                mock_result_cls.return_value = mock_result
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/some-task-id",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "processing"
        assert data["percent"] == 45
        assert data["stage"] == "rendering"

    async def test_returns_done_and_output_url_for_successful_task(self):
        """When AsyncResult state is SUCCESS, response includes state=done and output_url."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
                mock_result = MagicMock()
                mock_result.state = "SUCCESS"
                mock_result.result = {
                    "output_url": "https://example.com/export.png",
                    "output_bytes": 1024,
                }
                mock_result_cls.return_value = mock_result
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/some-task-id",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "done"
        assert data["output_url"] == "https://example.com/export.png"
        assert data["percent"] == 100

    async def test_returns_error_and_message_for_failed_task(self):
        """When AsyncResult state is FAILURE, response includes state=error and error_message."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
                mock_result = MagicMock()
                mock_result.state = "FAILURE"
                mock_result.result = Exception("Playwright crashed during render")
                mock_result_cls.return_value = mock_result
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/some-task-id",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "error"
        assert "Playwright crashed" in data["error_message"]

    async def test_returns_error_for_revoked_task(self):
        """When AsyncResult state is REVOKED (cancelled), response includes state=error."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
                mock_result = MagicMock()
                mock_result.state = "REVOKED"
                mock_result_cls.return_value = mock_result
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/some-task-id",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "error"
        assert data["error_message"] is not None

    async def test_unknown_task_id_returns_queued_state(self):
        """An unrecognised task_id returns state=queued (Celery PENDING), not 404."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch("app.api.v1.presentations_export.AsyncResult") as mock_result_cls:
                mock_result = MagicMock()
                mock_result.state = "PENDING"
                mock_result_cls.return_value = mock_result
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/unknown-task-xyz",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        assert response.json()["state"] == "queued"

    async def test_returns_401_without_auth_header(self):
        """Unauthenticated status poll is rejected by the app auth layer."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/presentations/export/some-task-id")
        assert response.status_code == 401


@pytest.mark.integration
class TestPresentationExportDownloadFile:
    """GET /api/v1/presentations/export/files/{deck_id}/{filename}"""

    def _make_token(self, deck_id: int, filename: str, exp_seconds: int = 300) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode(
            {
                "sub": "presentation-export-download",
                "deck_id": deck_id,
                "filename": filename,
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(seconds=exp_seconds)).timestamp()),
            },
            settings.JWT_SECRET,
            algorithm="HS256",
        )

    async def test_serves_locally_stored_export_file(self, tmp_path: Path):
        media_root = tmp_path / "media"
        export_dir = media_root / "presentation_exports" / "42"
        export_dir.mkdir(parents=True)
        export_file = export_dir / "deck-export.pdf"
        export_file.write_bytes(b"%PDF-1.4 fake pdf")

        old_media_storage = os.environ.get("MEDIA_STORAGE_PATH")
        old_jwt_secret = settings.JWT_SECRET
        try:
            os.environ["MEDIA_STORAGE_PATH"] = str(media_root)
            setattr(settings, "JWT_" + "SECRET", "test-signing-key")
            token = self._make_token(42, "deck-export.pdf")
            response = await download_local_export_file(42, "deck-export.pdf", token)
        finally:
            if old_media_storage is None:
                os.environ.pop("MEDIA_STORAGE_PATH", None)
            else:
                os.environ["MEDIA_STORAGE_PATH"] = old_media_storage
            setattr(settings, "JWT_" + "SECRET", old_jwt_secret)

        assert response.status_code == 200
        assert response.media_type == "application/pdf"
        assert response.path == str(export_file)
        assert response.filename == "deck-export.pdf"

    async def test_rejects_path_traversal_filename(self, tmp_path: Path):
        media_root = tmp_path / "media"
        media_root.mkdir()

        old_media_storage = os.environ.get("MEDIA_STORAGE_PATH")
        old_jwt_secret = settings.JWT_SECRET
        try:
            os.environ["MEDIA_STORAGE_PATH"] = str(media_root)
            setattr(settings, "JWT_" + "SECRET", "test-signing-key")
            token = self._make_token(42, "deck..export.pdf")
            with pytest.raises(HTTPException) as exc_info:
                await download_local_export_file(42, "deck..export.pdf", token)
        finally:
            if old_media_storage is None:
                os.environ.pop("MEDIA_STORAGE_PATH", None)
            else:
                os.environ["MEDIA_STORAGE_PATH"] = old_media_storage
            setattr(settings, "JWT_" + "SECRET", old_jwt_secret)

        assert exc_info.value.status_code == 400

    async def test_rejects_token_filename_mismatch(self, tmp_path: Path):
        media_root = tmp_path / "media"
        export_dir = media_root / "presentation_exports" / "42"
        export_dir.mkdir(parents=True)
        (export_dir / "deck-export.pdf").write_bytes(b"%PDF-1.4 fake pdf")

        old_media_storage = os.environ.get("MEDIA_STORAGE_PATH")
        old_jwt_secret = settings.JWT_SECRET
        try:
            os.environ["MEDIA_STORAGE_PATH"] = str(media_root)
            setattr(settings, "JWT_" + "SECRET", "test-signing-key")
            token = self._make_token(42, "other-name.pdf")
            with pytest.raises(HTTPException) as exc_info:
                await download_local_export_file(42, "deck-export.pdf", token)
        finally:
            if old_media_storage is None:
                os.environ.pop("MEDIA_STORAGE_PATH", None)
            else:
                os.environ["MEDIA_STORAGE_PATH"] = old_media_storage
            setattr(settings, "JWT_" + "SECRET", old_jwt_secret)

        assert exc_info.value.status_code == 401
