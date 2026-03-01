"""
SSPToolBridge -- bridges SmartSpecPro tools to agency-swarm's BaseTool interface.

Tool routing by risk level:
- low: always allowed, direct HTTP call
- medium: allowed only if whitelisted, direct HTTP call
- high: allowed only if whitelisted, dispatch to OpenSandbox

Tool classes are created via AgencySwarmAdapter.create_tool_class() to maintain
the adapter isolation pattern (only the adapter imports from agency-swarm).

Whitelist enforcement returns a user-friendly error string (not exception)
so the agent can gracefully explain the denial.
"""

import ipaddress
import os
from urllib.parse import urlparse

import httpx
import structlog
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.services.agency_audit import log_agency_event

logger = structlog.get_logger(__name__)

# ── SSRF Protection ──────────────────────────────────────────────────────

_BLOCKED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254",  # Cloud metadata
    "metadata.google.internal",
}

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


_INTERNAL_SERVICE_URL = os.getenv("SMARTSPEC_INTERNAL_URL", "http://127.0.0.1:3000")

# Builtin tool ID → internal endpoint path suffix
_BUILTIN_ENDPOINTS: dict[str, str] = {
    "builtin-rag-knowledge": "/api/internal/tools/rag-knowledge",
    "builtin-skill-executor": "/api/internal/tools/skill-executor",
    "builtin-web-search": "/api/internal/tools/web-search",
    "builtin-http-request": "/api/internal/tools/http-request",
    "builtin-email-notify": "/api/internal/tools/email-notify",
    "builtin-webhook": "/api/internal/tools/webhook",
    "builtin-slack-message": "/api/internal/tools/slack-message",
    "builtin-document-search": "/api/internal/tools/document-search",
    "builtin-voice": "/api/internal/tools/voice",
    "builtin-browser": "/api/internal/tools/browser",
}

_BUILTIN_RISK_LEVELS: dict[str, str] = {
    "builtin-web-search": "medium",
    "builtin-http-request": "medium",
    "builtin-skill-executor": "medium",
    "builtin-webhook": "medium",
    "builtin-rag-knowledge": "low",
    "builtin-email-notify": "low",
    "builtin-slack-message": "low",
    "builtin-document-search": "low",
    "builtin-voice": "medium",
    "builtin-browser": "high",
}


def _validate_tool_url(url: str) -> None:
    """Validate that a tool endpoint URL is safe (no SSRF).

    Raises ValueError if the URL targets a private/internal address.
    Internal service URLs (SMARTSPEC_INTERNAL_URL) are always allowed.
    """
    # Allow the configured internal service URL explicitly
    if url.startswith(_INTERNAL_SERVICE_URL):
        return

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")

    hostname = parsed.hostname or ""
    if hostname in _BLOCKED_HOSTS:
        raise ValueError(f"Blocked host: {hostname}")

    # Check if hostname resolves to a private IP
    try:
        addr = ipaddress.ip_address(hostname)
        for network in _BLOCKED_NETWORKS:
            if addr in network:
                raise ValueError(f"Blocked private IP: {hostname}")
    except ValueError as exc:
        if "Blocked" in str(exc):
            raise
        # Not an IP literal — hostname. Allow it (DNS could resolve to
        # private IP, but we block the known dangerous hostnames above.
        # Full DNS resolution check would require the async SSRFGuard).


class ToolConfig(BaseModel):
    """Configuration for a bridged tool."""

    tool_id: str
    tool_type: str  # builtin / skill / sandbox / custom
    risk_level: str  # low / medium / high
    requires_approval: bool
    endpoint_url: str | None = None
    config: dict[str, Any] = {}


def _make_run_func(tool_config: ToolConfig, whitelist: set[str]):
    """Create a run function closure for a tool bridge."""
    captured_config = tool_config
    captured_whitelist = whitelist

    def run_func(tool_instance) -> str:
        config = captured_config

        # Whitelist check for medium and high risk
        if config.risk_level in ("medium", "high"):
            if config.tool_id not in captured_whitelist:
                logger.warning(
                    "agency_tool_blocked",
                    tool_id=config.tool_id,
                    risk_level=config.risk_level,
                )
                log_agency_event(
                    "agency_tool_failed",
                    tool_name=config.tool_id,
                    risk_level=config.risk_level,
                    metadata={"reason": "not_in_whitelist"},
                )
                return (
                    f"Tool '{config.tool_id}' is not authorized for this agency. "
                    f"Only whitelisted tools can be used."
                )

        # Audit: tool called
        log_agency_event(
            "agency_tool_called",
            tool_name=config.tool_id,
            risk_level=config.risk_level,
        )

        query = getattr(tool_instance, "query", "")

        # Route based on risk level
        if config.risk_level == "high":
            result = _execute_sandbox(config, query)
        else:
            result = _execute_http(config, query)

        # Audit: log tool failure if result indicates error
        if result.startswith("Tool execution failed") or result.startswith("Sandbox execution failed"):
            log_agency_event(
                "agency_tool_failed",
                tool_name=config.tool_id,
                risk_level=config.risk_level,
                error_message=result[:200],
            )

        return result

    return run_func


def _execute_http(config: ToolConfig, query: str) -> str:
    """Execute via direct HTTP call to service endpoint."""
    if not config.endpoint_url:
        return f"Tool '{config.tool_id}' has no endpoint configured."

    try:
        _validate_tool_url(config.endpoint_url)
    except ValueError as exc:
        logger.warning("agency_tool_ssrf_blocked", tool_id=config.tool_id, url=config.endpoint_url, reason=str(exc))
        return f"Tool '{config.tool_id}' has an invalid or blocked endpoint URL."

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                config.endpoint_url,
                json={"query": query, **config.config},
            )
            if resp.status_code == 200:
                return resp.text
            return f"Tool error (HTTP {resp.status_code}): {resp.text[:200]}"
    except Exception as exc:
        logger.error(
            "agency_tool_http_error",
            tool_id=config.tool_id,
            error=str(exc),
        )
        return f"Tool execution failed: {str(exc)[:200]}"


def _execute_sandbox(config: ToolConfig, query: str) -> str:
    """Execute via OpenSandbox dispatch."""
    if not config.endpoint_url:
        return f"Tool '{config.tool_id}' has no sandbox endpoint configured."

    try:
        _validate_tool_url(config.endpoint_url)
    except ValueError as exc:
        logger.warning("agency_tool_ssrf_blocked", tool_id=config.tool_id, url=config.endpoint_url, reason=str(exc))
        return f"Tool '{config.tool_id}' has an invalid or blocked endpoint URL."

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                config.endpoint_url,
                json={
                    "tool_id": config.tool_id,
                    "input": query,
                    **config.config,
                },
            )
            if resp.status_code == 200:
                return resp.text
            return f"Sandbox error (HTTP {resp.status_code}): {resp.text[:200]}"
    except Exception as exc:
        logger.error(
            "agency_tool_sandbox_error",
            tool_id=config.tool_id,
            error=str(exc),
        )
        return f"Sandbox execution failed: {str(exc)[:200]}"


def create_tool_bridge(
    tool_config: ToolConfig,
    whitelist: set[str],
    adapter=None,
) -> type:
    """Create a tool bridge class for agency-swarm.

    If an adapter is provided, uses adapter.create_tool_class() which returns
    a proper BaseTool subclass. Otherwise falls back to a plain BaseModel
    (for testing without agency-swarm installed).

    Args:
        tool_config: Tool configuration.
        whitelist: Set of allowed tool IDs for this agency.
        adapter: Optional AgencySwarmAdapter instance.

    Returns:
        A tool class for agency-swarm.
    """
    run_func = _make_run_func(tool_config, whitelist)
    safe_name = tool_config.tool_id.replace("-", "_").replace(".", "_")

    if adapter is not None:
        tool_cls = adapter.create_tool_class(
            tool_name=safe_name,
            tool_description=f"SSP Tool: {tool_config.tool_id}",
            run_func=run_func,
        )
    else:
        # Fallback for testing: plain BaseModel with run()
        class _FallbackTool(BaseModel):
            query: str = Field(default="", description="Input for the tool")

            def run(self) -> str:
                return run_func(self)

        _FallbackTool.__name__ = f"SSPTool_{safe_name}"
        _FallbackTool.__qualname__ = f"SSPTool_{safe_name}"
        tool_cls = _FallbackTool

    # Store config as accessible attribute for introspection/tests
    tool_cls._tool_config = tool_config  # type: ignore[attr-defined]
    return tool_cls


async def resolve_tools_for_agent(
    db: AsyncSession,
    agent_id: str,
    agency_whitelist: set[str],
    adapter=None,
) -> list[type]:
    """Resolve and construct tool bridges for a specific agent.

    Queries agency_agent_tools (LEFT JOIN agency_tools) to get tool configs.
    Builtin tools may not have a row in agency_tools — LEFT JOIN handles that.
    Per-agent toolConfig (instance_config) is merged over the base tool config.

    Args:
        db: Database session.
        agent_id: The agent's ID.
        agency_whitelist: Set of tool IDs allowed for this agency.
        adapter: Optional AgencySwarmAdapter for creating BaseTool subclasses.

    Returns:
        List of tool bridge classes (not instances).
    """
    query = text("""
        SELECT
            aat."toolId" as tool_id,
            COALESCE(t."toolType", 'builtin') as tool_type,
            COALESCE(t."riskLevel", 'low') as risk_level,
            COALESCE(t."requiresApproval", false) as requires_approval,
            t.config as base_config,
            aat."toolConfig" as instance_config
        FROM agency_agent_tools aat
        LEFT JOIN agency_tools t ON t.id = aat."toolId"
        WHERE aat."agentId" = :agent_id
    """)

    result = await db.execute(query, {"agent_id": agent_id})
    rows = result.all()

    tool_classes: list[type] = []
    for row in rows:
        tool_id: str = row.tool_id

        # Merge base config (from agency_tools) with instance config (per-agent toolConfig).
        # Instance config takes priority — it carries runtime overrides like collectionId,
        # skillSlug, webhookUrl, etc. set in AgentPropertyPanel's ToolPicker.
        base_config: dict[str, Any] = row.base_config if isinstance(row.base_config, dict) else {}
        instance_config: dict[str, Any] = row.instance_config if isinstance(row.instance_config, dict) else {}
        merged_config = {**base_config, **instance_config}

        # endpoint_url may live in config or be derived from the builtin tool ID
        endpoint_url: str | None = merged_config.pop("endpoint_url", None)
        if endpoint_url is None and tool_id in _BUILTIN_ENDPOINTS:
            endpoint_url = _INTERNAL_SERVICE_URL + _BUILTIN_ENDPOINTS[tool_id]

        # For builtin tools not in agency_tools, infer risk level from our table
        risk_level: str = row.risk_level or _BUILTIN_RISK_LEVELS.get(tool_id, "low")

        config = ToolConfig(
            tool_id=tool_id,
            tool_type=row.tool_type or "builtin",
            risk_level=risk_level,
            requires_approval=bool(row.requires_approval),
            endpoint_url=endpoint_url,
            config=merged_config,
        )
        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter)
        tool_classes.append(tool_cls)

    logger.info(
        "agency_tools_resolved",
        agent_id=agent_id,
        tool_count=len(tool_classes),
    )

    return tool_classes
