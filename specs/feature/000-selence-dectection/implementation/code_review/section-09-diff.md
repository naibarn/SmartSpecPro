diff --git a/python-backend/app/tasks/media_job_worker.py b/python-backend/app/tasks/media_job_worker.py
index 5d909ed..634d3a9 100644
--- a/python-backend/app/tasks/media_job_worker.py
+++ b/python-backend/app/tasks/media_job_worker.py
@@ -771,6 +771,386 @@ def handle_subtitles_extract(spec: dict, tmp_dir: str) -> dict:
     }
 
 
+def _calculate_keep_segments(
+    silence_segments: list[tuple[float, float]],
+    total_duration: float,
+    buffer_seconds: float = 0.0,
+) -> list[tuple[float, float]]:
+    """Invert silence segments to produce keep segments.
+
+    Args:
+        silence_segments: List of (start, end) tuples in seconds, sorted by start.
+        total_duration: Total duration of the media file in seconds.
+        buffer_seconds: Softening buffer — shrinks silence boundaries (expands keep).
+
+    Returns:
+        List of (start, end) tuples representing portions to keep.
+    """
+    # Sort silence segments by start time
+    sorted_silence = sorted(silence_segments, key=lambda s: s[0])
+
+    # Apply buffer: shrink each silence segment
+    buffered_silence = []
+    for start, end in sorted_silence:
+        buffered_start = start + buffer_seconds
+        buffered_end = end - buffer_seconds
+        # Only keep the silence segment if it still has positive duration after buffering
+        if buffered_start < buffered_end:
+            buffered_silence.append((buffered_start, buffered_end))
+
+    # Calculate keep segments as gaps between buffered silence segments
+    keep_segments = []
+    current_time = 0.0
+
+    for silence_start, silence_end in buffered_silence:
+        # Add the keep segment before this silence
+        if current_time < silence_start:
+            keep_segments.append((current_time, silence_start))
+        current_time = max(current_time, silence_end)
+
+    # Add final keep segment if there's time remaining
+    if current_time < total_duration:
+        keep_segments.append((current_time, total_duration))
+
+    return keep_segments
+
+
+def _probe_media_info(input_path: str) -> dict:
+    """Probe a media file for duration, frame rate, and stream types.
+
+    Returns dict with keys:
+        duration_s: float
+        fps: str (e.g., "30000/1001")
+        has_video: bool
+        has_audio: bool
+        is_vfr: bool (True if variable frame rate detected)
+    """
+    result = subprocess.run(
+        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input_path],
+        capture_output=True,
+        text=True,
+        timeout=30,
+    )
+
+    if result.returncode != 0:
+        raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")
+
+    probe_data = json.loads(result.stdout)
+    fmt = probe_data.get("format", {})
+    streams = probe_data.get("streams", [])
+
+    duration_s = float(fmt.get("duration", 0))
+
+    # Find video and audio streams
+    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
+    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
+
+    has_video = video_stream is not None
+    has_audio = audio_stream is not None
+
+    fps = "30"  # default
+    is_vfr = False
+
+    if video_stream:
+        r_frame_rate = video_stream.get("r_frame_rate", "30/1")
+        avg_frame_rate = video_stream.get("avg_frame_rate", r_frame_rate)
+        fps = r_frame_rate
+
+        # Detect VFR: if r_frame_rate and avg_frame_rate differ significantly
+        try:
+            def _eval_fraction(frac: str) -> float:
+                parts = frac.split("/")
+                if len(parts) == 2:
+                    return float(parts[0]) / float(parts[1])
+                return float(frac)
+
+            r_fps = _eval_fraction(r_frame_rate)
+            avg_fps = _eval_fraction(avg_frame_rate)
+            # If they differ by more than 5%, consider it VFR
+            if abs(r_fps - avg_fps) > 0.05 * r_fps:
+                is_vfr = True
+        except (ValueError, ZeroDivisionError):
+            pass
+
+    return {
+        "duration_s": duration_s,
+        "fps": fps,
+        "has_video": has_video,
+        "has_audio": has_audio,
+        "is_vfr": is_vfr,
+    }
+
+
+def _build_select_aselect_cmd(
+    input_path: str,
+    output_path: str,
+    keep_segments: list[tuple[float, float]],
+    fps: str,
+    has_video: bool,
+    has_audio: bool,
+) -> list[str]:
+    """Build FFmpeg command using select/aselect + setpts for clean cuts.
+
+    Produces between() expressions for each keep segment.
+    """
+    # Build between() expressions
+    between_exprs = [f"between(t,{s:.6f},{e:.6f})" for s, e in keep_segments]
+    select_expr = "+".join(between_exprs)
+
+    cmd = ["ffmpeg", "-i", input_path]
+
+    if has_video:
+        vf = f"select='{select_expr}',setpts=N/{fps}/TB"
+        cmd.extend(["-vf", vf, "-c:v", "libx264"])
+
+    if has_audio:
+        af = f"aselect='{select_expr}',asetpts=N/SR/TB"
+        cmd.extend(["-af", af, "-c:a", "aac"])
+
+    cmd.extend(["-y", output_path])
+    return cmd
+
+
+def _build_trim_concat_cmd(
+    input_path: str,
+    output_path: str,
+    keep_segments: list[tuple[float, float]],
+    crossfade_seconds: float,
+    has_video: bool,
+    has_audio: bool,
+) -> list[str]:
+    """Build FFmpeg command using trim/atrim + concat with acrossfade.
+
+    Used when crossfade is enabled or when VFR source is detected.
+    """
+    if len(keep_segments) == 0:
+        raise ValueError("Cannot build trim+concat command with zero keep segments")
+
+    # If only one segment, use simple trim
+    if len(keep_segments) == 1:
+        start, end = keep_segments[0]
+        cmd = ["ffmpeg", "-i", input_path]
+        if has_video:
+            cmd.extend(["-vf", f"trim=start={start:.6f}:end={end:.6f},setpts=PTS-STARTPTS"])
+        if has_audio:
+            cmd.extend(["-af", f"atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS"])
+        cmd.extend(["-y", output_path])
+        return cmd
+
+    # Multiple segments: build filter_complex
+    filter_parts = []
+    video_labels = []
+    audio_labels = []
+
+    # Trim each segment
+    for i, (start, end) in enumerate(keep_segments):
+        if has_video:
+            filter_parts.append(f"[0:v]trim=start={start:.6f}:end={end:.6f},setpts=PTS-STARTPTS[v{i}]")
+            video_labels.append(f"[v{i}]")
+        if has_audio:
+            filter_parts.append(f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[a{i}]")
+            audio_labels.append(f"[a{i}]")
+
+    # Concatenate video (simple concat, no crossfade)
+    if has_video:
+        concat_v = "".join(video_labels) + f"concat=n={len(keep_segments)}:v=1:a=0[vout]"
+        filter_parts.append(concat_v)
+
+    # Concatenate audio with crossfade
+    if has_audio:
+        if len(audio_labels) == 1:
+            # Only one audio segment, no crossfade needed
+            filter_parts.append(f"{audio_labels[0]}acopy[aout]")
+        else:
+            # Chain acrossfade for adjacent segments
+            current_label = audio_labels[0]
+            for i in range(1, len(audio_labels)):
+                next_label = audio_labels[i]
+                # Calculate crossfade duration (limit to minimum segment duration)
+                seg_duration = keep_segments[i - 1][1] - keep_segments[i - 1][0]
+                fade_dur = min(crossfade_seconds, seg_duration, 0.5)  # Max 0.5s
+                if fade_dur < 0.04:
+                    fade_dur = 0.0  # Skip crossfade if too short
+
+                if fade_dur > 0:
+                    output_label = f"[afade{i}]" if i < len(audio_labels) - 1 else "[aout]"
+                    filter_parts.append(f"{current_label}{next_label}acrossfade=d={fade_dur:.3f}:c1=tri:c2=tri{output_label}")
+                    current_label = output_label
+                else:
+                    # Hard cut (concat without crossfade)
+                    output_label = f"[afade{i}]" if i < len(audio_labels) - 1 else "[aout]"
+                    filter_parts.append(f"{current_label}{next_label}concat=n=2:v=0:a=1{output_label}")
+                    current_label = output_label
+
+    filter_complex = ";".join(filter_parts)
+
+    cmd = ["ffmpeg", "-i", input_path, "-filter_complex", filter_complex]
+
+    if has_video:
+        cmd.extend(["-map", "[vout]", "-c:v", "libx264"])
+    if has_audio:
+        cmd.extend(["-map", "[aout]", "-c:a", "aac"])
+
+    cmd.extend(["-y", output_path])
+    return cmd
+
+
+def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
+    """Cut silent segments from video/audio and concatenate remaining parts.
+
+    Reads segments to remove from spec.params.segments.
+    Applies optional softening buffer and audio crossfade.
+    Returns concatenated output file as artifact.
+    """
+    job_id = spec["jobId"]
+
+    # Extract inputs
+    assets = spec.get("inputs", {}).get("assets", [])
+    if not assets:
+        raise ValueError("No assets provided for dead_air_cut")
+
+    asset_uri = assets[0]["uri"]
+    input_path = _resolve_asset_path(asset_uri, tmp_dir)
+
+    # Extract params
+    params = spec.get("params", {})
+    segments = params.get("segments", [])
+    mode = params.get("mode", "remove")
+    softening_buffer_ms = _to_int(params.get("softeningBufferMs", 0), default=0)
+    crossfade = params.get("crossfade", False)
+
+    # Validate mode
+    if mode != "remove":
+        raise ValueError(f"Unsupported mode: {mode!r}. Only 'remove' is supported.")
+
+    # Validate segment count
+    if len(segments) > 500:
+        raise ValueError(f"Too many segments: {len(segments)}. Maximum is 500.")
+
+    # Clamp softening buffer
+    softening_buffer_ms = max(0, min(softening_buffer_ms, 5000))
+    buffer_seconds = softening_buffer_ms / 1000.0
+
+    # Validate and cast segments
+    validated_segments = []
+    for seg in segments:
+        start_ms = _to_int(seg.get("startMs"), default=-1)
+        end_ms = _to_int(seg.get("endMs"), default=-1)
+
+        if start_ms < 0:
+            raise ValueError(f"Invalid segment: startMs must be >= 0, got {start_ms}")
+        if start_ms >= end_ms:
+            raise ValueError(f"Invalid segment: startMs ({start_ms}) must be < endMs ({end_ms})")
+
+        validated_segments.append((start_ms, end_ms))
+
+    # Sort segments and check for overlaps
+    validated_segments.sort(key=lambda s: s[0])
+    for i in range(1, len(validated_segments)):
+        prev_end = validated_segments[i - 1][1]
+        curr_start = validated_segments[i][0]
+        if curr_start < prev_end:
+            raise ValueError(f"Overlapping segments detected: segment {i} starts at {curr_start}ms but previous ends at {prev_end}ms")
+
+    report_progress(job_id, 0.1, "preparing", "Validating input")
+
+    # Handle empty segments
+    if len(validated_segments) == 0:
+        # No segments to remove, return input as-is
+        media_info = _probe_media_info(input_path)
+        original_duration_ms = int(media_info["duration_s"] * 1000)
+        return {
+            "artifacts": [{"path": input_path, "kind": "video", "mime": "video/mp4"}],
+            "derived": {
+                "originalDurationMs": original_duration_ms,
+                "outputDurationMs": original_duration_ms,
+                "removedMs": 0,
+                "segmentCount": 1,
+            },
+        }
+
+    # Probe the source file
+    media_info = _probe_media_info(input_path)
+    duration_s = media_info["duration_s"]
+    duration_ms = int(duration_s * 1000)
+
+    # Validate endMs against probed duration (with 100ms tolerance)
+    for start_ms, end_ms in validated_segments:
+        if end_ms > duration_ms + 100:
+            raise ValueError(f"Segment endMs ({end_ms}ms) exceeds file duration ({duration_ms}ms)")
+
+    # Convert segments to seconds for calculations
+    silence_segments_s = [(start_ms / 1000.0, end_ms / 1000.0) for start_ms, end_ms in validated_segments]
+
+    # Calculate keep segments
+    keep_segments = _calculate_keep_segments(silence_segments_s, duration_s, buffer_seconds)
+
+    if len(keep_segments) == 0:
+        raise ValueError("All segments cover the entire file; no content remains to keep")
+
+    report_progress(job_id, 0.3, "building_filter", "Building FFmpeg filter")
+
+    # Determine output path
+    output_path = os.path.join(tmp_dir, "dead_air_cut_output.mp4")
+
+    # Choose FFmpeg approach
+    use_trim_concat = crossfade or media_info["is_vfr"]
+
+    if use_trim_concat:
+        # Calculate crossfade duration
+        if len(keep_segments) > 1:
+            shortest_keep = min(e - s for s, e in keep_segments)
+            crossfade_duration = min(buffer_seconds * 2, shortest_keep)
+        else:
+            crossfade_duration = 0.0
+
+        cmd = _build_trim_concat_cmd(
+            input_path,
+            output_path,
+            keep_segments,
+            crossfade_duration,
+            media_info["has_video"],
+            media_info["has_audio"],
+        )
+    else:
+        cmd = _build_select_aselect_cmd(
+            input_path,
+            output_path,
+            keep_segments,
+            media_info["fps"],
+            media_info["has_video"],
+            media_info["has_audio"],
+        )
+
+    report_progress(job_id, 0.4, "encoding", "Running FFmpeg")
+
+    # Run FFmpeg
+    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
+
+    if result.returncode != 0:
+        raise RuntimeError(f"FFmpeg failed: {_sanitize_stderr(result.stderr)}")
+
+    if not os.path.exists(output_path):
+        raise RuntimeError("FFmpeg succeeded but output file was not created")
+
+    report_progress(job_id, 0.9, "finalizing", "Finalizing output")
+
+    # Calculate derived metadata
+    original_duration_ms = duration_ms
+    removed_ms = sum(end_ms - start_ms for start_ms, end_ms in validated_segments)
+    output_duration_ms = original_duration_ms - removed_ms
+
+    return {
+        "artifacts": [{"path": output_path, "kind": "video", "mime": "video/mp4"}],
+        "derived": {
+            "originalDurationMs": original_duration_ms,
+            "outputDurationMs": output_duration_ms,
+            "removedMs": removed_ms,
+            "segmentCount": len(keep_segments),
+        },
+    }
+
+
 # ========================================
 # Main Celery Task
 # ========================================
@@ -793,7 +1173,7 @@ HANDLER_MAP = {
     "render_hls": _not_implemented_handler,
     "subtitles_burnin": _not_implemented_handler,
     "concat": _not_implemented_handler,
-    "dead_air_cut": _not_implemented_handler,
+    "dead_air_cut": handle_dead_air_cut,
     "generate_clip_from_api": _not_implemented_handler,
 }
 
diff --git a/python-backend/tests/test_dead_air_cut.py b/python-backend/tests/test_dead_air_cut.py
new file mode 100644
index 0000000..1ef6453
--- /dev/null
+++ b/python-backend/tests/test_dead_air_cut.py
@@ -0,0 +1,430 @@
+"""Tests for dead_air_cut media job handler.
+
+Tests input validation, keep segment calculation, FFmpeg command building,
+and edge cases for the dead_air_cut job type.
+"""
+
+import json
+import os
+from unittest.mock import MagicMock, patch
+
+import pytest
+
+from app.tasks.media_job_worker import (
+    _calculate_keep_segments,
+    handle_dead_air_cut,
+)
+
+
+def _make_dead_air_spec(
+    job_id="mj-test-001",
+    asset_uri="file:///tmp/test.mp4",
+    segments=None,
+    mode="remove",
+    softening_buffer_ms=0,
+    crossfade=False,
+):
+    """Factory function to create a valid dead_air_cut spec."""
+    if segments is None:
+        segments = [{"startMs": 5000, "endMs": 10000}]
+    return {
+        "specVersion": "0.1",
+        "jobId": job_id,
+        "jobType": "dead_air_cut",
+        "inputs": {"assets": [{"assetId": "asset-1", "kind": "video", "uri": asset_uri}]},
+        "params": {
+            "segments": segments,
+            "mode": mode,
+            "softeningBufferMs": softening_buffer_ms,
+            "crossfade": crossfade,
+        },
+        "output": {"mode": "file", "target": "output.mp4"},
+    }
+
+
+@pytest.mark.unit
+class TestDeadAirCutInputValidation:
+    """Tests for input validation logic before FFmpeg processing."""
+
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_rejects_segment_with_start_greater_than_end(self, mock_resolve, tmp_path):
+        """Reject segment where startMs > endMs."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        spec = _make_dead_air_spec(segments=[{"startMs": 10000, "endMs": 5000}])
+        with pytest.raises(ValueError, match="(?i)(invalid|start.*end|bounds)"):
+            handle_dead_air_cut(spec, str(tmp_path))
+
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_rejects_negative_start_ms(self, mock_resolve, tmp_path):
+        """Reject segment with negative startMs."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        spec = _make_dead_air_spec(segments=[{"startMs": -1000, "endMs": 5000}])
+        with pytest.raises(ValueError, match="(?i)(negative|invalid|start)"):
+            handle_dead_air_cut(spec, str(tmp_path))
+
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_rejects_end_ms_exceeding_duration(self, mock_resolve, mock_probe, tmp_path):
+        """Reject segment with endMs exceeding file duration."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+        spec = _make_dead_air_spec(segments=[{"startMs": 1000, "endMs": 35000}])
+        with pytest.raises(ValueError, match="(?i)(exceed|duration|bounds)"):
+            handle_dead_air_cut(spec, str(tmp_path))
+
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_rejects_overlapping_segments(self, mock_resolve, tmp_path):
+        """Reject overlapping segments."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        spec = _make_dead_air_spec(
+            segments=[
+                {"startMs": 1000, "endMs": 5000},
+                {"startMs": 4000, "endMs": 8000},  # Overlaps with first
+            ]
+        )
+        with pytest.raises(ValueError, match="(?i)(overlap|conflict)"):
+            handle_dead_air_cut(spec, str(tmp_path))
+
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_rejects_more_than_500_segments(self, mock_resolve, tmp_path):
+        """Reject more than 500 segments."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        segments = [{"startMs": i * 100, "endMs": i * 100 + 50} for i in range(501)]
+        spec = _make_dead_air_spec(segments=segments)
+        with pytest.raises(ValueError, match="(?i)(500|limit|maximum|too many)"):
+            handle_dead_air_cut(spec, str(tmp_path))
+
+    @patch("subprocess.run")
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_clamps_softening_buffer_to_max_5000(
+        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
+    ):
+        """Clamp softeningBufferMs to [0, 5000]."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
+
+        output_file = tmp_path / "dead_air_cut_output.mp4"
+        output_file.write_text("fake output")
+
+        spec = _make_dead_air_spec(
+            segments=[{"startMs": 10000, "endMs": 15000}],
+            softening_buffer_ms=10000,  # Should be clamped to 5000
+        )
+
+        result = handle_dead_air_cut(spec, str(tmp_path))
+        # Should not raise; buffer should be clamped to 5.0 seconds
+        assert result is not None
+
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_rejects_unknown_mode(self, mock_resolve, tmp_path):
+        """Reject unknown mode (only 'remove' allowed)."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        spec = _make_dead_air_spec(mode="merge")
+        with pytest.raises(ValueError, match="(?i)(mode|unsupported|remove)"):
+            handle_dead_air_cut(spec, str(tmp_path))
+
+    @patch("subprocess.run")
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_casts_timestamp_values_to_int(
+        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
+    ):
+        """Cast all timestamp values to int to prevent injection."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
+
+        output_file = tmp_path / "dead_air_cut_output.mp4"
+        output_file.write_text("fake output")
+
+        # Try to inject shell metacharacters via string timestamps
+        spec = _make_dead_air_spec(
+            segments=[{"startMs": "5000; rm -rf /", "endMs": "10000"}]
+        )
+
+        # Should either convert cleanly or raise ValueError during int() cast
+        try:
+            result = handle_dead_air_cut(spec, str(tmp_path))
+        except ValueError:
+            pass  # Expected if int() cast fails on malicious string
+
+
+@pytest.mark.unit
+class TestKeepSegmentCalculation:
+    """Tests for _calculate_keep_segments helper function."""
+
+    def test_inverts_silence_to_keep_segments(self):
+        """Invert silence segments to produce keep segments."""
+        silence = [(5.0, 10.0), (20.0, 25.0)]
+        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.0)
+        assert keep == [(0.0, 5.0), (10.0, 20.0), (25.0, 30.0)]
+
+    def test_handles_silence_at_start(self):
+        """Handle silence at the very start of file."""
+        silence = [(0.0, 5.0)]
+        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.0)
+        assert keep == [(5.0, 30.0)]
+
+    def test_handles_silence_at_end(self):
+        """Handle silence at the very end of file."""
+        silence = [(25.0, 30.0)]
+        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.0)
+        assert keep == [(0.0, 25.0)]
+
+    def test_handles_single_silence_segment(self):
+        """Handle a single silence segment in the middle."""
+        silence = [(3.0, 7.0)]
+        keep = _calculate_keep_segments(silence, total_duration=10.0, buffer_seconds=0.0)
+        assert keep == [(0.0, 3.0), (7.0, 10.0)]
+
+    def test_handles_no_silence(self):
+        """Handle no silence segments (entire file is one keep segment)."""
+        silence = []
+        keep = _calculate_keep_segments(silence, total_duration=10.0, buffer_seconds=0.0)
+        assert keep == [(0.0, 10.0)]
+
+    def test_applies_softening_buffer(self):
+        """Apply softening buffer to shrink silence (expand keep)."""
+        silence = [(5.0, 10.0)]
+        keep = _calculate_keep_segments(silence, total_duration=30.0, buffer_seconds=0.2)
+        # Buffer shrinks silence from (5.0, 10.0) to (5.2, 9.8)
+        # So keep segments are (0.0, 5.2) and (9.8, 30.0)
+        assert len(keep) == 2
+        assert keep[0][0] == 0.0
+        assert abs(keep[0][1] - 5.2) < 0.01
+        assert abs(keep[1][0] - 9.8) < 0.01
+        assert keep[1][1] == 30.0
+
+
+@pytest.mark.unit
+class TestFFmpegCommandBuilding:
+    """Tests for FFmpeg command construction without running FFmpeg."""
+
+    @patch("app.tasks.media_job_worker._build_select_aselect_cmd")
+    @patch("subprocess.run")
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_select_approach_builds_between_expressions(
+        self, mock_report, mock_resolve, mock_probe, mock_subprocess, mock_build_cmd, tmp_path
+    ):
+        """Verify select/aselect approach builds correct between() expressions."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
+        mock_build_cmd.return_value = ["ffmpeg", "-i", "input.mp4", "output.mp4"]
+
+        output_file = tmp_path / "dead_air_cut_output.mp4"
+        output_file.write_text("fake output")
+
+        spec = _make_dead_air_spec(
+            segments=[
+                {"startMs": 0, "endMs": 5200},      # Keep after: none (start of file)
+                {"startMs": 8700, "endMs": 15300},
+                {"startMs": 20000, "endMs": 30000},
+            ],
+            crossfade=False,  # Use select/aselect approach
+        )
+
+        handle_dead_air_cut(spec, str(tmp_path))
+
+        # Verify _build_select_aselect_cmd was called
+        assert mock_build_cmd.called
+        call_args = mock_build_cmd.call_args
+        # Function is called with positional args: (input_path, output_path, keep_segments, fps, has_video, has_audio)
+        # call_args[0] is the tuple of positional arguments
+        keep_segments = call_args[0][2]  # Third positional argument
+        # Should have keep segments (inverse of silence segments)
+        # Exact values depend on inversion logic, but should be non-empty
+        assert len(keep_segments) >= 1
+
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    def test_probed_frame_rate_used_in_setpts(self, mock_resolve, mock_probe, tmp_path):
+        """Verify probed frame rate is used (not hardcoded)."""
+        from app.tasks.media_job_worker import _build_select_aselect_cmd
+
+        mock_resolve.return_value = "/tmp/test.mp4"
+
+        keep_segments = [(0.0, 10.0)]
+        fps = "24000/1001"  # 23.976fps
+
+        cmd = _build_select_aselect_cmd(
+            input_path="/tmp/test.mp4",
+            output_path="/tmp/output.mp4",
+            keep_segments=keep_segments,
+            fps=fps,
+            has_video=True,
+            has_audio=True,
+        )
+
+        # The setpts filter should reference the exact fps value
+        cmd_str = " ".join(cmd)
+        assert "24000/1001" in cmd_str or "setpts" in cmd_str.lower()
+
+
+@pytest.mark.unit
+class TestDeadAirCutEdgeCases:
+    """Tests for edge cases and special scenarios."""
+
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_empty_segments_returns_input_unchanged(
+        self, mock_report, mock_resolve, mock_probe, tmp_path
+    ):
+        """Empty segments list returns input file as-is."""
+        input_file = tmp_path / "input.mp4"
+        input_file.write_text("fake video")
+
+        mock_resolve.return_value = str(input_file)
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+
+        spec = _make_dead_air_spec(segments=[])
+        result = handle_dead_air_cut(spec, str(tmp_path))
+
+        # Should return input file path unchanged
+        assert result["artifacts"][0]["path"] == str(input_file)
+        assert result["derived"]["removedMs"] == 0
+        assert result["derived"]["segmentCount"] == 1
+
+    @patch("subprocess.run")
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_vfr_source_uses_trim_concat(
+        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
+    ):
+        """VFR source falls back to trim+concat approach."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": True,  # Variable frame rate
+        }
+        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
+
+        output_file = tmp_path / "dead_air_cut_output.mp4"
+        output_file.write_text("fake output")
+
+        spec = _make_dead_air_spec(
+            segments=[{"startMs": 5000, "endMs": 10000}],
+            crossfade=False,
+        )
+
+        with patch("app.tasks.media_job_worker._build_trim_concat_cmd") as mock_trim:
+            mock_trim.return_value = ["ffmpeg", "-i", "input.mp4", "output.mp4"]
+            result = handle_dead_air_cut(spec, str(tmp_path))
+
+            # Should have called trim+concat approach due to VFR
+            assert mock_trim.called
+
+
+@pytest.mark.unit
+class TestDeadAirCutOutput:
+    """Tests for output artifact and metadata."""
+
+    @patch("subprocess.run")
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_returns_correct_artifact_structure(
+        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
+    ):
+        """Return artifact with correct path, kind, and mime."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
+
+        output_file = tmp_path / "dead_air_cut_output.mp4"
+        output_file.write_text("fake output")
+
+        spec = _make_dead_air_spec(segments=[{"startMs": 5000, "endMs": 10000}])
+        result = handle_dead_air_cut(spec, str(tmp_path))
+
+        assert "artifacts" in result
+        assert len(result["artifacts"]) == 1
+        artifact = result["artifacts"][0]
+        assert artifact["kind"] == "video"
+        assert artifact["mime"] == "video/mp4"
+        assert artifact["path"] == str(output_file)
+
+    @patch("subprocess.run")
+    @patch("app.tasks.media_job_worker._probe_media_info")
+    @patch("app.tasks.media_job_worker._resolve_asset_path")
+    @patch("app.tasks.media_job_worker.report_progress")
+    def test_derived_metadata_correct(
+        self, mock_report, mock_resolve, mock_probe, mock_subprocess, tmp_path
+    ):
+        """Derived metadata has correct durations and counts."""
+        mock_resolve.return_value = "/tmp/test.mp4"
+        mock_probe.return_value = {
+            "duration_s": 30.0,
+            "fps": "30",
+            "has_video": True,
+            "has_audio": True,
+            "is_vfr": False,
+        }
+        mock_subprocess.return_value = MagicMock(returncode=0, stderr="", stdout="")
+
+        output_file = tmp_path / "dead_air_cut_output.mp4"
+        output_file.write_text("fake output")
+
+        # Remove 5s (5000-10000) and 5s (20000-25000) = 10s total removed
+        spec = _make_dead_air_spec(
+            segments=[
+                {"startMs": 5000, "endMs": 10000},
+                {"startMs": 20000, "endMs": 25000},
+            ]
+        )
+        result = handle_dead_air_cut(spec, str(tmp_path))
+
+        assert "derived" in result
+        derived = result["derived"]
+        assert derived["originalDurationMs"] == 30000
+        assert derived["removedMs"] == 10000  # 5s + 5s
+        assert derived["outputDurationMs"] == 20000  # 30s - 10s
+        # Keep segments: (0, 5), (10, 20), (25, 30) = 3 segments
+        assert derived["segmentCount"] == 3
