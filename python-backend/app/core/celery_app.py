"""
Celery Application for Async Task Processing
Handles long-running media generation tasks
"""

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings
import os

# Create Celery app
celery_app = Celery(
    "smartspec",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes
    task_soft_time_limit=1740,  # 29 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# Periodic tasks
celery_app.conf.beat_schedule = {
    "cleanup-expired-tasks": {
        "task": "app.tasks.media_tasks.cleanup_expired_tasks",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes
    },
    "retry-failed-tasks": {
        "task": "app.tasks.media_tasks.retry_failed_tasks",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
    },
}

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])

if __name__ == "__main__":
    celery_app.start()
