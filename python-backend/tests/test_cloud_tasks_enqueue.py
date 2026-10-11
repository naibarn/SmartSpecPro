"""The retired Cloud Tasks publisher must fail closed for every request."""

import pytest


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "enqueue_options",
    [
        {},
        {"delay_seconds": 120},
        {"task_id": "dedup-123"},
        {"queue_name": "nonexistent-queue"},
    ],
)
async def test_retired_cloud_tasks_publisher_never_publishes(enqueue_options):
    from app.services.cloud_tasks import enqueue_task

    options = {
        "queue_name": "media-jobs",
        "handler_path": "/tasks/process-media",
        "payload": {"job_id": "test-123"},
        **enqueue_options,
    }

    with pytest.raises(
        RuntimeError,
        match="^GOOGLE_CLOUD_RUNTIME_RETIRED: create a canonical worker_jobs outbox intent$",
    ):
        await enqueue_task(**options)
