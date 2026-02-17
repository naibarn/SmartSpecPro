"""Cloud Tasks observability helpers.

Provides:
- Schema self-healing for media_tasks.cloud_task_id
- Best-effort event logging into cloud_task_events
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text

from app.core.database import AsyncSessionLocal

logger = structlog.get_logger()

_schema_ready = False
_schema_lock = asyncio.Lock()


def _parse_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _extract_job_id(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("job_id", "jobId", "scheduleId", "conversationId", "skillId"):
        value = payload.get(key)
        if value is not None:
            return str(value)
    return None


async def ensure_media_tasks_cloud_task_id_column() -> None:
    """Ensure media_tasks.cloud_task_id exists (idempotent, cached)."""
    global _schema_ready
    if _schema_ready:
        return

    async with _schema_lock:
        if _schema_ready:
            return

        try:
            async with AsyncSessionLocal() as db:
                await db.execute(
                    text(
                        """
                        ALTER TABLE media_tasks
                        ADD COLUMN IF NOT EXISTS cloud_task_id VARCHAR(512)
                        """
                    )
                )
                await db.execute(
                    text(
                        """
                        CREATE INDEX IF NOT EXISTS ix_media_tasks_cloud_task_id
                        ON media_tasks (cloud_task_id)
                        """
                    )
                )
                await db.commit()

            _schema_ready = True
            logger.info("cloud_tasks_schema_ready", column="media_tasks.cloud_task_id")
        except Exception as exc:
            logger.warning("cloud_tasks_schema_ensure_failed", error=str(exc))


async def record_cloud_task_event(
    *,
    task_id: str | None,
    queue_name: str,
    status: str,
    payload: dict[str, Any] | None = None,
    error_message: str | None = None,
    attempt_count: int = 0,
    completed: bool = False,
) -> None:
    """Write a best-effort event row to cloud_task_events."""
    final_task_id = task_id or "unknown"
    final_payload = payload or {}
    job_id = _extract_job_id(final_payload)
    completed_at = datetime.now(timezone.utc) if completed else None

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text(
                    """
                    INSERT INTO cloud_task_events
                    ("taskId", "queueName", "jobId", "status", "attemptCount", "payload", "errorMessage", "completedAt")
                    VALUES (
                      :task_id,
                      :queue_name,
                      :job_id,
                      :status,
                      :attempt_count,
                      CAST(:payload_json AS jsonb),
                      :error_message,
                      :completed_at
                    )
                    """
                ),
                {
                    "task_id": final_task_id,
                    "queue_name": queue_name,
                    "job_id": job_id,
                    "status": status,
                    "attempt_count": _parse_int(attempt_count),
                    "payload_json": json.dumps(final_payload, default=str),
                    "error_message": error_message,
                    "completed_at": completed_at,
                },
            )
            await db.commit()
    except Exception as exc:
        logger.warning(
            "cloud_task_event_write_failed",
            queue=queue_name,
            status=status,
            task_id=final_task_id,
            error=str(exc),
        )
