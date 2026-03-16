"""Integration tests for Automation Copilot FastAPI endpoints."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.automation_copilot import router

VALID_TOKEN = "test-internal-token-abc"
ENDPOINT_PREFIX = "/api/v1/automation-copilot"


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(router, prefix=ENDPOINT_PREFIX)
    return app


@pytest.fixture
def mock_redis():
    r = MagicMock()
    store = {}

    def set_side_effect(key, value, **kwargs):
        store[key] = value

    def get_side_effect(key):
        return store.get(key)

    r.set = MagicMock(side_effect=set_side_effect)
    r.get = MagicMock(side_effect=get_side_effect)
    r._store = store
    return r


@pytest.fixture
def client(app, mock_redis):
    with patch("app.api.automation_copilot.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = None
        mock_settings.CELERY_BROKER_URL = "redis://localhost:6379/0"
        with patch("app.api.automation_copilot._get_redis", return_value=mock_redis):
            yield TestClient(app)


@pytest.fixture
def internal_headers():
    return {"X-Internal-Token": VALID_TOKEN}


class TestAnalyzeEndpoint:
    def test_returns_401_without_internal_token(self, client):
        resp = client.post(f"{ENDPOINT_PREFIX}/analyze", json={
            "prompt": "click submit",
            "tenant_id": "t1",
            "user_id": 1,
                    })
        assert resp.status_code == 401

    def test_returns_403_if_feature_flag_disabled(self, client, internal_headers, mock_redis):
        mock_redis._store["feature_flag:automationCopilot:t1"] = "0"
        resp = client.post(
            f"{ENDPOINT_PREFIX}/analyze",
            json={"prompt": "test", "tenant_id": "t1", "user_id": 1},
            headers=internal_headers,
        )
        assert resp.status_code == 403

    def test_returns_200_and_enqueues_task(self, client, internal_headers):
        with patch("app.tasks.automation_copilot_task.automation_analyze_task") as mock_task:
            mock_task.delay = MagicMock()
            resp = client.post(
                f"{ENDPOINT_PREFIX}/analyze",
                json={"prompt": "click submit", "tenant_id": "t1", "user_id": 1},
                headers=internal_headers,
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data
        assert data["task_id"].startswith("auto-")
        mock_task.delay.assert_called_once()


class TestStatusEndpoint:
    def test_returns_404_for_unknown_task_id(self, client, internal_headers):
        resp = client.get(
            f"{ENDPOINT_PREFIX}/status/unknown-task?tenant_id=t1",
            headers=internal_headers,
        )
        assert resp.status_code == 404

    def test_returns_403_if_tenant_id_mismatch(self, client, internal_headers, mock_redis):
        mock_redis._store["automation:task-1"] = json.dumps({"status": "running", "tenant_id": "t1"})
        resp = client.get(
            f"{ENDPOINT_PREFIX}/status/task-1?tenant_id=t2",
            headers=internal_headers,
        )
        assert resp.status_code == 403

    def test_returns_current_status_from_redis(self, client, internal_headers, mock_redis):
        mock_redis._store["automation:task-1"] = json.dumps({
            "status": "success",
            "tenant_id": "t1",
            "actual_credits_used": 5,
        })
        resp = client.get(
            f"{ENDPOINT_PREFIX}/status/task-1?tenant_id=t1",
            headers=internal_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["actual_credits_used"] == 5


class TestExecuteEndpoint:
    def test_returns_200_and_enqueues_execution_task(self, client, internal_headers):
        with patch("app.tasks.automation_copilot_task.automation_execute_task") as mock_task:
            mock_task.delay = MagicMock()
            resp = client.post(
                f"{ENDPOINT_PREFIX}/execute",
                json={
                    "task_id": "task-1",
                    "execution_id": "exec-1",
                    "intent_json": "{}",
                                        "tenant_id": "t1",
                    "user_id": 1,
                    "vision_model": "gpt-4o",
                    "allowed_domains": ["example.com"],
                },
                headers=internal_headers,
            )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        mock_task.delay.assert_called_once()


class TestCancelEndpoint:
    def test_sets_redis_cancel_key_with_ttl(self, client, internal_headers, mock_redis):
        mock_redis._store["automation:task-1"] = json.dumps({"status": "running", "tenant_id": "t1"})
        resp = client.post(
            f"{ENDPOINT_PREFIX}/cancel/task-1",
            json={"tenant_id": "t1"},
            headers=internal_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == {"cancelled": True}
        assert mock_redis._store.get("automation:task-1:cancel") == "1"

    def test_returns_403_if_tenant_id_mismatch(self, client, internal_headers, mock_redis):
        mock_redis._store["automation:task-1"] = json.dumps({"status": "running", "tenant_id": "t1"})
        resp = client.post(
            f"{ENDPOINT_PREFIX}/cancel/task-1",
            json={"tenant_id": "t2"},
            headers=internal_headers,
        )
        assert resp.status_code == 403

    def test_returns_404_for_unknown_task(self, client, internal_headers):
        resp = client.post(
            f"{ENDPOINT_PREFIX}/cancel/unknown-task",
            json={"tenant_id": "t1"},
            headers=internal_headers,
        )
        assert resp.status_code == 404


class TestTemplatesEndpoint:
    def test_returns_empty_list_placeholder(self, client, internal_headers):
        resp = client.get(
            f"{ENDPOINT_PREFIX}/templates?tenant_id=t1",
            headers=internal_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["templates"] == []
        assert data["next_cursor"] is None
