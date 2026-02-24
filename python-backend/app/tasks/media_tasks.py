"""
Celery Tasks for Media Generation
Handles async image, video, and audio generation
"""

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.models.user import User
from app.services.media_task_service import MediaTaskService
from app.services.media_callback_service import retry_due_callback_events
from app.services.library_indexing_service import (
    process_library_index_job,
    reindex_all_library_items,
    retry_due_library_index_jobs,
)
from app.services.library_backfill_service import run_library_backfill_batch
from app.services.media_debug_trace import write_media_debug_event
from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import (
    ImageGenerationRequest,
    VideoGenerationRequest,
    AudioGenerationRequest,
)
from datetime import datetime, timedelta
from sqlalchemy import select, text
from typing import Any, Optional
import structlog
import asyncio
import json

logger = structlog.get_logger()


def _run_async(coro):
    """
    Safely run async coroutine in Celery worker context.
    Reuses the existing event loop if available, or creates a persistent one.

    This prevents "Event loop is closed" errors that occur when using asyncio.run()
    repeatedly in Celery workers. asyncio.run() creates and closes loops, which
    causes state corruption. This function maintains a persistent loop for the
    worker process lifetime.
    """
    try:
        # Check if we're already in an async context
        loop = asyncio.get_running_loop()
        # If we're here, we're already in async context - this shouldn't happen in Celery
        # but handle it gracefully
        raise RuntimeError("Already in async context - cannot run nested async")
    except RuntimeError:
        # No running loop - this is expected in Celery workers
        pass

    try:
        # Try to get the existing event loop
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            # Loop was closed (e.g., by previous asyncio.run() call)
            # Create a new one and set it as the current loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        # No event loop exists at all - create one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Run the coroutine to completion WITHOUT closing the loop
    # The loop will persist for subsequent tasks in this worker process
    return loop.run_until_complete(coro)


def _extract_model_query_endpoint(config_json: Any) -> Optional[str]:
    """Extract model-specific status/query endpoint from configJson."""
    if not config_json:
        return None

    cfg = config_json
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            return None

    if not isinstance(cfg, dict):
        return None

    endpoint = (
        cfg.get("apiQueryEndpoint")
        or cfg.get("queryEndpoint")
        or cfg.get("statusEndpoint")
        or cfg.get("apiStatusEndpoint")
    )
    if isinstance(endpoint, str) and endpoint.strip():
        return endpoint.strip()
    return None


def _normalize_kie_task_state(status_response: dict) -> tuple[str, str]:
    """Normalize provider state to one of: success, fail, processing, unknown."""
    if not isinstance(status_response, dict):
        return "unknown", ""

    data = status_response.get("data", {})
    if not isinstance(data, dict):
        data = {}

    success_flag = data.get("successFlag")
    if success_flag in (1, True):
        return "success", "successflag"
    if success_flag in (0, False):
        error_code = data.get("errorCode")
        error_message = data.get("errorMessage")
        if error_code or error_message:
            return "fail", "successflag_error"
        return "processing", "successflag_pending"

    raw_state = str(
        status_response.get("state", "")
        or data.get("state", "")
        or status_response.get("status", "")
        or data.get("status", "")
    ).strip().lower()

    if raw_state in {"success", "completed", "complete", "done", "finished", "finish"}:
        return "success", raw_state
    if raw_state in {"fail", "failed", "error", "cancelled", "canceled"}:
        return "fail", raw_state
    if raw_state in {"pending", "processing", "running", "created", "queued", "queueing", "in_progress", "in-progress"}:
        return "processing", raw_state
    if raw_state:
        return "unknown", raw_state

    code = status_response.get("code")
    if isinstance(code, int) and code != 200:
        msg = str(status_response.get("msg") or status_response.get("message") or "").lower()
        if any(x in msg for x in ("null", "not found", "not success", "processing", "pending")):
            return "processing", msg or f"code_{code}"
        return "fail", msg or f"code_{code}"

    return "unknown", ""


def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
    """Normalize BytePlus task status to internal state.

    Returns a (normalized_state, raw_status) tuple where normalized_state is
    one of: 'success', 'fail', 'processing', 'unknown'.

    BytePlus status values: succeeded, failed, cancelled, queued, processing.
    """
    raw_status = status_response.get("status", "")
    if raw_status == "succeeded":
        return "success", "succeeded"
    if raw_status in ("failed", "cancelled"):
        return "fail", raw_status
    if raw_status in ("queued", "processing"):
        return "processing", raw_status
    return "unknown", raw_status


def _extract_byteplus_result_url(status_response: dict) -> Optional[str]:
    """Extract result URL from BytePlus task status response.

    Iterates over status_response['content'] items. Returns the first URL found
    in a 'video_url' or 'image_url' item that starts with 'http'. Returns None
    if no valid URL is found.
    """
    for item in status_response.get("content", []):
        item_type = item.get("type")
        if item_type == "video_url":
            url = item.get("video_url", {}).get("url", "")
            if url.startswith("http"):
                return url
        elif item_type == "image_url":
            url = item.get("image_url", {}).get("url", "")
            if url.startswith("http"):
                return url
    return None


def _extract_url_from_value(value: Any) -> Optional[str]:
    """Extract a media URL from common provider response value shapes."""
    if isinstance(value, str) and value.startswith("http"):
        return value

    if isinstance(value, dict):
        for key in ("url", "image_url", "video_url", "audio_url", "imageUrl", "videoUrl", "audioUrl", "result_url"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.startswith("http"):
                return candidate

    return None


def _extract_first_kie_result_url(status_response: dict) -> Optional[str]:
    """Extract the first result URL from known Kie response shapes."""
    if not isinstance(status_response, dict):
        return None

    data = status_response.get("data", {})
    if not isinstance(data, dict):
        data = {}

    result_json = data.get("resultJson")
    if isinstance(result_json, str):
        try:
            result_json = json.loads(result_json)
        except json.JSONDecodeError:
            result_json = {}
    if isinstance(result_json, dict):
        result_urls = result_json.get("resultUrls")
        if isinstance(result_urls, list):
            for item in result_urls:
                url = _extract_url_from_value(item)
                if url:
                    return url
        url = _extract_url_from_value(result_json)
        if url:
            return url

    task_result = data.get("taskResult")
    if isinstance(task_result, dict):
        for key in ("images", "videos", "audios", "files", "outputs", "resultUrls"):
            items = task_result.get(key)
            if isinstance(items, list):
                for item in items:
                    url = _extract_url_from_value(item)
                    if url:
                        return url
            elif items is not None:
                url = _extract_url_from_value(items)
                if url:
                    return url
        url = _extract_url_from_value(task_result)
        if url:
            return url

    provider_response = data.get("response")
    if isinstance(provider_response, dict):
        result_urls = provider_response.get("resultUrls") or provider_response.get("urls")
        if isinstance(result_urls, list):
            for item in result_urls:
                url = _extract_url_from_value(item)
                if url:
                    return url
        url = _extract_url_from_value(provider_response)
        if url:
            return url

    output = data.get("output")
    if isinstance(output, list):
        for item in output:
            url = _extract_url_from_value(item)
            if url:
                return url
    elif output is not None:
        url = _extract_url_from_value(output)
        if url:
            return url

    url = _extract_url_from_value(data)
    if url:
        return url
    return _extract_url_from_value(status_response)


async def _send_failure_notifications(task_id: str, user_id: str, media_type: str, error: str):
    """Send in-app + email notifications on final task failure."""
    async with AsyncSessionLocal() as db:
        try:
            from app.services.notification_service import notify_task_failed, notify_admin_task_alert

            # Notify the user who owns the task
            await notify_task_failed(
                db=db, user_id=user_id, task_id=task_id,
                media_type=media_type, error=error,
            )

            # Notify all admins
            await notify_admin_task_alert(
                db=db,
                title=f"Media task failed after max retries",
                message=f"User {user_id} — {media_type} task {task_id}: {error[:200]}",
                data={"task_id": task_id, "user_id": user_id, "media_type": media_type},
                send_email=True,
            )
        except Exception as notify_err:
            logger.warning("failure_notification_error", task_id=task_id, error=str(notify_err))


async def _generate_image_async(task_id: str, user_id: str, request_data: dict):
    """
    Async implementation of image generation
    """
    async with AsyncSessionLocal() as db:
        task = None
        user = None
        api_config = request_data.get("api_config") if isinstance(request_data, dict) else None
        if not isinstance(api_config, dict):
            api_config = {}
        trace_id = str(
            api_config.get("trace_id")
            or api_config.get("debug_trace_id")
            or ""
        ).strip() or None
        try:
            debug_log_file = write_media_debug_event("image.task.start", {
                "trace_id": trace_id,
                "task_id": task_id,
                "user_id": user_id,
                "model": request_data.get("model"),
                "provider_hint": api_config.get("provider"),
                "request_keys": sorted(list(request_data.keys())) if isinstance(request_data, dict) else [],
            })
            # Get task and user from database
            result = await db.execute(
                select(MediaTask).filter(MediaTask.id == task_id)
            )
            task = result.scalar_one_or_none()

            result = await db.execute(
                select(User).filter(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not task or not user:
                logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
                return {"status": "failed", "error": "Task or user not found"}

            # Update status to processing
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            await db.commit()

            # Create generation request
            request = ImageGenerationRequest(**request_data)

            # Call LLM Gateway
            gateway = LLMGateway(db)
            response = await gateway.generate_image(request, user)

            # Update task with results
            task.status = TaskStatus.COMPLETED
            task.result_url = response.data[0].get("url") if response.data else None
            task.result_data = {"response": response.dict()}
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None
            task.completed_at = datetime.utcnow()
            await db.commit()
            write_media_debug_event("image.task.completed", {
                "trace_id": trace_id,
                "task_id": task_id,
                "provider_task_id": response.id,
                "result_url": task.result_url,
                "provider": response.provider,
                "log_file": debug_log_file,
            })

            logger.info("generate_image_task_completed", task_id=task_id)
            return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

        except Exception as e:
            logger.error("generate_image_task_failed", task_id=task_id, error=str(e))
            debug_log_file = write_media_debug_event("image.task.failed", {
                "trace_id": trace_id,
                "task_id": task_id,
                "user_id": user_id,
                "model": request_data.get("model") if isinstance(request_data, dict) else None,
                "provider_hint": api_config.get("provider"),
                "error": str(e),
            })

            # Update task status to failed
            try:
                if task is not None:
                    task.status = TaskStatus.FAILED
                    task.error_message = str(e)
                    existing_result_data = task.result_data if isinstance(task.result_data, dict) else {}
                    task.result_data = {
                        **existing_result_data,
                        "debug": {
                            "trace_id": trace_id,
                            "provider_hint": api_config.get("provider"),
                            "log_file": debug_log_file,
                        },
                        "failure": {
                            "error": str(e),
                            "error_type": type(e).__name__,
                        },
                    }
                    task.completed_at = datetime.utcnow()
                    await db.commit()
            except:
                pass

            raise


@celery_app.task(bind=True, max_retries=3)
def generate_image_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async image generation
    """
    logger.info("generate_image_task_started", task_id=task_id, user_id=user_id)

    try:
        result = _run_async(_generate_image_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_image_task_exception", task_id=task_id, error=str(e))

        # Retry if max_retries not reached
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)  # Retry after 1 minute

        # Max retries exhausted — notify user + admins
        _run_async(_send_failure_notifications(task_id, user_id, "image", str(e)))
        return {"status": "failed", "task_id": task_id, "error": str(e)}


async def _generate_video_async(task_id: str, user_id: str, request_data: dict):
    """
    Async implementation of video generation
    """
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(MediaTask).filter(MediaTask.id == task_id)
            )
            task = result.scalar_one_or_none()

            result = await db.execute(
                select(User).filter(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not task or not user:
                logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
                return {"status": "failed", "error": "Task or user not found"}

            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            await db.commit()

            request = VideoGenerationRequest(**request_data)
            gateway = LLMGateway(db)
            # Async queue mode: submit to provider quickly and avoid blocking worker on long polling.
            response = await gateway.generate_video(request, user, wait_for_completion=False)

            external_task_id = response.id or None
            if external_task_id:
                task.task_id = external_task_id

            task.result_data = {"submission": response.dict()}
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None

            # If provider returns a ready URL immediately, finish now. Otherwise stay processing.
            immediate_url = response.data[0].get("url") if response.data else None
            if immediate_url:
                task.status = TaskStatus.COMPLETED
                task.result_url = immediate_url
                task.completed_at = datetime.utcnow()
                await db.commit()
                logger.info("generate_video_task_completed_immediate", task_id=task_id, external_task_id=external_task_id)
                return {"status": "completed", "task_id": task_id, "external_task_id": external_task_id, "result_url": task.result_url}

            await db.commit()
            logger.info("generate_video_task_submitted", task_id=task_id, external_task_id=external_task_id)
            return {"status": "submitted", "task_id": task_id, "external_task_id": external_task_id}

        except Exception as e:
            logger.error("generate_video_task_failed", task_id=task_id, error=str(e))

            try:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                await db.commit()
            except:
                pass

            raise


@celery_app.task(bind=True, max_retries=3)
def generate_video_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async video generation
    """
    logger.info("generate_video_task_started", task_id=task_id, user_id=user_id)

    try:
        result = _run_async(_generate_video_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_video_task_exception", task_id=task_id, error=str(e))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=120)  # Retry after 2 minutes

        # Max retries exhausted — notify user + admins
        _run_async(_send_failure_notifications(task_id, user_id, "video", str(e)))
        return {"status": "failed", "task_id": task_id, "error": str(e)}


async def _generate_audio_async(task_id: str, user_id: str, request_data: dict):
    """
    Async implementation of audio generation
    """
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(MediaTask).filter(MediaTask.id == task_id)
            )
            task = result.scalar_one_or_none()

            result = await db.execute(
                select(User).filter(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not task or not user:
                logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
                return {"status": "failed", "error": "Task or user not found"}

            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.utcnow()
            await db.commit()

            request = AudioGenerationRequest(**request_data)
            gateway = LLMGateway(db)
            response = await gateway.generate_audio(request, user)

            task.status = TaskStatus.COMPLETED
            task.result_url = response.data[0].get("url") if response.data else None
            task.result_data = {"response": response.dict()}
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None
            task.completed_at = datetime.utcnow()
            await db.commit()

            logger.info("generate_audio_task_completed", task_id=task_id)
            return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

        except Exception as e:
            logger.error("generate_audio_task_failed", task_id=task_id, error=str(e))

            try:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
                task.completed_at = datetime.utcnow()
                await db.commit()
            except:
                pass

            raise


@celery_app.task(bind=True, max_retries=3)
def generate_audio_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async audio generation
    """
    logger.info("generate_audio_task_started", task_id=task_id, user_id=user_id)

    try:
        result = _run_async(_generate_audio_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_audio_task_exception", task_id=task_id, error=str(e))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)

        # Max retries exhausted — notify user + admins
        _run_async(_send_failure_notifications(task_id, user_id, "audio", str(e)))
        return {"status": "failed", "task_id": task_id, "error": str(e)}


async def _cleanup_expired_tasks_async():
    """
    Async implementation of cleanup expired tasks.
    Deletes tasks older than 12 days to manage storage.
    Also prunes stale entries from Redis active-job sets.
    """
    async with AsyncSessionLocal() as db:
        try:
            # Delete tasks older than 12 days (data retention policy)
            cutoff_date = datetime.utcnow() - timedelta(days=12)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status.in_([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]),
                    MediaTask.completed_at < cutoff_date
                )
            )
            tasks = result.scalars().all()

            deleted_count = 0
            for task in tasks:
                await db.delete(task)
                deleted_count += 1

            await db.commit()

            # Prune stale Redis active-job set entries
            stale_removed = 0
            try:
                from app.core.config import settings
                import redis.asyncio as aioredis

                redis_client = aioredis.from_url(
                    settings.CELERY_BROKER_URL or "redis://localhost:6379/0"
                )
                cursor = 0
                while True:
                    cursor, keys = await redis_client.scan(
                        cursor, match="media-jobs:user:*:active", count=100
                    )
                    for key in keys:
                        members = await redis_client.smembers(key)
                        for job_id_bytes in members:
                            job_id = job_id_bytes.decode() if isinstance(job_id_bytes, bytes) else str(job_id_bytes)
                            status_raw = await redis_client.get(f"media-job:{job_id}:status")
                            if status_raw is None:
                                # Job key expired (24h TTL) → stale entry
                                await redis_client.srem(key, job_id_bytes)
                                stale_removed += 1
                    if cursor == 0:
                        break
                await redis_client.aclose()
            except Exception as redis_err:
                logger.warning("cleanup_redis_active_sets_failed", error=str(redis_err))

            logger.info(
                "cleanup_expired_tasks_completed",
                deleted_count=deleted_count,
                stale_redis_removed=stale_removed,
            )
            return {"status": "success", "deleted_count": deleted_count, "stale_redis_removed": stale_removed}

        except Exception as e:
            logger.error("cleanup_expired_tasks_failed", error=str(e))
            raise


@celery_app.task
def cleanup_expired_tasks():
    """
    Periodic task to cleanup old completed/failed tasks.
    Runs daily at 3:00 AM UTC.
    Deletes tasks older than 12 days to manage storage.
    """
    logger.info("cleanup_expired_tasks_started")

    try:
        result = _run_async(_cleanup_expired_tasks_async())
        return result

    except Exception as e:
        logger.error("cleanup_expired_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _retry_failed_tasks_async():
    """
    Async implementation of retry failed tasks
    """
    async with AsyncSessionLocal() as db:
        try:
            # Find recently failed tasks (last 1 hour) that might be retryable
            cutoff_date = datetime.utcnow() - timedelta(hours=1)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status == TaskStatus.FAILED,
                    MediaTask.completed_at > cutoff_date,
                    (MediaTask.error_message.like("%timeout%") |
                     MediaTask.error_message.like("%connection%") |
                     MediaTask.error_message.like("%temporary%"))
                ).limit(10)
            )
            failed_tasks = result.scalars().all()

            retried_count = 0
            for task in failed_tasks:
                # Reset task to pending
                task.status = TaskStatus.PENDING
                task.error_message = None
                task.completed_at = None

                # Re-submit to Celery based on media type
                if task.media_type == MediaType.IMAGE:
                    generate_image_task.delay(task.id, task.user_id, task.parameters or {})
                elif task.media_type == MediaType.VIDEO:
                    generate_video_task.delay(task.id, task.user_id, task.parameters or {})
                elif task.media_type == MediaType.AUDIO:
                    generate_audio_task.delay(task.id, task.user_id, task.parameters or {})

                retried_count += 1

            await db.commit()

            logger.info("retry_failed_tasks_completed", retried_count=retried_count)
            return {"status": "success", "retried_count": retried_count}

        except Exception as e:
            logger.error("retry_failed_tasks_failed", error=str(e))
            raise


@celery_app.task
def retry_failed_tasks():
    """
    Periodic task to retry failed tasks with transient errors
    Runs every 15 minutes
    """
    logger.info("retry_failed_tasks_started")

    try:
        result = _run_async(_retry_failed_tasks_async())
        return result

    except Exception as e:
        logger.error("retry_failed_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _retry_media_callback_events_async():
    """Retry due durable callback events from retry queue."""
    async with AsyncSessionLocal() as db:
        try:
            result = await retry_due_callback_events(db, limit=100)
            logger.info("retry_media_callback_events_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("retry_media_callback_events_failed", error=str(e))
            raise


@celery_app.task
def retry_media_callback_events():
    """Periodic retry for callback events in retry_pending status."""
    logger.info("retry_media_callback_events_started")
    try:
        result = _run_async(_retry_media_callback_events_async())
        return result
    except Exception as e:
        logger.error("retry_media_callback_events_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _process_library_index_job_async(job_id: int):
    """Async worker entrypoint for a single library index job."""
    async with AsyncSessionLocal() as db:
        try:
            result = await process_library_index_job(db, job_id)
            logger.info("process_library_index_job_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("process_library_index_job_failed", job_id=job_id, error=str(e))
            raise


@celery_app.task
def process_library_index_job_task(job_id: int):
    """Queue worker task for extract/chunk/embed/upsert pipeline."""
    logger.info("process_library_index_job_started", job_id=job_id)
    try:
        return _run_async(_process_library_index_job_async(job_id))
    except Exception as e:
        logger.error("process_library_index_job_exception", job_id=job_id, error=str(e))
        return {"status": "failed", "error": str(e), "job_id": job_id}


async def _retry_library_index_jobs_async():
    """Retry due library index jobs in retry_pending/pending state."""
    async with AsyncSessionLocal() as db:
        try:
            result = await retry_due_library_index_jobs(db, limit=100)
            logger.info("retry_library_index_jobs_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("retry_library_index_jobs_failed", error=str(e))
            raise


@celery_app.task
def retry_library_index_jobs():
    """Periodic retry for library index jobs due for execution."""
    logger.info("retry_library_index_jobs_started")
    try:
        return _run_async(_retry_library_index_jobs_async())
    except Exception as e:
        logger.error("retry_library_index_jobs_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _run_library_backfill_batch_async(
    *,
    tenant_id: int | None,
    cursor: int,
    batch_size: int,
    dry_run: bool,
    paused: bool,
    max_enqueue: int,
):
    """Run one operator-controlled backfill batch for library indexing."""
    async with AsyncSessionLocal() as db:
        try:
            result = await run_library_backfill_batch(
                db,
                tenant_id=tenant_id,
                cursor=cursor,
                batch_size=batch_size,
                dry_run=dry_run,
                paused=paused,
                max_enqueue=max_enqueue,
            )
            logger.info("library_backfill_batch_task_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error(
                "library_backfill_batch_task_failed",
                tenant_id=tenant_id,
                cursor=cursor,
                error=str(e),
            )
            raise


@celery_app.task
def run_library_backfill_batch_task(
    tenant_id: int | None = None,
    cursor: int = 0,
    batch_size: int = 100,
    dry_run: bool = True,
    paused: bool = False,
    max_enqueue: int = 25,
):
    """Operator-triggered backfill batch with dry-run/pause/resume controls."""
    logger.info(
        "library_backfill_batch_task_started",
        tenant_id=tenant_id,
        cursor=cursor,
        batch_size=batch_size,
        dry_run=dry_run,
        paused=paused,
        max_enqueue=max_enqueue,
    )
    try:
        return _run_async(
            _run_library_backfill_batch_async(
                tenant_id=tenant_id,
                cursor=cursor,
                batch_size=batch_size,
                dry_run=dry_run,
                paused=paused,
                max_enqueue=max_enqueue,
            )
        )
    except Exception as e:
        logger.error("library_backfill_batch_task_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _reindex_all_library_async(tenant_id: int | None):
    """Reindex all library items for the specified tenant (or all tenants)."""
    async with AsyncSessionLocal() as db:
        try:
            result = await reindex_all_library_items(
                db,
                tenant_id=str(tenant_id) if tenant_id else None,
            )
            logger.info("reindex_all_library_task_completed", **result)
            return {"status": "success", **result}
        except Exception as e:
            logger.error("reindex_all_library_task_failed", error=str(e))
            raise


@celery_app.task
def reindex_all_library_task(tenant_id: int | None = None):
    """Admin-triggered full reindex of all library items."""
    logger.info("reindex_all_library_task_started", tenant_id=tenant_id)
    try:
        return _run_async(_reindex_all_library_async(tenant_id))
    except Exception as e:
        logger.error("reindex_all_library_task_exception", error=str(e))
        return {"status": "failed", "error": str(e)}


async def _recover_stuck_tasks_async():
    """
    Find and recover tasks stuck in 'processing' status
    This handles tasks that were interrupted by worker restarts or timeouts
    """
    async with AsyncSessionLocal() as db:
        try:
            from datetime import timezone

            # Poll tasks that have been processing for at least a short period.
            # This keeps status fresh even when provider callbacks are unavailable.
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=2)

            result = await db.execute(
                select(MediaTask).filter(
                    MediaTask.status == TaskStatus.PROCESSING,
                    MediaTask.started_at < cutoff_time,
                    MediaTask.task_id.isnot(None)  # Must have external task_id
                ).limit(20)
            )
            stuck_tasks = result.scalars().all()

            if not stuck_tasks:
                logger.info("recover_stuck_tasks_none_found")
                return {"status": "success", "recovered_count": 0}

            logger.info("recover_stuck_tasks_found", count=len(stuck_tasks))

            recovered_count = 0
            failed_count = 0

            for task in stuck_tasks:
                try:
                    logger.info(
                        "recover_stuck_task_polling",
                        task_id=task.id,
                        external_task_id=task.task_id,
                        model=task.model,
                        stuck_since=task.started_at.isoformat() if task.started_at else None,
                    )

                    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider

                    if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
                        # --- BytePlus polling branch ---
                        from app.services.media_provider_service import get_media_provider_key
                        provider_config = await get_media_provider_key("byteplus_modelark")
                        if not provider_config or not provider_config.get("apiKey"):
                            logger.warning(
                                "recover_stuck_task_byteplus_not_configured",
                                task_id=task.id,
                            )
                            continue

                        byteplus_client = None
                        try:
                            byteplus_client = BytePlusModelArkProvider(
                                api_key=provider_config["apiKey"],
                                base_url=provider_config.get("baseUrl"),
                            )
                            import httpx
                            try:
                                status_response = await byteplus_client.get_task_status(task.task_id)
                            except httpx.HTTPStatusError as http_err:
                                if http_err.response.status_code == 429:
                                    logger.warning(
                                        "recover_stuck_task_byteplus_rate_limited",
                                        task_id=task.id,
                                        external_task_id=task.task_id,
                                    )
                                    # `continue` propagates through the outer try/finally,
                                    # so byteplus_client.aclose() is called before the loop advances.
                                    continue
                                raise

                            task_state, raw_state = _normalize_byteplus_task_state(status_response)
                            logger.info(
                                "recover_stuck_task_byteplus_status",
                                task_id=task.id,
                                task_state=task_state,
                                raw_state=raw_state,
                            )

                            if task_state == "success":
                                result_url = _extract_byteplus_result_url(status_response)
                                if result_url:
                                    task.status = TaskStatus.COMPLETED
                                    task.result_url = result_url
                                    task.result_data = status_response
                                    task.completed_at = datetime.now(timezone.utc)
                                    recovered_count += 1
                                    logger.info(
                                        "recover_stuck_task_byteplus_completed",
                                        task_id=task.id,
                                        result_url=result_url,
                                    )
                                else:
                                    logger.warning(
                                        "recover_stuck_task_byteplus_success_no_url",
                                        task_id=task.id,
                                    )

                            elif task_state == "fail":
                                error_msg = (
                                    (status_response.get("error") or {}).get("message")
                                    or "Task failed"
                                )
                                task.status = TaskStatus.FAILED
                                task.error_message = f"BytePlus failed: {error_msg[:200]}"
                                task.result_data = status_response
                                task.completed_at = datetime.now(timezone.utc)
                                failed_count += 1
                                logger.warning(
                                    "recover_stuck_task_byteplus_failed",
                                    task_id=task.id,
                                    error=error_msg,
                                )

                            # "processing"/"unknown": do nothing, re-check next cycle

                        finally:
                            if byteplus_client is not None:
                                await byteplus_client.aclose()

                    else:
                        # --- Kie.ai polling branch ---
                        # Get Kie.ai provider config from shared media_providers table
                        from app.services.media_provider_service import get_media_provider_key
                        provider_config = await get_media_provider_key("kie_ai")
                        if not provider_config or not provider_config.get("apiKey"):
                            logger.warning("recover_stuck_task_provider_not_configured", task_id=task.id)
                            continue

                        from app.llm_proxy.providers.kie_ai_provider import KieAIProvider
                        provider = KieAIProvider(
                            api_key=provider_config["apiKey"],
                            base_url=provider_config.get("baseUrl") or "https://api.kie.ai/api/v1",
                            callback_url=provider_config.get("callbackUrl"),
                        )

                        preferred_query_endpoint = None

                        task_parameters = task.parameters
                        if isinstance(task_parameters, str):
                            try:
                                task_parameters = json.loads(task_parameters)
                            except json.JSONDecodeError:
                                task_parameters = {}

                        if isinstance(task_parameters, dict):
                            api_cfg = task_parameters.get("api_config")
                            if isinstance(api_cfg, dict):
                                preferred_query_endpoint = (
                                    api_cfg.get("query_endpoint")
                                    or api_cfg.get("status_endpoint")
                                    or api_cfg.get("api_query_endpoint")
                                    or api_cfg.get("api_status_endpoint")
                                )

                        if not preferred_query_endpoint and task.model:
                            try:
                                model_result = await db.execute(
                                    text('SELECT "configJson" FROM media_models WHERE "modelId" = :model_id LIMIT 1'),
                                    {"model_id": task.model}
                                )
                                model_row = model_result.fetchone()
                                if model_row:
                                    preferred_query_endpoint = _extract_model_query_endpoint(model_row[0])
                            except Exception as lookup_error:
                                logger.warning(
                                    "recover_stuck_task_query_endpoint_lookup_failed",
                                    task_id=task.id,
                                    model=task.model,
                                    error=str(lookup_error),
                                )

                        # Poll for current status (single check, no wait)
                        status_response = await provider.get_task_status(
                            task.task_id,
                            preferred_status_endpoint=preferred_query_endpoint,
                        )
                        task_state, raw_state = _normalize_kie_task_state(status_response)

                        logger.info(
                            "recover_stuck_task_status",
                            task_id=task.id,
                            task_state=task_state,
                            raw_state=raw_state,
                            preferred_query_endpoint=preferred_query_endpoint,
                        )

                        if task_state == "success":
                            result_url = _extract_first_kie_result_url(status_response)
                            if result_url:
                                task.status = TaskStatus.COMPLETED
                                task.result_url = result_url
                                task.result_data = status_response
                                task.completed_at = datetime.now(timezone.utc)
                                recovered_count += 1
                                logger.info("recover_stuck_task_completed", task_id=task.id, result_url=result_url)
                            else:
                                logger.warning(
                                    "recover_stuck_task_success_without_result_url",
                                    task_id=task.id,
                                    external_task_id=task.task_id,
                                )

                        elif task_state == "fail":
                            # Task failed on provider side
                            data = status_response.get("data", {}) if isinstance(status_response, dict) else {}
                            error_msg = (
                                status_response.get("msg")
                                or status_response.get("message")
                                or data.get("error")
                                or data.get("errorMessage")
                                or "Unknown error from provider"
                            )
                            task.status = TaskStatus.FAILED
                            task.error_message = f"Provider failed: {error_msg}"
                            task.result_data = status_response
                            task.completed_at = datetime.now(timezone.utc)
                            failed_count += 1
                            logger.warning("recover_stuck_task_failed", task_id=task.id, error=error_msg)

                        else:
                            # Still processing or unknown: keep task as-is and retry on next cycle.
                            logger.info(
                                "recover_stuck_task_still_processing",
                                task_id=task.id,
                                task_state=task_state,
                                raw_state=raw_state,
                            )

                except Exception as task_error:
                    logger.error(
                        "recover_stuck_task_error",
                        task_id=task.id,
                        error=str(task_error)
                    )
                    # Don't mark as failed yet - will retry on next recovery cycle
                    continue

            await db.commit()

            logger.info(
                "recover_stuck_tasks_completed",
                recovered_count=recovered_count,
                failed_count=failed_count,
                total_processed=len(stuck_tasks)
            )

            return {
                "status": "success",
                "recovered_count": recovered_count,
                "failed_count": failed_count,
                "total_processed": len(stuck_tasks)
            }

        except Exception as e:
            logger.error("recover_stuck_tasks_failed", error=str(e))
            raise


@celery_app.task
def recover_stuck_tasks():
    """
    Periodic task to recover tasks stuck in 'processing' status
    Handles cases where worker restarts interrupted polling
    Runs every 2 minutes (see celery beat schedule)
    """
    logger.info("recover_stuck_tasks_started")

    try:
        result = _run_async(_recover_stuck_tasks_async())
        return result

    except Exception as e:
        logger.error("recover_stuck_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}
