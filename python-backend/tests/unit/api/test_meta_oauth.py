from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api import meta_oauth


def _make_result(fetchone_value=None, scalar_one_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    result.scalar_one.return_value = scalar_one_value
    result.fetchall.return_value = []
    return result


@pytest.mark.asyncio
async def test_authorize_builds_facebook_oauth_url_and_stores_state(monkeypatch: pytest.MonkeyPatch) -> None:
    redis = AsyncMock()
    db = AsyncMock()
    monkeypatch.setattr(
        meta_oauth,
        "_resolve_meta_config",
        AsyncMock(
            return_value={
                "metaAppId": "app-123",
                "metaAppSecret": "secret-123",
                "metaRedirectUri": "https://example.com/auth/callback/meta",
                "metaGraphApiVersion": "v25.0",
            }
        ),
    )

    result = await meta_oauth.authorize("tenant-1", 42, redis=redis, db=db)

    assert result["authorization_url"].startswith("https://www.facebook.com/v25.0/dialog/oauth")
    assert "pages_manage_comments" in result["authorization_url"]
    redis.set.assert_awaited_once()
    assert redis.set.await_args.kwargs["ex"] == 600


@pytest.mark.asyncio
async def test_callback_rejects_expired_state(monkeypatch: pytest.MonkeyPatch) -> None:
    redis = AsyncMock()
    redis.get.return_value = None
    db = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await meta_oauth.callback(meta_oauth.MetaOAuthCallbackRequest(code="code-1", state="state-1"), redis=redis, db=db)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_callback_upserts_connection_and_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    redis = AsyncMock()
    redis.get.return_value = '{"tenant_id": "tenant-1", "user_id": 42}'
    redis.delete = AsyncMock()

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
          _make_result(fetchone_value=None),  # existing connection lookup
          _make_result(scalar_one_value=7),    # inserted connection id
          _make_result(fetchone_value=None),   # existing page lookup
          _make_result(scalar_one_value=11),   # inserted page id
        ]
    )
    db.commit = AsyncMock()

    monkeypatch.setattr(
        meta_oauth,
        "_resolve_meta_config",
        AsyncMock(
            return_value={
                "metaAppId": "app-123",
                "metaAppSecret": "secret-123",
                "metaRedirectUri": "https://example.com/auth/callback/meta",
                "metaGraphApiVersion": "v25.0",
            }
        ),
    )
    monkeypatch.setattr(
        meta_oauth,
        "_exchange_code_for_token",
        AsyncMock(return_value={"access_token": "page-token", "expires_in": "3600"}),
    )
    monkeypatch.setattr(
        meta_oauth,
        "_fetch_meta_profile",
        AsyncMock(return_value={"id": "meta-user-1", "name": "Meta User"}),
    )
    monkeypatch.setattr(
        meta_oauth,
        "_fetch_meta_pages",
        AsyncMock(
            return_value=[
                {
                    "id": "page-123",
                    "name": "Demo Page",
                    "category": "Business",
                    "access_token": "page-access-token",
                }
            ]
        ),
    )
    monkeypatch.setattr(meta_oauth, "encrypt_smartspecweb", lambda value: f"encrypted::{value}")

    result = await meta_oauth.callback(
        meta_oauth.MetaOAuthCallbackRequest(code="code-1", state="state-1"),
        redis=redis,
        db=db,
    )

    assert result["status"] == "connected"
    assert result["pages"] == [
        {
            "pageId": 11,
            "providerPageId": "page-123",
            "pageName": "Demo Page",
            "pageCategory": "Business",
            "status": "active",
        }
    ]
    db.commit.assert_awaited_once()

    connection_params = db.execute.await_args_list[1].args[1]
    assert connection_params["provider_user_id"] == "meta-user-1"
    assert connection_params["token_expires_at"] is not None


@pytest.mark.asyncio
async def test_status_returns_not_connected_when_missing() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_make_result(fetchone_value=None))

    result = await meta_oauth.status("tenant-1", 42, db=db)

    assert result == {"status": "not_connected"}


@pytest.mark.asyncio
async def test_status_returns_masked_connection_info() -> None:
    db = AsyncMock()
    page_rows = [
        (11, "page-123", "Demo Page", "Business", "active", True, True, False, "draft_only", 0.95, datetime(2026, 1, 1, tzinfo=timezone.utc)),
    ]
    db.execute.side_effect = [
        _make_result(fetchone_value=(7, "meta-user-1", "active", "encrypted-token", datetime(2026, 1, 1, tzinfo=timezone.utc))),
        SimpleNamespace(fetchall=lambda: page_rows),
    ]

    result = await meta_oauth.status("tenant-1", 42, db=db)

    assert result["status"] == "connected"
    assert result["connection"]["tokenMasked"] == "***"
    assert result["connection"]["pages"][0]["pageName"] == "Demo Page"
