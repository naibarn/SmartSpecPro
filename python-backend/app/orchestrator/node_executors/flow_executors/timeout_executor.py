"""Execution Timeout Executor - Enforce time limits on workflow operations."""
import asyncio
import time
import traceback
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

# Maximum allowed cleanup time for soft mode (seconds)
SOFT_CLEANUP_TIMEOUT = 5.0


class ExecutionTimeoutError(Exception):
    """Raised when an operation exceeds its configured timeout."""

    def __init__(self, timeout_seconds: float, execution_time_ms: float, message: str = ""):
        self.timeout_seconds = timeout_seconds
        self.execution_time_ms = execution_time_ms
        super().__init__(message or f"Operation timed out after {timeout_seconds}s")


class TimeoutExecutor:
    """Executor for execution timeout nodes.

    Enforces configurable time limits on upstream operations. Supports three modes:
    - hard: Cancel immediately on timeout, raise error
    - soft: Cancel with cleanup window, raise error
    - fallback: Cancel on timeout, return configured fallback value

    Phase 1 behavior: When inputs are already resolved by the orchestrator, the
    executor acts as a pass-through recording timing metadata. When a _pending_future
    is provided in the execution state (Phase 2 orchestrator enhancement),
    asyncio.wait_for enforces the actual deadline.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute timeout enforcement on the input operation.

        When the input is already resolved (synchronous pass-through), this records
        timing metadata. When a _pending_future is provided in the execution state
        (async orchestrator mode), asyncio.wait_for enforces the actual deadline.

        Args:
            data: Node execution data with timeout configuration
            context: Execution context

        Returns:
            Dictionary with result, timedOut flag, executionTime, and error details

        Raises:
            ExecutionTimeoutError: In hard/soft mode when timeout occurs
            ValueError: If configuration is invalid
        """
        # --- Extract and validate configuration ---
        timeout_seconds = data.inputs.get("timeout")
        timeout_mode = data.inputs.get("timeoutMode", "hard")
        fallback_value = data.inputs.get("fallbackValue")
        include_stack_trace = data.inputs.get("includeStackTrace", True)

        if timeout_seconds is None:
            raise ValueError("Timeout value is required")

        timeout_seconds = float(timeout_seconds)
        if timeout_seconds < 1 or timeout_seconds > 3600:
            raise ValueError(f"Timeout must be between 1 and 3600 seconds, got {timeout_seconds}")

        if timeout_mode not in ("hard", "soft", "fallback"):
            raise ValueError(
                f"Invalid timeout mode: {timeout_mode}. Must be 'hard', 'soft', or 'fallback'"
            )

        logger.info(
            "timeout_node_executing",
            node_id=data.node_id,
            timeout_seconds=timeout_seconds,
            timeout_mode=timeout_mode,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
        )

        # --- Check for pending async operation ---
        pending_future = data.state.get("_pending_future")

        if pending_future is not None and asyncio.isfuture(pending_future):
            # Async mode: enforce deadline on the pending operation
            return await self._execute_with_timeout(
                future=pending_future,
                timeout_seconds=timeout_seconds,
                timeout_mode=timeout_mode,
                fallback_value=fallback_value,
                include_stack_trace=include_stack_trace,
                data=data,
                context=context,
            )
        else:
            # Sync pass-through: input already resolved, record timing
            return self._pass_through(
                input_value=data.inputs.get("input"),
                data=data,
                context=context,
            )

    async def _execute_with_timeout(
        self,
        future: asyncio.Future,
        timeout_seconds: float,
        timeout_mode: str,
        fallback_value: Any,
        include_stack_trace: bool,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute an async operation with timeout enforcement."""
        start_time = time.monotonic()

        try:
            result = await asyncio.wait_for(future, timeout=timeout_seconds)
            execution_time_ms = (time.monotonic() - start_time) * 1000

            logger.info(
                "timeout_node_completed",
                node_id=data.node_id,
                execution_time_ms=round(execution_time_ms, 2),
                timed_out=False,
                workflow_id=context.workflow_id,
            )

            return {
                "result": result,
                "timedOut": False,
                "executionTime": round(execution_time_ms, 2),
                "error": None,
            }

        except TimeoutError:
            execution_time_ms = (time.monotonic() - start_time) * 1000
            return await self._handle_timeout(
                timeout_seconds=timeout_seconds,
                timeout_mode=timeout_mode,
                fallback_value=fallback_value,
                include_stack_trace=include_stack_trace,
                execution_time_ms=execution_time_ms,
                data=data,
                context=context,
            )

    async def _handle_timeout(
        self,
        timeout_seconds: float,
        timeout_mode: str,
        fallback_value: Any,
        include_stack_trace: bool,
        execution_time_ms: float,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Handle a timeout event according to the configured mode."""
        error_info = self._build_error_info(
            timeout_seconds=timeout_seconds,
            execution_time_ms=execution_time_ms,
            timeout_mode=timeout_mode,
            include_stack_trace=include_stack_trace,
            data=data,
            context=context,
        )

        logger.warning(
            "timeout_node_timed_out",
            node_id=data.node_id,
            timeout_seconds=timeout_seconds,
            timeout_mode=timeout_mode,
            execution_time_ms=round(execution_time_ms, 2),
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
        )

        if timeout_mode == "fallback":
            # Return fallback value without raising
            return {
                "result": fallback_value,
                "timedOut": True,
                "executionTime": round(execution_time_ms, 2),
                "error": error_info,
            }

        elif timeout_mode == "soft":
            # Run cleanup handler if provided, then raise
            cleanup_coro = data.state.get("_cleanup_handler")
            if cleanup_coro is not None and asyncio.iscoroutine(cleanup_coro):
                try:
                    await asyncio.wait_for(cleanup_coro, timeout=SOFT_CLEANUP_TIMEOUT)
                    logger.info(
                        "timeout_cleanup_completed",
                        node_id=data.node_id,
                    )
                except TimeoutError:
                    logger.warning(
                        "timeout_cleanup_timed_out",
                        node_id=data.node_id,
                        cleanup_timeout=SOFT_CLEANUP_TIMEOUT,
                    )
                except Exception as cleanup_err:
                    logger.error(
                        "timeout_cleanup_failed",
                        node_id=data.node_id,
                        error=str(cleanup_err),
                    )

            raise ExecutionTimeoutError(
                timeout_seconds=timeout_seconds,
                execution_time_ms=execution_time_ms,
                message=(
                    f"Operation on node '{data.node_id}' timed out after "
                    f"{timeout_seconds}s (soft mode, cleanup attempted)"
                ),
            )

        else:
            # Hard mode: raise immediately
            raise ExecutionTimeoutError(
                timeout_seconds=timeout_seconds,
                execution_time_ms=execution_time_ms,
                message=(
                    f"Operation on node '{data.node_id}' timed out after "
                    f"{timeout_seconds}s (hard mode)"
                ),
            )

    def _pass_through(
        self,
        input_value: Any,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Pass through an already-resolved input value with timing metadata."""
        logger.info(
            "timeout_node_pass_through",
            node_id=data.node_id,
            workflow_id=context.workflow_id,
            note="Input already resolved, no timeout enforcement needed",
        )

        return {
            "result": input_value,
            "timedOut": False,
            "executionTime": 0.0,
            "error": None,
        }

    def _build_error_info(
        self,
        timeout_seconds: float,
        execution_time_ms: float,
        timeout_mode: str,
        include_stack_trace: bool,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Build structured error information for timeout events."""
        error_info: dict[str, Any] = {
            "type": "ExecutionTimeoutError",
            "message": (
                f"Operation exceeded {timeout_seconds}s timeout " f"(mode: {timeout_mode})"
            ),
            "timeoutSeconds": timeout_seconds,
            "executionTimeMs": round(execution_time_ms, 2),
            "mode": timeout_mode,
            "nodeId": data.node_id,
            "workflowId": context.workflow_id,
            "executionId": context.execution_id,
        }

        if include_stack_trace:
            error_info["stackTrace"] = traceback.format_stack()

        return error_info
