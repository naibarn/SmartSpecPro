"""Base executor protocol and data structures."""
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ExecutionContext:
    """Context for node execution."""

    user_id: int
    tenant_id: str | None
    workflow_id: str
    execution_id: str
    credits_available: int = 0
    extra_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class NodeExecutionData:
    """Data for node execution."""

    node_id: str
    node_type: str
    config: dict[str, Any]  # Node configuration
    inputs: dict[str, Any]  # Resolved input values
    state: dict[str, Any]  # Execution state (outputs from previous nodes)


@dataclass
class NodeExecutionResult:
    """Structured result returned by executors that need richer output than a plain dict."""

    outputs: dict[str, Any] = field(default_factory=dict)
    success: bool = True
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


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
