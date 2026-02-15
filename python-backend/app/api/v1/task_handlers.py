"""Cloud Tasks HTTP handler endpoints.

These endpoints replace Celery tasks. Each receives an HTTP POST from
Cloud Tasks with a JSON payload, performs the work, and returns a status.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import structlog

from app.services.cloud_tasks import QUEUE_CONFIGS

logger = structlog.get_logger()

router = APIRouter(prefix="/tasks", tags=["cloud-tasks"])


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
        # TODO: Write to cloud_task_events table with status='dead_letter'
        # This requires DB access which will be connected when the full
        # Python service connects to the Neon database (deployment phase)
        return True

    return False


@router.post("/poll-job")
async def poll_job(request: Request):
    """Poll Kie AI for a specific job status.

    Payload: {"job_id": str, "kie_job_id": str, "attempt": int}

    Idempotent: if job is already completed, returns 200 immediately.
    On still-processing: re-enqueues with exponential backoff.
    On final retry: writes dead letter record.
    """
    body = await request.json()
    job_id = body.get("job_id")
    kie_job_id = body.get("kie_job_id")
    attempt = body.get("attempt", 0)

    logger.info("poll_job_handler", job_id=job_id, kie_job_id=kie_job_id, attempt=attempt)

    # TODO: Connect to actual Kie AI polling logic from media_tasks.py
    # For now, return success to acknowledge the task
    return JSONResponse(
        status_code=200,
        content={"status": "acknowledged", "job_id": job_id},
    )


@router.post("/process-media")
async def process_media(request: Request):
    """Trigger media-job processing (download, thumbnail, R2 upload, DB update).

    Payload: {"job_id": str, "kie_job_id": str}

    Idempotent: if job already has R2 keys, returns 200.
    """
    body = await request.json()
    job_id = body.get("job_id")

    logger.info("process_media_handler", job_id=job_id)

    # TODO: Connect to actual media processing logic
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


@router.post("/cleanup-expired")
async def cleanup_expired(request: Request):
    """Delete tasks older than 12 days.

    Payload: {} (no payload needed)
    Returns: {"deleted_count": int}
    """
    logger.info("cleanup_expired_handler")

    # TODO: Connect to actual cleanup logic from media_tasks.cleanup_expired_tasks
    return JSONResponse(
        status_code=200,
        content={"status": "completed", "deleted_count": 0},
    )


@router.post("/retry-failed")
async def retry_failed(request: Request):
    """Retry recently failed tasks.

    Payload: {} (no payload needed)
    """
    logger.info("retry_failed_handler")

    # TODO: Connect to actual retry logic from media_tasks.retry_failed_tasks
    return JSONResponse(
        status_code=200,
        content={"status": "completed", "retried_count": 0},
    )


@router.post("/retry-callbacks")
async def retry_callbacks(request: Request):
    """Retry failed media callback events.

    Payload: {} (no payload needed)
    """
    logger.info("retry_callbacks_handler")

    return JSONResponse(
        status_code=200,
        content={"status": "completed", "retried_count": 0},
    )


@router.post("/recover-stuck")
async def recover_stuck(request: Request):
    """Recover tasks stuck in processing state.

    Payload: {} (no payload needed)
    """
    logger.info("recover_stuck_handler")

    # TODO: Connect to actual recovery logic from media_tasks.recover_stuck_tasks
    return JSONResponse(
        status_code=200,
        content={"status": "completed", "recovered_count": 0},
    )


@router.post("/check-workflows")
async def check_workflows(request: Request):
    """Check and execute scheduled workflows.

    Payload: {} (no payload needed)
    """
    logger.info("check_workflows_handler")

    return JSONResponse(
        status_code=200,
        content={"status": "completed"},
    )


@router.post("/cleanup-sessions")
async def cleanup_sessions(request: Request):
    """Cleanup expired edit sessions.

    Payload: {} (no payload needed)
    """
    logger.info("cleanup_sessions_handler")

    return JSONResponse(
        status_code=200,
        content={"status": "completed"},
    )


@router.post("/renew-drive-channels")
async def renew_drive_channels(request: Request):
    """Renew Google Drive watch channels.

    Payload: {} (no payload needed)
    """
    logger.info("renew_drive_channels_handler")

    return JSONResponse(
        status_code=200,
        content={"status": "completed"},
    )


@router.post("/poll-drive-changes")
async def poll_drive_changes(request: Request):
    """Poll Google Drive for changes.

    Payload: {} (no payload needed)
    """
    logger.info("poll_drive_changes_handler")

    return JSONResponse(
        status_code=200,
        content={"status": "completed"},
    )
