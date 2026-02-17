"""Delay Executor - Pause workflow execution for a specified duration."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class DelayExecutor:
    """
    Delay execution for a specified time.

    NOTE: Current implementation uses asyncio.sleep() which blocks the
    execution thread. For production, implement checkpoint/resume pattern.

    Limits:
    - Min: 0.1 seconds
    - Max: 86400 seconds (24 hours)
    """

    MIN_DELAY = 0.1
    MAX_DELAY = 86400  # 24 hours

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Delay execution for specified duration."""
        duration = data.inputs.get("duration", 1)

        # Validate duration
        if not isinstance(duration, (int, float)):
            raise ValueError(f"Duration must be a number, got {type(duration)}")

        if not (self.MIN_DELAY <= duration <= self.MAX_DELAY):
            raise ValueError(
                f"Duration must be between {self.MIN_DELAY} and {self.MAX_DELAY} seconds"
            )

        started_at = datetime.now(timezone.utc)

        # Execute delay
        logger.info(f"Delaying execution for {duration} seconds")
        await asyncio.sleep(duration)

        ended_at = datetime.now(timezone.utc)

        return {
            "delayed_seconds": duration,
            "started_at": started_at.isoformat(),
            "ended_at": ended_at.isoformat(),
            "actual_delay": (ended_at - started_at).total_seconds(),
        }
