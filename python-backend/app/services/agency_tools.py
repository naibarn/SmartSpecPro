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

import httpx
import structlog
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

logger = structlog.get_logger(__name__)


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
                return (
                    f"Tool '{config.tool_id}' is not authorized for this agency. "
                    f"Only whitelisted tools can be used."
                )

        query = getattr(tool_instance, "query", "")

        # Route based on risk level
        if config.risk_level == "high":
            return _execute_sandbox(config, query)
        else:
            return _execute_http(config, query)

    return run_func


def _execute_http(config: ToolConfig, query: str) -> str:
    """Execute via direct HTTP call to service endpoint."""
    if not config.endpoint_url:
        return f"Tool '{config.tool_id}' has no endpoint configured."

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

    Queries agency_agent_tools and agency_tools to get tool configs,
    then creates tool bridge classes for each tool.

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
            t.id as tool_id,
            t.name,
            t.description,
            t."toolType" as tool_type,
            t."riskLevel" as risk_level,
            t."requiresApproval" as requires_approval,
            t.config
        FROM agency_agent_tools aat
        JOIN agency_tools t ON t.id = aat."toolId"
        WHERE aat."agentId" = :agent_id
    """)

    result = await db.execute(query, {"agent_id": agent_id})
    rows = result.all()

    tool_classes: list[type] = []
    for row in rows:
        # Extract endpoint_url from config JSON if present
        raw_config = row.config or {}
        endpoint_url = None
        if isinstance(raw_config, dict):
            endpoint_url = raw_config.pop("endpoint_url", None)

        config = ToolConfig(
            tool_id=row.tool_id,
            tool_type=row.tool_type or "builtin",
            risk_level=row.risk_level or "low",
            requires_approval=bool(row.requires_approval),
            endpoint_url=endpoint_url,
            config=raw_config if isinstance(raw_config, dict) else {},
        )
        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter)
        tool_classes.append(tool_cls)

    logger.info(
        "agency_tools_resolved",
        agent_id=agent_id,
        tool_count=len(tool_classes),
    )

    return tool_classes
