"""Retry Executor - Retry failed operations with configurable strategies."""

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class RetryExecutor:
    """
    Retry failed operations with configurable strategies.

    Strategies:
    - fixed: Constant delay between retries
    - linear: Linearly increasing delay
    - exponential: Exponentially increasing delay
    - exponential_jitter: Exponential with random jitter
    """

    MAX_RETRIES = 10
    MAX_DELAY = 300  # 5 minutes

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute with retry logic."""
        max_attempts = min(data.inputs.get("max_attempts", 3), self.MAX_RETRIES)
        delay = data.inputs.get("delay", 1)
        strategy = data.inputs.get("strategy", "exponential")
        retry_on = data.inputs.get("retry_on", [])  # List of error types to retry
        stop_on = data.inputs.get("stop_on", [])  # List of error types to stop on

        wrapped_node_type = data.inputs.get("_wrapped_node_type")
        wrapped_inputs = data.inputs.get("_wrapped_inputs", {})

        attempts = []

        for attempt in range(1, max_attempts + 1):
            attempt_start = datetime.now(timezone.utc)

            try:
                result = await self._execute_wrapped(
                    wrapped_node_type, wrapped_inputs, context
                )

                attempts.append(
                    {
                        "attempt": attempt,
                        "success": True,
                        "started_at": attempt_start.isoformat(),
                        "duration": (
                            datetime.now(timezone.utc) - attempt_start
                        ).total_seconds(),
                    }
                )

                return {
                    "success": True,
                    "result": result,
                    "attempts": attempts,
                    "total_attempts": attempt,
                }

            except Exception as e:
                error_type = type(e).__name__
                error_message = str(e)

                attempts.append(
                    {
                        "attempt": attempt,
                        "success": False,
                        "error_type": error_type,
                        "error_message": error_message,
                        "started_at": attempt_start.isoformat(),
                        "duration": (
                            datetime.now(timezone.utc) - attempt_start
                        ).total_seconds(),
                    }
                )

                # Check if we should stop
                if error_type in stop_on:
                    break

                # Check if we should retry
                if retry_on and error_type not in retry_on:
                    break

                # Calculate delay for next attempt
                if attempt < max_attempts:
                    wait_time = self._calculate_delay(delay, attempt, strategy)
                    await asyncio.sleep(wait_time)

        # All attempts failed
        return {
            "success": False,
            "result": None,
            "attempts": attempts,
            "total_attempts": len(attempts),
            "last_error": attempts[-1]["error_message"] if attempts else None,
        }

    def _calculate_delay(
        self, base_delay: float, attempt: int, strategy: str
    ) -> float:
        """Calculate delay before next retry."""
        if strategy == "fixed":
            return min(base_delay, self.MAX_DELAY)

        elif strategy == "linear":
            return min(base_delay * attempt, self.MAX_DELAY)

        elif strategy == "exponential":
            return min(base_delay * (2 ** (attempt - 1)), self.MAX_DELAY)

        elif strategy == "exponential_jitter":
            exp_delay = base_delay * (2 ** (attempt - 1))
            jitter = random.uniform(0, exp_delay)
            return min(exp_delay + jitter, self.MAX_DELAY)

        else:
            return min(base_delay, self.MAX_DELAY)

    async def _execute_wrapped(
        self, node_type: str, inputs: dict, context: ExecutionContext
    ) -> Any:
        """Execute the wrapped node."""
        from app.orchestrator.node_registry import get_executor

        executor_class = get_executor(node_type)
        if executor_class is None:
            raise ValueError(f"No executor found for node type: {node_type}")

        executor = executor_class()
        return await executor.execute(
            data=NodeExecutionData(inputs=inputs),
            context=context,
        )
