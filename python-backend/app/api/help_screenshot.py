"""
Help Documentation Screenshot Capture API.

Admin-only endpoint that navigates to a URL, captures a screenshot,
saves it to the Node.js uploads directory, and returns a URL for embedding
in help markdown files.

POST /api/help/screenshot
"""

from __future__ import annotations

import asyncio
import base64
import os
import secrets
from pathlib import Path
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

logger = structlog.get_logger(__name__)

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


# ── Endpoint ──────────────────────────────────────────────────────────────


@router.post(
    "/screenshot",
    response_model=ScreenshotResponse,
    dependencies=[Depends(_verify_internal_token)],
)
async def capture_help_screenshot(req: ScreenshotRequest) -> ScreenshotResponse:
    """Capture a screenshot of a web page for help documentation.

    Navigates to the given URL using a sandboxed browser session, saves the
    resulting PNG to the Node.js uploads directory, and returns the public
    URL and ready-to-paste Markdown image tag.
    """
    from app.services.tools.browser_tool import BrowserSession

    logger.info(
        "help_screenshot_start",
        url=req.url,
        feature_name=req.feature_name,
        step=req.step,
    )

    session = BrowserSession(
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

        # Resolve output directory — default mirrors the Node.js static uploads path.
        uploads_base = Path(
            os.environ.get(
                "HELP_ASSETS_DIR",
                str(Path(__file__).resolve().parents[3] / "apps" / "web" / "server" / "uploads"),
            )
        )
        help_dir = uploads_base / "help-assets" / req.feature_name
        help_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{req.step}.png"
        filepath = help_dir / filename
        filepath.write_bytes(png_bytes)

        url_path = f"/uploads/help-assets/{req.feature_name}/{filename}"
        markdown = f"![{req.step}]({url_path})"

        logger.info(
            "help_screenshot_saved",
            path=str(filepath),
            url=url_path,
            size_bytes=len(png_bytes),
        )

        return ScreenshotResponse(
            url=url_path,
            filename=filename,
            markdown=markdown,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("help_screenshot_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Screenshot capture failed") from exc
