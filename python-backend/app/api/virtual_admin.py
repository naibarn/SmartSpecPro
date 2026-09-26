"""Virtual Admin (System Guardian) internal endpoints."""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from typing import Any

from fastapi import APIRouter, Request, HTTPException

from app.core.config import settings

router = APIRouter(prefix="/api/internal/virtual-admin")
logger = logging.getLogger(__name__)


def _require_internal_access(request: Request) -> None:
    """Defense-in-depth gate: localhost-only, plus a token check if configured.

    Nginx already blocks `/api/internal/` from the internet, but this
    app-layer check protects against nginx misconfiguration or the app
    being reached via another path (e.g. direct port access).
    """
    host = (request.client.host if request.client else "") or ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Forbidden (localhost only)")

    expected_key = settings.VIRTUAL_ADMIN_API_KEY
    if expected_key:
        provided_key = request.headers.get("x-virtual-admin-key", "")
        if not secrets.compare_digest(provided_key, expected_key):
            raise HTTPException(status_code=401, detail="Invalid virtual admin key")


@router.get("/worker-jobs-health")
async def worker_jobs_health(request: Request) -> dict[str, Any]:
    """Report canonical worker_jobs backlog; no broker inspection is used."""
    _require_internal_access(request)
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        result = await session.execute(text('SELECT status, count(*) FROM worker_jobs GROUP BY status'))
        heartbeat_result = await session.execute(text('''
            SELECT count(*) FROM (
              SELECT "workerId" FROM worker_heartbeats
              WHERE "runtimeType" IN ('node_job_worker', 'python_job_worker')
                AND "createdAt" > NOW() - INTERVAL '2 minutes'
              GROUP BY "workerId"
            ) live_workers
        '''))
        counts = {str(row[0]): int(row[1]) for row in result.fetchall()}
        live_workers = int(heartbeat_result.scalar() or 0)
    queued = counts.get("queued", 0) + counts.get("retry_scheduled", 0)
    active = counts.get("leased", 0) + counts.get("running", 0) + counts.get("waiting_external", 0)
    return {
        "runtime": "worker_jobs",
        "workers": live_workers,
        "activeTasks": active,
        "queueLengths": {"queued": queued},
        "healthy": live_workers > 0,
    }


@router.post("/restart-worker")
async def restart_worker(request: Request) -> dict[str, Any]:
    """Legacy process restart command is retired; workers are externally supervised."""
    _require_internal_access(request)
    raise HTTPException(status_code=410, detail="LEGACY_WORKER_CONTROL_RETIRED")


@router.post("/revoke-task")
async def revoke_task(request: Request) -> dict[str, Any]:
    """Cancel a canonical worker_jobs record by its job ID."""
    _require_internal_access(request)
    body = await request.json()
    job_id = str(body.get("task_id") or "").strip()
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id required")
    from app.services.job_control_plane import JobControlPlaneClient
    await asyncio.to_thread(
        JobControlPlaneClient().cancel,
        job_id,
        action_id=f"worker-jobs-cancel:{job_id}",
        reason="cancelled_by_virtual_admin",
    )
    return {"success": True, "job_id": job_id, "message": "Canonical cancellation requested"}
