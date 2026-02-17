"""Try Catch Executor - Wrap execution with error handling and retry logic."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class TryCatchExecutor:
    """
    Execute wrapped node with retry and fallback handling.

    Features:
    - Configurable retry count (0 = no retry)
    - Exponential backoff
    - Fallback value on failure
    - Error details output
    """

    MAX_RETRIES = 5
    BASE_DELAY = 1  # seconds

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute with retry and error handling."""
        retry_count = min(data.inputs.get("retry_count", 0), self.MAX_RETRIES)
        retry_delay = data.inputs.get("retry_delay", self.BASE_DELAY)
        fallback_value = data.inputs.get("fallback_value")
        continue_on_error = data.inputs.get("continue_on_error", False)

        # Note: In real implementation, wrapped node would be resolved
        # by the workflow runtime before calling this executor
        wrapped_node_type = data.inputs.get("_wrapped_node_type")
        wrapped_inputs = data.inputs.get("_wrapped_inputs", {})

        last_error = None
        attempts = []

        for attempt in range(retry_count + 1):
            attempt_start = datetime.now(timezone.utc)

            try:
                # Execute wrapped node
                result = await self._execute_wrapped(
                    wrapped_node_type, wrapped_inputs, context
                )

                attempts.append(
                    {
                        "attempt": attempt + 1,
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
                    "error": None,
                    "attempts": attempts,
                }

            except Exception as e:
                last_error = str(e)
                error_type = type(e).__name__

                attempts.append(
                    {
                        "attempt": attempt + 1,
                        "success": False,
                        "error": last_error,
                        "error_type": error_type,
                        "started_at": attempt_start.isoformat(),
                        "duration": (
                            datetime.now(timezone.utc) - attempt_start
                        ).total_seconds(),
                    }
                )

                logger.warning(
                    f"TryCatch attempt {attempt + 1} failed: {last_error}",
                    extra={"attempt": attempt + 1, "error_type": error_type},
                )

                if attempt < retry_count:
                    # Calculate backoff delay
                    backoff = retry_delay * (2**attempt)
                    logger.info(
                        f"Retrying in {backoff}s (attempt {attempt + 2}/{retry_count + 1})"
                    )
                    await asyncio.sleep(backoff)

        # All retries failed
        if continue_on_error:
            return {
                "success": False,
                "result": fallback_value,
                "error": {
                    "message": last_error,
                    "type": error_type,
                    "attempts": retry_count + 1,
                },
                "attempts": attempts,
            }
        else:
            # Re-raise the last error
            raise RuntimeError(
                f"TryCatch failed after {retry_count + 1} attempts. "
                f"Last error: {last_error}"
            )

    async def _execute_wrapped(
        self, node_type: Optional[str], inputs: dict, context: ExecutionContext
    ) -> Any:
        """Execute the wrapped node (placeholder)."""
        # This would be implemented by the workflow runtime
        # to resolve and execute the wrapped node
        if node_type is None:
            raise ValueError("No wrapped node configured")

        # Import here to avoid circular dependency
        from app.orchestrator.node_registry import get_executor

        executor_class = get_executor(node_type)
        if executor_class is None:
            raise ValueError(f"No executor found for node type: {node_type}")

        executor = executor_class()

        return await executor.execute(
            data=NodeExecutionData(inputs=inputs),
            context=context,
        )
