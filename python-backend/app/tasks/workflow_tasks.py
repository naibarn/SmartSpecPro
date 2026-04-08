"""Workflow-related Celery tasks for schedule monitoring, event handling, and queue processing."""
import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.core.database import get_db_context
from app.models.workflow import Workflow
from app.models.workflow_schedule import WorkflowSchedule
from app.models.workflow_event_subscription import WorkflowEventSubscription
from app.orchestrator.langgraph_runtime import get_langgraph_runtime

logger = structlog.get_logger(__name__)

try:
    from croniter import croniter
except ModuleNotFoundError:  # pragma: no cover - runtime dependency guard
    croniter = None


def _active_workflow_clause():
    """Compare workflow status safely even when the database column is an enum."""
    return cast(Workflow.status, String) == "active"


@celery_app.task(name="app.tasks.workflow_tasks.check_scheduled_workflows")
def check_scheduled_workflows():
    """
    Periodic task (runs every minute) to check for scheduled workflows that need execution.

    Queries workflow_schedules table for active schedules where nextRun <= now,
    triggers workflow execution, and updates nextRun for next execution.
    """
    asyncio.run(_check_scheduled_workflows_async())


async def _check_scheduled_workflows_async():
    """Async implementation of schedule checking."""
    if croniter is None:
        logger.error(
            "schedule_check_dependency_missing",
            dependency="croniter",
            recommendation="Rebuild the Python Celery image so scheduled workflow checks can run.",
        )
        return

    async with get_db_context() as db:
        now = datetime.now(timezone.utc)

        # Query active schedules that are due for execution
        result = await db.execute(
            select(WorkflowSchedule, Workflow)
            .join(Workflow, WorkflowSchedule.workflowId == Workflow.id)
            .where(
                WorkflowSchedule.isActive == True,
                WorkflowSchedule.nextRun <= now,
                _active_workflow_clause(),
            )
        )
        due_schedules = result.all()

        logger.info(
            "schedule_check",
            due_count=len(due_schedules),
            check_time=now.isoformat(),
        )

        for schedule, workflow in due_schedules:
            try:
                # Execute workflow
                await _execute_scheduled_workflow(
                    db=db,
                    workflow=workflow,
                    schedule=schedule,
                )

                # Calculate next run time
                import zoneinfo
                tz = zoneinfo.ZoneInfo(schedule.timezone)
                cron = croniter(schedule.cronExpression, datetime.now(tz))
                next_run = cron.get_next(datetime)

                # Update schedule
                schedule.lastRun = now
                schedule.nextRun = next_run
                await db.commit()

                logger.info(
                    "schedule_executed",
                    workflow_id=workflow.id,
                    schedule_id=schedule.id,
                    next_run=next_run.isoformat(),
                )

            except Exception as e:
                logger.exception(
                    "schedule_execution_failed",
                    workflow_id=workflow.id,
                    schedule_id=schedule.id,
                    error=str(e),
                )
                # Don't block other schedules if one fails
                continue


async def _execute_scheduled_workflow(
    db: AsyncSession,
    workflow: Workflow,
    schedule: WorkflowSchedule,
):
    """Execute a workflow triggered by a schedule."""
    runtime = get_langgraph_runtime()

    # Prepare trigger data
    trigger_data = {
        "scheduledTime": datetime.now(timezone.utc).isoformat(),
        "scheduleId": schedule.id,
        "cronExpression": schedule.cronExpression,
        "timezone": schedule.timezone,
    }

    # Compile and execute workflow
    compiled_graph = await runtime.compile_workflow(
        workflow_definition=workflow.workflowJson,
        workflow_id=str(workflow.id),
    )

    # Execute with schedule trigger data
    execution_id = f"exec-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    config = {
        "configurable": {
            "thread_id": execution_id,
        }
    }

    # Run the workflow (non-blocking)
    await compiled_graph.ainvoke(
        input={"trigger_data": trigger_data},
        config=config,
    )

    logger.info(
        "workflow_triggered_by_schedule",
        workflow_id=workflow.id,
        execution_id=execution_id,
        schedule_id=schedule.id,
    )


@celery_app.task(name="app.tasks.workflow_tasks.process_system_event")
def process_system_event(event_type: str, event_data: dict[str, Any]):
    """
    Process a system event and trigger matching workflow subscriptions.

    Args:
        event_type: Type of event (e.g., "user.created", "skill.completed")
        event_data: Event payload data
    """
    asyncio.run(_process_system_event_async(event_type, event_data))


async def _process_system_event_async(event_type: str, event_data: dict[str, Any]):
    """Async implementation of event processing."""
    async with get_db_context() as db:
        # Query active subscriptions for this event type
        result = await db.execute(
            select(WorkflowEventSubscription, Workflow)
            .join(Workflow, WorkflowEventSubscription.workflowId == Workflow.id)
            .where(
                WorkflowEventSubscription.isActive == True,
                WorkflowEventSubscription.eventType == event_type,
                _active_workflow_clause(),
            )
        )
        subscriptions = result.all()

        logger.info(
            "event_received",
            event_type=event_type,
            subscription_count=len(subscriptions),
        )

        for subscription, workflow in subscriptions:
            try:
                # Check filter conditions
                if subscription.filterConditions:
                    if not _matches_filter(event_data, subscription.filterConditions):
                        logger.info(
                            "event_filtered_out",
                            subscription_id=subscription.id,
                            event_type=event_type,
                        )
                        continue

                # Execute workflow
                await _execute_event_workflow(
                    db=db,
                    workflow=workflow,
                    subscription=subscription,
                    event_type=event_type,
                    event_data=event_data,
                )

                logger.info(
                    "event_workflow_triggered",
                    workflow_id=workflow.id,
                    subscription_id=subscription.id,
                    event_type=event_type,
                )

            except Exception as e:
                logger.exception(
                    "event_workflow_failed",
                    workflow_id=workflow.id,
                    subscription_id=subscription.id,
                    error=str(e),
                )
                continue


def _matches_filter(event_data: dict, filter_conditions: dict) -> bool:
    """Check if event data matches filter conditions (simple key-value matching)."""
    for key, expected_value in filter_conditions.items():
        if event_data.get(key) != expected_value:
            return False
    return True


async def _execute_event_workflow(
    db: AsyncSession,
    workflow: Workflow,
    subscription: WorkflowEventSubscription,
    event_type: str,
    event_data: dict[str, Any],
):
    """Execute a workflow triggered by an event."""
    runtime = get_langgraph_runtime()

    # Prepare trigger data
    trigger_event = {
        "type": event_type,
        "data": event_data,
    }

    # Compile and execute workflow
    compiled_graph = await runtime.compile_workflow(
        workflow_definition=workflow.workflowJson,
        workflow_id=str(workflow.id),
    )

    execution_id = f"exec-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    config = {
        "configurable": {
            "thread_id": execution_id,
        }
    }

    # Execute with event trigger data
    await compiled_graph.ainvoke(
        input={"trigger_event": trigger_event},
        config=config,
    )


@celery_app.task(name="app.tasks.workflow_tasks.process_queue_message")
def process_queue_message(queue_name: str, messages: list[dict[str, Any]]):
    """
    Process messages from a Redis Stream queue and trigger matching workflows.

    Args:
        queue_name: Name of the Redis Stream
        messages: List of message dictionaries
    """
    asyncio.run(_process_queue_message_async(queue_name, messages))


async def _process_queue_message_async(queue_name: str, messages: list[dict[str, Any]]):
    """Async implementation of queue message processing."""
    async with get_db_context() as db:
        # Query all active workflows and find those with queue_trigger nodes for this queue
        result = await db.execute(
            select(Workflow).where(
                _active_workflow_clause(),
            )
        )
        workflows = result.scalars().all()

        logger.info(
            "queue_messages_received",
            queue_name=queue_name,
            message_count=len(messages),
            workflows_checked=len(workflows),
        )

        # Find workflows with matching queue_trigger nodes
        matching_workflows = []
        for workflow in workflows:
            workflow_json = workflow.workflowJson
            if not workflow_json or not isinstance(workflow_json, dict):
                continue

            nodes = workflow_json.get("nodes", [])
            for node in nodes:
                if node.get("type") == "queue_trigger":
                    node_config = node.get("config", {})
                    configured_queue = node_config.get("queueName", "")

                    if configured_queue == queue_name:
                        matching_workflows.append({
                            "workflow": workflow,
                            "node_id": node.get("id"),
                        })
                        break  # Only trigger once per workflow

        logger.info(
            "queue_workflows_matched",
            queue_name=queue_name,
            matched_count=len(matching_workflows),
        )

        # Execute each matching workflow
        for match in matching_workflows:
            workflow = match["workflow"]
            node_id = match["node_id"]

            try:
                await _execute_queue_workflow(
                    db=db,
                    workflow=workflow,
                    node_id=node_id,
                    queue_name=queue_name,
                    messages=messages,
                )

                logger.info(
                    "queue_workflow_triggered",
                    workflow_id=workflow.id,
                    node_id=node_id,
                    queue_name=queue_name,
                    message_count=len(messages),
                )

            except Exception as e:
                logger.exception(
                    "queue_workflow_failed",
                    workflow_id=workflow.id,
                    node_id=node_id,
                    queue_name=queue_name,
                    error=str(e),
                )
                # Continue processing other workflows even if one fails
                continue


async def _execute_queue_workflow(
    db: AsyncSession,
    workflow: Workflow,
    node_id: str,
    queue_name: str,
    messages: list[dict[str, Any]],
):
    """Execute a workflow triggered by a queue message."""
    runtime = get_langgraph_runtime()

    # Prepare trigger data with queue messages
    queue_data = {
        "queue_name": queue_name,
        "messages": messages,
        "consumed_at": datetime.now(timezone.utc).isoformat(),
    }

    # Compile and execute workflow
    compiled_graph = await runtime.compile_workflow(
        workflow_definition=workflow.workflowJson,
        workflow_id=str(workflow.id),
    )

    execution_id = f"exec-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    config = {
        "configurable": {
            "thread_id": execution_id,
        }
    }

    # Execute with queue message data in extra_data
    await compiled_graph.ainvoke(
        input={"queue_messages": queue_data},
        config=config,
    )


@celery_app.task(name="app.tasks.workflow_tasks.execute_webhook_workflow")
def execute_webhook_workflow(
    workflow_id: str,
    node_id: str,
    webhook_request: dict[str, Any],
):
    """
    Execute a workflow triggered by a webhook.

    Args:
        workflow_id: ID of the workflow to execute
        node_id: ID of the webhook trigger node
        webhook_request: Webhook request data (method, headers, query, body, path)
    """
    asyncio.run(_execute_webhook_workflow_async(workflow_id, node_id, webhook_request))


async def _execute_webhook_workflow_async(
    workflow_id: str,
    node_id: str,
    webhook_request: dict[str, Any],
):
    """Async implementation of webhook workflow execution."""
    async with get_db_context() as db:
        # Load workflow
        result = await db.execute(
            select(Workflow).where(Workflow.id == int(workflow_id))
        )
        workflow = result.scalar_one_or_none()

        if not workflow:
            logger.error("webhook_workflow_not_found", workflow_id=workflow_id)
            return

        runtime = get_langgraph_runtime()

        # Compile workflow
        compiled_graph = await runtime.compile_workflow(
            workflow_definition=workflow.workflowJson,
            workflow_id=workflow_id,
        )

        # Execute with webhook trigger data
        execution_id = f"exec-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        config = {
            "configurable": {
                "thread_id": execution_id,
            }
        }

        try:
            await compiled_graph.ainvoke(
                input={"webhook_request": webhook_request},
                config=config,
            )

            logger.info(
                "webhook_workflow_completed",
                workflow_id=workflow_id,
                execution_id=execution_id,
                node_id=node_id,
            )

        except Exception as e:
            logger.exception(
                "webhook_workflow_execution_failed",
                workflow_id=workflow_id,
                execution_id=execution_id,
                error=str(e),
            )


@celery_app.task(name="app.tasks.workflow_tasks.execute_delayed_node")
def execute_delayed_node(
    workflow_id: str,
    execution_id: str,
    node_id: str,
    delay_seconds: int,
):
    """
    Execute a delayed node (Wait node) after specified duration.

    This task is scheduled when a Wait node is encountered during workflow execution.
    After the delay, it resumes the workflow from the wait point.

    Args:
        workflow_id: ID of the workflow
        execution_id: Current execution ID
        node_id: ID of the Wait node
        delay_seconds: Duration to wait (already elapsed when this executes)
    """
    asyncio.run(_execute_delayed_node_async(workflow_id, execution_id, node_id))


async def _execute_delayed_node_async(
    workflow_id: str,
    execution_id: str,
    node_id: str,
):
    """Async implementation of delayed node execution."""
    logger.info(
        "delayed_node_resuming",
        workflow_id=workflow_id,
        execution_id=execution_id,
        node_id=node_id,
        resumed_at=datetime.now(timezone.utc).isoformat(),
    )

    # In production, this would:
    # 1. Load the workflow execution state from checkpoint
    # 2. Resume execution from the Wait node
    # 3. Continue workflow execution

    # For now, this is a placeholder
    logger.info("delayed_node_resumed", node_id=node_id)
