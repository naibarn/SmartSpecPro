"""Loop node executor."""
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class LoopExecutor:
    """Executor for loop nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict:
        """Execute loop."""
        loop_data = data.inputs.get("data", [])
        results = []

        # Simple iteration for now
        if isinstance(loop_data, list):
            for idx, item in enumerate(loop_data):
                results.append(item)

        return {
            "item": loop_data[0] if loop_data else None,
            "results": results,
            "index": 0,
        }
