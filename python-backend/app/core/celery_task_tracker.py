"""Celery Task Tracker — Records execution history for all scheduled jobs.

Uses Celery signals (task_prerun, task_postrun, task_failure) to automatically
log every task execution to the `scheduled_job_runs` table.

This enables admin UI monitoring of what ran, when, success/failure, and duration.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from celery.signals import task_prerun, task_postrun, task_failure

logger = logging.getLogger(__name__)

# In-memory start times (task_id → start_timestamp)
_task_starts: dict[str, float] = {}

# Only track scheduled (beat) tasks — filter out ad-hoc tasks
TRACKED_TASK_PREFIXES = (
    "app.tasks.",
    "agency.",
    "onedrive.",
)


def _should_track(task_name: str) -> bool:
    """Only track known scheduled tasks, not ad-hoc user-triggered ones."""
    return any(task_name.startswith(p) for p in TRACKED_TASK_PREFIXES)


@task_prerun.connect
def on_task_prerun(sender: Any = None, task_id: str = "", task: Any = None, **kwargs: Any) -> None:
    """Record task start time."""
    task_name = getattr(sender, "name", "") or ""
    if not _should_track(task_name):
        return

    _task_starts[task_id] = time.time()

    try:
        _insert_run(task_name, task_id, "started")
    except Exception as exc:
        logger.debug("task_tracker_prerun_error", error=str(exc)[:100])


@task_postrun.connect
def on_task_postrun(
    sender: Any = None, task_id: str = "", task: Any = None,
    retval: Any = None, state: str = "", **kwargs: Any,
) -> None:
    """Record task completion."""
    task_name = getattr(sender, "name", "") or ""
    if not _should_track(task_name):
        return

    start_time = _task_starts.pop(task_id, None)
    duration_ms = int((time.time() - start_time) * 1000) if start_time else None

    result_str = None
    if retval is not None:
        try:
            result_str = json.dumps(retval, default=str)[:2000]
        except Exception:
            result_str = str(retval)[:2000]

    try:
        _update_run(task_name, task_id, "success", duration_ms, result_str)
    except Exception as exc:
        logger.debug("task_tracker_postrun_error", error=str(exc)[:100])


@task_failure.connect
def on_task_failure(
    sender: Any = None, task_id: str = "", exception: Any = None,
    einfo: Any = None, **kwargs: Any,
) -> None:
    """Record task failure."""
    task_name = getattr(sender, "name", "") or ""
    if not _should_track(task_name):
        return

    start_time = _task_starts.pop(task_id, None)
    duration_ms = int((time.time() - start_time) * 1000) if start_time else None
    error_msg = str(exception)[:1000] if exception else str(einfo)[:1000] if einfo else "Unknown error"

    try:
        _update_run(task_name, task_id, "failure", duration_ms, error_message=error_msg)
    except Exception as exc:
        logger.debug("task_tracker_failure_error", error=str(exc)[:100])


def _get_sync_engine():
    """Get or create a sync SQLAlchemy engine for Celery worker threads."""
    from app.core.config import settings
    from sqlalchemy import create_engine
    url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("sqlite+aiosqlite://", "sqlite://")
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=1)


def _insert_run(task_name: str, task_id: str, status: str) -> None:
    """Insert a new run record (sync — called from Celery worker thread)."""
    from sqlalchemy import text
    engine = _get_sync_engine()

    with engine.connect() as conn:
        conn.execute(
            text(
                'INSERT INTO scheduled_job_runs '
                '("taskName", "taskId", status, "startedAt") '
                'VALUES (:name, :tid, :status, :started)'
            ),
            {
                "name": task_name,
                "tid": task_id,
                "status": status,
                "started": datetime.now(timezone.utc),
            },
        )
        conn.commit()


def _update_run(
    task_name: str, task_id: str, status: str,
    duration_ms: int | None = None,
    result: str | None = None,
    error_message: str | None = None,
) -> None:
    """Update an existing run record with completion data."""
    from sqlalchemy import text
    engine = _get_sync_engine()

    now = datetime.now(timezone.utc)

    with engine.connect() as conn:
        # Try to update the "started" record
        result_obj = conn.execute(
            text(
                'UPDATE scheduled_job_runs '
                'SET status = :status, "completedAt" = :completed, '
                '"durationMs" = :duration, result = :result, "errorMessage" = :error '
                'WHERE "taskId" = :tid AND status = \'started\''
            ),
            {
                "status": status,
                "completed": now,
                "duration": duration_ms,
                "result": result,
                "error": error_message,
                "tid": task_id,
            },
        )

        # If no started record exists, insert a completed one
        if (result_obj.rowcount or 0) == 0:
            conn.execute(
                text(
                    'INSERT INTO scheduled_job_runs '
                    '("taskName", "taskId", status, "startedAt", "completedAt", '
                    '"durationMs", result, "errorMessage") '
                    'VALUES (:name, :tid, :status, :started, :completed, '
                    ':duration, :result, :error)'
                ),
                {
                    "name": task_name,
                    "tid": task_id,
                    "status": status,
                    "started": now,
                    "completed": now,
                    "duration": duration_ms,
                    "result": result,
                    "error": error_message,
                },
            )

        conn.commit()
# mypy: ignore-errors
