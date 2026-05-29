import importlib
import json
import socket
from unittest.mock import MagicMock


def _load_worker_module():
    return importlib.import_module("app.tasks.media_job_worker")


def _make_render_spec(
    transform=None,
    *,
    in_ms=0,
    out_ms=5000,
    duration_ms=None,
    playback_rate=None,
):
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


def _raw_gray_frame_with_white_borders(
    *,
    width=72,
    height=128,
    top=0,
    bottom=0,
    left=0,
    right=0,
):
    frame = bytearray([96] * width * height)
    for row in range(height):
        for col in range(width):
            if (
                row < top
                or row >= height - bottom
                or col < left
                or col >= width - right
            ):
                frame[row * width + col] = 250
    return bytes(frame)


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


def test_build_render_command_cover_normalizes_default_transform(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = _make_render_spec(transform=None, in_ms=0, out_ms=0)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "crop=trunc(iw*0.988/2)*2:trunc(ih*0.988/2)*2:(iw-ow)/2:(ih-oh)/2" in fc
    assert "force_original_aspect_ratio=increase" in fc
    assert "crop=1920:1080:(iw-1920)/2:(ih-1080)/2" in fc
    assert "crop=1896:1056:12:12,scale=1920:1080" in fc
    assert "pad=1920:1080" not in fc


def test_build_render_command_applies_clip_playback_rate(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = _make_render_spec(transform=None, duration_ms=4000, playback_rate=1.25)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "setpts=(PTS-STARTPTS)/1.250000" in fc
    assert "atempo=1.250000" in fc
    assert "apad,atrim=0:4.000000,asetpts=PTS-STARTPTS[a0]" in fc
    assert "color=c=black:s=1920x1080:d=4.000000" in fc


def test_build_render_command_uses_trimmed_boundary_duration_for_storyboard_clip(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    spec = _make_render_spec(transform=None, out_ms=7967, duration_ms=7967)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "trim=start=0.0:end=7.967" in fc
    assert "trim=0:7.967000,setpts=PTS-STARTPTS[vnorm0]" in fc
    assert "apad,atrim=0:7.967000,asetpts=PTS-STARTPTS[a0]" in fc
    assert "color=c=black:s=1920x1080:d=7.967000" in fc
    assert "shortest=1" not in fc


def test_build_render_command_loops_image_assets_by_kind_without_extension(monkeypatch):
    worker = _load_worker_module()
    has_audio_stream = MagicMock(return_value=True)
    monkeypatch.setattr(worker, "_has_audio_stream", has_audio_stream)
    monkeypatch.setattr(worker, "_detect_letterbox_crop_filter", lambda _path, runner=None: None)

    spec = _make_render_spec(transform=None, duration_ms=6000)
    spec["inputs"]["assets"][0]["kind"] = "image"
    spec["inputs"]["assets"][0]["uri"] = (
        "http://host.docker.internal:3000/storage/asset-without-extension"
    )
    spec["inputs"]["assets"][0]["durationMs"] = 6000

    cmd = worker.build_ffmpeg_command_for_render(spec)

    input_index = cmd.index("-i")
    assert cmd[input_index - 2:input_index + 2] == [
        "-loop",
        "1",
        "-i",
        "http://host.docker.internal:3000/storage/asset-without-extension",
    ]
    assert has_audio_stream.call_count == 0
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "anullsrc=r=48000:cl=stereo[_sil0]" in fc
    assert "trim=0:6.000000,setpts=PTS-STARTPTS[vnorm0]" in fc


def test_build_render_command_crops_detected_letterbox_before_normalizing(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)
    monkeypatch.setattr(
        worker,
        "_detect_letterbox_crop_filter",
        lambda _path, runner=None: "crop=iw:1100:0:90",
    )

    spec = _make_render_spec(transform=None, duration_ms=4000)
    cmd = worker.build_ffmpeg_command_for_render(spec)

    assert "-filter_complex" in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert (
        "crop=iw:1100:0:90,"
        "crop=trunc(iw*0.988/2)*2:trunc(ih*0.988/2)*2:(iw-ow)/2:(ih-oh)/2,"
        "fps=30,scale=1920:1080:force_original_aspect_ratio=increase"
    ) in fc
    assert "crop=1920:1080:(iw-1920)/2:(ih-1080)/2" in fc
    assert "crop=1896:1056:12:12,scale=1920:1080" in fc
    assert "pad=1920:1080" not in fc


def test_detect_letterbox_crop_filter_handles_white_edges_on_both_axes(monkeypatch, tmp_path):
    worker = _load_worker_module()
    monkeypatch.setattr(worker, "_probe_video_size", lambda _uri: (720, 1280))
    raw_frame = _raw_gray_frame_with_white_borders(top=4, left=2, right=3)

    def fake_run(cmd, **_kwargs):
        with open(cmd[-1], "wb") as fh:
            fh.write(raw_frame)
        result = MagicMock()
        result.returncode = 0
        return result

    monkeypatch.setattr(worker.subprocess, "run", fake_run)

    assert (
        worker._detect_letterbox_crop_filter(str(tmp_path / "clip.mp4"))
        == "crop=670:1240:20:40"
    )


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


def test_render_command_allows_signed_companion_audio_query(monkeypatch):
    worker = _load_worker_module()
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("20.60.0.1", 0))
        ],
    )
    monkeypatch.setattr(worker, "_has_audio_stream", lambda _path, runner=None: True)

    signed_audio_url = (
        "https://hearme.blob.core.windows.net/audiostorage/voice-storage/"
        "feba0bfe11be9e8bbbe565e739e183b3-51458_tiger_API_clip.mp3"
        "?se=2026-07-26T12%3A45%3A08Z&sr=b&sp=r"
        "&sig=QF922ja76bbykFHtEhX3L9nE9dEi%2FBwGznYb1EWWZ2Q%3D&sv=2014-02-14"
    )
    spec = _make_render_spec(transform=None, duration_ms=4042, out_ms=4042)
    spec["inputs"]["assets"][0]["uri"] = (
        "http://host.docker.internal:3000/api/storage/files/media-jobs/assets/"
        "CNC8agzuMHZunktL2TGpT/Shot000.mp4"
    )
    spec["inputs"]["assets"].append(
        {
            "assetId": "voice-1",
            "kind": "audio",
            "uri": signed_audio_url,
            "durationMs": 40000,
        }
    )
    spec["inputs"]["project"]["tracks"].append(
        {
            "trackId": "track-a1",
            "type": "audio",
            "clips": [
                {
                    "clipId": "voice-1",
                    "assetId": "voice-1",
                    "startMs": 0,
                    "inMs": 0,
                    "outMs": 40000,
                    "durationMs": 40000,
                    "volume": 1,
                    "playbackRate": 1,
                }
            ],
        }
    )

    parsed = worker.parse_job_spec(json.dumps(spec))
    worker.validate_job_spec_security(parsed)
    cmd = worker.build_ffmpeg_command_for_render(parsed)

    assert signed_audio_url in cmd
    fc = cmd[cmd.index("-filter_complex") + 1]
    assert "[aoutv][exta0]amix=inputs=2:duration=longest:dropout_transition=0" in fc
