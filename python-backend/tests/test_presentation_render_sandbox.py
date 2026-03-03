"""Tests for presentation_render.py sandbox migration.

Verifies that FFmpeg subprocess calls in _build_mp4 route through sandbox.
Playwright (browser automation) remains in-process — it is NOT migrated.
"""

import subprocess
from unittest.mock import MagicMock, patch

import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


@pytest.fixture
def mock_runner():
    """Create a mock SandboxMediaRunner with sync interface."""
    runner = MagicMock()
    runner.run_command_sync.return_value = subprocess.CompletedProcess(
        args=["ffmpeg"], returncode=0, stdout="", stderr=""
    )
    return runner


_PATCH_CONCAT = patch(
    "app.tasks.presentation_render._write_concat_file",
    side_effect=lambda paths, durations, out: None,
)


class TestPresentationRenderSandbox:
    """Verify presentation_render.py FFmpeg calls route through sandbox."""

    def test_build_mp4_no_audio_uses_runner(self, mock_runner):
        """_build_mp4 Case A (no audio) routes ffmpeg through runner."""
        from app.tasks.presentation_render import _build_mp4

        render_spec = {
            "fps": 30,
            "slides": [{"durationMs": 3000}],
        }
        screenshot_paths = ["/tmp/slide_0000.png"]

        with _PATCH_CONCAT:
            result = _build_mp4(
                render_spec, "standard", screenshot_paths, "/tmp", runner=mock_runner
            )

        mock_runner.run_command_sync.assert_called_once()
        call_args = mock_runner.run_command_sync.call_args
        cmd = call_args[0][0]
        assert "ffmpeg" in cmd

    def test_build_mp4_falls_back_without_runner(self):
        """_build_mp4 uses subprocess.run when runner=None."""
        from app.tasks.presentation_render import _build_mp4

        render_spec = {
            "fps": 30,
            "slides": [{"durationMs": 3000}],
        }
        screenshot_paths = ["/tmp/slide_0000.png"]

        with patch("subprocess.run") as mock_sub, _PATCH_CONCAT:
            mock_sub.return_value = subprocess.CompletedProcess(
                args=["ffmpeg"], returncode=0, stdout="", stderr=""
            )
            _build_mp4(render_spec, "standard", screenshot_paths, "/tmp")
            mock_sub.assert_called()

    def test_build_mp4_from_clips_no_audio_uses_runner(self, mock_runner, tmp_path):
        """_build_mp4_from_clips routes ffmpeg through runner in dynamic mode."""
        from app.tasks.presentation_render import _build_mp4_from_clips

        clip_path = tmp_path / "slide_0000.webm"
        clip_path.write_bytes(b"webm")
        render_spec = {
            "fps": 30,
            "slides": [{"durationMs": 3000}],
        }

        with (
            patch("app.tasks.presentation_render._trim_video_clip_segment", return_value=str(clip_path)),
            patch("app.tasks.presentation_render._write_clip_concat_file"),
        ):
            _build_mp4_from_clips(
                render_spec,
                "standard",
                [{"path": str(clip_path), "trim_start_ms": 500, "duration_ms": 3000}],
                str(tmp_path),
                runner=mock_runner,
            )

        mock_runner.run_command_sync.assert_called_once()
