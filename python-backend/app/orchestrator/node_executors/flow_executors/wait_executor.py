"""Wait Executor - Pause workflow execution for specified duration."""
import asyncio
from datetime import datetime
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class WaitExecutor:
    """Executor for wait/delay nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute wait - pauses execution for specified duration.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with resume timestamp

        Raises:
            ValueError: If duration is invalid
        """
        duration = data.inputs.get("duration")
        unit = data.inputs.get("unit", "seconds")

        if not isinstance(duration, (int, float)) or duration <= 0:
            raise ValueError(f"Invalid duration: {duration}")

        # Convert to seconds
        duration_seconds = duration
        if unit == "minutes":
            duration_seconds = duration * 60
        elif unit == "hours":
            duration_seconds = duration * 3600
        elif unit == "days":
            duration_seconds = duration * 86400
        elif unit != "seconds":
            raise ValueError(f"Invalid time unit: {unit}")

        # Maximum wait time: 7 days (Celery countdown limit)
        max_wait_seconds = 7 * 86400
        if duration_seconds > max_wait_seconds:
            raise ValueError(
                f"Wait duration ({duration_seconds}s) exceeds maximum allowed (7 days)"
            )

        # Perform the wait
        await asyncio.sleep(duration_seconds)

        resumed_at = datetime.utcnow().isoformat() + "Z"

        return {
            "resumedAt": resumed_at,
        }
