"""HTTP Request node executor -- make outbound HTTP calls to external APIs."""
import base64
import json
import time
from typing import Any
from urllib.parse import urlparse, urlunparse

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
        body_payload: str | None = None
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
            token = self._resolve_expression(str(auth_config.get("token", "")), state)
            if token:
                headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "basic":
            username = self._resolve_expression(str(auth_config.get("username", "")), state)
            password = self._resolve_expression(str(auth_config.get("password", "")), state)
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"

        elif auth_type == "api_key":
            key = self._resolve_expression(str(auth_config.get("key", "")), state)
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
        parsed = urlparse(url)
        if parsed.username or parsed.password:
            redacted_netloc = f"***:***@{parsed.hostname}"
            if parsed.port:
                redacted_netloc += f":{parsed.port}"
            return urlunparse(parsed._replace(netloc=redacted_netloc))
        return url
