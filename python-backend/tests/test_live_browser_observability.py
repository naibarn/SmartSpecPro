"""Tests for live-browser rollout observability helpers."""

from unittest.mock import patch

import pytest

from app.services.live_browser_observability import emit_rollout_metric


def test_emit_rollout_metric_uses_low_cardinality_labels():
    with patch("app.services.live_browser_observability.emit_metric") as emit_metric:
        emit_rollout_metric(
            "workflow_browser_session_legacy_fallback_total",
            origin_surface="workflow",
            reason_category="legacy_fallback",
            value=2,
        )

    assert emit_metric.call_count == 2
    emit_metric.assert_called_with(
        "workflow_browser_session_legacy_fallback_total",
        origin_surface="workflow",
        reason_category="legacy_fallback",
    )


def test_emit_rollout_metric_rejects_unknown_labels():
    with pytest.raises(ValueError):
        emit_rollout_metric(
            "browser_session_take_control_blocked_total",
            origin_surface="workflow",
            reason_category="free_text",
        )
