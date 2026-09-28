"""
Help Documentation Screenshot Capture API.

Admin-only endpoint that navigates to a URL and returns screenshot bytes.
Node.js persists the image in R2 before exposing it to help markdown.

POST /api/help/screenshot
"""

from __future__ import annotations

import asyncio
import base64
import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

logger = structlog.get_logger(__name__)

# Module-level seam for tests/internal callers; screenshots stay in memory and
# are persisted by the Node caller through the tenant-scoped R2 media path.
BrowserSession = None

router = APIRouter(prefix="/api/help", tags=["Help Documentation"])


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


class ScreenshotRequest(BaseModel):
    """Request to capture a web page screenshot for help documentation."""

    url: str = Field(..., description="Full URL to navigate to and screenshot")
    feature_name: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    step: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    width: int = Field(default=1280, ge=320, le=1920)
    height: int = Field(default=720, ge=240, le=1080)


class ScreenshotResponse(BaseModel):
    """Response from a successful help screenshot capture."""

    url: str
    filename: str
    markdown: str
    base64: str


# ── Endpoint ──────────────────────────────────────────────────────────────


@router.post(
    "/screenshot",
    response_model=ScreenshotResponse,
    dependencies=[Depends(_verify_internal_token)],
)
async def capture_help_screenshot(req: ScreenshotRequest) -> ScreenshotResponse:
    """Capture a screenshot of a web page for help documentation.

    Navigates to the given URL using a sandboxed browser session, saves the
    resulting PNG in memory. The Node.js caller persists it through the
    tenant-scoped R2 media pipeline.
    """
    browser_session_factory = BrowserSession
    if browser_session_factory is None:
        from app.services.playwright_feature_gate import is_playwright_enabled

        if not is_playwright_enabled():
            raise HTTPException(status_code=503, detail="Playwright screenshot capture is disabled.")

        from app.services.tools.browser_tool import BrowserSession as browser_session_factory

    logger.info(
        "help_screenshot_start",
        url=req.url,
        feature_name=req.feature_name,
        step=req.step,
    )

    session = browser_session_factory(
        user_id=0,  # system user — no credit accounting for internal tooling
        tenant_id="system",
        allowed_domains=["smartaihub.app", "localhost"],
    )

    try:
        await session.navigate(req.url)
        await asyncio.sleep(2)

        result = await session.screenshot()
        screenshot_data = result.get("data", "")

        if not screenshot_data:
            raise HTTPException(status_code=500, detail="Screenshot returned empty data")

        png_bytes = base64.b64decode(screenshot_data)

        filename = f"{req.step}.png"
        logger.info(
            "help_screenshot_captured",
            size_bytes=len(png_bytes),
        )

        return ScreenshotResponse(
            url="",
            filename=filename,
            markdown="",
            base64=base64.b64encode(png_bytes).decode("ascii"),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("help_screenshot_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Screenshot capture failed") from exc
