"""Tests for render hash computation.

The render hash ensures idempotent rendering -- same inputs always produce
the same hash, and any change to inputs/profile produces a different hash.
"""
import pytest

from app.video.render_hash import compute_render_hash


def _make_project(
    width=1920, height=1080, fps=30, sample_rate=48000, clips=None, name="Test Project"
):
    """Create a minimal project dict for testing."""
    if clips is None:
        clips = [
            {
                "assetId": "asset-1",
                "startTime": 0,
                "duration": 5.0,
                "trimIn": 0,
                "trimOut": 5.0,
                "volume": 1.0,
                "speed": 1.0,
                "effects": [],
            }
        ]
    return {
        "version": "1.0",
        "name": name,
        "createdAt": "2026-01-01T00:00:00Z",
        "modifiedAt": "2026-02-15T00:00:00Z",
        "settings": {
            "width": width,
            "height": height,
            "fps": fps,
            "sampleRate": sample_rate,
            "duration": 10,
        },
        "timeline": {
            "tracks": [
                {
                    "type": "video",
                    "name": "V1",
                    "clips": clips,
                    "muted": False,
                }
            ]
        },
        "assets": {},
    }


@pytest.mark.unit
class TestRenderHash:
    """Verify deterministic render hash generation."""

    def test_same_inputs_produce_same_hash(self):
        """Given identical timeline spec, assets, and profile,
        compute_render_hash must return the same SHA-256 digest."""
        project = _make_project()
        asset_keys = {"asset-1": "media/video1.mp4"}

        hash1 = compute_render_hash(project, asset_keys, "standard")
        hash2 = compute_render_hash(project, asset_keys, "standard")

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex

    def test_different_profiles_produce_different_hashes(self):
        """Changing only the render profile (e.g., preview vs standard)
        must change the render hash, even when timeline and assets are identical."""
        project = _make_project()
        asset_keys = {"asset-1": "media/video1.mp4"}

        hash_preview = compute_render_hash(project, asset_keys, "preview")
        hash_standard = compute_render_hash(project, asset_keys, "standard")
        hash_high = compute_render_hash(project, asset_keys, "high")

        assert hash_preview != hash_standard
        assert hash_standard != hash_high
        assert hash_preview != hash_high

    def test_changed_timeline_produces_different_hash(self):
        """Modifying any clip timing, adding a clip, or changing a transition
        must produce a different render hash."""
        asset_keys = {"asset-1": "media/video1.mp4"}

        project1 = _make_project()
        project2 = _make_project(
            clips=[
                {
                    "assetId": "asset-1",
                    "startTime": 0,
                    "duration": 10.0,  # Changed duration
                    "trimIn": 0,
                    "trimOut": 10.0,
                    "volume": 1.0,
                    "speed": 1.0,
                    "effects": [],
                }
            ]
        )

        hash1 = compute_render_hash(project1, asset_keys, "standard")
        hash2 = compute_render_hash(project2, asset_keys, "standard")

        assert hash1 != hash2

    def test_hash_ignores_non_deterministic_fields(self):
        """Fields like modifiedAt, createdAt, and UI-only state (selectedClipIds)
        must not affect the render hash."""
        asset_keys = {"asset-1": "media/video1.mp4"}

        project1 = _make_project(name="Project A")
        project2 = _make_project(name="Project B")

        # Modify non-deterministic fields
        project2["createdAt"] = "2025-01-01T00:00:00Z"
        project2["modifiedAt"] = "2025-06-01T00:00:00Z"

        hash1 = compute_render_hash(project1, asset_keys, "standard")
        hash2 = compute_render_hash(project2, asset_keys, "standard")

        assert hash1 == hash2

    def test_different_asset_keys_produce_different_hash(self):
        """Changing asset R2 keys changes the hash even if timeline is the same."""
        project = _make_project()

        hash1 = compute_render_hash(project, {"asset-1": "media/video1.mp4"}, "standard")
        hash2 = compute_render_hash(project, {"asset-1": "media/video2.mp4"}, "standard")

        assert hash1 != hash2

    def test_different_resolution_produces_different_hash(self):
        """Changing project resolution changes the hash."""
        asset_keys = {"asset-1": "media/video1.mp4"}

        hash1 = compute_render_hash(_make_project(width=1920, height=1080), asset_keys, "standard")
        hash2 = compute_render_hash(_make_project(width=1280, height=720), asset_keys, "standard")

        assert hash1 != hash2
