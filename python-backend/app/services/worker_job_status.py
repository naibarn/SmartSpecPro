"""Compatibility-shaped status projection backed only by canonical worker_jobs."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WorkerJobStatus:
    state: str
    result: Any = None
    info: Any = None


def read_worker_job_status(job_id: str) -> WorkerJobStatus:
    """Read current execution state from the canonical control plane."""
    from app.services.job_control_plane import JobControlPlaneClient

    snapshot = JobControlPlaneClient().status(job_id)
    canonical = str(snapshot.get("status") or "unknown")
    state = {
        "pending": "PENDING",
        "queued": "PENDING",
        "leased": "STARTED",
        "running": "STARTED",
        "waiting_external": "STARTED",
        "retry_scheduled": "RETRY",
        "succeeded": "SUCCESS",
        "failed": "FAILURE",
        "cancelled": "REVOKED",
        "expired": "FAILURE",
    }.get(canonical, "UNKNOWN")
    if state == "SUCCESS":
        result = snapshot.get("output")
    elif state == "FAILURE":
        result = snapshot.get("errorMessage") or snapshot.get("failureReason") or canonical
    else:
        result = None
    return WorkerJobStatus(state=state, result=result, info=result)
