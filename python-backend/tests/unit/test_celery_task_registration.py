from __future__ import annotations

import pytest

from app.core.job_task_registry import job_task_registry

pytestmark = [pytest.mark.unit]


def test_worker_job_registry_registers_drive_periodic_tasks():
    registered = job_task_registry.tasks

    assert "cleanup_expired_edit_sessions" in registered
    assert "poll_drive_changes" in registered
    assert "renew_drive_watch_channels" in registered
