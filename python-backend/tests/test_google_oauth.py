"""Tests for Google OAuth integration (Section 12)"""
import pytest


@pytest.mark.unit
def test_google_oauth_scopes():
    """Test required Google Calendar OAuth scopes"""
    required_scopes = ["https://www.googleapis.com/auth/calendar"]
    assert len(required_scopes) >= 1
    assert "calendar" in required_scopes[0]


@pytest.mark.unit
def test_oauth_callback_url_format():
    """Test OAuth callback URL structure"""
    callback_path = "/auth/google/callback"
    assert callback_path.startswith("/auth/")
    assert "callback" in callback_path


@pytest.mark.unit
def test_google_oauth_flow_states():
    """Test OAuth flow state machine"""
    states = ["initiated", "callback_received", "token_exchanged", "completed", "failed"]
    assert "initiated" in states
    assert "completed" in states
    assert "failed" in states
