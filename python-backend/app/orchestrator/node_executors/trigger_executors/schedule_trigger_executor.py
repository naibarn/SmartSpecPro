"""Schedule Trigger Executor - Start workflow on a schedule."""
from datetime import datetime, timezone
from typing import Any

import structlog
from croniter import croniter

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger()


class ScheduleTriggerExecutor:
    """Executor for schedule trigger nodes.

    Validates the cron expression from the node config, returns the
    current execution timestamp and computes the next scheduled run.

    The actual scheduling (polling workflowSchedules table and triggering
    workflows) is handled by a Celery periodic task, not by this executor.
    This executor runs WHEN the schedule fires and produces the trigger
    output for downstream nodes.

    Output ports:
        - timestamp (text): ISO 8601 timestamp of this scheduled execution.
        - cronExpression (text): The cron expression that triggered this run.
        - nextRun (text): ISO 8601 timestamp of the next scheduled execution.
        - timezone (text): IANA timezone used for scheduling.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute schedule trigger - returns execution timestamp and schedule metadata.

        Args:
            data: Node execution data with config containing schedule (cron) and timezone.
            context: Execution context with optional scheduled_time in extra_data.

        Returns:
            Dictionary with timestamp, cronExpression, nextRun, and timezone.

        Raises:
            ValueError: If the cron expression in config is invalid.
        """
        # Get the scheduled execution time (provided by scheduler task)
        execution_time = context.extra_data.get(
            "scheduled_time",
            datetime.now(timezone.utc).isoformat(),
        )

        # Get cron config
        cron_expression = data.config.get("schedule", "")
        tz_name = data.config.get("timezone", "UTC")

        # Validate cron expression
        next_run = None
        if cron_expression:
            if not croniter.is_valid(cron_expression):
                raise ValueError(
                    f"Invalid cron expression: '{cron_expression}'. "
                    f"Expected 5-field cron format (e.g., '0 9 * * 1' for Monday 9am)."
                )

            # Calculate next run from now
            try:
                import zoneinfo
                tz = zoneinfo.ZoneInfo(tz_name)
                now = datetime.now(tz)
                cron = croniter(cron_expression, now)
                next_dt = cron.get_next(datetime)
                next_run = next_dt.isoformat()
            except Exception as exc:
                logger.warning(
                    "schedule_next_run_calculation_failed",
                    cron=cron_expression,
                    timezone=tz_name,
                    error=str(exc),
                )
                # Non-fatal: we still return the execution timestamp

        return {
            "timestamp": execution_time,
            "cronExpression": cron_expression,
            "nextRun": next_run,
            "timezone": tz_name,
        }
