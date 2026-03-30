from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.tasks import social_publish_task


def _result(rows=None):
    result = MagicMock()
    result.fetchall.return_value = rows or []
    return result


def _scheduled_row(*, provider: str = "meta", page_status: str = "active", media_refs=None):
    return (
        11,  # post id
        "tenant-1",
        7,  # page id
        "scheduled",
        "Hello world",
        "https://example.com",
        media_refs,
        {"videoMetadata": {"width": 1080, "height": 1920, "durationSeconds": 120}},
        datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc),
        datetime(2026, 3, 24, 11, 0, tzinfo=timezone.utc),
        datetime(2026, 3, 24, 11, 30, tzinfo=timezone.utc),
        None,
        page_status,
        "page-7",
        "encrypted-page-token" if provider == "meta" else None,
        datetime(2026, 3, 25, 11, 30, tzinfo=timezone.utc),
        provider,
        "encrypted-provider-token" if provider != "meta" else None,
        None,
        datetime(2026, 3, 25, 11, 30, tzinfo=timezone.utc),
    )


@pytest.mark.asyncio
async def test_publish_scheduled_posts_queries_due_scheduled_posts_and_publishes(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_scheduled_row()]
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(rows), _result([])])
    db.commit = AsyncMock()

    monkeypatch.setattr(social_publish_task, "get_db_context", lambda: _FakeContext(db))
    monkeypatch.setattr(social_publish_task, "decrypt_smartspecweb", lambda value: "decrypted-token")
    publish_social_content = AsyncMock(return_value={"provider_post_id": "post-123", "status": "published"})
    monkeypatch.setattr(social_publish_task, "publish_social_content", publish_social_content)

    result = await social_publish_task.publish_scheduled_posts_async()

    assert result == {"processed": 1, "published": 1, "failed": 0, "skipped": 0}
    publish_social_content.assert_awaited_once()
    call_kwargs = publish_social_content.await_args.kwargs
    assert call_kwargs["provider"] == "meta"
    assert call_kwargs["page_id"] == "page-7"
    assert call_kwargs["access_token"] == "decrypted-token"
    assert call_kwargs["media_urls"] is None
    assert db.execute.await_count == 2
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_publish_scheduled_posts_marks_failed_on_api_error(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_scheduled_row(media_refs=["https://cdn.example.com/video.mp4"], provider="youtube")]
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(rows), _result([])])
    db.commit = AsyncMock()

    monkeypatch.setattr(social_publish_task, "get_db_context", lambda: _FakeContext(db))
    monkeypatch.setattr(social_publish_task, "decrypt_smartspecweb", lambda value: "decrypted-token")
    monkeypatch.setattr(social_publish_task, "publish_social_content", AsyncMock(side_effect=RuntimeError("boom")))

    result = await social_publish_task.publish_scheduled_posts_async()

    assert result["failed"] == 1
    assert result["published"] == 0


@pytest.mark.asyncio
async def test_publish_scheduled_posts_skips_disconnected_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_scheduled_row(page_status="disconnected")]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result(rows))
    db.commit = AsyncMock()

    monkeypatch.setattr(social_publish_task, "get_db_context", lambda: _FakeContext(db))
    publish_social_content = AsyncMock()
    monkeypatch.setattr(social_publish_task, "publish_social_content", publish_social_content)

    result = await social_publish_task.publish_scheduled_posts_async()

    assert result == {"processed": 1, "published": 0, "failed": 0, "skipped": 1}
    publish_social_content.assert_not_awaited()


class _FakeContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False
