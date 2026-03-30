from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.social.webhook_dedup import SocialWebhookDedupService


@pytest.mark.asyncio
async def test_is_duplicate_returns_false_for_new_delivery_id() -> None:
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=0)

    service = SocialWebhookDedupService(redis)

    assert await service.is_duplicate("delivery-1") is False
    redis.exists.assert_awaited_once_with("social:webhook:delivery:delivery-1")


@pytest.mark.asyncio
async def test_is_duplicate_returns_true_for_processed_delivery_id() -> None:
    redis = AsyncMock()
    redis.exists = AsyncMock(return_value=1)

    service = SocialWebhookDedupService(redis)

    assert await service.is_duplicate("delivery-1") is True


@pytest.mark.asyncio
async def test_mark_processed_sets_24h_ttl() -> None:
    redis = AsyncMock()
    redis.set = AsyncMock()

    service = SocialWebhookDedupService(redis)
    await service.mark_processed("delivery-1")

    redis.set.assert_awaited_once_with("social:webhook:delivery:delivery-1", "1", ex=86400)


def test_build_message_dedup_key_uses_mid_and_fallback_timestamp() -> None:
    entry = {"id": "entry-1"}
    message = {"message": {"mid": "m_1"}}
    fallback_message = {"timestamp": 1234567890}

    assert SocialWebhookDedupService.build_message_dedup_key(entry, message, 0) == "entry-1_m_1"
    assert SocialWebhookDedupService.build_message_dedup_key(entry, fallback_message, 7) == "entry-1_1234567890_7"


def test_build_delivery_id_uses_first_message_mid_and_fallback_comment_id() -> None:
    payload = {
        "entry": [
            {"id": "page-1", "messaging": [{"message": {"mid": "m_1"}}]},
        ]
    }
    comment_payload = {
        "entry": [
            {"id": "page-1", "changes": [{"value": {"comment_id": "c_1"}}]},
        ]
    }

    assert SocialWebhookDedupService.build_delivery_id(payload) == "page-1_m_1"
    assert SocialWebhookDedupService.build_delivery_id(comment_payload) == "page-1_c_1"
