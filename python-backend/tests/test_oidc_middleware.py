"""Tests for the Cloud Tasks OIDC validation middleware."""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from app.middleware.oidc_auth import OIDCAuthMiddleware


def create_test_app() -> FastAPI:
    """Create a test FastAPI app with OIDC middleware."""
    app = FastAPI()
    app.add_middleware(OIDCAuthMiddleware)

    @app.post("/tasks/test-endpoint")
    async def test_endpoint():
        return {"status": "ok"}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


@pytest.mark.unit
class TestOIDCValidation:
    """Tests for OIDC token validation on /tasks/* endpoints."""

    @pytest.mark.asyncio
    async def test_non_tasks_path_passes_through(self):
        """Non /tasks/ paths should not require OIDC."""
        app = create_test_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_missing_authorization_header_returns_401(self):
        """Request without an Authorization header returns 401."""
        with patch.dict("os.environ", {"ENVIRONMENT": "production"}):
            app = create_test_app()
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/tasks/test-endpoint")
                assert response.status_code == 401
                data = response.json()
                assert "error" in data

    @pytest.mark.asyncio
    async def test_oidc_skipped_in_development_mode(self):
        """When ENVIRONMENT=development, OIDC validation is skipped."""
        with patch.dict("os.environ", {
            "ENVIRONMENT": "development",
            "TASKS_INTERNAL_TOKEN": "dev-token-123",
        }):
            app = create_test_app()
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/tasks/test-endpoint",
                    headers={"X-Internal-Token": "dev-token-123"},
                )
                assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_dev_mode_rejects_wrong_internal_token(self):
        """In dev mode, wrong internal token returns 401."""
        with patch.dict("os.environ", {
            "ENVIRONMENT": "development",
            "TASKS_INTERNAL_TOKEN": "dev-token-123",
        }):
            app = create_test_app()
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/tasks/test-endpoint",
                    headers={"X-Internal-Token": "wrong-token"},
                )
                assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_bearer_token_returns_401(self):
        """Request with invalid Bearer token returns 401."""
        with patch.dict("os.environ", {"ENVIRONMENT": "production"}):
            app = create_test_app()
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/tasks/test-endpoint",
                    headers={"Authorization": "Bearer invalid-token"},
                )
                assert response.status_code == 401
