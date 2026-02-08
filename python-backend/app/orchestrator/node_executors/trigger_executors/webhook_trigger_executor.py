"""Webhook Trigger Executor - Start workflow from HTTP webhook call."""
import json
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()

# All supported HTTP methods
SUPPORTED_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


class WebhookTriggerExecutor:
    """Executor for webhook trigger nodes.

    Receives HTTP request data injected into extra_data by the
    webhook receiver endpoint. Validates method, parses body
    based on content-type, and extracts headers and query params.

    Output ports:
        - body (json): Parsed request body.
        - headers (json): Request headers (sensitive headers redacted).
        - query (json): URL query parameters.
        - method (text): HTTP method used (GET, POST, etc.).
        - path (text): Request URL path.
    """

    # Headers that should be redacted from output for security
    REDACTED_HEADERS = {"authorization", "cookie", "x-api-key", "x-secret"}

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute webhook trigger - returns webhook request data.

        Args:
            data: Node execution data with config (allowedMethods, authRequired).
            context: Execution context with webhook_request in extra_data.

        Returns:
            Dictionary with body, headers, query, method, and path.

        Raises:
            ValueError: If method is not in allowedMethods config, or if
                        webhook_request data is missing from context.
        """
        webhook_data = context.extra_data.get("webhook_request", {})

        if not webhook_data:
            raise ValueError(
                "No webhook request data provided. This trigger must be "
                "invoked via the webhook endpoint."
            )

        method = webhook_data.get("method", "POST").upper()
        body = webhook_data.get("body", {})
        headers = webhook_data.get("headers", {})
        query = webhook_data.get("query", {})
        path = webhook_data.get("path", "")

        # Validate method against configured allowed methods
        allowed_methods = data.config.get("allowedMethods")
        if allowed_methods is None:
            # Fallback: check legacy single-method config
            configured_method = data.config.get("method")
            if configured_method:
                allowed_methods = [configured_method]

        if allowed_methods:
            allowed_upper = [m.upper() for m in allowed_methods]
            if method not in allowed_upper:
                raise ValueError(
                    f"HTTP method '{method}' is not allowed. "
                    f"Configured allowed methods: {allowed_upper}"
                )

        # Parse JSON body from raw string if needed
        if isinstance(body, str) and body.strip():
            content_type = ""
            # Headers may be case-insensitive
            for h_key, h_val in headers.items():
                if h_key.lower() == "content-type":
                    content_type = h_val.lower()
                    break

            if "application/json" in content_type:
                try:
                    body = json.loads(body)
                except json.JSONDecodeError:
                    logger.warning(
                        "webhook_body_json_parse_failed",
                        raw_body_preview=body[:200],
                    )
                    # Keep as raw string

        # Redact sensitive headers
        safe_headers = {}
        for key, value in headers.items():
            if key.lower() in self.REDACTED_HEADERS:
                safe_headers[key] = "[REDACTED]"
            else:
                safe_headers[key] = value

        return {
            "body": body,
            "headers": safe_headers,
            "query": query,
            "method": method,
            "path": path,
        }
