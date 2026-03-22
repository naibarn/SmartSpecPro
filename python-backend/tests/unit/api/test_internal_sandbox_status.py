from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.internal_sandbox import router
from app.core.config import settings
from app.core.database import get_db
from app.models.sandbox import SandboxJob


@pytest.mark.asyncio
async def test_internal_sandbox_status_endpoint_returns_job_snapshot(monkeypatch):
    app = FastAPI()
    app.include_router(router)

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    job = SandboxJob()
    job.id = "job-123"
    job.status = "completed"
    job.status_reason = None
    job.opensandbox_id = "sbx-1"
    job.output_manifest_json = {"artifacts": []}
    job.stdout_excerpt = "stdout"
    job.stderr_excerpt = ""
    job.started_at = datetime(2026, 3, 20, tzinfo=timezone.utc)
    job.finished_at = datetime(2026, 3, 20, 0, 1, tzinfo=timezone.utc)

    class _ExecuteResult:
        def scalar_one_or_none(self):
            return job

    session = AsyncMock()
    session.execute.return_value = _ExecuteResult()

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/internal/sandbox/status/job-123",
            headers={"x-proxy-token": "proxy-token"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_id"] == "job-123"
    assert payload["status"] == "completed"
    assert payload["opensandbox_id"] == "sbx-1"
    assert payload["output_manifest"] == {"artifacts": []}
