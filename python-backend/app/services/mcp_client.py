"""
Async MCP client — discovers and calls tools from external MCP servers.

Uses JSON-RPC protocol over HTTP with optional Bearer auth.
Includes SSRF protection and response caching.
"""

import ipaddress
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx
import structlog

logger = structlog.get_logger(__name__)

# SSRF protection (mirrors agency_tools.py)
_BLOCKED_HOSTS = {
    "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
    "169.254.169.254", "metadata.google.internal",
}

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
]


def _validate_mcp_url(url: str) -> str | None:
    """Validate MCP server URL against SSRF. Returns error string or None."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return f"Unsupported scheme: {parsed.scheme}"

        hostname = parsed.hostname or ""
        if hostname in _BLOCKED_HOSTS:
            return f"Blocked host: {hostname}"

        try:
            addr = ipaddress.ip_address(hostname)
            for network in _BLOCKED_NETWORKS:
                if addr in network:
                    return f"Blocked private IP: {hostname}"
        except ValueError:
            pass  # Not an IP literal — hostname

        return None
    except Exception as exc:
        return f"Invalid URL: {exc}"


@dataclass
class McpToolInfo:
    """Tool definition from an MCP server."""
    name: str
    description: str
    input_schema: dict = field(default_factory=dict)


# In-memory discovery cache: (tenant_id, url, token_hash) -> (tools, timestamp)
_discovery_cache: dict[str, tuple[list[McpToolInfo], float]] = {}
_CACHE_TTL_SECONDS = 60


def _normalize_tenant_id(tenant_id: str | int | None) -> str:
    """Normalize tenant_id for cache scoping."""
    if tenant_id is None:
        raise ValueError("tenant_id is required")
    normalized = str(tenant_id).strip()
    if not normalized:
        raise ValueError("tenant_id is required")
    return normalized


def _cache_key(tenant_id: str, url: str, token: str | None) -> str:
    """Generate cache key from tenant, URL, and token hash."""
    import hashlib
    token_hash = hashlib.sha256((token or "").encode()).hexdigest()[:16]
    return f"{tenant_id}|{url}|{token_hash}"


async def discover_tools(
    server_url: str,
    token: str | None = None,
    timeout: float = 10.0,
    tenant_id: str | int | None = None,
) -> list[McpToolInfo]:
    """Discover tools from an external MCP server via JSON-RPC tools/list.

    Args:
        server_url: Base URL of the MCP server.
        token: Optional Bearer token for auth.
        timeout: Request timeout in seconds.

    Returns:
        List of tool definitions. Empty list on connection error.
    """
    normalized_tenant_id = _normalize_tenant_id(tenant_id)
    normalized_url = server_url.strip().rstrip("/")

    validation_error = _validate_mcp_url(normalized_url)
    if validation_error:
        logger.warning(
            "mcp_discover_blocked",
            tenant_id=normalized_tenant_id,
            url=normalized_url,
            error=validation_error,
        )
        return []

    # F11: DNS resolution SSRF check — catch hostnames resolving to private IPs
    try:
        from app.services.mcp_client_manager import _resolve_and_validate_dns
        parsed_hostname = urlparse(normalized_url).hostname or ""
        await _resolve_and_validate_dns(parsed_hostname)
    except Exception as dns_exc:
        logger.warning(
            "mcp_discover_dns_blocked",
            tenant_id=normalized_tenant_id,
            url=normalized_url,
            error=str(dns_exc),
        )
        return []

    # Check cache
    key = _cache_key(normalized_tenant_id, normalized_url, token)
    cached = _discovery_cache.get(key)
    if cached:
        tools, ts = cached
        if time.time() - ts < _CACHE_TTL_SECONDS:
            return tools

    rpc_url = normalized_url
    if not rpc_url.endswith("/rpc"):
        rpc_url = f"{rpc_url}/rpc"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "tools/list",
                    "params": {},
                    "id": 1,
                },
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        if "error" in data:
            logger.warning(
                "mcp_discover_error",
                tenant_id=normalized_tenant_id,
                url=normalized_url,
                error=data["error"],
            )
            return []

        raw_tools = data.get("result", {}).get("tools", [])
        tools = [
            McpToolInfo(
                name=str(t.get("name", "")),
                description=str(t.get("description", "")),
                input_schema=t.get("inputSchema", {}),
            )
            for t in raw_tools
        ]

        # Cache results
        _discovery_cache[key] = (tools, time.time())
        return tools

    except Exception as exc:
        logger.warning(
            "mcp_discover_failed",
            tenant_id=normalized_tenant_id,
            url=normalized_url,
            error=str(exc),
        )
        return []


async def call_tool(
    server_url: str,
    tool_name: str,
    arguments: dict,
    token: str | None = None,
    timeout: float = 30.0,
    tenant_id: str | int | None = None,
) -> str:
    """Call a tool on an external MCP server via JSON-RPC tools/call.

    Args:
        server_url: Base URL of the MCP server.
        tool_name: Name of the tool to call.
        arguments: Tool input arguments.
        token: Optional Bearer token for auth.
        timeout: Request timeout in seconds.

    Returns:
        Tool result as a string. Returns error description on failure.
    """
    if tenant_id is None or not str(tenant_id).strip():
        return "MCP tool call blocked: tenant_id is required"

    normalized_tenant_id = str(tenant_id).strip()
    normalized_url = server_url.strip().rstrip("/")

    validation_error = _validate_mcp_url(normalized_url)
    if validation_error:
        logger.warning(
            "mcp_call_blocked",
            tenant_id=normalized_tenant_id,
            url=normalized_url,
            tool_name=tool_name,
            error=validation_error,
        )
        return f"MCP tool call blocked: {validation_error}"

    # F11: DNS resolution SSRF check
    try:
        from app.services.mcp_client_manager import _resolve_and_validate_dns
        parsed_hostname = urlparse(normalized_url).hostname or ""
        await _resolve_and_validate_dns(parsed_hostname)
    except Exception as dns_exc:
        logger.warning(
            "mcp_call_dns_blocked",
            tenant_id=normalized_tenant_id,
            url=normalized_url,
            tool_name=tool_name,
            error=str(dns_exc),
        )
        return f"MCP tool call blocked: DNS validation failed"

    rpc_url = normalized_url
    if not rpc_url.endswith("/rpc"):
        rpc_url = f"{rpc_url}/rpc"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "tools/call",
                    "params": {"name": tool_name, "arguments": arguments},
                    "id": 1,
                },
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        if "error" in data:
            err_msg = data["error"].get("message", "Unknown error")
            return f"MCP tool error: {err_msg}"

        result = data.get("result", {})
        return _extract_content(result)

    except httpx.TimeoutException:
        return f"MCP tool call timed out after {timeout}s"
    except Exception as exc:
        return f"MCP tool call failed: {exc}"


def _extract_content(result: dict) -> str:
    """Extract content from MCP response, handling text, image, and audio types.

    - text: returns the text directly
    - image: returns [image:{mimeType}] placeholder (base64 data too large for string)
    - audio: returns [audio:{mimeType}] placeholder
    """
    content_list = result.get("content", [])
    if not isinstance(content_list, list):
        return str(result)

    parts: list[str] = []
    for item in content_list:
        if not isinstance(item, dict):
            continue
        content_type = item.get("type", "text")
        if content_type == "text":
            parts.append(item.get("text", ""))
        elif content_type == "image":
            mime = item.get("mimeType", "image/png")
            parts.append(f"[image:{mime}]")
        elif content_type == "audio":
            mime = item.get("mimeType", "audio/wav")
            parts.append(f"[audio:{mime}]")
        else:
            parts.append(str(item))

    return "\n".join(parts) if parts else str(result)


def clear_discovery_cache() -> None:
    """Clear the tool discovery cache (for testing)."""
    _discovery_cache.clear()
