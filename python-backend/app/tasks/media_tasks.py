"""
Celery Tasks for Media Generation
Handles async image, video, and audio generation
"""

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.models.user import User
from app.services.media_task_service import MediaTaskService
from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import (
    ImageGenerationRequest,
    VideoGenerationRequest,
    AudioGenerationRequest,
)
from datetime import datetime, timedelta
from sqlalchemy import select
import structlog
import asyncio

logger = structlog.get_logger()


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
        try:
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

            logger.info("generate_image_task_completed", task_id=task_id)
            return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

        except Exception as e:
            logger.error("generate_image_task_failed", task_id=task_id, error=str(e))

            # Update task status to failed
            try:
                task.status = TaskStatus.FAILED
                task.error_message = str(e)
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
        result = asyncio.run(_generate_image_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_image_task_exception", task_id=task_id, error=str(e))

        # Retry if max_retries not reached
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)  # Retry after 1 minute

        # Max retries exhausted — notify user + admins
        asyncio.run(_send_failure_notifications(task_id, user_id, "image", str(e)))
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
            response = await gateway.generate_video(request, user)

            task.status = TaskStatus.COMPLETED
            task.result_url = response.data[0].get("url") if response.data else None
            task.result_data = {"response": response.dict()}
            task.credits_used = int(response.credits_used) if response.credits_used else None
            task.credits_balance = int(response.credits_balance) if response.credits_balance else None
            task.completed_at = datetime.utcnow()
            await db.commit()

            logger.info("generate_video_task_completed", task_id=task_id)
            return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

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
        result = asyncio.run(_generate_video_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_video_task_exception", task_id=task_id, error=str(e))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=120)  # Retry after 2 minutes

        # Max retries exhausted — notify user + admins
        asyncio.run(_send_failure_notifications(task_id, user_id, "video", str(e)))
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
        result = asyncio.run(_generate_audio_async(task_id, user_id, request_data))
        return result

    except Exception as e:
        logger.error("generate_audio_task_exception", task_id=task_id, error=str(e))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)

        # Max retries exhausted — notify user + admins
        asyncio.run(_send_failure_notifications(task_id, user_id, "audio", str(e)))
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
        result = asyncio.run(_cleanup_expired_tasks_async())
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
        result = asyncio.run(_retry_failed_tasks_async())
        return result

    except Exception as e:
        logger.error("retry_failed_tasks_exception", error=str(e))
        return {"status": "failed", "error": str(e)}
