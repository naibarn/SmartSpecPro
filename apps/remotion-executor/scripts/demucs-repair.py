#!/usr/bin/env python3
"""
Demucs v4 Stem Separation & Surgical Dialogue Repair Worker Script
Feature 175 — Vertical Drama Native Audio & Cinematic Sound Design Pipeline

This script performs:
1. Audio extraction from MP4 video
2. Stem separation via Demucs v4 (vocals vs. no_vocals combined accompaniment)
3. Dialogue replacement with clean synthesized TTS audio
4. Remuxing with original video stream (-c:v copy) to preserve original video frames 100%
"""

import argparse
import importlib.metadata
import json
import os
import subprocess
import sys
from pathlib import Path


def run_command(cmd, desc=""):
    try:
        res = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return True, res.stdout
    except subprocess.CalledProcessError as e:
        return False, e.stderr
    except OSError as e:
        return False, str(e)


def check_demucs_available():
    try:
        import demucs  # noqa: F401
        import torch   # noqa: F401
        return importlib.metadata.version("demucs").split(".", 1)[0] == "4"
    except ImportError:
        return False


def separate_stems_demucs(input_wav: Path, output_dir: Path, model_name="htdemucs"):
    """
    Separates input_wav into vocals and combined non-vocal accompaniment using Demucs v4.
    """
    demucs_cmd = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems=vocals",
        "-n",
        model_name,
        "-o",
        str(output_dir),
        str(input_wav),
    ]
    ok, err = run_command(demucs_cmd, desc="Demucs stem separation")
    if not ok:
        raise RuntimeError(f"DEMUCS_SEPARATION_FAILED: {err}")

    stem_dir = output_dir / model_name / input_wav.stem
    vocals_wav = stem_dir / "vocals.wav"
    no_vocals_wav = stem_dir / "no_vocals.wav"

    if vocals_wav.exists() and no_vocals_wav.exists():
        return vocals_wav, no_vocals_wav
    raise RuntimeError("DEMUCS_OUTPUT_STEMS_MISSING")


def fail(code, detail=""):
    message = f"{code}: {detail}" if detail else code
    print(json.dumps({"success": False, "error": message}))
    sys.exit(2)


def main():
    parser = argparse.ArgumentParser(description="Demucs v4 Audio Repair Worker")
    parser.add_argument("--video", required=False, default=None, help="Path to input video MP4")
    parser.add_argument("--tts-audio", required=False, default=None, help="Path to new TTS speech audio file")
    parser.add_argument("--output-video", required=False, default=None, help="Path for repaired output MP4")
    parser.add_argument("--workspace", required=False, default=None, help="Workspace directory for temporary stems")
    parser.add_argument("--check-status-only", action="store_true", help="Check if Demucs is installed and ready")

    args = parser.parse_args()

    if args.check_status_only:
        demucs_ready = check_demucs_available()
        status_info = {
            "demucsInstalled": demucs_ready,
            "engine": "demucs_v4_htdemucs" if demucs_ready else "unavailable",
            "pythonVersion": sys.version.split()[0],
        }
        print(json.dumps(status_info))
        return

    if not check_demucs_available():
        fail("RUNTIME_INCOMPATIBLE", "Demucs v4 and PyTorch are required; no direct-remux fallback is available")

    if not args.video or not args.tts_audio or not args.output_video or not args.workspace:
        fail("AUDIO_REPAIR_INPUT_INCOMPLETE", "--video, --tts-audio, --output-video, and --workspace are required")

    workspace = Path(args.workspace)
    workspace.mkdir(parents=True, exist_ok=True)
    input_video = Path(args.video)
    tts_audio = Path(args.tts_audio)
    output_video = Path(args.output_video)
    if not input_video.is_file() or input_video.stat().st_size <= 0:
        fail("SOURCE_VIDEO_INVALID")
    if not tts_audio.is_file() or tts_audio.stat().st_size <= 0:
        fail("TTS_AUDIO_INVALID")
    output_video.parent.mkdir(parents=True, exist_ok=True)

    extracted_wav = workspace / "original_audio.wav"

    # Step 1: Extract original audio
    extract_cmd = [
        "ffmpeg", "-y", "-i", str(input_video),
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
        str(extracted_wav)
    ]
    ok, err = run_command(extract_cmd, "Extract audio")
    if not ok:
        fail("SOURCE_AUDIO_EXTRACTION_FAILED", err)

    # Step 2: Separate stems. This path never treats an unseparated source as
    # a successful repair because that would silently preserve the bad dialogue.
    try:
        _, no_vocals_wav = separate_stems_demucs(extracted_wav, workspace / "stems")
    except RuntimeError as exc:
        fail("DEMUCS_SEPARATION_FAILED", str(exc))

    # Step 3: Mix new speech with the combined non-vocal accompaniment bed.
    final_audio = workspace / "final_mixed_audio.wav"
    mix_cmd = [
        "ffmpeg", "-y",
        "-i", str(tts_audio),
        "-i", str(no_vocals_wav),
        "-filter_complex",
        "[0:a]volume=1.0[vocal];[1:a]volume=0.85[amb];[vocal][amb]amix=inputs=2:duration=first:dropout_transition=0[aout]",
        "-map", "[aout]",
        str(final_audio)
    ]
    ok, err = run_command(mix_cmd, "Mix TTS with Foley/Ambience")
    if not ok:
        fail("AUDIO_REPAIR_MIX_FAILED", err)

    # Step 4: Remux video with new audio (stream copy video frames!)
    remux_cmd = [
        "ffmpeg", "-y",
        "-i", str(input_video),
        "-i", str(final_audio),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        str(output_video)
    ]
    ok, err = run_command(remux_cmd, "Remux repaired video")
    if not ok:
        fail("AUDIO_REPAIR_REMUX_FAILED", err)
    if not output_video.is_file() or output_video.stat().st_size <= 0:
        fail("AUDIO_REPAIR_OUTPUT_INVALID")

    result = {
        "success": True,
        "outputPath": str(output_video),
        "demucsUsed": True,
        "engine": "demucs_v4",
        "hasNewTts": True,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
