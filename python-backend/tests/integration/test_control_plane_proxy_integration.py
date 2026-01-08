"""Integration tests for the control-plane proxy.

These tests simulate the Desktop app calling the Python backend,
which in turn talks to the Control Plane service via HTTPX.
The control-plane itself is mocked, but we keep state across calls
to represent a simple workflow: create project -> list projects.
"""

import json
import types
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from app.main import app


# Simple in-memory store representing projects in the Control Plane
_PROJECTS: List[Dict[str, Any]] = []


class _MockControlPlaneClient:
    """Mock httpx.AsyncClient used by the control-plane proxy.

    It simulates:
    1) Minting a short-lived JWT token from /api/v1/auth/token
    2) Forwarding project-related requests under /api/v1/projects
    """

    def __init__(self, *args, **kwargs):
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json=None, **kwargs):
        """Handle POST requests (used for minting tokens)."""
        self.requests.append(("POST", url, json, kwargs))
        # Simulate minting a token for the control-plane
        if url.endswith("/api/v1/auth/token"):
            return types.SimpleNamespace(
                status_code=200,
                json=lambda: {"token": "cp-token-123"},
                raise_for_status=lambda: None,
            )
        # Anything else would be unexpected in this test
        raise AssertionError(f"Unexpected POST to {url!r}")

    async def request(self, method, url, params=None, content=None, headers=None, **kwargs):
        """Handle the forwarded request from the proxy."""
        self.requests.append((method, url, params, content, headers, kwargs))

        # The proxy should forward only to the configured CONTROL_PLANE_URL
        assert url.startswith("http://control-plane.test/")
        assert "/api/v1/projects" in url

        # Should send the bearer token minted earlier
        assert headers is not None
        assert headers.get("authorization") == "Bearer cp-token-123"

        # Decode body when present
        if isinstance(content, (bytes, bytearray)):
            body = json.loads(content.decode("utf-8"))
        elif isinstance(content, str):
            body = json.loads(content)
        elif content is None:
            body = {}
        else:
            body = content

        # Simulate basic REST behavior for projects
        if method.upper() == "POST" and url.endswith("/api/v1/projects"):
            name = body.get("name") or "Unnamed"
            project = {"id": f"proj_{len(_PROJECTS) + 1}", "name": name}
            _PROJECTS.append(project)
            return types.SimpleNamespace(
                status_code=200,
                json=lambda: project,
                raise_for_status=lambda: None,
            )

        if method.upper() == "GET" and url.endswith("/api/v1/projects"):
            return types.SimpleNamespace(
                status_code=200,
                json=lambda: list(_PROJECTS),
                raise_for_status=lambda: None,
            )

        raise AssertionError(f"Unexpected request {method} {url!r}")


@pytest.mark.integration
def test_desktop_create_project_via_proxy(monkeypatch):
    """Desktop creates a project via backend -> control-plane proxy."""
    import httpx

    # Ensure the in-memory store is empty before this test
    _PROJECTS.clear()

    # Configure environment as if the backend was running in front of the control-plane
    monkeypatch.setenv("CONTROL_PLANE_URL", "http://control-plane.test")
    monkeypatch.setenv("CONTROL_PLANE_API_KEY", "test-api-key")

    # Replace httpx.AsyncClient with our mock implementation
    monkeypatch.setattr(httpx, "AsyncClient", _MockControlPlaneClient)

    client = TestClient(app)

    response = client.post(
        "/api/v1/control-plane/api/v1/projects",
        json={"name": "My Project"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "proj_1"
    assert data["name"] == "My Project"


@pytest.mark.integration
def test_desktop_create_and_list_projects_via_proxy_workflow(monkeypatch):
    """End-to-end style workflow: create project then list projects.

    This simulates the Desktop app first creating a project via the backend,
    then loading the project list via the same backend -> control-plane proxy.
    """
    import httpx

    _PROJECTS.clear()

    monkeypatch.setenv("CONTROL_PLANE_URL", "http://control-plane.test")
    monkeypatch.setenv("CONTROL_PLANE_API_KEY", "test-api-key")

    monkeypatch.setattr(httpx, "AsyncClient", _MockControlPlaneClient)

    client = TestClient(app)

    # Step 1: Desktop creates a project through the backend proxy
    create_resp = client.post(
        "/api/v1/control-plane/api/v1/projects",
        json={"name": "Workflow Project"},
    )
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["id"] == "proj_1"
    assert created["name"] == "Workflow Project"

    # Step 2: Desktop fetches the project list via the same proxy
    list_resp = client.get("/api/v1/control-plane/api/v1/projects")
    assert list_resp.status_code == 200
    projects = list_resp.json()
    assert isinstance(projects, list)
    assert len(projects) == 1
    assert projects[0]["id"] == "proj_1"
    assert projects[0]["name"] == "Workflow Project"
