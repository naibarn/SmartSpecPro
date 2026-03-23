"""
MCP Cross-System Protection Layer (section-15).

Rate limiting, response wrapping, loop detection, and guardrail
integration for MCP tool calls.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constants ──

MAX_MCP_TOOL_CALLS_PER_TURN = 10
MAX_MCP_CALLS_PER_RUN = 50
MAX_MCP_CALLS_PER_TENANT_MINUTE = 200
MAX_RESULT_BYTES = 100_000  # 100KB truncation limit
MAX_CHAIN_LENGTH = 5
TRUNCATION_MARKER = "\n[MCP_RESPONSE_TRUNCATED]"


class McpToolError(Exception):
    """Typed error for MCP tool failures."""

    def __init__(self, error_type: str, message: str = "", retryable: bool = False):
        self.error_type = error_type
        self.retryable = retryable
        super().__init__(message or error_type)


def wrap_mcp_response(result: str, server_slug: str, tool_name: str) -> str:
    """Wrap MCP tool output with boundary tags to prevent prompt injection."""
    return f"[MCP_TOOL_RESULT: mcp.{server_slug}/{tool_name}]\n{result}\n[/MCP_TOOL_RESULT]"


def truncate_response(result: str, max_bytes: int = MAX_RESULT_BYTES) -> str:
    """Truncate MCP response to max size, appending marker if truncated."""
    if len(result.encode("utf-8", errors="replace")) <= max_bytes:
        return result
    # Truncate by chars (approximate), leave room for marker
    truncated = result[: max_bytes - len(TRUNCATION_MARKER)]
    return truncated + TRUNCATION_MARKER


class PerTurnCounter:
    """Per-tool-per-turn invocation counter (in-process, per execution)."""

    def __init__(self, max_calls: int = MAX_MCP_TOOL_CALLS_PER_TURN):
        self._counts: dict[str, int] = {}
        self._max_calls = max_calls

    def check_and_increment(self, tool_name: str) -> Optional[str]:
        """Returns error message if limit exceeded, None if OK."""
        count = self._counts.get(tool_name, 0) + 1
        self._counts[tool_name] = count
        if count > self._max_calls:
            return f"[MCP ERROR] Tool call limit exceeded for '{tool_name}' (max {self._max_calls}/turn)"
        return None

    def reset(self):
        self._counts.clear()


async def check_run_rate_limit(
    redis_client,
    run_id: str,
    max_calls: int = MAX_MCP_CALLS_PER_RUN,
    ttl: int = 3600,
) -> Optional[str]:
    """Check per-run MCP call counter. Returns error if exceeded."""
    if not redis_client or not run_id:
        return None
    key = f"mcp:rate:run:{run_id}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, ttl)
    if count > max_calls:
        return f"[MCP ERROR] Run MCP call limit exceeded ({max_calls} max)"
    return None


async def check_tenant_rate_limit(
    redis_client,
    tenant_id: str,
    max_calls: int = MAX_MCP_CALLS_PER_TENANT_MINUTE,
    window_seconds: int = 60,
) -> Optional[str]:
    """Check per-tenant MCP calls per minute. Returns error if exceeded."""
    if not redis_client or not tenant_id:
        return None
    key = f"mcp:rate:{tenant_id}:minute"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, window_seconds)
    if count > max_calls:
        return f"[MCP ERROR] Tenant MCP rate limit exceeded ({max_calls}/min)"
    return None


async def on_tenant_disabled(redis_client, tenant_id: str):
    """Clear MCP rate limit keys when a tenant is disabled."""
    if not redis_client or not tenant_id:
        return
    minute_key = f"mcp:rate:{tenant_id}:minute"
    await redis_client.delete(minute_key)
    # Pattern-delete run keys for this tenant (best effort)
    pattern = f"mcp:rate:run:{tenant_id}:*"
    cursor = 0
    while True:
        cursor, keys = await redis_client.scan(cursor, match=pattern, count=100)
        if keys:
            await redis_client.delete(*keys)
        if cursor == 0:
            break


def check_loop_detection(
    agency_run_chain: list[str],
    current_agency_id: str,
    max_chain_length: int = MAX_CHAIN_LENGTH,
) -> Optional[str]:
    """Detect circular or excessively deep cross-agency MCP call chains."""
    if current_agency_id in agency_run_chain:
        return (
            f"[MCP ERROR] Cross-boundary loop detected: "
            f"{' → '.join(agency_run_chain)} → {current_agency_id}"
        )
    if len(agency_run_chain) >= max_chain_length:
        return f"[MCP ERROR] Max agency call chain depth exceeded ({max_chain_length})"
    return None


def check_tool_chain_depth(
    current_depth: int,
    max_depth: int = 5,
) -> Optional[str]:
    """Check tool chain depth to prevent infinite MCP→skill→agency chains."""
    if current_depth >= max_depth:
        return f"[MCP ERROR] Max tool chain depth exceeded ({max_depth})"
    return None


def scrub_params(params: dict, secret_patterns: list[re.Pattern]) -> dict:
    """Scrub sensitive values from MCP tool parameters before sending."""
    scrubbed = {}
    for key, value in params.items():
        if isinstance(value, str):
            scrubbed_val = value
            for pattern in secret_patterns:
                scrubbed_val = pattern.sub("[REDACTED]", scrubbed_val)
            scrubbed[key] = scrubbed_val
        elif isinstance(value, dict):
            scrubbed[key] = scrub_params(value, secret_patterns)
        else:
            scrubbed[key] = value
    return scrubbed
