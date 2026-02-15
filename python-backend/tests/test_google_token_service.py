"""
Tests for GoogleTokenService -- token lifecycle management for per-user Google Drive OAuth.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta, timezone


@pytest.mark.unit
@pytest.mark.asyncio
class TestGoogleTokenService:
    """Tests for GoogleTokenService token lifecycle management."""

    async def test_get_valid_access_token_returns_cached_when_not_expired(self):
        """Token returned directly when not within 5 min of expiry."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        future_expiry = datetime.now(timezone.utc) + timedelta(minutes=30)
        mock_conn = MagicMock(
            access_token="valid-access-token",
            refresh_token="refresh-tok",
            token_expires_at=future_expiry,
            status="active",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_conn
        mock_db.execute.return_value = mock_result

        svc = GoogleTokenService(mock_db)
        token = await svc.get_valid_access_token(user_id=1)
        assert token == "valid-access-token"

    async def test_get_valid_access_token_refreshes_when_near_expiry(self):
        """Token refreshed when within 5 minutes of expiry."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        near_expiry = datetime.now(timezone.utc) + timedelta(minutes=3)
        mock_conn = MagicMock(
            access_token="old-token",
            refresh_token="refresh-tok",
            token_expires_at=near_expiry,
            status="active",
            user_id=1,
            provider="google",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_conn
        mock_db.execute.return_value = mock_result

        svc = GoogleTokenService(mock_db)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "new-access-token",
            "expires_in": 3600,
        }

        with patch("app.services.google_token_service.httpx") as mock_httpx, \
             patch("app.services.google_token_service.get_oauth_config") as mock_cfg:
            mock_cfg.return_value = {
                "googleClientId": "test-id.apps.googleusercontent.com",
                "googleClientSecret": "test-secret",
            }
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post.return_value = mock_response
            mock_httpx.AsyncClient.return_value = mock_client

            token = await svc.get_valid_access_token(user_id=1)
            assert token == "new-access-token"
            mock_client.post.assert_called_once()

    async def test_get_valid_access_token_raises_invalid_grant(self):
        """InvalidGrantError raised and status set to 'expired' on invalid_grant."""
        from app.services.google_token_service import GoogleTokenService, InvalidGrantError

        mock_db = AsyncMock()
        expired = datetime.now(timezone.utc) - timedelta(minutes=10)
        mock_conn = MagicMock(
            access_token="expired-token",
            refresh_token="refresh-tok",
            token_expires_at=expired,
            status="active",
            user_id=1,
            provider="google",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_conn
        mock_db.execute.return_value = mock_result

        svc = GoogleTokenService(mock_db)

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": "invalid_grant"}

        with patch("app.services.google_token_service.httpx") as mock_httpx, \
             patch("app.services.google_token_service.get_oauth_config") as mock_cfg:
            mock_cfg.return_value = {
                "googleClientId": "test-id.apps.googleusercontent.com",
                "googleClientSecret": "test-secret",
            }
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post.return_value = mock_response
            mock_httpx.AsyncClient.return_value = mock_client

            with pytest.raises(InvalidGrantError):
                await svc.get_valid_access_token(user_id=1)
            assert mock_conn.status == "expired"

    async def test_build_drive_auth_url_includes_correct_scopes(self):
        """Auth URL contains Drive scopes and incremental consent params."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        svc = GoogleTokenService(mock_db)

        with patch("app.services.google_token_service.get_oauth_config") as mock_cfg, \
             patch("app.services.google_token_service.OAuthService") as mock_oauth_svc_cls:
            mock_cfg.return_value = {
                "googleClientId": "test.apps.googleusercontent.com",
                "googleClientSecret": "secret",
                "googleDriveRedirectUri": "https://smartaihub.app/auth/callback/google-drive",
            }
            mock_oauth_svc = MagicMock()
            mock_oauth_svc.generate_oauth_state.return_value = "test-state"
            mock_oauth_svc_cls.return_value = mock_oauth_svc

            result = await svc.build_drive_auth_url(user_id=1)
            url = result["authorization_url"]
            assert "drive.readonly" in url
            assert "drive.file" in url
            assert "include_granted_scopes=true" in url
            assert "access_type=offline" in url
            assert "prompt=consent" in url
            assert result["state"] == "test-state"

    async def test_exchange_drive_code_stores_tokens(self):
        """exchange_drive_code stores tokens and returns email + scopes."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        # No existing connection
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        svc = GoogleTokenService(mock_db)

        token_response = MagicMock()
        token_response.status_code = 200
        token_response.json.return_value = {
            "access_token": "new-access",
            "refresh_token": "new-refresh",
            "expires_in": 3600,
            "scope": "https://www.googleapis.com/auth/drive.readonly openid email",
        }

        userinfo_response = MagicMock()
        userinfo_response.status_code = 200
        userinfo_response.json.return_value = {
            "email": "user@example.com",
        }

        with patch("app.services.google_token_service.httpx") as mock_httpx, \
             patch("app.services.google_token_service.get_oauth_config") as mock_cfg, \
             patch("app.services.google_token_service.state_serializer") as mock_state:
            mock_cfg.return_value = {
                "googleClientId": "test.apps.googleusercontent.com",
                "googleClientSecret": "secret",
                "googleDriveRedirectUri": "https://smartaihub.app/auth/callback/google-drive",
            }
            mock_state.loads.return_value = "valid-state-data"

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post.return_value = token_response
            mock_client.get.return_value = userinfo_response
            mock_httpx.AsyncClient.return_value = mock_client

            result = await svc.exchange_drive_code(user_id=1, code="auth-code", state="valid-state")
            assert result["email"] == "user@example.com"
            assert any("drive.readonly" in s for s in result["scopes"])
            mock_db.add.assert_called_once()
            mock_state.loads.assert_called_once_with("valid-state", max_age=600)

    async def test_exchange_drive_code_rejects_invalid_state(self):
        """exchange_drive_code raises ValueError on invalid CSRF state."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        svc = GoogleTokenService(mock_db)

        with patch("app.services.google_token_service.state_serializer") as mock_state:
            mock_state.loads.side_effect = Exception("Invalid signature")

            with pytest.raises(ValueError, match="Invalid or expired OAuth state token"):
                await svc.exchange_drive_code(user_id=1, code="auth-code", state="bad-state")

    async def test_get_connection_status_not_connected(self):
        """Returns not_connected when no OAuth connection exists."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        svc = GoogleTokenService(mock_db)
        status = await svc.get_connection_status(user_id=1)
        assert status["status"] == "not_connected"

    async def test_get_connection_status_connected(self):
        """Returns connected with email and scopes when connection exists."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        mock_conn = MagicMock(
            status="active",
            scopes="openid,email,drive.readonly",
            created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_conn
        mock_db.execute.return_value = mock_result

        with patch("app.services.google_token_service.GoogleTokenService._get_email_from_connection") as mock_email:
            mock_email.return_value = "user@example.com"
            svc = GoogleTokenService(mock_db)
            result = await svc.get_connection_status(user_id=1)
            assert result["status"] == "connected"
            assert result["email"] == "user@example.com"
            assert any("drive.readonly" in s for s in result["scopes"])

    async def test_disconnect_deletes_connection(self):
        """disconnect removes the oauth_connections row."""
        from app.services.google_token_service import GoogleTokenService

        mock_db = AsyncMock()
        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_conn
        mock_db.execute.return_value = mock_result

        svc = GoogleTokenService(mock_db)
        result = await svc.disconnect(user_id=1)
        assert result is True
        mock_db.delete.assert_called_once_with(mock_conn)
