from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.services.social.webhook_normalizer import WebhookNormalizer


def _result(fetchone_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    return result


@pytest.mark.asyncio
async def test_normalize_messaging_event_creates_conversation_and_message() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((101, 0)),
        _result((201,)),
        _result(None),
    ])
    db.commit = AsyncMock()
    redis = AsyncMock()
    redis.incr = AsyncMock()

    normalizer = WebhookNormalizer(db, redis=redis)
    result = await normalizer.normalize_messaging_event(
        {
            "id": "page-123",
            "messaging": [
                {
                    "sender": {"id": "psid-1", "name": "Ada"},
                    "recipient": {"id": "page-123"},
                    "message": {"mid": "m_1", "text": "Hello"},
                    "timestamp": 1735689600000,
                }
            ],
        },
        page_id=7,
        tenant_id="tenant-1",
    )

    assert result["messages"][0]["conversation_id"] == 101
    assert result["messages"][0]["message_id"] == 201
    assert result["messages"][0]["provider_message_id"] == "m_1"
    db.commit.assert_awaited_once()
    redis.incr.assert_awaited_once_with("social:unread:tenant-1:101")


@pytest.mark.asyncio
async def test_normalize_messaging_event_uses_conversation_upsert() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((101, 0)),
        _result((201,)),
        _result(None),
    ])
    db.commit = AsyncMock()

    normalizer = WebhookNormalizer(db)
    await normalizer.normalize_messaging_event(
        {
            "id": "page-123",
            "messaging": [
                {
                    "sender": {"id": "psid-1"},
                    "recipient": {"id": "page-123"},
                    "message": {"mid": "m_1", "text": "Hello"},
                    "timestamp": 1735689600000,
                }
            ],
        },
        page_id=7,
        tenant_id="tenant-1",
    )

    assert 'ON CONFLICT ("pageId", "customerExternalId") DO UPDATE' in str(db.execute.await_args_list[0].args[0])


@pytest.mark.asyncio
async def test_normalize_messaging_event_handles_unique_violation_as_idempotent_success() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((101, 0)),
        IntegrityError("stmt", "params", Exception("duplicate")),
        _result((201,)),
    ])
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    normalizer = WebhookNormalizer(db)
    result = await normalizer.normalize_messaging_event(
        {
            "id": "page-123",
            "messaging": [
                {
                    "sender": {"id": "psid-1"},
                    "recipient": {"id": "page-123"},
                    "message": {"mid": "m_1", "text": "Hello"},
                    "timestamp": 1735689600000,
                }
            ],
        },
        page_id=7,
        tenant_id="tenant-1",
    )

    assert result["messages"][0]["duplicate"] is True
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_normalize_feed_event_creates_social_comment() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((301,)),
    ])
    db.commit = AsyncMock()

    normalizer = WebhookNormalizer(db)
    result = await normalizer.normalize_feed_event(
        {
            "id": "page-123",
            "changes": [
                {
                    "value": {
                        "comment_id": "c_1",
                        "post_id": "post_1",
                        "from": {"id": "author-1", "name": "Grace"},
                        "message": "Nice work",
                        "created_time": datetime(2025, 1, 1, tzinfo=timezone.utc),
                    }
                }
            ],
        },
        page_id=7,
        tenant_id="tenant-1",
    )

    assert result["comments"][0]["comment_id"] == 301
    assert result["comments"][0]["provider_comment_id"] == "c_1"
    assert result["comments"][0]["body"] == "Nice work"
