"""Profile selection at the real authorize/callback boundary (no provider I/O)."""
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException

from app.api import oauth
from app.services.oauth_service import OAuthService

ORIGIN = "https://staging.account.workers.dev"
CONFIG = {
    "googleClientId": "production-client", "googleClientSecret": "production-secret",
    "googleRedirectUri": "https://smartaihub.app/auth/callback/google",
    "googleStagingClientId": "staging-client", "googleStagingClientSecret": "staging-secret",
    "googleStagingRedirectUri": ORIGIN + "/auth/callback/google",
}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_authorize_selects_exact_profile_and_preserves_production():
    db = MagicMock()
    with patch.object(oauth, "get_oauth_config", AsyncMock(return_value=CONFIG)):
        production = await oauth.google_authorize(db=db)
        staging = await oauth.google_authorize(db=db, login_origin=ORIGIN)
    for result, prefix in [(production, "google"), (staging, "googleStaging")]:
        query = parse_qs(urlsplit(result["authorization_url"]).query)
        assert query["client_id"] == [CONFIG[prefix + "ClientId"]]
        assert query["redirect_uri"] == [CONFIG[prefix + "RedirectUri"]]
        assert "secret" not in result["authorization_url"]
    OAuthService(db).validate_oauth_state(staging["state"], login_context={
        "provider": "google", "client_id": CONFIG["googleStagingClientId"],
        "redirect_uri": CONFIG["googleStagingRedirectUri"],
    })


@pytest.mark.unit
@pytest.mark.asyncio
async def test_callback_cannot_exchange_production_state_in_staging_or_reverse():
    db = MagicMock()
    with patch.object(oauth, "get_oauth_config", AsyncMock(return_value=CONFIG)), patch.object(
        OAuthService, "_exchange_code_for_token", new_callable=AsyncMock
    ) as exchange:
        production = await oauth.google_authorize(db=db)
        staging = await oauth.google_authorize(db=db, login_origin=ORIGIN)
        for state, origin in [(production["state"], ORIGIN), (staging["state"], None)]:
            with pytest.raises(HTTPException) as error:
                await oauth.google_callback(oauth.OAuthCallbackRequest(code="fixture", state=state), db=db, login_origin=origin)
            assert error.value.status_code == 400
            assert "Invalid or expired" in error.value.detail
        exchange.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_unconfigured_or_foreign_profile_stops_before_authorize_or_exchange():
    with patch.object(oauth, "get_oauth_config", AsyncMock(return_value=CONFIG)):
        with pytest.raises(HTTPException) as error:
            await oauth.google_authorize(db=MagicMock(), login_origin="https://attacker.example.com")
        assert error.value.status_code == 503
        with pytest.raises(HTTPException) as error:
            await oauth.github_authorize(db=MagicMock(), login_origin=ORIGIN)
        assert error.value.status_code == 503
