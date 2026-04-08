#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path.cwd()


def normalize_executable_path(raw: str) -> Path:
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return candidate.absolute()


def normalize_file_path(raw: str) -> Path:
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = ROOT / candidate
    return candidate.resolve()


def run_ffmpeg_trim(ffmpeg_binary: str, source_audio: Path, target_audio: Path, seconds: int) -> None:
    command = [
        ffmpeg_binary,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_audio),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-t",
        str(seconds),
        str(target_audio),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        raise SystemExit(stderr or stdout or f"ffmpeg failed with exit code {result.returncode}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-test Gemma 4 LiteRT-LM audio transcription with a real audio clip.",
    )
    parser.add_argument("--python", required=True, help="Bundled Python path")
    parser.add_argument("--helper", required=True, help="Path to transcribe_audio.py")
    parser.add_argument("--model", required=True, help="Path to .litertlm model")
    parser.add_argument("--audio", required=True, help="Source audio clip")
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="FFmpeg binary used to trim/transcode the sample before inference",
    )
    parser.add_argument(
        "--seconds",
        type=int,
        default=30,
        help="Maximum seconds to keep from the source clip",
    )
    parser.add_argument(
        "--expect-substring",
        default="",
        help="Optional substring that must appear in the transcription",
    )
    args = parser.parse_args()

    python_path = normalize_executable_path(args.python)
    helper_path = normalize_file_path(args.helper)
    model_path = normalize_file_path(args.model)
    audio_path = normalize_file_path(args.audio)
    for label, path in (
        ("python", python_path),
        ("helper", helper_path),
        ("model", model_path),
        ("audio", audio_path),
    ):
        if not path.is_file():
            print(f"{label} not found: {path}", file=sys.stderr)
            return 2

    with tempfile.TemporaryDirectory(prefix="smartspec-litert-voice-") as temp_dir:
        trimmed_audio = Path(temp_dir) / "trimmed.wav"
        run_ffmpeg_trim(args.ffmpeg, audio_path, trimmed_audio, max(1, args.seconds))
        command = [
            str(python_path),
            str(helper_path),
            "--model-path",
            str(model_path),
            "--audio-path",
            str(trimmed_audio),
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=False)

    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    print(f"RETURN {result.returncode}")
    if stderr:
        print(f"STDERR {stderr[:500]!r}")
    if not stdout:
        print("No JSON payload returned from transcription helper", file=sys.stderr)
        return 1

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON from transcription helper: {exc}: {stdout!r}", file=sys.stderr)
        return 1

    text = str(payload.get("text") or "").strip()
    error = str(payload.get("error") or "").strip()
    print(f"TEXT {text!r}")
    if error:
        print(f"ERROR {error}", file=sys.stderr)
        return 1
    if not text:
        print("Transcription returned empty text", file=sys.stderr)
        return 1
    if args.expect_substring and args.expect_substring not in text:
        print(
            f"Expected substring {args.expect_substring!r} was not found in transcription",
            file=sys.stderr,
        )
        return 1

    print("ASSESSMENT Gemma 4 local audio transcription returned non-empty text.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
