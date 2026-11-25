from __future__ import annotations

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects.postgresql.asyncpg import PGDialect_asyncpg

from app.api import meta_oauth


def _make_result(fetchone_value=None, scalar_one_value=None):
    result = MagicMock()
    result.fetchone.return_value = fetchone_value
    result.scalar_one.return_value = scalar_one_value
    result.fetchall.return_value = []
    return result


@pytest.mark.asyncio
async def test_authorize_builds_facebook_oauth_url_and_stores_state(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    put_value = AsyncMock()
    monkeypatch.setattr(meta_oauth, "put_value", put_value)
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

    result = await meta_oauth.authorize("tenant-1", 42, db=db)

    assert result["authorization_url"].startswith("https://www.facebook.com/v25.0/dialog/oauth")
    assert "pages_manage_engagement" in result["authorization_url"]
    assert "pages_messaging" not in result["authorization_url"]
    assert "pages_manage_posts" in result["authorization_url"]
    put_value.assert_awaited_once()
    assert put_value.await_args.args[0] == "meta_oauth_state"
    assert put_value.await_args.args[3] == 600


@pytest.mark.asyncio
async def test_load_meta_config_uses_decrypted_system_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    monkeypatch.setattr(
        meta_oauth,
        "get_category_settings",
        AsyncMock(
            return_value={
                "metaAppId": "db-app-id",
                "metaAppSecret": "decrypted-secret",
                "metaRedirectUri": "https://example.com/auth/callback/meta",
                "metaGraphApiVersion": "v25.0",
            }
        ),
    )

    result = await meta_oauth._load_meta_config(db)

    assert result["metaAppId"] == "db-app-id"
    assert result["metaAppSecret"] == "decrypted-secret"


@pytest.mark.asyncio
async def test_callback_rejects_expired_state(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    monkeypatch.setattr(meta_oauth, "take_value", AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as exc:
        await meta_oauth.callback(meta_oauth.MetaOAuthCallbackRequest(code="code-1", state="state-1"), db=db)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("reconnect", [False, True])
async def test_callback_upserts_connection_and_pages(
    monkeypatch: pytest.MonkeyPatch, reconnect: bool
) -> None:
    monkeypatch.setattr(
        meta_oauth,
        "take_value",
        AsyncMock(return_value={"tenant_id": "tenant-1", "user_id": 42}),
    )

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
          _make_result(fetchone_value=(7,) if reconnect else None),  # existing connection lookup
          _make_result(scalar_one_value=7),    # inserted connection id
          _make_result(fetchone_value=(11,) if reconnect else None),  # existing page lookup
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
        "_fetch_meta_permissions",
        AsyncMock(return_value=["pages_show_list", "pages_manage_posts", "pages_read_engagement"]),
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
                    "tasks": ["CREATE_CONTENT", "MODERATE"],
                }
            ]
        ),
    )
    monkeypatch.setattr(meta_oauth, "encrypt_smartspecweb", lambda value: f"encrypted::{value}")

    result = await meta_oauth.callback(
        meta_oauth.MetaOAuthCallbackRequest(code="code-1", state="state-1"),
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
            "canCreateContent": True,
            "missingRequiredScopes": [],
        }
    ]
    db.commit.assert_awaited_once()

    connection_stmt, connection_params = db.execute.await_args_list[1].args
    page_stmt, page_params = db.execute.await_args_list[3].args
    dialect = PGDialect_asyncpg()
    # asyncpg needs JSON parameters encoded as text on both insert and reconnect.
    for stmt, params, names in [
        (connection_stmt, connection_params, ("granted_scopes", "metadata")),
        (page_stmt, page_params, ("metadata",)),
    ]:
        processors = stmt.compile(dialect=dialect)._bind_processors
        for name in names:
            assert json.loads(processors[name](params[name])) == params[name]

    assert connection_params["provider_user_id"] == "meta-user-1"
    assert connection_params["token_expires_at"] is not None


@pytest.mark.asyncio
async def test_status_returns_not_connected_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_make_result(fetchone_value=None))
    monkeypatch.setattr(meta_oauth, "_load_meta_config", AsyncMock(return_value={
        "metaAppId": "", "metaAppSecret": "", "metaRedirectUri": "", "metaGraphApiVersion": "v27.0",
    }))

    result = await meta_oauth.status("tenant-1", 42, db=db)

    assert result["status"] == "not_connected"
    assert result["configuration"]["appIdConfigured"] is False


@pytest.mark.asyncio
async def test_status_returns_masked_connection_info(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    page_rows = [
        (11, "page-123", "Demo Page", "Business", "active", True, True, False, "draft_only", 0.95, datetime(2026, 1, 1, tzinfo=UTC), {"providerPage": {"tasks": ["CREATE_CONTENT"]}, "canCreateContent": True}, "encrypted-page-token"),
    ]
    db.execute.side_effect = [
        _make_result(fetchone_value=(7, "meta-user-1", "active", "encrypted-token", datetime(2026, 1, 1, tzinfo=UTC), ["pages_show_list", "pages_manage_posts", "pages_read_engagement"])),
        SimpleNamespace(fetchall=lambda: page_rows),
    ]
    monkeypatch.setattr(meta_oauth, "_load_meta_config", AsyncMock(return_value={
        "metaAppId": "app-id", "metaAppSecret": "secret", "metaRedirectUri": "https://example.com/auth/callback/meta", "metaGraphApiVersion": "v27.0",
    }))

    result = await meta_oauth.status("tenant-1", 42, db=db)

    assert result["status"] == "connected"
    assert result["connection"]["tokenMasked"] == "***"
    assert result["connection"]["pages"][0]["pageName"] == "Demo Page"
    assert result["connection"]["grantedScopes"] == ["pages_show_list", "pages_manage_posts", "pages_read_engagement"]
    assert result["connection"]["pages"][0]["canCreateContent"] is True
