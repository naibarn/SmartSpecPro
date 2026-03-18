"""Tests for the help documentation screenshot capture endpoint.

Covers:
- Internal token auth (missing, wrong, correct)
- Request validation (feature_name / step pattern, dimension bounds)
- Happy-path screenshot flow (BrowserSession mocked)
- Empty screenshot data → 500
- BrowserSession exception → 500
"""

from __future__ import annotations

import base64
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── App fixture ───────────────────────────────────────────────────────────


@pytest.fixture()
def client(tmp_path: Path):
    """Return a TestClient with the help_screenshot router mounted in isolation."""
    from fastapi import FastAPI
    from app.api.help_screenshot import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


# ── Helpers ───────────────────────────────────────────────────────────────

VALID_TOKEN = "test-internal-secret"
VALID_PAYLOAD = {
    "url": "https://smartaihub.app/chat",
    "feature_name": "chat",
    "step": "open-panel",
}
FAKE_PNG = base64.b64encode(b"\x89PNG\r\nfake").decode()


def _good_headers() -> dict[str, str]:
    return {"X-Internal-Token": VALID_TOKEN}


# ── Auth tests ─────────────────────────────────────────────────────────────


@pytest.mark.unit
def test_missing_token_returns_401(client: TestClient):
    with patch("app.api.help_screenshot.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post("/api/help/screenshot", json=VALID_PAYLOAD)
    assert resp.status_code == 401
    assert "Missing internal token" in resp.json()["detail"]


@pytest.mark.unit
def test_wrong_token_returns_401(client: TestClient):
    with patch("app.api.help_screenshot.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=VALID_PAYLOAD,
            headers={"X-Internal-Token": "bad-token"},
        )
    assert resp.status_code == 401
    assert "Invalid internal token" in resp.json()["detail"]


@pytest.mark.unit
def test_unconfigured_token_returns_500(client: TestClient):
    with patch("app.api.help_screenshot.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = None
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = None
        resp = client.post(
            "/api/help/screenshot",
            json=VALID_PAYLOAD,
            headers=_good_headers(),
        )
    assert resp.status_code == 500
    assert "not configured" in resp.json()["detail"]


@pytest.mark.unit
def test_proxy_token_header_accepted(client: TestClient, tmp_path: Path):
    """X-Proxy-Token is an accepted alias for X-Internal-Token."""
    mock_session = _make_mock_session()
    with (
        patch("app.api.help_screenshot.settings") as mock_settings,
        patch("app.api.help_screenshot.BrowserSession", return_value=mock_session),
        patch.dict("os.environ", {"HELP_ASSETS_DIR": str(tmp_path)}),
    ):
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=VALID_PAYLOAD,
            headers={"X-Proxy-Token": VALID_TOKEN},
        )
    assert resp.status_code == 200


# ── Request-validation tests ───────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.parametrize(
    "bad_payload",
    [
        {**VALID_PAYLOAD, "feature_name": "Has Spaces"},
        {**VALID_PAYLOAD, "feature_name": "UPPERCASE"},
        {**VALID_PAYLOAD, "step": "has_underscore"},
        {**VALID_PAYLOAD, "width": 100},   # below ge=320
        {**VALID_PAYLOAD, "width": 9999},  # above le=1920
        {**VALID_PAYLOAD, "height": 50},   # below ge=240
        {**VALID_PAYLOAD, "height": 9999}, # above le=1080
        {**VALID_PAYLOAD, "feature_name": ""},
        {**VALID_PAYLOAD, "step": ""},
    ],
)
def test_invalid_request_body_returns_422(client: TestClient, bad_payload: dict):
    with patch("app.api.help_screenshot.settings") as mock_settings:
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=bad_payload,
            headers=_good_headers(),
        )
    assert resp.status_code == 422


# ── Happy-path test ────────────────────────────────────────────────────────


def _make_mock_session() -> MagicMock:
    session = MagicMock()
    session.navigate = AsyncMock(return_value=None)
    session.screenshot = AsyncMock(return_value={"data": FAKE_PNG})
    return session


@pytest.mark.unit
def test_successful_screenshot(client: TestClient, tmp_path: Path):
    mock_session = _make_mock_session()
    with (
        patch("app.api.help_screenshot.settings") as mock_settings,
        patch("app.api.help_screenshot.BrowserSession", return_value=mock_session),
        patch.dict("os.environ", {"HELP_ASSETS_DIR": str(tmp_path)}),
    ):
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=VALID_PAYLOAD,
            headers=_good_headers(),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["filename"] == "open-panel.png"
    assert body["url"] == "/uploads/help-assets/chat/open-panel.png"
    assert body["markdown"] == "![open-panel](/uploads/help-assets/chat/open-panel.png)"

    # File must have been written to disk
    saved = tmp_path / "help-assets" / "chat" / "open-panel.png"
    assert saved.exists()
    assert saved.read_bytes() == base64.b64decode(FAKE_PNG)


@pytest.mark.unit
def test_screenshot_creates_nested_directories(client: TestClient, tmp_path: Path):
    """help-assets/{feature_name}/ directory is created if it does not exist."""
    mock_session = _make_mock_session()
    payload = {**VALID_PAYLOAD, "feature_name": "new-feature", "step": "step-01"}
    with (
        patch("app.api.help_screenshot.settings") as mock_settings,
        patch("app.api.help_screenshot.BrowserSession", return_value=mock_session),
        patch.dict("os.environ", {"HELP_ASSETS_DIR": str(tmp_path)}),
    ):
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=payload,
            headers=_good_headers(),
        )

    assert resp.status_code == 200
    assert (tmp_path / "help-assets" / "new-feature" / "step-01.png").exists()


# ── Error-path tests ───────────────────────────────────────────────────────


@pytest.mark.unit
def test_empty_screenshot_data_returns_500(client: TestClient, tmp_path: Path):
    mock_session = MagicMock()
    mock_session.navigate = AsyncMock(return_value=None)
    mock_session.screenshot = AsyncMock(return_value={"data": ""})

    with (
        patch("app.api.help_screenshot.settings") as mock_settings,
        patch("app.api.help_screenshot.BrowserSession", return_value=mock_session),
        patch.dict("os.environ", {"HELP_ASSETS_DIR": str(tmp_path)}),
    ):
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=VALID_PAYLOAD,
            headers=_good_headers(),
        )

    assert resp.status_code == 500
    assert "empty data" in resp.json()["detail"]


@pytest.mark.unit
def test_browser_session_exception_returns_500(client: TestClient, tmp_path: Path):
    mock_session = MagicMock()
    mock_session.navigate = AsyncMock(side_effect=RuntimeError("playwright crash"))

    with (
        patch("app.api.help_screenshot.settings") as mock_settings,
        patch("app.api.help_screenshot.BrowserSession", return_value=mock_session),
        patch.dict("os.environ", {"HELP_ASSETS_DIR": str(tmp_path)}),
    ):
        mock_settings.SMARTSPEC_PROXY_TOKEN = VALID_TOKEN
        resp = client.post(
            "/api/help/screenshot",
            json=VALID_PAYLOAD,
            headers=_good_headers(),
        )

    assert resp.status_code == 500
    assert "Screenshot capture failed" in resp.json()["detail"]
