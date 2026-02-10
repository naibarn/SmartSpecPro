"""Error Trigger Executor - Start workflow when another workflow fails."""
from datetime import datetime, timezone
import structlog
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class ErrorTriggerExecutor:
    """Executor for error trigger nodes.

    This trigger starts a workflow when another workflow fails. It's commonly
    used for:
    - Error notification workflows
    - Automatic retry workflows
    - Error logging and analysis
    - Fallback/recovery workflows

    The actual error monitoring is handled by the workflow execution engine,
    which watches for workflow failures and triggers error workflows
    automatically.

    Output ports:
        - error (json): Error details including message, stack trace, node_id.
        - workflowId (text): The ID of the workflow that failed.
        - timestamp (text): ISO 8601 timestamp when the error occurred.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute error trigger - returns error details from failed workflow.

        Args:
            data: Node execution data with config (watchWorkflow, errorTypes).
            context: Execution context with trigger_error in extra_data.

        Returns:
            Dictionary with error details, workflowId, and timestamp.

        Raises:
            ValueError: If trigger_error data is missing from context.
        """
        # Get error data from context (injected by error monitor)
        trigger_error = context.extra_data.get("trigger_error", {})

        if not trigger_error:
            raise ValueError(
                "No error data provided. This trigger must be "
                "invoked by the error monitoring service."
            )

        error_details = trigger_error.get("error", {})
        workflow_id = trigger_error.get("workflowId", "")
        error_timestamp = trigger_error.get(
            "timestamp",
            datetime.now(timezone.utc).isoformat(),
        )

        # Validate workflow ID matches watch configuration (if configured)
        watch_workflow = data.config.get("watchWorkflow", "")
        if watch_workflow and workflow_id != watch_workflow:
            raise ValueError(
                f"Workflow ID mismatch. Expected '{watch_workflow}', "
                f"got '{workflow_id}' from error monitor."
            )

        # Validate error type matches configured error types (if configured)
        configured_error_types = data.config.get("errorTypes", ["all"])
        error_type = error_details.get("type", "unknown")

        if "all" not in configured_error_types:
            if error_type not in configured_error_types:
                logger.info(
                    "error_filtered_out",
                    error_type=error_type,
                    configured_types=configured_error_types,
                )
                raise ValueError(
                    f"Error type '{error_type}' is not in configured types: {configured_error_types}"
                )

        logger.info(
            "error_trigger_executed",
            workflow_id=workflow_id,
            error_type=error_type,
            watch_workflow=watch_workflow,
        )

        return {
            "error": error_details,
            "workflowId": workflow_id,
            "timestamp": error_timestamp,
        }
