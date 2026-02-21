"""Internal OneDrive sync API router.

Exposes endpoints for the Node.js backend to trigger sync operations:
  POST /api/internal/onedrive/start-sync        -- enqueue initial sync
  POST /api/internal/onedrive/process-changes   -- enqueue change processing
  POST /api/internal/onedrive/estimate-cost     -- count matching files
  POST /api/internal/onedrive/disconnect        -- enqueue disconnect cleanup
  GET  /api/internal/onedrive/list-folders       -- list OneDrive folders for picker
  GET  /api/internal/onedrive/list-items         -- list OneDrive folders/files for browser
  POST /api/internal/onedrive/import-file        -- download OneDrive file for library import
"""

import base64
import logging
import mimetypes
import os
import secrets
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user_optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/onedrive", tags=["Internal OneDrive"])

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
FOLDER_MIME = "application/vnd.ms-folder"
MAX_IMPORT_BYTES = 30 * 1024 * 1024


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
    """Get user from Bearer token if present, otherwise return None."""
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


class ImportFileRequest(BaseModel):
    item_id: str
    user_id: int
    purpose: str = "import"  # "import" | "preview"
    max_bytes: Optional[int] = None


# ── Sync Endpoints ─────────────────────────────────────────────────────────


@router.post("/start-sync")
async def start_sync(
    request: StartSyncRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Enqueue initial OneDrive sync Celery task."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.onedrive_tasks import initial_onedrive_sync

    result = initial_onedrive_sync.delay(request.user_id, request.tenant_id)
    logger.info(
        "initial_onedrive_sync enqueued user_id=%d tenant_id=%s task_id=%s",
        request.user_id, request.tenant_id, result.id,
    )
    return {"started": True, "task_id": result.id}


@router.post("/process-changes")
async def trigger_process_changes(
    request: ProcessChangesRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Enqueue process OneDrive changes Celery task."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.onedrive_tasks import process_onedrive_changes

    result = process_onedrive_changes.delay(request.user_id, request.tenant_id)
    logger.info(
        "process_onedrive_changes enqueued user_id=%d tenant_id=%s task_id=%s",
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

    from app.tasks.onedrive_tasks import _estimate_sync_cost_impl

    try:
        result = await _estimate_sync_cost_impl(request.user_id, request.tenant_id)
        return result
    except Exception as e:
        logger.error("estimate_cost_failed user_id=%d error=%s", request.user_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to estimate sync cost")


@router.post("/disconnect")
async def disconnect_onedrive(
    request: DisconnectRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Enqueue disconnect OneDrive cleanup Celery task."""
    await _verify_proxy_token(x_proxy_token)

    from app.tasks.onedrive_tasks import disconnect_onedrive_cleanup

    result = disconnect_onedrive_cleanup.delay(request.user_id, request.tenant_id)
    logger.info(
        "disconnect_onedrive_cleanup enqueued user_id=%d tenant_id=%s task_id=%s",
        request.user_id, request.tenant_id, result.id,
    )
    return {"status": "cleanup_started", "task_id": result.id}


# ── Folder Listing ──────────────────────────────────────────────────────────


@router.get("/list-folders")
async def list_onedrive_folders(
    parent_id: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    x_proxy_token: Optional[str] = Header(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """List folders in the user's OneDrive for the folder picker UI."""
    resolved_user_id = current_user.id if current_user else user_id
    if not current_user:
        await _verify_proxy_token(x_proxy_token)
    if not resolved_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    from app.services.microsoft_token_service import MicrosoftTokenService

    svc = MicrosoftTokenService(db)
    try:
        access_token = await svc.get_valid_access_token(resolved_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Build Graph API URL
    if parent_id:
        url = f"{GRAPH_BASE}/me/drive/items/{parent_id}/children"
    else:
        url = f"{GRAPH_BASE}/me/drive/root/children"

    params = {
        "$filter": "folder ne null",
        "$select": "id,name,folder",
        "$orderby": "name",
        "$top": "200",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )

    if resp.status_code != 200:
        logger.warning(
            "Graph API list-folders failed status=%d body=%s",
            resp.status_code, resp.text[:200],
        )
        raise HTTPException(status_code=502, detail="Failed to list OneDrive folders")

    data = resp.json()
    items = data.get("value", [])

    return [
        {
            "id": item["id"],
            "name": item["name"],
            "hasChildren": (item.get("folder", {}).get("childCount", 0) > 0),
        }
        for item in items
        if "folder" in item
    ]


# ── Item Listing ────────────────────────────────────────────────────────────


@router.get("/list-items")
async def list_onedrive_items(
    parent_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page_token: Optional[str] = Query(None),
    page_size: int = Query(100, ge=1, le=200),
    user_id: Optional[int] = Query(None),
    x_proxy_token: Optional[str] = Header(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """List folders/files in OneDrive (browse or search)."""
    resolved_user_id = current_user.id if current_user else user_id
    if not current_user:
        await _verify_proxy_token(x_proxy_token)
    if not resolved_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    from app.services.microsoft_token_service import MicrosoftTokenService

    svc = MicrosoftTokenService(db)
    try:
        access_token = await svc.get_valid_access_token(resolved_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    select_fields = "id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference"

    if q:
        # Search mode
        safe_query = q.replace("'", "")
        url = f"{GRAPH_BASE}/me/drive/root/search(q='{safe_query}')"
        params = {
            "$select": select_fields,
            "$top": str(page_size),
        }
    elif page_token:
        # Use the @odata.nextLink directly
        url = page_token
        params = {}
    else:
        # Browse mode
        if parent_id:
            url = f"{GRAPH_BASE}/me/drive/items/{parent_id}/children"
        else:
            url = f"{GRAPH_BASE}/me/drive/root/children"
        params = {
            "$select": select_fields,
            "$orderby": "name",
            "$top": str(page_size),
        }

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url,
            params=params if params else None,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )

    if resp.status_code != 200:
        logger.warning(
            "Graph API list-items failed status=%d body=%s",
            resp.status_code, resp.text[:300],
        )
        raise HTTPException(status_code=502, detail="Failed to list OneDrive items")

    data = resp.json()
    raw_items = data.get("value", [])
    next_link = data.get("@odata.nextLink")

    items = []
    for item in raw_items:
        is_folder = "folder" in item
        file_info = item.get("file", {})
        mime_type = file_info.get("mimeType", "application/octet-stream") if not is_folder else FOLDER_MIME

        items.append({
            "id": item.get("id"),
            "name": item.get("name", "Untitled"),
            "mimeType": mime_type,
            "kind": "folder" if is_folder else "file",
            "size": item.get("size", 0),
            "modifiedTime": item.get("lastModifiedDateTime"),
            "webUrl": item.get("webUrl"),
            "parentId": (item.get("parentReference") or {}).get("id"),
        })

    return {
        "items": items,
        "nextPageToken": next_link,
    }


# ── File Import ─────────────────────────────────────────────────────────────


def _normalize_name(raw_name: Optional[str]) -> str:
    name = (raw_name or "onedrive-file").strip()
    if not name:
        name = "onedrive-file"
    return name.replace("/", " ").replace("\\", " ")


def _ensure_extension(file_name: str, extension: Optional[str]) -> str:
    ext = (extension or "").strip().lower().lstrip(".")
    if not ext:
        return file_name
    if file_name.lower().endswith(f".{ext}"):
        return file_name
    return f"{file_name}.{ext}"


@router.post("/import-file")
async def import_onedrive_file(
    request: ImportFileRequest,
    x_proxy_token: Optional[str] = Header(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """Download a OneDrive file and return base64 payload for Document Management import."""
    purpose = (request.purpose or "import").strip().lower()
    if purpose not in {"import", "preview"}:
        raise HTTPException(status_code=400, detail="Invalid import purpose")

    requested_max = request.max_bytes or MAX_IMPORT_BYTES
    if requested_max <= 0:
        requested_max = MAX_IMPORT_BYTES
    effective_max_bytes = min(MAX_IMPORT_BYTES, requested_max)

    resolved_user_id = current_user.id if current_user else request.user_id
    if not current_user:
        await _verify_proxy_token(x_proxy_token)
    if not resolved_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    if resolved_user_id != request.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot import another user's OneDrive file",
        )

    from app.services.microsoft_token_service import MicrosoftTokenService

    svc = MicrosoftTokenService(db)
    try:
        access_token = await svc.get_valid_access_token(resolved_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get metadata first
    meta_url = f"{GRAPH_BASE}/me/drive/items/{request.item_id}"
    meta_params = {"$select": "id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference"}

    async with httpx.AsyncClient() as client:
        meta_resp = await client.get(
            meta_url,
            params=meta_params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )

    if meta_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="OneDrive file not found")
    if meta_resp.status_code != 200:
        logger.warning(
            "Graph API metadata fetch failed status=%d body=%s",
            meta_resp.status_code, meta_resp.text[:300],
        )
        raise HTTPException(status_code=502, detail="Failed to fetch OneDrive file metadata")

    metadata = meta_resp.json()

    if "folder" in metadata:
        raise HTTPException(status_code=400, detail="Folders cannot be imported as files")

    file_info = metadata.get("file", {})
    mime_type = file_info.get("mimeType", "application/octet-stream")
    original_name = _normalize_name(metadata.get("name"))

    # Download the file content
    download_url = f"{GRAPH_BASE}/me/drive/items/{request.item_id}/content"

    async with httpx.AsyncClient(follow_redirects=True) as client:
        file_resp = await client.get(
            download_url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30.0,
        )

    if file_resp.status_code != 200:
        logger.warning(
            "Graph API file download failed status=%d",
            file_resp.status_code,
        )
        raise HTTPException(status_code=502, detail="Failed to download OneDrive file")

    file_bytes = file_resp.content
    if not file_bytes:
        raise HTTPException(status_code=400, detail="OneDrive file is empty")
    if len(file_bytes) > effective_max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"OneDrive file too large for {purpose} (max {effective_max_bytes // (1024 * 1024)}MB)",
        )

    # Determine file extension
    guessed_ext = os.path.splitext(original_name)[1].lstrip(".")
    if not guessed_ext:
        guessed_ext = (mimetypes.guess_extension(mime_type) or "").lstrip(".")
    file_name = _ensure_extension(original_name, guessed_ext)

    response_mime = (
        file_resp.headers.get("content-type", mime_type).split(";")[0].strip()
        or mime_type
    )

    return {
        "fileName": file_name,
        "fileType": response_mime,
        "fileBase64": base64.b64encode(file_bytes).decode("ascii"),
        "driveFile": {
            "id": metadata.get("id"),
            "name": metadata.get("name", "Untitled"),
            "mimeType": mime_type,
            "size": metadata.get("size", 0),
            "modifiedTime": metadata.get("lastModifiedDateTime"),
            "webUrl": metadata.get("webUrl"),
        },
    }
