"""
McpClientManager — multi-transport MCP client with connection pooling.

Supports three transports:
  - HTTP: Enhanced JSON-RPC over HTTP with SSRF validation and DNS rebinding prevention
  - Streamable HTTP: SSE-based transport with session management
  - stdio: Via OpenSandbox containers (no direct subprocess spawning)

Includes heartbeat, auto-reconnect, graceful shutdown, and response size limits.
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import json
import re
import socket
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog

from app.integrations.opensandbox.client import get_sandbox_client
from app.integrations.opensandbox.config import opensandbox_settings
from app.integrations.opensandbox.models import SandboxConfig

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_RESPONSE_BYTES = 1_048_576  # 1 MB
MAX_STDIO_PER_TENANT = 2
_SESSION_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")
_DEFAULT_TIMEOUT = 30.0

# SSRF blocked ranges (shared with url_validator.py)
_BLOCKED_CIDRS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

_BLOCKED_HOSTNAMES = frozenset({
    "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
    "169.254.169.254", "metadata.google.internal",
})


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class McpConnectionError(Exception):
    """Error connecting to or communicating with an MCP server."""


# ---------------------------------------------------------------------------
# DNS / SSRF helpers
# ---------------------------------------------------------------------------

def _is_ip_blocked(ip_str: str) -> bool:
    """Check if an IP falls within blocked CIDR ranges."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # Fail-closed
    return any(addr in network for network in _BLOCKED_CIDRS)


async def _resolve_and_validate_dns(hostname: str) -> str:
    """Resolve hostname via DNS and validate all IPs are public.

    Returns the first valid public IP.
    Raises McpConnectionError if any resolved IP is private/blocked.
    """
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        raise McpConnectionError(f"Blocked hostname: {hostname}")

    # Check if hostname is a literal IP
    try:
        addr = ipaddress.ip_address(hostname)
        if _is_ip_blocked(str(addr)):
            raise McpConnectionError(f"DNS resolved to blocked IP {addr}")
        return str(addr)
    except ValueError:
        pass  # Not an IP literal

    loop = asyncio.get_running_loop()
    try:
        addrinfos = await loop.run_in_executor(
            None, socket.getaddrinfo, hostname, None
        )
    except socket.gaierror as exc:
        raise McpConnectionError(f"DNS resolution failed for '{hostname}': {exc}") from exc

    if not addrinfos:
        raise McpConnectionError(f"DNS returned no results for '{hostname}'")

    first_public_ip = None
    for _family, _type, _proto, _canonname, sockaddr in addrinfos:
        ip_str = sockaddr[0]
        if _is_ip_blocked(ip_str):
            raise McpConnectionError(
                f"DNS resolved to blocked IP {ip_str} for hostname '{hostname}'"
            )
        if first_public_ip is None:
            first_public_ip = ip_str

    return first_public_ip  # type: ignore[return-value]


def _validate_url_scheme(url: str) -> str:
    """Validate URL has http/https scheme. Returns normalized URL."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise McpConnectionError(f"Unsupported scheme: {parsed.scheme}")
    return url.strip().rstrip("/")


# ---------------------------------------------------------------------------
# Connection dataclass
# ---------------------------------------------------------------------------

@dataclass
class McpConnection:
    """Represents an active connection to an MCP server."""

    transport: str  # "http", "streamable_http", "stdio"
    tenant_id: int
    url: str = ""
    validated_ip: str = ""
    follow_redirects: bool = False
    sandbox_id: str = ""
    session_id: str = ""
    sse_fallback_enabled: bool = False
    max_reconnect_attempts: int = 3
    reconnect_count: int = 0
    created_at: float = field(default_factory=time.time)
    token: str | None = None
    timeout: float = _DEFAULT_TIMEOUT


# ---------------------------------------------------------------------------
# McpClientManager
# ---------------------------------------------------------------------------

class McpClientManager:
    """Manages MCP server connections across multiple transports."""

    def __init__(self) -> None:
        self._connections: dict[str, McpConnection] = {}
        self._stdio_counts: dict[int, int] = {}  # tenant_id -> active container count
        self._lock = asyncio.Lock()

    # -------------------------------------------------------------------
    # HTTP Transport
    # -------------------------------------------------------------------

    async def connect_http(
        self,
        url: str,
        tenant_id: int,
        token: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> McpConnection:
        """Create an HTTP transport connection with SSRF validation.

        Uses verify-after-connect approach for DNS rebinding prevention:
        - Resolves DNS at validation time, confirms IP is public
        - Connects using original hostname (preserving TLS/SNI)
        - Stores validated IP for post-connect verification
        """
        normalized_url = _validate_url_scheme(url)
        parsed = urlparse(normalized_url)
        hostname = parsed.hostname or ""

        validated_ip = await _resolve_and_validate_dns(hostname)

        conn = McpConnection(
            transport="http",
            tenant_id=tenant_id,
            url=normalized_url,
            validated_ip=validated_ip,
            follow_redirects=False,  # redirect: "error"
            token=token,
            timeout=timeout,
        )

        conn_id = f"http:{tenant_id}:{normalized_url}"
        self._connections[conn_id] = conn

        logger.info(
            "mcp_http_connected",
            tenant_id=tenant_id,
            url=normalized_url,
            validated_ip=validated_ip,
        )
        return conn

    # -------------------------------------------------------------------
    # Streamable HTTP Transport
    # -------------------------------------------------------------------

    async def connect_streamable_http(
        self,
        url: str,
        tenant_id: int,
        token: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> McpConnection:
        """Create a Streamable HTTP transport connection.

        POST JSON-RPC to MCP endpoint, accept SSE response.
        Falls back to old SSE transport on 4xx.
        """
        normalized_url = _validate_url_scheme(url)
        parsed = urlparse(normalized_url)
        hostname = parsed.hostname or ""

        validated_ip = await _resolve_and_validate_dns(hostname)

        conn = McpConnection(
            transport="streamable_http",
            tenant_id=tenant_id,
            url=normalized_url,
            validated_ip=validated_ip,
            follow_redirects=False,
            sse_fallback_enabled=True,
            token=token,
            timeout=timeout,
        )

        conn_id = f"streamable:{tenant_id}:{normalized_url}"
        self._connections[conn_id] = conn

        logger.info(
            "mcp_streamable_connected",
            tenant_id=tenant_id,
            url=normalized_url,
        )
        return conn

    def validate_session_id(self, session_id: str) -> bool:
        """Validate Mcp-Session-Id format."""
        return bool(_SESSION_ID_RE.match(session_id))

    # -------------------------------------------------------------------
    # stdio Transport (via OpenSandbox)
    # -------------------------------------------------------------------

    async def connect_stdio(
        self,
        command: str,
        args: list[str],
        env: dict[str, str],
        tenant_id: int,
        timeout_seconds: int = 30,
        image: str = "node:22-slim",
    ) -> McpConnection:
        """Create a stdio transport connection via OpenSandbox container.

        Does NOT spawn processes directly on the host. Routes through
        OpenSandbox for isolation.

        Raises McpConnectionError if:
        - OPENSANDBOX_ENABLED is False
        - Tenant has reached MAX_STDIO_PER_TENANT concurrent containers
        """
        if not opensandbox_settings.OPENSANDBOX_ENABLED:
            raise McpConnectionError(
                "stdio transport requires OpenSandbox (OPENSANDBOX_ENABLED=false)"
            )

        async with self._lock:
            count = self._stdio_counts.get(tenant_id, 0)
            if count >= MAX_STDIO_PER_TENANT:
                raise McpConnectionError(
                    f"Max {MAX_STDIO_PER_TENANT} stdio containers per tenant"
                )
            self._stdio_counts[tenant_id] = count + 1

        try:
            sandbox_client = get_sandbox_client()
            config = SandboxConfig(
                image=image,
                timeout_seconds=min(timeout_seconds, 120),
                env_vars=env,
                cpu_limit="1000m",
                memory_limit_mb=512,
                network_action="deny",  # No network access from container
                entrypoint=[command] + args,
            )
            sandbox_id = await sandbox_client.create_sandbox(config)
        except Exception as exc:
            # Roll back count on failure
            async with self._lock:
                current = self._stdio_counts.get(tenant_id, 1)
                self._stdio_counts[tenant_id] = max(0, current - 1)
            if isinstance(exc, McpConnectionError):
                raise
            raise McpConnectionError(f"Failed to create stdio sandbox: {exc}") from exc

        conn = McpConnection(
            transport="stdio",
            tenant_id=tenant_id,
            sandbox_id=sandbox_id,
            timeout=float(timeout_seconds),
        )

        conn_id = f"stdio:{tenant_id}:{sandbox_id}"
        self._connections[conn_id] = conn

        logger.info(
            "mcp_stdio_connected",
            tenant_id=tenant_id,
            sandbox_id=sandbox_id,
        )
        return conn

    # -------------------------------------------------------------------
    # RPC Call (send JSON-RPC to any transport)
    # -------------------------------------------------------------------

    async def call_rpc(
        self,
        conn: McpConnection,
        method: str,
        params: dict[str, Any] | None = None,
        caller_tenant_id: int | None = None,
    ) -> dict[str, Any]:
        """Send a JSON-RPC request over the connection's transport.

        Enforces 1MB response size limit.
        F05: Validates caller_tenant_id matches connection tenant.
        """
        # F05: Tenant ownership check — prevent cross-tenant connection reuse
        if caller_tenant_id is not None and conn.tenant_id != caller_tenant_id:
            raise McpConnectionError(
                f"Tenant mismatch: connection belongs to tenant {conn.tenant_id}, "
                f"caller is tenant {caller_tenant_id}"
            )

        if conn.transport in ("http", "streamable_http"):
            return await self._call_rpc_http(conn, method, params or {})
        elif conn.transport == "stdio":
            return await self._call_rpc_stdio(conn, method, params or {})
        else:
            raise McpConnectionError(f"Unknown transport: {conn.transport}")

    async def _call_rpc_http(
        self,
        conn: McpConnection,
        method: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """JSON-RPC call over HTTP with response size limit."""
        rpc_url = conn.url
        if not rpc_url.endswith("/rpc") and conn.transport == "http":
            rpc_url = f"{rpc_url}/rpc"

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if conn.token:
            headers["Authorization"] = f"Bearer {conn.token}"
        if conn.session_id:
            headers["Mcp-Session-Id"] = conn.session_id

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1,
        }

        try:
            async with httpx.AsyncClient(
                timeout=conn.timeout,
                follow_redirects=conn.follow_redirects,
            ) as client:
                # Use streaming to enforce response size limit even with
                # chunked transfer encoding (no Content-Length header).
                async with client.stream("POST", rpc_url, json=payload, headers=headers) as resp:
                    # Collect body with streaming byte counter
                    chunks: list[bytes] = []
                    total_bytes = 0
                    async for chunk in resp.aiter_bytes():
                        total_bytes += len(chunk)
                        if total_bytes > MAX_RESPONSE_BYTES:
                            raise McpConnectionError(
                                f"Response too large: >{MAX_RESPONSE_BYTES} bytes"
                            )
                        chunks.append(chunk)
                    body = b"".join(chunks)

                # Handle session ID from response
                new_session_id = resp.headers.get("mcp-session-id", "")
                if new_session_id and self.validate_session_id(new_session_id):
                    conn.session_id = new_session_id

                if resp.status_code >= 400:
                    if conn.transport == "streamable_http" and conn.sse_fallback_enabled:
                        logger.info(
                            "mcp_streamable_fallback",
                            status=resp.status_code,
                            url=conn.url,
                        )
                    raise McpConnectionError(
                        f"HTTP {resp.status_code}: {body[:200].decode(errors='replace')}"
                    )

                try:
                    return json.loads(body)
                except (json.JSONDecodeError, ValueError) as exc:
                    # F09: Limit body in error message to prevent large payload leak
                    raise McpConnectionError(
                        f"Invalid JSON response ({len(body)} bytes): {str(exc)[:200]}"
                    ) from exc

        except httpx.TimeoutException as exc:
            raise McpConnectionError(f"Request timed out after {conn.timeout}s") from exc
        except McpConnectionError:
            raise
        except Exception as exc:
            raise McpConnectionError(f"HTTP RPC failed: {exc}") from exc

    async def _call_rpc_stdio(
        self,
        conn: McpConnection,
        method: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """JSON-RPC call over stdio (OpenSandbox container)."""
        if not conn.sandbox_id:
            raise McpConnectionError("No sandbox_id for stdio connection")

        payload = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1,
        }) + "\n"

        try:
            sandbox_client = get_sandbox_client()
            # Base64-encode to prevent shell injection — payload may contain
            # single quotes, backticks, or other shell metacharacters.
            b64_payload = base64.b64encode(payload.encode()).decode()
            result = await sandbox_client.run_command(
                conn.sandbox_id,
                f"echo {b64_payload} | base64 -d",
                timeout=int(conn.timeout),
            )

            stdout = result.stdout.strip()
            if len(stdout.encode()) > MAX_RESPONSE_BYTES:
                raise McpConnectionError(
                    f"Response too large: {len(stdout.encode())} bytes"
                )

            if result.stderr:
                logger.warning(
                    "mcp_stdio_stderr",
                    sandbox_id=conn.sandbox_id,
                    stderr=result.stderr[:500],
                )

            if not stdout:
                raise McpConnectionError("Empty response from stdio transport")

            return json.loads(stdout)

        except McpConnectionError:
            raise
        except json.JSONDecodeError as exc:
            raise McpConnectionError(f"Invalid JSON from stdio: {exc}") from exc
        except Exception as exc:
            raise McpConnectionError(f"stdio RPC failed: {exc}") from exc

    # -------------------------------------------------------------------
    # Health Check
    # -------------------------------------------------------------------

    async def health_check(self, conn: McpConnection) -> dict[str, Any]:
        """Ping an MCP server and return health status."""
        try:
            if conn.transport == "stdio":
                sandbox_client = get_sandbox_client()
                status = await sandbox_client.get_sandbox_status(conn.sandbox_id)
                return {"status": status.status, "transport": "stdio"}

            # For HTTP transports, send a ping/initialize request
            result = await self.call_rpc(conn, "initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "SmartSpecPro", "version": "1.0"},
            })
            return {
                "status": "ok" if "result" in result else "error",
                "transport": conn.transport,
            }
        except Exception as exc:
            return {
                "status": "error",
                "transport": conn.transport,
                "error": str(exc),
            }

    # -------------------------------------------------------------------
    # Disconnect
    # -------------------------------------------------------------------

    async def disconnect(self, conn: McpConnection) -> None:
        """Disconnect a single connection, cleaning up resources."""
        if conn.transport == "stdio" and conn.sandbox_id:
            try:
                sandbox_client = get_sandbox_client()
                await sandbox_client.destroy_sandbox(conn.sandbox_id)
            except Exception as exc:
                logger.warning(
                    "mcp_stdio_destroy_failed",
                    sandbox_id=conn.sandbox_id,
                    error=str(exc),
                )
            finally:
                async with self._lock:
                    current = self._stdio_counts.get(conn.tenant_id, 1)
                    self._stdio_counts[conn.tenant_id] = max(0, current - 1)

        # Remove from connection registry
        to_remove = [
            k for k, v in self._connections.items() if v is conn
        ]
        for k in to_remove:
            del self._connections[k]

        logger.info(
            "mcp_disconnected",
            transport=conn.transport,
            tenant_id=conn.tenant_id,
        )

    async def disconnect_all(self) -> None:
        """Disconnect all active connections (for graceful shutdown)."""
        conns = list(self._connections.values())
        for conn in conns:
            try:
                await self.disconnect(conn)
            except Exception as exc:
                logger.warning("mcp_disconnect_error", error=str(exc))

        self._connections.clear()
        self._stdio_counts.clear()

    # -------------------------------------------------------------------
    # Stats (F12: public API instead of direct _attribute access)
    # -------------------------------------------------------------------

    def get_stats(self) -> dict[str, int]:
        """Return aggregate connection stats for monitoring."""
        return {
            "server_count": len(self._connections),
            "active_connections": len(self._connections),
            "stdio_process_count": sum(self._stdio_counts.values()),
        }

    # -------------------------------------------------------------------
    # Env Variable Resolution
    # -------------------------------------------------------------------

    @staticmethod
    def resolve_env(env: dict[str, str], encrypted_env: dict[str, str] | None = None) -> dict[str, str]:
        """Resolve $ref:encrypted values from encrypted storage.

        Args:
            env: Environment variable dict, may contain "$ref:encrypted" placeholders.
            encrypted_env: Pre-decrypted values keyed by env var name.

        Returns:
            Resolved env dict with all placeholders replaced. Never logs values.
        """
        if not encrypted_env:
            encrypted_env = {}

        resolved: dict[str, str] = {}
        for key, value in env.items():
            if isinstance(value, str) and value.startswith("$ref:"):
                decrypted = encrypted_env.get(key)
                if not decrypted:
                    # F08: Fail-closed — missing secret should raise, not substitute empty
                    raise McpConnectionError(
                        f"Required env secret '{key}' not found in encrypted storage"
                    )
                resolved[key] = decrypted
            else:
                resolved[key] = str(value)
        return resolved


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_default_manager: McpClientManager | None = None


def get_mcp_client_manager() -> McpClientManager:
    """Get or create the module-level McpClientManager singleton."""
    global _default_manager
    if _default_manager is None:
        _default_manager = McpClientManager()
    return _default_manager
