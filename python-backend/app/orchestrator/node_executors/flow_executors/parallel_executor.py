"""Parallel Executor - Execute multiple branches."""

import logging
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class ParallelExecutor:
    """
    Execute multiple branches.

    NOTE: Current implementation executes sequentially.
    True parallel execution requires runtime engine changes.
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute branches and collect results."""
        branches = data.inputs.get("branches", [])

        results = {}
        errors = {}

        for i, branch in enumerate(branches):
            branch_id = branch.get("id", f"branch_{i}")

            try:
                result = await self._execute_branch(branch, context)
                results[branch_id] = result
            except Exception as e:
                errors[branch_id] = {
                    "error": str(e),
                    "type": type(e).__name__,
                }

        return {
            "results": results,
            "errors": errors,
            "completed_branches": len(results),
            "failed_branches": len(errors),
            "total_branches": len(branches),
        }

    async def _execute_branch(
        self, branch: dict, context: ExecutionContext
    ) -> Any:
        """Execute a single branch."""
        from app.orchestrator.node_registry import get_executor

        node_type = branch.get("node_type")
        inputs = branch.get("inputs", {})

        executor_class = get_executor(node_type)
        if executor_class is None:
            raise ValueError(f"No executor found for node type: {node_type}")

        executor = executor_class()
        return await executor.execute(
            data=NodeExecutionData(inputs=inputs),
            context=context,
        )


class JoinExecutor:
    """
    Wait for parallel branches and combine results.

    Join Strategies:
    - all: Wait for all branches (default)
    - any: Return on first completion
    - n: Wait for N branches
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Join parallel results."""
        parallel_results = data.inputs.get("_parallel_results", [])
        strategy = data.inputs.get("strategy", "all")
        required_count = data.inputs.get("required_count")

        if not parallel_results:
            return {
                "joined": False,
                "reason": "No parallel results to join",
                "results": [],
            }

        # Apply join strategy
        if strategy == "all":
            results = parallel_results
        elif strategy == "any":
            results = [parallel_results[0]] if parallel_results else []
        elif strategy == "n" and required_count:
            results = parallel_results[:required_count]
        else:
            results = parallel_results

        # Merge results based on merge strategy
        merge_strategy = data.inputs.get("merge_strategy", "object")
        merged = self._merge_results(results, merge_strategy)

        return {
            "joined": True,
            "results": results,
            "merged": merged,
            "strategy": strategy,
            "total_results": len(parallel_results),
            "joined_results": len(results),
        }

    def _merge_results(self, results: list, strategy: str) -> Any:
        """Merge multiple results into one."""
        if strategy == "array":
            return results

        elif strategy == "object":
            merged = {}
            for i, result in enumerate(results):
                key = result.get("_branch_id", f"branch_{i}")
                merged[key] = result
            return merged

        elif strategy == "concat":
            merged = []
            for result in results:
                if isinstance(result, list):
                    merged.extend(result)
                else:
                    merged.append(result)
            return merged

        elif strategy == "sum":
            return sum(
                r.get("value", 0) if isinstance(r, dict) else r or 0
                for r in results
            )

        return results
