"""Manual Trigger Executor - Start workflow manually with optional parameters."""
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ManualTriggerExecutor:
    """Executor for manual trigger nodes.

    This is the simplest trigger type. It produces the user context
    and any parameters passed when the workflow is manually started.

    Output ports:
        - userId (number): The ID of the user who triggered the workflow.
        - timestamp (text): ISO 8601 timestamp of when execution started.
        - params (json): Optional parameters passed at trigger time.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute manual trigger - returns user context and timestamp.

        Args:
            data: Node execution data (config and inputs).
            context: Execution context with user_id and extra_data.

        Returns:
            Dictionary with userId, timestamp, and optional params.
        """
        # Extract params from extra_data if provided during workflow execution
        params = context.extra_data.get("trigger_params", {})

        return {
            "userId": context.user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "params": params,
        }
