"""Circuit Breaker Executor - Prevent cascading failures."""

import time
import logging
from enum import Enum
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerExecutor:
    """
    Circuit breaker pattern for fault tolerance.

    Configuration:
    - failure_threshold: Failures before opening (default: 5)
    - recovery_timeout: Seconds before half-open (default: 60)
    - success_threshold: Successes to close (default: 3)
    """

    # In-memory state store (use Redis in production)
    _circuits = {}

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute with circuit breaker protection."""
        circuit_id = data.inputs.get("circuit_id", f"circuit_{context.execution_id}")
        failure_threshold = data.inputs.get("failure_threshold", 5)
        recovery_timeout = data.inputs.get("recovery_timeout", 60)
        success_threshold = data.inputs.get("success_threshold", 3)

        wrapped_node_type = data.inputs.get("_wrapped_node_type")
        wrapped_inputs = data.inputs.get("_wrapped_inputs", {})
        fallback_value = data.inputs.get("fallback_value")

        # Get or create circuit state
        circuit = self._get_circuit_state(circuit_id)

        # Check current state
        if circuit["state"] == CircuitState.OPEN.value:
            if self._should_attempt_reset(circuit, recovery_timeout):
                circuit["state"] = CircuitState.HALF_OPEN.value
                circuit["half_open_attempts"] = 0
            else:
                return {
                    "success": False,
                    "circuit_state": CircuitState.OPEN.value,
                    "result": fallback_value,
                    "reason": "Circuit breaker is OPEN",
                }

        # Execute wrapped node
        try:
            result = await self._execute_wrapped(
                wrapped_node_type, wrapped_inputs, context
            )

            # Success - update circuit
            self._record_success(circuit_id, success_threshold)

            return {
                "success": True,
                "circuit_state": self._get_circuit_state(circuit_id)["state"],
                "result": result,
            }

        except Exception as e:
            # Failure - update circuit
            self._record_failure(circuit_id, failure_threshold)

            return {
                "success": False,
                "circuit_state": self._get_circuit_state(circuit_id)["state"],
                "result": fallback_value,
                "error": str(e),
            }

    def _get_circuit_state(self, circuit_id: str) -> dict:
        """Get circuit state (use Redis in production)."""
        if circuit_id not in self._circuits:
            self._circuits[circuit_id] = {
                "state": CircuitState.CLOSED.value,
                "failures": 0,
                "successes": 0,
                "last_failure_time": None,
                "half_open_attempts": 0,
            }
        return self._circuits[circuit_id]

    def _record_success(self, circuit_id: str, threshold: int):
        """Record successful execution."""
        circuit = self._circuits[circuit_id]

        if circuit["state"] == CircuitState.HALF_OPEN.value:
            circuit["successes"] += 1
            if circuit["successes"] >= threshold:
                circuit["state"] = CircuitState.CLOSED.value
                circuit["failures"] = 0
                circuit["successes"] = 0
        else:
            circuit["failures"] = max(0, circuit["failures"] - 1)

    def _record_failure(self, circuit_id: str, threshold: int):
        """Record failed execution."""
        circuit = self._circuits[circuit_id]

        circuit["failures"] += 1
        circuit["last_failure_time"] = time.time()

        if circuit["state"] == CircuitState.HALF_OPEN.value:
            circuit["state"] = CircuitState.OPEN.value
        elif circuit["failures"] >= threshold:
            circuit["state"] = CircuitState.OPEN.value

    def _should_attempt_reset(self, circuit: dict, timeout: int) -> bool:
        """Check if enough time has passed to try half-open."""
        if not circuit["last_failure_time"]:
            return True
        return (time.time() - circuit["last_failure_time"]) >= timeout

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
