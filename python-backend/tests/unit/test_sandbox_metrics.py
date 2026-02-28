"""Tests for sandbox metric emission helpers."""
import pytest
from unittest.mock import patch

from app.services.sandbox_metrics import (
    emit_metric,
    emit_job_completed,
    emit_sandbox_created,
    emit_concurrent_gauge,
    emit_artifact_size,
    emit_circuit_breaker_state,
    emit_hetzner_health,
)

pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestSandboxMetrics:
    """Verify structured metrics are emitted to JSONL audit log."""

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_metric_logs_structured_event(self, mock_logger):
        """emit_metric writes a structured log entry."""
        emit_metric("sandbox_jobs_total", 1, {"status": "completed"})
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args
        assert call_args[0][0] == "sandbox_metric"
        extra = call_args[1]["extra"]
        assert extra["metric_name"] == "sandbox_jobs_total"
        assert extra["metric_value"] == 1
        assert extra["labels"]["status"] == "completed"

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_job_completed_emits_multiple_metrics(self, mock_logger):
        """emit_job_completed emits job counter + duration."""
        emit_job_completed(
            job_id="job-1",
            status="completed",
            feature_type="skill",
            duration_seconds=12.5,
            cost_actual=0.05,
            profile_slug="code-default",
        )
        # Should emit: sandbox_jobs_total, sandbox_execution_duration_seconds, sandbox_cost_usd
        assert mock_logger.info.call_count == 3

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_sandbox_created_logs_creation_duration(self, mock_logger):
        """emit_sandbox_created emits creation duration metric."""
        emit_sandbox_created("sbx-1", "code-default", 3.2)
        mock_logger.info.assert_called_once()
        extra = mock_logger.info.call_args[1]["extra"]
        assert extra["metric_name"] == "sandbox_creation_duration_seconds"
        assert extra["metric_value"] == 3.2

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_concurrent_gauge_logs_active_count(self, mock_logger):
        """emit_concurrent_gauge emits current active count."""
        emit_concurrent_gauge(7)
        extra = mock_logger.info.call_args[1]["extra"]
        assert extra["metric_name"] == "sandbox_concurrent_active"
        assert extra["metric_value"] == 7.0

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_artifact_size_includes_type_label(self, mock_logger):
        """emit_artifact_size includes artifact_type label."""
        emit_artifact_size(1024, "primary")
        extra = mock_logger.info.call_args[1]["extra"]
        assert extra["metric_name"] == "sandbox_artifacts_size_bytes"
        assert extra["labels"]["artifact_type"] == "primary"

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_circuit_breaker_state_maps_to_numeric(self, mock_logger):
        """Circuit breaker states map to numeric: closed=0, open=1, half_open=2."""
        emit_circuit_breaker_state("open")
        extra = mock_logger.info.call_args[1]["extra"]
        assert extra["metric_value"] == 1.0
        assert extra["labels"]["state"] == "open"

    @patch("app.services.sandbox_metrics.logger")
    def test_emit_hetzner_health_gauge(self, mock_logger):
        """Hetzner health emits 1 for healthy, 0 for unhealthy."""
        emit_hetzner_health(True)
        extra = mock_logger.info.call_args[1]["extra"]
        assert extra["metric_name"] == "sandbox_hetzner_health"
        assert extra["metric_value"] == 1.0

        mock_logger.reset_mock()
        emit_hetzner_health(False)
        extra = mock_logger.info.call_args[1]["extra"]
        assert extra["metric_value"] == 0.0
