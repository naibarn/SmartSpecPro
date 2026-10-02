from __future__ import annotations

import hashlib
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api import telegram_webhook
from app.services.postgres_rate_limit import SlidingWindowDecision


@pytest.mark.asyncio
async def test_verify_code_consumes_hashed_postgres_token(monkeypatch):
    result = MagicMock()
    result.mappings.return_value.first.return_value = {"userId": 23}
    db = AsyncMock()
    db.execute.return_value = result
    code = "0123456789abcdef0123456789abcdef"

    verified = await telegram_webhook.verify_code(db, code)

    assert verified == {"userId": 23}
    params = db.execute.await_args.args[1]
    assert params["token_hash"] == hashlib.sha256(code.encode()).hexdigest()
    sql = str(db.execute.await_args.args[0])
    assert 'SET "usedAt" = NOW()' in sql
    assert '"usedAt" IS NULL' in sql
    assert '"expiresAt" > NOW()' in sql


@pytest.mark.asyncio
async def test_verify_code_rejects_malformed_token_without_database_call():
    db = AsyncMock()

    assert await telegram_webhook.verify_code(db, "not-a-token") is None
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_telegram_rate_limit_uses_postgres_sliding_window(monkeypatch):
    consume = AsyncMock(return_value=SlidingWindowDecision(False, 5, 0, 12))
    monkeypatch.setattr(telegram_webhook, "consume_sliding_window", consume)

    with pytest.raises(HTTPException) as error:
        await telegram_webhook.check_rate_limit(123)

    assert error.value.status_code == 429
    consume.assert_awaited_once_with("telegram_link_attempts", "123", 5, 3600)
