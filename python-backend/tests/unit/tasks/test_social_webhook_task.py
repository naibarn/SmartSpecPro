from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.tasks import social_webhook_task


def _result(fetchone_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    return result


@pytest.mark.asyncio
async def test_process_social_webhook_event_loads_raw_event_resolves_page_and_publishes_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "object": "page",
        "entry": [
            {
                "id": "page-1",
                "messaging": [
                    {
                        "sender": {"id": "psid-1", "name": "Ada"},
                        "recipient": {"id": "page-1"},
                        "message": {"mid": "m_1", "text": "Hello"},
                        "timestamp": 1735689600000,
                    }
                ],
            }
        ],
    }
    raw_row = (
        55,
        "tenant-1",
        "meta",
        None,
        "delivery-1",
        "page",
        payload,
        {},
        "pending",
        None,
        datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    page_row = (77, "tenant-1", "page-1", "active", "Demo Page")

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(raw_row), _result(page_row)])

    cache_redis = AsyncMock()
    cache_redis.exists = AsyncMock(return_value=0)
    cache_redis.set = AsyncMock()
    stream_redis = AsyncMock()
    stream_redis.xadd = AsyncMock()

    mock_normalizer = AsyncMock()
    mock_normalizer.normalize_messaging_event = AsyncMock(
        return_value={
            "kind": "messaging",
            "messages": [
                {
                    "conversation_id": 11,
                    "message_id": 22,
                    "provider_message_id": "m_1",
                    "sender_external_id": "psid-1",
                    "body": "Hello",
                }
            ],
        }
    )
    mock_normalizer.normalize_feed_event = AsyncMock(return_value={"kind": "feed", "comments": []})
    monkeypatch.setattr(social_webhook_task, "WebhookNormalizer", lambda db, redis=None: mock_normalizer)

    mock_mark_status = AsyncMock()
    monkeypatch.setattr(social_webhook_task, "_mark_raw_event_status", mock_mark_status)

    result = await social_webhook_task.process_social_webhook_event_async(
        55,
        db=db,
        cache_redis=cache_redis,
        stream_redis=stream_redis,
    )

    assert result["status"] == "processed"
    assert result["processed_count"] == 1
    mock_normalizer.normalize_messaging_event.assert_awaited_once()
    stream_redis.xadd.assert_awaited_once()
    assert stream_redis.xadd.await_args.args[0] == "social:stream:77"
    assert stream_redis.xadd.await_args.args[1]["event_type"] == "messaging"
    mock_mark_status.assert_awaited_with(db, 55, "processed", None)


@pytest.mark.asyncio
async def test_process_social_webhook_event_skips_unknown_page_and_emits_audit(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "object": "page",
        "entry": [
            {"id": "page-unknown", "messaging": [{"sender": {"id": "psid-1"}, "message": {"mid": "m_1"}}]},
        ],
    }
    raw_row = (
        55,
        "tenant-1",
        "meta",
        None,
        "delivery-1",
        "page",
        payload,
        {},
        "pending",
        None,
        datetime(2025, 1, 1, tzinfo=timezone.utc),
    )

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(raw_row), _result(None)])

    cache_redis = AsyncMock()
    cache_redis.exists = AsyncMock(return_value=0)
    cache_redis.set = AsyncMock()
    stream_redis = AsyncMock()
    stream_redis.xadd = AsyncMock()

    mock_mark_status = AsyncMock()
    mock_audit = AsyncMock()
    monkeypatch.setattr(social_webhook_task, "_mark_raw_event_status", mock_mark_status)
    monkeypatch.setattr(social_webhook_task, "_audit_unknown_page", mock_audit)
    monkeypatch.setattr(social_webhook_task, "WebhookNormalizer", lambda db, redis=None: AsyncMock())

    result = await social_webhook_task.process_social_webhook_event_async(
        55,
        db=db,
        cache_redis=cache_redis,
        stream_redis=stream_redis,
    )

    assert result["status"] == "skipped"
    mock_audit.assert_awaited_once_with("page-unknown", 55)
    mock_mark_status.assert_awaited_with(db, 55, "skipped", "No processable webhook entries")


def test_process_social_webhook_event_routes_to_dlq_after_max_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_task = SimpleNamespace(
        request=SimpleNamespace(delivery_info={"routing_key": "social"}, retries=3),
        max_retries=3,
        retry=MagicMock(side_effect=AssertionError("should not retry")),
    )

    monkeypatch.setattr(
        social_webhook_task,
        "process_social_webhook_event_async",
        AsyncMock(side_effect=RuntimeError("boom")),
    )
    monkeypatch.setattr(social_webhook_task, "_mark_raw_event_status_with_new_session", AsyncMock())
    monkeypatch.setattr(social_webhook_task.process_social_webhook_event, "apply_async", MagicMock())

    result = social_webhook_task._handle_social_webhook_failure(fake_task, 55, RuntimeError("boom"))

    assert result["status"] == "sent_to_dlq"
    social_webhook_task.process_social_webhook_event.apply_async.assert_called_once_with(
        args=[55],
        queue="social_dlq",
    )
    social_webhook_task._mark_raw_event_status_with_new_session.assert_awaited_once()
