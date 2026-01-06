import os
import time
import pytest

# requests is only needed for integration/e2e; avoid hard dependency for unit runs
requests = pytest.importorskip("requests")

pytestmark = [pytest.mark.integration, pytest.mark.e2e]

CONTROL_PLANE = os.getenv("CONTROL_PLANE_URL", "http://localhost:7070")
API_KEY = os.getenv("CONTROL_PLANE_API_KEY", "change_me_long_random_change_me_long_random")


def mint(role="user", project_id=None, session_id=None):
    r = requests.post(
        f"{CONTROL_PLANE}/api/v1/auth/token",
        json={"apiKey": API_KEY, "role": role, "projectId": project_id, "sessionId": session_id, "ttlSeconds": 600},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["token"]


def test_healthz():
    r = requests.get(f"{CONTROL_PLANE}/healthz", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_mint_and_projects_flow():
    # This test requires a running control-plane and valid API key.
    tok = mint(role="admin")
    r = requests.get(f"{CONTROL_PLANE}/api/v1/projects", headers={"authorization": f"Bearer {tok}"}, timeout=10)
    # If server is up but empty data is ok; just require auth works
    assert r.status_code in (200, 404)
