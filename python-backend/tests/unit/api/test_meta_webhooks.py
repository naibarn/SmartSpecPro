from __future__ import annotations

import hashlib
import hmac
import inspect
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api import meta_webhooks
from app.services.social import webhook_validator


def _result(fetchone_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    return result


@pytest.mark.asyncio
async def test_get_returns_hub_challenge_when_verify_token_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(meta_webhooks, "_load_meta_webhook_secret", AsyncMock(return_value="verify-secret"))

    response = await meta_webhooks.verify_meta_webhook(
        request=SimpleNamespace(),
        hub_mode="subscribe",
        hub_verify_token="verify-secret",
        hub_challenge="challenge-123",
        db=AsyncMock(),
    )

    assert response.body == b"challenge-123"


@pytest.mark.asyncio
async def test_get_returns_403_when_verify_token_mismatches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(meta_webhooks, "_load_meta_webhook_secret", AsyncMock(return_value="verify-secret"))

    with pytest.raises(HTTPException) as exc:
        await meta_webhooks.verify_meta_webhook(
            request=SimpleNamespace(),
            hub_mode="subscribe",
            hub_verify_token="wrong",
            hub_challenge="challenge-123",
            db=AsyncMock(),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_post_accepts_valid_signature_stores_raw_payload_and_dispatches_one_task(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "object": "page",
        "entry": [
            {
                "id": "page-1",
                "messaging": [
                    {"sender": {"id": "psid-1"}, "recipient": {"id": "page-1"}, "message": {"mid": "m_1", "text": "Hello"}},
                    {"sender": {"id": "psid-1"}, "recipient": {"id": "page-1"}, "message": {"mid": "m_2", "text": "World"}},
                ],
            }
        ],
    }
    raw_body = json.dumps(payload).encode("utf-8")
    signature = "sha256=" + hmac.new(b"app-secret", raw_body, hashlib.sha256).hexdigest()
    request = SimpleNamespace(
        headers={
            "X-Hub-Signature-256": signature,
            "X-Hub-Delivery": "delivery-123",
            "Content-Type": "application/json",
        }
    )

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result((17,)))
    db.commit = AsyncMock()

    monkeypatch.setattr(meta_webhooks, "_load_meta_webhook_secret", AsyncMock(return_value="app-secret"))
    dispatch = MagicMock()
    monkeypatch.setattr(meta_webhooks.process_social_webhook_event, "delay", dispatch)

    result = await meta_webhooks.ingest_meta_webhook_payload(raw_body, request, db)

    assert result["ok"] is True
    assert result["raw_event_id"] == 17
    dispatch.assert_called_once_with(17)
    stored_headers = db.execute.await_args_list[0].args[1]["headers"]
    assert stored_headers == {
        "content-type": "application/json",
        "x-hub-delivery": "delivery-123",
    }


@pytest.mark.asyncio
async def test_post_rejects_invalid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_body = json.dumps({"object": "page", "entry": []}).encode("utf-8")
    request = SimpleNamespace(headers={"X-Hub-Signature-256": "sha256=bad"})
    db = AsyncMock()
    monkeypatch.setattr(meta_webhooks, "_load_meta_webhook_secret", AsyncMock(return_value="app-secret"))

    with pytest.raises(HTTPException) as exc:
        await meta_webhooks.ingest_meta_webhook_payload(raw_body, request, db)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_post_returns_200_even_when_celery_dispatch_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_body = json.dumps({"object": "page", "entry": [{"id": "page-1", "messaging": []}]}).encode("utf-8")
    signature = "sha256=" + hmac.new(b"app-secret", raw_body, hashlib.sha256).hexdigest()
    request = SimpleNamespace(headers={"X-Hub-Signature-256": signature, "X-Hub-Delivery": "delivery-123"})

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result((17,)))
    db.commit = AsyncMock()

    monkeypatch.setattr(meta_webhooks, "_load_meta_webhook_secret", AsyncMock(return_value="app-secret"))
    monkeypatch.setattr(meta_webhooks.process_social_webhook_event, "delay", MagicMock(side_effect=RuntimeError("boom")))

    result = await meta_webhooks.ingest_meta_webhook_payload(raw_body, request, db)

    assert result["ok"] is True
    assert result["raw_event_id"] == 17


def test_signature_validator_uses_constant_time_compare() -> None:
    source = inspect.getsource(webhook_validator.validate_meta_webhook_signature)
    assert "compare_digest" in source


def test_validate_meta_webhook_signature_accepts_valid_signature() -> None:
    body = b"{}"
    signature = hmac.new(b"secret", body, hashlib.sha256).hexdigest()
    assert webhook_validator.validate_meta_webhook_signature(body, f"sha256={signature}", "secret") is True
