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


def _get_redis() -> sync_redis.Redis:
    return sync_redis.from_url(REDIS_URL, decode_responses=True)


def _run_async(coro):
    """Run async coroutine in Celery worker context (persistent event loop)."""
    try:
        asyncio.get_running_loop()
        raise RuntimeError("Already in async context")
    except RuntimeError:
        pass

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coro)


def _set_status(task_id: str, status: dict) -> None:
    """Store workflow generation task status in Redis."""
    r = _get_redis()
    r.set(f"wf-gen:{task_id}", json.dumps(status, default=str), ex=RESULT_TTL)


def get_status(task_id: str) -> dict | None:
    """Read workflow generation task status from Redis."""
    r = _get_redis()
    raw = r.get(f"wf-gen:{task_id}")
    if raw is None:
        return None
    return json.loads(raw)


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

    _set_status(task_id, {"status": "processing", "message": "Generating workflow via LLM..."})

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
        })
        return {"status": "failed", "error": e.message}

    except Exception as e:
        error_msg = str(e)
        logger.error("workflow_gen_task_failed", task_id=task_id, error=error_msg)
        _set_status(task_id, {
            "status": "failed",
            "error": error_msg,
            "validationError": None,
            "hint": None,
        })
        return {"status": "failed", "error": error_msg}
