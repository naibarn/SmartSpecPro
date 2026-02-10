# HTTP Request Executor -- Implementation Plan

## Problem Statement

The workflow engine requires an `http_request` node that allows workflows to make outbound HTTP requests to external APIs. This is a Priority 1 missing node. Users need to call external REST APIs, webhooks, and data sources as part of automated workflow pipelines.

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/orchestrator/node_executors/io_executors/__init__.py` | **CREATE** | Package init (empty) |
| `python-backend/app/orchestrator/node_executors/io_executors/ssrf_guard.py` | **CREATE** | SSRF protection module -- DNS resolution, IP blocklist, port blocklist |
| `python-backend/app/orchestrator/node_executors/io_executors/http_request_executor.py` | **CREATE** | HTTP Request node executor |
| `python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Add `http_request` NodeTypeSpec registration |
| `python-backend/tests/test_node_executors/__init__.py` | **CREATE** | Test package init |
| `python-backend/tests/test_node_executors/test_http_request_executor.py` | **CREATE** | Unit tests |
| `apps/web/client/src/lib/workflow/useNodeRegistry.ts` | **MODIFY** | Add `"integrations"` to the `category` union type |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSRF to internal services | **CRITICAL** | SSRFGuard with DNS resolution + IP blocklist + port blocklist |
| Credential leakage in logs | **HIGH** | Header redaction for Authorization, Cookie, X-API-Key |
| Denial of service via slow target | **MEDIUM** | Enforce timeout (max 300s), response size cap (10MB) |
| DNS rebinding attacks | **MEDIUM** | Resolve DNS before request, compare resolved IP against blocklist |
| Excessive outbound traffic | **LOW** | Rate limiting at orchestrator level (existing) |

---

## File 1: `io_executors/__init__.py`

**Path:** `python-backend/app/orchestrator/node_executors/io_executors/__init__.py`

```python
"""I/O node executors -- HTTP, Database, Storage, Notification."""
```

---

## File 2: `io_executors/ssrf_guard.py`

**Path:** `python-backend/app/orchestrator/node_executors/io_executors/ssrf_guard.py`

### Purpose

Reusable SSRF protection that validates URLs before any outbound HTTP request. Performs DNS resolution to catch DNS rebinding and validates resolved IPs against a blocklist of private/reserved ranges.

### Class Structure

```python
"""SSRF protection for outbound HTTP requests."""
import ipaddress
import socket
from urllib.parse import urlparse
from typing import Any

import structlog

logger = structlog.get_logger()


class SSRFGuard:
    """
    Validates URLs to prevent Server-Side Request Forgery (SSRF).

    Blocks:
    - Private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    - Loopback: 127.0.0.0/8, ::1
    - Link-local: 169.254.0.0/16 (AWS/GCP metadata endpoint)
    - Zero address: 0.0.0.0
    - Known internal service ports: 5432, 6379, 3306, 27017, 9200, 2379
    - Non-HTTP schemes: ftp://, file://, gopher://, etc.

    Enterprise tenants can allowlist specific hostnames.
    """

    # Private and reserved IP networks that must be blocked
    BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("100.64.0.0/10"),   # CGN
        ipaddress.ip_network("192.0.0.0/24"),     # IETF protocol assignments
        ipaddress.ip_network("192.0.2.0/24"),     # TEST-NET-1
        ipaddress.ip_network("198.51.100.0/24"),  # TEST-NET-2
        ipaddress.ip_network("203.0.113.0/24"),   # TEST-NET-3
        ipaddress.ip_network("224.0.0.0/4"),      # Multicast
        ipaddress.ip_network("240.0.0.0/4"),      # Reserved
        ipaddress.ip_network("255.255.255.255/32"),
        # IPv6
        ipaddress.ip_network("::1/128"),          # Loopback
        ipaddress.ip_network("fc00::/7"),         # Unique local
        ipaddress.ip_network("fe80::/10"),        # Link-local
    ]

    # Ports for common internal services that should never be hit
    BLOCKED_PORTS: set[int] = {
        5432,   # PostgreSQL
        3306,   # MySQL
        6379,   # Redis
        27017,  # MongoDB
        9200,   # Elasticsearch
        2379,   # etcd
        8500,   # Consul
        11211,  # Memcached
    }

    ALLOWED_SCHEMES: set[str] = {"http", "https"}

    def __init__(self, tenant_allowlist: list[str] | None = None):
        """
        Args:
            tenant_allowlist: List of hostnames that bypass SSRF checks
                              (for enterprise tenants with internal APIs).
        """
        self.tenant_allowlist: set[str] = set(tenant_allowlist or [])

    def is_blocked_ip(self, ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
        """Check if an IP address falls within any blocked network range."""
        for network in self.BLOCKED_NETWORKS:
            if ip in network:
                return True
        return False

    async def _resolve_dns(self, hostname: str) -> list[str]:
        """
        Resolve hostname to IP addresses.

        Uses socket.getaddrinfo (sync, but called in executor thread).
        Returns list of resolved IP strings.
        """
        import asyncio
        loop = asyncio.get_event_loop()
        addrs = await loop.run_in_executor(
            None,
            lambda: socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM),
        )
        return list({addr[4][0] for addr in addrs})

    async def validate_url(self, url: str) -> str:
        """
        Validate a URL is safe for outbound requests.

        Args:
            url: The URL to validate.

        Returns:
            The validated URL (unchanged if safe).

        Raises:
            ValueError: If the URL is blocked (SSRF risk).
        """
        parsed = urlparse(url)

        # 1. Scheme check
        if parsed.scheme not in self.ALLOWED_SCHEMES:
            raise ValueError(
                f"Blocked URL scheme '{parsed.scheme}'. Only HTTP/HTTPS allowed."
            )

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL has no hostname.")

        # 2. Port check
        port = parsed.port
        if port and port in self.BLOCKED_PORTS:
            raise ValueError(
                f"Blocked port {port} -- known internal service port."
            )

        # 3. Hostname literal check (before DNS)
        #    Catch http://127.0.0.1, http://[::1], http://0.0.0.0
        try:
            ip_obj = ipaddress.ip_address(hostname)
            if self.is_blocked_ip(ip_obj):
                raise ValueError(
                    f"Blocked: {hostname} resolves to private/reserved IP."
                )
        except ValueError as e:
            if "Blocked" in str(e):
                raise
            # Not an IP literal, it's a hostname -- continue to DNS resolution

        # 4. Check against tenant allowlist
        if hostname in self.tenant_allowlist:
            logger.info(
                "ssrf_guard_allowlisted",
                hostname=hostname,
                url=url,
            )
            return url

        # 5. DNS resolution check
        try:
            resolved_ips = await self._resolve_dns(hostname)
        except socket.gaierror:
            raise ValueError(f"DNS resolution failed for hostname: {hostname}")

        for ip_str in resolved_ips:
            ip_obj = ipaddress.ip_address(ip_str)
            if self.is_blocked_ip(ip_obj):
                raise ValueError(
                    f"Blocked: {hostname} resolves to private/reserved IP {ip_str}."
                )

        return url
```

### Key Design Decisions

1. **DNS resolution in executor thread**: `socket.getaddrinfo` is blocking, so wrapped in `run_in_executor` to avoid blocking the event loop.
2. **Port blocklist**: Prevents probing PostgreSQL, Redis, etc. even on public IPs.
3. **Tenant allowlist**: Enterprise customers may have legitimate internal APIs behind VPN/private DNS. This is opt-in per tenant via `extra_data` in ExecutionContext.
4. **No caching of DNS results**: Each request resolves fresh to prevent stale IPs from bypassing checks.

---

## File 3: `io_executors/http_request_executor.py`

**Path:** `python-backend/app/orchestrator/node_executors/io_executors/http_request_executor.py`

### Complete Class Structure

```python
"""HTTP Request node executor -- make outbound HTTP calls to external APIs."""
import json
import time
from typing import Any

import httpx
import structlog

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard

logger = structlog.get_logger()


class HttpRequestExecutor:
    """
    Executor for HTTP Request workflow nodes.

    Makes outbound HTTP requests to external APIs with:
    - SSRF protection via SSRFGuard
    - Expression resolution for dynamic URLs, headers, body
    - Sensitive header redaction in logs
    - Configurable timeout, SSL verification, redirect following
    - Response size limiting (10MB)
    - Automatic JSON parsing with text fallback

    Supported methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS

    Output ports:
        - statusCode (number): HTTP response status code
        - body (any): Parsed JSON or raw text response body
        - headers (object): Response headers (dict)
        - responseTime (number): Round-trip time in milliseconds
        - error (text|None): Error message if request failed, None on success

    Non-2xx status codes are NOT errors -- they are returned as statusCode.
    Only network/timeout/SSL failures populate the error field.
    """

    # Maximum response body size (10 MB)
    MAX_RESPONSE_SIZE: int = 10 * 1024 * 1024

    # Maximum timeout in seconds
    MAX_TIMEOUT: int = 300

    # Default timeout in seconds
    DEFAULT_TIMEOUT: int = 30

    # Methods that accept a request body
    BODY_METHODS: set[str] = {"POST", "PUT", "PATCH"}

    # All supported HTTP methods
    SUPPORTED_METHODS: set[str] = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}

    # Headers to redact from logging (case-insensitive match)
    REDACTED_HEADERS: set[str] = {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-secret",
        "proxy-authorization",
    }

    def __init__(self):
        self._expression_resolver = ExpressionResolver()

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute an outbound HTTP request.

        Args:
            data: Node execution data containing:
                - config.url (str, required): Target URL, supports {{expressions}}
                - config.method (str): HTTP method, default "GET"
                - config.headers (dict): Request headers, supports {{expressions}} in values
                - config.queryParams (dict): URL query parameters
                - config.body (dict|str): Request body (POST/PUT/PATCH only)
                - config.timeout (int): Timeout in seconds (1-300, default 30)
                - config.followRedirects (bool): Follow redirects, default True
                - config.validateSSL (bool): Verify SSL certs, default True
                - config.auth (dict): Authentication config
                    - auth.type: "bearer" | "basic" | "api_key"
                    - auth.token / auth.username+password / auth.key+header_name
            context: Execution context with user_id, tenant_id, workflow state.

        Returns:
            dict with keys: statusCode, body, headers, responseTime, error
        """
        config = data.config
        state = data.state

        # --- 1. Resolve URL ---
        raw_url = config.get("url") or data.inputs.get("url", "")
        if not raw_url:
            return self._error_result("URL is required")

        url = self._resolve_expression(raw_url, state)

        # --- 2. Resolve method ---
        method = (config.get("method") or "GET").upper()
        if method not in self.SUPPORTED_METHODS:
            return self._error_result(f"Unsupported HTTP method: {method}")

        # --- 3. SSRF validation ---
        tenant_allowlist = context.extra_data.get("ssrf_allowlist", [])
        ssrf_guard = SSRFGuard(tenant_allowlist=tenant_allowlist)

        try:
            await ssrf_guard.validate_url(url)
        except ValueError as e:
            logger.warning(
                "http_request_ssrf_blocked",
                url=self._redact_url_credentials(url),
                reason=str(e),
                node_id=data.node_id,
                workflow_id=context.workflow_id,
            )
            return self._error_result(f"URL blocked by security policy: {e}")

        # --- 4. Build headers ---
        headers = self._build_headers(config, state)

        # --- 5. Build query parameters ---
        query_params = self._resolve_dict(config.get("queryParams", {}), state)

        # --- 6. Build request body ---
        body_payload: Any = None
        json_payload: Any = None

        if method in self.BODY_METHODS:
            raw_body = config.get("body") or data.inputs.get("body")
            if raw_body is not None:
                if isinstance(raw_body, dict):
                    # Resolve expressions in dict values
                    json_payload = self._resolve_dict(raw_body, state)
                elif isinstance(raw_body, str):
                    body_payload = self._resolve_expression(raw_body, state)
                else:
                    json_payload = raw_body

        # --- 7. Parse timeout ---
        timeout = self._parse_timeout(config.get("timeout", self.DEFAULT_TIMEOUT))

        # --- 8. SSL and redirect settings ---
        verify_ssl = config.get("validateSSL", True)
        follow_redirects = config.get("followRedirects", True)

        # --- 9. Apply authentication ---
        headers = self._apply_auth(headers, config.get("auth"), state)

        # --- 10. Log request (redacted) ---
        logger.info(
            "http_request_start",
            method=method,
            url=self._redact_url_credentials(url),
            node_id=data.node_id,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
            has_body=body_payload is not None or json_payload is not None,
            timeout=timeout,
        )

        # --- 11. Execute request ---
        start_time = time.monotonic()

        try:
            result = await self._do_request(
                method=method,
                url=url,
                headers=headers,
                params=query_params if query_params else None,
                json_payload=json_payload,
                body_payload=body_payload,
                timeout=timeout,
                verify_ssl=verify_ssl,
                follow_redirects=follow_redirects,
            )
        except httpx.TimeoutException:
            elapsed_ms = self._elapsed_ms(start_time)
            logger.warning(
                "http_request_timeout",
                url=self._redact_url_credentials(url),
                timeout=timeout,
                elapsed_ms=elapsed_ms,
                node_id=data.node_id,
            )
            return self._error_result(
                f"Request timed out after {timeout} seconds",
                response_time=elapsed_ms,
            )
        except httpx.ConnectError as e:
            elapsed_ms = self._elapsed_ms(start_time)
            logger.warning(
                "http_request_connect_error",
                url=self._redact_url_credentials(url),
                error=str(e),
                node_id=data.node_id,
            )
            return self._error_result(
                f"Connection failed: {e}",
                response_time=elapsed_ms,
            )
        except Exception as e:
            elapsed_ms = self._elapsed_ms(start_time)
            logger.error(
                "http_request_error",
                url=self._redact_url_credentials(url),
                error=str(e),
                error_type=type(e).__name__,
                node_id=data.node_id,
            )
            return self._error_result(
                f"Request failed: {e}",
                response_time=elapsed_ms,
            )

        elapsed_ms = self._elapsed_ms(start_time)

        # --- 12. Parse response ---
        response_body = self._parse_response_body(result)
        response_headers = dict(result.headers)

        # --- 13. Log response (redacted) ---
        logger.info(
            "http_request_complete",
            method=method,
            url=self._redact_url_credentials(url),
            status_code=result.status_code,
            response_time_ms=elapsed_ms,
            response_size=len(result.content),
            node_id=data.node_id,
            workflow_id=context.workflow_id,
        )

        return {
            "statusCode": result.status_code,
            "body": response_body,
            "headers": response_headers,
            "responseTime": elapsed_ms,
            "error": None,
        }

    # -----------------------------------------------------------------------
    # Private Methods
    # -----------------------------------------------------------------------

    async def _do_request(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        params: dict[str, str] | None,
        json_payload: Any,
        body_payload: str | None,
        timeout: int,
        verify_ssl: bool,
        follow_redirects: bool,
    ) -> httpx.Response:
        """
        Execute the actual HTTP request via httpx.

        Separated for easy mocking in tests.
        """
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            verify=verify_ssl,
            follow_redirects=follow_redirects,
            max_redirects=10,
        ) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_payload,
                content=body_payload,
            )

            # Enforce response size limit
            if len(response.content) > self.MAX_RESPONSE_SIZE:
                raise ValueError(
                    f"Response too large: {len(response.content)} bytes "
                    f"(max {self.MAX_RESPONSE_SIZE})"
                )

            return response

    def _build_headers(
        self,
        config: dict[str, Any],
        state: dict[str, Any],
    ) -> dict[str, str]:
        """Build request headers from config, resolving expressions."""
        raw_headers = config.get("headers", {})
        if not isinstance(raw_headers, dict):
            return {}

        headers: dict[str, str] = {}
        for key, value in raw_headers.items():
            if isinstance(value, str):
                headers[key] = self._resolve_expression(value, state)
            else:
                headers[key] = str(value)

        return headers

    def _apply_auth(
        self,
        headers: dict[str, str],
        auth_config: dict[str, Any] | None,
        state: dict[str, Any],
    ) -> dict[str, str]:
        """
        Apply authentication to request headers.

        Supported auth types:
        - bearer: Adds Authorization: Bearer <token>
        - basic: Adds Authorization: Basic <base64(user:pass)>
        - api_key: Adds a custom header with the API key value
        """
        if not auth_config:
            return headers

        auth_type = auth_config.get("type", "").lower()

        if auth_type == "bearer":
            token = self._resolve_expression(
                str(auth_config.get("token", "")), state
            )
            if token:
                headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "basic":
            import base64
            username = self._resolve_expression(
                str(auth_config.get("username", "")), state
            )
            password = self._resolve_expression(
                str(auth_config.get("password", "")), state
            )
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"

        elif auth_type == "api_key":
            key = self._resolve_expression(
                str(auth_config.get("key", "")), state
            )
            header_name = auth_config.get("header_name", "X-API-Key")
            if key:
                headers[header_name] = key

        return headers

    def _parse_response_body(self, response: httpx.Response) -> Any:
        """
        Parse response body: JSON if content-type indicates JSON, else text.

        Never throws -- returns raw text on JSON parse failure.
        """
        content_type = response.headers.get("content-type", "")

        if "application/json" in content_type or "text/json" in content_type:
            try:
                return response.json()
            except (json.JSONDecodeError, ValueError):
                logger.debug(
                    "http_request_json_parse_failed",
                    content_type=content_type,
                    body_preview=response.text[:200] if response.text else "",
                )
                return response.text
        else:
            return response.text

    def _resolve_expression(self, text: str, state: dict[str, Any]) -> str:
        """Resolve {{expressions}} in a string using ExpressionResolver."""
        if not text or "{{" not in text:
            return text
        return self._expression_resolver.resolve(text, state)

    def _resolve_dict(
        self,
        d: dict[str, Any],
        state: dict[str, Any],
    ) -> dict[str, Any]:
        """Resolve {{expressions}} in all string values of a dict."""
        if not isinstance(d, dict):
            return d
        resolved: dict[str, Any] = {}
        for key, value in d.items():
            if isinstance(value, str):
                resolved[key] = self._resolve_expression(value, state)
            elif isinstance(value, dict):
                resolved[key] = self._resolve_dict(value, state)
            else:
                resolved[key] = value
        return resolved

    def _parse_timeout(self, raw_timeout: Any) -> int:
        """Clamp timeout to valid range [1, MAX_TIMEOUT]."""
        try:
            timeout = int(raw_timeout)
        except (TypeError, ValueError):
            timeout = self.DEFAULT_TIMEOUT
        return max(1, min(timeout, self.MAX_TIMEOUT))

    def _elapsed_ms(self, start_time: float) -> float:
        """Calculate elapsed time in milliseconds from monotonic start."""
        return round((time.monotonic() - start_time) * 1000, 2)

    def _error_result(
        self,
        error_message: str,
        response_time: float = 0,
    ) -> dict[str, Any]:
        """Build a standardized error output dict."""
        return {
            "statusCode": 0,
            "body": None,
            "headers": {},
            "responseTime": response_time,
            "error": error_message,
        }

    @staticmethod
    def _redact_url_credentials(url: str) -> str:
        """Redact userinfo from URL for safe logging."""
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(url)
        if parsed.username or parsed.password:
            redacted_netloc = f"***:***@{parsed.hostname}"
            if parsed.port:
                redacted_netloc += f":{parsed.port}"
            return urlunparse(parsed._replace(netloc=redacted_netloc))
        return url
```

### Key Design Decisions

1. **Non-2xx is NOT an error**: The executor returns `statusCode: 404` (or 500, etc.) with `error: None`. This lets downstream conditional nodes branch on status code. Only transport-level failures (timeout, DNS, connection refused) set the `error` field.

2. **Expression resolution everywhere**: URL, header values, body values, auth tokens all support `{{variable}}` syntax via the existing `ExpressionResolver`. This enables dynamic chaining like `{{previous_node.apiKey}}`.

3. **`_do_request` separated for testability**: Tests mock `_do_request` (or the deprecated `_guarded_request` alias) to avoid real network calls while still testing all orchestration logic.

4. **Response size cap**: 10MB limit prevents accidentally downloading massive files. Workflows that need large file transfers should use the Storage node instead.

5. **`time.monotonic()`** for response timing: Not affected by system clock changes.

6. **Auth modes separated from raw headers**: The `auth` config block handles bearer/basic/api_key patterns cleanly. Users can also set raw `Authorization` in headers directly for other schemes.

---

## File 4: Node Registry Registration

**Path:** `python-backend/app/orchestrator/node_registry.py`

Add the following registration block **after the existing Phase 2.4 nodes (line ~1115)** inside `_register_core_nodes()`.

### Registry Spec (exact format)

```python
        # ===== Core I/O Nodes =====

        # HTTP Request
        self.register_node_type(
            NodeTypeSpec(
                type="http_request",
                display_name="HTTP Request",
                description="Make an outbound HTTP request to an external API",
                icon="globe",
                color="blue",
                category="integrations",
                inputs=[
                    InputSpec(
                        name="url",
                        display_name="URL",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="https://api.example.com/data",
                    ),
                    InputSpec(
                        name="method",
                        display_name="Method",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="GET",
                        options=[
                            {"label": "GET", "value": "GET"},
                            {"label": "POST", "value": "POST"},
                            {"label": "PUT", "value": "PUT"},
                            {"label": "DELETE", "value": "DELETE"},
                            {"label": "PATCH", "value": "PATCH"},
                            {"label": "HEAD", "value": "HEAD"},
                            {"label": "OPTIONS", "value": "OPTIONS"},
                        ],
                    ),
                    InputSpec(
                        name="headers",
                        display_name="Headers",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"Content-Type": "application/json", "Authorization": "Bearer {{secrets.API_KEY}}"}',
                    ),
                    InputSpec(
                        name="queryParams",
                        display_name="Query Parameters",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"page": "1", "limit": "10"}',
                    ),
                    InputSpec(
                        name="body",
                        display_name="Request Body",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"key": "value"}',
                    ),
                    InputSpec(
                        name="auth",
                        display_name="Authentication",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        placeholder='{"type": "bearer", "token": "{{secrets.API_KEY}}"}',
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=30,
                        validation={"min": 1, "max": 300},
                    ),
                    InputSpec(
                        name="followRedirects",
                        display_name="Follow Redirects",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                    InputSpec(
                        name="validateSSL",
                        display_name="Validate SSL",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                ],
                outputs=[
                    OutputSpec(name="statusCode", display_name="Status Code", data_type="number"),
                    OutputSpec(name="body", display_name="Response Body", data_type="any"),
                    OutputSpec(name="headers", display_name="Response Headers", data_type="json"),
                    OutputSpec(name="responseTime", display_name="Response Time (ms)", data_type="number"),
                    OutputSpec(name="error", display_name="Error", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.io_executors.http_request_executor.HttpRequestExecutor",
            )
        )
```

### Frontend Category Update

The `category` field `"integrations"` is new and must be added to the frontend TypeScript union type.

In `apps/web/client/src/lib/workflow/useNodeRegistry.ts`, line 37, update:

```typescript
// Before:
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data";

// After:
category: "ai" | "flow_control" | "human" | "skills" | "media" | "triggers" | "inputs" | "outputs" | "data" | "integrations";
```

---

## File 5: Test File

**Path:** `python-backend/tests/test_node_executors/test_http_request_executor.py`

### Test Cases

| # | Test Name | Category | What it verifies |
|---|-----------|----------|-----------------|
| 1 | `test_get_request_success` | Happy path | GET returns statusCode, body (JSON), headers, responseTime |
| 2 | `test_post_json_body` | Happy path | POST with JSON body sends correctly |
| 3 | `test_put_request` | Happy path | PUT with body works |
| 4 | `test_delete_request` | Happy path | DELETE without body works |
| 5 | `test_patch_request` | Happy path | PATCH with body works |
| 6 | `test_head_request` | Happy path | HEAD returns headers, empty body |
| 7 | `test_non_2xx_is_not_error` | Status handling | 404 response returns statusCode=404, error=None |
| 8 | `test_500_is_not_error` | Status handling | 500 response returns statusCode=500, error=None |
| 9 | `test_json_parse_failure_returns_text` | Response parsing | Invalid JSON content-type returns raw text |
| 10 | `test_text_response` | Response parsing | text/html response returned as text |
| 11 | `test_timeout_error` | Error handling | httpx.TimeoutException returns error message |
| 12 | `test_connection_error` | Error handling | httpx.ConnectError returns error message |
| 13 | `test_ssl_error` | Error handling | SSL verification failure returns error |
| 14 | `test_missing_url` | Validation | Empty/missing URL returns error result |
| 15 | `test_unsupported_method` | Validation | Invalid method returns error |
| 16 | `test_timeout_clamped` | Validation | Timeout >300 clamped to 300, <1 to 1 |
| 17 | `test_expression_resolution_in_url` | Expressions | `{{node1.baseUrl}}/path` resolved from state |
| 18 | `test_expression_resolution_in_headers` | Expressions | `{{secrets.API_KEY}}` resolved in header values |
| 19 | `test_expression_resolution_in_body` | Expressions | `{{node1.payload}}` resolved in body |
| 20 | `test_bearer_auth` | Auth | Bearer token added to Authorization header |
| 21 | `test_basic_auth` | Auth | Basic auth encoded and added |
| 22 | `test_api_key_auth` | Auth | Custom header added with API key |
| 23 | `test_ssrf_blocks_private_ip` | Security | 10.x.x.x URL blocked |
| 24 | `test_ssrf_blocks_localhost` | Security | localhost URL blocked |
| 25 | `test_ssrf_blocks_metadata` | Security | 169.254.169.254 blocked |
| 26 | `test_ssrf_blocks_internal_port` | Security | Port 5432/6379 blocked |
| 27 | `test_response_size_limit` | Safety | >10MB response raises error |
| 28 | `test_query_params` | Feature | Query params appended to URL |
| 29 | `test_follow_redirects_disabled` | Feature | followRedirects=false stops at redirect |
| 30 | `test_validate_ssl_disabled` | Feature | validateSSL=false skips cert check |
| 31 | `test_redact_url_credentials` | Logging | userinfo in URL is redacted |

### Test Structure (pseudo-code)

```python
"""Tests for HTTP Request Executor.

Test file: python-backend/tests/test_node_executors/test_http_request_executor.py
"""
import base64
import ipaddress
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ctx():
    """Standard execution context."""
    return ExecutionContext(
        user_id=1,
        tenant_id="tenant-test",
        workflow_id="wf-001",
        execution_id="exec-001",
        credits_available=100,
        extra_data={},
    )


def _data(config: dict, inputs: dict | None = None, state: dict | None = None):
    """Helper to build NodeExecutionData."""
    return NodeExecutionData(
        node_id="http-node-1",
        node_type="http_request",
        config=config,
        inputs=inputs or {},
        state=state or {},
    )


def _mock_response(
    status_code: int = 200,
    headers: dict | None = None,
    json_body: dict | None = None,
    text_body: str = "",
    content: bytes = b"",
) -> httpx.Response:
    """Build a mock httpx.Response."""
    # ... construct mock response object
    pass


# ---------------------------------------------------------------------------
# Happy Path Tests
# ---------------------------------------------------------------------------

class TestHttpRequestHappyPath:

    @pytest.mark.asyncio
    async def test_get_request_success(self, ctx):
        """GET returns statusCode, body, headers, responseTime."""
        ...

    @pytest.mark.asyncio
    async def test_post_json_body(self, ctx):
        """POST with JSON body round-trips correctly."""
        ...

    @pytest.mark.asyncio
    async def test_put_request(self, ctx):
        """PUT with body."""
        ...

    @pytest.mark.asyncio
    async def test_delete_request(self, ctx):
        """DELETE without body."""
        ...

    @pytest.mark.asyncio
    async def test_patch_request(self, ctx):
        """PATCH with body."""
        ...

    @pytest.mark.asyncio
    async def test_head_request(self, ctx):
        """HEAD returns headers only."""
        ...


# ---------------------------------------------------------------------------
# Status Code Handling (non-2xx is NOT an error)
# ---------------------------------------------------------------------------

class TestHttpRequestStatusCodes:

    @pytest.mark.asyncio
    async def test_404_not_error(self, ctx):
        """404 returns statusCode=404, error=None."""
        ...

    @pytest.mark.asyncio
    async def test_500_not_error(self, ctx):
        """500 returns statusCode=500, error=None."""
        ...


# ---------------------------------------------------------------------------
# Response Parsing
# ---------------------------------------------------------------------------

class TestHttpRequestResponseParsing:

    @pytest.mark.asyncio
    async def test_json_parse_success(self, ctx):
        """JSON content-type with valid JSON body returns dict."""
        ...

    @pytest.mark.asyncio
    async def test_json_parse_failure_returns_text(self, ctx):
        """Invalid JSON with application/json returns raw text."""
        ...

    @pytest.mark.asyncio
    async def test_text_html_response(self, ctx):
        """text/html content returns raw text string."""
        ...


# ---------------------------------------------------------------------------
# Error Handling (transport-level errors)
# ---------------------------------------------------------------------------

class TestHttpRequestErrors:

    @pytest.mark.asyncio
    async def test_timeout_error(self, ctx):
        """TimeoutException returns error message, statusCode=0."""
        ...

    @pytest.mark.asyncio
    async def test_connection_error(self, ctx):
        """ConnectError returns error message."""
        ...

    @pytest.mark.asyncio
    async def test_ssl_error(self, ctx):
        """SSL error returns error message."""
        ...

    @pytest.mark.asyncio
    async def test_missing_url(self, ctx):
        """No URL returns error result without making request."""
        ...

    @pytest.mark.asyncio
    async def test_unsupported_method(self, ctx):
        """Invalid method returns error."""
        ...

    @pytest.mark.asyncio
    async def test_response_too_large(self, ctx):
        """Response > 10MB returns error."""
        ...


# ---------------------------------------------------------------------------
# Validation / Clamping
# ---------------------------------------------------------------------------

class TestHttpRequestValidation:

    def test_timeout_clamped_high(self):
        """Timeout > 300 clamped to 300."""
        ...

    def test_timeout_clamped_low(self):
        """Timeout < 1 clamped to 1."""
        ...

    def test_timeout_invalid_string(self):
        """Non-numeric timeout falls back to default."""
        ...


# ---------------------------------------------------------------------------
# Expression Resolution
# ---------------------------------------------------------------------------

class TestHttpRequestExpressions:

    @pytest.mark.asyncio
    async def test_url_expression_resolved(self, ctx):
        """{{node1.baseUrl}} in URL is resolved from state."""
        ...

    @pytest.mark.asyncio
    async def test_header_expression_resolved(self, ctx):
        """{{secrets.API_KEY}} in header value resolved."""
        ...

    @pytest.mark.asyncio
    async def test_body_expression_resolved(self, ctx):
        """{{node1.payload}} in body values resolved."""
        ...


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

class TestHttpRequestAuth:

    @pytest.mark.asyncio
    async def test_bearer_auth(self, ctx):
        """Bearer token added to Authorization header."""
        ...

    @pytest.mark.asyncio
    async def test_basic_auth(self, ctx):
        """Basic auth base64 encoded."""
        ...

    @pytest.mark.asyncio
    async def test_api_key_auth(self, ctx):
        """API key placed in custom header."""
        ...

    @pytest.mark.asyncio
    async def test_no_auth(self, ctx):
        """No auth config means no Authorization header."""
        ...


# ---------------------------------------------------------------------------
# SSRF Protection
# ---------------------------------------------------------------------------

class TestHttpRequestSSRF:

    @pytest.mark.asyncio
    async def test_blocks_private_10(self, ctx):
        """10.0.0.1 URL blocked."""
        ...

    @pytest.mark.asyncio
    async def test_blocks_localhost(self, ctx):
        """http://localhost URL blocked."""
        ...

    @pytest.mark.asyncio
    async def test_blocks_127(self, ctx):
        """http://127.0.0.1 URL blocked."""
        ...

    @pytest.mark.asyncio
    async def test_blocks_metadata(self, ctx):
        """169.254.169.254 URL blocked."""
        ...

    @pytest.mark.asyncio
    async def test_blocks_internal_port(self, ctx):
        """Port 5432, 6379 blocked."""
        ...


# ---------------------------------------------------------------------------
# Feature Tests
# ---------------------------------------------------------------------------

class TestHttpRequestFeatures:

    @pytest.mark.asyncio
    async def test_query_params_sent(self, ctx):
        """Query params dict sent to httpx."""
        ...

    @pytest.mark.asyncio
    async def test_follow_redirects_false(self, ctx):
        """followRedirects=false passed to httpx client."""
        ...

    @pytest.mark.asyncio
    async def test_validate_ssl_false(self, ctx):
        """validateSSL=false passed to httpx client."""
        ...


# ---------------------------------------------------------------------------
# Logging Safety
# ---------------------------------------------------------------------------

class TestHttpRequestLogging:

    def test_redact_url_credentials(self):
        """Userinfo in URL is replaced with ***."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )
        executor = HttpRequestExecutor()
        assert "***" in executor._redact_url_credentials("https://user:pass@example.com/api")
        assert "user" not in executor._redact_url_credentials("https://user:pass@example.com/api")
        assert "pass" not in executor._redact_url_credentials("https://user:pass@example.com/api")

    def test_no_redaction_needed(self):
        """URL without userinfo returned unchanged."""
        from app.orchestrator.node_executors.io_executors.http_request_executor import (
            HttpRequestExecutor,
        )
        executor = HttpRequestExecutor()
        url = "https://example.com/api?key=123"
        assert executor._redact_url_credentials(url) == url
```

---

## Dependencies

### Already present in `python-backend/requirements.txt`

- `httpx>=0.24.1` -- line 52 (no change needed)

### No new dependencies required

The SSRF guard uses only `ipaddress`, `socket`, `urllib.parse` from the standard library. `structlog` is already used throughout the project. `ExpressionResolver` is an existing internal module.

---

## Implementation Order

| Step | Action | Verification |
|------|--------|-------------|
| 1 | Create `io_executors/__init__.py` | File exists |
| 2 | Create `ssrf_guard.py` | Unit tests for SSRFGuard pass |
| 3 | Create `http_request_executor.py` | Unit tests for HttpRequestExecutor pass |
| 4 | Create test file with all 31 tests | `pytest tests/test_node_executors/test_http_request_executor.py -v` |
| 5 | Add registry spec to `node_registry.py` | `NodeRegistry.get_instance().get_node_type("http_request")` returns spec |
| 6 | Update frontend category type | `pnpm check` passes in `apps/web/` |
| 7 | Run full test suite | `pytest` passes with coverage >= 80% |

---

## Security Considerations Summary

1. **SSRF Protection (SSRFGuard)**
   - All RFC 1918 private ranges blocked (10/8, 172.16/12, 192.168/16)
   - Loopback (127/8, ::1), link-local (169.254/16), multicast (224/4) blocked
   - Cloud metadata endpoint (169.254.169.254) explicitly blocked
   - Internal service ports (5432, 6379, 3306, etc.) blocked even on public IPs
   - DNS resolution check catches DNS rebinding (hostname resolves to private IP)
   - Only HTTP/HTTPS schemes allowed (no file://, ftp://, gopher://)
   - Enterprise tenants can allowlist specific hostnames

2. **Credential Safety**
   - Authorization, Cookie, X-API-Key, Proxy-Authorization headers never logged
   - URL userinfo (user:pass@host) redacted in all log messages
   - Auth tokens resolved from `{{secrets.*}}` expressions (values stored encrypted)
   - Entire `auth` config block supports expression resolution

3. **Resource Limits**
   - Response size capped at 10 MB
   - Timeout capped at 300 seconds
   - Max 10 redirects followed
   - One httpx client per request (no connection reuse that could leak state)

4. **Non-throwing for HTTP errors**
   - Non-2xx status codes are normal outputs, not exceptions
   - Only transport failures (timeout, DNS, connection) populate `error` field
   - Downstream conditional nodes can branch on `statusCode`

---

## Verification Steps

After implementation:

```bash
# 1. Run HTTP request executor tests
cd /home/dev/projects/SmartSpecPro/python-backend
pytest tests/test_node_executors/test_http_request_executor.py -v

# 2. Run all tests
pytest

# 3. Verify registry loads correctly
python -c "
from app.orchestrator.node_registry import NodeRegistry
reg = NodeRegistry.get_instance()
spec = reg.get_node_type('http_request')
assert spec is not None, 'http_request not registered'
print(f'Node: {spec.display_name}')
print(f'Inputs: {len(spec.inputs)} fields')
print(f'Outputs: {len(spec.outputs)} ports')
print(f'Executor: {spec.executor}')
print('OK')
"

# 4. Lint and type check
black app/orchestrator/node_executors/io_executors/ --check
ruff check app/orchestrator/node_executors/io_executors/

# 5. Frontend type check
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm check
```
