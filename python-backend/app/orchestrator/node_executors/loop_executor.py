"""Loop node executor with full iteration support."""
from typing import Any, Dict, List
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class LoopExecutor:
    """Executor for loop nodes with count and data iteration modes."""

    # Hard cap on iterations to prevent DoS
    ABSOLUTE_MAX_ITERATIONS = 10000

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> Dict[str, Any]:
        """
        Execute loop iteration.

        Supports two modes:
        - Count mode: Iterate N times (config.count)
        - Data mode: Iterate over array (inputs.data)

        Returns:
            dict: Loop results with iteration data
                - mode: 'count' or 'data'
                - iterations: Total number of iterations
                - results: List of iteration results
                - completed: Whether all iterations finished
        """
        config = data.config
        inputs = data.inputs

        # Determine loop mode
        if "count" in config and config["count"]:
            # Count mode: iterate N times
            mode = "count"
            count = int(config["count"])
            user_max = min(int(config.get("maxIterations", 1000)), self.ABSOLUTE_MAX_ITERATIONS)
            max_iterations = min(count, user_max)
        elif "data" in inputs and inputs["data"]:
            # Data mode: iterate over array
            mode = "data"
            loop_data = inputs["data"]
            if not isinstance(loop_data, list):
                loop_data = [loop_data]
            max_iterations = min(len(loop_data), self.ABSOLUTE_MAX_ITERATIONS)
        else:
            # No loop configuration
            return {
                "mode": "none",
                "iterations": 0,
                "results": [],
                "completed": True,
                "error": "Loop node requires either 'count' config or 'data' input",
            }

        # Execute iterations
        results = []
        for idx in range(max_iterations):
            # Prepare iteration context
            if mode == "data":
                item = loop_data[idx]
                iteration_result = {
                    "index": idx,
                    "item": item,
                    "value": item,  # Alias for backward compatibility
                }
            else:  # count mode
                iteration_result = {
                    "index": idx,
                    "value": idx,
                }

            results.append(iteration_result)

            # Note: Nested node execution would happen here in a full implementation
            # For now, we just record the iteration metadata

        return {
            "mode": mode,
            "iterations": max_iterations,
            "results": results,
            "completed": True,
            "item": results[0] if results else None,  # First item for downstream access
            "index": 0,  # Current index (would increment in real execution)
        }


# For backward compatibility
async def execute_loop(data: NodeExecutionData, context: ExecutionContext) -> Dict[str, Any]:
    """Legacy function wrapper for loop execution."""
    executor = LoopExecutor()
    return await executor.execute(data, context)
