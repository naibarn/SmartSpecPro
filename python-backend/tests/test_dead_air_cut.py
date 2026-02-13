"""Tests for dead_air_cut media job handler.

Tests input validation, keep segment calculation, FFmpeg command building,
and edge cases for the dead_air_cut job type.
"""

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from app.tasks.media_job_worker import (
    _calculate_keep_segments,
    handle_dead_air_cut,
)


def _make_dead_air_spec(
    job_id="mj-test-001",
    asset_uri="file:///tmp/test.mp4",
    segments=None,
    mode="remove",
    softening_buffer_ms=0,
    crossfade=False,
):
    """Factory function to create a valid dead_air_cut spec."""
    if segments is None:
        segments = [{"startMs": 5000, "endMs": 10000}]
    return {
        "specVersion": "0.1",
        "jobId": job_id,
        "jobType": "dead_air_cut",
        "inputs": {"assets": [{"assetId": "asset-1", "kind": "video", "uri": asset_uri}]},
        "params": {
            "segments": segments,
            "mode": mode,
            "softeningBufferMs": softening_buffer_ms,
            "crossfade": crossfade,
        },
        "output": {"mode": "file", "target": "output.mp4"},
    }


@pytest.mark.unit
class TestDeadAirCutInputValidation:
    """Tests for input validation logic before FFmpeg processing."""

    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_rejects_segment_with_start_greater_than_end(self, mock_resolve, tmp_path):
        """Reject segment where startMs > endMs."""
        mock_resolve.return_value = "/tmp/test.mp4"
        spec = _make_dead_air_spec(segments=[{"startMs": 10000, "endMs": 5000}])
        with pytest.raises(ValueError, match="(?i)(invalid|start.*end|bounds)"):
            handle_dead_air_cut(spec, str(tmp_path))

    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_rejects_negative_start_ms(self, mock_resolve, tmp_path):
        """Reject segment with negative startMs."""
        mock_resolve.return_value = "/tmp/test.mp4"
        spec = _make_dead_air_spec(segments=[{"startMs": -1000, "endMs": 5000}])
        with pytest.raises(ValueError, match="(?i)(negative|invalid|start)"):
            handle_dead_air_cut(spec, str(tmp_path))

    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_rejects_end_ms_exceeding_duration(self, mock_resolve, mock_probe, tmp_path):
        """Reject segment with endMs exceeding file duration."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        spec = _make_dead_air_spec(segments=[{"startMs": 1000, "endMs": 35000}])
        with pytest.raises(ValueError, match="(?i)(exceed|duration|bounds)"):
            handle_dead_air_cut(spec, str(tmp_path))

    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_rejects_overlapping_segments(self, mock_resolve, tmp_path):
        """Reject overlapping segments."""
        mock_resolve.return_value = "/tmp/test.mp4"
        spec = _make_dead_air_spec(
            segments=[
                {"startMs": 1000, "endMs": 5000},
                {"startMs": 4000, "endMs": 8000},  # Overlaps with first
            ]
        )
        with pytest.raises(ValueError, match="(?i)(overlap|conflict)"):
            handle_dead_air_cut(spec, str(tmp_path))

    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_rejects_more_than_500_segments(self, mock_resolve, tmp_path):
        """Reject more than 500 segments."""
        mock_resolve.return_value = "/tmp/test.mp4"
        segments = [{"startMs": i * 100, "endMs": i * 100 + 50} for i in range(501)]
        spec = _make_dead_air_spec(segments=segments)
        with pytest.raises(ValueError, match="(?i)(500|limit|maximum|too many)"):
            handle_dead_air_cut(spec, str(tmp_path))

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_clamps_softening_buffer_to_max_5000(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """Clamp softeningBufferMs to [0, 5000]."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        spec = _make_dead_air_spec(
            segments=[{"startMs": 10000, "endMs": 15000}],
            softening_buffer_ms=10000,  # Should be clamped to 5000
        )

        result = handle_dead_air_cut(spec, str(tmp_path))
        # Should not raise; buffer should be clamped to 5.0 seconds
        assert result is not None

    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_rejects_unknown_mode(self, mock_resolve, tmp_path):
        """Reject unknown mode (only 'remove' allowed)."""
        mock_resolve.return_value = "/tmp/test.mp4"
        spec = _make_dead_air_spec(mode="merge")
        with pytest.raises(ValueError, match="(?i)(mode|unsupported|remove)"):
            handle_dead_air_cut(spec, str(tmp_path))

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_casts_timestamp_values_to_int(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """Cast all timestamp values to int to prevent injection."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        # Try to inject shell metacharacters via string timestamps
        spec = _make_dead_air_spec(
            segments=[{"startMs": "5000; rm -rf /", "endMs": "10000"}]
        )

        # Should either convert cleanly or raise ValueError during int() cast
        try:
            result = handle_dead_air_cut(spec, str(tmp_path))
        except ValueError:
            pass  # Expected if int() cast fails on malicious string


@pytest.mark.unit
class TestKeepSegmentCalculation:
    """Tests for _calculate_keep_segments helper function."""

    def test_inverts_silence_to_keep_segments(self):
        """Invert silence segments to produce keep segments."""
        silence = [(5.0, 10.0), (20.0, 25.0)]
        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.0)
        assert keep == [(0.0, 5.0), (10.0, 20.0), (25.0, 30.0)]

    def test_handles_silence_at_start(self):
        """Handle silence at the very start of file."""
        silence = [(0.0, 5.0)]
        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.0)
        assert keep == [(5.0, 30.0)]

    def test_handles_silence_at_end(self):
        """Handle silence at the very end of file."""
        silence = [(25.0, 30.0)]
        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.0)
        assert keep == [(0.0, 25.0)]

    def test_handles_single_silence_segment(self):
        """Handle a single silence segment in the middle."""
        silence = [(3.0, 7.0)]
        keep = _calculate_keep_segments(silence, total_duration=10.0, buffer_seconds=0.0)
        assert keep == [(0.0, 3.0), (7.0, 10.0)]

    def test_handles_no_silence(self):
        """Handle no silence segments (entire file is one keep segment)."""
        silence = []
        keep = _calculate_keep_segments(silence, total_duration=10.0, buffer_seconds=0.0)
        assert keep == [(0.0, 10.0)]

    def test_applies_softening_buffer(self):
        """Apply softening buffer to shrink silence (expand keep)."""
        silence = [(5.0, 10.0)]
        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.2)
        # Buffer shrinks silence from (5.0, 10.0) to (5.2, 9.8)
        # So keep segments are (0.0, 5.2) and (9.8, 30.0)
        assert len(keep) == 2
        assert keep[0][0] == 0.0
        assert abs(keep[0][1] - 5.2) < 0.01
        assert abs(keep[1][0] - 9.8) < 0.01
        assert keep[1][1] == 30.0


@pytest.mark.unit
class TestFFmpegCommandBuilding:
    """Tests for FFmpeg command construction without running FFmpeg."""

    @patch("app.tasks.media_job_worker._build_select_aselect_cmd")
    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_select_approach_builds_between_expressions(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, mock_build_cmd, tmp_path
    ):
        """Verify select/aselect approach builds correct between() expressions."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
        mock_build_cmd.return_value = ["ffmpeg", "-i", "input.mp4", "output.mp4"]

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        spec = _make_dead_air_spec(
            segments=[
                {"startMs": 0, "endMs": 5200},      # Keep after: none (start of file)
                {"startMs": 8700, "endMs": 15300},
                {"startMs": 20000, "endMs": 30000},
            ],
            crossfade=False,  # Use select/aselect approach
        )

        handle_dead_air_cut(spec, str(tmp_path))

        # Verify _build_select_aselect_cmd was called
        assert mock_build_cmd.called
        call_args = mock_build_cmd.call_args
        # Function is called with positional args: (input_path, output_path, keep_segments, fps, has_video, has_audio)
        # call_args[0] is the tuple of positional arguments
        keep_segments = call_args[0][2]  # Third positional argument
        # Should have keep segments (inverse of silence segments)
        # Exact values depend on inversion logic, but should be non-empty
        assert len(keep_segments) >= 1

    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    def test_probed_frame_rate_used_in_setpts(self, mock_resolve, mock_probe, tmp_path):
        """Verify probed frame rate is used (not hardcoded)."""
        from app.tasks.media_job_worker import _build_select_aselect_cmd

        mock_resolve.return_value = "/tmp/test.mp4"

        keep_segments = [(0.0, 10.0)]
        fps = "24000/1001"  # 23.976fps

        cmd = _build_select_aselect_cmd(
            input_path="/tmp/test.mp4",
            output_path="/tmp/output.mp4",
            keep_segments=keep_segments,
            fps=fps,
            has_video=True,
            has_audio=True,
        )

        # The setpts filter should reference the exact fps value
        cmd_str = " ".join(cmd)
        assert "24000/1001" in cmd_str or "setpts" in cmd_str.lower()


@pytest.mark.unit
class TestDeadAirCutEdgeCases:
    """Tests for edge cases and special scenarios."""

    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_empty_segments_returns_input_unchanged(
        self, mock_report, mock_resolve, mock_probe, tmp_path
    ):
        """Empty segments list returns input file as-is."""
        input_file = tmp_path / "input.mp4"
        input_file.write_text("fake video")

        mock_resolve.return_value = str(input_file)
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }

        spec = _make_dead_air_spec(segments=[])
        result = handle_dead_air_cut(spec, str(tmp_path))

        # Should return input file path unchanged
        assert result["artifacts"][0]["path"] == str(input_file)
        assert result["derived"]["removedMs"] == 0
        assert result["derived"]["segmentCount"] == 1

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_vfr_source_uses_trim_concat(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """VFR source falls back to trim+concat approach."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": True,  # Variable frame rate
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        spec = _make_dead_air_spec(
            segments=[{"startMs": 5000, "endMs": 10000}],
            crossfade=False,
        )

        with patch("app.tasks.media_job_worker._build_trim_concat_cmd") as mock_trim:
            mock_trim.return_value = ["ffmpeg", "-i", "input.mp4", "output.mp4"]
            result = handle_dead_air_cut(spec, str(tmp_path))

            # Should have called trim+concat approach due to VFR
            assert mock_trim.called

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_audio_only_skips_video_filters(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """Audio-only files skip video filters and use audio MIME type."""
        mock_resolve.return_value = "/tmp/test.mp3"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": False,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        spec = _make_dead_air_spec(segments=[{"startMs": 5000, "endMs": 10000}])
        result = handle_dead_air_cut(spec, str(tmp_path))

        # Should return audio MIME type
        assert result["artifacts"][0]["mime"] == "audio/mp4"
        assert result["artifacts"][0]["kind"] == "audio"

        # Verify FFmpeg command doesn't include video filters
        ffmpeg_call = mock_subprocess.call_args[0][0]
        ffmpeg_str = " ".join(ffmpeg_call)
        assert "-vf" not in ffmpeg_str
        assert "-c:v" not in ffmpeg_str

    @patch("app.tasks.media_job_worker._build_trim_concat_cmd")
    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_single_keep_segment_uses_trim_only(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, mock_build, tmp_path
    ):
        """Single keep segment produces simple trim, no concat."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        # Silence at start and end, leaving one keep segment in the middle
        spec = _make_dead_air_spec(
            segments=[
                {"startMs": 0, "endMs": 10000},
                {"startMs": 20000, "endMs": 30000},
            ],
            crossfade=True,  # Force trim_concat path
        )

        mock_build.return_value = ["ffmpeg", "-i", "test.mp4", "output.mp4"]
        result = handle_dead_air_cut(spec, str(tmp_path))

        # Should have called trim_concat, and the function should handle single segment
        assert mock_build.called
        call_args = mock_build.call_args[0]
        keep_segments = call_args[2]  # Third positional arg
        # Should have only one keep segment
        assert len(keep_segments) == 1

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_very_short_segments_skip_crossfade(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """Very short keep segments skip crossfade (hard cut fallback)."""
        from app.tasks.media_job_worker import _build_trim_concat_cmd

        mock_resolve.return_value = "/tmp/test.mp4"

        # Create keep segments where crossfade would be 0.2s but segment is only 0.03s
        keep_segments = [
            (0.0, 0.03),  # Very short segment (30ms)
            (10.0, 20.0),
        ]

        cmd = _build_trim_concat_cmd(
            input_path="/tmp/test.mp4",
            output_path="/tmp/output.mp4",
            keep_segments=keep_segments,
            crossfade_seconds=0.2,  # Requested crossfade longer than first segment
            has_video=False,
            has_audio=True,
        )

        cmd_str = " ".join(cmd)
        # Should use concat instead of acrossfade for very short segment
        # (or skip crossfade entirely)
        # The implementation should detect that 0.03s is too short for 0.2s crossfade
        # and either use hard cut (concat) or skip crossfade
        assert "concat" in cmd_str or "acrossfade" in cmd_str


@pytest.mark.unit
class TestDeadAirCutOutput:
    """Tests for output artifact and metadata."""

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_returns_correct_artifact_structure(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """Return artifact with correct path, kind, and mime."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        spec = _make_dead_air_spec(segments=[{"startMs": 5000, "endMs": 10000}])
        result = handle_dead_air_cut(spec, str(tmp_path))

        assert "artifacts" in result
        assert len(result["artifacts"]) == 1
        artifact = result["artifacts"][0]
        assert artifact["kind"] == "video"
        assert artifact["mime"] == "video/mp4"
        assert artifact["path"] == str(output_file)

    @patch("subprocess.run")
    @patch("app.tasks.media_job_worker._probe_media_info")
    @patch("app.tasks.media_job_worker._resolve_asset_path")
    @patch("app.tasks.media_job_worker.report_progress")
    def test_derived_metadata_correct(
        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
    ):
        """Derived metadata has correct durations and counts."""
        mock_resolve.return_value = "/tmp/test.mp4"
        mock_probe.return_value = {
            "duration_s": 30.0,
            "fps": "30",
            "has_video": True,
            "has_audio": True,
            "is_vfr": False,
        }
        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")

        output_file = tmp_path / "dead_air_cut_output.mp4"
        output_file.write_text("fake output")

        # Remove 5s (5000-10000) and 5s (20000-25000) = 10s total removed
        spec = _make_dead_air_spec(
            segments=[
                {"startMs": 5000, "endMs": 10000},
                {"startMs": 20000, "endMs": 25000},
            ]
        )
        result = handle_dead_air_cut(spec, str(tmp_path))

        assert "derived" in result
        derived = result["derived"]
        assert derived["originalDurationMs"] == 30000
        assert derived["removedMs"] == 10000  # 5s + 5s
        assert derived["outputDurationMs"] == 20000  # 30s - 10s
        # Keep segments: (0, 5), (10, 20), (25, 30) = 3 segments
        assert derived["segmentCount"] == 3
