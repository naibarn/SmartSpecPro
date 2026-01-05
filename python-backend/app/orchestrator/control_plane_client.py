"""Control Plane client (Phase 4)

This module provides a small async client used by the LangGraph orchestrator
to read/write authoritative state (projects/sessions/tasks/reports/gates).

Design goals:
- Keep Control Plane as the source of truth
- Use short-lived JWT minted from a static API key
- Be resilient to partial rollouts: network failures should be surfaced
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
import structlog

logger = structlog.get_logger()


@dataclass
class ControlPlaneAuth:
    """Holds token state."""

    token: str


class ControlPlaneClient:
    """Async HTTP client for Control Plane."""

    def __init__(self, base_url: str, api_key: str, timeout_seconds: int = 20):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self._auth: Optional[ControlPlaneAuth] = None

    async def _get_jwt(self) -> str:
        if self._auth is not None:
            return self._auth.token
        if not self.api_key:
            raise ValueError("CONTROL_PLANE_API_KEY is required to mint JWT")

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            r = await client.post(
                f"{self.base_url}/api/v1/auth/token",
                json={"apiKey": self.api_key},
            )
            r.raise_for_status()
            data = r.json()
            token = data.get("token")
            if not token:
                raise ValueError("Control Plane did not return token")
            self._auth = ControlPlaneAuth(token=token)
            return token

    async def _request(self, method: str, path: str, *, json: Any | None = None, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
        token = await self._get_jwt()
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            r = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                json=json,
                params=params,
            )
            # If token expired, clear and retry once
            if r.status_code == 401:
                self._auth = None
                token = await self._get_jwt()
                headers = {"Authorization": f"Bearer {token}"}
                r = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    headers=headers,
                    json=json,
                    params=params,
                )
            r.raise_for_status()
            return r.json()

    # ---------- Phase 3/4 primitives ----------

    async def upsert_task(self, session_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("PUT", f"/api/v1/sessions/{session_id}/tasks", json=task)

    async def record_test_run(self, session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", f"/api/v1/sessions/{session_id}/test-runs", json=payload)

    async def record_coverage_run(self, session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", f"/api/v1/sessions/{session_id}/coverage-runs", json=payload)

    async def record_security_check(self, session_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", f"/api/v1/sessions/{session_id}/security-checks", json=payload)

    async def evaluate_gates(self, session_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/api/v1/sessions/{session_id}/gates/evaluate")
