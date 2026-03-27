from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api import meta_messages


def _result(fetchone_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    return result


@pytest.mark.asyncio
async def test_send_message_uses_page_id_only_and_returns_provider_message_id(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_result((7, "tenant-1", "page-123", "active", "encrypted-token", datetime.now(timezone.utc) + timedelta(hours=1), "Demo Page")))

    monkeypatch.setattr(meta_messages, "_load_page", AsyncMock(return_value={
        "id": 7,
        "tenantId": "tenant-1",
        "providerPageId": "page-123",
        "status": "active",
        "encryptedPageAccessToken": "encrypted-token",
        "tokenExpiresAt": datetime.now(timezone.utc) + timedelta(hours=1),
        "pageName": "Demo Page",
    }))
    monkeypatch.setattr(meta_messages, "decrypt_smartspecweb", lambda value: "decrypted-token")

    client = AsyncMock()
    client.send_message = AsyncMock(return_value={"id": "m-123", "success": True})
    mock_client_cls = MagicMock(return_value=client)
    monkeypatch.setattr(meta_messages, "MetaGraphClient", mock_client_cls)

    result = await meta_messages.send_message(
        meta_messages.SendMessageRequest(page_id=7, recipient_id="psid-1", text="Hello"),
        db=db,
        _auth=None,
    )

    assert result["provider_message_id"] == "m-123"
    mock_client_cls.assert_called_once_with("decrypted-token", page_id="page-123")
    client.send_message.assert_awaited_once_with("psid-1", "Hello")


@pytest.mark.asyncio
async def test_send_message_rejects_inactive_page(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(meta_messages, "_load_page", AsyncMock(return_value={
        "id": 7,
        "tenantId": "tenant-1",
        "providerPageId": "page-123",
        "status": "disconnected",
        "encryptedPageAccessToken": "encrypted-token",
        "tokenExpiresAt": datetime.now(timezone.utc) + timedelta(hours=1),
        "pageName": "Demo Page",
    }))

    with pytest.raises(HTTPException) as exc:
        await meta_messages.send_message(
            meta_messages.SendMessageRequest(page_id=7, recipient_id="psid-1", text="Hello"),
            db=AsyncMock(),
            _auth=None,
        )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_send_message_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(meta_messages, "_load_page", AsyncMock(return_value={
        "id": 7,
        "tenantId": "tenant-1",
        "providerPageId": "page-123",
        "status": "active",
        "encryptedPageAccessToken": "encrypted-token",
        "tokenExpiresAt": datetime.now(timezone.utc) - timedelta(hours=1),
        "pageName": "Demo Page",
    }))

    with pytest.raises(HTTPException) as exc:
        await meta_messages.send_message(
            meta_messages.SendMessageRequest(page_id=7, recipient_id="psid-1", text="Hello"),
            db=AsyncMock(),
            _auth=None,
        )

    assert exc.value.status_code == 409
