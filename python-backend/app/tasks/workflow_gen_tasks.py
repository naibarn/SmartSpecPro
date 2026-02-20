"""
Celery task for async workflow generation via LLM.

Follows the same patterns as media_tasks.py:
- _run_async() for running async code in Celery worker context
- Redis for real-time status tracking (task result + progress)
- Retry support for transient failures
"""

import asyncio
import json
import os
import uuid

import redis as sync_redis
import structlog

from app.core.celery_app import celery_app

logger = structlog.get_logger(__name__)

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_TTL = 3600  # 1 hour

# Module-level connection pool — reused across calls (LOW-16 fix)
_redis_pool = sync_redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)


def _get_redis() -> sync_redis.Redis:
    return sync_redis.Redis(connection_pool=_redis_pool)


def _run_async(coro):
    """Run async coroutine in Celery worker context.

    Always creates a fresh event loop per invocation to prevent state leakage
    between Celery tasks (H-07 fix: shared event loop can carry httpx connection
    pools, auth headers, etc. between different users' tasks).
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _set_status(task_id: str, status: dict) -> None:
    """Store workflow generation task status in Redis.

    Wraps in try/except so Redis failures don't mask the real task error.
    """
    try:
        r = _get_redis()
        r.set(f"wf-gen:{task_id}", json.dumps(status, default=str), ex=RESULT_TTL)
    except Exception as exc:
        logger.error("redis_set_status_failed", task_id=task_id, error=str(exc)[:200])


def get_status(task_id: str, user_id: int | None = None) -> dict | None:
    """Read workflow generation task status from Redis.

    If user_id is provided, enforces ownership check (H-01 fix).
    Returns None if task doesn't exist or user doesn't own it.
    """
    r = _get_redis()
    raw = r.get(f"wf-gen:{task_id}")
    if raw is None:
        return None
    data = json.loads(raw)
    # Ownership check — prevent cross-user task-ID enumeration
    if user_id is not None and data.get("_user_id") is not None:
        if data["_user_id"] != user_id:
            return None
    return data


def create_task_id() -> str:
    """Generate a unique task ID for workflow generation."""
    return f"wfgen-{uuid.uuid4().hex[:12]}"


@celery_app.task(
    bind=True,
    max_retries=0,  # Application-level retry loop in generate_with_retry() handles retries
    name="app.tasks.workflow_gen_tasks.generate_workflow",
    soft_time_limit=540,   # 9 min soft limit
    time_limit=600,        # 10 min hard limit
)
def generate_workflow_task(
    self,
    task_id: str,
    prompt: str,
    node_types: list | None,
    model: str | None,
    default_model: str | None,
    user_token: str | None,
    user_id: int | None = None,
):
    """
    Async workflow generation via Celery queue.

    Runs the LLM call in a background worker so the API can return immediately.
    Status is tracked in Redis for frontend polling.
    Uses generate_with_retry() for up to 3 LLM attempts with validation feedback.
    """
    logger.info(
        "workflow_gen_task_started",
        task_id=task_id,
        celery_id=self.request.id,
        prompt_length=len(prompt),
    )

    _set_status(task_id, {
        "status": "processing",
        "message": "Generating workflow via LLM...",
        "_user_id": user_id,  # H-01: track ownership for cross-user protection
    })

    try:
        from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError

        generator = WorkflowGenerator()
        result = _run_async(
            generator.generate_with_retry(
                prompt=prompt,
                node_types=node_types,
                model=model,
                user_token=user_token,
                default_model=default_model,
            )
        )

        _set_status(task_id, {
            "status": "completed",
            "result": result,
            "_user_id": user_id,
        })

        logger.info(
            "workflow_gen_task_completed",
            task_id=task_id,
            node_count=len(result.get("nodes", [])),
            edge_count=len(result.get("edges", [])),
        )
        return result

    except WorkflowGenerationError as e:
        logger.error("workflow_gen_task_failed", task_id=task_id, error=e.message)
        _set_status(task_id, {
            "status": "failed",
            "error": e.message,
            "validationError": e.validation_error,
            "hint": e.hint,
            "_user_id": user_id,
        })
        return {"status": "failed", "error": e.message}

    except Exception as e:
        # H-02: Log full exception server-side but return sanitized message to client.
        # Raw str(e) may contain connection strings, DB credentials, or internal paths.
        logger.error(
            "workflow_gen_task_unexpected_error",
            task_id=task_id,
            error=str(e),
            exc_info=True,
        )
        _set_status(task_id, {
            "status": "failed",
            "error": "An internal error occurred during workflow generation. Please try again.",
            "validationError": None,
            "hint": None,
            "_user_id": user_id,
        })
        return {"status": "failed", "error": "Internal error"}
