"""Runtime-neutral Python port for Celery/Worker executors.

The client only sends canonical job identity plus fenced lease context. It does
not expose broker retry or result-backend state as business state.
"""

from dataclasses import dataclass
import os
from typing import Any

import httpx


@dataclass(frozen=True)
class LeaseContext:
    job_id: str
    attempt_id: str
    lease_token: str
    fencing_version: int
    expires_at: str


class JobControlPlaneClient:
    def __init__(self, base_url: str | None = None, client: httpx.Client | None = None):
        self.base_url = (base_url or os.getenv("JOB_CONTROL_PLANE_URL", "http://localhost:3000/api/internal/job-control-plane")).rstrip("/")
        self.client = client or httpx.Client(timeout=15.0)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {}
        internal_token = os.getenv("SMARTSPEC_INTERNAL_TOKEN") or os.getenv("INTERNAL_TOKEN")
        if internal_token:
            headers["x-internal-token"] = internal_token
        response = self.client.post(f"{self.base_url}/{path.lstrip('/')}", json=payload, headers=headers)
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise RuntimeError("JOB_CONTROL_PLANE_INVALID_RESPONSE")
        return body

    def claim(self, job_id: str, runner_id: str, adapter: str) -> LeaseContext | None:
        body = self._post("claim", {"jobId": job_id, "runnerId": runner_id, "adapter": adapter})
        if not body.get("lease"):
            return None
        raw = body["lease"]
        return LeaseContext(
            job_id=raw["jobId"],
            attempt_id=raw["attemptId"],
            lease_token=raw["leaseToken"],
            fencing_version=raw["fencingVersion"],
            expires_at=raw["expiresAt"],
        )

    def context(self, job_id: str) -> dict[str, Any]:
        body = self._post("context", {"jobId": job_id})
        context = body.get("context")
        if not isinstance(context, dict) or not isinstance(context.get("jobType"), str):
            raise RuntimeError("JOB_CONTROL_PLANE_INVALID_CONTEXT")
        return context

    def start(self, lease: LeaseContext) -> None:
        self._post("start", {"jobId": lease.job_id, "attemptId": lease.attempt_id, "leaseToken": lease.lease_token, "fencingVersion": lease.fencing_version})

    def heartbeat(self, lease: LeaseContext) -> None:
        self._post("heartbeat", self._lease_payload(lease))

    def progress(self, lease: LeaseContext, progress: dict[str, Any]) -> None:
        self._post("progress", {**self._lease_payload(lease), "progress": progress})

    def complete(self, lease: LeaseContext, result: dict[str, Any]) -> None:
        self._post("complete", {**self._lease_payload(lease), "result": result})

    def fail(self, lease: LeaseContext, error: dict[str, Any]) -> None:
        self._post("fail", {**self._lease_payload(lease), "error": error})

    @staticmethod
    def _lease_payload(lease: LeaseContext) -> dict[str, Any]:
        return {"jobId": lease.job_id, "attemptId": lease.attempt_id, "leaseToken": lease.lease_token, "fencingVersion": lease.fencing_version}
