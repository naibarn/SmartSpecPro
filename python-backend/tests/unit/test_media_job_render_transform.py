import importlib


def _load_worker_module():
    return importlib.import_module("app.tasks.media_job_worker")


def _make_render_spec(transform=None):
    clip = {
        "clipId": "clip-1",
        "assetId": "asset-1",
        "startMs": 0,
        "inMs": 0,
        "outMs": 5000,
    }
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
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path: True)

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
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path: True)

    spec = _make_render_spec(transform=None)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" not in cmd
