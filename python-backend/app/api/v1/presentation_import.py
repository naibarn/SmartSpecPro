"""
Presentation Import API endpoints.

POST   /api/v1/presentation-import/start                  — enqueue import task
GET    /api/v1/presentation-import/status/{conversion_id} — poll status
DELETE /api/v1/presentation-import/{conversion_id}        — cancel (best-effort)
"""

from typing import Optional, Self

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import text

from app.core.auth import get_current_user
from app.core.database import AsyncSessionLocal
from app.models.user import User

logger = structlog.get_logger(__name__)
router = APIRouter()

# Import Celery task with graceful fallback (worker may not be installed yet).
try:
    from app.tasks.presentation_import_tasks import import_presentation_task

    CELERY_ENABLED = True
except ImportError:
    import_presentation_task = None  # type: ignore[assignment]
    CELERY_ENABLED = False
    logger.warning("presentation_import_task_not_available")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


_ALLOWED_SOURCE_TYPES = frozenset({"pptx", "google_slides"})


class StartImportRequest(BaseModel):
    """Request body for POST /api/v1/presentation-import/start.

    Validators:
    - source_type must be "pptx" or "google_slides"
    - pptx requires source_library_item_id
    - google_slides requires slides_url
    """

    conversion_id: int
    source_type: str
    source_library_item_id: Optional[int] = None
    slides_url: Optional[str] = None
    user_id: int
    tenant_id: str

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        if v not in _ALLOWED_SOURCE_TYPES:
            raise ValueError(
                f"source_type must be one of {sorted(_ALLOWED_SOURCE_TYPES)}, got '{v}'"
            )
        return v

    @model_validator(mode="after")
    def validate_cross_fields(self) -> Self:
        if self.source_type == "pptx" and self.source_library_item_id is None:
            raise ValueError("source_library_item_id is required for pptx imports")
        if self.source_type == "google_slides" and not self.slides_url:
            raise ValueError("slides_url is required for google_slides imports")
        return self


class StartImportResponse(BaseModel):
    task_id: str


class ImportStatusResponse(BaseModel):
    status: str
    progress: int
    fidelity_warnings: Optional[list[str]] = None
    deck_library_item_id: Optional[int] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/start", response_model=StartImportResponse, status_code=202)
async def start_import(
    request: StartImportRequest,
    current_user: User = Depends(get_current_user),
) -> StartImportResponse:
    """Validate request and enqueue import_presentation_task."""
    # S04-01: Cross-check that the body's user_id/tenant_id match the authenticated identity.
    # Prevents horizontal privilege escalation where an authenticated user forges a different
    # tenant's identity to redirect an import into another tenant's S3 prefix.
    if request.user_id != current_user.id or request.tenant_id != current_user.currentTenantId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user_id and tenant_id must match the authenticated session",
        )

    if not CELERY_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Import service unavailable",
        )

    try:
        task = import_presentation_task.apply_async(
            kwargs={
                "conversion_id": request.conversion_id,
                "source_type": request.source_type,
                "user_id": request.user_id,
                "tenant_id": request.tenant_id,
                "source_item_id": request.source_library_item_id,
                "slides_url": request.slides_url,
            },
            queue="presentation_import",
        )
    except Exception as exc:
        logger.error("presentation_import_dispatch_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Import service temporarily unavailable",
        )

    logger.info(
        "presentation_import_queued",
        celery_task_id=task.id,
        conversion_id=request.conversion_id,
        source_type=request.source_type,
        user_id=current_user.id,
    )
    return StartImportResponse(task_id=task.id)


@router.get("/status/{conversion_id}", response_model=ImportStatusResponse)
async def get_import_status(
    conversion_id: int,
    current_user: User = Depends(get_current_user),
) -> ImportStatusResponse:
    """Return status of an import job.

    Enforces tenant isolation: filters by both conversion_id AND tenant_id from auth context.
    Returns 404 if record not found or belongs to a different tenant.
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                """
                SELECT status, progress, fidelity_warnings, deck_library_item_id
                FROM presentation_conversion_records
                WHERE id = :cid AND tenant_id = :tid
                """
            ),
            {"cid": conversion_id, "tid": current_user.currentTenantId},
        )
        row = result.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversion record not found",
        )

    return ImportStatusResponse(
        status=row.status,
        progress=row.progress,
        fidelity_warnings=row.fidelity_warnings,
        deck_library_item_id=row.deck_library_item_id,
        error=None,
    )


@router.delete("/{conversion_id}", status_code=200)
async def cancel_import(
    conversion_id: int,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Best-effort task cancellation.

    The conversion record status is managed by the Node.js callback handler, not here.
    Returns {"cancelled": true} regardless of revoke success.
    """
    # No Celery task ID is stored on the conversion record (celery_task_id column not in schema).
    # The Node.js tRPC cancelImport procedure sets the DB status to "cancelled" independently.
    # This endpoint logs the cancellation intent; revoke support can be added when the schema
    # tracks the Celery task ID.
    logger.info(
        "presentation_import_cancel_requested",
        conversion_id=conversion_id,
        user_id=current_user.id,
    )
    return {"cancelled": True}
