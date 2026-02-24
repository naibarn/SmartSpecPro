"""
Tests for presentation import Celery task and FastAPI endpoints.

POST   /api/v1/presentation-import/start                  — enqueue import task
GET    /api/v1/presentation-import/status/{conversion_id} — poll status
DELETE /api/v1/presentation-import/{conversion_id}        — cancel (best-effort)

Uses httpx.AsyncClient + ASGITransport. Celery tasks and DB are mocked.
Auth bypassed via FastAPI dependency_overrides.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.auth import get_current_user
from app.services.presentation_importer import ImportResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_user(user_id: int = 1, tenant_id: str = "tenant-test") -> MagicMock:
    """Minimal mock authenticated user with tenant context."""
    user = MagicMock()
    user.id = user_id
    user.currentTenantId = tenant_id
    user.is_active = True
    return user


def _override_auth(user_id: int = 1, tenant_id: str = "tenant-test"):
    async def _inner():
        return _mock_user(user_id, tenant_id)
    return _inner


_VALID_PPTX_PAYLOAD = {
    "conversion_id": 42,
    "source_type": "pptx",
    "source_library_item_id": 7,
    "user_id": 1,
    "tenant_id": "tenant-test",
}

_VALID_GSLIDES_PAYLOAD = {
    "conversion_id": 43,
    "source_type": "google_slides",
    "slides_url": "https://docs.google.com/presentation/d/abc123/edit",
    "user_id": 1,
    "tenant_id": "tenant-test",
}


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestStartImportEndpoint:
    """POST /api/v1/presentation-import/start"""

    async def test_valid_pptx_request_enqueues_task_and_returns_task_id(self):
        """Valid PPTX request enqueues task and returns 202 + task_id."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with (
                patch("app.api.v1.presentation_import.CELERY_ENABLED", True),
                patch("app.api.v1.presentation_import.import_presentation_task") as mock_task,
            ):
                mock_task.apply_async.return_value = MagicMock(id="celery-task-uuid-001")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/presentation-import/start",
                        json=_VALID_PPTX_PAYLOAD,
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 202
        assert response.json()["task_id"] == "celery-task-uuid-001"

    async def test_valid_gslides_request_enqueues_task(self):
        """Valid Google Slides request enqueues task and returns 202 + task_id."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            with (
                patch("app.api.v1.presentation_import.CELERY_ENABLED", True),
                patch("app.api.v1.presentation_import.import_presentation_task") as mock_task,
            ):
                mock_task.apply_async.return_value = MagicMock(id="celery-task-uuid-002")
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/presentation-import/start",
                        json=_VALID_GSLIDES_PAYLOAD,
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 202
        assert response.json()["task_id"] == "celery-task-uuid-002"

    async def test_mismatched_user_id_returns_403(self):
        """Request body user_id that doesn't match auth user returns 403."""
        app.dependency_overrides[get_current_user] = _override_auth(user_id=1, tenant_id="tenant-test")
        try:
            payload = {**_VALID_PPTX_PAYLOAD, "user_id": 999}  # 999 != current_user.id (1)
            with (
                patch("app.api.v1.presentation_import.CELERY_ENABLED", True),
                patch("app.api.v1.presentation_import.import_presentation_task"),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentation-import/start", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403

    async def test_mismatched_tenant_id_returns_403(self):
        """Request body tenant_id that doesn't match auth tenant returns 403."""
        app.dependency_overrides[get_current_user] = _override_auth(user_id=1, tenant_id="tenant-test")
        try:
            payload = {**_VALID_PPTX_PAYLOAD, "tenant_id": "tenant-other"}  # mismatch
            with (
                patch("app.api.v1.presentation_import.CELERY_ENABLED", True),
                patch("app.api.v1.presentation_import.import_presentation_task"),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post("/api/v1/presentation-import/start", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403

    async def test_pptx_missing_source_library_item_id_returns_422(self):
        """PPTX import without source_library_item_id returns 422."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {**_VALID_PPTX_PAYLOAD, "source_library_item_id": None}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/presentation-import/start", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 422

    async def test_gslides_missing_slides_url_returns_422(self):
        """Google Slides import without slides_url returns 422."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {**_VALID_GSLIDES_PAYLOAD, "slides_url": None}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/presentation-import/start", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 422

    async def test_invalid_source_type_returns_422(self):
        """Unknown source_type returns 422."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            payload = {**_VALID_PPTX_PAYLOAD, "source_type": "keynote"}
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/presentation-import/start", json=payload)
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 422

    async def test_unauthenticated_request_returns_403(self):
        """Request without auth header returns 403."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/presentation-import/start",
                json=_VALID_PPTX_PAYLOAD,
            )
        assert response.status_code == 403


@pytest.mark.integration
class TestStatusEndpoint:
    """GET /api/v1/presentation-import/status/{conversion_id}"""

    async def test_returns_status_and_progress_for_own_tenant(self):
        """Returns status and progress for a conversion owned by the current tenant."""
        app.dependency_overrides[get_current_user] = _override_auth(tenant_id="tenant-abc")
        try:
            mock_row = MagicMock()
            mock_row.status = "processing"
            mock_row.progress = 45
            mock_row.fidelity_warnings = []
            mock_row.deck_library_item_id = None

            mock_result = MagicMock()
            mock_result.fetchone.return_value = mock_row
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result

            with patch("app.api.v1.presentation_import.AsyncSessionLocal") as mock_factory:
                mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
                mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get("/api/v1/presentation-import/status/42")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"
        assert data["progress"] == 45

    async def test_different_tenant_conversion_id_returns_404(self):
        """Returns 404 if conversion belongs to a different tenant."""
        app.dependency_overrides[get_current_user] = _override_auth(tenant_id="tenant-other")
        try:
            mock_result = MagicMock()
            mock_result.fetchone.return_value = None  # Not found (tenant filter excludes it)
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result

            with patch("app.api.v1.presentation_import.AsyncSessionLocal") as mock_factory:
                mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
                mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get("/api/v1/presentation-import/status/99")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 404

    async def test_nonexistent_conversion_id_returns_404(self):
        """Returns 404 for a conversion_id that doesn't exist."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            mock_result = MagicMock()
            mock_result.fetchone.return_value = None
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result

            with patch("app.api.v1.presentation_import.AsyncSessionLocal") as mock_factory:
                mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
                mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.get("/api/v1/presentation-import/status/9999")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 404

    async def test_status_requires_authentication(self):
        """Unauthenticated status request returns 403."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/presentation-import/status/42")
        assert response.status_code == 403


@pytest.mark.integration
class TestCancelEndpoint:
    """DELETE /api/v1/presentation-import/{conversion_id}"""

    async def test_cancel_returns_cancelled_true(self):
        """Cancel endpoint returns 200 + {"cancelled": true}."""
        app.dependency_overrides[get_current_user] = _override_auth()
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.delete("/api/v1/presentation-import/42")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        assert response.json()["cancelled"] is True


# ---------------------------------------------------------------------------
# Celery task unit tests
# ---------------------------------------------------------------------------


def _make_fixed_import_result(n_slides: int = 2) -> ImportResult:
    """Return a fixed ImportResult with n slides and one warning."""
    return ImportResult(
        slides=[{"canvasWidth": 1280, "canvasHeight": 720, "elements": [], "canvasPreset": "16:9"}] * n_slides,
        fidelity_warnings=["Test warning"],
    )


def _make_mock_session(source_url: str = "https://example.com/deck.pptx") -> AsyncMock:
    """Return a mock DB session that responds to source_url queries."""
    mock_row = MagicMock()
    mock_row.source_url = source_url
    mock_result = MagicMock()
    mock_result.fetchone.return_value = mock_row
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.commit = AsyncMock()
    return mock_session


@pytest.mark.unit
class TestImportPresentationTask:
    """Unit tests for _import_async — mock importers, DB session, and _notify_nodejs."""

    async def test_pptx_path_calls_pptx_importer_with_correct_arguments(self):
        """PPTX path: PptxImporter.import_file is called with downloaded bytes and s3_prefix."""
        from app.tasks.presentation_import_tasks import _import_async

        mock_session = _make_mock_session()
        mock_pptx_bytes = b"PK\x03\x04fake-pptx-content"
        fixed_result = _make_fixed_import_result()

        mock_http_response = MagicMock()
        mock_http_response.content = mock_pptx_bytes
        mock_http_response.raise_for_status = MagicMock()

        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_http_response)
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_importer = AsyncMock()
        mock_importer.import_file = AsyncMock(return_value=fixed_result)

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer) as mock_pptx_cls,
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            await _import_async(
                None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None
            )

        mock_pptx_cls.assert_called_once()
        mock_importer.import_file.assert_called_once()
        call_args = mock_importer.import_file.call_args
        assert call_args[0][0] == mock_pptx_bytes  # pptx_bytes
        assert "tenant-abc/presentations/imports/42" in call_args[0][1]  # s3_prefix

    async def test_gslides_path_retrieves_token_via_google_token_service(self):
        """Google Slides path: GoogleTokenService.get_valid_access_token is called."""
        from app.tasks.presentation_import_tasks import _import_async

        fixed_result = _make_fixed_import_result()
        mock_token_service = AsyncMock()
        mock_token_service.get_valid_access_token = AsyncMock(return_value="fake-access-token")
        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()

        mock_importer = AsyncMock()
        mock_importer.import_presentation = AsyncMock(return_value=fixed_result)

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks.GSlidesImporter", return_value=mock_importer),
            patch("app.tasks.presentation_import_tasks.GoogleTokenService", return_value=mock_token_service) as mock_gts_cls,
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            await _import_async(
                None, 43, "google_slides", 1, "tenant-abc",
                source_item_id=None,
                slides_url="https://docs.google.com/presentation/d/SLIDE_ID/edit",
            )

        mock_gts_cls.assert_called_once_with(mock_session)
        mock_token_service.get_valid_access_token.assert_called_once_with(1)

    async def test_gslides_path_calls_gslides_importer_with_retrieved_token(self):
        """Google Slides path: GSlidesImporter is created with the retrieved token."""
        from app.tasks.presentation_import_tasks import _import_async

        fixed_result = _make_fixed_import_result()
        mock_token_service = AsyncMock()
        mock_token_service.get_valid_access_token = AsyncMock(return_value="real-access-token")
        mock_session = AsyncMock()

        mock_importer = AsyncMock()
        mock_importer.import_presentation = AsyncMock(return_value=fixed_result)

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks.GSlidesImporter", return_value=mock_importer) as mock_gs_cls,
            patch("app.tasks.presentation_import_tasks.GoogleTokenService", return_value=mock_token_service),
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()) as mock_r2,
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            await _import_async(
                None, 43, "google_slides", 1, "tenant-abc",
                source_item_id=None,
                slides_url="https://docs.google.com/presentation/d/SLIDE_ID/edit",
            )

        mock_gs_cls.assert_called_once_with(
            access_token="real-access-token",
            r2_service=mock_r2.return_value,
        )
        mock_importer.import_presentation.assert_called_once_with(
            "SLIDE_ID", "tenant-abc/presentations/imports/43"
        )

    async def test_progress_updates_at_5_percent_then_90_percent_then_100(self):
        """_update_conversion is called at 5, 90, and 100 progress across the run."""
        from app.tasks.presentation_import_tasks import _import_async

        fixed_result = _make_fixed_import_result()
        mock_session = _make_mock_session()
        mock_http_response = MagicMock()
        mock_http_response.content = b"PK\x03fake"
        mock_http_response.raise_for_status = MagicMock()
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_http_response)
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_importer = AsyncMock()
        mock_importer.import_file = AsyncMock(return_value=fixed_result)

        update_calls = []

        async def _capture_update(conversion_id, tenant_id, **kwargs):
            update_calls.append(kwargs)

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", side_effect=_capture_update),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer),
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            await _import_async(None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None)

        progress_values = [c.get("progress") for c in update_calls if "progress" in c]
        assert 5 in progress_values
        assert 90 in progress_values
        assert 100 in progress_values

    async def test_notify_nodejs_called_with_done_status_on_success(self):
        """On success, _notify_nodejs is called with status='done' and slides data."""
        from app.tasks.presentation_import_tasks import _import_async

        fixed_result = _make_fixed_import_result()
        mock_session = _make_mock_session()
        mock_http_response = MagicMock()
        mock_http_response.content = b"PK\x03fake"
        mock_http_response.raise_for_status = MagicMock()
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_http_response)
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_importer = AsyncMock()
        mock_importer.import_file = AsyncMock(return_value=fixed_result)
        mock_notify = AsyncMock()

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", mock_notify),
            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer),
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            await _import_async(None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None)

        mock_notify.assert_called_once()
        call_kwargs = mock_notify.call_args
        assert call_kwargs[0][1] == "done"  # status arg
        assert call_kwargs[1].get("slides") is not None

    async def test_notify_nodejs_called_with_failed_status_on_exception(self):
        """On exception, _notify_nodejs is called with status='failed' and the error."""
        from app.tasks.presentation_import_tasks import _import_async

        mock_notify = AsyncMock()

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", mock_notify),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
        ):
            # Make DB query fail so the task errors immediately
            mock_session = AsyncMock()
            mock_session.execute.side_effect = ValueError("DB error")
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            with pytest.raises(ValueError):
                await _import_async(
                    None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None
                )

        mock_notify.assert_called_once()
        call_kwargs = mock_notify.call_args
        assert call_kwargs[0][1] == "failed"
        assert call_kwargs[1].get("error") is not None

    async def test_slides_json_over_8mb_is_truncated_with_fidelity_warning(self):
        """Slides JSON exceeding 8MB is truncated and a warning is appended."""
        from app.tasks.presentation_import_tasks import _import_async, _SLIDES_JSON_MAX_BYTES

        # Create slides where total JSON > 8MB but 1 slide < 8MB
        big_element = {"type": "text", "content": "x" * 100_000}
        big_slide = {"canvasWidth": 1280, "canvasHeight": 720, "elements": [big_element], "canvasPreset": "16:9"}
        n_slides = (_SLIDES_JSON_MAX_BYTES // (len(json.dumps(big_slide)) + 100)) + 10
        oversized_result = ImportResult(
            slides=[big_slide] * n_slides,
            fidelity_warnings=[],
        )

        mock_session = _make_mock_session()
        mock_http_response = MagicMock()
        mock_http_response.content = b"PK\x03fake"
        mock_http_response.raise_for_status = MagicMock()
        mock_http_client = AsyncMock()
        mock_http_client.get = AsyncMock(return_value=mock_http_response)
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)

        mock_importer = AsyncMock()
        mock_importer.import_file = AsyncMock(return_value=oversized_result)

        notify_calls = []

        async def _capture_notify(conv_id, status, **kwargs):
            notify_calls.append({"status": status, **kwargs})

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", side_effect=_capture_notify),
            patch("app.tasks.presentation_import_tasks.PptxImporter", return_value=mock_importer),
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
            patch("app.tasks.presentation_import_tasks.httpx.AsyncClient", return_value=mock_http_client),
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)

            await _import_async(None, 42, "pptx", 1, "tenant-abc", source_item_id=7, slides_url=None)

        assert len(notify_calls) == 1
        call = notify_calls[0]
        assert call["status"] == "done"
        # Slides are truncated — fewer than the original count
        assert len(call["slides"]) < n_slides
        # Truncation warning was appended
        assert any("truncated" in w.lower() for w in call["fidelity_warnings"])
        # Remaining slides JSON fits within limit
        assert len(json.dumps(call["slides"]).encode()) <= _SLIDES_JSON_MAX_BYTES

    async def test_invalid_slides_url_raises_value_error(self):
        """Google Slides path: invalid URL raises ValueError (not an internal error)."""
        from app.tasks.presentation_import_tasks import _import_async

        mock_notify = AsyncMock()
        mock_session = AsyncMock()

        with (
            patch("app.tasks.presentation_import_tasks._update_conversion", new_callable=AsyncMock),
            patch("app.tasks.presentation_import_tasks._notify_nodejs", mock_notify),
            patch("app.tasks.presentation_import_tasks.GoogleTokenService") as mock_gts_cls,
            patch("app.tasks.presentation_import_tasks.get_r2_storage_service", return_value=MagicMock()),
            patch("app.tasks.presentation_import_tasks.AsyncSessionLocal") as mock_factory,
        ):
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_token_service = AsyncMock()
            mock_token_service.get_valid_access_token = AsyncMock(return_value="token")
            mock_gts_cls.return_value = mock_token_service

            with pytest.raises(ValueError, match="Invalid Google Slides URL"):
                await _import_async(
                    None, 43, "google_slides", 1, "tenant-abc",
                    source_item_id=None,
                    slides_url="https://notgoogle.com/some-path",
                )

        # Notify should be called with "failed" and user-facing error string
        mock_notify.assert_called_once()
        assert mock_notify.call_args[0][1] == "failed"
        assert "Invalid Google Slides URL" in mock_notify.call_args[1]["error"]
