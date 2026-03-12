import json
from pathlib import Path

import pytest

from app.services.live_browser_contract import (
    LiveBrowserErrorResponse,
    LiveBrowserEventEnvelope,
    LiveBrowserSendCommandRequest,
    LiveBrowserSession,
)


FIXTURE_DIR = (
    Path(__file__).resolve().parents[2]
    / "specs"
    / "feature"
    / "036-LiveBrowserExperience"
    / "fixtures"
)


def test_live_browser_session_fixture_parses_without_drift():
    fixture = json.loads((FIXTURE_DIR / "live-browser-session.json").read_text())

    parsed = LiveBrowserSession.model_validate(fixture)

    assert parsed.sessionId == "lbs_demo_123"
    assert parsed.status == "human_controlling"
    assert parsed.controlMode == "takeover"
    assert parsed.sessionVersion == 12


def test_live_browser_event_fixture_parses_without_drift():
    fixture = json.loads((FIXTURE_DIR / "live-browser-event-envelope.json").read_text())

    parsed = LiveBrowserEventEnvelope.model_validate(fixture)

    assert parsed.eventId == "lbe_demo_123"
    assert parsed.type == "approval_requested"
    assert parsed.cursor == "cursor:12:approval"


def test_live_browser_version_conflict_fixture_preserves_retry_metadata():
    fixture = json.loads(
        (FIXTURE_DIR / "live-browser-error-version-conflict.json").read_text()
    )

    parsed = LiveBrowserErrorResponse.model_validate(fixture)

    assert parsed.accepted is False
    assert parsed.error.code == "session_version_conflict"
    assert parsed.error.currentSessionVersion == 11
    assert parsed.error.retryable is True


def test_live_browser_send_command_fixture_parses_without_drift():
    fixture = json.loads(
        (FIXTURE_DIR / "live-browser-send-command-request.json").read_text()
    )

    parsed = LiveBrowserSendCommandRequest.model_validate(fixture)

    assert parsed.actor.actorType == "user"
    assert parsed.actor.actorId == "42"
    assert parsed.command.type == "natural_language"
    assert parsed.command.text.startswith("Open the second hotel option")


def test_live_browser_session_rejects_unsupported_status():
    fixture = json.loads((FIXTURE_DIR / "live-browser-session.json").read_text())
    fixture["status"] = "zombie_mode"

    with pytest.raises(Exception):
        LiveBrowserSession.model_validate(fixture)
