"""Celery periodic task for auto-rejecting expired workflow approvals.

Two-pronged expiration strategy:
1. Database: Mark approval_requests with status=PENDING and expires_at < now() as EXPIRED.
2. Redis: Scan PendingInterruptTracker for expired interrupts and resume the
   paused LangGraph workflow with a timeout response.

The compiled graph needed for resume is NOT in this process (it lives in the
FastAPI execution_registry).  We therefore recompile the workflow from the DB
so that LangGraph can load the checkpoint and continue execution.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog

from app.core.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task(
    name="app.tasks.approval_timeout_tasks.check_expired_approvals",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def check_expired_approvals(self):
    """Check for expired approval requests and auto-reject them.

    Runs every 5 minutes via Celery Beat to:
    1. Mark DB approval_requests with expires_at < now() as EXPIRED
    2. Scan Redis for expired LangGraph interrupts
    3. Resume paused workflows with a timeout rejection response
    """
    try:
        asyncio.run(_check_expired_approvals_async())
    except Exception as exc:
        logger.exception("check_expired_approvals task failed, will retry")
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Async implementation
# ---------------------------------------------------------------------------


async def _check_expired_approvals_async():
    """Orchestrate both DB cleanup and Redis interrupt expiration."""

    # Phase 1: Mark expired DB rows
    expired_count = await _expire_db_requests()

    # Phase 2: Find and resume expired Redis interrupts
    resumed_count = await _expire_redis_interrupts()

    if expired_count or resumed_count:
        logger.info(
            "Expired approvals check complete",
            db_expired=expired_count,
            redis_resumed=resumed_count,
        )
    else:
        logger.debug("No expired approvals found")


# ---------------------------------------------------------------------------
# Phase 1 -- Database cleanup
# ---------------------------------------------------------------------------


async def _expire_db_requests() -> int:
    """Mark expired pending approval requests as EXPIRED in the database.

    Uses ApprovalDBService.cleanup_expired_requests() which finds rows where
    expires_at < now() OR created_at is older than the fallback timeout.

    Returns:
        Number of requests marked as expired.
    """
    from app.core.database import get_db_context
    from app.services.approval_db_service import ApprovalDBService

    try:
        async with get_db_context() as session:
            service = ApprovalDBService(session)
            count = await service.cleanup_expired_requests()

            if count:
                logger.info("approval_db_expired", count=count)

            return count

    except Exception:
        logger.exception("Failed to expire DB approval requests")
        return 0


# ---------------------------------------------------------------------------
# Phase 2 -- Redis interrupt expiration + workflow resume
# ---------------------------------------------------------------------------


async def _expire_redis_interrupts() -> int:
    """Scan Redis for expired LangGraph interrupts and resume their workflows.

    Uses PendingInterruptTracker.get_all_expired() to find interrupts whose
    timeout_at has passed, then attempts to resume each workflow with a
    timeout rejection response.

    Returns:
        Number of workflows successfully resumed.
    """
    import redis.asyncio as aioredis

    from app.core.config import settings

    resumed = 0
    redis_client = None

    try:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        logger.exception("Failed to connect to Redis for interrupt expiration")
        return 0

    try:
        from app.orchestrator.hitl import PendingInterruptTracker

        tracker = PendingInterruptTracker(redis_client)
        expired_items = await tracker.get_all_expired()

        if not expired_items:
            return 0

        logger.info("Found expired Redis interrupts", count=len(expired_items))

        for item in expired_items:
            thread_id = item.get("thread_id")
            node_id = item.get("node_id")
            payload = item.get("payload", {})

            if not thread_id or not node_id:
                logger.warning(
                    "Expired interrupt missing thread_id or node_id, skipping",
                    item_keys=list(item.keys()),
                )
                continue

            try:
                success = await _resume_expired_workflow(
                    thread_id=thread_id,
                    node_id=node_id,
                    payload=payload,
                )

                if success:
                    resumed += 1

                # Remove from Redis regardless of resume success -- the interrupt
                # is expired and should not be retried indefinitely.
                await tracker.remove_interrupt(thread_id, node_id)

            except Exception:
                logger.exception(
                    "Failed to process expired interrupt",
                    thread_id=thread_id,
                    node_id=node_id,
                )

    except Exception:
        logger.exception("Failed to scan Redis for expired interrupts")
    finally:
        if redis_client:
            await redis_client.aclose()

    return resumed


async def _resume_expired_workflow(
    thread_id: str,
    node_id: str,
    payload: dict[str, Any],
) -> bool:
    """Resume a single expired workflow with a timeout rejection.

    The compiled_graph lives in the FastAPI process's execution_registry,
    which is not accessible from the Celery worker.  We therefore:
    1. Parse the execution_id from thread_id ({tenant_id}:{execution_id})
    2. Load the workflow JSON from the DB (workflow_executions -> workflows)
    3. Recompile the graph via LangGraphRuntime.compile()
    4. Call runtime.resume() with Command(resume=timeout_response)

    Args:
        thread_id: LangGraph thread ID in format "{tenant_id}:{execution_id}".
        node_id: The graph node that called interrupt().
        payload: The original InterruptPayload dict.

    Returns:
        True if the workflow was resumed successfully.
    """
    # Parse tenant_id and execution_id from thread_id
    parts = thread_id.split(":", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        logger.warning(
            "Invalid thread_id format",
            thread_id=thread_id,
        )
        return False

    tenant_id, execution_id = parts

    from app.core.database import get_db_context
    from app.models.workflow import Workflow
    from app.models.workflow_execution import WorkflowExecution

    try:
        async with get_db_context() as db:
            from sqlalchemy import select

            # Load execution record
            result = await db.execute(
                select(WorkflowExecution).where(
                    WorkflowExecution.id == execution_id,
                    WorkflowExecution.tenant_id == tenant_id,
                )
            )
            execution = result.scalar_one_or_none()

            if not execution:
                logger.warning(
                    "Execution not found for expired approval",
                    execution_id=execution_id,
                    tenant_id=tenant_id,
                )
                return False

            if execution.status != "interrupted":
                logger.info(
                    "Execution no longer in interrupted state, skipping resume",
                    execution_id=execution_id,
                    status=execution.status,
                )
                return False

            # Load the workflow definition to recompile the graph
            if not execution.workflow_id:
                logger.warning(
                    "Execution has no workflow_id, cannot recompile graph",
                    execution_id=execution_id,
                )
                return False

            wf_result = await db.execute(
                select(Workflow).where(Workflow.id == int(execution.workflow_id))
            )
            workflow = wf_result.scalar_one_or_none()

            if not workflow or not workflow.workflowJson:
                logger.warning(
                    "Workflow not found or has no JSON definition",
                    workflow_id=execution.workflow_id,
                    execution_id=execution_id,
                )
                return False

            # Recompile the graph
            from app.orchestrator.langgraph_runtime import get_langgraph_runtime

            runtime = get_langgraph_runtime()
            compiled_graph = await runtime.compile(workflow.workflowJson)

            # Build timeout response matching HITLResumeHandler format
            timeout_minutes = payload.get("timeout_minutes", "unknown")
            timeout_response = {
                "approved": False,
                "rejected": True,
                "decision": None,
                "input_value": None,
                "comment": f"Auto-rejected: approval timed out after {timeout_minutes} minutes",
                "approved_by": None,
                "rejected_by": "system",
                "responded_at": datetime.now(timezone.utc).isoformat(),
                "timeout": True,
            }

            from langgraph.types import Command

            command = Command(resume=timeout_response)

            # Resume the workflow
            await runtime.resume(
                compiled_graph=compiled_graph,
                thread_id=thread_id,
                command=command,
            )

            # Update execution status
            execution.status = "running"
            await db.commit()

            logger.info(
                "Expired approval workflow auto-resumed with timeout rejection",
                execution_id=execution_id,
                workflow_id=execution.workflow_id,
                node_id=node_id,
                thread_id=thread_id,
            )

            return True

    except Exception:
        logger.exception(
            "Failed to resume expired approval workflow",
            thread_id=thread_id,
            execution_id=execution_id,
            node_id=node_id,
        )
        return False
