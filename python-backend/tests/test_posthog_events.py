"""Tests for PostHog event capture on the Python side."""

import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.unit
class TestPostHogEventCapture:

    @patch("app.services.posthog_service._get_client")
    def test_kie_submit_succeeded_event(self, mock_get_client):
        """kie_submit_succeeded event is captured on successful Kie AI call."""
        mock_ph = MagicMock()
        mock_get_client.return_value = mock_ph

        from app.services.posthog_service import capture_kie_submit

        capture_kie_submit("user-123", "kie-job-456", "image")

        mock_ph.capture.assert_called_once()
        call_args = mock_ph.capture.call_args
        assert call_args[0][0] == "user-123"
        assert call_args[0][1] == "kie_submit_succeeded"
        props = call_args[1].get("properties", call_args[0][2] if len(call_args[0]) > 2 else {})
        assert props["kie_job_id"] == "kie-job-456"
        assert props["job_type"] == "image"

    @patch("app.services.posthog_service._get_client")
    def test_media_job_completed_event(self, mock_get_client):
        """media_job_completed server-side event includes correct properties."""
        mock_ph = MagicMock()
        mock_get_client.return_value = mock_ph

        from app.services.posthog_service import capture_media_job_completed

        capture_media_job_completed(
            user_id="user-123",
            job_id="job-789",
            job_type="video",
            duration_ms=5000.0,
            output_size_bytes=1024000,
            resolution="1080p",
        )

        mock_ph.capture.assert_called_once()
        call_args = mock_ph.capture.call_args
        assert call_args[0][0] == "user-123"
        assert call_args[0][1] == "media_job_completed"
        props = call_args[1].get("properties", call_args[0][2] if len(call_args[0]) > 2 else {})
        assert props["job_id"] == "job-789"
        assert props["job_type"] == "video"
        assert props["duration_ms"] == 5000.0
        assert props["output_size_bytes"] == 1024000
        assert props["resolution"] == "1080p"

    @patch("app.services.posthog_service._get_client")
    def test_media_job_failed_event(self, mock_get_client):
        """media_job_failed event includes error_message."""
        mock_ph = MagicMock()
        mock_get_client.return_value = mock_ph

        from app.services.posthog_service import capture_media_job_failed

        capture_media_job_failed(
            user_id="user-123",
            job_id="job-789",
            job_type="audio",
            error_message="FFmpeg encoding failed",
        )

        mock_ph.capture.assert_called_once()
        call_args = mock_ph.capture.call_args
        assert call_args[0][1] == "media_job_failed"
        props = call_args[1].get("properties", call_args[0][2] if len(call_args[0]) > 2 else {})
        assert props["error_message"] == "FFmpeg encoding failed"

    @patch("app.services.posthog_service._get_client")
    def test_noop_when_no_api_key(self, mock_get_client):
        """No event captured when client is not configured."""
        mock_get_client.return_value = None

        from app.services.posthog_service import capture_event

        capture_event("user-123", "test_event", {"key": "value"})
        # Should not crash, no capture called
