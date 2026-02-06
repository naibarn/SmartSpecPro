"""
Shared test fixtures for media job tests.
Provides factory functions for building valid job specs and mock subprocess output.
"""

import json
import pytest


def valid_probe_spec(asset_uri: str = "https://cdn.example.com/clip.mp4") -> dict:
    """Returns a dict representing a valid probe job spec."""
    return {
        "specVersion": "0.1",
        "jobId": "test-probe-001",
        "jobType": "probe",
        "inputs": {
            "assets": [
                {"assetId": "input", "kind": "video", "uri": asset_uri}
            ]
        },
        "params": {},
        "output": {"mode": "memory", "target": ""},
    }


def valid_render_spec(num_clips: int = 2) -> dict:
    """Returns a dict with a multi-clip timeline for render_mp4_h264."""
    clips = [
        {
            "clipId": f"clip-{i}",
            "assetId": f"asset-{i}",
            "startMs": i * 5000,
            "inMs": 0,
            "outMs": 5000,
        }
        for i in range(num_clips)
    ]
    return {
        "specVersion": "0.1",
        "jobId": "test-render-001",
        "jobType": "render_mp4_h264",
        "inputs": {
            "assets": [
                {
                    "assetId": f"asset-{i}",
                    "kind": "video",
                    "uri": f"https://cdn.example.com/clip-{i}.mp4",
                }
                for i in range(num_clips)
            ],
            "project": {
                "projectId": "test-project",
                "fps": 30,
                "width": 1920,
                "height": 1080,
                "tracks": [
                    {"trackId": "video-track", "type": "video", "clips": clips}
                ],
            },
        },
        "params": {"codec": "libx264"},
        "output": {"mode": "file", "target": "output/render.mp4"},
    }


def valid_waveform_spec(bucket_ms: int = 50) -> dict:
    """Returns a waveform spec."""
    return {
        "specVersion": "0.1",
        "jobId": "test-waveform-001",
        "jobType": "waveform_peaks",
        "inputs": {
            "assets": [
                {"assetId": "input", "kind": "audio", "uri": "https://cdn.example.com/audio.wav"}
            ]
        },
        "params": {"bucketMs": bucket_ms},
        "output": {"mode": "memory", "target": ""},
    }


def valid_dead_air_spec() -> dict:
    """Returns a dead air detection spec."""
    return {
        "specVersion": "0.1",
        "jobId": "test-deadair-001",
        "jobType": "dead_air_detect",
        "inputs": {
            "assets": [
                {"assetId": "input", "kind": "audio", "uri": "https://cdn.example.com/audio.wav"}
            ]
        },
        "params": {"thresholdDb": -40, "minSilenceMs": 500},
        "output": {"mode": "memory", "target": ""},
    }


def mock_ffprobe_output() -> str:
    """Returns sample ffprobe JSON output."""
    return json.dumps({
        "format": {
            "duration": "120.500000",
            "size": "25000000",
            "bit_rate": "1660000",
        },
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "r_frame_rate": "30/1",
                "duration": "120.500000",
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "sample_rate": "44100",
                "channels": 2,
                "duration": "120.500000",
            },
        ],
    })


def mock_ffmpeg_progress_lines() -> list[str]:
    """Returns sample -progress pipe:1 output lines."""
    return [
        "frame=100",
        "fps=30.0",
        "stream_0_0_q=28.0",
        "total_size=1234567",
        "out_time_us=3333333",
        "out_time_ms=3333333",
        "out_time=00:00:03.333333",
        "dup_frames=0",
        "drop_frames=0",
        "speed=2.1x",
        "progress=continue",
        "",
        "frame=500",
        "fps=30.0",
        "out_time_us=16666666",
        "out_time=00:00:16.666666",
        "speed=2.0x",
        "progress=continue",
        "",
        "frame=900",
        "fps=30.0",
        "out_time_us=30000000",
        "out_time=00:00:30.000000",
        "speed=1.9x",
        "progress=end",
    ]


def mock_silence_detect_stderr() -> str:
    """Returns sample silencedetect filter output."""
    return """
[silencedetect @ 0x1234] silence_start: 2.500
[silencedetect @ 0x1234] silence_end: 4.800 | silence_duration: 2.300
[silencedetect @ 0x1234] silence_start: 15.000
[silencedetect @ 0x1234] silence_end: 18.200 | silence_duration: 3.200
""".strip()


# ========================================
# pytest fixtures
# ========================================

@pytest.fixture
def probe_spec():
    return valid_probe_spec()


@pytest.fixture
def render_spec():
    return valid_render_spec()


@pytest.fixture
def waveform_spec():
    return valid_waveform_spec()


@pytest.fixture
def dead_air_spec():
    return valid_dead_air_spec()


@pytest.fixture
def ffprobe_output():
    return mock_ffprobe_output()


@pytest.fixture
def silence_stderr():
    return mock_silence_detect_stderr()
