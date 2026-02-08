"""Approval Gate node executor."""
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ApprovalExecutor:
    """Executor for Approval Gate nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict:
        """Execute approval gate."""
        # TODO: Integrate with ApprovalDBService
        # For now, auto-approve for development
        input_data = data.inputs.get("data", {})

        return {
            "approved": input_data,
            "rejected": None,
        }
