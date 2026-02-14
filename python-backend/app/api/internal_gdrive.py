"""Internal Google Drive sync API router.

Exposes endpoints for the Node.js backend to trigger sync operations:
  POST /api/internal/gdrive/start-sync        -- enqueue initial sync
  POST /api/internal/gdrive/process-changes   -- enqueue change processing
  POST /api/internal/gdrive/estimate-cost     -- count matching files
  POST /api/internal/gdrive/disconnect        -- enqueue disconnect cleanup
"""

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/gdrive", tags=["Internal GDrive"])


# ── Auth ────────────────────────────────────────────────────────────────────


async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)):
    """Verify the internal proxy token for Node.js -> Python calls."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


# ── Request Models ──────────────────────────────────────────────────────────


class StartSyncRequest(BaseModel):
    user_id: int
    tenant_id: str


class ProcessChangesRequest(BaseModel):
    user_id: int
    tenant_id: str


class EstimateCostRequest(BaseModel):
    user_id: int
    tenant_id: str


class DisconnectRequest(BaseModel):
    user_id: int
    tenant_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post("/start-sync")
async def start_sync(
    request: StartSyncRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Enqueue initial_drive_sync Celery task."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.google_drive_tasks import initial_drive_sync

    result = initial_drive_sync.delay(request.user_id, request.tenant_id)
    logger.info(
        "initial_drive_sync enqueued user_id=%d tenant_id=%s task_id=%s",
        request.user_id, request.tenant_id, result.id,
    )
    return {"started": True, "task_id": result.id}


@router.post("/process-changes")
async def trigger_process_changes(
    request: ProcessChangesRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Enqueue process_drive_changes Celery task."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.google_drive_tasks import process_drive_changes

    result = process_drive_changes.delay(request.user_id, request.tenant_id)
    logger.info(
        "process_drive_changes enqueued user_id=%d tenant_id=%s task_id=%s",
        request.user_id, request.tenant_id, result.id,
    )
    return {"started": True, "task_id": result.id}


@router.post("/estimate-cost")
async def estimate_sync_cost(
    request: EstimateCostRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Count matching files and return estimated credit cost without indexing."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.google_drive_tasks import _estimate_sync_cost_impl

    try:
        result = await _estimate_sync_cost_impl(request.user_id, request.tenant_id)
        return result
    except Exception as e:
        logger.error("estimate_cost_failed user_id=%d error=%s", request.user_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to estimate sync cost")


@router.post("/disconnect")
async def disconnect_drive(
    request: DisconnectRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Enqueue disconnect_google_drive_cleanup Celery task."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.google_drive_tasks import disconnect_google_drive_cleanup

    result = disconnect_google_drive_cleanup.delay(request.user_id, request.tenant_id)
    logger.info(
        "disconnect_google_drive_cleanup enqueued user_id=%d tenant_id=%s task_id=%s",
        request.user_id, request.tenant_id, result.id,
    )
    return {"status": "cleanup_started", "task_id": result.id}
