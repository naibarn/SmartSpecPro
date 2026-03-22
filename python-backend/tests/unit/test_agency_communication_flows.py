"""Tests for communication flow config enforcement (maxRoundTrips, contextFields)."""

import pytest

from app.services.agency_communication_flows import (
    FlowConfig,
    RoundTripTracker,
    build_context_injection,
)
from app.services.agency_run_context import AgencyRunContext


@pytest.mark.unit
@pytest.mark.agency
class TestRoundTripTracker:
    """Tests for round-trip counter enforcement."""

    def test_max_round_trips_enforced(self):
        """After maxRoundTrips, tracker reports limit reached."""
        config = FlowConfig(max_round_trips=3)
        tracker = RoundTripTracker()

        for i in range(3):
            assert not tracker.is_limit_reached("A", "B", config)
            tracker.increment("A", "B")

        assert tracker.is_limit_reached("A", "B", config)

    def test_tracks_per_agent_pair(self):
        """Counters are independent per (from, to) pair."""
        config = FlowConfig(max_round_trips=2)
        tracker = RoundTripTracker()

        tracker.increment("A", "B")
        tracker.increment("A", "B")
        tracker.increment("A", "C")

        assert tracker.is_limit_reached("A", "B", config)
        assert not tracker.is_limit_reached("A", "C", config)

    def test_zero_max_round_trips_is_unlimited(self):
        """maxRoundTrips=0 means no limit."""
        config = FlowConfig(max_round_trips=0)
        tracker = RoundTripTracker()

        for _ in range(100):
            tracker.increment("A", "B")

        assert not tracker.is_limit_reached("A", "B", config)

    def test_missing_config_is_unlimited(self):
        """No FlowConfig means unlimited round trips."""
        tracker = RoundTripTracker()

        for _ in range(100):
            tracker.increment("A", "B")

        assert not tracker.is_limit_reached("A", "B", None)

    def test_get_count(self):
        """Counter returns correct count for pair."""
        tracker = RoundTripTracker()
        assert tracker.get_count("A", "B") == 0

        tracker.increment("A", "B")
        tracker.increment("A", "B")
        assert tracker.get_count("A", "B") == 2


@pytest.mark.unit
@pytest.mark.agency
class TestContextInjection:
    """Tests for contextFields injection into agent prompts."""

    @pytest.mark.asyncio
    async def test_context_fields_extracted(self):
        """contextFields keys are extracted from AgencyRunContext."""
        ctx = AgencyRunContext({"summary": "Phase 1 done", "priority": "high", "other": "ignored"})
        config = FlowConfig(context_fields=["summary", "priority"])

        injection = await build_context_injection(ctx, config)

        assert "summary" in injection
        assert "Phase 1 done" in injection
        assert "priority" in injection
        assert "high" in injection
        assert "other" not in injection
        assert "ignored" not in injection

    @pytest.mark.asyncio
    async def test_missing_context_field_skipped(self):
        """Missing context fields are silently skipped."""
        ctx = AgencyRunContext({"summary": "Done"})
        config = FlowConfig(context_fields=["summary", "nonexistent"])

        injection = await build_context_injection(ctx, config)

        assert "summary" in injection
        assert "nonexistent" not in injection

    @pytest.mark.asyncio
    async def test_no_context_fields_returns_empty(self):
        """No contextFields config returns empty string."""
        ctx = AgencyRunContext({"data": "value"})
        config = FlowConfig()

        injection = await build_context_injection(ctx, config)
        assert injection == ""

    @pytest.mark.asyncio
    async def test_none_config_returns_empty(self):
        """None FlowConfig returns empty string."""
        ctx = AgencyRunContext({"data": "value"})
        injection = await build_context_injection(ctx, None)
        assert injection == ""
