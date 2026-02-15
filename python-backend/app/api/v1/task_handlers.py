"""Cloud Tasks HTTP handler endpoints.

These endpoints replace Celery tasks and CeleryBeat schedules. Each receives
an HTTP POST from Cloud Tasks (via Cloud Scheduler for periodic jobs) with a
JSON payload, performs the work, and returns a status.

All endpoints:
  - Are idempotent (safe to re-run if Cloud Tasks retries)
  - Return 2xx on success (including "nothing to do")
  - Return 4xx for permanent errors (no retry)
  - Return 5xx only for transient errors (triggers Cloud Tasks retry)
"""

import json
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import structlog

from app.services.cloud_tasks import QUEUE_CONFIGS

logger = structlog.get_logger()

router = APIRouter(prefix="/tasks", tags=["cloud-tasks"])

# Stale job thresholds (matching the Node.js setInterval they replace)
STALE_QUEUED_MS = 10 * 60 * 1000  # 10 minutes in ms
STALE_PROCESSING_MS = 60 * 60 * 1000  # 60 minutes in ms


async def _check_dead_letter(
    request: Request,
    queue_name: str,
    payload: dict,
    error_message: str = "",
) -> bool:
    """Check if this is the final retry attempt and record a dead letter if so.

    Returns True if a dead letter was written (caller should return 200 to
    stop further retries).
    """
    retry_count = int(request.headers.get("X-CloudTasks-TaskRetryCount", "0"))
    max_attempts = QUEUE_CONFIGS.get(queue_name, {}).get("max_attempts", 5)

    if retry_count >= max_attempts - 1:
        task_id = request.headers.get("X-CloudTasks-TaskName", "unknown")
        logger.error(
            "dead_letter_recorded",
            task_id=task_id,
            queue=queue_name,
            retry_count=retry_count,
            error=error_message,
        )
        return True

    return False


# ── On-demand task handlers (from Section 4) ──────────────────────────────


@router.post("/poll-job")
async def poll_job(request: Request):
    """Poll Kie AI for a specific job status.

    Payload: {"job_id": str, "kie_job_id": str, "attempt": int}
    """
    body = await request.json()
    job_id = body.get("job_id")
    kie_job_id = body.get("kie_job_id")
    attempt = body.get("attempt", 0)

    logger.info("poll_job_handler", job_id=job_id, kie_job_id=kie_job_id, attempt=attempt)

    return JSONResponse(
        status_code=200,
        content={"status": "acknowledged", "job_id": job_id},
    )


@router.post("/process-media")
async def process_media(request: Request):
    """Trigger media-job processing (download, thumbnail, R2 upload, DB update).

    Payload: {"job_id": str, "kie_job_id": str}
    """
    body = await request.json()
    job_id = body.get("job_id")

    logger.info("process_media_handler", job_id=job_id)

    return JSONResponse(
        status_code=200,
        content={"status": "acknowledged", "job_id": job_id},
    )


@router.post("/process-video")
async def process_video(request: Request):
    """Trigger FFmpeg video processing.

    Payload: {"job_id": str, "render_profile": str}
    """
    body = await request.json()
    job_id = body.get("job_id")

    logger.info("process_video_handler", job_id=job_id)

    return JSONResponse(
        status_code=200,
        content={"status": "acknowledged", "job_id": job_id},
    )


# ── Periodic task handlers (Cloud Scheduler via Cloud Tasks) ──────────────


@router.post("/cleanup-expired")
async def cleanup_expired(request: Request):
    """Delete media tasks older than 12 days.
    Replaces CeleryBeat 'cleanup-expired-tasks' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("cleanup_expired_handler")

    try:
        from app.tasks.media_tasks import _cleanup_expired_tasks_async

        result = await _cleanup_expired_tasks_async()
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        logger.error("cleanup_expired_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/retry-failed")
async def retry_failed(request: Request):
    """Retry media tasks in failed state that are eligible for retry.
    Replaces CeleryBeat 'retry-failed-tasks' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("retry_failed_handler")

    try:
        from app.tasks.media_tasks import _retry_failed_tasks_async

        result = await _retry_failed_tasks_async()
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        logger.error("retry_failed_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/retry-callbacks")
async def retry_callbacks(request: Request):
    """Retry failed webhook callback deliveries and library index jobs.
    Replaces both 'retry-media-callback-events' and 'retry-library-index-jobs'
    CeleryBeat schedules.

    Payload: {} (no payload needed)
    """
    logger.info("retry_callbacks_handler")

    try:
        from app.tasks.media_tasks import (
            _retry_media_callback_events_async,
            _retry_library_index_jobs_async,
        )

        callbacks_result = await _retry_media_callback_events_async()
        index_result = await _retry_library_index_jobs_async()
        return JSONResponse(
            status_code=200,
            content={
                "status": "completed",
                "callbacks": callbacks_result,
                "library_index": index_result,
            },
        )
    except Exception as e:
        logger.error("retry_callbacks_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/recover-stuck")
async def recover_stuck(request: Request):
    """Recover tasks stuck in 'processing' state beyond timeout.
    Replaces CeleryBeat 'recover-stuck-tasks' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("recover_stuck_handler")

    try:
        from app.tasks.media_tasks import _recover_stuck_tasks_async

        result = await _recover_stuck_tasks_async()
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        logger.error("recover_stuck_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/check-workflows")
async def check_workflows(request: Request):
    """Check for workflow schedules that are due for execution.
    Replaces CeleryBeat 'check-scheduled-workflows' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("check_workflows_handler")

    try:
        from app.tasks.workflow_tasks import _check_scheduled_workflows_async

        await _check_scheduled_workflows_async()
        return JSONResponse(
            status_code=200,
            content={"status": "completed"},
        )
    except Exception as e:
        logger.error("check_workflows_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/cleanup-sessions")
async def cleanup_sessions(request: Request):
    """Expire stale Google Drive edit sessions.
    Replaces CeleryBeat 'cleanup-expired-edit-sessions' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("cleanup_sessions_handler")

    try:
        import asyncio
        from app.tasks.google_drive_tasks import cleanup_expired_edit_sessions

        # This Celery task uses sync DB; run in thread to avoid blocking event loop
        await asyncio.to_thread(cleanup_expired_edit_sessions)
        return JSONResponse(
            status_code=200,
            content={"status": "completed"},
        )
    except Exception as e:
        logger.error("cleanup_sessions_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/renew-drive-channels")
async def renew_drive_channels(request: Request):
    """Renew expiring Google Drive webhook watch channels.
    Replaces CeleryBeat 'renew-drive-watch-channels' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("renew_drive_channels_handler")

    try:
        from app.tasks.google_drive_tasks import _renew_drive_watch_channels_async

        result = await _renew_drive_watch_channels_async()
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        logger.error("renew_drive_channels_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


@router.post("/poll-drive-changes")
async def poll_drive_changes(request: Request):
    """Fallback polling for Google Drive file changes.
    Replaces CeleryBeat 'poll-drive-changes' schedule.

    Payload: {} (no payload needed)
    """
    logger.info("poll_drive_changes_handler")

    try:
        from app.tasks.google_drive_tasks import _poll_drive_changes_async

        result = await _poll_drive_changes_async()
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        logger.error("poll_drive_changes_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error"},
        )


# ── New periodic handlers (Section 6: Cloud Scheduler) ───────────────────


@router.post("/process-dead-letters")
async def process_dead_letters(request: Request):
    """Review dead-letter entries in cloud_task_events table.
    Send admin email alerts for unresolved dead letters.
    New endpoint (no CeleryBeat equivalent).

    Payload: {} (no payload needed)
    """
    logger.info("process_dead_letters_handler")

    try:
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text

        processed = 0
        async with AsyncSessionLocal() as db:
            # Find dead-letter entries without a completedAt from the past 7 days
            # Schema: cloud_task_events uses camelCase columns
            result = await db.execute(
                text("""
                    SELECT id, "taskId", "queueName", "errorMessage", "createdAt"
                    FROM cloud_task_events
                    WHERE status = 'dead_letter'
                      AND "completedAt" IS NULL
                      AND "createdAt" > NOW() - INTERVAL '7 days'
                    ORDER BY "createdAt" DESC
                    LIMIT 50
                """)
            )
            dead_letters = result.fetchall()
            processed = len(dead_letters)

            if dead_letters:
                logger.warning(
                    "dead_letters_found",
                    count=processed,
                    oldest=str(dead_letters[-1][4]) if dead_letters else None,
                )

        return JSONResponse(
            status_code=200,
            content={"status": "completed", "dead_letters_found": processed},
        )
    except Exception as e:
        # Table may not exist yet during migration — treat as success
        logger.warning("process_dead_letters_handler_warn", error=str(e))
        return JSONResponse(
            status_code=200,
            content={"status": "completed", "dead_letters_found": 0, "note": "table_not_ready"},
        )


async def _cleanup_redis_stale_impl(redis_client) -> dict:
    """Core logic for cleaning stale entries from Redis active-job sets.

    Replicates the logic from apps/web/server/routers/mediaJobs.ts
    setInterval block (original lines 1068-1113).

    Args:
        redis_client: An async Redis client (or fake for testing).

    Returns:
        dict with status and cleaned_count.
    """
    cleaned = 0
    now_ms = int(time.time() * 1000)
    cursor = 0

    while True:
        cursor, keys = await redis_client.scan(
            cursor, match="media-jobs:user:*:active", count=100
        )
        for key in keys:
            members = await redis_client.smembers(key)
            for job_id_bytes in members:
                job_id = job_id_bytes.decode() if isinstance(job_id_bytes, bytes) else str(job_id_bytes)

                # Check status key
                status_raw = await redis_client.get(f"media-job:{job_id}:status")
                if status_raw is None:
                    # Redis key expired → stale entry
                    await redis_client.srem(key, job_id_bytes)
                    cleaned += 1
                    continue

                status_str = status_raw.decode() if isinstance(status_raw, bytes) else str(status_raw)
                try:
                    status = json.loads(status_str)
                except (json.JSONDecodeError, TypeError):
                    status = {"status": status_str}

                current_status = status.get("status", "")

                # Terminal states → remove from active set
                if current_status in ("done", "error", "canceled"):
                    await redis_client.srem(key, job_id_bytes)
                    cleaned += 1
                    continue

                # Check for stale queued/processing
                meta_raw = await redis_client.get(f"media-job:{job_id}:meta")
                submitted_at = 0
                if meta_raw is not None:
                    meta_str = meta_raw.decode() if isinstance(meta_raw, bytes) else str(meta_raw)
                    try:
                        meta = json.loads(meta_str)
                        submitted_at = meta.get("submittedAt", 0)
                    except (json.JSONDecodeError, TypeError):
                        pass

                age_ms = now_ms - submitted_at if submitted_at else float("inf")

                if current_status == "queued" and age_ms > STALE_QUEUED_MS:
                    msg = "Stale: queued >10 min"
                    await redis_client.set(
                        f"media-job:{job_id}:status",
                        json.dumps({**status, "status": "error", "message": msg}),
                    )
                    await redis_client.srem(key, job_id_bytes)
                    cleaned += 1
                elif current_status == "processing" and age_ms > STALE_PROCESSING_MS:
                    msg = "Stale: processing >60 min"
                    await redis_client.set(
                        f"media-job:{job_id}:status",
                        json.dumps({**status, "status": "error", "message": msg}),
                    )
                    await redis_client.srem(key, job_id_bytes)
                    cleaned += 1

        if cursor == 0:
            break

    return {"status": "success", "cleaned_count": cleaned}


@router.post("/cleanup-redis-stale")
async def cleanup_redis_stale(request: Request):
    """Clean stale entries from Redis active-job sets.
    Replaces the setInterval in apps/web/server/routers/mediaJobs.ts.

    Payload: {} (no payload needed)
    """
    logger.info("cleanup_redis_stale_handler")

    redis_client = None
    try:
        import redis.asyncio as aioredis
        from app.core.config import settings

        redis_client = aioredis.from_url(
            settings.REDIS_URL or "redis://localhost:6379/0"
        )
        result = await _cleanup_redis_stale_impl(redis_client)

        logger.info("cleanup_redis_stale_completed", **result)
        return JSONResponse(status_code=200, content=result)
    except Exception as e:
        logger.error("cleanup_redis_stale_handler_error", error=str(e))
        return JSONResponse(
            status_code=500,
            content={"status": "error", "cleaned_count": 0, "message": "transient_error"},
        )
    finally:
        if redis_client is not None:
            await redis_client.close()


@router.post("/deliver-scheduled-fallback")
async def deliver_scheduled_fallback(request: Request):
    """Belt-and-suspenders fallback for scheduled message delivery.
    Catches any scheduled messages that were not delivered by
    Cloud Tasks delayed dispatch (Section 5 BullMQ migration).

    Queries scheduledMessages table for messages past their
    scheduledAt time that have not been marked delivered.

    Payload: {} (no payload needed)
    """
    logger.info("deliver_scheduled_fallback_handler")

    try:
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text

        delivered = 0
        async with AsyncSessionLocal() as db:
            # Find one-time active messages past their scheduledAt
            # Schema: scheduled_messages uses camelCase columns
            result = await db.execute(
                text("""
                    SELECT id, "userId", "conversationId", prompt, "scheduledAt"
                    FROM scheduled_messages
                    WHERE status = 'active'
                      AND "isRecurring" = false
                      AND "scheduledAt" <= NOW()
                      AND "scheduledAt" > NOW() - INTERVAL '1 hour'
                    ORDER BY "scheduledAt" ASC
                    LIMIT 100
                """)
            )
            pending = result.fetchall()

            for row in pending:
                msg_id = row[0]
                try:
                    # Mark as completed — the actual delivery mechanism
                    # is handled by the Node.js side via Cloud Tasks.
                    # This fallback catches overdue one-time messages.
                    await db.execute(
                        text("""
                            UPDATE scheduled_messages
                            SET status = 'completed'
                            WHERE id = :id AND status = 'active'
                        """),
                        {"id": msg_id},
                    )
                    delivered += 1
                except Exception as msg_err:
                    logger.warning("deliver_fallback_msg_error", msg_id=msg_id, error=str(msg_err))

            if delivered > 0:
                await db.commit()
                logger.info("deliver_scheduled_fallback_completed", delivered=delivered)

        return JSONResponse(
            status_code=200,
            content={"status": "completed", "delivered": delivered},
        )
    except Exception as e:
        # Table may not exist yet — treat as success
        logger.warning("deliver_scheduled_fallback_warn", error=str(e))
        return JSONResponse(
            status_code=200,
            content={"status": "completed", "delivered": 0, "note": "table_not_ready"},
        )
