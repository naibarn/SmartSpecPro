"""Regression guard for task families migrated off broker-owned retries."""

from pathlib import Path


TASK_NAMES = (
    "approval_timeout_tasks.py",
    "social_publish_task.py",
    "social_webhook_task.py",
    "social_workflow_trigger_task.py",
    "vector_db_backfill_tasks.py",
    "vision_tasks.py",
    "google_drive_tasks.py",
)


def test_migrated_task_families_do_not_republish_celery_retries() -> None:
    tasks_dir = Path(__file__).resolve().parents[2] / "app" / "tasks"

    for task_name in TASK_NAMES:
        source = (tasks_dir / task_name).read_text(encoding="utf-8")
        assert ".retry(" not in source, task_name
        assert "HardTaskRetryRequested" in source, task_name
