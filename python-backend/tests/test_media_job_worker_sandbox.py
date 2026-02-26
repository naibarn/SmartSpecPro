"""Tests for media_job_worker.py sandbox integration.

Verifies that each handler function routes through SandboxMediaRunner
when a runner is provided, and falls back to subprocess when not.
"""

import subprocess
from unittest.mock import MagicMock, patch

import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]

# Patch URI validation for tests — real validation tested elsewhere
_PATCH_SSRF = patch(
    "app.tasks.media_job_worker.validate_uri_no_ssrf",
    side_effect=lambda uri: None,
)


@pytest.fixture
def mock_runner():
    """Create a mock SandboxMediaRunner with sync interface."""
    runner = MagicMock()
    runner.run_command_sync.return_value = subprocess.CompletedProcess(
        args=["ffprobe"], returncode=0, stdout='{"streams":[],"format":{"duration":"10.0"}}', stderr=""
    )
    return runner


class TestMediaJobWorkerSandboxRouting:
    """Verify each handler routes through sandbox when runner is provided."""

    def test_handle_probe_uses_runner(self, mock_runner):
        """handle_probe routes ffprobe through runner when provided."""
        from app.tasks.media_job_worker import handle_probe

        spec = {
            "jobId": "test-1",
            "jobType": "probe",
            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
        }
        with _PATCH_SSRF:
            result = handle_probe(spec, "/tmp", runner=mock_runner)

        mock_runner.run_command_sync.assert_called_once()
        cmd = mock_runner.run_command_sync.call_args[0][0]
        assert "ffprobe" in cmd

    def test_handle_probe_falls_back_without_runner(self):
        """handle_probe uses subprocess.run when runner=None."""
        from app.tasks.media_job_worker import handle_probe

        spec = {
            "jobId": "test-1",
            "jobType": "probe",
            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
        }
        with _PATCH_SSRF, patch("app.tasks.media_job_worker.subprocess.run") as mock_sub:
            mock_sub.return_value = subprocess.CompletedProcess(
                args=["ffprobe"], returncode=0,
                stdout='{"streams":[],"format":{"duration":"5.0"}}', stderr=""
            )
            result = handle_probe(spec, "/tmp")
            mock_sub.assert_called_once()

    def test_handle_dead_air_detect_uses_runner(self, mock_runner):
        """handle_dead_air_detect routes silence detection through runner."""
        from app.tasks.media_job_worker import handle_dead_air_detect

        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffmpeg"], returncode=0, stdout="", stderr=""
        )

        spec = {
            "jobId": "test-2",
            "jobType": "dead_air_detect",
            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
            "params": {"silenceThresholdDb": -30, "minSilenceDurationMs": 1000},
        }
        with _PATCH_SSRF:
            result = handle_dead_air_detect(spec, "/tmp", runner=mock_runner)

        mock_runner.run_command_sync.assert_called_once()
        cmd = mock_runner.run_command_sync.call_args[0][0]
        assert "ffmpeg" in cmd

    def test_handle_subtitles_extract_uses_runner(self, mock_runner):
        """handle_subtitles_extract routes through runner when provided."""
        from app.tasks.media_job_worker import handle_subtitles_extract

        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffmpeg"], returncode=0, stdout="", stderr=""
        )

        spec = {
            "jobId": "test-3",
            "jobType": "subtitles_extract",
            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
            "params": {"format": "srt"},
        }
        with _PATCH_SSRF:
            result = handle_subtitles_extract(spec, "/tmp", runner=mock_runner)

        mock_runner.run_command_sync.assert_called_once()

    def test_has_audio_stream_uses_runner(self, mock_runner):
        """_has_audio_stream routes ffprobe through runner when provided."""
        from app.tasks.media_job_worker import _has_audio_stream

        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffprobe"], returncode=0, stdout="audio", stderr=""
        )

        result = _has_audio_stream("/tmp/test.mp4", runner=mock_runner)
        assert result is True
        mock_runner.run_command_sync.assert_called_once()

    def test_detect_video_codec_uses_runner(self, mock_runner):
        """_detect_video_codec routes ffprobe through runner when provided."""
        from app.tasks.media_job_worker import _detect_video_codec

        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffprobe"], returncode=0, stdout="h264\n", stderr=""
        )

        result = _detect_video_codec("/tmp/test.mp4", runner=mock_runner)
        assert result == "h264"
        mock_runner.run_command_sync.assert_called_once()

    def test_probe_media_info_uses_runner(self, mock_runner):
        """_probe_media_info routes ffprobe through runner when provided."""
        from app.tasks.media_job_worker import _probe_media_info

        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffprobe"], returncode=0,
            stdout='{"streams":[{"codec_type":"video","r_frame_rate":"30/1","avg_frame_rate":"30/1"}],"format":{"duration":"10.0"}}',
            stderr=""
        )

        result = _probe_media_info("/tmp/test.mp4", runner=mock_runner)
        assert result["duration_s"] == 10.0
        mock_runner.run_command_sync.assert_called_once()
