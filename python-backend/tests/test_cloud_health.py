"""
Tests for Cloud Run health and readiness endpoints.
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import health
from app.llm_proxy.unified_client import unified_client


@pytest.mark.asyncio
class TestCloudHealth:
    """Tests for /health (startup probe) and /ready (readiness probe)."""

    async def test_health_reports_missing_worker_jobs_schema(self, client: TestClient):
        """The comprehensive health check reports an unavailable control plane."""
        response = client.get("/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        worker_jobs = next(service for service in data["services"] if service["name"] == "worker_jobs")
        assert worker_jobs["status"] == "unhealthy"

    async def test_health_live_returns_alive_while_app_is_running(self, client: TestClient):
        """The liveness probe does not depend on database or worker readiness."""
        response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "alive"

    async def test_ready_returns_200_when_database_and_llm_proxy_are_ready(
        self, client: TestClient, monkeypatch
    ):
        """Readiness requires a working database and an initialized LLM proxy."""
        monkeypatch.setattr(unified_client, "_initialized", True)
        response = client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert "timestamp" in data

    async def test_ready_returns_503_when_llm_proxy_is_uninitialized(
        self, client: TestClient, monkeypatch
    ):
        """Readiness stays closed until the LLM proxy has completed startup."""
        monkeypatch.setattr(unified_client, "_initialized", False)
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["status"] == "not_ready"

    async def test_llm_proxy_health_accepts_reachable_configured_web_gateway(
        self, monkeypatch
    ):
        class GatewayResponse:
            status_code = 200

        class GatewayClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, _url):
                return GatewayResponse()

        monkeypatch.setattr(health.settings, "SMARTSPEC_USE_WEB_GATEWAY", True)
        monkeypatch.setattr(
            health.settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://127.0.0.1:3100"
        )
        monkeypatch.setattr(health.settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "dev-token")
        monkeypatch.setattr(
            health,
            "httpx",
            SimpleNamespace(AsyncClient=lambda **_kwargs: GatewayClient()),
            raising=False,
        )
        monkeypatch.setattr(unified_client, "_initialized", True)
        monkeypatch.setattr(unified_client, "openrouter_client", None)
        monkeypatch.setattr(unified_client, "direct_providers", {})

        result = await health.check_llm_proxy()

        assert result.status == "healthy"
        assert result.message == "SmartAIHub Web Gateway is reachable"

    async def test_llm_proxy_health_rejects_unreachable_configured_web_gateway(
        self, monkeypatch
    ):
        class GatewayResponse:
            status_code = 503

        class GatewayClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, _url):
                return GatewayResponse()

        monkeypatch.setattr(health.settings, "SMARTSPEC_USE_WEB_GATEWAY", True)
        monkeypatch.setattr(
            health.settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://127.0.0.1:3100"
        )
        monkeypatch.setattr(health.settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "dev-token")
        monkeypatch.setattr(
            health,
            "httpx",
            SimpleNamespace(AsyncClient=lambda **_kwargs: GatewayClient()),
            raising=False,
        )
        monkeypatch.setattr(unified_client, "_initialized", True)
        monkeypatch.setattr(unified_client, "openrouter_client", None)
        monkeypatch.setattr(unified_client, "direct_providers", {})

        result = await health.check_llm_proxy()

        assert result.status == "unhealthy"
        assert result.message == "SmartAIHub Web Gateway is unavailable"


@pytest.mark.asyncio
class TestGracefulShutdown:
    """Tests for SIGTERM graceful shutdown behavior."""

    @pytest.mark.skip("Requires lifespan context and signal handling")
    async def test_sigterm_flushes_sentry(self):
        """SIGTERM triggers sentry_sdk.flush() during shutdown."""
        pass

    @pytest.mark.skip("Requires lifespan context and signal handling")
    async def test_sigterm_disposes_engine(self):
        """SIGTERM triggers engine.dispose() during shutdown."""
        pass

    @pytest.mark.skip("Requires lifespan context and signal handling")
    async def test_sigterm_closes_redis(self):
        """SIGTERM triggers Redis connection close during shutdown."""
        pass
