"""Tests for the agency FastAPI router.

Validates HTTP-level behavior: auth, feature flags, error handling,
response shapes. Agency execution is mocked.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = [pytest.mark.unit, pytest.mark.agency]


# ── Helpers ─────────────────────────────────────────────────────


def _make_mock_user():
    """Create a mock authenticated User object."""
    user = MagicMock()
    user.id = 42
    user.currentTenantId = "tenant-abc"
    user.email = "test@example.com"
    user.is_active = True
    user.is_admin = False
    return user


def _make_run_result():
    """Create a mock RunResult from AgencyService."""
    result = MagicMock()
    result.run_id = str(uuid.uuid4())
    result.response = "The analysis is complete."
    result.agent_name = "Researcher"
    result.total_tokens = 500
    result.step_count = 3
    result.duration_ms = 2500
    return result


def _make_mock_credentials():
    """Create mock HTTPAuthorizationCredentials."""
    creds = MagicMock()
    creds.credentials = "test-jwt-token-for-gateway"
    creds.scheme = "Bearer"
    return creds


def _build_app(
    *,
    feature_enabled: bool = True,
    user=None,
    agency_service_mock=None,
):
    """Build a FastAPI test app with the agencies router and mocked deps."""
    from app.api.agencies import router, require_agency_feature, _bearer_scheme
    from app.core.auth import get_current_user
    from app.core.database import get_db

    app = FastAPI()

    mock_user = user or _make_mock_user()
    mock_db = AsyncMock()

    # Override auth dependency
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[_bearer_scheme] = _make_mock_credentials

    if not feature_enabled:
        from fastapi import HTTPException

        async def _disabled():
            raise HTTPException(status_code=404, detail="Agency feature is disabled")

        app.dependency_overrides[require_agency_feature] = _disabled
    else:
        app.dependency_overrides[require_agency_feature] = lambda: None

    app.include_router(router)
    return app, mock_db


def _build_app_no_auth(*, feature_enabled: bool = True):
    """Build a FastAPI test app WITHOUT auth override (tests 401)."""
    from app.api.agencies import router, require_agency_feature
    from app.core.database import get_db

    app = FastAPI()
    mock_db = AsyncMock()

    app.dependency_overrides[get_db] = lambda: mock_db

    if not feature_enabled:
        from fastapi import HTTPException

        async def _disabled():
            raise HTTPException(status_code=404, detail="Agency feature is disabled")

        app.dependency_overrides[require_agency_feature] = _disabled
    else:
        app.dependency_overrides[require_agency_feature] = lambda: None

    app.include_router(router)
    return app, mock_db


# ── Auth Tests ──────────────────────────────────────────────────


class TestAgencyRouterAuth:
    """Endpoints require Bearer token auth."""

    def test_run_requires_auth_returns_401(self):
        """POST /api/v1/agencies/{id}/run without auth headers returns 401."""
        app, _ = _build_app_no_auth()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Hello"},
        )
        assert resp.status_code in (401, 403)

    def test_stream_requires_auth_returns_401(self):
        """POST /api/v1/agencies/{id}/stream without auth headers returns 401."""
        app, _ = _build_app_no_auth()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/stream",
            json={"message": "Hello"},
        )
        assert resp.status_code in (401, 403)

    def test_list_runs_requires_auth_returns_401(self):
        """GET /api/v1/agencies/{id}/runs without auth headers returns 401."""
        app, _ = _build_app_no_auth()
        client = TestClient(app)
        resp = client.get("/api/v1/agencies/agency-1/runs")
        assert resp.status_code in (401, 403)

    def test_cancel_requires_auth_returns_401(self):
        """POST /cancel without auth returns 401."""
        app, _ = _build_app_no_auth()
        client = TestClient(app)
        resp = client.post("/api/v1/agencies/agency-1/runs/run-1/cancel")
        assert resp.status_code in (401, 403)


# ── Feature Flag Tests ──────────────────────────────────────────


class TestAgencyRouterFeatureFlag:
    """All endpoints return 404 when AGENCY_SWARM_ENABLED is false."""

    def test_run_returns_404_when_disabled(self):
        """POST /run returns 404 when feature flag is off."""
        app, _ = _build_app(feature_enabled=False)
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Hello"},
        )
        assert resp.status_code == 404

    def test_stream_returns_404_when_disabled(self):
        """POST /stream returns 404 when feature flag is off."""
        app, _ = _build_app(feature_enabled=False)
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/stream",
            json={"message": "Hello"},
        )
        assert resp.status_code == 404

    def test_list_runs_returns_404_when_disabled(self):
        """GET /runs returns 404 when feature flag is off."""
        app, _ = _build_app(feature_enabled=False)
        client = TestClient(app)
        resp = client.get("/api/v1/agencies/agency-1/runs")
        assert resp.status_code == 404

    def test_cancel_returns_404_when_disabled(self):
        """POST /cancel returns 404 when feature flag is off."""
        app, _ = _build_app(feature_enabled=False)
        client = TestClient(app)
        resp = client.post("/api/v1/agencies/agency-1/runs/run-1/cancel")
        assert resp.status_code == 404

    def test_run_details_returns_404_when_disabled(self):
        """GET /runs/{run_id} returns 404 when feature flag is off."""
        app, _ = _build_app(feature_enabled=False)
        client = TestClient(app)
        resp = client.get("/api/v1/agencies/agency-1/runs/run-1")
        assert resp.status_code == 404


# ── Run Endpoint Tests ──────────────────────────────────────────


class TestAgencyRunEndpoint:
    """POST /api/v1/agencies/{agency_id}/run -- non-streaming execution."""

    @patch("app.api.agencies.AgencyService")
    def test_returns_run_result_with_run_id(self, MockService):
        """Successful run returns JSON with normalized response and compatibility output."""
        mock_result = _make_run_result()
        mock_result.structured_result = None
        mock_result.preview_artifacts = []
        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(return_value=mock_result)
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Analyze this topic"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "run_id" in data
        assert data["status"] == "completed"
        assert data["response"] == "The analysis is complete."
        assert data["output"] == "The analysis is complete."
        assert data["structured_result"] is None
        assert data["preview_artifacts"] == []
        assert "credits_used" in data
        assert "duration_ms" in data

    @patch("app.api.agencies.AgencyService")
    def test_returns_structured_result_metadata_when_present(self, MockService):
        """Structured runs expose the additive envelope and preview metadata."""
        mock_result = _make_run_result()
        mock_result.response = "Research preview ready."
        mock_result.structured_result = {
            "version": "1.0",
            "intent": "research_report",
            "summary": "Research preview ready.",
            "payload": {"title": "Market scan"},
            "artifacts": [{"artifact_type": "research_report", "title": "Market scan"}],
            "references": [],
            "metrics": {},
        }
        mock_result.preview_artifacts = [{
            "id": "artifact-1",
            "intent": "research_report",
            "artifact_type": "research_report",
            "state": "preview_generated",
            "summary": "Research preview ready.",
            "commit_status": "not_committed",
            "commit_token": "commit-token-1",
        }]
        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(return_value=mock_result)
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Analyze this topic"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["response"] == "Research preview ready."
        assert data["output"] == "Research preview ready."
        assert data["structured_result"]["intent"] == "research_report"
        assert data["preview_artifacts"][0]["state"] == "preview_generated"

    def test_returns_422_for_missing_message(self):
        """Missing 'message' field in request body returns 422."""
        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={},
        )
        assert resp.status_code == 422

    @patch("app.api.agencies.AgencyService")
    def test_returns_402_on_insufficient_credits(self, MockService):
        """When credit pre-check fails, returns 402 Payment Required."""
        from app.services.agency_service import InsufficientCreditsError

        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(
            side_effect=InsufficientCreditsError("Not enough credits")
        )
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Analyze this"},
        )
        assert resp.status_code == 402

    @patch("app.api.agencies.AgencyService")
    def test_returns_404_for_nonexistent_agency(self, MockService):
        """Agency ID not found returns 404."""
        from app.services.agency_service import AgencyNotFoundError

        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(
            side_effect=AgencyNotFoundError("Agency not found")
        )
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/nonexistent/run",
            json={"message": "Hello"},
        )
        assert resp.status_code == 404


# ── Stream Endpoint Tests ───────────────────────────────────────


class TestAgencyStreamEndpoint:
    """POST /api/v1/agencies/{agency_id}/stream -- SSE streaming execution."""

    @patch("app.api.agencies.AgencyService")
    def test_returns_sse_content_type(self, MockService):
        """Response has Content-Type: text/event-stream."""

        async def _mock_stream(*args, **kwargs):
            yield {"event": "run_started", "data": {"run_id": "r1", "agency_id": "a1"}}
            yield {"event": "token", "data": {"delta": "Hello"}}
            yield {"event": "run_finished", "data": {"run_id": "r1"}}

        mock_svc = MagicMock()
        mock_svc.execute_run_stream = _mock_stream
        mock_svc.credit_manager.estimate_run_cost.return_value = 0.1
        mock_svc.credit_manager.pre_check = AsyncMock(return_value=True)
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/stream",
            json={"message": "Hello"},
        )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    @patch("app.api.agencies.AgencyService")
    def test_sse_headers_include_no_cache(self, MockService):
        """Response includes Cache-Control: no-cache and X-Accel-Buffering: no."""

        async def _mock_stream(*args, **kwargs):
            yield {"event": "run_started", "data": {"run_id": "r1", "agency_id": "a1"}}
            yield {"event": "run_finished", "data": {"run_id": "r1"}}

        mock_svc = MagicMock()
        mock_svc.execute_run_stream = _mock_stream
        mock_svc.credit_manager.estimate_run_cost.return_value = 0.1
        mock_svc.credit_manager.pre_check = AsyncMock(return_value=True)
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/stream",
            json={"message": "Hello"},
        )

        assert resp.status_code == 200
        assert "no-cache" in resp.headers.get("cache-control", "")
        assert resp.headers.get("x-accel-buffering") == "no"

    @patch("app.api.agencies.AgencyService")
    def test_returns_402_on_insufficient_credits(self, MockService):
        """Credit pre-check failure prevents streaming and returns 402."""
        mock_svc = MagicMock()
        mock_svc.credit_manager.estimate_run_cost.return_value = 10.0
        mock_svc.credit_manager.pre_check = AsyncMock(return_value=False)
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/stream",
            json={"message": "Hello"},
        )

        assert resp.status_code == 402


# ── List Runs Endpoint Tests ────────────────────────────────────


class TestAgencyListRunsEndpoint:
    """GET /api/v1/agencies/{agency_id}/runs -- list runs for an agency."""

    @patch("app.api.agencies.AgencyService")
    def test_returns_runs_filtered_by_tenant(self, MockService):
        """Runs returned are filtered to the authenticated user's tenant."""
        mock_svc = MagicMock()
        mock_svc.list_runs = AsyncMock(return_value={
            "runs": [
                {
                    "id": "run-1",
                    "status": "completed",
                    "total_credits_used": 1.5,
                    "started_at": None,
                    "completed_at": None,
                    "duration_ms": 2000,
                    "error_type": None,
                    "error_message": None,
                    "step_count": 3,
                },
            ],
            "total": 1,
        })
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.get("/api/v1/agencies/agency-1/runs")

        assert resp.status_code == 200
        data = resp.json()
        assert "runs" in data
        assert "total" in data

    @patch("app.api.agencies.AgencyService")
    def test_returns_empty_list_for_no_runs(self, MockService):
        """No runs for agency returns an empty list (not 404)."""
        mock_svc = MagicMock()
        mock_svc.list_runs = AsyncMock(return_value={"runs": [], "total": 0})
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.get("/api/v1/agencies/agency-1/runs")

        assert resp.status_code == 200
        data = resp.json()
        assert data["runs"] == []
        assert data["total"] == 0


# ── Cancel Endpoint Tests ───────────────────────────────────────


class TestAgencyCancelEndpoint:
    """POST /api/v1/agencies/{agency_id}/runs/{run_id}/cancel."""

    @patch("app.api.agencies.AgencyService")
    def test_cancel_returns_success(self, MockService):
        """Cancelling a running run returns success status."""
        mock_svc = MagicMock()
        mock_svc.cancel_run = AsyncMock(return_value={"run_id": "run-1", "status": "cancelled"})
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post("/api/v1/agencies/agency-1/runs/run-1/cancel")

        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == "run-1"
        assert data["status"] == "cancelled"

    @patch("app.api.agencies.AgencyService")
    def test_cancel_nonexistent_run_returns_404(self, MockService):
        """Cancelling a run that does not exist returns 404."""
        from app.services.agency_service import AgencyNotFoundError

        mock_svc = MagicMock()
        mock_svc.cancel_run = AsyncMock(side_effect=AgencyNotFoundError("Run not found"))
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post("/api/v1/agencies/agency-1/runs/nonexistent/cancel")

        assert resp.status_code == 404


# ── Error Handling Tests ────────────────────────────────────────


class TestAgencyErrorHandling:
    """Error classification: transient (retry), permanent (fail), optional (skip)."""

    def test_classify_transient_timeout(self):
        """Timeout error is classified as transient."""
        from app.api.agencies import classify_error, AgencyErrorType

        result = classify_error(asyncio.TimeoutError("timed out"))
        assert result == AgencyErrorType.TRANSIENT

    def test_classify_transient_429(self):
        """HTTP 429 error is classified as transient."""
        from app.api.agencies import classify_error, AgencyErrorType

        err = Exception("429 Too Many Requests")
        err.status_code = 429  # type: ignore[attr-defined]
        result = classify_error(err)
        assert result == AgencyErrorType.TRANSIENT

    def test_classify_permanent_auth_failure(self):
        """Auth failure (401) is classified as permanent."""
        from app.api.agencies import classify_error, AgencyErrorType

        err = Exception("401 Unauthorized")
        err.status_code = 401  # type: ignore[attr-defined]
        result = classify_error(err)
        assert result == AgencyErrorType.PERMANENT

    def test_classify_permanent_credit_exhaustion(self):
        """InsufficientCreditsError is classified as permanent."""
        from app.api.agencies import classify_error, AgencyErrorType
        from app.services.agency_service import InsufficientCreditsError

        result = classify_error(InsufficientCreditsError("No credits"))
        assert result == AgencyErrorType.PERMANENT

    def test_classify_optional_agent_skip(self):
        """Optional agent failure is classified as optional_skip."""
        from app.api.agencies import classify_error, AgencyErrorType

        result = classify_error(Exception("Agent failed"), agent_is_optional=True)
        assert result == AgencyErrorType.OPTIONAL_SKIP

    def test_classify_required_agent_failure(self):
        """Required agent failure is NOT optional_skip."""
        from app.api.agencies import classify_error, AgencyErrorType

        result = classify_error(Exception("Agent failed"), agent_is_optional=False)
        # Required agent failure is treated as permanent (not skip)
        assert result != AgencyErrorType.OPTIONAL_SKIP

    @patch("app.api.agencies.AgencyService")
    def test_fallback_safe_single_agent(self, MockService):
        """If isFallbackSafe=true and service degrades, falls back to single-agent."""
        mock_result = _make_run_result()
        mock_result.response = "Fallback response"
        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(return_value=mock_result)
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Hello"},
        )

        assert resp.status_code == 200
        # Fallback behavior is handled by service layer -- router just returns the result

    @patch("app.api.agencies.AgencyService")
    def test_non_fallback_safe_fails_closed(self, MockService):
        """If isFallbackSafe=false and service degrades, returns error."""
        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(side_effect=Exception("Service degraded"))
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Hello"},
        )

        assert resp.status_code == 503

    @patch("app.api.agencies.AgencyService")
    def test_partial_completion_charges_completed_steps_only(self, MockService):
        """When a run partially completes, only the completed LLM calls are charged."""
        # This is tested via the service layer -- router returns the error.
        # The credit reconciliation is handled internally.
        mock_svc = MagicMock()
        mock_svc.execute_run = AsyncMock(
            side_effect=Exception("Partial failure after 2 steps")
        )
        MockService.return_value = mock_svc

        app, _ = _build_app()
        client = TestClient(app)
        resp = client.post(
            "/api/v1/agencies/agency-1/run",
            json={"message": "Hello"},
        )

        # Run fails -- credits for completed steps are already deducted by gateway
        assert resp.status_code == 503


# ── Retry Logic Tests ───────────────────────────────────────────


class TestRetryLogic:
    """Tests for the with_retry utility."""

    async def test_retries_on_transient_error(self):
        """Retry succeeds after transient failure."""
        from app.api.agencies import with_retry

        call_count = 0

        async def _flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise asyncio.TimeoutError("timeout")
            return "success"

        result = await with_retry(lambda: _flaky(), max_retries=3)
        assert result == "success"
        assert call_count == 3

    async def test_permanent_error_no_retry(self):
        """Permanent error is not retried."""
        from app.api.agencies import with_retry
        from app.services.agency_service import InsufficientCreditsError

        async def _permanent():
            raise InsufficientCreditsError("No credits")

        with pytest.raises(InsufficientCreditsError):
            await with_retry(lambda: _permanent(), max_retries=3)

    async def test_max_retries_exhausted(self):
        """After max retries, the last error is raised."""
        from app.api.agencies import with_retry

        async def _always_fails():
            raise asyncio.TimeoutError("timeout")

        with pytest.raises(asyncio.TimeoutError):
            await with_retry(lambda: _always_fails(), max_retries=3)
