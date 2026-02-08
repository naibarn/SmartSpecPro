"""Error Trigger Executor - Start workflow when another workflow fails."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ErrorTriggerExecutor:
    """Executor for error trigger nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute error trigger - returns error details from failed workflow.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with error details, workflow ID, and timestamp
        """
        # Error data should be provided in extra_data when workflow is triggered
        error_data = context.extra_data.get("trigger_error", {})

        return {
            "error": error_data.get("error", {}),
            "workflowId": error_data.get("workflowId", ""),
            "timestamp": error_data.get("timestamp", ""),
        }
