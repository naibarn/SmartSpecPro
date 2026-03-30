from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api import meta_posts


@pytest.mark.asyncio
async def test_publish_post_uses_page_token_and_returns_provider_post_id(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.create_post = AsyncMock(return_value={"id": "post-123"})
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(meta_posts, "MetaGraphClient", mock_client_cls)

    result = await meta_posts.publish_post(
        meta_posts.PublishPostRequest(
            page_id="page-123",
            page_access_token="page-token",
            message="Hello world",
            link="https://example.com",
        ),
        _auth=None,
    )

    assert result["status"] == "published"
    assert result["provider_post_id"] == "post-123"
    mock_client_cls.assert_called_once_with("page-token", page_id="page-123")
    client.create_post.assert_awaited_once_with("Hello world", "https://example.com", scheduled_at=None)


@pytest.mark.asyncio
async def test_schedule_post_requires_scheduled_time(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(HTTPException):
        await meta_posts.schedule_post(
            meta_posts.PublishPostRequest(
                page_id="page-123",
                page_access_token="page-token",
                message="Hello world",
            ),
            _auth=None,
        )


@pytest.mark.asyncio
async def test_schedule_post_uses_scheduled_publish_time(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.create_post = AsyncMock(return_value={"id": "post-456"})
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(meta_posts, "MetaGraphClient", mock_client_cls)

    result = await meta_posts.schedule_post(
        meta_posts.PublishPostRequest(
            page_id="page-123",
            page_access_token="page-token",
            message="Hello world",
            scheduled_publish_time=1_765_000_000,
        ),
        _auth=None,
    )

    assert result["status"] == "scheduled"
    assert result["provider_post_id"] == "post-456"
    client.create_post.assert_awaited_once_with("Hello world", None, scheduled_at=1_765_000_000)
