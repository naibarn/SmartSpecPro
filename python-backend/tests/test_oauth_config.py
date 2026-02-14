"""
Tests for Google OAuth config loader (oauth_config.py).

Tests validate:
1. get_oauth_config reads from DB system_settings table
2. Falls back to env vars when DB config is missing
3. DB config takes precedence over env vars when both exist
4. Decrypts sensitive values (clientSecret) correctly using smartspecweb_crypto
5. get_google_oauth_config convenience function filters to Google-specific keys
6. get_google_oauth_config raises ValueError when required fields missing
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_reads_from_db():
    """get_oauth_config returns values from system_settings when rows exist."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        ("googleClientId", "test-client-id.apps.googleusercontent.com", False),
        ("googleClientSecret", "encrypted-secret", True),
        ("googleRedirectUri", "https://smartaihub.app/auth/callback/google", False),
    ]
    mock_db.execute.return_value = mock_result

    with patch(
        "app.core.oauth_config.decrypt_smartspecweb",
        return_value="decrypted-secret",
    ):
        from app.core.oauth_config import get_oauth_config

        config = await get_oauth_config(mock_db)

    assert config["googleClientId"] == "test-client-id.apps.googleusercontent.com"
    assert config["googleClientSecret"] == "decrypted-secret"
    assert config["googleRedirectUri"] == "https://smartaihub.app/auth/callback/google"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_falls_back_to_env_vars():
    """get_oauth_config uses env vars when DB returns no rows."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = []
    mock_db.execute.return_value = mock_result

    env_vars = {
        "GOOGLE_CLIENT_ID": "env-client-id.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "env-secret",
        "GOOGLE_REDIRECT_URI": "https://example.com/callback",
    }

    with patch.dict("os.environ", env_vars, clear=False):
        from app.core.oauth_config import get_oauth_config

        config = await get_oauth_config(mock_db)

    assert config["googleClientId"] == "env-client-id.apps.googleusercontent.com"
    assert config["googleClientSecret"] == "env-secret"
    assert config["googleRedirectUri"] == "https://example.com/callback"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_db_takes_precedence():
    """When both DB and env vars have a value, DB value wins."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        ("googleClientId", "db-client-id.apps.googleusercontent.com", False),
    ]
    mock_db.execute.return_value = mock_result

    env_vars = {
        "GOOGLE_CLIENT_ID": "env-client-id.apps.googleusercontent.com",
    }

    with patch.dict("os.environ", env_vars, clear=False):
        from app.core.oauth_config import get_oauth_config

        config = await get_oauth_config(mock_db)

    assert config["googleClientId"] == "db-client-id.apps.googleusercontent.com"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_load_google_oauth_config_decrypts_sensitive_values():
    """Values with isSensitive=True are passed through decrypt_smartspecweb."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        ("googleClientSecret", "encrypted-value", True),
    ]
    mock_db.execute.return_value = mock_result

    with patch(
        "app.core.oauth_config.decrypt_smartspecweb",
        return_value="actual-secret",
    ) as mock_decrypt:
        from app.core.oauth_config import get_oauth_config

        config = await get_oauth_config(mock_db)

    mock_decrypt.assert_called_once_with("encrypted-value")
    assert config["googleClientSecret"] == "actual-secret"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_google_oauth_config_returns_google_keys():
    """get_google_oauth_config returns only Google-specific keys."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = [
        ("googleClientId", "test-id.apps.googleusercontent.com", False),
        ("googleClientSecret", "encrypted-secret", True),
        ("googleRedirectUri", "https://smartaihub.app/auth/callback/google", False),
        ("githubClientId", "github-id", False),
    ]
    mock_db.execute.return_value = mock_result

    with patch(
        "app.core.oauth_config.decrypt_smartspecweb",
        return_value="decrypted-secret",
    ):
        from app.core.oauth_config import get_google_oauth_config

        config = await get_google_oauth_config(mock_db)

    assert "googleClientId" in config
    assert "googleClientSecret" in config
    assert "googleRedirectUri" in config
    assert "githubClientId" not in config


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_google_oauth_config_raises_when_not_configured():
    """get_google_oauth_config raises ValueError when required fields missing."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.fetchall.return_value = []
    mock_db.execute.return_value = mock_result

    # Remove Google-specific env vars that might interfere
    env_overrides = {
        "GOOGLE_CLIENT_ID": "",
        "GOOGLE_CLIENT_SECRET": "",
        "GOOGLE_REDIRECT_URI": "",
    }
    with patch.dict("os.environ", env_overrides, clear=False):
        from app.core.oauth_config import get_google_oauth_config

        with pytest.raises(ValueError, match="not configured"):
            await get_google_oauth_config(mock_db)
