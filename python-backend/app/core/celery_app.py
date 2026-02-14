"""
Celery Application for Async Task Processing
Handles long-running media generation tasks
"""

from celery import Celery
from celery.schedules import crontab
from kombu import Queue
from app.core.config import settings
import os

# Required queues — worker MUST consume from all of these
REQUIRED_QUEUES = ["celery", "video", "media"]

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
    # Declare all queues so worker consumes from them by default
    # (even without -Q flag). This prevents jobs stuck in queue.
    task_queues=[
        Queue("celery"),
        Queue("video"),
        Queue("media"),
    ],
    task_create_missing_queues=True,
    # Queue routing: isolate FFmpeg video tasks from API-based media tasks
    task_routes={
        # FFmpeg video processing -> video queue (heavy CPU/IO)
        "app.tasks.media_job_worker.execute_media_job": {"queue": "video"},
        # API-based media generation -> media queue (network-bound)
        "app.tasks.media_tasks.generate_image_task": {"queue": "media"},
        "app.tasks.media_tasks.generate_video_task": {"queue": "media"},
        "app.tasks.media_tasks.generate_audio_task": {"queue": "media"},
        # Periodic maintenance -> media queue (lightweight)
        "app.tasks.media_tasks.cleanup_expired_tasks": {"queue": "media"},
        "app.tasks.media_tasks.retry_failed_tasks": {"queue": "media"},
        "app.tasks.media_tasks.retry_media_callback_events": {"queue": "media"},
        "app.tasks.media_tasks.process_library_index_job_task": {"queue": "media"},
        "app.tasks.media_tasks.retry_library_index_jobs": {"queue": "media"},
        "app.tasks.media_tasks.recover_stuck_tasks": {"queue": "media"},
        # Google Drive indexing -> media queue (network-bound)
        "app.tasks.google_drive_tasks.process_google_drive_index_job": {"queue": "media"},
        "app.tasks.google_drive_tasks.initial_drive_sync": {"queue": "media"},
        "app.tasks.google_drive_tasks.process_drive_changes": {"queue": "media"},
        "app.tasks.google_drive_tasks.renew_drive_watch_channels": {"queue": "media"},
        "app.tasks.google_drive_tasks.disconnect_google_drive_cleanup": {"queue": "media"},
        # Workflow tasks -> celery queue (lightweight, frequent)
        "app.tasks.workflow_tasks.check_scheduled_workflows": {"queue": "celery"},
        "app.tasks.workflow_tasks.process_system_event": {"queue": "celery"},
        "app.tasks.workflow_tasks.process_queue_message": {"queue": "celery"},
        "app.tasks.workflow_tasks.execute_webhook_workflow": {"queue": "celery"},
        "app.tasks.workflow_tasks.execute_delayed_node": {"queue": "celery"},
    },
)

# Periodic tasks
celery_app.conf.beat_schedule = {
    "cleanup-expired-tasks": {
        "task": "app.tasks.media_tasks.cleanup_expired_tasks",
        "schedule": crontab(hour=3, minute=0),  # Daily at 3:00 AM UTC - deletes tasks older than 12 days
    },
    "retry-failed-tasks": {
        "task": "app.tasks.media_tasks.retry_failed_tasks",
        "schedule": crontab(minute="*/15"),  # Every 15 minutes
    },
    "retry-media-callback-events": {
        "task": "app.tasks.media_tasks.retry_media_callback_events",
        "schedule": crontab(minute="*/1"),  # Every minute
    },
    "retry-library-index-jobs": {
        "task": "app.tasks.media_tasks.retry_library_index_jobs",
        "schedule": crontab(minute="*/1"),  # Every minute
    },
    "recover-stuck-tasks": {
        "task": "app.tasks.media_tasks.recover_stuck_tasks",
        "schedule": crontab(minute="*/2"),  # Every 2 minutes - refresh provider status for processing tasks
    },
    "check-scheduled-workflows": {
        "task": "app.tasks.workflow_tasks.check_scheduled_workflows",
        "schedule": crontab(minute="*"),  # Every minute - check for due schedules
    },
    "cleanup-expired-edit-sessions": {
        "task": "cleanup_expired_edit_sessions",
        "schedule": crontab(minute="*/30"),  # Every 30 minutes - expire stale Google Drive edit sessions
    },
    "renew-drive-watch-channels": {
        "task": "renew_drive_watch_channels",
        "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours - renew expiring webhook channels
    },
    "poll-drive-changes": {
        "task": "poll_drive_changes",
        "schedule": crontab(minute="*/15"),  # Every 15 min - fallback polling when webhook is down
    },
}

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])

if __name__ == "__main__":
    celery_app.start()
