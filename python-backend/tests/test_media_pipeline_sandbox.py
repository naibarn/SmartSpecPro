"""Tests for media_pipeline.py sandbox migration.

Verifies that ffprobe, ffmpeg thumbnail, and metadata extraction commands
route through sandbox when a runner is provided.
"""

import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


@pytest.fixture
def mock_runner():
    """Create a mock SandboxMediaRunner with async interface."""
    runner = AsyncMock()
    runner.run_command.return_value = subprocess.CompletedProcess(
        args=["ffprobe"], returncode=0, stdout="10.5", stderr=""
    )
    return runner


class TestMediaPipelineSandbox:
    """Verify media_pipeline.py subprocess calls route through sandbox."""

    @pytest.mark.asyncio
    async def test_generate_video_thumbnail_uses_runner(self, mock_runner):
        """_generate_video_thumbnail routes ffprobe + ffmpeg through runner."""
        from app.services.media_pipeline import _generate_video_thumbnail

        mock_runner.run_command.side_effect = [
            # ffprobe for duration
            subprocess.CompletedProcess(args=["ffprobe"], returncode=0, stdout="10.5", stderr=""),
            # ffmpeg for frame extraction
            subprocess.CompletedProcess(args=["ffmpeg"], returncode=0, stdout="", stderr=""),
        ]

        await _generate_video_thumbnail("/tmp/input.mp4", "/tmp/thumb.jpg", runner=mock_runner)

        assert mock_runner.run_command.call_count == 2

    @pytest.mark.asyncio
    async def test_generate_video_thumbnail_falls_back_without_runner(self):
        """_generate_video_thumbnail uses asyncio.to_thread(subprocess.run) when runner=None."""
        from app.services.media_pipeline import _generate_video_thumbnail

        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
            mock_thread.return_value = subprocess.CompletedProcess(
                args=["ffprobe"], returncode=0, stdout="5.0", stderr=""
            )
            await _generate_video_thumbnail("/tmp/input.mp4", "/tmp/thumb.jpg")
            assert mock_thread.call_count >= 1

    @pytest.mark.asyncio
    async def test_ffprobe_metadata_uses_runner(self):
        """_ffprobe_metadata routes ffprobe through runner when provided."""
        from app.services.media_pipeline import _ffprobe_metadata

        runner = MagicMock()
        runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffprobe"], returncode=0,
            stdout='{"format":{"duration":"15.0","format_name":"mp4"},"streams":[{"width":1920,"height":1080,"codec_name":"h264"}]}',
            stderr=""
        )

        result = _ffprobe_metadata("/tmp/test.mp4", runner=runner)
        assert result["duration_seconds"] == 15.0
        assert result["width"] == 1920
        runner.run_command_sync.assert_called_once()

    @pytest.mark.asyncio
    async def test_ffprobe_metadata_falls_back_without_runner(self):
        """_ffprobe_metadata uses subprocess.run when runner=None."""
        from app.services.media_pipeline import _ffprobe_metadata

        with patch("subprocess.run") as mock_sub:
            mock_sub.return_value = subprocess.CompletedProcess(
                args=["ffprobe"], returncode=0,
                stdout='{"format":{"duration":"5.0"},"streams":[]}',
                stderr=""
            )
            result = _ffprobe_metadata("/tmp/test.mp4")
            mock_sub.assert_called_once()
