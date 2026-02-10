"""Switch Executor - Multi-way branch based on value matching."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class SwitchExecutor:
    """Executor for switch nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute switch - matches value against cases and returns matched case.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with matched case label and value

        Raises:
            ValueError: If cases configuration is invalid
        """
        value = data.inputs.get("value")
        cases = data.inputs.get("cases", [])
        default_case = data.inputs.get("defaultCase", "default")

        if not isinstance(cases, list):
            raise ValueError("Cases must be a list")

        # Try to match value against each case
        matched_label = default_case

        for case in cases:
            if not isinstance(case, dict):
                continue

            case_match = case.get("match")
            case_label = case.get("label")

            if case_match == value:
                matched_label = case_label or default_case
                break

        # Store matched case in context for flow compiler to route execution
        context.extra_data["switch_matched_case"] = matched_label

        return {
            "matched": matched_label,
            "value": value,
        }
