"""Automation Copilot endpoints use canonical worker_jobs status and cancel."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.automation_copilot import router

VALID_TOKEN = "test-internal-token-abc"
ENDPOINT_PREFIX = "/api/v1/automation-copilot"


@pytest.fixture
def app():
    application = FastAPI()
    application.include_router(router, prefix=ENDPOINT_PREFIX)
    return application


@pytest.fixture
def client(app):
    with patch("app.api.automation_copilot.settings") as settings:
        settings.SMARTSPEC_WEB_GATEWAY_TOKEN = VALID_TOKEN
        yield TestClient(app)


@pytest.fixture
def internal_headers():
    return {"X-Internal-Token": VALID_TOKEN}


def test_analyze_requires_internal_token(client):
    response = client.post(
        f"{ENDPOINT_PREFIX}/analyze",
        json={"prompt": "click submit", "tenant_id": "t1", "user_id": 1},
    )
    assert response.status_code == 401


def test_analyze_enqueues_canonical_worker_job(client, internal_headers):
    with patch("app.api.automation_copilot.dispatch_python_task") as dispatch:
        response = client.post(
            f"{ENDPOINT_PREFIX}/analyze",
            json={"prompt": "click submit", "tenant_id": "t1", "user_id": 1},
            headers=internal_headers,
        )

    assert response.status_code == 200
    task_id = response.json()["task_id"]
    assert task_id.startswith("auto-")
    dispatch.assert_called_once()
    assert dispatch.call_args.args[0].endswith("automation_analyze_task")


def test_status_reads_canonical_worker_job_projection(client, internal_headers):
    with patch(
        "app.tasks.automation_copilot_task.get_status",
        return_value={
            "status": "success",
            "tenant_id": "t1",
            "actual_credits_used": 5,
        },
    ) as get_status:
        response = client.get(
            f"{ENDPOINT_PREFIX}/status/task-1?tenant_id=t1",
            headers=internal_headers,
        )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["actual_credits_used"] == 5
    get_status.assert_called_once_with("task-1", tenant_id="t1")


def test_status_returns_404_when_canonical_job_is_not_visible(client, internal_headers):
    with patch("app.tasks.automation_copilot_task.get_status", return_value=None):
        response = client.get(
            f"{ENDPOINT_PREFIX}/status/task-1?tenant_id=t2",
            headers=internal_headers,
        )
    assert response.status_code == 404


def test_execute_enqueues_canonical_worker_job(client, internal_headers):
    with (
        patch("app.services.playwright_feature_gate.is_playwright_enabled", return_value=True),
        patch("app.api.automation_copilot.dispatch_python_task") as dispatch,
    ):
        response = client.post(
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

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    dispatch.assert_called_once()


def test_cancel_requests_canonical_job_cancellation(client, internal_headers):
    client_instance = MagicMock()
    with (
        patch(
            "app.tasks.automation_copilot_task.get_status",
            return_value={"canonical_job_id": "job-1"},
        ),
        patch(
            "app.services.job_control_plane.JobControlPlaneClient",
            return_value=client_instance,
        ),
    ):
        response = client.post(
            f"{ENDPOINT_PREFIX}/cancel/task-1",
            json={"tenant_id": "t1"},
            headers=internal_headers,
        )

    assert response.status_code == 200
    assert response.json() == {"cancelled": True}
    client_instance.cancel.assert_called_once_with(
        "job-1",
        action_id="automation-cancel:t1:task-1",
        reason="cancelled_by_request",
        tenant_id="t1",
    )


def test_cancel_returns_404_when_job_is_not_visible(client, internal_headers):
    with patch("app.tasks.automation_copilot_task.get_status", return_value=None):
        response = client.post(
            f"{ENDPOINT_PREFIX}/cancel/task-1",
            json={"tenant_id": "t2"},
            headers=internal_headers,
        )
    assert response.status_code == 404
