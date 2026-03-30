from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api import meta_comments


@pytest.mark.asyncio
async def test_reply_to_comment_uses_page_access_token_and_returns_provider_comment_id(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.reply_to_comment = AsyncMock(return_value={"id": "c-123"})
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(meta_comments, "MetaGraphClient", mock_client_cls)

    result = await meta_comments.reply_to_comment(
        meta_comments.ReplyCommentRequest(
            object_id="comment-1",
            message="Thanks!",
            page_access_token="page-token",
            page_id="page-123",
        ),
        _auth=None,
    )

    assert result["status"] == "replied"
    assert result["provider_comment_id"] == "c-123"
    mock_client_cls.assert_called_once_with("page-token", page_id="page-123")
    client.reply_to_comment.assert_awaited_once_with("comment-1", "Thanks!")


@pytest.mark.asyncio
async def test_hide_comment_returns_provider_comment_id(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.hide_comment = AsyncMock(return_value={"comment_id": "c-456"})
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(meta_comments, "MetaGraphClient", mock_client_cls)

    result = await meta_comments.hide_comment(
        meta_comments.HideCommentRequest(
            comment_id="comment-2",
            page_access_token="page-token",
            page_id="page-123",
        ),
        _auth=None,
    )

    assert result["status"] == "hidden"
    assert result["provider_comment_id"] == "c-456"
    client.hide_comment.assert_awaited_once_with("comment-2")


@pytest.mark.asyncio
async def test_delete_comment_returns_provider_comment_id(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.delete_comment = AsyncMock(return_value={"id": "c-789"})
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(meta_comments, "MetaGraphClient", mock_client_cls)

    result = await meta_comments.delete_comment(
        meta_comments.DeleteCommentRequest(
            comment_id="comment-3",
            page_access_token="page-token",
            page_id="page-123",
        ),
        _auth=None,
    )

    assert result["status"] == "deleted"
    assert result["provider_comment_id"] == "c-789"
    client.delete_comment.assert_awaited_once_with("comment-3")
