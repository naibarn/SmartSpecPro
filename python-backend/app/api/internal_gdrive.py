"""Internal Google Drive sync API router.

Exposes endpoints for the Node.js backend to trigger sync operations:
  POST /api/internal/gdrive/start-sync        -- enqueue initial sync
  POST /api/internal/gdrive/process-changes   -- enqueue change processing
  POST /api/internal/gdrive/estimate-cost     -- count matching files
  POST /api/internal/gdrive/disconnect        -- enqueue disconnect cleanup
  GET  /api/internal/gdrive/list-folders       -- list Drive folders for picker
"""

import logging
import secrets
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user_optional

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


async def _get_current_user_flexible(
    user=Depends(get_current_user_optional),
):
    """Get user from Bearer token if present, otherwise return None.

    Endpoints using this can fall back to proxy token + user_id param.
    """
    return user


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


# ── Folder listing (synchronous, no Celery) ────────────────────────────────


DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
FOLDER_MIME = "application/vnd.google-apps.folder"


@router.get("/list-folders")
async def list_drive_folders(
    parent_id: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """List folders in the user's Google Drive for the folder picker UI.

    Accepts Bearer token auth (preferred) or proxy token + user_id query param.
    """
    resolved_user_id = current_user.id if current_user else user_id
    if not resolved_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    from app.services.google_token_service import GoogleTokenService

    svc = GoogleTokenService(db)
    try:
        access_token = await svc.get_valid_access_token(resolved_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build Drive API query
    parent_clause = f"'{parent_id}' in parents" if parent_id else "'root' in parents"
    q = f"mimeType = '{FOLDER_MIME}' AND {parent_clause} AND trashed = false"

    params = {
        "q": q,
        "fields": "files(id,name)",
        "orderBy": "name",
        "pageSize": "200",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            DRIVE_FILES_URL,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )

    if resp.status_code != 200:
        logger.warning(
            "Drive API list-folders failed status=%d body=%s",
            resp.status_code, resp.text[:200],
        )
        raise HTTPException(status_code=502, detail="Failed to list Drive folders")

    data = resp.json()
    folders = data.get("files", [])

    # Return with hasChildren=True so the UI can lazy-expand any folder
    return [
        {"id": f["id"], "name": f["name"], "hasChildren": True}
        for f in folders
    ]
