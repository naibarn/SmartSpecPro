#!/usr/bin/env python3
"""
Demucs v4 Stem Separation & Surgical Dialogue Repair Worker Script
Feature 175 — Vertical Drama Native Audio & Cinematic Sound Design Pipeline

This script performs:
1. Audio extraction from MP4 video
2. Stem separation via Demucs v4 (vocals vs. no_vocals / foley+ambience)
3. Dialogue replacement with clean synthesized TTS audio
4. Remuxing with original video stream (-c:v copy) to preserve original video frames 100%
"""

import argparse
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


def check_demucs_available():
    try:
        import demucs  # noqa: F401
        import torch   # noqa: F401
        return True
    except ImportError:
        return False


def separate_stems_demucs(input_wav: Path, output_dir: Path, model_name="htdemucs"):
    """
    Separates input_wav into vocals and no_vocals using Demucs v4.
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
        sys.stderr.write(f"Demucs warning: {err}\n")
        return None, None

    stem_dir = output_dir / model_name / input_wav.stem
    vocals_wav = stem_dir / "vocals.wav"
    no_vocals_wav = stem_dir / "no_vocals.wav"

    if vocals_wav.exists() and no_vocals_wav.exists():
        return vocals_wav, no_vocals_wav
    return None, None


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
            "engine": "demucs_v4_htdemucs" if demucs_ready else "ffmpeg_direct_fallback",
            "pythonVersion": sys.version.split()[0],
        }
        print(json.dumps(status_info))
        return

    if not args.video or not args.output_video or not args.workspace:
        print(json.dumps({"success": False, "error": "Missing required arguments: --video, --output-video, --workspace"}))
        sys.exit(1)

    workspace = Path(args.workspace)
    workspace.mkdir(parents=True, exist_ok=True)
    input_video = Path(args.video)
    output_video = Path(args.output_video)
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
        print(json.dumps({"success": False, "error": f"Failed to extract audio: {err}"}))
        sys.exit(1)

    # Step 2: Separate stems if Demucs is available
    demucs_ready = check_demucs_available()
    vocals_wav, no_vocals_wav = None, None
    if demucs_ready:
        vocals_wav, no_vocals_wav = separate_stems_demucs(extracted_wav, workspace / "stems")

    # Step 3: Mix new speech with ambience / foley or fallback
    has_tts = args.tts_audio and os.path.exists(args.tts_audio)
    final_audio = workspace / "final_mixed_audio.wav"

    if has_tts and no_vocals_wav and no_vocals_wav.exists():
        # Clean hybrid mix: new TTS + original Foley & Ambience
        mix_cmd = [
            "ffmpeg", "-y",
            "-i", str(args.tts_audio),
            "-i", str(no_vocals_wav),
            "-filter_complex",
            "[0:a]volume=1.0[vocal];[1:a]volume=0.85[amb];[vocal][amb]amix=inputs=2:duration=first:dropout_transition=0[aout]",
            "-map", "[aout]",
            str(final_audio)
        ]
        ok, err = run_command(mix_cmd, "Mix TTS with Foley/Ambience")
        separated = True
    elif has_tts:
        # Fallback: direct TTS replacement
        final_audio = Path(args.tts_audio)
        separated = False
    else:
        final_audio = extracted_wav
        separated = False

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
        print(json.dumps({"success": False, "error": f"Failed to remux video: {err}"}))
        sys.exit(1)

    result = {
        "success": True,
        "outputPath": str(output_video),
        "demucsUsed": separated,
        "engine": "demucs_v4" if separated else "direct_audio_remux",
        "hasNewTts": has_tts,
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
