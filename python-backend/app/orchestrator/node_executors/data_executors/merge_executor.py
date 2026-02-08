"""Merge Data Executor - Combine multiple data sources."""
import copy
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class MergeExecutor:
    """Executor for merge data nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute merge data - combines multiple objects into one.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with merged data

        Raises:
            ValueError: If sources is not an array or strategy is invalid
        """
        sources = data.inputs.get("sources", [])
        strategy = data.inputs.get("strategy", "overwrite")

        if not isinstance(sources, list):
            raise ValueError("Sources must be an array")

        if strategy not in ["overwrite", "keep_first", "deep_merge"]:
            raise ValueError(f"Invalid merge strategy: {strategy}")

        # Filter out None values
        valid_sources = [s for s in sources if s is not None]

        if not valid_sources:
            return {"merged": {}}

        # Apply merge strategy
        if strategy == "overwrite":
            # Last value wins for each key
            result = {}
            for source in valid_sources:
                if isinstance(source, dict):
                    result.update(source)
        elif strategy == "keep_first":
            # First value wins for each key
            result = {}
            for source in valid_sources:
                if isinstance(source, dict):
                    for key, value in source.items():
                        if key not in result:
                            result[key] = value
        else:  # deep_merge
            # Recursively merge nested objects
            result = self._deep_merge(valid_sources)

        return {"merged": result}

    def _deep_merge(self, sources: list[Any]) -> dict[str, Any]:
        """
        Deep merge multiple dictionaries recursively.

        Args:
            sources: List of dictionaries to merge

        Returns:
            Merged dictionary
        """
        result: dict[str, Any] = {}

        for source in sources:
            if not isinstance(source, dict):
                continue

            for key, value in source.items():
                if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                    # Both are dicts - recursively merge
                    result[key] = self._deep_merge([result[key], value])
                else:
                    # Overwrite with new value
                    result[key] = copy.deepcopy(value)

        return result
