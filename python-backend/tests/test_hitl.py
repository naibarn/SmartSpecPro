"""Tests for Section 03: Human-in-the-Loop (HITL) via interrupt().

Tests the InterruptPayload, HITLResumeHandler, and approval executor integration.
"""

import pytest
from datetime import datetime, timedelta, timezone

from app.orchestrator.hitl import (
    ApprovalType,
    HITLResumeHandler,
    InterruptPayload,
    ResumeResponse,
)


# ============================================================================
# Test 1: InterruptPayload serialization
# ============================================================================


def test_interrupt_payload_to_dict():
    """Test that InterruptPayload serializes correctly for interrupt() call."""
    payload = InterruptPayload(
        node_id="approval_1",
        message="Approve this workflow execution",
        approval_type=ApprovalType.APPROVE_REJECT,
        timeout_minutes=30,
        required_approvers=2,
        notification_channel="slack",
        data={"workflow_id": "wf-123"},
        approval_id="approval-abc123",
    )

    result = payload.to_dict()

    assert result["node_id"] == "approval_1"
    assert result["message"] == "Approve this workflow execution"
    assert result["approval_type"] == "approve_reject"
    assert result["timeout_minutes"] == 30
    assert result["required_approvers"] == 2
    assert result["notification_channel"] == "slack"
    assert result["data"] == {"workflow_id": "wf-123"}
    assert result["approval_id"] == "approval-abc123"


# ============================================================================
# Test 2: HITLResumeHandler validates APPROVE_REJECT responses
# ============================================================================


def test_hitl_resume_handler_approve_reject():
    """Test validation of APPROVE_REJECT type responses."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Approve?",
        approval_type=ApprovalType.APPROVE_REJECT,
        approval_id="approval-123",
    )

    # Test approval
    response = handler.validate_response(
        {"approved": True, "approved_by": "user-456", "comment": "Looks good"},
        payload,
    )

    assert response.approved is True
    assert response.rejected is False
    assert response.approved_by == "user-456"
    assert response.comment == "Looks good"

    # Test rejection
    response = handler.validate_response(
        {"rejected": True, "approved_by": "user-789"},
        payload,
    )

    assert response.approved is False
    assert response.rejected is True


def test_hitl_resume_handler_approve_reject_missing_field():
    """Test that APPROVE_REJECT without approved/rejected raises ValueError."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Approve?",
        approval_type=ApprovalType.APPROVE_REJECT,
        approval_id="approval-123",
    )

    with pytest.raises(ValueError, match="requires 'approved' or 'rejected' field"):
        handler.validate_response(
            {"comment": "Missing approval decision"},
            payload,
        )


# ============================================================================
# Test 3: HITLResumeHandler validates DECISION responses
# ============================================================================


def test_hitl_resume_handler_decision():
    """Test validation of DECISION type responses."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Choose one:",
        approval_type=ApprovalType.DECISION,
        options=["option_a", "option_b", "option_c"],
        approval_id="approval-123",
    )

    response = handler.validate_response(
        {"decision": "option_b", "approved_by": "user-456"},
        payload,
    )

    assert response.decision == "option_b"
    assert response.approved is True  # Valid decision counts as approval


def test_hitl_resume_handler_decision_invalid_option():
    """Test that DECISION with invalid option raises ValueError."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Choose one:",
        approval_type=ApprovalType.DECISION,
        options=["option_a", "option_b"],
        approval_id="approval-123",
    )

    with pytest.raises(ValueError, match="not in allowed options"):
        handler.validate_response(
            {"decision": "option_invalid"},
            payload,
        )


def test_hitl_resume_handler_decision_missing_field():
    """Test that DECISION without decision field raises ValueError."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Choose one:",
        approval_type=ApprovalType.DECISION,
        options=["option_a", "option_b"],
        approval_id="approval-123",
    )

    with pytest.raises(ValueError, match="requires 'decision' field"):
        handler.validate_response({}, payload)


# ============================================================================
# Test 4: HITLResumeHandler validates INPUT responses
# ============================================================================


def test_hitl_resume_handler_input():
    """Test validation of INPUT type responses."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Enter reason:",
        approval_type=ApprovalType.INPUT,
        approval_id="approval-123",
    )

    response = handler.validate_response(
        {"input_value": "User needs access for project X", "approved_by": "user-456"},
        payload,
    )

    assert response.input_value == "User needs access for project X"
    assert response.approved is True  # Valid input counts as approval


def test_hitl_resume_handler_input_missing_field():
    """Test that INPUT without input_value raises ValueError."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Enter reason:",
        approval_type=ApprovalType.INPUT,
        approval_id="approval-123",
    )

    with pytest.raises(ValueError, match="requires 'input_value' field"):
        handler.validate_response({}, payload)


# ============================================================================
# Test 5: HITLResumeHandler builds resume value correctly
# ============================================================================


def test_hitl_resume_handler_build_resume_value():
    """Test that build_resume_value formats response for Command(resume=...)."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Approve?",
        approval_type=ApprovalType.APPROVE_REJECT,
        approval_id="approval-123",
    )

    response = ResumeResponse(
        approved=True,
        rejected=False,
        approved_by="user-456",
        comment="LGTM",
        responded_at=datetime(2026, 2, 9, 10, 0, 0, tzinfo=timezone.utc),
    )

    resume_value = handler.build_resume_value(response, payload)

    assert resume_value["approved"] is True
    assert resume_value["rejected"] is False
    assert resume_value["approved_by"] == "user-456"
    assert resume_value["comment"] == "LGTM"
    assert resume_value["timeout"] is False
    assert resume_value["responded_at"] == "2026-02-09T10:00:00+00:00"


# ============================================================================
# Test 6: InterruptPayload defaults
# ============================================================================


def test_interrupt_payload_defaults():
    """Test that InterruptPayload has sensible defaults."""
    payload = InterruptPayload(
        node_id="approval_1",
        message="Default approval",
    )

    result = payload.to_dict()

    assert result["approval_type"] == "approve_reject"
    assert result["options"] == []
    assert result["timeout_minutes"] == 60
    assert result["required_approvers"] == 1
    assert result["notification_channel"] is None
    assert result["data"] is None


# ============================================================================
# Test 7: ResumeResponse timestamp default
# ============================================================================


def test_resume_response_timestamp_default():
    """Test that ResumeResponse has a default timestamp."""
    response = ResumeResponse(
        approved=True,
        approved_by="user-123",
    )

    assert response.responded_at is not None
    # Should be very close to now
    time_diff = abs((datetime.now(timezone.utc) - response.responded_at).total_seconds())
    assert time_diff < 2  # Within 2 seconds


# ============================================================================
# Test 8: ApprovalType enum values
# ============================================================================


def test_approval_type_enum():
    """Test that ApprovalType enum has expected values."""
    assert ApprovalType.APPROVE_REJECT.value == "approve_reject"
    assert ApprovalType.INPUT.value == "input"
    assert ApprovalType.DECISION.value == "decision"


# ============================================================================
# Test 9: HITLResumeHandler handles all response fields
# ============================================================================


def test_hitl_resume_handler_full_response():
    """Test that all response fields are properly handled."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Approve deployment?",
        approval_type=ApprovalType.APPROVE_REJECT,
        approval_id="approval-123",
    )

    response = handler.validate_response(
        {
            "approved": True,
            "approved_by": "user-admin-001",
            "comment": "Deployment approved after security review",
        },
        payload,
    )

    resume_value = handler.build_resume_value(response, payload)

    assert resume_value["approved"] is True
    assert resume_value["approved_by"] == "user-admin-001"
    assert resume_value["comment"] == "Deployment approved after security review"
    assert "responded_at" in resume_value
    assert resume_value["timeout"] is False


# ============================================================================
# Test 10: Input type with numeric value
# ============================================================================


def test_hitl_resume_handler_input_numeric():
    """Test that INPUT type can handle numeric input values."""
    handler = HITLResumeHandler()
    payload = InterruptPayload(
        node_id="approval_1",
        message="Enter budget amount:",
        approval_type=ApprovalType.INPUT,
        approval_id="approval-123",
    )

    response = handler.validate_response(
        {"input_value": 50000, "approved_by": "user-456"},
        payload,
    )

    # Numeric input should be converted to string
    assert response.input_value == "50000"
    assert response.approved is True
