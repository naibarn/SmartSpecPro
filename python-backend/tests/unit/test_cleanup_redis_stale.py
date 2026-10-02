"""Regression contract for the retired Redis media-job cleanup route."""

import httpx
import pytest

from app.main import app


@pytest.mark.unit
@pytest.mark.asyncio
async def test_old_cleanup_schedule_is_a_noop_without_redis(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("TASKS_INTERNAL_TOKEN", "test-internal-token-for-tasks")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-Internal-Token": "test-internal-token-for-tasks"},
    ) as client:
        response = await client.post("/tasks/cleanup-redis-stale", json={})

    assert response.status_code == 200
    assert response.json() == {"status": "retired", "cleaned_count": 0}
