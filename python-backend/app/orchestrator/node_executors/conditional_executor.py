"""Conditional node executor."""
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ConditionalExecutor:
    """Executor for Conditional nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict:
        """Execute conditional logic."""
        value = data.inputs.get("value")

        # Simple boolean evaluation for now
        # TODO: Implement full visual mode and advanced mode with simpleeval
        condition_met = bool(value)

        if condition_met:
            return {"true": value, "false": None}
        else:
            return {"true": None, "false": value}
