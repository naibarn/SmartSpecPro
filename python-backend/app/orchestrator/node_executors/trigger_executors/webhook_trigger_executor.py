"""Webhook Trigger Executor - Trigger workflow via HTTP webhook."""

import hmac
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class WebhookTriggerExecutor:
    """
    Webhook trigger executor.

    This executor runs when a webhook request is received.
    It validates the request and returns trigger data.
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Process webhook request."""
        webhook_id = data.inputs.get("webhook_id")
        request_body = data.inputs.get("body")
        request_headers = data.inputs.get("headers", {})
        request_query = data.inputs.get("query", {})
        request_method = data.inputs.get("method", "POST")

        # Validate webhook signature if configured
        secret = data.inputs.get("_webhook_secret")
        if secret:
            signature = request_headers.get("x-webhook-signature") or request_headers.get(
                "X-Webhook-Signature"
            )
            if not signature:
                raise ValueError("Missing webhook signature header")
            if not self._verify_signature(request_body, signature, secret):
                raise ValueError("Invalid webhook signature")

        return {
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "webhook_id": webhook_id,
            "method": request_method,
            "body": request_body,
            "headers": request_headers,
            "query": request_query,
        }

    def _verify_signature(
        self, body: Any, signature: str, secret: str
    ) -> bool:
        """Verify webhook signature using HMAC-SHA256."""
        body_bytes = body.encode() if isinstance(body, str) else str(body).encode()

        expected = hmac.new(
            secret.encode(), body_bytes, hashlib.sha256
        ).hexdigest()

        # Support both "sha256=<signature>" and just "<signature>" formats
        expected_with_prefix = f"sha256={expected}"

        return hmac.compare_digest(expected_with_prefix, signature) or hmac.compare_digest(
            expected, signature
        )


class WebhookResponseExecutor:
    """
    Send response back to webhook caller.

    Must be used in workflows triggered by webhook_trigger.
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Send webhook response."""
        status_code = data.inputs.get("status_code", 200)
        body = data.inputs.get("body")
        headers = data.inputs.get("headers", {})

        # Mark this as a webhook response for the runtime
        return {
            "_webhook_response": True,
            "status_code": status_code,
            "body": body,
            "headers": {
                "content-type": "application/json",
                **headers,
            },
        }
