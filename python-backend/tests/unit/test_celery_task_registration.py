from __future__ import annotations

import pytest

from app.core.celery_app import celery_app

pytestmark = [pytest.mark.unit]


def test_celery_registers_workflow_and_drive_periodic_tasks():
    registered = celery_app.tasks

    assert "app.tasks.workflow_tasks.check_scheduled_workflows" in registered
    assert "cleanup_expired_edit_sessions" in registered
    assert "poll_drive_changes" in registered
    assert "renew_drive_watch_channels" in registered
