"""Schedule Trigger Executor - Trigger workflow on cron schedule."""

import asyncio
from datetime import datetime, timezone
from typing import Any

try:
    from croniter import croniter
except ImportError:
    croniter = None

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ScheduleTriggerExecutor:
    """
    Schedule-based workflow trigger.

    Features:
    - Cron expression support
    - Timezone handling
    - Persistent storage
    - Missed execution handling

    Note: Full scheduling service needs to be implemented separately.
    This executor runs when the scheduled time is reached.
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """
        This executor is called when the scheduled time is reached.
        Returns trigger data for the workflow.
        """
        schedule_id = data.inputs.get("schedule_id")
        scheduled_time = data.inputs.get("scheduled_time")

        return {
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "scheduled_time": scheduled_time,
            "schedule_id": schedule_id,
            "trigger_data": data.inputs.get("trigger_data", {}),
        }

    @staticmethod
    def validate_cron(cron: str) -> bool:
        """Validate cron expression."""
        if croniter is None:
            # Fallback validation for basic format
            parts = cron.split()
            if len(parts) != 5:
                return False
            return True

        try:
            croniter(cron)
            return True
        except (ValueError, KeyError):
            return False

    @staticmethod
    def get_next_run(cron: str, timezone_str: str = "UTC") -> datetime:
        """Get next scheduled run time."""
        if croniter is None:
            raise ImportError("croniter library required for schedule calculations")

        from pytz import timezone as pytz_timezone

        tz = pytz_timezone(timezone_str)
        now = datetime.now(tz)

        itr = croniter(cron, now)
        return itr.get_next(datetime)


class SchedulerService:
    """
    Centralized scheduling service for workflow triggers.

    Uses asyncio for scheduling within the application.
    For production, consider external scheduler (APScheduler/Celery).
    """

    def __init__(self, db_pool=None):
        self.db_pool = db_pool
        self.schedules = {}  # schedule_id -> task
        self.running = False

    async def start(self):
        """Start the scheduler."""
        self.running = True
        # TODO: Load schedules from database
        asyncio.create_task(self._scheduler_loop())

    async def stop(self):
        """Stop the scheduler."""
        self.running = False
        for task in self.schedules.values():
            task.cancel()

    async def _scheduler_loop(self):
        """Main scheduler loop."""
        while self.running:
            # TODO: Check for due schedules and trigger workflows
            await asyncio.sleep(60)  # Check every minute

    async def add_schedule(
        self,
        schedule_id: str,
        workflow_id: str,
        cron: str,
        timezone: str = "UTC",
        trigger_data: dict[str, Any] | None = None,
    ):
        """Add a new schedule (placeholder)."""
        if not ScheduleTriggerExecutor.validate_cron(cron):
            raise ValueError(f"Invalid cron expression: {cron}")

        # TODO: Save to database and schedule execution
        pass

    async def remove_schedule(self, schedule_id: str):
        """Remove a schedule (placeholder)."""
        if schedule_id in self.schedules:
            self.schedules[schedule_id].cancel()
            del self.schedules[schedule_id]
