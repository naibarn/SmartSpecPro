from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services.social.webhook_dedup import SocialWebhookDedupService


@pytest.mark.asyncio
async def test_is_duplicate_returns_false_for_new_delivery_id() -> None:
    with patch(
        "app.services.social.webhook_dedup.is_ttl_dedupe_key_present",
        new_callable=AsyncMock,
        return_value=False,
    ) as is_present:
        service = SocialWebhookDedupService()

        assert await service.is_duplicate("delivery-1") is False
        is_present.assert_awaited_once_with(
            "social_webhook", "social:webhook:delivery:delivery-1"
        )


@pytest.mark.asyncio
async def test_is_duplicate_returns_true_for_processed_delivery_id() -> None:
    with patch(
        "app.services.social.webhook_dedup.is_ttl_dedupe_key_present",
        new_callable=AsyncMock,
        return_value=True,
    ) as is_present:
        service = SocialWebhookDedupService()

        assert await service.is_duplicate("delivery-1") is True
        is_present.assert_awaited_once_with(
            "social_webhook", "social:webhook:delivery:delivery-1"
        )


@pytest.mark.asyncio
async def test_mark_processed_sets_24h_ttl() -> None:
    with patch(
        "app.services.social.webhook_dedup.mark_ttl_dedupe_key",
        new_callable=AsyncMock,
    ) as mark_present:
        service = SocialWebhookDedupService()
        await service.mark_processed("delivery-1")

        mark_present.assert_awaited_once_with(
            "social_webhook", "social:webhook:delivery:delivery-1", 86400
        )


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
