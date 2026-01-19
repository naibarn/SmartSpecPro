"""
Celery Tasks for Media Generation
Handles async image, video, and audio generation
"""

from celery import Task
from app.core.celery_app import celery_app
from app.core.database import get_db
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


class DatabaseTask(Task):
    """Base task with database session management"""
    _db = None

    @property
    def db(self):
        if self._db is None:
            self._db = next(get_db())
        return self._db


@celery_app.task(bind=True, base=DatabaseTask, max_retries=3)
def generate_image_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async image generation
    """
    logger.info("generate_image_task_started", task_id=task_id, user_id=user_id)

    try:
        # Get task and user from database
        db = self.db
        task = db.query(MediaTask).filter(MediaTask.id == task_id).first()
        user = db.query(User).filter(User.id == user_id).first()

        if not task or not user:
            logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
            return {"status": "failed", "error": "Task or user not found"}

        # Update status to processing
        task.status = TaskStatus.PROCESSING
        task.started_at = datetime.utcnow()
        db.commit()

        # Create generation request
        request = ImageGenerationRequest(**request_data)

        # Call LLM Gateway
        gateway = LLMGateway(db)

        # Run async function in event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response = loop.run_until_complete(gateway.generate_image(request, user))
        loop.close()

        # Update task with results
        task.status = TaskStatus.COMPLETED
        task.result_url = response.data[0].get("url") if response.data else None
        task.result_data = {"response": response.dict()}
        task.credits_used = int(response.credits_used) if response.credits_used else None
        task.credits_balance = int(response.credits_balance) if response.credits_balance else None
        task.completed_at = datetime.utcnow()
        db.commit()

        logger.info("generate_image_task_completed", task_id=task_id)
        return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

    except Exception as e:
        logger.error("generate_image_task_failed", task_id=task_id, error=str(e))

        # Update task status to failed
        try:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.commit()
        except:
            pass

        # Retry if max_retries not reached
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)  # Retry after 1 minute

        return {"status": "failed", "task_id": task_id, "error": str(e)}


@celery_app.task(bind=True, base=DatabaseTask, max_retries=3)
def generate_video_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async video generation
    """
    logger.info("generate_video_task_started", task_id=task_id, user_id=user_id)

    try:
        db = self.db
        task = db.query(MediaTask).filter(MediaTask.id == task_id).first()
        user = db.query(User).filter(User.id == user_id).first()

        if not task or not user:
            logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
            return {"status": "failed", "error": "Task or user not found"}

        task.status = TaskStatus.PROCESSING
        task.started_at = datetime.utcnow()
        db.commit()

        request = VideoGenerationRequest(**request_data)
        gateway = LLMGateway(db)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response = loop.run_until_complete(gateway.generate_video(request, user))
        loop.close()

        task.status = TaskStatus.COMPLETED
        task.result_url = response.data[0].get("url") if response.data else None
        task.result_data = {"response": response.dict()}
        task.credits_used = int(response.credits_used) if response.credits_used else None
        task.credits_balance = int(response.credits_balance) if response.credits_balance else None
        task.completed_at = datetime.utcnow()
        db.commit()

        logger.info("generate_video_task_completed", task_id=task_id)
        return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

    except Exception as e:
        logger.error("generate_video_task_failed", task_id=task_id, error=str(e))

        try:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.commit()
        except:
            pass

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=120)  # Retry after 2 minutes

        return {"status": "failed", "task_id": task_id, "error": str(e)}


@celery_app.task(bind=True, base=DatabaseTask, max_retries=3)
def generate_audio_task(self, task_id: str, user_id: str, request_data: dict):
    """
    Celery task for async audio generation
    """
    logger.info("generate_audio_task_started", task_id=task_id, user_id=user_id)

    try:
        db = self.db
        task = db.query(MediaTask).filter(MediaTask.id == task_id).first()
        user = db.query(User).filter(User.id == user_id).first()

        if not task or not user:
            logger.error("task_or_user_not_found", task_id=task_id, user_id=user_id)
            return {"status": "failed", "error": "Task or user not found"}

        task.status = TaskStatus.PROCESSING
        task.started_at = datetime.utcnow()
        db.commit()

        request = AudioGenerationRequest(**request_data)
        gateway = LLMGateway(db)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response = loop.run_until_complete(gateway.generate_audio(request, user))
        loop.close()

        task.status = TaskStatus.COMPLETED
        task.result_url = response.data[0].get("url") if response.data else None
        task.result_data = {"response": response.dict()}
        task.credits_used = int(response.credits_used) if response.credits_used else None
        task.credits_balance = int(response.credits_balance) if response.credits_balance else None
        task.completed_at = datetime.utcnow()
        db.commit()

        logger.info("generate_audio_task_completed", task_id=task_id)
        return {"status": "completed", "task_id": task_id, "result_url": task.result_url}

    except Exception as e:
        logger.error("generate_audio_task_failed", task_id=task_id, error=str(e))

        try:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.commit()
        except:
            pass

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)

        return {"status": "failed", "task_id": task_id, "error": str(e)}


@celery_app.task(bind=True, base=DatabaseTask)
def cleanup_expired_tasks(self):
    """
    Periodic task to cleanup old completed/failed tasks
    Runs every 30 minutes
    """
    logger.info("cleanup_expired_tasks_started")

    try:
        db = self.db

        # Delete tasks older than 30 days
        cutoff_date = datetime.utcnow() - timedelta(days=30)

        deleted_count = db.query(MediaTask).filter(
            MediaTask.status.in_([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]),
            MediaTask.completed_at < cutoff_date
        ).delete()

        db.commit()

        logger.info("cleanup_expired_tasks_completed", deleted_count=deleted_count)
        return {"status": "success", "deleted_count": deleted_count}

    except Exception as e:
        logger.error("cleanup_expired_tasks_failed", error=str(e))
        return {"status": "failed", "error": str(e)}


@celery_app.task(bind=True, base=DatabaseTask)
def retry_failed_tasks(self):
    """
    Periodic task to retry failed tasks with transient errors
    Runs every 15 minutes
    """
    logger.info("retry_failed_tasks_started")

    try:
        db = self.db

        # Find recently failed tasks (last 1 hour) that might be retryable
        cutoff_date = datetime.utcnow() - timedelta(hours=1)

        failed_tasks = db.query(MediaTask).filter(
            MediaTask.status == TaskStatus.FAILED,
            MediaTask.completed_at > cutoff_date,
            MediaTask.error_message.like("%timeout%") |
            MediaTask.error_message.like("%connection%") |
            MediaTask.error_message.like("%temporary%")
        ).limit(10).all()

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

        db.commit()

        logger.info("retry_failed_tasks_completed", retried_count=retried_count)
        return {"status": "success", "retried_count": retried_count}

    except Exception as e:
        logger.error("retry_failed_tasks_failed", error=str(e))
        return {"status": "failed", "error": str(e)}
