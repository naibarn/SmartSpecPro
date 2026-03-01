"""Agency run endpoints -- FastAPI router for multi-agent execution."""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

_bearer_scheme = HTTPBearer()
from app.models.agency import AgencyRunStatus
from app.services.agency_service import (
    AgencyNotFoundError,
    AgencyPermissionError,
    AgencyService,
    InsufficientCreditsError,
    RunContext,
)

router = APIRouter(prefix="/api/v1/agencies", tags=["agencies"])
logger = structlog.get_logger(__name__)


# ── Request / Response Models ──────────────────────────────────


_PERSONA_BLOCKED_PATTERNS = ["[SYSTEM]", "[INST]", "<<SYS>>", "</s>", "[/INST]"]


class AgencyRunRequest(BaseModel):
    """Request body for POST /run and POST /stream."""

    message: str = Field(..., min_length=1, max_length=50000)
    conversation_id: Optional[str] = Field(
        None, description="Existing conversation ID to continue"
    )
    model_override: Optional[str] = Field(
        None, max_length=200, description="Override model for all agents in this run"
    )
    persona_prefix: Optional[str] = Field(
        None, max_length=3000, description="Persona prompt prefix to prepend to agent instructions"
    )

    @property
    def safe_persona_prefix(self) -> Optional[str]:
        """Return persona_prefix after sanitization, or None if blocked."""
        if not self.persona_prefix:
            return None
        upper = self.persona_prefix.upper()
        for pattern in _PERSONA_BLOCKED_PATTERNS:
            if pattern.upper() in upper:
                logger.warning("persona_prefix_blocked", pattern=pattern)
                return None
        return self.persona_prefix


class AgencyRunResponse(BaseModel):
    """Response from POST /run."""

    run_id: str
    conversation_id: str
    status: str  # completed / failed
    output: str
    credits_used: float
    duration_ms: int


class AgencyRunSummary(BaseModel):
    """Single run in the list response."""

    id: str
    status: str
    total_credits_used: float
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    step_count: int = 0


class AgencyRunListResponse(BaseModel):
    """Response from GET /runs."""

    runs: list[AgencyRunSummary]
    total: int


class AgencyCancelResponse(BaseModel):
    """Response from POST /cancel."""

    run_id: str
    status: str  # cancelled


# ── Error Classification ───────────────────────────────────────


class AgencyErrorType:
    """Error classification constants."""

    TRANSIENT = "transient"  # timeout, 429, 503 -- retry
    PERMANENT = "permanent"  # auth, validation, credit -- fail fast
    OPTIONAL_SKIP = "optional_skip"  # optional agent failed -- skip


def classify_error(error: Exception, agent_is_optional: bool = False) -> str:
    """Classify an error for retry/fail/skip decision.

    Returns one of AgencyErrorType constants.
    """
    if agent_is_optional:
        return AgencyErrorType.OPTIONAL_SKIP

    # Transient errors
    if isinstance(error, (asyncio.TimeoutError, ConnectionError)):
        return AgencyErrorType.TRANSIENT

    status_code = getattr(error, "status_code", None)
    if status_code in (429, 502, 503, 504):
        return AgencyErrorType.TRANSIENT

    # Permanent errors
    if isinstance(error, (InsufficientCreditsError, ValueError)):
        return AgencyErrorType.PERMANENT

    if status_code in (400, 401, 403):
        return AgencyErrorType.PERMANENT

    # Default: permanent (fail-safe)
    return AgencyErrorType.PERMANENT


# ── Retry Logic ────────────────────────────────────────────────

MAX_RETRIES = 3
BACKOFF_BASE = 1.0  # seconds


async def with_retry(coro_factory, max_retries=MAX_RETRIES):
    """Execute an async operation with exponential backoff retry on transient errors.

    coro_factory: a callable that returns a new coroutine on each call
    (because a coroutine object cannot be awaited twice).
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            return await coro_factory()
        except Exception as exc:
            error_type = classify_error(exc)
            if error_type != AgencyErrorType.TRANSIENT:
                raise
            last_error = exc
            if attempt < max_retries - 1:
                delay = BACKOFF_BASE * (2**attempt)
                logger.warning(
                    "agency_retry",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    delay=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)
    raise last_error  # type: ignore[misc]


# ── Feature Flag Dependency ────────────────────────────────────


async def require_agency_feature(
    db: AsyncSession = Depends(get_db),
) -> None:
    """Dependency that raises 404 if AGENCY_SWARM_ENABLED is false.

    Checks env config first (fast path), then falls back to system_settings table.
    """
    if settings.AGENCY_SWARM_ENABLED:
        return

    # Check system_settings table as override
    try:
        result = await db.execute(
            text("""
                SELECT value FROM system_settings
                WHERE category = 'feature_flags'
                  AND key = 'AGENCY_SWARM_ENABLED'
                LIMIT 1
            """)
        )
        row = result.first()
        if row and str(row.value).lower() in ("true", "1", "yes"):
            return
    except Exception:
        pass  # DB error -- fall through to disabled

    raise HTTPException(status_code=404, detail="Agency feature is disabled")


# ── Endpoints ──────────────────────────────────────────────────


@router.post("/{agency_id}/run")
async def run_agency(
    agency_id: str,
    request: AgencyRunRequest,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
) -> AgencyRunResponse:
    """Execute a non-streaming agency run."""
    conversation_id = request.conversation_id or str(uuid.uuid4())
    service = AgencyService(db=db)
    context = RunContext(
        user_id=user.id,
        tenant_id=user.currentTenantId or "",
        conversation_id=conversation_id,
        user_token=credentials.credentials,
    )

    try:
        result = await with_retry(
            lambda: service.execute_run(agency_id, request.message, context)
        )
    except InsufficientCreditsError as exc:
        raise HTTPException(status_code=402, detail=str(exc))
    except AgencyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except AgencyPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        logger.error(
            "agency_run_failed",
            agency_id=agency_id,
            user_id=user.id,
            error=str(exc),
        )
        raise HTTPException(status_code=503, detail="Agency run failed")

    return AgencyRunResponse(
        run_id=result.run_id,
        conversation_id=conversation_id,
        status="completed",
        output=result.response,
        credits_used=0.0,  # Per-call deduction by gateway; reconciled in section-06
        duration_ms=result.duration_ms,
    )


@router.post("/{agency_id}/stream")
async def stream_agency(
    agency_id: str,
    request: AgencyRunRequest,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
):
    """Execute a streaming agency run (SSE)."""
    conversation_id = request.conversation_id or str(uuid.uuid4())
    service = AgencyService(db=db)
    context = RunContext(
        user_id=user.id,
        tenant_id=user.currentTenantId or "",
        conversation_id=conversation_id,
        user_token=credentials.credentials,
    )

    # Pre-check credits before starting stream
    try:
        estimate = service.credit_manager.estimate_run_cost(agent_count=2)
        has_credits = await service.credit_manager.pre_check(
            user_id=user.id, estimated_cost=estimate
        )
        if not has_credits:
            raise InsufficientCreditsError("Insufficient credits for agency run")
    except InsufficientCreditsError as exc:
        raise HTTPException(status_code=402, detail=str(exc))

    async def sse_generator() -> AsyncIterator[str]:
        """Wrap agency service streaming with error boundary."""
        try:
            async for event in service.execute_run_stream(
                agency_id, request.message, context,
                model_override=request.model_override,
                persona_prefix=request.safe_persona_prefix,
            ):
                event_type = event.get("event", "message")
                event_data = json.dumps(event.get("data", {}))
                yield f"event: {event_type}\ndata: {event_data}\n\n"
        except Exception as exc:
            err_type = classify_error(exc)
            # Log full error details server-side only
            logger.error(
                "agency_run_sse_error",
                agency_id=agency_id,
                error_type=err_type,
                error=str(exc)[:500],
            )
            # Return safe user-facing message (never expose internal details)
            safe_messages = {
                AgencyErrorType.TRANSIENT: "A temporary error occurred. Please try again.",
                AgencyErrorType.OPTIONAL_SKIP: "An optional step was skipped.",
                AgencyErrorType.PERMANENT: "The request could not be processed.",
            }
            error_data = json.dumps(
                {
                    "error_type": err_type,
                    "message": safe_messages.get(err_type, "An unexpected error occurred."),
                    "retryable": err_type == AgencyErrorType.TRANSIENT,
                }
            )
            yield f"event: run_error\ndata: {error_data}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{agency_id}/runs")
async def list_runs(
    agency_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: Optional[AgencyRunStatus] = Query(default=None),
) -> AgencyRunListResponse:
    """List runs for an agency, filtered by tenant."""
    service = AgencyService(db=db)
    result = await service.list_runs(
        agency_id=agency_id,
        tenant_id=user.currentTenantId or "",
        limit=limit,
        offset=offset,
        status_filter=status,
    )
    return AgencyRunListResponse(
        runs=[AgencyRunSummary(**r) for r in result["runs"]],
        total=result["total"],
    )


@router.get("/{agency_id}/runs/{run_id}")
async def get_run(
    agency_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
) -> AgencyRunSummary:
    """Get details for a specific run."""
    service = AgencyService(db=db)
    try:
        result = await service.get_run(
            run_id=run_id,
            agency_id=agency_id,
            tenant_id=user.currentTenantId or "",
        )
    except AgencyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return AgencyRunSummary(**result)


@router.post("/{agency_id}/runs/{run_id}/cancel")
async def cancel_run(
    agency_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
) -> AgencyCancelResponse:
    """Cancel a running agency run."""
    service = AgencyService(db=db)
    try:
        result = await service.cancel_run(
            run_id=run_id,
            agency_id=agency_id,
            tenant_id=user.currentTenantId or "",
        )
    except AgencyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return AgencyCancelResponse(
        run_id=result["run_id"],
        status=result["status"],
    )
