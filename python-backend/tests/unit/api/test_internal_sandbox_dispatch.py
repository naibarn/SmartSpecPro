from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.internal_sandbox import SandboxDispatchRequest, _build_manifest, router
from app.core.config import settings
from app.core.database import get_db


def _make_request(**overrides):
    payload = {
        "feature_type": "skill",
        "execution_mode": "sandbox-command",
        "tenant_id": "tenant-1",
        "user_id": 42,
        "metadata": {
            "commands": ["echo ok"],
            "output_paths": ["/tmp/smartspec-sandbox/skill-output/result.json"],
        },
    }
    payload.update(overrides)
    return SandboxDispatchRequest.model_validate(payload)


def test_build_manifest_rejects_paths_outside_workspace():
    request = _make_request(
        metadata={
            "commands": ["echo ok"],
            "output_paths": ["/workspace/../etc/passwd"],
        }
    )

    with pytest.raises(ValueError, match="Path must stay within allowed sandbox roots"):
        _build_manifest(request)


@pytest.mark.asyncio
async def test_internal_sandbox_dispatch_returns_400_for_invalid_workspace_path(monkeypatch):
    app = FastAPI()
    app.include_router(router)

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    session = AsyncMock()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/sandbox/dispatch",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "feature_type": "skill",
                "execution_mode": "sandbox-command",
                "tenant_id": "tenant-1",
                "user_id": 42,
                "metadata": {
                    "commands": ["echo ok"],
                    "output_paths": ["/workspace/../etc/passwd"],
                },
            },
        )

    assert response.status_code == 400
    assert "Path must stay within allowed sandbox roots" in response.json()["detail"]


@pytest.mark.asyncio
async def test_internal_sandbox_dispatch_accepts_web_gateway_token_when_proxy_token_differs(monkeypatch):
    app = FastAPI()
    app.include_router(router)

    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    dispatch_mock = AsyncMock(return_value="job-123")
    monkeypatch.setattr("app.api.internal_sandbox.SandboxDispatcher.dispatch", dispatch_mock)

    session = AsyncMock()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/sandbox/dispatch",
            headers={"x-internal-token": "gateway-token"},
            json={
                "feature_type": "skill",
                "execution_mode": "sandbox-command",
                "tenant_id": "tenant-1",
                "user_id": 42,
                "metadata": {
                    "commands": ["echo ok"],
                    "output_paths": ["/tmp/smartspec-sandbox/skill-output/result.json"],
                },
            },
        )

    assert response.status_code == 200
    assert response.json() == {"job_id": "job-123"}
