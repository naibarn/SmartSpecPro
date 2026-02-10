"""Retry Executor - Automatically retry failed operations with configurable backoff."""
import asyncio
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)


class RetryExecutor:
    """
    Executor for retry nodes.

    Wraps an upstream operation and automatically re-executes it using
    configurable backoff strategies. Supports three strategies: fixed,
    exponential, and linear. Includes error type classification and
    filtering to control which failures trigger retries.

    This executor never raises exceptions. It always returns a result dict
    with a ``succeeded`` flag so downstream nodes can branch accordingly.
    """

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute the retry node.

        The retry node wraps an upstream operation. It receives the
        operation's callable via ``context.extra_data["retry_target_fn"]``
        (orchestrator-injected mode), or falls back to a passthrough that
        returns the data from ``data.inputs["input"]``.

        Args:
            data: Node execution data containing config and inputs.
            context: Execution context with workflow/execution IDs.

        Returns:
            dict with keys: output, attemptNumber, totalRetries,
            totalDelay, lastError, succeeded.  Never raises.
        """
        config = data.config
        inputs = data.inputs

        # Extract configuration with defaults and validation
        max_attempts = self._validate_max_attempts(config.get("maxAttempts", 3))
        strategy = self._validate_strategy(config.get("strategy", "exponential"))
        initial_delay = max(0.1, float(config.get("initialDelay", 1)))
        max_delay = max(initial_delay, float(config.get("maxDelay", 60)))
        backoff_multiplier = max(1.0, float(config.get("backoffMultiplier", 2)))
        retry_on_errors: list[str] = config.get("retryOnErrors", ["all"])
        stop_on_success: bool = config.get("stopOnSuccess", True)

        # The operation to retry.  Injected by the orchestrator as a callable.
        # Falls back to a passthrough that returns the input data.
        retry_target = context.extra_data.get("retry_target_fn")

        # Track retry metrics
        total_delay_ms = 0.0
        last_error: dict[str, Any] | None = None
        attempt = 0

        for attempt in range(1, max_attempts + 1):
            # Calculate and apply delay
            delay_seconds = self._calculate_delay(
                attempt, strategy, initial_delay, max_delay, backoff_multiplier
            )

            if delay_seconds > 0:
                logger.info(
                    "retry_waiting",
                    node_id=data.node_id,
                    execution_id=context.execution_id,
                    attempt=attempt,
                    delay_seconds=round(delay_seconds, 2),
                    strategy=strategy,
                )
                await asyncio.sleep(delay_seconds)
                total_delay_ms += delay_seconds * 1000

            # Attempt execution
            try:
                logger.info(
                    "retry_attempt",
                    node_id=data.node_id,
                    execution_id=context.execution_id,
                    attempt=attempt,
                    max_attempts=max_attempts,
                )

                if retry_target is not None:
                    result = await retry_target(data, context)
                else:
                    # Passthrough mode: the input data IS the result.
                    # The orchestrator uses this when the retry node wraps
                    # an edge rather than a callable.
                    input_data = inputs.get("input")
                    if input_data is None:
                        raise ValueError("No input data or retry target function provided")
                    result = {"output": input_data}

                # Success
                if stop_on_success:
                    logger.info(
                        "retry_succeeded",
                        node_id=data.node_id,
                        execution_id=context.execution_id,
                        attempt=attempt,
                        total_delay_ms=round(total_delay_ms, 2),
                    )
                    return {
                        "output": (
                            result.get("output", result) if isinstance(result, dict) else result
                        ),
                        "attemptNumber": attempt,
                        "totalRetries": attempt - 1,
                        "totalDelay": round(total_delay_ms, 2),
                        "lastError": None,
                        "succeeded": True,
                    }

            except Exception as exc:
                error_type = self._classify_error(exc)
                last_error = {
                    "type": error_type,
                    "message": str(exc),
                    "attempt": attempt,
                    "exceptionClass": type(exc).__name__,
                }

                logger.warning(
                    "retry_attempt_failed",
                    node_id=data.node_id,
                    execution_id=context.execution_id,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    error_type=error_type,
                    error_message=str(exc),
                )

                # Check if this error type should trigger a retry
                if not self._should_retry(exc, retry_on_errors):
                    logger.info(
                        "retry_skipped_non_retryable",
                        node_id=data.node_id,
                        error_type=error_type,
                        retry_on_errors=retry_on_errors,
                    )
                    break

                # If this was the last attempt, don't wait
                if attempt == max_attempts:
                    break

        # All attempts exhausted or non-retryable error
        logger.error(
            "retry_exhausted",
            node_id=data.node_id,
            execution_id=context.execution_id,
            total_attempts=attempt,
            total_delay_ms=round(total_delay_ms, 2),
            last_error=last_error,
        )

        return {
            "output": None,
            "attemptNumber": attempt,
            "totalRetries": attempt - 1,
            "totalDelay": round(total_delay_ms, 2),
            "lastError": last_error,
            "succeeded": False,
        }

    # ------------------------------------------------------------------
    # Backoff calculation
    # ------------------------------------------------------------------

    def _calculate_delay(
        self,
        attempt: int,
        strategy: str,
        initial_delay: float,
        max_delay: float,
        backoff_multiplier: float,
    ) -> float:
        """
        Calculate the delay in seconds before the given attempt.

        Attempt 1 always returns 0 (execute immediately).
        Attempt 2+ applies the chosen strategy.

        Args:
            attempt: 1-indexed attempt number.
            strategy: One of "fixed", "exponential", "linear".
            initial_delay: Base delay in seconds.
            max_delay: Maximum delay cap in seconds.
            backoff_multiplier: Multiplier for exponential strategy.

        Returns:
            Delay in seconds (float).

        Raises:
            ValueError: If strategy is not recognised.
        """
        if attempt <= 1:
            return 0.0

        if strategy == "fixed":
            raw_delay = initial_delay
        elif strategy == "exponential":
            raw_delay = initial_delay * (backoff_multiplier ** (attempt - 2))
        elif strategy == "linear":
            raw_delay = initial_delay * (attempt - 1)
        else:
            raise ValueError(f"Unknown retry strategy: {strategy}")

        return min(raw_delay, max_delay)

    # ------------------------------------------------------------------
    # Error classification and filtering
    # ------------------------------------------------------------------

    def _classify_error(self, error: Exception) -> str:
        """
        Classify an exception into a retry-filterable error type string.

        Returns a lowercase identifier:
        - "timeout"       -- asyncio.TimeoutError, httpx.TimeoutException
        - "rate_limit"    -- 429 responses, RateLimitError
        - "server_error"  -- 5xx responses, InternalServerError
        - "connection"    -- ConnectionError, ConnectError
        - "validation"    -- ValueError, TypeError, ValidationError
        - "unknown"       -- anything else
        """
        error_type_name = type(error).__name__.lower()
        error_msg = str(error).lower()

        if "timeout" in error_type_name or "timeout" in error_msg:
            return "timeout"
        if "ratelimit" in error_type_name or "429" in error_msg or "rate" in error_msg:
            return "rate_limit"
        if "connection" in error_type_name:
            return "connection"
        if any(code in error_msg for code in ("500", "502", "503", "504")):
            return "server_error"
        if "validation" in error_type_name or isinstance(error, (ValueError, TypeError)):
            return "validation"
        return "unknown"

    def _should_retry(self, error: Exception, retry_on_errors: list[str]) -> bool:
        """
        Determine whether this error should trigger a retry.

        Args:
            error: The caught exception.
            retry_on_errors: List of error type strings to retry on.
                             ``["all"]`` means retry on any error.

        Returns:
            True if this error type is in the retry list.
        """
        if not retry_on_errors or "all" in retry_on_errors:
            return True

        classified = self._classify_error(error)
        return classified in retry_on_errors

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    def _validate_max_attempts(self, value: Any) -> int:
        """Validate and clamp maxAttempts to [1, 10]."""
        try:
            n = int(value)
        except (TypeError, ValueError):
            return 3  # default
        return max(1, min(n, 10))

    def _validate_strategy(self, value: Any) -> str:
        """Validate strategy is one of the known values."""
        valid = {"fixed", "exponential", "linear"}
        if value in valid:
            return value
        raise ValueError(
            f"Invalid retry strategy '{value}'. " f"Must be one of: {', '.join(sorted(valid))}"
        )
