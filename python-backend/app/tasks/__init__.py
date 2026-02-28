"""
Celery Tasks Package
"""

from app.tasks.media_tasks import (
    generate_image_task,
    generate_video_task,
    generate_audio_task,
    cleanup_expired_tasks,
    retry_failed_tasks,
)
from app.tasks.media_job_worker import execute_media_job
from app.tasks.workflow_gen_tasks import generate_workflow_task
from app.tasks.workflow_edit_tasks import edit_workflow_task
from app.tasks.onedrive_tasks import (
    initial_onedrive_sync,
    process_onedrive_changes,
    renew_onedrive_subscriptions,
    cleanup_expired_onedrive_edit_sessions,
    disconnect_onedrive_cleanup,
)
from app.tasks.approval_timeout_tasks import check_expired_approvals
from app.tasks.sandbox_maintenance_tasks import (
    cleanup_expired_sandbox_jobs,
    cleanup_orphan_sandboxes,
    detect_stuck_sandbox_jobs,
)

__all__ = [
    "generate_image_task",
    "generate_video_task",
    "generate_audio_task",
    "cleanup_expired_tasks",
    "retry_failed_tasks",
    "execute_media_job",
    "generate_workflow_task",
    "edit_workflow_task",
    "initial_onedrive_sync",
    "process_onedrive_changes",
    "renew_onedrive_subscriptions",
    "cleanup_expired_onedrive_edit_sessions",
    "disconnect_onedrive_cleanup",
    "check_expired_approvals",
    "cleanup_expired_sandbox_jobs",
    "cleanup_orphan_sandboxes",
    "detect_stuck_sandbox_jobs",
]
