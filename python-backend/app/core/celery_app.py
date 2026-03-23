"""
Celery Application for Async Task Processing
Handles long-running media generation tasks
"""

from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init, worker_process_shutdown
from kombu import Queue
from app.core.config import settings
import logging
import os

_celery_logger = logging.getLogger(__name__)

# Required queues — worker MUST consume from all of these
REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export", "presentation_import", "sandbox", "vision"]
ONEDRIVE_SCHEDULE_REQUIRED_VARS = (
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_ONEDRIVE_REDIRECT_URI",
)

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
    task_default_queue="media",  # Route unmatched tasks to media queue (has active workers)
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
        Queue("presentation_export"),
        Queue("presentation_import"),
        Queue("sandbox"),  # OpenSandbox job execution
        Queue("vision"),  # Vision analysis tasks
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
        # Workflow generation (LLM call) -> media queue (network-bound)
        "app.tasks.workflow_gen_tasks.generate_workflow": {"queue": "media"},
        # Workflow AI editing (LLM call) -> media queue (network-bound, same as gen)
        "app.tasks.workflow_edit_tasks.edit_workflow": {"queue": "media"},
        # Workflow tasks -> media queue (lightweight, frequent — must use a queue with active workers)
        "app.tasks.workflow_tasks.check_scheduled_workflows": {"queue": "media"},
        "app.tasks.workflow_tasks.process_system_event": {"queue": "media"},
        "app.tasks.workflow_tasks.process_queue_message": {"queue": "media"},
        "app.tasks.workflow_tasks.execute_webhook_workflow": {"queue": "media"},
        "app.tasks.workflow_tasks.execute_delayed_node": {"queue": "media"},
        # OneDrive sync & maintenance -> media queue (network-bound)
        "onedrive.initial_sync": {"queue": "media"},
        "onedrive.process_changes": {"queue": "media"},
        "onedrive.renew_subscriptions": {"queue": "media"},
        "onedrive.cleanup_edit_sessions": {"queue": "media"},
        "onedrive.disconnect_cleanup": {"queue": "media"},
        "poll_onedrive_changes": {"queue": "media"},
        # Approval timeout checker -> media queue (lightweight, periodic — must use queue with active workers)
        "app.tasks.approval_timeout_tasks.check_expired_approvals": {"queue": "media"},
        # Browser policy audit partition maintenance -> media queue
        "app.tasks.browser_policy_maintenance_tasks.ensure_browser_policy_decision_partitions": {"queue": "media"},
        "app.tasks.live_browser_tasks.publish_live_browser_readiness_snapshot": {"queue": "media"},
        "app.tasks.live_browser_tasks.watch_live_browser_readiness_snapshot": {"queue": "media"},
        "app.tasks.live_browser_tasks.run_live_browser_maintenance": {"queue": "media"},
        # Presentation headless rendering (CPU + Playwright + FFmpeg)
        "app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"},
        # Presentation import (PPTX/Google Slides -> slides JSON)
        "tasks.import_presentation": {"queue": "presentation_import"},
        # Agency creator (LLM call) -> media queue (network-bound, like workflow gen)
        "app.tasks.agency_creator_task.create_agency_discover_task": {"queue": "media"},
        "app.tasks.agency_creator_task.create_agency_design_task": {"queue": "media"},
        # Automation Copilot (Browser tasks, LLM + Playwright) -> media queue
        "app.tasks.automation_copilot_task.automation_analyze_task": {"queue": "media"},
        "app.tasks.automation_copilot_task.automation_execute_task": {"queue": "media"},
        "app.tasks.automation_copilot_task.browser_pool_health_check": {"queue": "media"},
        "app.tasks.automation_copilot_task.automation_credit_reconciliation": {"queue": "media"},
        # Sandbox job execution -> sandbox queue (isolated, resource-intensive)
        "app.workers.sandbox_job_worker.execute_sandbox_job": {"queue": "sandbox"},
        # Sandbox maintenance tasks
        "app.tasks.sandbox_maintenance_tasks.cleanup_expired_sandbox_jobs": {"queue": "media"},
        "app.tasks.sandbox_maintenance_tasks.cleanup_orphan_sandboxes": {"queue": "sandbox"},
        "app.tasks.sandbox_maintenance_tasks.detect_stuck_sandbox_jobs": {"queue": "sandbox"},
        # Vision analysis (Gemini 2.5 Flash image analysis) -> vision queue
        "app.tasks.vision_tasks.analyze_image_task": {"queue": "vision"},
    },
    # Ensure non-default task modules are always loaded at worker startup.
    imports=("app.workers.sandbox_job_worker",),
)

# Periodic tasks
beat_schedule = {
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
    "check-expired-approvals": {
        "task": "app.tasks.approval_timeout_tasks.check_expired_approvals",
        "schedule": 300.0,  # Every 5 minutes - auto-reject expired workflow approvals
    },
    "ensure-browser-policy-decision-partitions": {
        "task": "app.tasks.browser_policy_maintenance_tasks.ensure_browser_policy_decision_partitions",
        "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours - keep current/future partitions warm
    },
    "publish-live-browser-readiness": {
        "task": "app.tasks.live_browser_tasks.publish_live_browser_readiness_snapshot",
        "schedule": float(settings.LIVE_BROWSER_READINESS_PUBLISH_INTERVAL_SECONDS),
    },
    "watch-live-browser-readiness": {
        "task": "app.tasks.live_browser_tasks.watch_live_browser_readiness_snapshot",
        "schedule": float(settings.LIVE_BROWSER_READINESS_WATCHDOG_INTERVAL_SECONDS),
    },
    "run-live-browser-maintenance": {
        "task": "app.tasks.live_browser_tasks.run_live_browser_maintenance",
        "schedule": float(settings.LIVE_BROWSER_MAINTENANCE_INTERVAL_SECONDS),
    },
    # Sandbox maintenance tasks
    "cleanup-expired-sandbox-jobs": {
        "task": "app.tasks.sandbox_maintenance_tasks.cleanup_expired_sandbox_jobs",
        "schedule": crontab(hour=4, minute=0),  # Daily at 4:00 AM UTC
    },
    "cleanup-orphan-sandboxes": {
        "task": "app.tasks.sandbox_maintenance_tasks.cleanup_orphan_sandboxes",
        "schedule": crontab(minute="*/10"),  # Every 10 minutes
    },
    "detect-stuck-sandbox-jobs": {
        "task": "app.tasks.sandbox_maintenance_tasks.detect_stuck_sandbox_jobs",
        "schedule": crontab(minute="*/5"),  # Every 5 minutes
    },
    "decay-agent-memories": {
        "task": "agency.decay_agent_memories",
        "schedule": crontab(hour=4, minute=30),  # Daily at 4:30 AM UTC
    },
}

if all(os.getenv(var) for var in ONEDRIVE_SCHEDULE_REQUIRED_VARS):
    beat_schedule.update(
        {
            "renew-onedrive-subscriptions": {
                "task": "onedrive.renew_subscriptions",
                "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours - renew expiring OneDrive subscriptions
            },
            "cleanup-onedrive-edit-sessions": {
                "task": "onedrive.cleanup_edit_sessions",
                "schedule": crontab(minute=0, hour="*"),  # Every hour - expire stale OneDrive edit sessions
            },
            "poll-onedrive-changes": {
                "task": "poll_onedrive_changes",
                "schedule": crontab(minute="*/15"),
            },
        }
    )

celery_app.conf.beat_schedule = beat_schedule

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks", "app.workers"])


# ---------------------------------------------------------------------------
# Worker lifecycle signals — initialise BrowserPool for the media queue
# ---------------------------------------------------------------------------
@worker_process_init.connect
def _init_browser_pool_on_worker(**kwargs):
    """Reinitialize DB engine and BrowserPool when a worker child process forks."""
    # CRITICAL: After fork(), the inherited asyncpg connection pool is corrupted.
    # Dispose it and recreate with NullPool to prevent
    # "cannot perform operation: another operation is in progress" errors.
    try:
        from app.core.database import reinit_engine_for_celery_worker
        reinit_engine_for_celery_worker()
    except Exception:
        _celery_logger.error("DB engine reinit failed after fork — killing worker", exc_info=True)
        # Worker must not continue with a corrupted connection pool.
        # Celery prefork supervisor will respawn this child process.
        os._exit(1)

    queues = os.getenv("CELERY_WORKER_QUEUES", "")
    # The -Q flag sets CELERY_WORKER_QUEUES at runtime; also check argv
    import sys

    argv_str = " ".join(sys.argv)
    if "media" in queues or "-Q media" in argv_str or "-Q" not in argv_str:
        try:
            from app.services.browser_pool import init_browser_pool_sync

            init_browser_pool_sync()
        except Exception:
            _celery_logger.warning("BrowserPool init failed — automation tasks will fail", exc_info=True)


@worker_process_shutdown.connect
def _shutdown_browser_pool_on_worker(**kwargs):
    """Cleanly stop BrowserPool when the worker process exits."""
    try:
        from app.services.browser_pool import shutdown_browser_pool_sync

        shutdown_browser_pool_sync()
    except Exception:
        _celery_logger.warning("BrowserPool shutdown error", exc_info=True)


if __name__ == "__main__":
    celery_app.start()
