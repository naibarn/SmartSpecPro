"""Tests for correlation ID middleware in Python backend."""

import re
import pytest
import httpx

from fastapi import FastAPI

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def create_test_app() -> FastAPI:
    """Create a minimal FastAPI app with the request logging middleware."""
    app = FastAPI()

    from app.core.request_logging import RequestLoggingMiddleware

    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}

    return app


class TestCorrelationId:
    """Test X-Request-ID generation and forwarding."""

    @pytest.mark.anyio
    async def test_generates_request_id_when_not_provided(self):
        app = create_test_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/test")

        assert response.status_code == 200
        request_id = response.headers.get("x-request-id")
        assert request_id is not None
        assert UUID_PATTERN.match(request_id)

    @pytest.mark.anyio
    async def test_uses_incoming_request_id(self):
        app = create_test_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/test",
                headers={"X-Request-ID": "test-corr-456"},
            )

        assert response.status_code == 200
        assert response.headers.get("x-request-id") == "test-corr-456"
