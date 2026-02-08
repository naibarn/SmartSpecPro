"""Schedule Trigger Executor - Start workflow on a schedule."""
from datetime import datetime
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ScheduleTriggerExecutor:
    """Executor for schedule trigger nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute schedule trigger - returns execution timestamp.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with execution timestamp
        """
        # Timestamp of scheduled execution
        execution_time = context.extra_data.get("scheduled_time", datetime.utcnow().isoformat() + "Z")

        return {
            "timestamp": execution_time,
        }
