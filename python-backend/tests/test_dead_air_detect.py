"""Focused real-FFmpeg coverage for silence detection used by the editor."""

import subprocess
from pathlib import Path

import pytest

from app.tasks.media_job_worker import handle_dead_air_detect


@pytest.mark.integration
def test_detects_silent_region_in_audio_asset(tmp_path: Path, monkeypatch):
    if subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode != 0:
        pytest.skip("FFmpeg is unavailable")

    audio_path = tmp_path / "silence-detection.wav"
    generated = subprocess.run(
        [
            "ffmpeg", "-v", "error",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=0.75",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1.0",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=0.75",
            "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
            "-map", "[out]", "-y", str(audio_path),
        ],
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert generated.returncode == 0, generated.stderr

    worker_globals = handle_dead_air_detect.__globals__
    monkeypatch.setitem(worker_globals, "report_progress", lambda *_args, **_kwargs: None)
    monkeypatch.setitem(worker_globals, "validate_uri_no_ssrf", lambda *_args, **_kwargs: None)

    result = handle_dead_air_detect(
        {
            "jobId": "silence-detection-test",
            "inputs": {"assets": [{"uri": f"file://{audio_path}"}]},
            "params": {"thresholdDb": -40, "minSilenceMs": 500},
        },
        str(tmp_path),
    )

    segments = result["derived"]["silenceSegments"]
    assert len(segments) == 1
    assert segments[0]["startMs"] == pytest.approx(750, abs=80)
    assert segments[0]["endMs"] == pytest.approx(1750, abs=80)
