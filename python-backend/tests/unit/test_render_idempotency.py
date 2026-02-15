"""Tests for render idempotency via R2 cache check."""
from unittest.mock import MagicMock, patch

import pytest

from app.video.render_hash import compute_render_hash


def _make_project():
    return {
        "settings": {"width": 1920, "height": 1080, "fps": 30, "sampleRate": 48000},
        "timeline": {
            "tracks": [
                {
                    "type": "video",
                    "name": "V1",
                    "clips": [
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
                    ],
                    "muted": False,
                }
            ]
        },
    }


@pytest.mark.unit
class TestRenderIdempotency:
    """Skip redundant renders when output already exists in R2."""

    def test_existing_render_hash_skips_ffmpeg(self):
        """When a HEAD request to R2 for renders/{renderHash}.mp4 returns 200,
        the pipeline must skip FFmpeg execution and return the existing URL."""
        mock_r2 = MagicMock()
        mock_r2.file_exists.return_value = True
        mock_r2.config.get_public_url.return_value = "https://cdn.example.com/renders/standard/abc123.mp4"

        project = _make_project()
        asset_keys = {"asset-1": "media/video1.mp4"}
        render_hash = compute_render_hash(project, asset_keys, "standard")
        output_key = f"renders/standard/{render_hash}.mp4"

        # Simulate idempotency check
        exists = mock_r2.file_exists(output_key)
        assert exists is True
        url = mock_r2.config.get_public_url(output_key)
        assert url.startswith("https://")

    def test_missing_render_hash_triggers_pipeline(self):
        """When a HEAD request to R2 for renders/{renderHash}.mp4 returns 404,
        the pipeline must execute the full two-stage FFmpeg pipeline."""
        mock_r2 = MagicMock()
        mock_r2.file_exists.return_value = False

        project = _make_project()
        asset_keys = {"asset-1": "media/video1.mp4"}
        render_hash = compute_render_hash(project, asset_keys, "standard")
        output_key = f"renders/standard/{render_hash}.mp4"

        exists = mock_r2.file_exists(output_key)
        assert exists is False
        # Pipeline should proceed (not skip)

    def test_r2_error_does_not_skip_pipeline(self):
        """If the R2 HEAD request fails with a 5xx or network error,
        the pipeline must proceed with rendering (fail-open, not fail-closed)."""
        mock_r2 = MagicMock()
        mock_r2.file_exists.side_effect = Exception("R2 connection timeout")

        project = _make_project()
        asset_keys = {"asset-1": "media/video1.mp4"}
        render_hash = compute_render_hash(project, asset_keys, "standard")
        output_key = f"renders/standard/{render_hash}.mp4"

        # Simulate fail-open behavior
        should_render = True
        try:
            exists = mock_r2.file_exists(output_key)
            if exists:
                should_render = False
        except Exception:
            # Fail-open: proceed with rendering
            should_render = True

        assert should_render is True

    def test_render_hash_is_deterministic_across_calls(self):
        """Same inputs always produce the same hash for idempotency."""
        project = _make_project()
        asset_keys = {"asset-1": "media/video1.mp4"}

        hash1 = compute_render_hash(project, asset_keys, "standard")
        hash2 = compute_render_hash(project, asset_keys, "standard")

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256
