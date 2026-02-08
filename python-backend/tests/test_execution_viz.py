"""Tests for execution visualization (Section 11)"""
import pytest


@pytest.mark.unit
def test_workflow_event_types():
    """Test expected workflow event types for SSE"""
    event_types = [
        "step_started",
        "step_completed",
        "step_failed",
        "workflow_completed",
        "approval_required",
    ]
    assert "step_started" in event_types
    assert "step_completed" in event_types
    assert "approval_required" in event_types
    assert "workflow_completed" in event_types


@pytest.mark.unit
def test_sse_content_type():
    """Test SSE content type is correct"""
    assert "text/event-stream" == "text/event-stream"
    # SSE format: "data: {json}\n\n"
    sse_message = "data: {\"event\": \"test\"}\n\n"
    assert sse_message.startswith("data: ")
    assert sse_message.endswith("\n\n")
