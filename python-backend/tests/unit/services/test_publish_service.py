from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.social import publish_service


@pytest.mark.asyncio
async def test_publish_social_content_meta_uses_meta_graph_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = AsyncMock()
    client.create_post = AsyncMock(return_value={"id": "post-123"})
    client.close = AsyncMock()
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(publish_service, "MetaGraphClient", mock_client_cls)

    result = await publish_service.publish_social_content(
        provider="meta",
        access_token="page-token",
        page_id="page-123",
        message="Hello world",
        link="https://example.com",
    )

    assert result["provider"] == "meta"
    assert result["provider_post_id"] == "post-123"
    mock_client_cls.assert_called_once_with("page-token", page_id="page-123")
    client.create_post.assert_awaited_once_with("Hello world", "https://example.com", scheduled_at=None)
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_publish_social_content_tiktok_uses_direct_post(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    media = tmp_path / "clip.mp4"
    media.write_bytes(b"video-bytes")

    monkeypatch.setattr(
        publish_service,
        "_download_media_url",
        AsyncMock(return_value=(media, "video/mp4", media.stat().st_size)),
    )

    client = MagicMock()
    client.query_creator_info = AsyncMock(return_value={
        "data": {
            "privacy_level_options": ["SELF_ONLY", "PUBLIC_TO_FRIENDS"],
        }
    })
    client.init_direct_video_post = AsyncMock(return_value={
        "data": {
            "upload_url": "https://open-upload.tiktokapis.com/upload/1",
            "publish_id": "publish-1",
        }
    })
    client.upload_file_to_upload_url = AsyncMock()
    client.wait_for_terminal_status = AsyncMock(return_value={"data": {"status": "PUBLISH_COMPLETE"}})
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    monkeypatch.setattr(publish_service, "TikTokContentPostingClient", MagicMock(return_value=client))

    result = await publish_service.publish_social_content(
        provider="tiktok",
        access_token="tiktok-token",
        page_id="page-123",
        media_urls=["https://cdn.example.com/video.mp4"],
        message="Launch clip",
    )

    assert result["provider"] == "tiktok"
    assert result["provider_post_id"] == "publish-1"
    client.query_creator_info.assert_awaited_once()
    client.init_direct_video_post.assert_awaited_once()
    client.upload_file_to_upload_url.assert_awaited_once()
    client.wait_for_terminal_status.assert_awaited_once_with("publish-1")


@pytest.mark.asyncio
async def test_publish_social_content_youtube_sets_shorts_candidate(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    media = tmp_path / "clip.mp4"
    media.write_bytes(b"video-bytes")

    monkeypatch.setattr(
        publish_service,
        "_download_media_url",
        AsyncMock(return_value=(media, "video/mp4", media.stat().st_size)),
    )
    monkeypatch.setattr(
        publish_service,
        "_build_youtube_credentials",
        lambda access_token: SimpleNamespace(token=access_token),
    )

    class DummyYouTubeClient:
        def __init__(self, credentials):
            self.credentials = credentials
            self.upload_video = AsyncMock(return_value={"id": "yt-123"})

        @staticmethod
        def classify_shorts_candidate(width: int, height: int, duration_seconds: int) -> bool:
            return duration_seconds <= 180 and height >= width

    monkeypatch.setattr(publish_service, "YouTubeVideoClient", DummyYouTubeClient)

    result = await publish_service.publish_social_content(
        provider="youtube",
        access_token="youtube-token",
        page_id="page-123",
        media_urls=["https://cdn.example.com/video.mp4"],
        title="Short clip",
        description="Short clip",
        video_metadata={"width": 1080, "height": 1920, "duration_seconds": 90},
    )

    assert result["provider"] == "youtube"
    assert result["provider_post_id"] == "yt-123"
    assert result["shorts_candidate"] is True
    assert result["status"] == "published"
