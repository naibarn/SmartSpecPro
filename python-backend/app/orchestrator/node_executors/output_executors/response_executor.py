"""Workflow Response Executor - Return final output from workflow."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ResponseExecutor:
    """Executor for workflow response nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute workflow response - marks the workflow output.

        This executor doesn't return any output ports (as it's a terminal node),
        but it stores the response data in the execution context for the
        workflow engine to pick up.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Empty dictionary (terminal node)
        """
        # Get response data and status from inputs
        response_data = data.inputs.get("data")
        status = data.inputs.get("status", "success")

        # Store in context.extra_data for workflow engine to retrieve
        context.extra_data["workflow_response"] = {
            "data": response_data,
            "status": status,
        }

        # Terminal node - no outputs to pass to downstream nodes
        return {}
