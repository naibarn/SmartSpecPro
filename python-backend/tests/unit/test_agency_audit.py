"""Tests for agency audit logging."""

import pytest
from unittest.mock import patch, AsyncMock

from app.services.agency_audit import log_agency_event, reconcile_credits


@pytest.mark.unit
@pytest.mark.agency
class TestLogAgencyEvent:
    """Tests for log_agency_event."""

    def test_run_started_event_has_required_fields(self):
        entry = log_agency_event(
            "agency_run_started",
            run_id="run-1",
            agency_id="agency-1",
            tenant_id="tenant-1",
            user_id=42,
        )
        assert entry["event_type"] == "agency_run_started"
        assert entry["run_id"] == "run-1"
        assert entry["agency_id"] == "agency-1"
        assert entry["tenant_id"] == "tenant-1"
        assert entry["user_id"] == 42
        assert "timestamp" in entry

    def test_run_completed_event_includes_duration_and_credits(self):
        entry = log_agency_event(
            "agency_run_completed",
            run_id="run-2",
            agency_id="agency-1",
            duration_ms=5000,
            total_credits_used=1.5,
            step_count=3,
        )
        assert entry["event_type"] == "agency_run_completed"
        assert entry["duration_ms"] == 5000
        assert entry["total_credits_used"] == 1.5
        assert entry["step_count"] == 3

    def test_run_failed_event_includes_error_details(self):
        entry = log_agency_event(
            "agency_run_failed",
            run_id="run-3",
            agency_id="agency-1",
            error_type="permanent",
            error_message="Credit exhaustion",
        )
        assert entry["event_type"] == "agency_run_failed"
        assert entry["error_type"] == "permanent"
        assert entry["error_message"] == "Credit exhaustion"

    def test_tool_called_event_includes_tool_info(self):
        entry = log_agency_event(
            "agency_tool_called",
            run_id="run-4",
            agency_id="agency-1",
            tool_name="web_search",
            agent_name="researcher",
            risk_level="low",
        )
        assert entry["event_type"] == "agency_tool_called"
        assert entry["tool_name"] == "web_search"
        assert entry["agent_name"] == "researcher"
        assert entry["risk_level"] == "low"

    def test_event_includes_extra_metadata(self):
        entry = log_agency_event(
            "agency_run_started",
            run_id="run-5",
            metadata={"agent_count": 3, "custom": "value"},
        )
        assert entry["metadata"]["agent_count"] == 3
        assert entry["metadata"]["custom"] == "value"


@pytest.mark.unit
@pytest.mark.agency
class TestReconcileCredits:
    """Tests for reconcile_credits."""

    @pytest.mark.asyncio
    async def test_reconcile_match(self):
        result = await reconcile_credits(
            run_id="run-10",
            gateway_total=5.0,
            run_total_credits=5.0,
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_reconcile_mismatch_logs_warning(self):
        with patch("app.services.agency_audit.log_agency_event") as mock_log:
            result = await reconcile_credits(
                run_id="run-11",
                gateway_total=5.0,
                run_total_credits=8.0,
                threshold=1.0,
            )
            assert result is False
            mock_log.assert_called_once()
            call_kwargs = mock_log.call_args
            assert "credit_mismatch" in call_kwargs[0][0] or call_kwargs[1].get("error_type") == "credit_mismatch" or call_kwargs[0][0] == "agency_credit_mismatch"

    @pytest.mark.asyncio
    async def test_reconcile_within_threshold(self):
        result = await reconcile_credits(
            run_id="run-12",
            gateway_total=5.0,
            run_total_credits=5.5,
            threshold=1.0,
        )
        assert result is True
