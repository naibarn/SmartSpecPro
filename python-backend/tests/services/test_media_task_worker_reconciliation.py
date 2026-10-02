from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.services.media_task_worker_reconciliation import reconcile_terminal_worker_job


@pytest.mark.asyncio
async def test_terminal_worker_failure_is_projected_when_provider_was_never_submitted():
    task = SimpleNamespace(
        id="media-task-1",
        status="pending",
        task_id=None,
        celery_task_id="worker-job-1",
        user_id=24,
        tenant_id="tenant-1",
        error_message=None,
        completed_at=None,
    )
    job_result = Mock()
    job_result.mappings.return_value.one_or_none.return_value = {
        "status": "failed",
        "error_code": "JOB_EXECUTOR_ERROR",
        "error_message": "Execution failed before provider submission",
    }
    update_result = Mock()
    update_result.scalar_one_or_none.return_value = task.id
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[job_result, update_result]), commit=AsyncMock()
    )

    changed = await reconcile_terminal_worker_job(db, task)

    assert changed is True
    assert task.status == "failed"
    assert task.error_message == (
        "JOB_EXECUTOR_ERROR: Execution failed before provider submission"
    )
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_active_worker_job_keeps_media_task_pending():
    task = SimpleNamespace(
        id="media-task-1",
        status="pending",
        task_id=None,
        celery_task_id="worker-job-1",
        user_id=24,
        tenant_id="tenant-1",
        error_message=None,
        completed_at=None,
    )
    result = Mock()
    result.mappings.return_value.one_or_none.return_value = {
        "status": "retry_scheduled",
        "error_code": "LEASE_EXPIRED_RETRYING",
        "error_message": "Lease expired",
    }
    db = SimpleNamespace(execute=AsyncMock(return_value=result), commit=AsyncMock())

    changed = await reconcile_terminal_worker_job(db, task)

    assert changed is False
    assert task.status == "pending"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_submitted_task_is_not_failed_from_worker_projection():
    task = SimpleNamespace(
        id="media-task-1",
        status="processing",
        task_id="provider-task-1",
        celery_task_id="worker-job-1",
        user_id=24,
        tenant_id="tenant-1",
        error_message=None,
        completed_at=None,
    )
    db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock())

    changed = await reconcile_terminal_worker_job(db, task)

    assert changed is False
    db.execute.assert_not_awaited()


def test_image_worker_retry_deadline_is_bounded_to_fifteen_minutes():
    from app.tasks.media_tasks import generate_image_task

    assert generate_image_task._job_task_retry_policy["deadlineMs"] == 10 * 60 * 1000
