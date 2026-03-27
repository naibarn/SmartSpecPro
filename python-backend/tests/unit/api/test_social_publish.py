from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api import social_publish


@pytest.mark.asyncio
async def test_publish_social_post_forwards_provider_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    publish = AsyncMock(return_value={
        "provider": "youtube",
        "status": "published",
        "provider_post_id": "yt-123",
        "result": {"id": "yt-123"},
    })
    monkeypatch.setattr(social_publish, "publish_social_content", publish)

    result = await social_publish.publish_social_post(
        social_publish.PublishSocialRequest(
            provider="youtube",
            page_id="page-123",
            access_token="provider-token",
            message="Shorts upload",
            media_urls=["https://cdn.example.com/video.mp4"],
            video_metadata=social_publish.VideoMetadata(width=1080, height=1920, duration_seconds=90),
        ),
        _auth=None,
    )

    assert result == {
        "provider": "youtube",
        "status": "published",
        "provider_post_id": "yt-123",
        "shorts_candidate": None,
        "result": {"id": "yt-123"},
    }
    publish.assert_awaited_once()
    call_kwargs = publish.await_args.kwargs
    assert call_kwargs["provider"] == "youtube"
    assert call_kwargs["page_id"] == "page-123"
    assert call_kwargs["access_token"] == "provider-token"
    assert call_kwargs["media_urls"] == ["https://cdn.example.com/video.mp4"]


@pytest.mark.asyncio
async def test_verify_internal_token_requires_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(social_publish.settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "test-internal-token", raising=False)
    monkeypatch.setattr(social_publish.settings, "SMARTSPEC_PROXY_TOKEN", None, raising=False)

    with pytest.raises(HTTPException) as exc_info:
        await social_publish._verify_internal_token(x_internal_token=None, x_proxy_token=None)

    assert exc_info.value.status_code == 401
