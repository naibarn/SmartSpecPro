import importlib


def _load_worker_module():
    return importlib.import_module("app.tasks.media_job_worker")


def _make_render_spec(transform=None, *, in_ms=0, out_ms=5000, duration_ms=None, playback_rate=None):
    clip = {
        "clipId": "clip-1",
        "assetId": "asset-1",
        "startMs": 0,
        "inMs": in_ms,
        "outMs": out_ms,
    }
    if duration_ms is not None:
        clip["durationMs"] = duration_ms
    if playback_rate is not None:
        clip["playbackRate"] = playback_rate
    if transform is not None:
        clip["transform"] = transform

    return {
        "specVersion": "0.1",
        "jobId": "mj-test-transform",
        "jobType": "render_mp4_h264",
        "inputs": {
            "project": {
                "projectId": "p1",
                "fps": 30,
                "width": 1920,
                "height": 1080,
                "tracks": [
                    {
                        "trackId": "v1",
                        "type": "video",
                        "clips": [clip],
                    }
                ],
            },
            "assets": [
                {
                    "assetId": "asset-1",
                    "kind": "video",
                    "uri": "https://example.com/input.mp4",
                    "durationMs": 5000,
                }
            ],
        },
        "output": {
            "mode": "file",
            "target": "/tmp/out.mp4",
        },
        "params": {},
    }


def test_build_render_command_uses_transform_overlay_for_static_clip(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = _make_render_spec(
        transform={
            "x": 0.2,
            "y": 0.8,
            "scaleX": 1.5,
            "scaleY": 1.0,
            "rotation": 0,
            "opacity": 1,
            "keyframes": [],
        }
    )

    cmd = worker.build_ffmpeg_command_for_render(spec)
    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]

    assert "scale=2880:1080" in fc
    assert "color=c=black:s=1920x1080" in fc
    assert "overlay=x=(main_w*0.200000)-(overlay_w/2):y=(main_h*0.800000)-(overlay_h/2)" in fc


def test_build_render_command_keeps_simple_path_for_default_transform(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = _make_render_spec(transform=None, in_ms=0, out_ms=0)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" not in cmd


def test_build_render_command_applies_clip_playback_rate(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = _make_render_spec(transform=None, duration_ms=4000, playback_rate=1.25)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "setpts=(PTS-STARTPTS)/1.250000" in fc
    assert "atempo=1.250000" in fc
    assert "color=c=black:s=1920x1080:d=4.000000" in fc


def test_build_render_command_mixes_storyboard_companion_audio(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = {
        "specVersion": "0.1",
        "jobId": "mj-test-companion-audio",
        "jobType": "render_mp4_h264",
        "inputs": {
            "project": {
                "projectId": "p1",
                "fps": 30,
                "width": 1080,
                "height": 1920,
                "tracks": [
                    {
                        "trackId": "v1",
                        "type": "video",
                        "clips": [
                            {
                                "clipId": "clip-1",
                                "assetId": "video-1",
                                "startMs": 0,
                                "inMs": 0,
                                "outMs": 8000,
                                "durationMs": 8000,
                                "volume": 0,
                            },
                            {
                                "clipId": "clip-2",
                                "assetId": "video-2",
                                "startMs": 8000,
                                "inMs": 0,
                                "outMs": 8000,
                                "durationMs": 8000,
                                "volume": 0,
                            },
                        ],
                    },
                    {
                        "trackId": "a1",
                        "type": "audio",
                        "clips": [
                            {
                                "clipId": "voice-1",
                                "assetId": "voice-1",
                                "startMs": 0,
                                "inMs": 0,
                                "outMs": 20000,
                                "durationMs": 16000,
                                "playbackRate": 1.25,
                                "volume": 1,
                            },
                            {
                                "clipId": "music-1",
                                "assetId": "music-1",
                                "startMs": 0,
                                "inMs": 0,
                                "outMs": 16000,
                                "durationMs": 16000,
                                "volume": 0.16,
                            },
                        ],
                    },
                ],
            },
            "assets": [
                {"assetId": "video-1", "kind": "video", "uri": "https://example.com/video-1.mp4", "durationMs": 8000},
                {"assetId": "video-2", "kind": "video", "uri": "https://example.com/video-2.mp4", "durationMs": 8000},
                {"assetId": "voice-1", "kind": "audio", "uri": "https://example.com/voice.mp3", "durationMs": 20000},
                {"assetId": "music-1", "kind": "audio", "uri": "https://example.com/music.mp3", "durationMs": 16000},
            ],
        },
        "output": {
            "mode": "file",
            "target": "/tmp/out.mp4",
        },
        "params": {},
    }

    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "concat=n=2:v=1:a=1[vout][aoutv]" in fc
    assert "anullsrc=r=48000:cl=stereo[_sil0]" in fc
    assert "anullsrc=r=48000:cl=stereo[_sil1]" in fc
    assert "atempo=1.250000,apad,atrim=0:16.000000" in fc
    assert "volume=0.160000,apad,atrim=0:16.000000" in fc
    assert "[aoutv][exta0][exta1]amix=inputs=3:duration=longest:dropout_transition=0" in fc
    assert "atrim=0:16.000000,asetpts=PTS-STARTPTS[aout]" in fc
