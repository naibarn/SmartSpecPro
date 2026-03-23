"""
MCP subsystem Prometheus metrics and health endpoint data.

Provides:
  - mcp_tool_call_duration_seconds histogram
  - mcp_tool_call_errors_total counter
  - mcp_stdio_processes_active gauge
  - mcp_oauth_token_refresh_total counter
  - get_mcp_health() for /health/mcp sub-endpoint
"""

from __future__ import annotations

from typing import Any

from prometheus_client import Counter, Gauge, Histogram

# ---------------------------------------------------------------------------
# Prometheus Metrics
# ---------------------------------------------------------------------------

mcp_tool_call_duration = Histogram(
    "mcp_tool_call_duration_seconds",
    "MCP tool call latency",
    ["server_id", "tool_name"],
)

mcp_tool_call_errors = Counter(
    "mcp_tool_call_errors_total",
    "MCP tool call errors",
    ["server_id", "error_type"],
)

mcp_stdio_processes = Gauge(
    "mcp_stdio_processes_active",
    "Active stdio processes",
    ["server_id"],
)

mcp_oauth_refresh = Counter(
    "mcp_oauth_token_refresh_total",
    "OAuth refresh attempts",
    ["server_id", "result"],
)


# ---------------------------------------------------------------------------
# Health Data
# ---------------------------------------------------------------------------

def get_mcp_health() -> dict[str, Any]:
    """Return MCP subsystem health data for /health/mcp.

    Returns:
        {
            "server_count": int,
            "active_connections": int,
            "stdio_process_count": int,
        }
    """
    try:
        from app.services.mcp_client_manager import get_mcp_client_manager
        manager = get_mcp_client_manager()
        active = len(manager._connections)
        stdio_count = sum(manager._stdio_counts.values())
    except Exception:
        active = 0
        stdio_count = 0

    return {
        "server_count": active,
        "active_connections": active,
        "stdio_process_count": stdio_count,
    }
