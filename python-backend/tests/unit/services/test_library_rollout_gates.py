"""Unit tests for rollout gate evaluation (Section 10)."""

import pytest

from app.services.library_observability import emit_metric, reset_library_observability_metrics
from app.services.library_rollout_gates import evaluate_release_gates


@pytest.mark.unit
class TestLibraryRolloutGates:
    def setup_method(self):
        reset_library_observability_metrics()

    def test_release_gates_pass_when_metrics_within_thresholds(self):
        for _ in range(99):
            emit_metric("media.callback.processed_total")
        for _ in range(1):
            emit_metric("media.callback.failed_total")
        for _ in range(49):
            emit_metric("library.index.job.completed_total")
        for _ in range(1):
            emit_metric("library.index.job.failed_total")
        for _ in range(2):
            emit_metric("media.callback.dlq_total")

        result = evaluate_release_gates(
            {
                "max_callback_failure_rate": 0.05,
                "max_index_failure_rate": 0.05,
                "max_dlq_backlog": 5,
            }
        )

        assert result["all_passed"] is True
        assert result["gates"]["callback_failure_rate_ok"] is True
        assert result["gates"]["index_failure_rate_ok"] is True
        assert result["gates"]["dlq_backlog_ok"] is True

    def test_release_gates_fail_when_metrics_exceed_thresholds(self):
        emit_metric("media.callback.processed_total")
        emit_metric("media.callback.failed_total")
        emit_metric("media.callback.failed_total")
        emit_metric("media.callback.dlq_total")
        emit_metric("media.callback.dlq_total")
        emit_metric("media.callback.dlq_total")

        result = evaluate_release_gates(
            {
                "max_callback_failure_rate": 0.1,
                "max_index_failure_rate": 0.1,
                "max_dlq_backlog": 1,
            }
        )

        assert result["all_passed"] is False
        assert result["gates"]["callback_failure_rate_ok"] is False
        assert result["gates"]["dlq_backlog_ok"] is False
