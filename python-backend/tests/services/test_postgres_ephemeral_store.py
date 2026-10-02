from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import postgres_ephemeral_store as store


def _session_with_result(row: dict | None):
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock(return_value=transaction)
    transaction.__aexit__ = AsyncMock(return_value=False)
    session.begin.return_value = transaction
    result = MagicMock()
    result.mappings.return_value.first.return_value = row
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
async def test_take_value_atomically_deletes_and_returns_live_payload(monkeypatch):
    session = _session_with_result({"value": {"tenant_id": "tenant-1", "user_id": 7}})
    monkeypatch.setattr(store, "AsyncSessionLocal", lambda: session)

    result = await store.take_value("meta_oauth_state", "opaque-state")

    assert result == {"tenant_id": "tenant-1", "user_id": 7}
    sql = str(session.execute.await_args.args[0])
    assert "DELETE FROM runtime_ephemeral_values" in sql
    assert "expires_at > now()" in sql
    assert "RETURNING value" in sql


@pytest.mark.asyncio
async def test_take_value_returns_none_when_missing_or_expired(monkeypatch):
    session = _session_with_result(None)
    monkeypatch.setattr(store, "AsyncSessionLocal", lambda: session)

    assert await store.take_value("meta_oauth_state", "expired-state") is None


def test_ephemeral_store_rejects_nonpositive_ttl():
    with pytest.raises(ValueError, match="TTL must be positive"):
        store._validate("state", "key", 0)
