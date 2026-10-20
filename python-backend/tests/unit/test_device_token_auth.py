"""Desktop and browser identities must resolve the same shared database user."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import auth


@pytest.fixture
def authenticate(monkeypatch):
    user = SimpleNamespace(
        id=24, openId="google-owner-24", is_active=True,
        currentTenantId=None, sessionRevokedAt=None,
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db = AsyncMock()
    db.execute.return_value = result
    revoked = AsyncMock(return_value=False)
    monkeypatch.setattr(auth, "is_jti_revoked", revoked)

    async def run(payload):
        monkeypatch.setattr(auth, "verify_token", lambda *args, **kwargs: payload)
        if payload and payload.get("jti"):
            blacklist = MagicMock()
            blacklist.scalar_one_or_none.return_value = None
            db.execute.side_effect = [blacklist, result]
        return await auth.get_current_user(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-only"), db,
        )

    return run, user, db, revoked


@pytest.mark.asyncio
async def test_desktop_access_token_matches_both_database_id_and_openid(authenticate):
    run, user, db, _ = authenticate
    assert await run({"sub": user.openId, "userId": user.id, "type": "access"}) is user
    statement = db.execute.await_args.args[0]
    assert statement.compile().params == {"id_1": user.id}


@pytest.mark.asyncio
@pytest.mark.parametrize("subject", ["other-owner", "24", "", None, 24])
async def test_desktop_identity_cannot_fall_back_to_a_different_subject(authenticate, subject):
    run, user, _, _ = authenticate
    with pytest.raises(HTTPException) as error:
        await run({"sub": subject, "userId": user.id, "type": "access"})
    assert error.value.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("user_id", [True, False, 0, -1, 24.0, "24", None])
async def test_desktop_id_requires_the_issued_positive_integer_contract(authenticate, user_id):
    run, user, db, _ = authenticate
    with pytest.raises(HTTPException) as error:
        await run({"sub": user.openId, "userId": user_id, "type": "access"})
    assert error.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [{"sub": "24"}, {"user_id": 24}, {"openId": "google-owner-24"}])
async def test_existing_python_and_browser_identities_still_work(authenticate, payload):
    run, user, _, _ = authenticate
    assert await run(payload) is user


@pytest.mark.asyncio
async def test_desktop_identity_still_rejects_disabled_users(authenticate):
    run, user, _, _ = authenticate
    user.is_active = False
    with pytest.raises(HTTPException) as error:
        await run({"sub": user.openId, "userId": user.id})
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_desktop_identity_checks_shared_jti_revocation_first(authenticate):
    run, user, db, revoked = authenticate
    revoked.return_value = True
    with pytest.raises(HTTPException) as error:
        await run({"sub": user.openId, "userId": user.id, "jti": "test-jti"})
    assert error.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_desktop_identity_rejects_a_conflicting_browser_claim(authenticate):
    run, user, _, _ = authenticate
    with pytest.raises(HTTPException) as error:
        await run({"sub": user.openId, "userId": user.id, "openId": "other-owner"})
    assert error.value.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("identity", [{"sub": "24"}, {"openId": "google-owner-24"}, {"sub": "google-owner-24", "userId": 24}])
@pytest.mark.parametrize("issued_at", [None, True, "2001", 1999, 2000, 2000.5, float("nan"), float("inf")])
async def test_account_session_revocation_rejects_missing_or_older_issued_at(authenticate, identity, issued_at):
    run, user, _, _ = authenticate
    user.sessionRevokedAt = datetime.fromtimestamp(2000.5, tz=timezone.utc)
    with pytest.raises(HTTPException) as error:
        await run({**identity, "iat": issued_at})
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_account_session_revocation_allows_a_new_access_token(authenticate):
    run, user, _, _ = authenticate
    user.sessionRevokedAt = datetime.fromtimestamp(2000.5, tz=timezone.utc)
    assert await run({"sub": user.openId, "userId": user.id, "iat": 2001}) is user


@pytest.mark.asyncio
async def test_invalid_signature_or_expired_token_cannot_reach_identity_lookup(authenticate):
    run, _, db, _ = authenticate
    with pytest.raises(HTTPException) as error:
        await run(None)
    assert error.value.status_code == 401
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_desktop_unknown_account_does_not_fall_back_to_a_numeric_subject(authenticate):
    run, _, db, _ = authenticate
    db.execute.return_value.scalar_one_or_none.return_value = None
    with pytest.raises(HTTPException) as error:
        await run({"sub": "24", "userId": 25})
    assert error.value.status_code == 401
    db.execute.assert_awaited_once()
