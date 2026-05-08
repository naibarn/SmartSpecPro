"""Tests for media_pipeline.py sandbox migration.

Verifies that ffprobe, ffmpeg thumbnail, and metadata extraction commands
route through sandbox when a runner is provided.
"""

import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
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
        ffmpeg_cmd = mock_runner.run_command.call_args_list[1].args[0]
        assert "-vf" in ffmpeg_cmd
        assert "scale=300:-2" in ffmpeg_cmd

    @pytest.mark.asyncio
    async def test_download_redirect_revalidates_target(self, tmp_path):
        """Provider result redirects are blocked if the Location points internal."""
        from app.services.media_pipeline import MediaPipelineError, download_media

        async def handler(request: httpx.Request) -> httpx.Response:
            if str(request.url) == "https://cdn.example.com/result.png":
                return httpx.Response(
                    302,
                    headers={"location": "http://169.254.169.254/latest/meta-data/"},
                    request=request,
                )
            return httpx.Response(200, content=b"secret", request=request)

        transport = httpx.MockTransport(handler)
        original_client = httpx.AsyncClient

        def make_client(*args, **kwargs):
            kwargs["transport"] = transport
            return original_client(*args, **kwargs)

        def validate_url(url: str) -> str:
            if "169.254.169.254" in url:
                raise ValueError("internal metadata address")
            return url

        with (
            patch("app.core.media_job_validators.validate_provider_result_uri", side_effect=validate_url),
            patch("app.services.media_pipeline.httpx.AsyncClient", side_effect=make_client),
        ):
            with pytest.raises(MediaPipelineError, match="Blocked redirect URL"):
                await download_media("https://cdn.example.com/result.png", str(tmp_path))

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
            _ffprobe_metadata("/tmp/test.mp4")
            mock_sub.assert_called_once()
