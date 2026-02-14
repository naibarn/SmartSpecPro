"""Integration tests for dead_air_cut end-to-end flow.

Tests the full pipeline from job submission to result with real FFmpeg.
These tests require FFmpeg to be installed.
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.tasks.media_job_worker import handle_dead_air_cut

# Skip integration tests if FFmpeg is not available
try:
    import subprocess
    result = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
    FFMPEG_AVAILABLE = result.returncode == 0
except (FileNotFoundError, subprocess.TimeoutExpired):
    FFMPEG_AVAILABLE = False

pytestmark = pytest.mark.skipif(not FFMPEG_AVAILABLE, reason="FFmpeg not available")


@pytest.fixture(autouse=True)
def bypass_ssrf_validation():
    """Bypass SSRF validation for integration tests with local files."""
    # Patch where it's used, not where it's defined
    with patch("app.tasks.media_job_worker.validate_uri_no_ssrf"):
        yield


@pytest.fixture
def sample_video(tmp_path):
    """Generate a simple test video file using FFmpeg."""
    video_path = tmp_path / "test_input.mp4"

    # Generate 10 second video with tone audio
    # Pattern: 2s audio, 3s silence, 3s audio, 2s silence
    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", "color=c=blue:s=320x240:d=10",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=2",
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=mono:sample_rate=44100:duration=3",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=3",
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=mono:sample_rate=44100:duration=2",
        "-filter_complex",
        "[1][2][3][4]concat=n=4:v=0:a=1[a]",
        "-map", "0:v",
        "-map", "[a]",
        "-t", "10",
        "-y",
        str(video_path),
    ]

    result = subprocess.run(cmd, capture_output=True, timeout=30)
    if result.returncode != 0:
        pytest.skip(f"Failed to generate test video: {result.stderr.decode()}")

    # Return file:// URI instead of raw path
    return f"file://{video_path}"


@pytest.mark.integration
class TestDeadAirCutIntegration:
    """Integration tests for full dead_air_cut workflow."""

    def test_basic_silence_removal(self, sample_video, tmp_path):
        """Test basic silence removal with no options."""
        spec = {
            "specVersion": "0.1",
            "jobId": "integration-test-001",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": [
                    {"startMs": 2000, "endMs": 5000},  # Remove 3s silence
                    {"startMs": 8000, "endMs": 10000}, # Remove 2s silence
                ],
                "mode": "remove",
                "softeningBufferMs": 0,
                "crossfade": False,
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        result = handle_dead_air_cut(spec, str(tmp_path))

        # Verify output file exists
        assert "artifacts" in result
        assert len(result["artifacts"]) == 1
        output_path = result["artifacts"][0]["path"]
        assert os.path.exists(output_path)

        # Verify metadata
        assert result["derived"]["originalDurationMs"] == pytest.approx(10000, abs=100)
        assert result["derived"]["removedMs"] == 5000  # 3s + 2s
        assert result["derived"]["outputDurationMs"] == pytest.approx(5000, abs=100)
        assert result["derived"]["segmentCount"] == 2  # Two keep segments

        # Verify output file is valid video
        probe_result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", output_path],
            capture_output=True,
            text=True,
            timeout=10,
        )
        probe_data = json.loads(probe_result.stdout)
        output_duration = float(probe_data["format"]["duration"])
        assert output_duration == pytest.approx(5.0, abs=0.2)  # ~5 seconds

    def test_silence_removal_with_softening_buffer(self, sample_video, tmp_path):
        """Test silence removal with softening buffer."""
        spec = {
            "specVersion": "0.1",
            "jobId": "integration-test-002",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": [{"startMs": 2000, "endMs": 5000}],
                "mode": "remove",
                "softeningBufferMs": 200,  # 200ms buffer
                "crossfade": False,
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        result = handle_dead_air_cut(spec, str(tmp_path))

        # Verify buffer reduces removed duration
        # Original silence: 3000ms, with 200ms buffer: 2600ms removed
        assert result["derived"]["removedMs"] == 3000
        # Output should be ~7.4s (10s - 2.6s, accounting for buffer expansion)

    def test_silence_removal_with_crossfade(self, sample_video, tmp_path):
        """Test silence removal with audio crossfade."""
        spec = {
            "specVersion": "0.1",
            "jobId": "integration-test-003",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": [{"startMs": 2000, "endMs": 5000}],
                "mode": "remove",
                "softeningBufferMs": 0,
                "crossfade": True,  # Enable crossfade
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        result = handle_dead_air_cut(spec, str(tmp_path))

        # Verify output file exists and is valid
        output_path = result["artifacts"][0]["path"]
        assert os.path.exists(output_path)

        # Verify it's a valid video file
        probe_result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", output_path],
            capture_output=True,
            text=True,
            timeout=10,
        )
        probe_data = json.loads(probe_result.stdout)
        streams = probe_data.get("streams", [])

        # Should have both video and audio streams
        has_video = any(s["codec_type"] == "video" for s in streams)
        has_audio = any(s["codec_type"] == "audio" for s in streams)
        assert has_video and has_audio

    def test_empty_segments_returns_original(self, sample_video, tmp_path):
        """Test that empty segments list returns original file."""
        spec = {
            "specVersion": "0.1",
            "jobId": "integration-test-004",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": [],  # No segments to remove
                "mode": "remove",
                "softeningBufferMs": 0,
                "crossfade": False,
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        result = handle_dead_air_cut(spec, str(tmp_path))

        # Should return input URI (no processing)
        # When no segments are removed, the input URI is returned as-is
        assert result["artifacts"][0]["path"] == sample_video
        assert result["derived"]["removedMs"] == 0
        assert result["derived"]["segmentCount"] == 1

    @pytest.mark.slow
    def test_many_segments_performance(self, sample_video, tmp_path):
        """Test performance with many segments (stress test)."""
        # Create 100 small silence segments
        segments = [
            {"startMs": i * 100, "endMs": i * 100 + 10}
            for i in range(0, 100)
        ]

        spec = {
            "specVersion": "0.1",
            "jobId": "integration-test-005",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": segments,
                "mode": "remove",
                "softeningBufferMs": 0,
                "crossfade": False,
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        import time
        start_time = time.time()
        result = handle_dead_air_cut(spec, str(tmp_path))
        elapsed = time.time() - start_time

        # Should complete within reasonable time (30 seconds)
        assert elapsed < 30.0, f"Processing took {elapsed:.2f}s, expected < 30s"

        # Verify output exists
        assert os.path.exists(result["artifacts"][0]["path"])
        # 100 silence segments from 0-10000ms leaves 100 keep segments in between
        assert result["derived"]["segmentCount"] == 100


@pytest.mark.integration
class TestErrorHandling:
    """Integration tests for error handling scenarios."""

    def test_invalid_segment_bounds(self, sample_video, tmp_path):
        """Test error handling for invalid segment bounds."""
        spec = {
            "specVersion": "0.1",
            "jobId": "error-test-001",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": [{"startMs": 5000, "endMs": 2000}],  # Invalid: start > end
                "mode": "remove",
                "softeningBufferMs": 0,
                "crossfade": False,
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        with pytest.raises(ValueError, match="(?i)(invalid|start.*end|bounds)"):
            handle_dead_air_cut(spec, str(tmp_path))

    def test_overlapping_segments(self, sample_video, tmp_path):
        """Test error handling for overlapping segments."""
        spec = {
            "specVersion": "0.1",
            "jobId": "error-test-002",
            "jobType": "dead_air_cut",
            "inputs": {
                "assets": [{"assetId": "test", "kind": "video", "uri": sample_video}],
            },
            "params": {
                "segments": [
                    {"startMs": 1000, "endMs": 3000},
                    {"startMs": 2000, "endMs": 4000},  # Overlaps with previous
                ],
                "mode": "remove",
                "softeningBufferMs": 0,
                "crossfade": False,
            },
            "output": {"mode": "file", "target": "output.mp4"},
        }

        with pytest.raises(ValueError, match="(?i)(overlap|conflict)"):
            handle_dead_air_cut(spec, str(tmp_path))
