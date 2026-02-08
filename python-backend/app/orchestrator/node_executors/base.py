"""Base executor protocol and data structures."""
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class ExecutionContext:
    """Context for node execution."""

    user_id: int
    tenant_id: str | None
    workflow_id: str
    execution_id: str
    credits_available: int = 0


@dataclass
class NodeExecutionData:
    """Data for node execution."""

    node_id: str
    node_type: str
    config: dict[str, Any]  # Node configuration
    inputs: dict[str, Any]  # Resolved input values
    state: dict[str, Any]  # Execution state (outputs from previous nodes)


class NodeExecutor(Protocol):
    """Protocol for node executors."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute the node and return outputs.

        Returns:
            dict mapping output port names to values
        """
        ...
