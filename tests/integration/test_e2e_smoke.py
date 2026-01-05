import os
import time
import requests

CONTROL_PLANE = os.getenv("CONTROL_PLANE_URL", "http://localhost:7070")
API_KEY = os.getenv("CONTROL_PLANE_API_KEY", "change_me_long_random_change_me_long_random")

def mint(role="user", project_id=None, session_id=None):
    r = requests.post(f"{CONTROL_PLANE}/api/v1/auth/token", json={"apiKey": API_KEY, "scope": {"role": role, "projectId": project_id, "sessionId": session_id}, "ttlSeconds": 600})
    r.raise_for_status()
    return r.json()["token"]

def test_smoke_create_project_session_and_gates():
    tok = mint("user")
    h = {"Authorization": f"Bearer {tok}"}

    pr = requests.post(f"{CONTROL_PLANE}/api/v1/projects", json={"name": "smoke"}, headers=h)
    pr.raise_for_status()
    project_id = pr.json()["project"]["id"]

    tok2 = mint("user", project_id=project_id)
    h2 = {"Authorization": f"Bearer {tok2}"}
    se = requests.post(f"{CONTROL_PLANE}/api/v1/projects/{project_id}/sessions", json={"name": "s1"}, headers=h2)
    se.raise_for_status()
    session_id = se.json()["session"]["id"]

    tok3 = mint("user", project_id=project_id, session_id=session_id)
    h3 = {"Authorization": f"Bearer {tok3}"}
    ge = requests.get(f"{CONTROL_PLANE}/api/v1/sessions/{session_id}/gates/evaluate", headers=h3)
    ge.raise_for_status()
    assert "evaluation" in ge.json()
