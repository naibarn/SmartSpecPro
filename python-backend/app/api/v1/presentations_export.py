"""
Presentation Export API endpoints.

POST /api/v1/presentations/export          — enqueue a Celery render task
GET  /api/v1/presentations/export/{id}     — poll task status
"""

import json
from typing import Any, Optional

import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from app.core.auth import get_current_user
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


class PresentationExportRequest(BaseModel):
    """Request body for POST /api/v1/presentations/export."""

    render_spec: dict[str, Any]
    quality: str  # "draft" | "standard" | "high"
    format: str  # "png" | "jpg" | "pdf" | "mp4"

    @field_validator("render_spec")
    @classmethod
    def validate_render_spec_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        serialized = json.dumps(v)
        if len(serialized.encode()) > _RENDER_SPEC_MAX_BYTES:
            raise ValueError(
                f"render_spec exceeds maximum allowed size of {_RENDER_SPEC_MAX_BYTES} bytes"
            )
        return v

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
    error_message: Optional[str] = None


# ============================================================
# Endpoints
# ============================================================


@router.post("/export", response_model=PresentationExportJobResponse, status_code=201)
async def create_export_job(
    request: PresentationExportRequest,
    current_user: User = Depends(get_current_user),
) -> PresentationExportJobResponse:
    """Enqueue a Celery presentation render task and return the task id."""
    if not CELERY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Export service unavailable",
        )

    try:
        task = render_presentation.delay(request.render_spec, request.quality, request.format)
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
