"""Event Trigger Executor - Start workflow when system event occurs."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class EventTriggerExecutor:
    """Executor for event trigger nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute event trigger - returns event data.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with event data and type
        """
        # Event data should be provided in extra_data when workflow is triggered
        event_data = context.extra_data.get("trigger_event", {})

        return {
            "event": event_data.get("data", {}),
            "eventType": event_data.get("type", ""),
        }
