"""Set Variable Executor - Assign a value to a variable."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class SetExecutor:
    """Executor for set variable nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute set variable - stores a value.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with the assigned value

        Raises:
            ValueError: If variableName is not provided
        """
        variable_name = data.inputs.get("variableName")
        value = data.inputs.get("value")

        if not variable_name:
            raise ValueError("Variable name is required")

        # Store in execution state for expression resolver to access
        # The workflow engine should handle this via {{nodeId.value}}
        # but we also store it in a variables namespace for convenience
        if "variables" not in data.state:
            data.state["variables"] = {}

        data.state["variables"][variable_name] = value

        return {
            "value": value,
        }
