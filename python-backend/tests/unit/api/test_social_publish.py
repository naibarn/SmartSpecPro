from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException

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


@pytest.mark.asyncio
async def test_reels_internal_endpoints_stream_and_validate_upload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(social_publish.settings, "SMARTSPEC_PROXY_TOKEN", "internal-token", raising=False)
    calls = []

    class FakeMetaClient:
        _validate_reel_upload_url = staticmethod(social_publish.MetaGraphClient._validate_reel_upload_url)

        def __init__(self, access_token, *, page_id=None):
            self.access_token, self.page_id = access_token, page_id

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def start_reel_upload(self):
            return {"video_id": "456", "upload_url": "https://rupload.facebook.com/video-upload/456"}

        async def get_reel_status(self, video_id):
            return {"status": {"uploading_phase": {"bytes_transfered": 2}}}

        async def finish_reel_upload(self, **kwargs):
            calls.append(kwargs)
            return {"success": True}

        async def upload_reel_binary(self, **kwargs):
            calls.append(b"".join([chunk async for chunk in kwargs["content"]]))
            return {"success": True}

    monkeypatch.setattr(social_publish, "MetaGraphClient", FakeMetaClient)
    app = FastAPI()
    app.include_router(social_publish.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        base = "/api/internal/social/reels/"
        payload = {"page_id": "123", "access_token": "page-secret"}
        assert (await client.post(base + "start", json=payload)).status_code == 401
        auth = {"x-internal-token": "internal-token"}
        assert (await client.post(base + "start", json=payload, headers=auth)).json()["video_id"] == "456"
        video = {**payload, "video_id": "456"}
        assert (await client.post(base + "status", json=video, headers=auth)).json()["status"]["uploading_phase"]["bytes_transfered"] == 2
        finish = await client.post(base + "finish", json={**video, "description": "#demo", "is_ai_generated": True}, headers=auth)
        assert finish.json() == {"success": True}
        headers = {**auth, "x-meta-access-token": "page-secret", "x-meta-video-id": "456",
                   "x-meta-upload-url": "https://rupload.facebook.com/video-upload/456", "x-meta-file-size": "5",
                   "x-meta-offset": "2", "content-length": "3"}
        assert (await client.post(base + "upload", content=b"abc", headers=headers)).json() == {"success": True}
        headers["x-meta-upload-url"] = "https://evil.test/video-upload/456"
        assert (await client.post(base + "upload", content=b"abc", headers=headers)).status_code == 400
        headers["x-meta-upload-url"] = "https://rupload.facebook.com/video-upload/456"
        headers["x-meta-file-size"] = str(social_publish.REELS_MAX_BYTES + 1)
        assert (await client.post(base + "upload", content=b"abc", headers=headers)).status_code == 422
    assert calls == [{"video_id": "456", "description": "#demo", "is_ai_generated": True}, b"abc"]


@pytest.mark.asyncio
async def test_photo_publish_internal_endpoint_streams_binary_and_requires_internal_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(social_publish.settings, "SMARTSPEC_PROXY_TOKEN", "internal-token", raising=False)
    calls = []

    class FakeMetaClient:
        def __init__(self, access_token, *, page_id=None):
            self.access_token, self.page_id = access_token, page_id

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def publish_page_photo(self, **kwargs):
            calls.append((self.page_id, self.access_token, kwargs))
            return {"id": "photo-123", "post_id": "page-post-456"}

    monkeypatch.setattr(social_publish, "MetaGraphClient", FakeMetaClient)
    app = FastAPI()
    app.include_router(social_publish.router)
    headers = {
        "x-internal-token": "internal-token",
        "x-meta-access-token": "page-secret",
        "x-meta-page-id": "123",
        "x-meta-file-name": "review.png",
        "x-meta-content-type": "image/png",
        "x-meta-file-size": "15",
        "x-meta-caption": "Review #care",
        "content-type": "image/png",
    }
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        unauthorized = await client.post("/api/internal/social/photos/publish", content=b"png-image-bytes", headers={
            key: value for key, value in headers.items() if key != "x-internal-token"
        })
        assert unauthorized.status_code == 401

        published = await client.post("/api/internal/social/photos/publish", content=b"png-image-bytes", headers=headers)
        assert published.status_code == 200
        assert published.json() == {"id": "photo-123", "post_id": "page-post-456"}

    assert calls == [("123", "page-secret", {
        "message": "Review #care",
        "content": b"png-image-bytes",
        "filename": "review.png",
        "content_type": "image/png",
    })]
