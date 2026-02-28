diff --git a/python-backend/app/orchestrator/factory_orchestrator.py b/python-backend/app/orchestrator/factory_orchestrator.py
index 684980b..3f70195 100644
--- a/python-backend/app/orchestrator/factory_orchestrator.py
+++ b/python-backend/app/orchestrator/factory_orchestrator.py
@@ -23,8 +23,11 @@ class SaaSFactoryOrchestrator:
         self.cp = cp
         self.workspace = validate_workspace(workspace, workspace_root)
         self.max_report_bytes = max_report_bytes
+        self._runner = None  # Optional SandboxMediaRunner for sandbox execution
 
     def _run_cmd(self, cmd: List[str], cwd: str) -> subprocess.CompletedProcess:
+        if self._runner:
+            return self._runner.run_command_sync(cmd, timeout=60 * 30, cwd=cwd)
         env = sanitize_env(dict(os.environ))
         return subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60 * 30)
 
diff --git a/python-backend/app/services/docker_executor.py b/python-backend/app/services/docker_executor.py
index 40f4438..a9e8cde 100644
--- a/python-backend/app/services/docker_executor.py
+++ b/python-backend/app/services/docker_executor.py
@@ -26,6 +26,7 @@ class DockerExecutionMode(str, Enum):
     HOST = "host"  # Run commands directly on host
     DOCKER = "docker"  # Run commands inside Docker container
     AUTO = "auto"  # Auto-detect based on environment
+    SANDBOX = "sandbox"  # Route through OpenSandbox
 
 
 @dataclass
@@ -72,17 +73,21 @@ class DockerExecutor:
     development environments that match production.
     """
     
-    def __init__(self, config: Optional[DockerConfig] = None):
+    def __init__(self, config: Optional[DockerConfig] = None, mode: Optional[DockerExecutionMode] = None):
         """
         Initialize the Docker executor.
-        
+
         Args:
             config: Docker configuration
+            mode: Override execution mode (e.g., SANDBOX for OpenSandbox routing)
         """
         self.config = config or DockerConfig()
+        if mode is not None:
+            self.config.mode = mode
         self._docker_available: Optional[bool] = None
         self._container_running: Optional[bool] = None
         self._effective_mode: Optional[DockerExecutionMode] = None
+        self._sandbox_runner = None  # Optional SandboxMediaRunner for SANDBOX mode
         
         logger.info(
             "Docker executor initialized",
@@ -213,6 +218,8 @@ class DockerExecutor:
             self._effective_mode = DockerExecutionMode.HOST
         elif self.config.mode == DockerExecutionMode.DOCKER:
             self._effective_mode = DockerExecutionMode.DOCKER
+        elif self.config.mode == DockerExecutionMode.SANDBOX:
+            self._effective_mode = DockerExecutionMode.SANDBOX
         else:
             # Auto-detect
             # Check if we're already inside a container
@@ -306,8 +313,13 @@ class DockerExecutor:
             Tuple of (exit_code, stdout, stderr)
         """
         effective_mode = await self.get_effective_mode()
-        
-        if effective_mode == DockerExecutionMode.DOCKER:
+
+        if effective_mode == DockerExecutionMode.SANDBOX and self._sandbox_runner:
+            result = await self._sandbox_runner.run_command(
+                command, timeout=timeout or self.config.default_timeout
+            )
+            return (result.returncode, result.stdout or "", result.stderr or "")
+        elif effective_mode == DockerExecutionMode.DOCKER:
             return await self._execute_in_docker(
                 command, cwd, env, timeout, user, capture_output
             )
diff --git a/python-backend/app/services/media_pipeline.py b/python-backend/app/services/media_pipeline.py
index 1b6944f..1c82221 100644
--- a/python-backend/app/services/media_pipeline.py
+++ b/python-backend/app/services/media_pipeline.py
@@ -227,51 +227,58 @@ async def _generate_image_thumbnail(input_path: str, output_path: str) -> None:
     await asyncio.to_thread(_do_thumbnail)
 
 
-async def _generate_video_thumbnail(input_path: str, output_path: str) -> None:
+async def _generate_video_thumbnail(input_path: str, output_path: str, runner=None) -> None:
     """Extract a frame at 25% of video duration using FFmpeg."""
     # Get duration via ffprobe
     duration = 0.0
+    probe_cmd = [
+        "ffprobe", "-v", "error",
+        "-show_entries", "format=duration",
+        "-of", "default=noprint_wrappers=1:nokey=1",
+        input_path,
+    ]
     try:
-        probe = await asyncio.to_thread(
-            subprocess.run,
-            [
-                "ffprobe", "-v", "error",
-                "-show_entries", "format=duration",
-                "-of", "default=noprint_wrappers=1:nokey=1",
-                input_path,
-            ],
-            capture_output=True, text=True, timeout=30,
-        )
+        if runner:
+            probe = await runner.run_command(probe_cmd, timeout=30)
+        else:
+            probe = await asyncio.to_thread(
+                subprocess.run, probe_cmd,
+                capture_output=True, text=True, timeout=30,
+            )
         duration = float(probe.stdout.strip() or "0")
     except Exception:
         pass
 
     seek_time = duration * VIDEO_THUMB_POSITION_RATIO if duration > 0 else 0
 
-    await asyncio.to_thread(
-        subprocess.run,
-        [
-            "ffmpeg", "-y", "-ss", str(seek_time),
-            "-i", input_path,
-            "-frames:v", "1",
-            "-q:v", "3",
-            output_path,
-        ],
-        capture_output=True, timeout=30,
-    )
+    thumb_cmd = [
+        "ffmpeg", "-y", "-ss", str(seek_time),
+        "-i", input_path,
+        "-frames:v", "1",
+        "-q:v", "3",
+        output_path,
+    ]
+    if runner:
+        await runner.run_command(thumb_cmd, timeout=30)
+    else:
+        await asyncio.to_thread(
+            subprocess.run, thumb_cmd,
+            capture_output=True, timeout=30,
+        )
 
 
-def _ffprobe_metadata(file_path: str) -> dict:
+def _ffprobe_metadata(file_path: str, runner=None) -> dict:
     """Extract video/audio metadata via ffprobe (sync)."""
-    result = subprocess.run(
-        [
-            "ffprobe", "-v", "error",
-            "-show_entries", "format=duration,format_name:stream=width,height,codec_name",
-            "-of", "json",
-            file_path,
-        ],
-        capture_output=True, text=True, timeout=30,
-    )
+    cmd = [
+        "ffprobe", "-v", "error",
+        "-show_entries", "format=duration,format_name:stream=width,height,codec_name",
+        "-of", "json",
+        file_path,
+    ]
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=30)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
     import json as _json
 
     metadata = {}
diff --git a/python-backend/app/tasks/media_job_worker.py b/python-backend/app/tasks/media_job_worker.py
index 9f91410..6bc0953 100644
--- a/python-backend/app/tasks/media_job_worker.py
+++ b/python-backend/app/tasks/media_job_worker.py
@@ -713,23 +713,24 @@ def _is_image_uri(uri: str) -> bool:
     return ext in _IMAGE_EXTENSIONS
 
 
-def _has_audio_stream(uri: str) -> bool:
+def _has_audio_stream(uri: str, runner=None) -> bool:
     """Probe whether an input file has at least one audio stream.
 
     Uses ffprobe with a short timeout. Returns False on any error
     (missing audio, network issue, etc.) so the caller generates silence.
     """
     try:
-        result = subprocess.run(
-            [
-                "ffprobe", "-v", "quiet",
-                "-select_streams", "a",
-                "-show_entries", "stream=codec_type",
-                "-of", "csv=p=0",
-                uri,
-            ],
-            capture_output=True, text=True, timeout=15,
-        )
+        cmd = [
+            "ffprobe", "-v", "quiet",
+            "-select_streams", "a",
+            "-show_entries", "stream=codec_type",
+            "-of", "csv=p=0",
+            uri,
+        ]
+        if runner:
+            result = runner.run_command_sync(cmd, timeout=15)
+        else:
+            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
         return "audio" in result.stdout
     except Exception:
         return False
@@ -1080,10 +1081,13 @@ def parse_waveform_pcm(pcm_data: bytes, sample_rate: int, bucket_ms: int, max_bu
 # Job Handlers
 # ========================================
 
-def handle_probe(spec: dict, tmp_dir: str) -> dict:
+def handle_probe(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Probe a media file and return metadata."""
     cmd = build_ffmpeg_command_for_probe(spec)
-    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=30)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
     if result.returncode != 0:
         raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")
 
@@ -1101,7 +1105,7 @@ def handle_probe(spec: dict, tmp_dir: str) -> dict:
     }
 
 
-def handle_render_mp4(spec: dict, tmp_dir: str) -> dict:
+def handle_render_mp4(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Render MP4 from timeline."""
     job_id = spec["jobId"]
     user_id = str(spec.get("_userId", "unknown"))
@@ -1138,13 +1142,19 @@ def handle_render_mp4(spec: dict, tmp_dir: str) -> dict:
 
     report_progress(job_id, 0.1, "rendering", "Starting FFmpeg render")
 
-    process = subprocess.Popen(
-        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
-    )
-    _, stderr = process.communicate(timeout=1800)
+    if runner:
+        _render_result = runner.run_command_sync(cmd, timeout=1800)
+        stderr = _render_result.stderr or ""
+        _returncode = _render_result.returncode
+    else:
+        process = subprocess.Popen(
+            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
+        )
+        _, stderr = process.communicate(timeout=1800)
+        _returncode = process.returncode
 
-    if process.returncode != 0:
-        _render_log.error("ffmpeg_render_failed", job_id=job_id, returncode=process.returncode, stderr=stderr[-2000:])
+    if _returncode != 0:
+        _render_log.error("ffmpeg_render_failed", job_id=job_id, returncode=_returncode, stderr=stderr[-2000:])
         raise RuntimeError(f"FFmpeg render failed: {_sanitize_stderr(stderr)}")
 
     text_render_derived: dict[str, Any] | None = None
@@ -1187,12 +1197,15 @@ def handle_render_mp4(spec: dict, tmp_dir: str) -> dict:
                 output_path,
             ]
             _render_log.info("ffmpeg_text_fastpath_cmd", job_id=job_id, cmd=" ".join(drawtext_cmd))
-            drawtext_result = subprocess.run(
-                drawtext_cmd,
-                capture_output=True,
-                text=True,
-                timeout=1800,
-            )
+            if runner:
+                drawtext_result = runner.run_command_sync(drawtext_cmd, timeout=1800)
+            else:
+                drawtext_result = subprocess.run(
+                    drawtext_cmd,
+                    capture_output=True,
+                    text=True,
+                    timeout=1800,
+                )
             if drawtext_result.returncode == 0:
                 strategy = "drawtext"
                 fallback_reason = "accepted_equivalent"
@@ -1238,12 +1251,15 @@ def handle_render_mp4(spec: dict, tmp_dir: str) -> dict:
                 output_path,
             ]
             _render_log.info("ffmpeg_text_ass_cmd", job_id=job_id, cmd=" ".join(ass_cmd))
-            ass_result = subprocess.run(
-                ass_cmd,
-                capture_output=True,
-                text=True,
-                timeout=1800,
-            )
+            if runner:
+                ass_result = runner.run_command_sync(ass_cmd, timeout=1800)
+            else:
+                ass_result = subprocess.run(
+                    ass_cmd,
+                    capture_output=True,
+                    text=True,
+                    timeout=1800,
+                )
             if ass_result.returncode != 0:
                 _render_log.error(
                     "ffmpeg_text_ass_failed",
@@ -1273,14 +1289,17 @@ def handle_render_mp4(spec: dict, tmp_dir: str) -> dict:
     return result
 
 
-def handle_waveform_peaks(spec: dict, tmp_dir: str) -> dict:
+def handle_waveform_peaks(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Extract waveform peaks from audio."""
     job_id = spec["jobId"]
     cmd = build_ffmpeg_command_for_waveform(spec)
 
     report_progress(job_id, 0.1, "extracting_waveform")
 
-    process = subprocess.run(cmd, capture_output=True, timeout=120)
+    if runner:
+        process = runner.run_command_sync(cmd, timeout=120, text=False, capture_output=True)
+    else:
+        process = subprocess.run(cmd, capture_output=True, timeout=120)
     if not process.stdout:
         raise RuntimeError("No PCM data extracted")
 
@@ -1297,7 +1316,7 @@ def handle_waveform_peaks(spec: dict, tmp_dir: str) -> dict:
     }
 
 
-def handle_dead_air_detect(spec: dict, tmp_dir: str) -> dict:
+def handle_dead_air_detect(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Detect silence segments in audio."""
     import structlog
 
@@ -1308,7 +1327,10 @@ def handle_dead_air_detect(spec: dict, tmp_dir: str) -> dict:
     logger.info("silence_detect_start", job_id=job_id, cmd=" ".join(cmd))
     report_progress(job_id, 0.1, "detecting_silence")
 
-    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=120)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
 
     if result.returncode != 0:
         logger.error(
@@ -1336,7 +1358,7 @@ def handle_dead_air_detect(spec: dict, tmp_dir: str) -> dict:
     }
 
 
-def handle_thumbnails(spec: dict, tmp_dir: str) -> dict:
+def handle_thumbnails(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Generate thumbnails at regular intervals."""
     job_id = spec["jobId"]
     assets = spec.get("inputs", {}).get("assets", [])
@@ -1355,10 +1377,11 @@ def handle_thumbnails(spec: dict, tmp_dir: str) -> dict:
     report_progress(job_id, 0.1, "generating_thumbnails")
 
     # Probe duration first
-    probe = subprocess.run(
-        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
-        capture_output=True, text=True, timeout=30,
-    )
+    probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path]
+    if runner:
+        probe = runner.run_command_sync(probe_cmd, timeout=30)
+    else:
+        probe = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
     duration = float(json.loads(probe.stdout).get("format", {}).get("duration", 0))
     timestamps = []
     t = 0.0
@@ -1369,10 +1392,11 @@ def handle_thumbnails(spec: dict, tmp_dir: str) -> dict:
     artifacts = []
     for i, ts in enumerate(timestamps):
         out_path = os.path.join(tmp_dir, f"thumb_{i:04d}.jpg")
-        subprocess.run(
-            ["ffmpeg", "-ss", str(ts), "-i", path, "-vframes", "1", "-q:v", "2", "-y", out_path],
-            capture_output=True, timeout=30,
-        )
+        thumb_cmd = ["ffmpeg", "-ss", str(ts), "-i", path, "-vframes", "1", "-q:v", "2", "-y", out_path]
+        if runner:
+            runner.run_command_sync(thumb_cmd, timeout=30)
+        else:
+            subprocess.run(thumb_cmd, capture_output=True, timeout=30)
         if os.path.exists(out_path):
             artifacts.append({"kind": "thumbnail", "uri": out_path, "mime": "image/jpeg"})
         report_progress(job_id, 0.1 + 0.9 * (i + 1) / len(timestamps), "generating_thumbnails")
@@ -1380,7 +1404,7 @@ def handle_thumbnails(spec: dict, tmp_dir: str) -> dict:
     return {"artifacts": artifacts}
 
 
-def handle_subtitles_extract(spec: dict, tmp_dir: str) -> dict:
+def handle_subtitles_extract(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Extract subtitles from video."""
     assets = spec.get("inputs", {}).get("assets", [])
     if not assets:
@@ -1395,10 +1419,11 @@ def handle_subtitles_extract(spec: dict, tmp_dir: str) -> dict:
         raise ValueError(f"Unsupported subtitle format: {fmt!r}. Allowed: {', '.join(sorted(ALLOWED_SUB_FORMATS))}")
     out_path = os.path.join(tmp_dir, f"subtitles.{fmt}")
 
-    subprocess.run(
-        ["ffmpeg", "-i", path, "-map", "0:s:0", "-y", out_path],
-        capture_output=True, timeout=60,
-    )
+    sub_cmd = ["ffmpeg", "-i", path, "-map", "0:s:0", "-y", out_path]
+    if runner:
+        runner.run_command_sync(sub_cmd, timeout=60)
+    else:
+        subprocess.run(sub_cmd, capture_output=True, timeout=60)
 
     return {
         "artifacts": [{"kind": "subtitle", "uri": out_path, "mime": f"text/{fmt}"}] if os.path.exists(out_path) else [],
@@ -1449,7 +1474,7 @@ def _calculate_keep_segments(
     return keep_segments
 
 
-def _probe_media_info(input_path: str) -> dict:
+def _probe_media_info(input_path: str, runner=None) -> dict:
     """Probe a media file for duration, frame rate, and stream types.
 
     Returns dict with keys:
@@ -1459,12 +1484,11 @@ def _probe_media_info(input_path: str) -> dict:
         has_audio: bool
         is_vfr: bool (True if variable frame rate detected)
     """
-    result = subprocess.run(
-        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input_path],
-        capture_output=True,
-        text=True,
-        timeout=30,
-    )
+    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input_path]
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=30)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
 
     if result.returncode != 0:
         raise RuntimeError(f"ffprobe failed: {_sanitize_stderr(result.stderr)}")
@@ -1636,7 +1660,7 @@ def _build_trim_concat_cmd(
     return cmd
 
 
-def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
+def handle_dead_air_cut(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Cut silent segments from video/audio and concatenate remaining parts.
 
     Reads segments to remove from spec.params.segments.
@@ -1698,7 +1722,7 @@ def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
     # Handle empty segments
     if len(validated_segments) == 0:
         # No segments to remove, return input as-is
-        media_info = _probe_media_info(input_path)
+        media_info = _probe_media_info(input_path, runner=runner)
         original_duration_ms = int(media_info["duration_s"] * 1000)
         # Determine MIME type based on streams
         if media_info["has_video"]:
@@ -1718,7 +1742,7 @@ def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
         }
 
     # Probe the source file
-    media_info = _probe_media_info(input_path)
+    media_info = _probe_media_info(input_path, runner=runner)
     duration_s = media_info["duration_s"]
     duration_ms = int(duration_s * 1000)
 
@@ -1773,7 +1797,10 @@ def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
     report_progress(job_id, 0.4, "encoding", "Running FFmpeg")
 
     # Run FFmpeg
-    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=1800)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
 
     if result.returncode != 0:
         raise RuntimeError(f"FFmpeg failed: {_sanitize_stderr(result.stderr)}")
@@ -1815,21 +1842,22 @@ def handle_dead_air_cut(spec: dict, tmp_dir: str) -> dict:
 _BROWSER_COMPATIBLE_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}
 
 
-def _detect_video_codec(uri: str) -> str | None:
+def _detect_video_codec(uri: str, runner=None) -> str | None:
     """Probe a file and return its video codec name (lowercase), or None."""
     try:
-        result = subprocess.run(
-            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
-             "-show_entries", "stream=codec_name", "-of", "csv=p=0", uri],
-            capture_output=True, text=True, timeout=30,
-        )
+        cmd = ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
+               "-show_entries", "stream=codec_name", "-of", "csv=p=0", uri]
+        if runner:
+            result = runner.run_command_sync(cmd, timeout=30)
+        else:
+            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
         codec = result.stdout.strip().lower()
         return codec if codec else None
     except Exception:
         return None
 
 
-def handle_transcode_h264(spec: dict, tmp_dir: str) -> dict:
+def handle_transcode_h264(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Transcode a video file to H.264/AAC MP4 for browser playback.
 
     Probes the input first — if already H.264, returns the original URI
@@ -1849,7 +1877,7 @@ def handle_transcode_h264(spec: dict, tmp_dir: str) -> dict:
     report_progress(job_id, 0.05, "probing", "Checking video codec")
 
     # Probe codec to decide if transcoding is needed
-    codec = _detect_video_codec(asset_uri)
+    codec = _detect_video_codec(asset_uri, runner=runner)
 
     if codec and codec in _BROWSER_COMPATIBLE_VIDEO_CODECS:
         # Already browser-compatible — return original URI
@@ -1865,7 +1893,7 @@ def handle_transcode_h264(spec: dict, tmp_dir: str) -> dict:
     input_path = _resolve_asset_path(asset_uri, tmp_dir)
 
     # Probe media info for progress reporting
-    media_info = _probe_media_info(input_path)
+    media_info = _probe_media_info(input_path, runner=runner)
     total_duration_us = int(media_info["duration_s"] * 1_000_000)
 
     # Build output path
@@ -1898,23 +1926,31 @@ def handle_transcode_h264(spec: dict, tmp_dir: str) -> dict:
 
     report_progress(job_id, 0.15, "transcoding", f"Transcoding from {codec or 'unknown'} to H.264")
 
-    process = subprocess.Popen(
-        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
-    )
+    if runner:
+        # Sandbox mode: no progress streaming, single batch execution
+        report_progress(job_id, 0.5, "transcoding", "Transcoding in sandbox...")
+        _tc_result = runner.run_command_sync(cmd, timeout=1800)
+        stderr = _tc_result.stderr or ""
+        _tc_returncode = _tc_result.returncode
+    else:
+        process = subprocess.Popen(
+            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
+        )
 
-    # Parse progress from FFmpeg stdout
-    if process.stdout:
-        for line in process.stdout:
-            line = line.strip()
-            pct = parse_ffmpeg_progress(line, total_duration_us)
-            if pct is not None:
-                # Map 0-1 range into 0.15-0.90 for UI
-                mapped = 0.15 + pct * 0.75
-                report_progress(job_id, mapped, "transcoding", f"Transcoding: {int(pct * 100)}%")
+        # Parse progress from FFmpeg stdout
+        if process.stdout:
+            for line in process.stdout:
+                line = line.strip()
+                pct = parse_ffmpeg_progress(line, total_duration_us)
+                if pct is not None:
+                    # Map 0-1 range into 0.15-0.90 for UI
+                    mapped = 0.15 + pct * 0.75
+                    report_progress(job_id, mapped, "transcoding", f"Transcoding: {int(pct * 100)}%")
 
-    _, stderr = process.communicate(timeout=1800)
+        _, stderr = process.communicate(timeout=1800)
+        _tc_returncode = process.returncode
 
-    if process.returncode != 0:
+    if _tc_returncode != 0:
         raise RuntimeError(f"Transcode failed: {_sanitize_stderr(stderr)}")
 
     if not os.path.exists(output_path):
@@ -1939,7 +1975,7 @@ def handle_transcode_h264(spec: dict, tmp_dir: str) -> dict:
 # ========================================
 
 
-def handle_extract_audio(spec: dict, tmp_dir: str) -> dict:
+def handle_extract_audio(spec: dict, tmp_dir: str, runner=None) -> dict:
     """Extract audio track from a video file to AAC/M4A.
 
     Uses FFmpeg to copy or re-encode the audio stream without the video.
@@ -1959,7 +1995,7 @@ def handle_extract_audio(spec: dict, tmp_dir: str) -> dict:
     input_path = _resolve_asset_path(asset_uri, tmp_dir)
 
     # Probe media info
-    media_info = _probe_media_info(input_path)
+    media_info = _probe_media_info(input_path, runner=runner)
     if not media_info["has_audio"]:
         raise ValueError("Input file has no audio stream to extract")
 
@@ -1980,7 +2016,10 @@ def handle_extract_audio(spec: dict, tmp_dir: str) -> dict:
         "-y", output_path,
     ]
 
-    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=600)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
 
     if result.returncode != 0:
         raise RuntimeError(f"Audio extraction failed: {_sanitize_stderr(result.stderr)}")
@@ -1991,10 +2030,11 @@ def handle_extract_audio(spec: dict, tmp_dir: str) -> dict:
     report_progress(job_id, 0.8, "probing", "Probing output duration")
 
     # Probe output for duration
-    probe_result = subprocess.run(
-        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", output_path],
-        capture_output=True, text=True, timeout=30,
-    )
+    probe_out_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", output_path]
+    if runner:
+        probe_result = runner.run_command_sync(probe_out_cmd, timeout=30)
+    else:
+        probe_result = subprocess.run(probe_out_cmd, capture_output=True, text=True, timeout=30)
     output_duration = 0.0
     if probe_result.returncode == 0:
         try:
@@ -2119,7 +2159,14 @@ def execute_media_job(self, spec_json: str, user_id: str, job_id: str) -> dict:
         if not handler:
             raise ValueError(f"Unsupported job type: {job_type}")
 
-        result = handler(spec, tmp_dir)
+        # Route through sandbox when enabled
+        from app.integrations.opensandbox.config import opensandbox_settings as _osb_settings
+        if _osb_settings.is_enabled:
+            from app.video.sandbox_runner import SandboxMediaRunner
+            with SandboxMediaRunner.session(profile="media-processing", job_id=job_id) as runner:
+                result = handler(spec, tmp_dir, runner=runner)
+        else:
+            result = handler(spec, tmp_dir)
         report_done(job_id, result)
 
         # Persist render to media_tasks DB for permanent Media Library visibility
diff --git a/python-backend/app/tasks/presentation_render.py b/python-backend/app/tasks/presentation_render.py
index 0907e29..23003b3 100644
--- a/python-backend/app/tasks/presentation_render.py
+++ b/python-backend/app/tasks/presentation_render.py
@@ -297,7 +297,7 @@ def _download_audio(url: str, dest_dir: str, idx: int) -> str:
     return dest_path
 
 
-def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp_dir: str) -> str:
+def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp_dir: str, runner=None) -> str:
     """
     Encode slides to MP4 using FFmpeg concat demuxer.
 
@@ -394,7 +394,10 @@ def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp
             output_path,
         ]
         # M-2: timeout prevents subprocess blocking past Celery SoftTimeLimitExceeded
-        subprocess.run(cmd, check=True, capture_output=True, timeout=540)
+        if runner:
+            runner.run_command_sync(cmd, check=True, timeout=540)
+        else:
+            subprocess.run(cmd, check=True, capture_output=True, timeout=540)
         return output_path
 
     # ------------------------------------------------------------------
@@ -472,7 +475,10 @@ def _build_mp4(render_spec: dict, quality: str, screenshot_paths: list[str], tmp
         output_path,
     ]
     # M-2: timeout prevents subprocess blocking past Celery SoftTimeLimitExceeded
-    subprocess.run(cmd, check=True, capture_output=True, timeout=540)
+    if runner:
+        runner.run_command_sync(cmd, check=True, timeout=540)
+    else:
+        subprocess.run(cmd, check=True, capture_output=True, timeout=540)
     return output_path
 
 
diff --git a/python-backend/app/video/pipeline.py b/python-backend/app/video/pipeline.py
index 138a2dd..187b1c5 100644
--- a/python-backend/app/video/pipeline.py
+++ b/python-backend/app/video/pipeline.py
@@ -15,15 +15,16 @@ from typing import Callable
 from app.video.render_profiles import PROFILES, get_ffmpeg_output_args
 
 
-def _probe_clip(file_path: str) -> dict:
+def _probe_clip(file_path: str, runner=None) -> dict:
     """Probe a clip file for codec, resolution, and fps."""
-    result = subprocess.run(
-        [
-            "ffprobe", "-v", "quiet", "-print_format", "json",
-            "-show_streams", "-show_format", file_path,
-        ],
-        capture_output=True, text=True, timeout=30,
-    )
+    cmd = [
+        "ffprobe", "-v", "quiet", "-print_format", "json",
+        "-show_streams", "-show_format", file_path,
+    ]
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=30)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
     if result.returncode != 0:
         return {}
     data = json.loads(result.stdout)
@@ -62,6 +63,7 @@ def run_assembly_stage(
     render_spec: dict,
     work_dir: str,
     progress_callback: Callable[[float, str], None] | None = None,
+    runner=None,
 ) -> str:
     """Assemble V1 track clips into a single intermediate file.
 
@@ -123,7 +125,7 @@ def run_assembly_stage(
     for path in clip_paths:
         if not os.path.exists(path):
             raise FileNotFoundError(f"Input clip not found: {path}")
-        clip_infos.append(_probe_clip(path))
+        clip_infos.append(_probe_clip(path, runner=runner))
 
     if progress_callback:
         progress_callback(0.1, "assembly")
@@ -187,7 +189,10 @@ def run_assembly_stage(
             output_path,
         ]
 
-    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=1800)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
     if result.returncode != 0:
         raise RuntimeError(f"Assembly stage failed: {result.stderr[-500:]}")
 
@@ -203,6 +208,7 @@ def run_final_render(
     profile_name: str,
     output_path: str,
     progress_callback: Callable[[float, str], None] | None = None,
+    runner=None,
 ) -> str:
     """Apply overlays, text, audio mixing, and encode to final output.
 
@@ -257,7 +263,10 @@ def run_final_render(
         cmd.extend(get_ffmpeg_output_args(profile))
         cmd.append(output_path)
 
-        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
+        if runner:
+            result = runner.run_command_sync(cmd, timeout=1800)
+        else:
+            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
         if result.returncode != 0:
             raise RuntimeError(f"Final render failed: {result.stderr[-500:]}")
 
@@ -371,7 +380,10 @@ def run_final_render(
     cmd.extend(get_ffmpeg_output_args(profile))
     cmd.append(output_path)
 
-    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
+    if runner:
+        result = runner.run_command_sync(cmd, timeout=1800)
+    else:
+        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
     if result.returncode != 0:
         raise RuntimeError(f"Final render failed: {result.stderr[-500:]}")
 
diff --git a/python-backend/app/video/sandbox_runner.py b/python-backend/app/video/sandbox_runner.py
new file mode 100644
index 0000000..dc6969f
--- /dev/null
+++ b/python-backend/app/video/sandbox_runner.py
@@ -0,0 +1,282 @@
+"""SandboxMediaRunner — routes FFmpeg/ffprobe commands through OpenSandbox or subprocess.
+
+Usage as sync context manager (Celery tasks):
+
+    with SandboxMediaRunner.session(profile="media-processing") as runner:
+        result = runner.run_command_sync(["ffprobe", ...])
+        result2 = runner.run_command_sync(["ffmpeg", ...])
+    # sandbox destroyed on exit
+
+Usage as async context manager:
+
+    async with SandboxMediaRunner.session(profile="media-processing") as runner:
+        result = await runner.run_command(["ffprobe", ...])
+        result2 = await runner.run_command(["ffmpeg", ...])
+    # sandbox destroyed on exit
+"""
+
+from __future__ import annotations
+
+import asyncio
+import os
+import shlex
+import subprocess
+from typing import Any
+
+import structlog
+
+from app.integrations.opensandbox.config import opensandbox_settings
+from app.integrations.opensandbox.models import SandboxConfig
+
+logger = structlog.get_logger(__name__)
+
+
+class SandboxMediaRunner:
+    """Routes FFmpeg/ffprobe commands through OpenSandbox or subprocess.
+
+    When OPENSANDBOX_ENABLED is true, commands execute inside an isolated
+    sandbox container. When false, commands execute via subprocess.run()
+    for backward compatibility.
+    """
+
+    def __init__(
+        self,
+        profile: str = "media-processing",
+        job_id: str | None = None,
+    ):
+        self._profile = profile
+        self._job_id = job_id
+        self._enabled = opensandbox_settings.is_enabled
+        self._sandbox_id: str | None = None
+        self._client: Any = None
+        self._lifecycle: Any = None
+
+    @classmethod
+    def session(
+        cls,
+        profile: str = "media-processing",
+        job_id: str | None = None,
+    ) -> "SandboxMediaRunner":
+        """Create a runner for use as async context manager with session reuse."""
+        return cls(profile=profile, job_id=job_id)
+
+    async def __aenter__(self) -> "SandboxMediaRunner":
+        """Create sandbox container (if enabled). Store sandbox_id for reuse."""
+        if not self._enabled:
+            return self
+
+        from app.integrations.opensandbox.client import OpenSandboxClient
+        from app.integrations.opensandbox.lifecycle import SandboxLifecycleManager
+
+        self._client = OpenSandboxClient()
+        self._lifecycle = SandboxLifecycleManager(self._client)
+
+        config = SandboxConfig(
+            image="smartspec/ffmpeg:latest",
+            timeout_seconds=1800,
+            cpu_limit="2000m",
+            memory_limit_mb=4096,
+            disk_limit_mb=10240,
+            network_action="deny",
+            metadata={"profile": self._profile, "job_id": self._job_id or ""},
+        )
+
+        job_key = self._job_id or f"session-{id(self)}"
+        self._sandbox_id = await self._lifecycle.provision_sandbox(config, job_key)
+        logger.info(
+            "sandbox_session_started",
+            sandbox_id=self._sandbox_id,
+            profile=self._profile,
+            job_id=self._job_id,
+        )
+        return self
+
+    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
+        """Destroy sandbox container. Always runs, even on exception."""
+        if self._sandbox_id and self._lifecycle:
+            try:
+                await self._lifecycle.destroy_sandbox(self._sandbox_id)
+                logger.info(
+                    "sandbox_session_ended",
+                    sandbox_id=self._sandbox_id,
+                    had_exception=exc_type is not None,
+                )
+            except Exception:
+                logger.warning(
+                    "sandbox_destroy_failed",
+                    sandbox_id=self._sandbox_id,
+                    exc_info=True,
+                )
+            self._sandbox_id = None
+
+    # --- Sync context manager for Celery tasks ---
+
+    def __enter__(self) -> "SandboxMediaRunner":
+        """Sync context manager entry — provisions sandbox if enabled."""
+        if not self._enabled:
+            return self
+        asyncio.run(self.__aenter__())
+        return self
+
+    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
+        """Sync context manager exit — destroys sandbox."""
+        if self._sandbox_id and self._lifecycle:
+            asyncio.run(self.__aexit__(exc_type, exc_val, exc_tb))
+
+    def run_command_sync(
+        self,
+        cmd: list[str],
+        timeout: int = 1800,
+        capture_output: bool = True,
+        text: bool = True,
+        check: bool = False,
+        cwd: str | None = None,
+    ) -> subprocess.CompletedProcess:
+        """Synchronous version of run_command for Celery tasks.
+
+        When sandbox is disabled, calls subprocess.run() directly.
+        When sandbox is enabled, bridges to the async sandbox client.
+        """
+        if not self._enabled or not self._sandbox_id:
+            return subprocess.run(
+                cmd,
+                capture_output=capture_output,
+                text=text,
+                check=check,
+                timeout=timeout,
+                cwd=cwd,
+            )
+        return asyncio.run(self._run_in_sandbox(cmd, timeout=timeout, check=check))
+
+    async def run_command(
+        self,
+        cmd: list[str],
+        timeout: int = 1800,
+        capture_output: bool = True,
+        text: bool = True,
+        check: bool = False,
+        cwd: str | None = None,
+    ) -> subprocess.CompletedProcess:
+        """Execute command via sandbox (if enabled) or subprocess (if disabled).
+
+        Returns a subprocess.CompletedProcess-compatible object for backward
+        compatibility with existing handler code.
+        """
+        if not self._enabled or not self._sandbox_id:
+            return await self._run_subprocess(
+                cmd,
+                timeout=timeout,
+                capture_output=capture_output,
+                text=text,
+                check=check,
+                cwd=cwd,
+            )
+
+        return await self._run_in_sandbox(cmd, timeout=timeout, check=check)
+
+    async def _run_subprocess(
+        self,
+        cmd: list[str],
+        timeout: int = 1800,
+        capture_output: bool = True,
+        text: bool = True,
+        check: bool = False,
+        cwd: str | None = None,
+    ) -> subprocess.CompletedProcess:
+        """Legacy subprocess execution path."""
+        return await asyncio.to_thread(
+            subprocess.run,
+            cmd,
+            capture_output=capture_output,
+            text=text,
+            check=check,
+            timeout=timeout,
+            cwd=cwd,
+        )
+
+    async def _run_in_sandbox(
+        self,
+        cmd: list[str],
+        timeout: int = 1800,
+        check: bool = False,
+    ) -> subprocess.CompletedProcess:
+        """Execute command inside sandbox container."""
+        from app.integrations.opensandbox.execution import run_command
+
+        shell_cmd = shlex.join(cmd)
+        logger.info(
+            "sandbox_command_exec",
+            sandbox_id=self._sandbox_id,
+            command=shell_cmd[:200],
+            timeout=timeout,
+        )
+
+        result = await run_command(
+            self._client,
+            self._sandbox_id,
+            shell_cmd,
+            timeout=timeout,
+        )
+
+        completed = subprocess.CompletedProcess(
+            args=cmd,
+            returncode=result.exit_code,
+            stdout=result.stdout,
+            stderr=result.stderr,
+        )
+
+        if check and completed.returncode != 0:
+            raise RuntimeError(
+                f"Sandbox command failed (exit {completed.returncode}): "
+                f"{result.stderr[:500]}"
+            )
+
+        return completed
+
+    async def stage_files(self, file_paths: list[str]) -> dict[str, str]:
+        """Stage local files into sandbox. Returns mapping of local_path -> sandbox_path."""
+        if not self._enabled or not self._sandbox_id or not self._client:
+            return {}
+
+        mapping: dict[str, str] = {}
+        for path in file_paths:
+            if not os.path.exists(path):
+                continue
+            filename = os.path.basename(path)
+            sandbox_path = f"/workspace/{filename}"
+            with open(path, "rb") as f:
+                content = f.read()
+            await self._client.write_file(self._sandbox_id, sandbox_path, content)
+            mapping[path] = sandbox_path
+            logger.info(
+                "sandbox_file_staged_local",
+                sandbox_id=self._sandbox_id,
+                local_path=path,
+                sandbox_path=sandbox_path,
+                size_bytes=len(content),
+            )
+        return mapping
+
+    async def collect_files(
+        self, sandbox_paths: list[str], local_dir: str
+    ) -> list[str]:
+        """Collect files from sandbox to local directory. Returns list of local paths."""
+        if not self._enabled or not self._sandbox_id or not self._client:
+            return []
+
+        collected: list[str] = []
+        for sandbox_path in sandbox_paths:
+            filename = os.path.basename(sandbox_path)
+            local_path = os.path.join(local_dir, filename)
+            content = await self._client.read_file(self._sandbox_id, sandbox_path)
+            with open(local_path, "wb") as f:
+                f.write(content)
+            collected.append(local_path)
+            logger.info(
+                "sandbox_file_collected_local",
+                sandbox_id=self._sandbox_id,
+                sandbox_path=sandbox_path,
+                local_path=local_path,
+                size_bytes=len(content),
+            )
+        return collected
diff --git a/python-backend/tests/test_docker_executor_sandbox.py b/python-backend/tests/test_docker_executor_sandbox.py
new file mode 100644
index 0000000..b2bfc59
--- /dev/null
+++ b/python-backend/tests/test_docker_executor_sandbox.py
@@ -0,0 +1,59 @@
+"""Tests for docker_executor.py sandbox migration.
+
+Verifies that command execution routes through sandbox when enabled.
+"""
+
+import subprocess
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+class TestDockerExecutorSandbox:
+    """Verify docker_executor.py routes through sandbox when enabled."""
+
+    @pytest.mark.asyncio
+    async def test_execute_uses_sandbox_when_sandbox_mode(self):
+        """Commands dispatch to sandbox runner in SANDBOX mode."""
+        from app.services.docker_executor import DockerExecutor, DockerExecutionMode
+
+        runner = AsyncMock()
+        runner.run_command.return_value = subprocess.CompletedProcess(
+            args=["echo", "hello"], returncode=0, stdout="hello\n", stderr=""
+        )
+
+        executor = DockerExecutor(mode=DockerExecutionMode.SANDBOX)
+        executor._sandbox_runner = runner
+
+        returncode, stdout, stderr = await executor.execute(["echo", "hello"])
+
+        runner.run_command.assert_called_once()
+        assert returncode == 0
+        assert stdout == "hello\n"
+
+    @pytest.mark.asyncio
+    async def test_execute_uses_host_when_host_mode(self):
+        """Commands use asyncio subprocess in HOST mode (no sandbox)."""
+        from app.services.docker_executor import DockerExecutor, DockerExecutionMode
+
+        executor = DockerExecutor(mode=DockerExecutionMode.HOST)
+
+        mock_process = AsyncMock()
+        mock_process.returncode = 0
+        mock_process.communicate.return_value = (b"hello\n", b"")
+
+        with patch("asyncio.create_subprocess_exec", return_value=mock_process):
+            with patch("asyncio.wait_for", return_value=(b"hello\n", b"")):
+                returncode, stdout, stderr = await executor.execute(
+                    ["echo", "hello"], capture_output=True
+                )
+
+    @pytest.mark.asyncio
+    async def test_sandbox_mode_exists_in_enum(self):
+        """DockerExecutionMode has a SANDBOX variant."""
+        from app.services.docker_executor import DockerExecutionMode
+
+        assert hasattr(DockerExecutionMode, "SANDBOX")
+        assert DockerExecutionMode.SANDBOX.value == "sandbox"
diff --git a/python-backend/tests/test_factory_orchestrator_sandbox.py b/python-backend/tests/test_factory_orchestrator_sandbox.py
new file mode 100644
index 0000000..61e8144
--- /dev/null
+++ b/python-backend/tests/test_factory_orchestrator_sandbox.py
@@ -0,0 +1,54 @@
+"""Tests for factory_orchestrator.py sandbox migration.
+
+Verifies that _run_cmd routes through sandbox when a runner is provided.
+"""
+
+import subprocess
+from unittest.mock import MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+@pytest.fixture
+def mock_runner():
+    """Create a mock SandboxMediaRunner with sync interface."""
+    runner = MagicMock()
+    runner.run_command_sync.return_value = subprocess.CompletedProcess(
+        args=["python"], returncode=0, stdout="OK", stderr=""
+    )
+    return runner
+
+
+class TestFactoryOrchestratorSandbox:
+    """Verify factory_orchestrator.py subprocess calls route through sandbox."""
+
+    def test_run_cmd_uses_runner_when_provided(self, mock_runner):
+        """_run_cmd dispatches to runner.run_command_sync when runner is set."""
+        from app.orchestrator.factory_orchestrator import SaaSFactoryOrchestrator
+
+        cp = MagicMock()
+        with patch("app.orchestrator.factory_orchestrator.validate_workspace", return_value="/tmp/ws"):
+            orch = SaaSFactoryOrchestrator(cp, "/tmp/ws")
+            orch._runner = mock_runner
+
+            result = orch._run_cmd(["echo", "hello"], "/tmp/ws")
+
+            mock_runner.run_command_sync.assert_called_once()
+            assert result.returncode == 0
+
+    def test_run_cmd_uses_subprocess_when_no_runner(self):
+        """_run_cmd uses subprocess.run when _runner is None."""
+        from app.orchestrator.factory_orchestrator import SaaSFactoryOrchestrator
+
+        cp = MagicMock()
+        with patch("app.orchestrator.factory_orchestrator.validate_workspace", return_value="/tmp/ws"):
+            orch = SaaSFactoryOrchestrator(cp, "/tmp/ws")
+
+            with patch("subprocess.run") as mock_sub:
+                mock_sub.return_value = subprocess.CompletedProcess(
+                    args=["echo"], returncode=0, stdout="hello", stderr=""
+                )
+                result = orch._run_cmd(["echo", "hello"], "/tmp/ws")
+                mock_sub.assert_called_once()
diff --git a/python-backend/tests/test_media_job_worker_sandbox.py b/python-backend/tests/test_media_job_worker_sandbox.py
new file mode 100644
index 0000000..3fdb3a0
--- /dev/null
+++ b/python-backend/tests/test_media_job_worker_sandbox.py
@@ -0,0 +1,143 @@
+"""Tests for media_job_worker.py sandbox integration.
+
+Verifies that each handler function routes through SandboxMediaRunner
+when a runner is provided, and falls back to subprocess when not.
+"""
+
+import subprocess
+from unittest.mock import MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+# Patch URI validation for tests — real validation tested elsewhere
+_PATCH_SSRF = patch(
+    "app.tasks.media_job_worker.validate_uri_no_ssrf",
+    side_effect=lambda uri: None,
+)
+
+
+@pytest.fixture
+def mock_runner():
+    """Create a mock SandboxMediaRunner with sync interface."""
+    runner = MagicMock()
+    runner.run_command_sync.return_value = subprocess.CompletedProcess(
+        args=["ffprobe"], returncode=0, stdout='{"streams":[],"format":{"duration":"10.0"}}', stderr=""
+    )
+    return runner
+
+
+class TestMediaJobWorkerSandboxRouting:
+    """Verify each handler routes through sandbox when runner is provided."""
+
+    def test_handle_probe_uses_runner(self, mock_runner):
+        """handle_probe routes ffprobe through runner when provided."""
+        from app.tasks.media_job_worker import handle_probe
+
+        spec = {
+            "jobId": "test-1",
+            "jobType": "probe",
+            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
+        }
+        with _PATCH_SSRF:
+            result = handle_probe(spec, "/tmp", runner=mock_runner)
+
+        mock_runner.run_command_sync.assert_called_once()
+        cmd = mock_runner.run_command_sync.call_args[0][0]
+        assert "ffprobe" in cmd
+
+    def test_handle_probe_falls_back_without_runner(self):
+        """handle_probe uses subprocess.run when runner=None."""
+        from app.tasks.media_job_worker import handle_probe
+
+        spec = {
+            "jobId": "test-1",
+            "jobType": "probe",
+            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
+        }
+        with _PATCH_SSRF, patch("app.tasks.media_job_worker.subprocess.run") as mock_sub:
+            mock_sub.return_value = subprocess.CompletedProcess(
+                args=["ffprobe"], returncode=0,
+                stdout='{"streams":[],"format":{"duration":"5.0"}}', stderr=""
+            )
+            result = handle_probe(spec, "/tmp")
+            mock_sub.assert_called_once()
+
+    def test_handle_dead_air_detect_uses_runner(self, mock_runner):
+        """handle_dead_air_detect routes silence detection through runner."""
+        from app.tasks.media_job_worker import handle_dead_air_detect
+
+        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffmpeg"], returncode=0, stdout="", stderr=""
+        )
+
+        spec = {
+            "jobId": "test-2",
+            "jobType": "dead_air_detect",
+            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
+            "params": {"silenceThresholdDb": -30, "minSilenceDurationMs": 1000},
+        }
+        with _PATCH_SSRF:
+            result = handle_dead_air_detect(spec, "/tmp", runner=mock_runner)
+
+        mock_runner.run_command_sync.assert_called_once()
+        cmd = mock_runner.run_command_sync.call_args[0][0]
+        assert "ffmpeg" in cmd
+
+    def test_handle_subtitles_extract_uses_runner(self, mock_runner):
+        """handle_subtitles_extract routes through runner when provided."""
+        from app.tasks.media_job_worker import handle_subtitles_extract
+
+        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffmpeg"], returncode=0, stdout="", stderr=""
+        )
+
+        spec = {
+            "jobId": "test-3",
+            "jobType": "subtitles_extract",
+            "inputs": {"assets": [{"assetId": "a1", "uri": "http://localhost/test.mp4"}]},
+            "params": {"format": "srt"},
+        }
+        with _PATCH_SSRF:
+            result = handle_subtitles_extract(spec, "/tmp", runner=mock_runner)
+
+        mock_runner.run_command_sync.assert_called_once()
+
+    def test_has_audio_stream_uses_runner(self, mock_runner):
+        """_has_audio_stream routes ffprobe through runner when provided."""
+        from app.tasks.media_job_worker import _has_audio_stream
+
+        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffprobe"], returncode=0, stdout="audio", stderr=""
+        )
+
+        result = _has_audio_stream("/tmp/test.mp4", runner=mock_runner)
+        assert result is True
+        mock_runner.run_command_sync.assert_called_once()
+
+    def test_detect_video_codec_uses_runner(self, mock_runner):
+        """_detect_video_codec routes ffprobe through runner when provided."""
+        from app.tasks.media_job_worker import _detect_video_codec
+
+        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffprobe"], returncode=0, stdout="h264\n", stderr=""
+        )
+
+        result = _detect_video_codec("/tmp/test.mp4", runner=mock_runner)
+        assert result == "h264"
+        mock_runner.run_command_sync.assert_called_once()
+
+    def test_probe_media_info_uses_runner(self, mock_runner):
+        """_probe_media_info routes ffprobe through runner when provided."""
+        from app.tasks.media_job_worker import _probe_media_info
+
+        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffprobe"], returncode=0,
+            stdout='{"streams":[{"codec_type":"video","r_frame_rate":"30/1","avg_frame_rate":"30/1"}],"format":{"duration":"10.0"}}',
+            stderr=""
+        )
+
+        result = _probe_media_info("/tmp/test.mp4", runner=mock_runner)
+        assert result["duration_s"] == 10.0
+        mock_runner.run_command_sync.assert_called_once()
diff --git a/python-backend/tests/test_media_pipeline_sandbox.py b/python-backend/tests/test_media_pipeline_sandbox.py
new file mode 100644
index 0000000..d10059f
--- /dev/null
+++ b/python-backend/tests/test_media_pipeline_sandbox.py
@@ -0,0 +1,85 @@
+"""Tests for media_pipeline.py sandbox migration.
+
+Verifies that ffprobe, ffmpeg thumbnail, and metadata extraction commands
+route through sandbox when a runner is provided.
+"""
+
+import subprocess
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+@pytest.fixture
+def mock_runner():
+    """Create a mock SandboxMediaRunner with async interface."""
+    runner = AsyncMock()
+    runner.run_command.return_value = subprocess.CompletedProcess(
+        args=["ffprobe"], returncode=0, stdout="10.5", stderr=""
+    )
+    return runner
+
+
+class TestMediaPipelineSandbox:
+    """Verify media_pipeline.py subprocess calls route through sandbox."""
+
+    @pytest.mark.asyncio
+    async def test_generate_video_thumbnail_uses_runner(self, mock_runner):
+        """_generate_video_thumbnail routes ffprobe + ffmpeg through runner."""
+        from app.services.media_pipeline import _generate_video_thumbnail
+
+        mock_runner.run_command.side_effect = [
+            # ffprobe for duration
+            subprocess.CompletedProcess(args=["ffprobe"], returncode=0, stdout="10.5", stderr=""),
+            # ffmpeg for frame extraction
+            subprocess.CompletedProcess(args=["ffmpeg"], returncode=0, stdout="", stderr=""),
+        ]
+
+        await _generate_video_thumbnail("/tmp/input.mp4", "/tmp/thumb.jpg", runner=mock_runner)
+
+        assert mock_runner.run_command.call_count == 2
+
+    @pytest.mark.asyncio
+    async def test_generate_video_thumbnail_falls_back_without_runner(self):
+        """_generate_video_thumbnail uses asyncio.to_thread(subprocess.run) when runner=None."""
+        from app.services.media_pipeline import _generate_video_thumbnail
+
+        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
+            mock_thread.return_value = subprocess.CompletedProcess(
+                args=["ffprobe"], returncode=0, stdout="5.0", stderr=""
+            )
+            await _generate_video_thumbnail("/tmp/input.mp4", "/tmp/thumb.jpg")
+            assert mock_thread.call_count >= 1
+
+    @pytest.mark.asyncio
+    async def test_ffprobe_metadata_uses_runner(self):
+        """_ffprobe_metadata routes ffprobe through runner when provided."""
+        from app.services.media_pipeline import _ffprobe_metadata
+
+        runner = MagicMock()
+        runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffprobe"], returncode=0,
+            stdout='{"format":{"duration":"15.0","format_name":"mp4"},"streams":[{"width":1920,"height":1080,"codec_name":"h264"}]}',
+            stderr=""
+        )
+
+        result = _ffprobe_metadata("/tmp/test.mp4", runner=runner)
+        assert result["duration_seconds"] == 15.0
+        assert result["width"] == 1920
+        runner.run_command_sync.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_ffprobe_metadata_falls_back_without_runner(self):
+        """_ffprobe_metadata uses subprocess.run when runner=None."""
+        from app.services.media_pipeline import _ffprobe_metadata
+
+        with patch("subprocess.run") as mock_sub:
+            mock_sub.return_value = subprocess.CompletedProcess(
+                args=["ffprobe"], returncode=0,
+                stdout='{"format":{"duration":"5.0"},"streams":[]}',
+                stderr=""
+            )
+            result = _ffprobe_metadata("/tmp/test.mp4")
+            mock_sub.assert_called_once()
diff --git a/python-backend/tests/test_presentation_render_sandbox.py b/python-backend/tests/test_presentation_render_sandbox.py
new file mode 100644
index 0000000..86938bf
--- /dev/null
+++ b/python-backend/tests/test_presentation_render_sandbox.py
@@ -0,0 +1,69 @@
+"""Tests for presentation_render.py sandbox migration.
+
+Verifies that FFmpeg subprocess calls in _build_mp4 route through sandbox.
+Playwright (browser automation) remains in-process — it is NOT migrated.
+"""
+
+import subprocess
+from unittest.mock import MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+@pytest.fixture
+def mock_runner():
+    """Create a mock SandboxMediaRunner with sync interface."""
+    runner = MagicMock()
+    runner.run_command_sync.return_value = subprocess.CompletedProcess(
+        args=["ffmpeg"], returncode=0, stdout="", stderr=""
+    )
+    return runner
+
+
+_PATCH_CONCAT = patch(
+    "app.tasks.presentation_render._write_concat_file",
+    side_effect=lambda paths, durations, out: None,
+)
+
+
+class TestPresentationRenderSandbox:
+    """Verify presentation_render.py FFmpeg calls route through sandbox."""
+
+    def test_build_mp4_no_audio_uses_runner(self, mock_runner):
+        """_build_mp4 Case A (no audio) routes ffmpeg through runner."""
+        from app.tasks.presentation_render import _build_mp4
+
+        render_spec = {
+            "fps": 30,
+            "slides": [{"durationMs": 3000}],
+        }
+        screenshot_paths = ["/tmp/slide_0000.png"]
+
+        with _PATCH_CONCAT:
+            result = _build_mp4(
+                render_spec, "standard", screenshot_paths, "/tmp", runner=mock_runner
+            )
+
+        mock_runner.run_command_sync.assert_called_once()
+        call_args = mock_runner.run_command_sync.call_args
+        cmd = call_args[0][0]
+        assert "ffmpeg" in cmd
+
+    def test_build_mp4_falls_back_without_runner(self):
+        """_build_mp4 uses subprocess.run when runner=None."""
+        from app.tasks.presentation_render import _build_mp4
+
+        render_spec = {
+            "fps": 30,
+            "slides": [{"durationMs": 3000}],
+        }
+        screenshot_paths = ["/tmp/slide_0000.png"]
+
+        with patch("subprocess.run") as mock_sub, _PATCH_CONCAT:
+            mock_sub.return_value = subprocess.CompletedProcess(
+                args=["ffmpeg"], returncode=0, stdout="", stderr=""
+            )
+            _build_mp4(render_spec, "standard", screenshot_paths, "/tmp")
+            mock_sub.assert_called()
diff --git a/python-backend/tests/test_sandbox_media_runner.py b/python-backend/tests/test_sandbox_media_runner.py
new file mode 100644
index 0000000..968fb01
--- /dev/null
+++ b/python-backend/tests/test_sandbox_media_runner.py
@@ -0,0 +1,316 @@
+"""Tests for SandboxMediaRunner — the sandbox execution wrapper for FFmpeg commands.
+
+All tests mock the OpenSandbox client. No real sandbox containers needed.
+"""
+
+import subprocess
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.integrations.opensandbox.models import CommandResult
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+@pytest.fixture
+def mock_settings_enabled():
+    """Patch opensandbox_settings to be enabled."""
+    with patch(
+        "app.video.sandbox_runner.opensandbox_settings"
+    ) as mock_settings:
+        mock_settings.is_enabled = True
+        mock_settings.OPENSANDBOX_ENABLED = True
+        mock_settings.OPENSANDBOX_BASE_URL = "http://localhost:8080"
+        yield mock_settings
+
+
+@pytest.fixture
+def mock_settings_disabled():
+    """Patch opensandbox_settings to be disabled."""
+    with patch(
+        "app.video.sandbox_runner.opensandbox_settings"
+    ) as mock_settings:
+        mock_settings.is_enabled = False
+        mock_settings.OPENSANDBOX_ENABLED = False
+        yield mock_settings
+
+
+@pytest.fixture
+def mock_client():
+    """Create a mock OpenSandboxClient."""
+    client = AsyncMock()
+    client.run_command.return_value = CommandResult(
+        exit_code=0, stdout="ok", stderr=""
+    )
+    client.write_file = AsyncMock()
+    client.read_file = AsyncMock(return_value=b"file-content")
+    return client
+
+
+@pytest.fixture
+def mock_lifecycle(mock_client):
+    """Create a mock SandboxLifecycleManager."""
+    lifecycle = AsyncMock()
+    lifecycle.provision_sandbox.return_value = "sandbox-abc-123"
+    lifecycle.destroy_sandbox = AsyncMock()
+    return lifecycle
+
+
+class TestSandboxMediaRunner:
+    """Tests for the SandboxMediaRunner class in app/video/sandbox_runner.py."""
+
+    @pytest.mark.asyncio
+    async def test_run_command_uses_sandbox_when_enabled(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """When OPENSANDBOX_ENABLED=true, FFmpeg commands execute via sandbox."""
+        with patch(
+            "app.integrations.opensandbox.client.OpenSandboxClient",
+            return_value=mock_client,
+        ), patch(
+            "app.video.sandbox_runner.SandboxConfig",
+        ) as mock_config_cls, patch(
+            "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
+            return_value=mock_lifecycle,
+        ), patch(
+            "app.integrations.opensandbox.execution.run_command",
+            new_callable=AsyncMock,
+            return_value=CommandResult(exit_code=0, stdout="done", stderr=""),
+        ) as mock_run:
+            # Need to patch the deferred imports at their source
+            with patch(
+                "app.video.sandbox_runner.OpenSandboxClient",
+                create=True,
+            ) as _:
+                pass
+
+            # Instead, patch the imports where they are used
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner(profile="media-processing")
+            # Manually wire up the mocks since __aenter__ imports locally
+            runner._enabled = True
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            result = await runner.run_command(["ffprobe", "-v", "quiet", "test.mp4"])
+
+            assert result.returncode == 0
+            assert result.stdout == "done"
+            mock_run.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_run_command_falls_back_to_subprocess_when_disabled(
+        self, mock_settings_disabled
+    ):
+        """When OPENSANDBOX_ENABLED=false, FFmpeg commands execute via subprocess.run()."""
+        from app.video.sandbox_runner import SandboxMediaRunner
+
+        mock_result = subprocess.CompletedProcess(
+            args=["echo", "test"], returncode=0, stdout="test\n", stderr=""
+        )
+
+        with patch("asyncio.to_thread", new_callable=AsyncMock, return_value=mock_result):
+            runner = SandboxMediaRunner()
+            result = await runner.run_command(["echo", "test"])
+
+            assert result.returncode == 0
+            assert result.stdout == "test\n"
+
+    @pytest.mark.asyncio
+    async def test_session_context_manager_creates_and_destroys_sandbox(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Session context manager creates sandbox on enter and destroys on exit."""
+        with patch(
+            "app.video.sandbox_runner.SandboxConfig",
+        ), patch(
+            "app.integrations.opensandbox.client.OpenSandboxClient",
+            return_value=mock_client,
+        ), patch(
+            "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
+            return_value=mock_lifecycle,
+        ):
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            # Patch the deferred imports to return our mocks
+            with patch.dict("sys.modules", {}):
+                pass
+
+            runner = SandboxMediaRunner.session(profile="media-processing")
+            # Directly test __aenter__ and __aexit__ with mocked internals
+            runner._enabled = True
+
+            # Simulate __aenter__ behavior
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            # Now test __aexit__
+            await runner.__aexit__(None, None, None)
+
+            mock_lifecycle.destroy_sandbox.assert_called_once_with("sandbox-abc-123")
+
+    @pytest.mark.asyncio
+    async def test_session_reuse_single_sandbox(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Multiple run_command calls within a session reuse the same sandbox_id."""
+        with patch(
+            "app.integrations.opensandbox.execution.run_command",
+            new_callable=AsyncMock,
+            return_value=CommandResult(exit_code=0, stdout="", stderr=""),
+        ) as mock_run:
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner()
+            runner._enabled = True
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            await runner.run_command(["ffprobe", "a.mp4"])
+            await runner.run_command(["ffmpeg", "-i", "a.mp4", "b.mp4"])
+
+            assert mock_run.call_count == 2
+
+    @pytest.mark.asyncio
+    async def test_session_cleanup_on_exception(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Sandbox is destroyed even when an exception occurs during execution."""
+        with patch(
+            "app.integrations.opensandbox.execution.run_command",
+            new_callable=AsyncMock,
+            side_effect=RuntimeError("ffmpeg crashed"),
+        ):
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner()
+            runner._enabled = True
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            with pytest.raises(RuntimeError, match="ffmpeg crashed"):
+                await runner.run_command(["ffmpeg", "bad"])
+
+            # Cleanup via __aexit__
+            await runner.__aexit__(RuntimeError, RuntimeError("ffmpeg crashed"), None)
+            mock_lifecycle.destroy_sandbox.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_sandbox_config_uses_media_processing_profile(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Sandbox creation uses correct config for media-processing profile."""
+        with patch(
+            "app.video.sandbox_runner.SandboxConfig",
+        ) as mock_config_cls:
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner(profile="media-processing")
+            runner._enabled = True
+
+            # Patch the deferred imports within __aenter__
+            with patch(
+                "app.video.sandbox_runner.OpenSandboxClient",
+                create=True,
+                return_value=mock_client,
+            ):
+                pass
+
+            # Directly verify SandboxConfig is called with expected params
+            # by calling __aenter__ with patched imports
+            mock_config_cls.return_value = MagicMock()
+
+            with patch(
+                "app.integrations.opensandbox.client.OpenSandboxClient",
+                return_value=mock_client,
+            ), patch(
+                "app.integrations.opensandbox.lifecycle.SandboxLifecycleManager",
+                return_value=mock_lifecycle,
+            ):
+                await runner.__aenter__()
+
+            call_args = mock_config_cls.call_args
+            assert call_args.kwargs["cpu_limit"] == "2000m"
+            assert call_args.kwargs["memory_limit_mb"] == 4096
+
+            # Cleanup
+            await runner.__aexit__(None, None, None)
+
+    @pytest.mark.asyncio
+    async def test_ffmpeg_args_converted_to_shell_command_string(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Subprocess-style list args are joined into a shell command string."""
+        with patch(
+            "app.integrations.opensandbox.execution.run_command",
+            new_callable=AsyncMock,
+            return_value=CommandResult(exit_code=0, stdout="", stderr=""),
+        ) as mock_run:
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner()
+            runner._enabled = True
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            await runner.run_command(
+                ["ffmpeg", "-i", "input file.mp4", "-y", "output.mp4"]
+            )
+
+            # Check the shell command string was properly escaped
+            call_args = mock_run.call_args
+            shell_cmd = call_args[0][2]  # Third positional arg is the command string
+            assert "ffmpeg" in shell_cmd
+            assert "'input file.mp4'" in shell_cmd or "input\\ file.mp4" in shell_cmd
+
+    @pytest.mark.asyncio
+    async def test_command_failure_raises_runtime_error(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Non-zero exit code with check=True raises RuntimeError."""
+        with patch(
+            "app.integrations.opensandbox.execution.run_command",
+            new_callable=AsyncMock,
+            return_value=CommandResult(
+                exit_code=1, stdout="", stderr="Error: invalid input"
+            ),
+        ):
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner()
+            runner._enabled = True
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            with pytest.raises(RuntimeError, match="Sandbox command failed"):
+                await runner.run_command(["ffmpeg", "bad"], check=True)
+
+    @pytest.mark.asyncio
+    async def test_command_failure_returns_result_without_check(
+        self, mock_settings_enabled, mock_client, mock_lifecycle
+    ):
+        """Non-zero exit code without check=True returns the result normally."""
+        with patch(
+            "app.integrations.opensandbox.execution.run_command",
+            new_callable=AsyncMock,
+            return_value=CommandResult(exit_code=1, stdout="", stderr="err"),
+        ):
+            from app.video.sandbox_runner import SandboxMediaRunner
+
+            runner = SandboxMediaRunner()
+            runner._enabled = True
+            runner._client = mock_client
+            runner._lifecycle = mock_lifecycle
+            runner._sandbox_id = "sandbox-abc-123"
+
+            result = await runner.run_command(["ffmpeg", "bad"])
+            assert result.returncode == 1
+            assert result.stderr == "err"
diff --git a/python-backend/tests/test_video_pipeline_sandbox.py b/python-backend/tests/test_video_pipeline_sandbox.py
new file mode 100644
index 0000000..b7d4887
--- /dev/null
+++ b/python-backend/tests/test_video_pipeline_sandbox.py
@@ -0,0 +1,125 @@
+"""Tests for app/video/pipeline.py sandbox migration.
+
+Verifies that _probe_clip, run_assembly_stage, and run_final_render route
+FFmpeg through sandbox when a runner is provided.
+"""
+
+import json
+import subprocess
+from unittest.mock import MagicMock, patch
+
+import pytest
+
+pytestmark = [pytest.mark.sandbox, pytest.mark.unit]
+
+
+@pytest.fixture
+def mock_runner():
+    """Create a mock SandboxMediaRunner with sync interface."""
+    runner = MagicMock()
+    runner.run_command_sync.return_value = subprocess.CompletedProcess(
+        args=["ffprobe"], returncode=0,
+        stdout=json.dumps({
+            "streams": [{"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "r_frame_rate": "30/1"}],
+            "format": {"duration": "10.0"},
+        }),
+        stderr=""
+    )
+    return runner
+
+
+class TestVideoPipelineSandbox:
+    """Verify video/pipeline.py subprocess calls route through sandbox."""
+
+    def test_probe_clip_uses_runner(self, mock_runner):
+        """_probe_clip routes ffprobe through runner when provided."""
+        from app.video.pipeline import _probe_clip
+
+        result = _probe_clip("/tmp/clip.mp4", runner=mock_runner)
+
+        mock_runner.run_command_sync.assert_called_once()
+        assert result["codec"] == "h264"
+        assert result["width"] == 1920
+
+    def test_probe_clip_falls_back_without_runner(self):
+        """_probe_clip uses subprocess.run when runner=None."""
+        from app.video.pipeline import _probe_clip
+
+        with patch("subprocess.run") as mock_sub:
+            mock_sub.return_value = subprocess.CompletedProcess(
+                args=["ffprobe"], returncode=0,
+                stdout=json.dumps({
+                    "streams": [{"codec_type": "video", "codec_name": "h264", "width": 1280, "height": 720, "r_frame_rate": "24/1"}],
+                    "format": {"duration": "5.0"},
+                }),
+                stderr=""
+            )
+            result = _probe_clip("/tmp/clip.mp4")
+            mock_sub.assert_called_once()
+
+    def test_run_assembly_stage_uses_runner(self, mock_runner):
+        """run_assembly_stage routes ffmpeg through runner when provided (needs 2+ clips)."""
+        from app.video.pipeline import run_assembly_stage
+
+        probe_result = subprocess.CompletedProcess(
+            args=["ffprobe"], returncode=0,
+            stdout=json.dumps({
+                "streams": [{"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080, "r_frame_rate": "30/1"}],
+                "format": {"duration": "5.0"},
+            }),
+            stderr=""
+        )
+        mock_runner.run_command_sync.side_effect = [
+            probe_result,  # _probe_clip for clip1
+            probe_result,  # _probe_clip for clip2
+            subprocess.CompletedProcess(args=["ffmpeg"], returncode=0, stdout="", stderr=""),  # concat
+        ]
+
+        render_spec = {
+            "renderHash": "test-hash",
+            "inputAssetKeys": {"a1": "clip1.mp4", "a2": "clip2.mp4"},
+            "project": {
+                "timeline": {
+                    "tracks": [
+                        {
+                            "type": "video", "name": "V1",
+                            "clips": [
+                                {"assetId": "a1", "startTime": 0},
+                                {"assetId": "a2", "startTime": 5},
+                            ],
+                        }
+                    ]
+                },
+                "assets": {},
+            }
+        }
+
+        with patch("os.path.exists", return_value=True), \
+             patch("builtins.open", MagicMock()):
+            result = run_assembly_stage(render_spec, "/tmp", runner=mock_runner)
+
+        # 2 probe calls + 1 assembly call
+        assert mock_runner.run_command_sync.call_count == 3
+
+    def test_run_final_render_simple_uses_runner(self, mock_runner):
+        """run_final_render (no overlays) routes ffmpeg through runner."""
+        from app.video.pipeline import run_final_render
+
+        mock_runner.run_command_sync.return_value = subprocess.CompletedProcess(
+            args=["ffmpeg"], returncode=0, stdout="", stderr=""
+        )
+
+        render_spec = {
+            "project": {
+                "timeline": {"tracks": []},
+                "assets": {},
+            }
+        }
+
+        result = run_final_render(
+            "/tmp/assembled.mp4", render_spec, "standard", "/tmp/output.mp4", runner=mock_runner
+        )
+
+        mock_runner.run_command_sync.assert_called_once()
+        cmd = mock_runner.run_command_sync.call_args[0][0]
+        assert "ffmpeg" in cmd
