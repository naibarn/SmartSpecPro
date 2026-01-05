import os
import time
import hashlib
import json
from typing import Any, Dict, Optional
import requests

class ControlPlaneClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._token: Optional[str] = None
        self._token_exp: float = 0.0

    def _mint(self, role: str = "runner", project_id: Optional[str] = None, session_id: Optional[str] = None, ttl: int = 900) -> str:
        resp = requests.post(
            f"{self.base_url}/api/v1/auth/token",
            json={"apiKey": self.api_key, "scope": {"role": role, "projectId": project_id, "sessionId": session_id}, "ttlSeconds": ttl},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["token"]
        self._token_exp = time.time() + (data.get("expiresInSeconds", ttl) - 30)
        return self._token

    def token(self, project_id: Optional[str] = None, session_id: Optional[str] = None) -> str:
        if not self._token or time.time() >= self._token_exp:
            return self._mint(project_id=project_id, session_id=session_id)
        return self._token

    def _h(self, project_id=None, session_id=None) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.token(project_id, session_id)}"}

    def create_project(self, name: str) -> Dict[str, Any]:
        r = requests.post(f"{self.base_url}/api/v1/projects", json={"name": name}, headers=self._h(), timeout=30)
        r.raise_for_status()
        return r.json()["project"]

    def create_session(self, project_id: str, name: str = "") -> Dict[str, Any]:
        r = requests.post(f"{self.base_url}/api/v1/projects/{project_id}/sessions", json={"name": name or None}, headers=self._h(project_id=project_id), timeout=30)
        r.raise_for_status()
        return r.json()["session"]

    def create_iteration(self, session_id: str, project_id: str) -> Dict[str, Any]:
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/iterations", headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["iteration"]

    def upsert_task(self, session_id: str, project_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        r = requests.put(f"{self.base_url}/api/v1/sessions/{session_id}/tasks", json=task, headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["task"]

    def record_test_run(self, session_id: str, project_id: str, passed: bool, artifact_key: Optional[str] = None, summary: Optional[Dict[str, Any]] = None):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/test-runs",
                          json={"passed": passed, "artifactKey": artifact_key, "summary": summary},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["testRun"]

    def record_coverage_run(self, session_id: str, project_id: str, percent: float, artifact_key: Optional[str] = None, summary: Optional[Dict[str, Any]] = None):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/coverage-runs",
                          json={"percent": percent, "artifactKey": artifact_key, "summary": summary},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["coverageRun"]

    def record_security_check(self, session_id: str, project_id: str, status: str = "pass", artifact_key: Optional[str] = None, summary: Optional[Dict[str, Any]] = None):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/security-checks",
                          json={"status": status, "artifactKey": artifact_key, "summary": summary},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["securityCheck"]

    def evaluate_gates(self, session_id: str, project_id: str):
        r = requests.get(f"{self.base_url}/api/v1/sessions/{session_id}/gates/evaluate", headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["evaluation"]

    def presign_put(self, session_id: str, project_id: str, name: str, content_type: str, size_bytes: int, iteration: int = 0):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/artifacts/presign-put",
                          json={"iteration": iteration, "name": name, "contentType": content_type, "sizeBytes": size_bytes},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()

    def artifacts_complete(self, session_id: str, project_id: str, key: str, sha256: str, size_bytes: int):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/artifacts/complete",
                          json={"key": key, "sha256": sha256, "sizeBytes": size_bytes},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["artifact"]

    def create_report(self, session_id: str, project_id: str, title: str, artifact_key: str, kind: str = "workflow_report", summary: Optional[Dict[str, Any]] = None):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/reports",
                          json={"title": title, "artifactKey": artifact_key, "kind": kind, "summary": summary},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()["report"]

    def consume_apply_approval(self, session_id: str, project_id: str, token: str):
        r = requests.post(f"{self.base_url}/api/v1/sessions/{session_id}/approvals/apply/consume",
                          json={"token": token},
                          headers=self._h(project_id=project_id, session_id=session_id), timeout=30)
        r.raise_for_status()
        return r.json()
