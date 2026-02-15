"""Cloud Tasks enqueue module.

Provides a unified interface for dispatching tasks to Google Cloud Tasks queues.
"""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import structlog

logger = structlog.get_logger()

# Queue configurations matching Section 01 GCP Bootstrap
QUEUE_CONFIGS = {
    "media-jobs": {"max_dispatches_per_second": 5, "max_concurrent_dispatches": 10, "max_attempts": 5},
    "video-jobs-short": {"max_dispatches_per_second": 2, "max_concurrent_dispatches": 10, "max_attempts": 3},
    "video-jobs-long": {"max_dispatches_per_second": 1, "max_concurrent_dispatches": 3, "max_attempts": 3},
    "workflow-tasks": {"max_dispatches_per_second": 10, "max_concurrent_dispatches": 20, "max_attempts": 5},
    "polling-tasks": {"max_dispatches_per_second": 2, "max_concurrent_dispatches": 5, "max_attempts": 10},
    "periodic-tasks": {"max_dispatches_per_second": 1, "max_concurrent_dispatches": 5, "max_attempts": 3},
}

_client = None


def get_tasks_client():
    """Get or create a Cloud Tasks client (lazy singleton)."""
    global _client
    if _client is None:
        from google.cloud import tasks_v2
        _client = tasks_v2.CloudTasksClient()
    return _client


async def enqueue_task(
    queue_name: str,
    handler_path: str,
    payload: dict,
    delay_seconds: int = 0,
    task_id: str | None = None,
) -> str:
    """Enqueue a task to Cloud Tasks.

    Args:
        queue_name: Which queue to use (e.g., 'media-jobs').
        handler_path: Endpoint path on the target service (e.g., '/tasks/process-media').
        payload: JSON body for the task.
        delay_seconds: Optional delay before first dispatch.
        task_id: Optional deterministic name for deduplication (24h window).

    Returns:
        The created task name (full resource path).

    Raises:
        ValueError: If queue_name is not a known queue.
    """
    if queue_name not in QUEUE_CONFIGS:
        raise ValueError(f"Unknown queue: {queue_name}. Valid queues: {list(QUEUE_CONFIGS.keys())}")

    project_id = os.environ["GCP_PROJECT_ID"]
    region = os.environ["GCP_REGION"]
    python_url = os.environ["CLOUD_RUN_PYTHON_URL"]
    sa_email = os.environ.get("CLOUD_RUN_SA_EMAIL", f"cloud-run-api@{project_id}.iam.gserviceaccount.com")

    client = get_tasks_client()
    parent = client.queue_path(project_id, region, queue_name)

    task = {
        "http_request": {
            "http_method": "POST",
            "url": f"{python_url}{handler_path}",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(payload).encode(),
            "oidc_token": {
                "service_account_email": sa_email,
                "audience": python_url,
            },
        },
    }

    if task_id:
        task["name"] = client.task_path(project_id, region, queue_name, task_id)

    if delay_seconds > 0:
        schedule_time = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        task["schedule_time"] = {
            "seconds": int(schedule_time.timestamp()),
        }

    response = await asyncio.to_thread(
        client.create_task, request={"parent": parent, "task": task}
    )

    logger.info(
        "cloud_task_enqueued",
        queue=queue_name,
        handler=handler_path,
        task_name=response.name,
        delay_seconds=delay_seconds,
    )

    return response.name
