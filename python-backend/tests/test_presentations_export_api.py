"""
Integration tests for the presentation export FastAPI endpoints.

POST /api/v1/presentations/export  — enqueue a canonical worker job
GET  /api/v1/presentations/export/{job_id}  — poll canonical job status

Uses httpx.AsyncClient + ASGITransport (async). The worker control-plane
boundary is mocked. Auth is bypassed via FastAPI's app.dependency_overrides.
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

    async def test_returns_job_id_and_queued_status(self):
        """Valid authenticated request dispatches a worker job and returns its id."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.services.job_control_plane.dispatch_python_task") as mock_dispatch,
            ):
                mock_dispatch.return_value = MagicMock(id="test-celery-task-id-123")
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

    async def test_returns_503_when_control_plane_dispatch_raises(self):
        """If canonical job dispatch fails, endpoint returns 503."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.services.job_control_plane.dispatch_python_task") as mock_dispatch,
            ):
                mock_dispatch.side_effect = Exception("Control plane unavailable")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=_VALID_PAYLOAD)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 503

    async def test_render_spec_passed_to_worker_job(self):
        """The render_spec dict is forwarded unchanged in the worker job args."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            render_spec = {"deck_id": 7, "slides": [1, 2], "width": 1920, "height": 1080}
            payload = {"render_spec": render_spec, "quality": "high", "format": "pdf"}
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.services.job_control_plane.dispatch_python_task") as mock_dispatch,
            ):
                mock_dispatch.return_value = MagicMock(id="abc123")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=payload)
                call_args = mock_dispatch.call_args
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        assert call_args.kwargs["args"][0] == render_spec

    async def test_format_and_quality_passed_to_worker_job(self):
        """format and quality values are forwarded in the worker job args."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {"render_spec": {}, "quality": "draft", "format": "mp4"}
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.services.job_control_plane.dispatch_python_task") as mock_dispatch,
            ):
                mock_dispatch.return_value = MagicMock(id="abc")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentations/export", json=payload)
                call_args = mock_dispatch.call_args
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        assert call_args.kwargs["args"][1] == "draft"
        assert call_args.kwargs["args"][2] == "mp4"

    async def test_render_auth_is_forwarded_for_authenticated_actor(self):
        """Tenant-scoped actor is forwarded to the canonical job for protected media."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {
                **_VALID_PAYLOAD,
                "render_auth": {"user_id": 1, "tenant_id": "tenant-test"},
            }
            with (
                patch("app.api.v1.presentations_export.CELERY_ENABLED", True),
                patch("app.services.job_control_plane.dispatch_python_task") as mock_dispatch,
            ):
                mock_dispatch.return_value = MagicMock(id="actor-task")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/presentations/export",
                        json=payload,
                        headers={"X-Presentation-Render-Token": _render_auth_token()},
                    )
                call_args = mock_dispatch.call_args
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 201
        assert len(call_args.kwargs["args"]) == 3
        assert call_args.kwargs["args"][0]["__presentation_render_auth"] == {
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
    """GET /api/v1/presentations/export/{job_id}"""

    async def test_returns_percent_and_stage_for_queued_job(self):
        """Polling a queued job returns state=queued, percent=0, stage=None."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch(
                "app.services.job_control_plane.JobControlPlaneClient.status",
                return_value={"status": "queued", "progress": {}},
            ):
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

    async def test_returns_progress_for_running_job(self):
        """Polling a running job returns progress and stage from its snapshot."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch(
                "app.services.job_control_plane.JobControlPlaneClient.status",
                return_value={
                    "status": "running",
                    "progress": {"progress": 45, "stage": "rendering"},
                },
            ):
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
        """A succeeded worker job returns the persisted output metadata."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch(
                "app.services.job_control_plane.JobControlPlaneClient.status",
                return_value={
                    "status": "succeeded",
                    "output": {
                        "output_url": "https://example.com/export.png",
                        "output_storage_key": "exports/tenant-test/42.png",
                    },
                },
            ):
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
        """A failed worker job returns its bounded error message."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch(
                "app.services.job_control_plane.JobControlPlaneClient.status",
                return_value={
                    "status": "failed",
                    "errorMessage": "Playwright crashed during render",
                },
            ):
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

    async def test_returns_error_for_cancelled_job(self):
        """A cancelled canonical worker job returns an error state."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch(
                "app.services.job_control_plane.JobControlPlaneClient.status",
                return_value={"status": "cancelled"},
            ):
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

    async def test_control_plane_status_failure_returns_generic_error(self):
        """A status backend failure does not expose internal exception details."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with patch(
                "app.services.job_control_plane.JobControlPlaneClient.status",
                side_effect=RuntimeError("private control-plane endpoint detail"),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get(
                        "/api/v1/presentations/export/unknown-task-xyz",
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        assert response.json()["state"] == "error"
        assert response.json()["error_message"] == "Status check temporarily unavailable"
        assert "private" not in response.text

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

    async def test_serves_signed_legacy_export_file(self, tmp_path: Path):
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

        assert response.path == str(export_file)
        assert response.media_type == "application/pdf"

    async def test_returns_gone_when_legacy_export_file_is_missing(self, tmp_path: Path):
        media_root = tmp_path / "media"
        media_root.mkdir(parents=True)

        old_media_storage = os.environ.get("MEDIA_STORAGE_PATH")
        old_jwt_secret = settings.JWT_SECRET
        try:
            os.environ["MEDIA_STORAGE_PATH"] = str(media_root)
            setattr(settings, "JWT_" + "SECRET", "test-signing-key")
            token = self._make_token(42, "missing-export.pdf")
            with pytest.raises(HTTPException) as exc_info:
                await download_local_export_file(42, "missing-export.pdf", token)
        finally:
            if old_media_storage is None:
                os.environ.pop("MEDIA_STORAGE_PATH", None)
            else:
                os.environ["MEDIA_STORAGE_PATH"] = old_media_storage
            setattr(settings, "JWT_" + "SECRET", old_jwt_secret)

        assert exc_info.value.status_code == 410
        assert "export again" in exc_info.value.detail

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
