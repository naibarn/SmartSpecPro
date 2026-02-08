"""Webhook Response Executor - Send HTTP response back to webhook caller."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class WebhookResponseExecutor:
    """Executor for webhook response nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute webhook response - prepares HTTP response for webhook caller.

        This executor doesn't return any output ports (as it's a terminal node),
        but it stores the response data in the execution context for the
        workflow engine to send back to the webhook caller.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Empty dictionary (terminal node)
        """
        status_code = data.inputs.get("statusCode", 200)
        body = data.inputs.get("body")
        headers = data.inputs.get("headers", {})

        # Validate status code
        if not isinstance(status_code, int) or status_code < 100 or status_code > 599:
            status_code = 200

        # Store in context.extra_data for workflow engine to retrieve
        context.extra_data["webhook_response"] = {
            "statusCode": status_code,
            "body": body,
            "headers": headers if isinstance(headers, dict) else {},
        }

        # Terminal node - no outputs to pass to downstream nodes
        return {}
