"""Project terminal canonical worker outcomes onto media task status."""

from datetime import datetime, timezone
import logging
from typing import Any

from sqlalchemy import text, update

from app.models.media_task import MediaTask

logger = logging.getLogger(__name__)

_ACTIVE_MEDIA_TASK_STATUSES = ("pending", "processing")
_TERMINAL_WORKER_STATUSES = {"failed", "cancelled", "expired"}


async def reconcile_terminal_worker_job(db: Any, task: MediaTask) -> bool:
    """Fail a media row when its canonical job ended before provider submission.

    A provider task ID is the handoff boundary: once present, provider polling
    owns the outcome and a worker job status must not override it.
    """
    if (
        task.status not in _ACTIVE_MEDIA_TASK_STATUSES
        or task.task_id
        or not task.celery_task_id
        or not task.tenant_id
    ):
        return False

    result = await db.execute(
        text(
            'SELECT "status", "errorCode" AS error_code, '
            '"errorMessage" AS error_message, "failureReason" AS failure_reason, '
            '"statusReason" AS status_reason '
            'FROM "worker_jobs" '
            'WHERE "id" = :job_id AND "tenantId" = :tenant_id '
            'AND "requestedByUserId" = :user_id'
        ),
        {
            "job_id": task.celery_task_id,
            "tenant_id": str(task.tenant_id),
            "user_id": int(task.user_id),
        },
    )
    job = result.mappings().one_or_none()
    if not job or job["status"] not in _TERMINAL_WORKER_STATUSES:
        return False

    terminal_status = "cancelled" if job["status"] == "cancelled" else "failed"
    details = job.get("error_message") or job.get("failure_reason") or job.get("status_reason")
    code = job.get("error_code")
    message = str(details or "Canonical worker job ended before provider submission")
    if code:
        message = f"{code}: {message}"
    message = message[:2000]
    now = datetime.now(timezone.utc)
    update_result = await db.execute(
        update(MediaTask)
        .where(
            MediaTask.id == task.id,
            MediaTask.status.in_(_ACTIVE_MEDIA_TASK_STATUSES),
            MediaTask.task_id.is_(None),
            MediaTask.celery_task_id == task.celery_task_id,
        )
        .values(status=terminal_status, error_message=message, completed_at=now)
        .returning(MediaTask.id)
    )
    changed = update_result.scalar_one_or_none() is not None
    if changed:
        await db.commit()
        task.status = terminal_status
        task.error_message = message
        task.completed_at = now
        logger.warning(
            "media_task_reconciled_from_terminal_worker_job",
            extra={
                "media_task_id": task.id,
                "worker_job_id": task.celery_task_id,
                "worker_status": job["status"],
                "error_code": code,
            },
        )
    return changed
