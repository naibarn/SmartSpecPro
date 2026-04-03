"""
Celery Tasks Package
"""

from app.tasks.media_tasks import (
    generate_image_task,
    generate_video_task,
    poll_wavespeed_video_task,
    generate_audio_task,
    cleanup_expired_tasks,
    retry_failed_tasks,
)
from app.tasks.media_job_worker import execute_media_job
from app.tasks.workflow_gen_tasks import generate_workflow_task
from app.tasks.workflow_edit_tasks import edit_workflow_task
from app.tasks.workflow_tasks import (
    check_scheduled_workflows,
    process_system_event,
    process_queue_message,
    execute_webhook_workflow,
    execute_delayed_node,
)
from app.tasks.google_drive_tasks import (
    cleanup_expired_edit_sessions,
    renew_drive_watch_channels,
    poll_drive_changes,
)
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
from app.tasks.agency_creator_task import (
    create_agency_discover_task,
    create_agency_design_task,
)
from app.tasks.automation_copilot_task import (
    automation_analyze_task,
    automation_execute_task,
    browser_pool_health_check,
    automation_credit_reconciliation,
)
from app.tasks.live_browser_tasks import (
    publish_live_browser_readiness_snapshot,
    run_live_browser_maintenance_task,
)
from app.tasks.system_health_task import monitor_system_health
try:
    from app.tasks.presentation_render import render_presentation
except ModuleNotFoundError:
    render_presentation = None

__all__ = [
    "generate_image_task",
    "generate_video_task",
    "poll_wavespeed_video_task",
    "generate_audio_task",
    "cleanup_expired_tasks",
    "retry_failed_tasks",
    "execute_media_job",
    "generate_workflow_task",
    "edit_workflow_task",
    "check_scheduled_workflows",
    "process_system_event",
    "process_queue_message",
    "execute_webhook_workflow",
    "execute_delayed_node",
    "cleanup_expired_edit_sessions",
    "renew_drive_watch_channels",
    "poll_drive_changes",
    "initial_onedrive_sync",
    "process_onedrive_changes",
    "renew_onedrive_subscriptions",
    "cleanup_expired_onedrive_edit_sessions",
    "disconnect_onedrive_cleanup",
    "check_expired_approvals",
    "cleanup_expired_sandbox_jobs",
    "cleanup_orphan_sandboxes",
    "detect_stuck_sandbox_jobs",
    "create_agency_discover_task",
    "create_agency_design_task",
    "automation_analyze_task",
    "automation_execute_task",
    "browser_pool_health_check",
    "automation_credit_reconciliation",
    "publish_live_browser_readiness_snapshot",
    "run_live_browser_maintenance_task",
    "monitor_system_health",
]

if render_presentation is not None:
    __all__.append("render_presentation")
