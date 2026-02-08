"""Webhook Trigger Executor - Start workflow from HTTP webhook call."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class WebhookTriggerExecutor:
    """Executor for webhook trigger nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute webhook trigger - returns webhook request data.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with request body, headers, and query parameters
        """
        # Webhook data should be provided in extra_data when workflow is triggered
        webhook_data = context.extra_data.get("webhook_request", {})

        return {
            "body": webhook_data.get("body", {}),
            "headers": webhook_data.get("headers", {}),
            "query": webhook_data.get("query", {}),
        }
