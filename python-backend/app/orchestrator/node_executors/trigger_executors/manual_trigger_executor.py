"""Manual Trigger Executor - Start workflow manually with optional parameters."""
from datetime import datetime
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ManualTriggerExecutor:
    """Executor for manual trigger nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute manual trigger - returns user context and timestamp.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with userId, timestamp, and optional params
        """
        # Extract params from extra_data if provided during workflow execution
        params = context.extra_data.get("trigger_params", {})

        return {
            "userId": context.user_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "params": params,
        }
