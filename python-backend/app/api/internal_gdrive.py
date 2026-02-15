"""Internal Google Drive sync API router.

Exposes endpoints for the Node.js backend to trigger sync operations:
  POST /api/internal/gdrive/start-sync        -- enqueue initial sync
  POST /api/internal/gdrive/process-changes   -- enqueue change processing
  POST /api/internal/gdrive/estimate-cost     -- count matching files
  POST /api/internal/gdrive/disconnect        -- enqueue disconnect cleanup
  GET  /api/internal/gdrive/list-folders       -- list Drive folders for picker
  GET  /api/internal/gdrive/list-items         -- list Drive folders/files for browser
  POST /api/internal/gdrive/import-file        -- download Drive file for library import
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
MAX_IMPORT_BYTES = 30 * 1024 * 1024
GOOGLE_EXPORT_MIME_MAP: dict[str, tuple[str, str]] = {
    "application/vnd.google-apps.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
    ),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx",
    ),
    "application/vnd.google-apps.presentation": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pptx",
    ),
    "application/vnd.google-apps.drawing": ("image/png", "png"),
}
GOOGLE_PREVIEW_EXPORT_MIME_MAP: dict[str, tuple[str, str]] = {
    "application/vnd.google-apps.document": ("text/plain", "txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", "csv"),
    "application/vnd.google-apps.presentation": ("application/pdf", "pdf"),
    "application/vnd.google-apps.drawing": ("image/png", "png"),
}


def _normalize_drive_name(raw_name: Optional[str]) -> str:
    name = (raw_name or "drive-file").strip()
    if not name:
        name = "drive-file"
    return name.replace("/", " ").replace("\\", " ")


def _ensure_extension(file_name: str, extension: Optional[str]) -> str:
    ext = (extension or "").strip().lower().lstrip(".")
    if not ext:
        return file_name
    if file_name.lower().endswith(f".{ext}"):
        return file_name
    return f"{file_name}.{ext}"


@router.get("/list-folders")
async def list_drive_folders(
    parent_id: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    x_proxy_token: Optional[str] = Header(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """List folders in the user's Google Drive for the folder picker UI.

    Accepts Bearer token auth (preferred) or proxy token + user_id query param.
    """
    resolved_user_id = current_user.id if current_user else user_id
    if not current_user:
        await _verify_proxy_token(x_proxy_token)
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


@router.get("/list-items")
async def list_drive_items(
    parent_id: Optional[str] = Query("root"),
    all_files: bool = Query(False),
    q: Optional[str] = Query(None),
    page_token: Optional[str] = Query(None),
    page_size: int = Query(100, ge=1, le=200),
    user_id: Optional[int] = Query(None),
    x_proxy_token: Optional[str] = Header(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """List folders/files in Drive (current folder or all files mode)."""
    resolved_user_id = current_user.id if current_user else user_id
    if not current_user:
        await _verify_proxy_token(x_proxy_token)
    if not resolved_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    from app.services.google_token_service import GoogleTokenService

    svc = GoogleTokenService(db)
    try:
        access_token = await svc.get_valid_access_token(resolved_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    query_parts = ["trashed = false"]
    if not all_files:
        normalized_parent = (parent_id or "root").replace("'", "\\'")
        query_parts.append(f"'{normalized_parent}' in parents")
    else:
        query_parts.append(f"mimeType != '{FOLDER_MIME}'")
    if q:
        safe_query = q.replace("'", "\\'")
        query_parts.append(f"name contains '{safe_query}'")

    params = {
        "q": " AND ".join(query_parts),
        "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,iconLink,thumbnailLink,webViewLink)",
        "orderBy": "folder,name_natural",
        "pageSize": str(page_size),
    }
    if page_token:
        params["pageToken"] = page_token

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            DRIVE_FILES_URL,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )

    if resp.status_code != 200:
        logger.warning(
            "Drive API list-items failed status=%d body=%s",
            resp.status_code, resp.text[:300],
        )
        raise HTTPException(status_code=502, detail="Failed to list Drive items")

    data = resp.json()
    files = data.get("files", [])
    items = []
    for f in files:
        mime_type = f.get("mimeType", "application/octet-stream")
        is_folder = mime_type == FOLDER_MIME
        items.append({
            "id": f.get("id"),
            "name": f.get("name", "Untitled"),
            "mimeType": mime_type,
            "kind": "folder" if is_folder else "file",
            "size": int(f.get("size", 0) or 0),
            "modifiedTime": f.get("modifiedTime"),
            "parents": f.get("parents", []),
            "iconLink": f.get("iconLink"),
            "thumbnailLink": f.get("thumbnailLink"),
            "webViewLink": f.get("webViewLink"),
        })

    return {
        "items": items,
        "nextPageToken": data.get("nextPageToken"),
    }


class ImportDriveFileRequest(BaseModel):
    file_id: str
    user_id: int
    purpose: str = "import"  # "import" | "preview"
    max_bytes: Optional[int] = None


@router.post("/import-file")
async def import_drive_file(
    request: ImportDriveFileRequest,
    x_proxy_token: Optional[str] = Header(None),
    current_user=Depends(_get_current_user_flexible),
    db: AsyncSession = Depends(get_db),
):
    """Download a Drive file and return base64 payload for Document Management import."""
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if resolved_user_id != request.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot import another user's Drive file",
        )

    from app.services.google_token_service import GoogleTokenService

    svc = GoogleTokenService(db)
    try:
        access_token = await svc.get_valid_access_token(resolved_user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    metadata_fields = "id,name,mimeType,size,modifiedTime,parents,iconLink,thumbnailLink,webViewLink"
    async with httpx.AsyncClient() as client:
        meta_resp = await client.get(
            f"{DRIVE_FILES_URL}/{request.file_id}",
            params={"fields": metadata_fields},
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15.0,
        )
    if meta_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Drive file not found")
    if meta_resp.status_code != 200:
        logger.warning(
            "Drive API metadata fetch failed status=%d body=%s",
            meta_resp.status_code, meta_resp.text[:300],
        )
        raise HTTPException(status_code=502, detail="Failed to fetch Drive file metadata")

    metadata = meta_resp.json()
    mime_type = (metadata.get("mimeType") or "application/octet-stream").strip()
    if mime_type == FOLDER_MIME:
        raise HTTPException(status_code=400, detail="Folders cannot be imported as files")

    original_name = _normalize_drive_name(metadata.get("name"))
    export_map = GOOGLE_PREVIEW_EXPORT_MIME_MAP if purpose == "preview" else GOOGLE_EXPORT_MIME_MAP
    export_config = export_map.get(mime_type)

    if export_config:
        target_mime, target_ext = export_config
        download_url = f"{DRIVE_FILES_URL}/{request.file_id}/export"
        download_params = {"mimeType": target_mime}
        file_name = _ensure_extension(original_name, target_ext)
        expected_mime = target_mime
    elif mime_type.startswith("application/vnd.google-apps"):
        raise HTTPException(
            status_code=400,
            detail=f"Google Workspace file type '{mime_type}' is not supported for {purpose}",
        )
    else:
        download_url = f"{DRIVE_FILES_URL}/{request.file_id}"
        download_params = {"alt": "media"}
        guessed_ext = os.path.splitext(original_name)[1].lstrip(".")
        if not guessed_ext:
            guessed_ext = (mimetypes.guess_extension(mime_type) or "").lstrip(".")
        file_name = _ensure_extension(original_name, guessed_ext)
        expected_mime = mime_type

    async with httpx.AsyncClient() as client:
        file_resp = await client.get(
            download_url,
            params=download_params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30.0,
        )
    if file_resp.status_code != 200:
        logger.warning(
            "Drive API file download failed status=%d body=%s",
            file_resp.status_code, file_resp.text[:300],
        )
        raise HTTPException(status_code=502, detail="Failed to download Drive file")

    file_bytes = file_resp.content
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Drive file is empty")
    if len(file_bytes) > effective_max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Drive file too large for {purpose} (max {effective_max_bytes // (1024 * 1024)}MB)",
        )

    response_mime = (file_resp.headers.get("content-type") or expected_mime).split(";")[0].strip() or expected_mime

    return {
        "fileName": file_name,
        "fileType": response_mime,
        "fileBase64": base64.b64encode(file_bytes).decode("ascii"),
        "driveFile": {
            "id": metadata.get("id"),
            "name": metadata.get("name", "Untitled"),
            "mimeType": mime_type,
            "size": int(metadata.get("size", 0) or 0),
            "modifiedTime": metadata.get("modifiedTime"),
            "parents": metadata.get("parents", []),
            "iconLink": metadata.get("iconLink"),
            "thumbnailLink": metadata.get("thumbnailLink"),
            "webViewLink": metadata.get("webViewLink"),
        },
    }
