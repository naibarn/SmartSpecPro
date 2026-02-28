"""Two-stage FFmpeg video rendering pipeline.

Stage 1 (Assembly): Concatenate V1 track clips into a single intermediate file.
                    Uses stream copy when possible for speed.

Stage 2 (Final Render): Apply V2 overlays, T1 text burns, A1 audio mixing,
                        and encode with the selected render profile.
"""
import json
import os
import subprocess
import tempfile
from typing import Callable

from app.video.render_profiles import PROFILES, get_ffmpeg_output_args


def _probe_clip(file_path: str, runner=None) -> dict:
    """Probe a clip file for codec, resolution, and fps."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", "-show_format", file_path,
    ]
    if runner:
        result = runner.run_command_sync(cmd, timeout=30)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return {}
    data = json.loads(result.stdout)
    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    if not video_stream:
        return {}
    return {
        "codec": video_stream.get("codec_name", ""),
        "width": int(video_stream.get("width", 0)),
        "height": int(video_stream.get("height", 0)),
        "r_frame_rate": video_stream.get("r_frame_rate", "30/1"),
        "duration": float(data.get("format", {}).get("duration", 0)),
    }


def _clips_are_compatible(clip_infos: list[dict]) -> bool:
    """Check if all clips can be stream-copied (same codec, resolution, fps)."""
    if not clip_infos:
        return False
    first = clip_infos[0]
    for info in clip_infos[1:]:
        if (
            info.get("codec") != first.get("codec")
            or info.get("width") != first.get("width")
            or info.get("height") != first.get("height")
            or info.get("r_frame_rate") != first.get("r_frame_rate")
        ):
            return False
    return True


def run_assembly_stage(
    render_spec: dict,
    work_dir: str,
    progress_callback: Callable[[float, str], None] | None = None,
    runner=None,
) -> str:
    """Assemble V1 track clips into a single intermediate file.

    If all clips share the same codec, resolution, and timebase, uses
    stream copy (-c copy) for near-instant assembly via concat demuxer.
    Otherwise, re-encodes with the standard profile.

    Args:
        render_spec: The full render specification dict.
        work_dir: Temporary directory for intermediate files.
        progress_callback: Optional callback(progress: float, stage: str).

    Returns:
        Path to the assembled intermediate file.
    """
    project = render_spec.get("project", {})
    timeline = project.get("timeline", {})
    tracks = timeline.get("tracks", [])

    # Find V1 track clips
    v1_clips = []
    for track in tracks:
        if track.get("type") == "video" and track.get("name") == "V1":
            v1_clips = sorted(
                track.get("clips", []),
                key=lambda c: c.get("startTime", c.get("startMs", 0)),
            )
            break

    if not v1_clips:
        raise ValueError("No V1 track clips found in render spec")

    render_hash = render_spec.get("renderHash", "output")
    output_path = os.path.join(work_dir, f"{render_hash}_assembled.mp4")

    # Resolve asset file paths (assumed already downloaded to work_dir)
    assets = project.get("assets", {})
    input_asset_keys = render_spec.get("inputAssetKeys", {})
    clip_paths = []
    for clip in v1_clips:
        asset_id = clip.get("assetId")
        asset = assets.get(asset_id, {})
        # Try to find local file in work_dir by R2 key basename
        r2_key = input_asset_keys.get(asset_id, asset.get("path", ""))
        local_name = os.path.basename(r2_key) if r2_key else f"{asset_id}.mp4"
        local_path = os.path.join(work_dir, local_name)
        clip_paths.append(local_path)

    if len(v1_clips) == 1:
        # Single clip: just use it directly (or copy if needed)
        if os.path.exists(clip_paths[0]):
            if progress_callback:
                progress_callback(1.0, "assembly")
            return clip_paths[0]
        raise FileNotFoundError(f"Input clip not found: {clip_paths[0]}")

    # Probe all clips
    clip_infos = []
    for path in clip_paths:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Input clip not found: {path}")
        clip_infos.append(_probe_clip(path, runner=runner))

    if progress_callback:
        progress_callback(0.1, "assembly")

    if _clips_are_compatible(clip_infos):
        # Stream copy via concat demuxer
        concat_file = os.path.join(work_dir, "concat_list.txt")
        with open(concat_file, "w") as f:
            for path in clip_paths:
                f.write(f"file '{path}'\n")

        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", concat_file, "-c", "copy", output_path,
        ]
    else:
        # Re-encode with standard profile settings for compatibility
        proj_w = project.get("settings", {}).get("width", 1920)
        proj_h = project.get("settings", {}).get("height", 1080)
        proj_fps = project.get("settings", {}).get("fps", 30)

        inputs = []
        filters = []
        for i, path in enumerate(clip_paths):
            inputs.extend(["-i", path])
            clip = v1_clips[i]
            in_s = clip.get("trimIn", clip.get("inMs", 0))
            out_s = clip.get("trimOut", clip.get("outMs", 0))
            # Convert ms to seconds if needed
            if isinstance(in_s, (int, float)) and in_s > 100:
                in_s = in_s / 1000.0
                out_s = out_s / 1000.0

            normalize = (
                f"fps={proj_fps},"
                f"scale={proj_w}:{proj_h}:force_original_aspect_ratio=decrease,"
                f"pad={proj_w}:{proj_h}:(ow-iw)/2:(oh-ih)/2:color=black,"
                f"setsar=1,format=yuv420p"
            )
            if in_s > 0 or out_s > 0:
                filters.append(
                    f"[{i}:v]trim=start={in_s}:end={out_s},setpts=PTS-STARTPTS,{normalize}[v{i}]"
                )
                filters.append(
                    f"[{i}:a]atrim=start={in_s}:end={out_s},asetpts=PTS-STARTPTS[a{i}]"
                )
            else:
                filters.append(f"[{i}:v]setpts=PTS-STARTPTS,{normalize}[v{i}]")
                filters.append(f"[{i}:a]asetpts=PTS-STARTPTS[a{i}]")

        n = len(clip_paths)
        concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
        filters.append(f"{concat_in}concat=n={n}:v=1:a=1[vout][aout]")

        cmd = ["ffmpeg", "-y"] + inputs + [
            "-filter_complex", ";".join(filters),
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            output_path,
        ]

    if runner:
        result = runner.run_command_sync(cmd, timeout=1800)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"Assembly stage failed: {result.stderr[-500:]}")

    if progress_callback:
        progress_callback(1.0, "assembly")

    return output_path


def run_final_render(
    assembled_path: str,
    render_spec: dict,
    profile_name: str,
    output_path: str,
    progress_callback: Callable[[float, str], None] | None = None,
    runner=None,
) -> str:
    """Apply overlays, text, audio mixing, and encode to final output.

    Builds a filter_complex that:
    - Starts from the assembled V1 output.
    - Overlays V2 elements at specified positions and time ranges.
    - Burns T1 text using drawtext filter with fontconfig fonts.
    - Mixes A1 audio with V1 audio using amix filter.
    - Applies the selected render profile's encoding settings.

    Args:
        assembled_path: Path to the Stage 1 output.
        render_spec: The full render specification dict.
        profile_name: One of 'preview', 'standard', 'high'.
        output_path: Final output file path.
        progress_callback: Optional callback(progress: float, stage: str).

    Returns:
        Path to the rendered output file.
    """
    profile = PROFILES.get(profile_name)
    if not profile:
        raise ValueError(f"Unknown profile: {profile_name}")

    project = render_spec.get("project", {})
    timeline = project.get("timeline", {})
    tracks = timeline.get("tracks", [])
    assets = project.get("assets", {})
    input_asset_keys = render_spec.get("inputAssetKeys", {})

    # Collect overlay, text, and audio clips
    v2_clips = []
    t1_clips = []
    a1_clips = []
    for track in tracks:
        track_type = track.get("type")
        track_name = track.get("name", "")
        if track.get("muted"):
            continue
        if track_type == "overlay" or track_name == "V2":
            v2_clips.extend(track.get("clips", []))
        elif track_type == "text" or track_name == "T1":
            t1_clips.extend(track.get("clips", []))
        elif track_type == "audio" or track_name == "A1":
            a1_clips.extend(track.get("clips", []))

    has_overlays = len(v2_clips) > 0 or len(t1_clips) > 0 or len(a1_clips) > 0

    if not has_overlays:
        # Simple transcode with profile settings
        cmd = ["ffmpeg", "-y", "-i", assembled_path]
        cmd.extend(get_ffmpeg_output_args(profile))
        cmd.append(output_path)

        if runner:
            result = runner.run_command_sync(cmd, timeout=1800)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        if result.returncode != 0:
            raise RuntimeError(f"Final render failed: {result.stderr[-500:]}")

        if progress_callback:
            progress_callback(1.0, "final_render")
        return output_path

    # Build filter_complex for overlays, text, and audio mixing
    inputs = ["-i", assembled_path]
    input_idx = 0
    filters = []
    current_video_label = "0:v"
    overlay_input_map: dict[str, int] = {}  # assetId -> input index

    # Add overlay inputs
    for clip in v2_clips:
        asset_id = clip.get("assetId")
        if asset_id not in overlay_input_map:
            input_idx += 1
            overlay_input_map[asset_id] = input_idx
            r2_key = input_asset_keys.get(asset_id, assets.get(asset_id, {}).get("path", ""))
            local_name = os.path.basename(r2_key) if r2_key else f"{asset_id}.mp4"
            work_dir = os.path.dirname(assembled_path)
            local_path = os.path.join(work_dir, local_name)
            inputs.extend(["-i", local_path])

    # Add audio inputs
    audio_input_map: dict[str, int] = {}
    for clip in a1_clips:
        asset_id = clip.get("assetId")
        if asset_id not in audio_input_map:
            input_idx += 1
            audio_input_map[asset_id] = input_idx
            r2_key = input_asset_keys.get(asset_id, assets.get(asset_id, {}).get("path", ""))
            local_name = os.path.basename(r2_key) if r2_key else f"{asset_id}.mp4"
            work_dir = os.path.dirname(assembled_path)
            local_path = os.path.join(work_dir, local_name)
            inputs.extend(["-i", local_path])

    # V2 overlay filters
    for i, clip in enumerate(v2_clips):
        asset_id = clip.get("assetId")
        idx = overlay_input_map[asset_id]
        transform = clip.get("transform", {})
        x = transform.get("x", 0.5)
        y = transform.get("y", 0.5)
        opacity = transform.get("opacity", 1.0)
        start_time = clip.get("startTime", clip.get("startMs", 0))
        duration = clip.get("duration", clip.get("durationMs", 0))
        if isinstance(start_time, (int, float)) and start_time > 100:
            start_time = start_time / 1000.0
            duration = duration / 1000.0
        end_time = start_time + duration

        out_label = f"ov{i}"
        enable = f"between(t,{start_time},{end_time})"
        filters.append(
            f"[{current_video_label}][{idx}:v]overlay="
            f"x=(main_w*{x})-(overlay_w/2):"
            f"y=(main_h*{y})-(overlay_h/2):"
            f"enable='{enable}'[{out_label}]"
        )
        current_video_label = out_label

    # T1 text filters (drawtext)
    for i, clip in enumerate(t1_clips):
        text_config = clip.get("textConfig", {})
        text = text_config.get("text", "")
        font_family = text_config.get("fontFamily", "DejaVu Sans")
        font_size = text_config.get("fontSize", 48)
        color = text_config.get("color", "#FFFFFF")
        start_time = clip.get("startTime", clip.get("startMs", 0))
        duration = clip.get("duration", clip.get("durationMs", 0))
        if isinstance(start_time, (int, float)) and start_time > 100:
            start_time = start_time / 1000.0
            duration = duration / 1000.0
        end_time = start_time + duration

        # Escape special characters for drawtext
        escaped_text = text.replace("'", "\\'").replace(":", "\\:")
        out_label = f"txt{i}"
        enable = f"between(t,{start_time},{end_time})"
        filters.append(
            f"[{current_video_label}]drawtext="
            f"text='{escaped_text}':"
            f"font='{font_family}':"
            f"fontsize={font_size}:"
            f"fontcolor={color}:"
            f"x=(w-text_w)/2:y=(h-text_h)/2:"
            f"enable='{enable}'[{out_label}]"
        )
        current_video_label = out_label

    # Audio mixing
    current_audio_label = "0:a"
    if a1_clips:
        for i, clip in enumerate(a1_clips):
            asset_id = clip.get("assetId")
            idx = audio_input_map[asset_id]
            out_label = f"amix{i}"
            filters.append(
                f"[{current_audio_label}][{idx}:a]amix=inputs=2:duration=longest[{out_label}]"
            )
            current_audio_label = out_label

    # Build command
    cmd = ["ffmpeg", "-y"] + inputs
    if filters:
        cmd.extend(["-filter_complex", ";".join(filters)])
        cmd.extend(["-map", f"[{current_video_label}]", "-map", f"[{current_audio_label}]"])
    cmd.extend(get_ffmpeg_output_args(profile))
    cmd.append(output_path)

    if runner:
        result = runner.run_command_sync(cmd, timeout=1800)
    else:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        raise RuntimeError(f"Final render failed: {result.stderr[-500:]}")

    if progress_callback:
        progress_callback(1.0, "final_render")

    return output_path
