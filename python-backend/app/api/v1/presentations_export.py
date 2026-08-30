"""
Presentation Export API endpoints.

POST /api/v1/presentations/export          — enqueue a Celery render task
GET  /api/v1/presentations/export/{id}     — poll task status
"""

import json
import mimetypes
import os
from datetime import datetime, timezone
from typing import Any, Optional, Self

import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.auth import get_current_user, verify_token
from app.core.config import settings
from app.models.user import User

logger = structlog.get_logger(__name__)
router = APIRouter()

# Import Celery task with graceful fallback (section-07 may not be implemented yet).
# CELERY_ENABLED is patched in tests that exercise the task-dispatch path.
try:
    from app.tasks.presentation_render import render_presentation

    CELERY_ENABLED = True
except ImportError:
    render_presentation = None  # type: ignore[assignment]
    CELERY_ENABLED = False
    logger.warning(
        "presentation_render_task_not_available",
        message="presentation_render Celery task not available; POST /export will return 503",
    )

# Maximum allowed size for the serialized render_spec payload (64 KB)
_RENDER_SPEC_MAX_BYTES = 65_536


# ============================================================
# Pydantic models
# ============================================================


class PresentationRenderAuth(BaseModel):
    """Tenant-scoped actor forwarded to the Playwright render task."""

    user_id: int = Field(gt=0)
    tenant_id: str = Field(min_length=1, max_length=255)


class PresentationExportRequest(BaseModel):
    """Request body for POST /api/v1/presentations/export."""

    render_spec: dict[str, Any]
    quality: str  # "draft" | "standard" | "high"
    format: str  # "png" | "jpg" | "pdf" | "mp4"
    render_auth: Optional["PresentationRenderAuth"] = None

    @field_validator("render_spec")
    @classmethod
    def validate_render_spec_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        serialized = json.dumps(v)
        if len(serialized.encode()) > _RENDER_SPEC_MAX_BYTES:
            raise ValueError(
                f"render_spec exceeds maximum allowed size of {_RENDER_SPEC_MAX_BYTES} bytes"
            )
        return v

    @model_validator(mode="after")
    def validate_render_spec_numeric_fields(self) -> Self:
        """
        Coerce and range-check numeric fields inside render_spec that are later
        interpolated into FFmpeg filter_complex strings.  Raises a 422 if a
        caller supplies a non-numeric value (e.g. an injection payload string).
        Out-of-range numeric values are clamped rather than rejected so that
        legitimate callers with slightly wrong values still succeed.
        """
        spec = self.render_spec

        # --- fps ---
        fps_raw = spec.get("fps")
        if fps_raw is not None:
            if not isinstance(fps_raw, (int, float)):
                raise ValueError(
                    f"render_spec.fps must be a number, got {type(fps_raw).__name__!r}"
                )
            spec["fps"] = max(1, min(120, int(fps_raw)))

        # --- projectAudioTrack.volume ---
        project_audio = spec.get("projectAudioTrack")
        if isinstance(project_audio, dict):
            vol_raw = project_audio.get("volume")
            if vol_raw is not None:
                if not isinstance(vol_raw, (int, float)):
                    raise ValueError(
                        "render_spec.projectAudioTrack.volume must be a number, "
                        f"got {type(vol_raw).__name__!r}"
                    )
                project_audio["volume"] = max(0.0, min(2.0, float(vol_raw)))

        # --- slides[*].audioTrack.volume ---
        slides = spec.get("slides")
        if isinstance(slides, list):
            for slide_idx, slide in enumerate(slides):
                if not isinstance(slide, dict):
                    continue
                audio_track = slide.get("audioTrack")
                if not isinstance(audio_track, dict):
                    continue
                vol_raw = audio_track.get("volume")
                if vol_raw is not None:
                    if not isinstance(vol_raw, (int, float)):
                        raise ValueError(
                            f"render_spec.slides[{slide_idx}].audioTrack.volume must be a number, "
                            f"got {type(vol_raw).__name__!r}"
                        )
                    audio_track["volume"] = max(0.0, min(2.0, float(vol_raw)))

        return self

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        allowed = {"png", "jpg", "pdf", "mp4"}
        if v not in allowed:
            raise ValueError(f"format must be one of {sorted(allowed)}, got '{v}'")
        return v

    @field_validator("quality")
    @classmethod
    def validate_quality(cls, v: str) -> str:
        allowed = {"draft", "standard", "high"}
        if v not in allowed:
            raise ValueError(f"quality must be one of {sorted(allowed)}, got '{v}'")
        return v


class PresentationExportJobResponse(BaseModel):
    """Response from POST — the enqueued Celery job."""

    celery_task_id: str
    status: str  # always "queued" on creation


class PresentationExportStatusResponse(BaseModel):
    """Response from GET — current task state."""

    celery_task_id: str
    state: str  # "queued" | "processing" | "done" | "error"
    percent: int  # 0–100
    stage: Optional[str] = None
    output_url: Optional[str] = None
    output_storage_key: Optional[str] = None
    error_message: Optional[str] = None


# ============================================================
# Endpoints
# ============================================================


@router.post("/export", response_model=PresentationExportJobResponse, status_code=201)
async def create_export_job(
    request: PresentationExportRequest,
    current_user: User = Depends(get_current_user),
    presentation_render_token: Optional[str] = Header(
        default=None,
        alias="X-Presentation-Render-Token",
    ),
) -> PresentationExportJobResponse:
    """Enqueue a Celery presentation render task and return the task id."""
    if not CELERY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Export service unavailable",
        )

    try:
        render_auth = request.render_auth
        if render_auth is not None:
            render_claims = verify_token(
                presentation_render_token or "",
                expected_type="access",
            )
            render_scopes = render_claims.get("scopes", []) if render_claims else []
            try:
                render_user_id = int(render_claims.get("sub")) if render_claims else 0
            except (TypeError, ValueError):
                render_user_id = 0
            render_tenant_id = str(render_claims.get("tenantId", "")) if render_claims else ""
            if (
                not render_claims
                or render_claims.get("tokenUse") != "presentation_render"
                or "presentation:export" not in render_scopes
                or render_user_id != int(current_user.id)
                or render_user_id != render_auth.user_id
                or render_tenant_id != render_auth.tenant_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Render actor proof is invalid for the authenticated export",
                )

        task_render_spec = dict(request.render_spec)
        if render_auth is not None:
            # Keep Celery dispatch compatible with workers that still expose
            # the original 3-argument task signature during rolling deploys.
            task_render_spec["__presentation_render_auth"] = render_auth.model_dump()

        task = render_presentation.delay(task_render_spec, request.quality, request.format)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("presentation_render_dispatch_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Export service temporarily unavailable",
        )

    logger.info(
        "presentation_export_queued",
        celery_task_id=task.id,
        format=request.format,
        quality=request.quality,
        user_id=current_user.id,
    )
    return PresentationExportJobResponse(celery_task_id=task.id, status="queued")


@router.post("/export/{task_id}/cancel")
async def cancel_presentation_export(
    task_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Revoke a Celery presentation export task.
    Called by Node.js cancelExport service.

    Returns success=True when the revocation signal was sent, or success=False
    when it could not be delivered (e.g. broker unavailable).  In either case
    Node.js is expected to mark the DB row as cancelled independently.
    """
    try:
        from app.core.celery_app import celery_app

        celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
        logger.info("presentation_export_cancel_requested", task_id=task_id, user_id=current_user.id)
        return {"success": True, "task_id": task_id, "message": "Task revocation requested"}
    except Exception as exc:
        logger.warning("presentation_export_cancel_failed", task_id=task_id, error=str(exc))
        # Return success=False but do not raise — Node.js will still mark DB as cancelled
        return {"success": False, "task_id": task_id, "message": str(exc)}


@router.get("/export/files/{deck_id}/{filename}")
async def download_local_export_file(
    deck_id: int,
    filename: str,
    token: str = Query(..., min_length=16),
):
    """Serve a signed legacy export while old export records are being migrated.

    New exports are stored in R2 and use the protected storage URL. Older
    exports may still point at this route because they were created before the
    durable output key was persisted. Keep the signed, deck-scoped route alive
    for those files instead of showing a false "export ready" download error.
    """
    if not settings.JWT_SECRET:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="JWT secret is not configured")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid download token") from exc
    if payload.get("sub") != "presentation-export-download":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    if str(payload.get("deck_id")) != str(deck_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token deck mismatch")
    if payload.get("filename") != filename:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token file mismatch")
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Download token expired")

    if not filename or "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    media_storage = os.getenv("MEDIA_STORAGE_PATH", "./media_storage")
    base_dir = os.path.realpath(
        os.path.join(media_storage, "presentation_exports", str(deck_id))
    )
    file_path = os.path.realpath(os.path.join(base_dir, filename))
    if not file_path.startswith(base_dir + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This legacy export is no longer available; please export again",
        )

    media_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    return FileResponse(path=file_path, media_type=media_type, filename=filename)


@router.get("/export/{celery_task_id}", response_model=PresentationExportStatusResponse)
async def get_export_status(
    celery_task_id: str,
    current_user: User = Depends(get_current_user),
) -> PresentationExportStatusResponse:
    """Poll the status of a presentation render task.

    Note: Task IDs are random UUIDs — ownership is enforced by UUID entropy, not by a DB lookup.
    """
    try:
        result = AsyncResult(celery_task_id)
        state = result.state  # lazy Redis read — can raise on broker outage

        if state == "SUCCESS":
            result_data = result.result or {}
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="done",
                percent=100,
                output_url=result_data.get("output_url"),
                output_storage_key=result_data.get("output_storage_key"),
            )

        if state == "FAILURE":
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="error",
                percent=0,
                error_message=str(result.result),
            )

        if state == "REVOKED":
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="error",
                percent=0,
                error_message="Task was cancelled",
            )

        if state == "PROGRESS":
            info = result.info or {}
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="processing",
                percent=info.get("percent", 0),
                stage=info.get("stage"),
            )

        if state == "STARTED":
            return PresentationExportStatusResponse(
                celery_task_id=celery_task_id,
                state="processing",
                percent=0,
            )

        # PENDING, RETRY, or any other unknown state — treat as queued
        return PresentationExportStatusResponse(
            celery_task_id=celery_task_id,
            state="queued",
            percent=0,
        )

    except Exception as exc:
        logger.error(
            "presentation_export_status_check_failed",
            celery_task_id=celery_task_id,
            error=str(exc),
        )
        return PresentationExportStatusResponse(
            celery_task_id=celery_task_id,
            state="error",
            percent=0,
            error_message="Status check temporarily unavailable",
        )
