"""Form Input Executor - Collect structured input from user."""
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class FormInputExecutor:
    """Executor for form input nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute form input - returns user-submitted form values.

        Args:
            data: Node execution data
            context: Execution context

        Returns:
            Dictionary with form values

        Raises:
            ValueError: If form values not provided in context
        """
        # Form values should be provided in extra_data when workflow is executed
        form_values = context.extra_data.get("form_values", {})

        # Validate that all required fields are present
        field_definitions = data.inputs.get("fields", [])
        if isinstance(field_definitions, list):
            for field_def in field_definitions:
                if isinstance(field_def, dict):
                    field_id = field_def.get("id")
                    is_required = field_def.get("required", False)

                    if is_required and field_id and field_id not in form_values:
                        raise ValueError(
                            f"Required form field '{field_id}' ('{field_def.get('label', field_id)}') "
                            "was not provided"
                        )

        return {
            "values": form_values,
        }
