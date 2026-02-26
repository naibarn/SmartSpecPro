"""Tests for app/video/pipeline.py sandbox migration.

Verifies that _probe_clip, run_assembly_stage, and run_final_render route
FFmpeg through sandbox when a runner is provided.
"""

import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

pytestmark = [pytest.mark.sandbox, pytest.mark.unit]


@pytest.fixture
def mock_runner():
    """Create a mock SandboxMediaRunner with sync interface."""
    runner = MagicMock()
    runner.run_command_sync.return_value = subprocess.CompletedProcess(
        args=["ffprobe"], returncode=0,
        stdout=json.dumps({
            "streams": [{"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "r_frame_rate": "30/1"}],
            "format": {"duration": "10.0"},
        }),
        stderr=""
    )
    return runner


class TestVideoPipelineSandbox:
    """Verify video/pipeline.py subprocess calls route through sandbox."""

    def test_probe_clip_uses_runner(self, mock_runner):
        """_probe_clip routes ffprobe through runner when provided."""
        from app.video.pipeline import _probe_clip

        result = _probe_clip("/tmp/clip.mp4", runner=mock_runner)

        mock_runner.run_command_sync.assert_called_once()
        assert result["codec"] == "h264"
        assert result["width"] == 1920

    def test_probe_clip_falls_back_without_runner(self):
        """_probe_clip uses subprocess.run when runner=None."""
        from app.video.pipeline import _probe_clip

        with patch("subprocess.run") as mock_sub:
            mock_sub.return_value = subprocess.CompletedProcess(
                args=["ffprobe"], returncode=0,
                stdout=json.dumps({
                    "streams": [{"codec_type": "video", "codec_name": "h264", "width": 1280, "height": 720, "r_frame_rate": "24/1"}],
                    "format": {"duration": "5.0"},
                }),
                stderr=""
            )
            result = _probe_clip("/tmp/clip.mp4")
            mock_sub.assert_called_once()

    def test_run_assembly_stage_uses_runner(self, mock_runner):
        """run_assembly_stage routes ffmpeg through runner when provided (needs 2+ clips)."""
        from app.video.pipeline import run_assembly_stage

        probe_result = subprocess.CompletedProcess(
            args=["ffprobe"], returncode=0,
            stdout=json.dumps({
                "streams": [{"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "r_frame_rate": "30/1"}],
                "format": {"duration": "5.0"},
            }),
            stderr=""
        )
        mock_runner.run_command_sync.side_effect = [
            probe_result,  # _probe_clip for clip1
            probe_result,  # _probe_clip for clip2
            subprocess.CompletedProcess(args=["ffmpeg"], returncode=0, stdout="", stderr=""),  # concat
        ]

        render_spec = {
            "renderHash": "test-hash",
            "inputAssetKeys": {"a1": "clip1.mp4", "a2": "clip2.mp4"},
            "project": {
                "timeline": {
                    "tracks": [
                        {
                            "type": "video", "name": "V1",
                            "clips": [
                                {"assetId": "a1", "startTime": 0},
                                {"assetId": "a2", "startTime": 5},
                            ],
                        }
                    ]
                },
                "assets": {},
            }
        }

        with patch("os.path.exists", return_value=True), \
             patch("builtins.open", MagicMock()):
            result = run_assembly_stage(render_spec, "/tmp", runner=mock_runner)

        # 2 probe calls + 1 assembly call
        assert mock_runner.run_command_sync.call_count == 3

    def test_run_final_render_simple_uses_runner(self, mock_runner):
        """run_final_render (no overlays) routes ffmpeg through runner."""
        from app.video.pipeline import run_final_render

        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
            args=["ffmpeg"], returncode=0, stdout="", stderr=""
        )

        render_spec = {
            "project": {
                "timeline": {"tracks": []},
                "assets": {},
            }
        }

        result = run_final_render(
            "/tmp/assembled.mp4", render_spec, "standard", "/tmp/output.mp4", runner=mock_runner
        )

        mock_runner.run_command_sync.assert_called_once()
        cmd = mock_runner.run_command_sync.call_args[0][0]
        assert "ffmpeg" in cmd
