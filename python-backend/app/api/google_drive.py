"""
Google Drive File Operations API -- internal endpoints for upload, export, and delete.

Used by the Node.js tRPC router for edit-in-Google workflows.
"""

import base64
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.google_token_service import GoogleTokenService, InvalidGrantError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/gdrive", tags=["google-drive"])

# ── Google editor URL templates ──────────────────────────────────────────

EDITOR_URLS = {
    "application/vnd.google-apps.document": "https://docs.google.com/document/d/{file_id}/edit",
    "application/vnd.google-apps.spreadsheet": "https://docs.google.com/spreadsheets/d/{file_id}/edit",
    "application/vnd.google-apps.presentation": "https://docs.google.com/presentation/d/{file_id}/edit",
}


# ── Request/Response Models ──────────────────────────────────────────────


class UploadRequest(BaseModel):
    file_content: str  # base64-encoded
    file_name: str
    mime_type: str  # target Google MIME type (e.g. application/vnd.google-apps.document)
    convert: bool = True
    user_id: int


class UploadResponse(BaseModel):
    driveFileId: str
    editUrl: str


class ExportRequest(BaseModel):
    drive_file_id: str
    export_mime_type: str
    user_id: int


class ExportResponse(BaseModel):
    content: str  # base64-encoded
    size: int


class DeleteResponse(BaseModel):
    success: bool


# ── Endpoints ────────────────────────────────────────────────────────────


@router.post("/upload", response_model=UploadResponse)
async def upload_to_drive(
    req: UploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to Google Drive with optional format conversion."""
    if req.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot operate on another user's Drive")
    try:
        token_svc = GoogleTokenService(db)
        access_token = await token_svc.get_valid_access_token(current_user.id)
    except (ValueError, InvalidGrantError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google auth error: {e}",
        )

    try:
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)

        file_bytes = base64.b64decode(req.file_content)
        media = _create_media_upload(file_bytes, req.mime_type)

        file_metadata = {"name": req.file_name}
        if req.convert:
            file_metadata["mimeType"] = req.mime_type

        created = drive_svc.files().create(
            body=file_metadata,
            media_body=media,
            fields="id,mimeType",
        ).execute()

        drive_file_id = created["id"]
        result_mime = created.get("mimeType", req.mime_type)
        edit_url = EDITOR_URLS.get(
            result_mime,
            f"https://drive.google.com/file/d/{drive_file_id}/edit",
        ).format(file_id=drive_file_id)

        logger.info("Uploaded file to Drive: %s (mime=%s)", drive_file_id, result_mime)
        return UploadResponse(driveFileId=drive_file_id, editUrl=edit_url)

    except Exception as e:
        logger.error("Drive upload failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Drive upload failed: {e}",
        )


@router.post("/export", response_model=ExportResponse)
async def export_from_drive(
    req: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a file from Google Drive in the specified format."""
    if req.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot operate on another user's Drive")
    try:
        token_svc = GoogleTokenService(db)
        access_token = await token_svc.get_valid_access_token(current_user.id)
    except (ValueError, InvalidGrantError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google auth error: {e}",
        )

    try:
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)

        content = drive_svc.files().export(
            fileId=req.drive_file_id,
            mimeType=req.export_mime_type,
        ).execute()

        if isinstance(content, bytes):
            encoded = base64.b64encode(content).decode("ascii")
            size = len(content)
        else:
            raw = str(content).encode("utf-8")
            encoded = base64.b64encode(raw).decode("ascii")
            size = len(raw)

        logger.info("Exported Drive file %s (%d bytes)", req.drive_file_id, size)
        return ExportResponse(content=encoded, size=size)

    except Exception as e:
        logger.error("Drive export failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Drive export failed: {e}",
        )


@router.delete("/files/{file_id}", response_model=DeleteResponse)
async def delete_drive_file(
    file_id: str,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a temporary file from Google Drive."""
    if user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot operate on another user's Drive")
    try:
        token_svc = GoogleTokenService(db)
        access_token = await token_svc.get_valid_access_token(current_user.id)
    except (ValueError, InvalidGrantError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google auth error: {e}",
        )

    try:
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials

        creds = Credentials(token=access_token)
        drive_svc = build("drive", "v3", credentials=creds)

        drive_svc.files().delete(fileId=file_id).execute()
        logger.info("Deleted Drive file: %s", file_id)
        return DeleteResponse(success=True)

    except Exception as e:
        # Handle 404 gracefully -- file was already deleted
        http_status = getattr(e, "status_code", None)
        if http_status is None and hasattr(e, "resp"):
            http_status = int(e.resp.get("status", 0))
        if http_status == 404:
            logger.info("Drive file %s already deleted (404)", file_id)
            return DeleteResponse(success=True)

        logger.error("Drive delete failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Drive delete failed: {e}",
        )


def _create_media_upload(file_bytes: bytes, mime_type: str):
    """Create a MediaIoBaseUpload from bytes."""
    from googleapiclient.http import MediaIoBaseUpload

    # Determine the source MIME type for upload (not the target Google type)
    source_mime_map = {
        "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
    upload_mime = source_mime_map.get(mime_type, "application/octet-stream")
    return MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=upload_mime, resumable=True)
