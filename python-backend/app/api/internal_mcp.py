"""Internal MCP API router.

Exposes two endpoints for the Node.js backend:
  GET  /api/internal/mcp/tools       -- list available Python-native MCP tools
  POST /api/internal/mcp/tools/call  -- execute a specific tool
"""

import logging
import secrets
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.mcp.google_drive_mcp import GOOGLE_DRIVE_TOOLS, TOOL_HANDLERS as GDRIVE_HANDLERS, ToolError
from app.mcp.onedrive_mcp import ONEDRIVE_TOOLS, TOOL_HANDLERS as ONEDRIVE_HANDLERS
from app.mcp.browser_tools_mcp import BROWSER_TOOLS, TOOL_HANDLERS as BROWSER_HANDLERS

# Merge tool handlers from all providers
TOOL_HANDLERS = {**GDRIVE_HANDLERS, **ONEDRIVE_HANDLERS, **BROWSER_HANDLERS}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/mcp", tags=["Internal MCP"])


# ── Auth ────────────────────────────────────────────────────────────────────


async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)):
    """Verify the internal proxy token for Node.js → Python calls."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


# ── Request/Response Models ─────────────────────────────────────────────────


class ToolCallRequest(BaseModel):
    name: str
    arguments: dict[str, Any] = {}
    user_id: int
    tenant_id: str


class ToolCallResponse(BaseModel):
    ok: bool
    content: Optional[list[dict[str, Any]]] = None
    error: Optional[dict[str, str]] = None


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/tools")
async def list_tools(
    user_id: Optional[int] = None,
    x_proxy_token: Optional[str] = Header(None),
):
    """Return the list of available Python-native MCP tools.

    If user_id is provided and the user does not have an active Google
    connection, returns an empty tools list.
    """
    await _verify_proxy_token(x_proxy_token)

    tools = []
    if user_id is not None:
        has_google = await _check_provider_connection(user_id, "google")
        has_microsoft = await _check_provider_connection(user_id, "microsoft")
        if has_google:
            tools.extend(GOOGLE_DRIVE_TOOLS)
        if has_microsoft:
            tools.extend(ONEDRIVE_TOOLS)
    else:
        tools = GOOGLE_DRIVE_TOOLS + ONEDRIVE_TOOLS

    # Browser tools are always available (no OAuth needed)
    tools.extend(BROWSER_TOOLS)

    return {"tools": tools}


@router.post("/tools/call")
async def call_tool(
    body: ToolCallRequest,
    x_proxy_token: Optional[str] = Header(None),
):
    """Execute a specific MCP tool."""
    await _verify_proxy_token(x_proxy_token)

    handler = TOOL_HANDLERS.get(body.name)
    if not handler:
        return ToolCallResponse(
            ok=False,
            error={"code": "unknown_tool", "message": f"Tool '{body.name}' not found"},
        )

    try:
        # Build kwargs from the tool arguments + injected context
        kwargs = {**body.arguments, "user_id": body.user_id, "tenant_id": body.tenant_id}
        result = await handler(**kwargs)

        # Format as MCP content blocks
        if isinstance(result, dict):
            import json
            text = json.dumps(result, indent=2, default=str)
        else:
            text = str(result)

        return ToolCallResponse(
            ok=True,
            content=[{"type": "text", "text": text}],
        )

    except ToolError as e:
        return ToolCallResponse(
            ok=False,
            error={"code": e.code, "message": e.message},
        )
    except Exception as e:
        logger.error("mcp_tool_call_error tool=%s error=%s", body.name, str(e))
        return ToolCallResponse(
            ok=False,
            error={"code": "internal_error", "message": "An internal error occurred"},
        )


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _check_provider_connection(user_id: int, provider: str) -> bool:
    """Check if the user has an active OAuth connection for the given provider."""
    try:
        from sqlalchemy import select, and_
        from app.core.database import AsyncSessionLocal
        from app.models.oauth import OAuthConnection

        async with AsyncSessionLocal() as db:
            conn = await db.scalar(
                select(OAuthConnection).where(
                    and_(
                        OAuthConnection.user_id == user_id,
                        OAuthConnection.provider == provider,
                        OAuthConnection.status == "active",
                    )
                )
            )
            return conn is not None
    except Exception:
        logger.warning("Failed to check %s connection for user %d", provider, user_id)
        return False
