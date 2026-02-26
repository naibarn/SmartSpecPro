"""HTTP Request Executor - Execute HTTP requests with security controls."""

import ipaddress
import json
import logging
from typing import Any
from urllib.parse import urlparse

import aiohttp

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class HTTPExecutor:
    """
    Execute HTTP requests with comprehensive security controls.

    When OpenSandbox is enabled, external requests route through the sandbox
    for egress control. Internal/trusted requests use direct aiohttp.

    Security Features:
    - Block internal/private IP addresses
    - Enforce timeout limits
    - Limit redirect follows
    - Validate SSL certificates
    """

    # Blocked hosts (exact matches)
    BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"}

    # Blocked networks (CIDR notation)
    BLOCKED_NETWORKS = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("fc00::/7"),  # IPv6 unique local
        ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
    ]

    MAX_REDIRECTS = 5
    DEFAULT_TIMEOUT = 30
    MAX_TIMEOUT = 300  # 5 minutes
    MAX_RESPONSE_SIZE = 10 * 1024 * 1024  # 10MB

    def _is_sandbox_enabled(self) -> bool:
        """Check if sandbox execution is enabled."""
        try:
            from app.integrations.opensandbox.config import opensandbox_settings
            return opensandbox_settings.is_enabled
        except Exception:
            return False

    def _is_external_url(self, url: str) -> bool:
        """Check if URL targets an external service (not internal)."""
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname
            if not hostname:
                return False

            # Internal hosts are NOT external
            if hostname.lower() in self.BLOCKED_HOSTS:
                return False

            # Check if it's an internal IP
            try:
                ip = ipaddress.ip_address(hostname)
                for network in self.BLOCKED_NETWORKS:
                    if ip in network:
                        return False
            except ValueError:
                pass  # Not an IP, is a hostname

            return True
        except Exception:
            return False

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute HTTP request with security controls."""
        url = data.inputs.get("url")
        method = data.inputs.get("method", "GET").upper()
        headers = data.inputs.get("headers", {})
        body = data.inputs.get("body")
        query_params = data.inputs.get("query_params", {})
        timeout = min(
            data.inputs.get("timeout", self.DEFAULT_TIMEOUT), self.MAX_TIMEOUT
        )
        allow_redirects = data.inputs.get("allow_redirects", True)

        # Route external requests through sandbox when enabled
        if self._is_sandbox_enabled() and self._is_external_url(url):
            try:
                return await self._execute_via_sandbox(
                    url, method, headers, body, query_params, timeout, context
                )
            except Exception as e:
                logger.warning(
                    "Sandbox HTTP execution failed, falling back to direct: %s",
                    str(e),
                )

        # Legacy: direct aiohttp path
        return await self._execute_direct(
            url, method, headers, body, query_params, timeout, allow_redirects
        )

    async def _execute_via_sandbox(
        self,
        url: str,
        method: str,
        headers: dict,
        body: Any,
        query_params: dict,
        timeout: int,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute HTTP request via sandbox for egress control."""
        from app.integrations.opensandbox.client import get_sandbox_client

        client = get_sandbox_client()

        # Build curl command for sandbox execution
        cmd_parts = ["curl", "-s", "-w", r"\n%{http_code}", "-X", method]

        for k, v in headers.items():
            cmd_parts.extend(["-H", f"{k}: {v}"])

        if body is not None:
            if isinstance(body, dict):
                cmd_parts.extend(["-d", json.dumps(body)])
                if "content-type" not in {k.lower() for k in headers}:
                    cmd_parts.extend(["-H", "Content-Type: application/json"])
            else:
                cmd_parts.extend(["-d", str(body)])

        if query_params:
            qs = "&".join(f"{k}={v}" for k, v in query_params.items())
            url = f"{url}?{qs}" if "?" not in url else f"{url}&{qs}"

        cmd_parts.extend(["--max-time", str(timeout)])
        cmd_parts.append(url)

        response = await client.run_command(
            command=" ".join(cmd_parts),
            profile_slug="browser-default",
            timeout_seconds=timeout + 10,
        )

        stdout = response.get("stdout", "")
        lines = stdout.rstrip().rsplit("\n", 1)

        response_body = lines[0] if len(lines) > 0 else ""
        status_code = int(lines[1]) if len(lines) > 1 else 0

        # Try parsing JSON response
        try:
            parsed_body = json.loads(response_body)
        except (json.JSONDecodeError, ValueError):
            parsed_body = response_body

        return {
            "status_code": status_code,
            "headers": {},
            "body": parsed_body,
            "url": url,
        }

    async def _execute_direct(
        self,
        url: str,
        method: str,
        headers: dict,
        body: Any,
        query_params: dict,
        timeout: int,
        allow_redirects: bool = True,
    ) -> dict[str, Any]:
        """Execute HTTP request directly via aiohttp (legacy path)."""
        # Validate URL
        self._validate_url(url)

        # Prepare body
        request_body = self._prepare_body(body, headers)

        # Execute request
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method=method,
                url=url,
                headers=headers,
                params=query_params if query_params else None,
                data=request_body,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=allow_redirects,
                max_redirects=self.MAX_REDIRECTS if allow_redirects else 0,
                ssl=True,  # Enforce SSL verification
            ) as response:
                # Check response size
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > self.MAX_RESPONSE_SIZE:
                    raise ValueError(
                        f"Response too large: {content_length} bytes (max {self.MAX_RESPONSE_SIZE})"
                    )

                # Read response
                content_type = response.headers.get("content-type", "").lower()

                if "application/json" in content_type:
                    try:
                        response_body = await response.json()
                    except Exception:
                        response_body = await response.text()
                else:
                    response_body = await response.text()

                return {
                    "status_code": response.status,
                    "headers": dict(response.headers),
                    "body": response_body,
                    "url": str(response.url),
                }

    def _validate_url(self, url: str) -> None:
        """Validate URL for security."""
        parsed = urlparse(url)

        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid URL scheme: {parsed.scheme}")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL must have a hostname")

        # Check blocked hosts (case-insensitive)
        if hostname.lower() in self.BLOCKED_HOSTS:
            raise ValueError(f"Access to {hostname} is not allowed")

        # Check IP addresses
        try:
            ip = ipaddress.ip_address(hostname)
            for network in self.BLOCKED_NETWORKS:
                if ip in network:
                    raise ValueError(f"Access to IP {hostname} is not allowed")
        except ValueError:
            # Not an IP, is a hostname - allow (DNS resolution will happen)
            pass

    def _prepare_body(self, body: Any, headers: dict) -> Any:
        """Prepare request body based on content type."""
        if body is None:
            return None

        content_type = headers.get("content-type", "").lower()

        if "application/json" in content_type and isinstance(body, dict):
            return aiohttp.JsonPayload(body)

        return body
