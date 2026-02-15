"""Tests for video job routing to short vs long queues."""
import pytest


def _make_project(v1_clips=None, v2_clips=None, t1_clips=None):
    """Create a minimal project dict for routing tests."""
    tracks = []
    if v1_clips is not None:
        tracks.append({
            "type": "video",
            "name": "V1",
            "clips": v1_clips,
            "muted": False,
            "locked": False,
            "visible": True,
        })
    else:
        tracks.append({
            "type": "video",
            "name": "V1",
            "clips": [
                {"id": "c1", "assetId": "a1", "startTime": 0, "duration": 30,
                 "trimIn": 0, "trimOut": 30, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v1"},
            ],
            "muted": False,
            "locked": False,
            "visible": True,
        })
    if v2_clips is not None:
        tracks.append({
            "type": "overlay",
            "name": "V2",
            "clips": v2_clips,
            "muted": False,
            "locked": False,
            "visible": True,
        })
    else:
        tracks.append({
            "type": "overlay",
            "name": "V2",
            "clips": [],
            "muted": False,
            "locked": False,
            "visible": True,
        })
    if t1_clips is not None:
        tracks.append({
            "type": "text",
            "name": "T1",
            "clips": t1_clips,
            "muted": False,
            "locked": False,
            "visible": True,
        })
    else:
        tracks.append({
            "type": "text",
            "name": "T1",
            "clips": [],
            "muted": False,
            "locked": False,
            "visible": True,
        })
    tracks.append({
        "type": "audio",
        "name": "A1",
        "clips": [],
        "muted": False,
        "locked": False,
        "visible": True,
    })

    return {
        "version": "1.0",
        "name": "Test",
        "createdAt": "2026-01-01",
        "modifiedAt": "2026-01-01",
        "settings": {"width": 1920, "height": 1080, "fps": 30, "sampleRate": 48000, "duration": 30},
        "timeline": {"tracks": tracks},
        "assets": {},
        "audioMixing": {"ducking": {"enabled": False, "voiceoverTrackId": "", "threshold": 0, "ratio": 0, "attack": 0, "release": 0, "makeupGain": 0, "backgroundGain": 0}, "masterVolume": 1.0},
        "export": {"codec": "h264", "bitrate": 6000, "audioCodec": "aac", "audioBitrate": 192},
    }


# We test the Python-side routing logic that mirrors the TypeScript version
def _route_video_job(project: dict) -> str:
    """Python mirror of routeVideoJob for testing."""
    tracks = project.get("timeline", {}).get("tracks", [])
    total_duration = 0
    has_overlays = False

    for track in tracks:
        track_type = track.get("type")
        track_name = track.get("name", "")
        if track_type == "video" and track_name == "V1":
            for clip in track.get("clips", []):
                total_duration += clip.get("duration", 0)
        if (track_type == "overlay" or track_name == "V2") and len(track.get("clips", [])) > 0:
            has_overlays = True
        if (track_type == "text" or track_name == "T1") and len(track.get("clips", [])) > 0:
            has_overlays = True

    if total_duration < 120 and not has_overlays:
        return "video-jobs-short"
    return "video-jobs-long"


@pytest.mark.unit
class TestJobRouting:
    """Route render jobs to the appropriate Cloud Tasks queue."""

    def test_short_clip_routes_to_short_queue(self):
        """A render with total input duration < 2 minutes and no V2/T1 overlays
        must route to the video-jobs-short queue."""
        project = _make_project(
            v1_clips=[
                {"id": "c1", "assetId": "a1", "startTime": 0, "duration": 60,
                 "trimIn": 0, "trimOut": 60, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v1"},
            ]
        )
        assert _route_video_job(project) == "video-jobs-short"

    def test_long_clip_routes_to_long_queue(self):
        """A render with total input duration >= 2 minutes
        must route to the video-jobs-long queue."""
        project = _make_project(
            v1_clips=[
                {"id": "c1", "assetId": "a1", "startTime": 0, "duration": 150,
                 "trimIn": 0, "trimOut": 150, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v1"},
            ]
        )
        assert _route_video_job(project) == "video-jobs-long"

    def test_overlays_force_long_queue(self):
        """A render with V2 or T1 track content must route to the
        video-jobs-long queue, even if duration is under 2 minutes."""
        project = _make_project(
            v1_clips=[
                {"id": "c1", "assetId": "a1", "startTime": 0, "duration": 30,
                 "trimIn": 0, "trimOut": 30, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v1"},
            ],
            v2_clips=[
                {"id": "c2", "assetId": "a2", "startTime": 5, "duration": 10,
                 "trimIn": 0, "trimOut": 10, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v2"},
            ],
        )
        assert _route_video_job(project) == "video-jobs-long"

    def test_text_clips_force_long_queue(self):
        """Text track clips also force the long queue."""
        project = _make_project(
            v1_clips=[
                {"id": "c1", "assetId": "a1", "startTime": 0, "duration": 30,
                 "trimIn": 0, "trimOut": 30, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v1"},
            ],
            t1_clips=[
                {"id": "t1", "assetId": "txt1", "startTime": 0, "duration": 5,
                 "trimIn": 0, "trimOut": 5, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-t1"},
            ],
        )
        assert _route_video_job(project) == "video-jobs-long"

    def test_exactly_120s_routes_to_long(self):
        """Boundary: exactly 120 seconds should route to long queue."""
        project = _make_project(
            v1_clips=[
                {"id": "c1", "assetId": "a1", "startTime": 0, "duration": 120,
                 "trimIn": 0, "trimOut": 120, "volume": 1.0, "speed": 1.0, "effects": [],
                 "trackId": "track-v1"},
            ]
        )
        assert _route_video_job(project) == "video-jobs-long"
