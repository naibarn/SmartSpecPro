"""Tests for worker_jobs-backed Automation Copilot task projections."""

from unittest.mock import MagicMock, patch

from app.tasks.automation_copilot_task import _set_status, get_status


def test_set_status_reports_through_active_worker_job_context():
    status = {"status": "analyzing", "tenant_id": "t1"}
    with patch(
        "app.services.job_execution_context.report_legacy_status", return_value=True
    ) as report:
        _set_status("task-1", status)

    report.assert_called_once_with("task-1", status)


def test_get_status_reads_canonical_worker_job_projection():
    expected = {"status": "success", "canonical_job_id": "job-1"}
    client = MagicMock()
    client.legacy_status.return_value = expected
    with patch(
        "app.services.job_control_plane.JobControlPlaneClient", return_value=client
    ):
        actual = get_status("task-1", tenant_id="tenant-1", user_id=9)

    assert actual == expected
    client.legacy_status.assert_called_once_with(
        "task-1", tenant_id="tenant-1", user_id=9
    )
