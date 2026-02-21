"""
OneDrive File Operations API -- internal endpoints for upload, export, and delete.

Used by the Node.js tRPC router for edit-in-OneDrive workflows.
Uses Microsoft Graph API v1.0 via httpx (no SDK dependency).
"""

import base64
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/onedrive", tags=["onedrive"])

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Office Online editor URL templates
OFFICE_EDITOR_URLS = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
    "application/msword": "word",
    "application/vnd.ms-excel": "excel",
    "application/vnd.ms-powerpoint": "powerpoint",
}


# ── Request/Response Models ──────────────────────────────────────────────


class UploadRequest(BaseModel):
    file_content: str  # base64-encoded
    file_name: str
    mime_type: str
    user_id: int


class UploadResponse(BaseModel):
    driveItemId: str
    editUrl: str


class ExportRequest(BaseModel):
    drive_item_id: str
    user_id: int


class ExportResponse(BaseModel):
    content: str  # base64-encoded
    size: int


class DeleteResponse(BaseModel):
    success: bool


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post("/upload", response_model=UploadResponse)
async def upload_to_onedrive(
    req: UploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to OneDrive using simple upload (< 4MB) or create upload session."""
    if req.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot operate on another user's OneDrive",
        )
    try:
        token_svc = MicrosoftTokenService(db)
        access_token = await token_svc.get_valid_access_token(current_user.id)
    except (ValueError, InvalidGrantError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Microsoft auth error: {e}",
        )

    try:
        file_bytes = base64.b64decode(req.file_content)
        safe_name = req.file_name.replace("/", "_").replace("\\", "_")

        # Simple upload for files < 4MB
        upload_url = f"{GRAPH_BASE}/me/drive/root:/{safe_name}:/content"

        async with httpx.AsyncClient() as client:
            resp = await client.put(
                upload_url,
                content=file_bytes,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": req.mime_type or "application/octet-stream",
                },
                timeout=60.0,
            )

        if resp.status_code not in (200, 201):
            logger.error(
                "OneDrive upload failed status=%d body=%s",
                resp.status_code, resp.text[:300],
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OneDrive upload failed",
            )

        data = resp.json()
        drive_item_id = data["id"]
        web_url = data.get("webUrl", "")

        # Try to get Office Online edit URL via createLink or webUrl
        edit_url = web_url
        if web_url:
            # Append ?web=1 to open in Office Online
            edit_url = f"{web_url}?web=1"

        logger.info("Uploaded file to OneDrive: %s", drive_item_id)
        return UploadResponse(driveItemId=drive_item_id, editUrl=edit_url)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OneDrive upload failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OneDrive upload failed: {e}",
        )


@router.post("/export", response_model=ExportResponse)
async def export_from_onedrive(
    req: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a file from OneDrive and return base64 content."""
    if req.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot operate on another user's OneDrive",
        )
    try:
        token_svc = MicrosoftTokenService(db)
        access_token = await token_svc.get_valid_access_token(current_user.id)
    except (ValueError, InvalidGrantError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Microsoft auth error: {e}",
        )

    try:
        download_url = f"{GRAPH_BASE}/me/drive/items/{req.drive_item_id}/content"

        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(
                download_url,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30.0,
            )

        if resp.status_code != 200:
            logger.warning(
                "OneDrive export failed status=%d body=%s",
                resp.status_code, resp.text[:300],
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="OneDrive export failed",
            )

        content = resp.content
        encoded = base64.b64encode(content).decode("ascii")
        size = len(content)

        logger.info("Exported OneDrive file %s (%d bytes)", req.drive_item_id, size)
        return ExportResponse(content=encoded, size=size)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OneDrive export failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OneDrive export failed: {e}",
        )


@router.delete("/files/{item_id}", response_model=DeleteResponse)
async def delete_onedrive_file(
    item_id: str,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a temporary file from OneDrive."""
    if user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot operate on another user's OneDrive",
        )
    try:
        token_svc = MicrosoftTokenService(db)
        access_token = await token_svc.get_valid_access_token(current_user.id)
    except (ValueError, InvalidGrantError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Microsoft auth error: {e}",
        )

    try:
        delete_url = f"{GRAPH_BASE}/me/drive/items/{item_id}"

        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                delete_url,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15.0,
            )

        # 204 No Content = success, 404 = already deleted
        if resp.status_code in (204, 404):
            logger.info("Deleted OneDrive file: %s", item_id)
            return DeleteResponse(success=True)

        logger.error(
            "OneDrive delete failed status=%d body=%s",
            resp.status_code, resp.text[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OneDrive delete failed",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OneDrive delete failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OneDrive delete failed: {e}",
        )
