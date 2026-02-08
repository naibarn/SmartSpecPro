"""Event Trigger Executor - Start workflow when system event occurs."""
import structlog
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class EventTriggerExecutor:
    """Executor for event trigger nodes.

    Handles system events like:
    - user.created, user.updated
    - skill.completed
    - media.generated
    - workflow.completed

    The actual event subscription and filtering is handled by a background
    event listener service. This executor runs WHEN an event is received and
    produces the event data for downstream nodes.

    Output ports:
        - event (json): The event payload/data.
        - eventType (text): The type of event that occurred.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute event trigger - returns event data.

        Args:
            data: Node execution data with config (eventType, filter).
            context: Execution context with trigger_event in extra_data.

        Returns:
            Dictionary with event data and eventType.

        Raises:
            ValueError: If trigger_event data is missing from context, or if
                        event type doesn't match configured eventType.
        """
        # Get event data from context (injected by event listener)
        trigger_event = context.extra_data.get("trigger_event", {})

        if not trigger_event:
            raise ValueError(
                "No event data provided. This trigger must be "
                "invoked by the event listener service."
            )

        event_type = trigger_event.get("type", "")
        event_data = trigger_event.get("data", {})

        # Validate event type matches configured type
        configured_event_type = data.config.get("eventType", "")
        if configured_event_type and event_type != configured_event_type:
            raise ValueError(
                f"Event type mismatch. Expected '{configured_event_type}', "
                f"got '{event_type}' from event listener."
            )

        # Apply optional filter from config
        configured_filter = data.config.get("filter", {})
        if configured_filter and isinstance(configured_filter, dict):
            # Simple key-value filter validation
            for filter_key, filter_value in configured_filter.items():
                if event_data.get(filter_key) != filter_value:
                    logger.info(
                        "event_filtered_out",
                        event_type=event_type,
                        filter_key=filter_key,
                        expected=filter_value,
                        actual=event_data.get(filter_key),
                    )
                    raise ValueError(
                        f"Event filtered out: {filter_key}={event_data.get(filter_key)} "
                        f"does not match filter {filter_key}={filter_value}"
                    )

        logger.info(
            "event_trigger_executed",
            event_type=event_type,
            has_filter=bool(configured_filter),
        )

        return {
            "event": event_data,
            "eventType": event_type,
        }
