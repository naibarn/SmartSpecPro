from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.social.youtube_client import YouTubeVideoClient


def _make_media_upload_mock() -> MagicMock:
    media = MagicMock()
    return media


@pytest.mark.asyncio
async def test_upload_video_builds_resumable_request(tmp_path: Path):
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"fake-bytes")

    media_upload = _make_media_upload_mock()
    request = MagicMock()
    request.execute.return_value = {"id": "video-123"}
    videos = MagicMock()
    videos.insert.return_value = request
    service = MagicMock()
    service.videos.return_value = videos

    with patch("app.services.social.youtube_client.MediaFileUpload", return_value=media_upload), patch(
        "app.services.social.youtube_client.YouTubeVideoClient._get_client",
        return_value=service,
    ):
        client = YouTubeVideoClient(credentials=SimpleNamespace())
        payload = await client.upload_video(
            video,
            title="Hello Shorts",
            description="Demo",
            publish_at=datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc),
            tags=["demo", "shorts"],
        )

    assert payload == {"id": "video-123"}
    videos.insert.assert_called_once()
    call_kwargs = videos.insert.call_args.kwargs
    assert call_kwargs["part"] == "snippet,status"
    assert call_kwargs["body"]["status"]["privacyStatus"] == "private"
    assert call_kwargs["body"]["status"]["publishAt"] == "2026-03-24T12:00:00Z"
    assert call_kwargs["body"]["snippet"]["tags"] == ["demo", "shorts"]


def test_classify_shorts_candidate():
    assert YouTubeVideoClient.classify_shorts_candidate(1080, 1920, 120) is True
    assert YouTubeVideoClient.classify_shorts_candidate(1920, 1080, 120) is False
    assert YouTubeVideoClient.classify_shorts_candidate(1080, 1920, 240) is False


@pytest.mark.asyncio
async def test_fetch_video_returns_first_item():
    request = MagicMock()
    request.execute.return_value = {
        "items": [
            {
                "id": "video-123",
                "status": {"privacyStatus": "public"},
            }
        ]
    }
    videos = MagicMock()
    videos.list.return_value = request
    service = MagicMock()
    service.videos.return_value = videos

    with patch("app.services.social.youtube_client.YouTubeVideoClient._get_client", return_value=service):
        client = YouTubeVideoClient(credentials=SimpleNamespace())
        payload = await client.fetch_video("video-123")

    assert payload["id"] == "video-123"
    videos.list.assert_called_once_with(part="snippet,status,processingDetails", id="video-123")
