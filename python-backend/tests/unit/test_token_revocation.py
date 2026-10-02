from hashlib import sha256
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.services.token_revocation import RevokedTokenJti, hash_jti, is_jti_revoked, revoke_jti


def test_hash_jti_matches_shared_sha256_contract():
    assert hash_jti("example-jti") == sha256(b"example-jti").hexdigest()


@pytest.mark.asyncio
async def test_is_jti_revoked_queries_shared_postgres_hash():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one.return_value = True
    db.execute.return_value = result

    assert await is_jti_revoked(db, "example-jti") is True
    statement, params = db.execute.await_args.args
    assert "revoked_token_jtis" in str(statement)
    assert params["jti_hash"] == sha256(b"example-jti").hexdigest()
    assert params["now"].tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_is_jti_revoked_returns_false_for_unrevoked_token():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one.return_value = False
    db.execute.return_value = result

    assert await is_jti_revoked(db, "valid-jti") is False


@pytest.mark.asyncio
async def test_invalid_jti_fails_closed_without_database_lookup():
    db = AsyncMock()

    assert await is_jti_revoked(db, "") is True
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoke_jti_persists_only_shared_hash_and_never_shortens_expiry():
    db = AsyncMock()
    from datetime import datetime, timezone

    expiry = datetime(2030, 1, 1, tzinfo=timezone.utc)
    await revoke_jti(db, "example-jti", expiry)

    statement, params = db.execute.await_args.args
    assert "INSERT INTO revoked_token_jtis" in str(statement)
    assert "ON CONFLICT (jti_hash)" in str(statement)
    assert params == {"jti_hash": sha256(b"example-jti").hexdigest(), "expires_at": expiry}
    assert "example-jti" not in str(params)


@pytest.mark.asyncio
async def test_revoke_jti_rejects_invalid_identifier_without_database_lookup():
    db = AsyncMock()

    with pytest.raises(ValueError):
        await revoke_jti(db, "", None)

    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoke_jti_round_trip_is_durable_and_never_shortens_expiry():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(RevokedTokenJti.__table__.create)

    first_expiry = datetime.now(timezone.utc) + timedelta(days=3)
    shorter_expiry = datetime.now(timezone.utc) + timedelta(days=1)
    async with AsyncSession(engine, expire_on_commit=False) as db:
        await revoke_jti(db, "durable-jti", first_expiry)
        await db.commit()
        await revoke_jti(db, "durable-jti", shorter_expiry)
        await db.commit()

        assert await is_jti_revoked(db, "durable-jti") is True
        record = await db.get(RevokedTokenJti, sha256(b"durable-jti").hexdigest())
        assert record is not None
        assert record.expires_at.replace(tzinfo=timezone.utc) == first_expiry.replace(tzinfo=timezone.utc)

    await engine.dispose()
