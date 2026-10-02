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
async def test_process_social_webhook_event_loads_raw_event_and_persists_normalized_message(monkeypatch: pytest.MonkeyPatch) -> None:
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
    monkeypatch.setattr(social_webhook_task, "WebhookNormalizer", lambda db: mock_normalizer)

    mock_mark_status = AsyncMock()
    monkeypatch.setattr(social_webhook_task, "_mark_raw_event_status", mock_mark_status)

    result = await social_webhook_task.process_social_webhook_event_async(
        55,
        db=db,
    )

    assert result["status"] == "processed"
    assert result["processed_count"] == 1
    mock_normalizer.normalize_messaging_event.assert_awaited_once()
    assert mock_normalizer.normalize_messaging_event.await_count == 1
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

    mock_mark_status = AsyncMock()
    mock_audit = AsyncMock()
    monkeypatch.setattr(social_webhook_task, "_mark_raw_event_status", mock_mark_status)
    monkeypatch.setattr(social_webhook_task, "_audit_unknown_page", mock_audit)
    monkeypatch.setattr(social_webhook_task, "WebhookNormalizer", lambda db: AsyncMock())

    result = await social_webhook_task.process_social_webhook_event_async(
        55,
        db=db,
    )

    assert result["status"] == "skipped"
    mock_audit.assert_awaited_once_with("page-unknown", 55)
    mock_mark_status.assert_awaited_with(db, 55, "skipped", "No processable webhook entries")


def test_process_social_webhook_event_hands_retry_to_worker_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.tasks.unified_job_task import HardTaskRetryRequested

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
    with pytest.raises(HardTaskRetryRequested):
        social_webhook_task._handle_social_webhook_failure(fake_task, 55, RuntimeError("boom"))

    fake_task.retry.assert_not_called()
