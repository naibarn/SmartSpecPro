"""
Celery task for async workflow editing via LLM.

Follows the same patterns as workflow_gen_tasks.py:
- _run_async() for running async code in Celery worker context
- Redis for real-time status tracking
- Fresh event loop per invocation to prevent state leakage
"""

import asyncio
import json
import os
import uuid

import redis as sync_redis
import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.core.celery_app import celery_app

logger = structlog.get_logger(__name__)

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_TTL = 3600  # 1 hour

# Module-level connection pool — reused across calls
_redis_pool = sync_redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)


def _get_redis() -> sync_redis.Redis:
    return sync_redis.Redis(connection_pool=_redis_pool)


def _run_async(coro):
    """Run async coroutine in Celery worker context with a fresh event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _set_edit_status(task_id: str, status: dict) -> None:
    """Store workflow edit task status in Redis."""
    try:
        r = _get_redis()
        r.set(f"wf-edit:{task_id}", json.dumps(status, default=str), ex=RESULT_TTL)
    except Exception as exc:
        logger.error("redis_set_edit_status_failed", task_id=task_id, error=str(exc)[:200])


def get_edit_status(task_id: str, user_id: int | None = None) -> dict | None:
    """Read workflow edit task status from Redis.

    If user_id is provided, enforces ownership check.
    Returns None if task doesn't exist or user doesn't own it.
    """
    r = _get_redis()
    raw = r.get(f"wf-edit:{task_id}")
    if raw is None:
        return None
    data = json.loads(raw)
    # Ownership check — prevent cross-user task-ID enumeration
    if user_id is not None and data.get("_user_id") is not None:
        if data["_user_id"] != user_id:
            return None
    return data


def create_edit_task_id() -> str:
    """Generate a unique task ID for workflow editing."""
    return f"wfedit-{uuid.uuid4().hex[:12]}"


@celery_app.task(
    bind=True,
    max_retries=0,  # Application-level retry loop in edit_with_retry() handles retries
    name="app.tasks.workflow_edit_tasks.edit_workflow",
    soft_time_limit=540,   # 9 min soft limit
    time_limit=600,        # 10 min hard limit
)
def edit_workflow_task(
    self,
    task_id: str,
    current_workflow: dict,
    errors: list,
    warnings: list,
    instructions: str,
    node_types: list | None,
    model: str | None,
    default_model: str | None,
    user_token: str | None,
    user_id: int | None = None,
):
    """
    Async workflow editing via Celery queue.

    Runs the LLM call in a background worker so the API can return immediately.
    Status is tracked in Redis for frontend polling.
    Uses edit_with_retry() for up to 3 LLM attempts with validation feedback.
    """
    logger.info(
        "workflow_edit_task_started",
        task_id=task_id,
        celery_id=self.request.id,
        error_count=len(errors),
        warning_count=len(warnings),
    )

    _set_edit_status(task_id, {
        "status": "processing",
        "message": "Analyzing workflow and applying AI fixes...",
        "_user_id": user_id,
    })

    try:
        from app.orchestrator.workflow_editor import WorkflowEditor, WorkflowEditError

        editor = WorkflowEditor()
        result = _run_async(
            editor.edit_with_retry(
                current_workflow=current_workflow,
                errors=errors,
                warnings=warnings,
                instructions=instructions,
                node_types=node_types,
                model=model,
                user_token=user_token,
                default_model=default_model,
            )
        )

        _set_edit_status(task_id, {
            "status": "completed",
            "result": result,
            "_user_id": user_id,
        })

        logger.info(
            "workflow_edit_task_completed",
            task_id=task_id,
            node_count=len(result.get("nodes", [])),
            edge_count=len(result.get("edges", [])),
            changes=len(result.get("changes", [])),
        )
        return result

    except SoftTimeLimitExceeded:
        logger.error("workflow_edit_task_timeout", task_id=task_id)
        _set_edit_status(task_id, {
            "status": "failed",
            "error": "Workflow editing timed out. Try a simpler instruction or a smaller workflow.",
            "validationError": None,
            "hint": "Break the workflow into smaller parts and edit them separately.",
            "_user_id": user_id,
        })
        return {"status": "failed", "error": "Timed out"}

    except WorkflowEditError as e:
        logger.error("workflow_edit_task_failed", task_id=task_id, error=e.message)
        _set_edit_status(task_id, {
            "status": "failed",
            "error": e.message,
            "validationError": e.validation_error,
            "hint": e.hint,
            "_user_id": user_id,
        })
        return {"status": "failed", "error": e.message}

    except Exception as e:
        logger.error(
            "workflow_edit_task_unexpected_error",
            task_id=task_id,
            error=str(e),
            exc_info=True,
        )
        _set_edit_status(task_id, {
            "status": "failed",
            "error": "An internal error occurred during workflow editing. Please try again.",
            "validationError": None,
            "hint": None,
            "_user_id": user_id,
        })
        return {"status": "failed", "error": "Internal error"}
