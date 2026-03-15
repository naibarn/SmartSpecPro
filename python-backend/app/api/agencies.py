"""Agency run endpoints -- FastAPI router for multi-agent execution."""

import asyncio
import json
import secrets as _secrets
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, verify_token
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

_bearer_scheme = HTTPBearer()


async def get_user_from_gateway_or_jwt(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via gateway token (from Node.js bridge) or direct JWT.

    The Node.js agency bridge sends:
      - Authorization: Bearer <GATEWAY_TOKEN>
      - X-User-Token: <user JWT>
      - X-User-Id: <user id>
      - X-Tenant-Id: <tenant id>

    If the Bearer token matches the gateway token, we trust X-User-Id
    and look up the user from DB. Otherwise we fall back to normal JWT auth.
    """
    bearer_token = credentials.credentials
    gateway_expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN

    # --- Path 1: Gateway token auth ---
    if gateway_expected and _secrets.compare_digest(bearer_token, gateway_expected):
        # Gateway token matches — read user from X-User-Id header
        user_id_header = request.headers.get("x-user-id")
        if not user_id_header:
            raise HTTPException(status_code=401, detail="Missing X-User-Id header")
        try:
            user_id = int(user_id_header)
        except (ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Invalid X-User-Id header")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="User account is inactive")
        return user

    # --- Path 2: Direct JWT auth (fallback) ---
    return await get_current_user(credentials, db)


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


class TaskMetadata(BaseModel):
    """Planner metadata propagated from Node.js into agency runs."""

    task_run_id: Optional[int] = Field(None, description="Task run ID for linking")
    task_type: Optional[str] = Field(None, description="Planner task type")
    execution_strategy: Optional[str] = Field(None, description="cheapest|fastest|best")
    capability_requirements: Optional[dict] = Field(None, description="Required model capabilities")
    budget_class: Optional[str] = Field(None, description="economy|standard|premium")
    route_reason: Optional[str] = Field(None, description="Why this task was routed to agency")
    plan_version: Optional[int] = Field(None, description="Plan schema version")


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
    task_metadata: Optional[TaskMetadata] = Field(
        None, description="Planner metadata from Node.js task execution system"
    )
    retrieval_scope: Optional[dict] = Field(
        None, description="Resolved template retrieval scope for immutable run audit metadata"
    )
    # v1.8: Run-level params
    recipient_agent: Optional[str] = Field(
        None, max_length=200, description="Target a specific agent by name"
    )
    file_ids: Optional[list[str]] = Field(
        None, max_items=20, description="File IDs to include in the run"
    )
    additional_instructions: Optional[str] = Field(
        None, max_length=5000, description="Per-run instruction override"
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


class UsageBreakdownResponse(BaseModel):
    """Per-model token usage from a run (v1.6)."""

    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class AgencyRunResponse(BaseModel):
    """Response from POST /run."""

    run_id: str
    conversation_id: str
    status: str  # completed / failed
    response: str
    output: str
    credits_used: float
    duration_ms: int
    structured_result: Optional[dict] = None
    preview_artifacts: list[dict] = Field(default_factory=list)
    # v1.6: Token usage tracking
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    usage_breakdown: list[UsageBreakdownResponse] = Field(default_factory=list)


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


class AgencyRunDetailResponse(AgencyRunSummary):
    """Detailed run response with normalized output contract."""

    conversation_id: Optional[str] = None
    response: str = ""
    output: str = ""
    structured_result: Optional[dict] = None
    structured_result_parse_status: Optional[str] = None
    structured_result_intent: Optional[str] = None
    structured_result_summary: Optional[str] = None
    structured_result_error: Optional[str] = None
    preview_artifacts: list[dict] = Field(default_factory=list)


class AgencyRunListResponse(BaseModel):
    """Response from GET /runs."""

    runs: list[AgencyRunSummary]
    total: int


class AgencyCancelRequest(BaseModel):
    """Request body for POST /cancel (v1.6)."""

    mode: str = Field(
        default="immediate",
        pattern="^(immediate|after_turn)$",
        description="Cancel mode: 'immediate' stops now, 'after_turn' waits for current turn",
    )


class AgencyCancelResponse(BaseModel):
    """Response from POST /cancel."""

    run_id: str
    status: str  # cancelled
    mode: str = "immediate"


class AgencyMetadataResponse(BaseModel):
    """Response from GET /metadata (v1.7)."""

    agency_name: str
    total_agents: int = 0
    total_tools: int = 0
    agents: list[str] = Field(default_factory=list)
    entry_points: list[str] = Field(default_factory=list)
    graph: Optional[dict] = None


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


# ── Helpers ────────────────────────────────────────────────────


def _resolve_user_token(request: Request, credentials: HTTPAuthorizationCredentials) -> str:
    """Return the real user JWT for downstream LLM calls.

    When the Node.js bridge uses gateway auth, the user JWT is in X-User-Token.
    For direct JWT auth, the Bearer token itself is the user JWT.
    """
    gateway_expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    bearer = credentials.credentials
    if gateway_expected and _secrets.compare_digest(bearer, gateway_expected):
        return request.headers.get("x-user-token", bearer)
    return bearer


# ── Endpoints ──────────────────────────────────────────────────


@router.post("/{agency_id}/run")
async def run_agency(
    agency_id: str,
    request: AgencyRunRequest,
    raw_request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    user: User = Depends(get_user_from_gateway_or_jwt),
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
        user_token=_resolve_user_token(raw_request, credentials),
        run_metadata={
            **({"planner": request.task_metadata.model_dump(exclude_none=True)} if request.task_metadata else {}),
            **({"retrieval_scope": request.retrieval_scope} if request.retrieval_scope else {}),
        } or None,
    )

    # Log planner metadata for telemetry (if provided)
    if request.task_metadata:
        logger.info(
            "agency_run_with_planner_metadata",
            agency_id=agency_id,
            task_run_id=request.task_metadata.task_run_id,
            task_type=request.task_metadata.task_type,
            execution_strategy=request.task_metadata.execution_strategy,
            route_reason=request.task_metadata.route_reason,
            budget_class=request.task_metadata.budget_class,
        )

    try:
        result = await with_retry(
            lambda: service.execute_run(
                agency_id, request.message, context,
                recipient_agent=request.recipient_agent,
                file_ids=request.file_ids,
                additional_instructions=request.additional_instructions,
            )
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
        response=result.response,
        output=result.response,
        credits_used=0.0,  # Per-call deduction by gateway; reconciled in section-06
        duration_ms=result.duration_ms,
        structured_result=result.structured_result,
        preview_artifacts=result.preview_artifacts,
        # v1.6: Usage tracking
        total_tokens=result.total_tokens,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        usage_breakdown=[
            UsageBreakdownResponse(
                model=b.model,
                prompt_tokens=b.prompt_tokens,
                completion_tokens=b.completion_tokens,
                total_tokens=b.total_tokens,
            )
            for b in result.usage_breakdown
        ],
    )


@router.post("/{agency_id}/stream")
async def stream_agency(
    agency_id: str,
    request: AgencyRunRequest,
    raw_request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    user: User = Depends(get_user_from_gateway_or_jwt),
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
        user_token=_resolve_user_token(raw_request, credentials),
        run_metadata={
            **({"planner": request.task_metadata.model_dump(exclude_none=True)} if request.task_metadata else {}),
            **({"retrieval_scope": request.retrieval_scope} if request.retrieval_scope else {}),
        } or None,
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
                recipient_agent=request.recipient_agent,
                file_ids=request.file_ids,
                additional_instructions=request.additional_instructions,
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
) -> AgencyRunDetailResponse:
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

    return AgencyRunDetailResponse(**result)


@router.post("/{agency_id}/runs/{run_id}/cancel")
async def cancel_run(
    agency_id: str,
    run_id: str,
    request: Optional[AgencyCancelRequest] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
) -> AgencyCancelResponse:
    """Cancel a running agency run (v1.6 stream cancellation).

    Accepts optional mode: "immediate" (default) or "after_turn".
    """
    cancel_mode = (request.mode if request else None) or "immediate"
    service = AgencyService(db=db)
    try:
        result = await service.cancel_run(
            run_id=run_id,
            agency_id=agency_id,
            tenant_id=user.currentTenantId or "",
            cancel_mode=cancel_mode,
        )
    except AgencyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return AgencyCancelResponse(
        run_id=result["run_id"],
        status=result["status"],
        mode=cancel_mode,
    )


@router.get("/{agency_id}/metadata")
async def get_agency_metadata(
    agency_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _flag: None = Depends(require_agency_feature),
    include_tools: bool = Query(default=True, description="Include tool details in graph"),
) -> AgencyMetadataResponse:
    """Return agency graph and metadata (v1.7).

    Returns a ReactFlow-compatible graph with agent nodes, tool nodes,
    communication edges, conversation starters, and tool input schemas.
    """
    service = AgencyService(db=db)
    try:
        metadata = await service.get_agency_metadata(
            agency_id=agency_id,
            tenant_id=user.currentTenantId or "",
            user_token="",  # Metadata doesn't need LLM access
            include_tools=include_tools,
        )
    except AgencyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except AgencyPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    return AgencyMetadataResponse(
        agency_name=metadata.get("metadata", {}).get("agencyName", ""),
        total_agents=metadata.get("metadata", {}).get("totalAgents", 0),
        total_tools=metadata.get("metadata", {}).get("totalTools", 0),
        agents=metadata.get("metadata", {}).get("agents", []),
        entry_points=metadata.get("metadata", {}).get("entryPoints", []),
        graph=metadata,
    )
