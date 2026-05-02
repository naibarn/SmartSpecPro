"""
Browser automation API endpoint.

Called internally by the Node.js browser tool route after credit reservation.
Not exposed directly to end users.

POST /api/browser/execute  — Execute browser actions in a sandboxed session
"""

from __future__ import annotations

import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.tools.browser_tool import BrowserSession, BrowserSSRFGuard

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/browser", tags=["Browser Automation"])


# ── Auth ──────────────────────────────────────────────────────────────────


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
    """Verify internal service token for Node.js -> Python calls."""
    expected = (
        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
    )
    if not expected:
        raise HTTPException(status_code=500, detail="Internal token not configured")

    token = x_internal_token or x_proxy_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing internal token")
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal token")


# ── Request / Response models ──────────────────────────────────────────────


class BrowserActionRequest(BaseModel):
    """Request to execute browser actions in a sandboxed session."""

    session_id: Optional[str] = None
    actions: list[dict] = Field(default_factory=list)
    allowed_domains: list[str] = Field(default_factory=list)
    timeout: int = Field(default=300, le=300, ge=10)
    user_id: int
    tenant_id: str


class BrowserActionResponse(BaseModel):
    """Response from browser action execution."""

    session_id: str
    results: list[dict]
    actual_cost: int
    screenshots_taken: int
    pages_loaded: int


# ── Endpoint ──────────────────────────────────────────────────────────────


@router.post(
    "/execute",
    response_model=BrowserActionResponse,
    dependencies=[Depends(_verify_internal_token)],
)
async def execute_browser_actions(req: BrowserActionRequest) -> BrowserActionResponse:
    """Execute a sequence of browser actions in an isolated session.

    This endpoint is called by the Node.js browser tool route after
    credit reservation and concurrency checks are complete.
    """
    from app.services.playwright_feature_gate import is_playwright_enabled

    if not is_playwright_enabled():
        raise HTTPException(status_code=503, detail="Playwright browser automation is disabled.")

    if not req.actions:
        raise HTTPException(status_code=400, detail="No actions provided.")

    logger.info(
        "browser_execute_start",
        user_id=req.user_id,
        tenant_id=req.tenant_id,
        action_count=len(req.actions),
        allowed_domains=req.allowed_domains,
    )

    session = BrowserSession(
        user_id=req.user_id,
        tenant_id=req.tenant_id,
        allowed_domains=req.allowed_domains,
    )

    try:
        result = await session.execute_actions(req.actions)
    except ValueError as exc:
        logger.warning(
            "browser_execute_error",
            user_id=req.user_id,
            error=str(exc),
        )
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(
            "browser_execute_unexpected_error",
            user_id=req.user_id,
            error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Browser execution failed.")

    logger.info(
        "browser_execute_complete",
        user_id=req.user_id,
        session_id=result["session_id"],
        actual_cost=result["actual_cost"],
        pages_loaded=result["pages_loaded"],
    )

    return BrowserActionResponse(**result)
