"""Tests for McpOAuthManager — OAuth 2.1 token management for MCP servers."""

import base64
import hashlib
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.mcp_oauth_manager import (
    CALLBACK_URL,
    McpOAuthManager,
    OAuthFlowError,
    _generate_code_verifier,
    _generate_state,
)

# Mock DNS validation for all OAuth tests (URLs are always "public" in tests)
_DNS_PATCH = patch(
    "app.services.mcp_oauth_manager._resolve_and_validate_dns",
    new_callable=AsyncMock,
    return_value="93.184.216.34",
)


@pytest.fixture
def oauth_manager():
    """Create McpOAuthManager with mocked Redis and secret resolver."""
    redis_mock = AsyncMock()
    secret_resolver = AsyncMock(return_value="resolved-secret")
    return McpOAuthManager(redis=redis_mock, secret_resolver=secret_resolver)


# ---------------------------------------------------------------------------
# Token Caching
# ---------------------------------------------------------------------------

class TestTokenCaching:

    @pytest.mark.asyncio
    async def test_get_token_returns_cached_when_not_expired(self, oauth_manager):
        """get_token returns cached token when not expired."""
        oauth_manager._token_cache[1] = {
            "access_token": "cached-token",
            "expires_at": time.time() + 300,
        }
        token = await oauth_manager.get_token(server_id=1)
        assert token == "cached-token"

    @pytest.mark.asyncio
    async def test_get_token_refreshes_when_expired(self, oauth_manager):
        """get_token refreshes token when expired (with skew)."""
        oauth_manager._token_cache[1] = {
            "access_token": "old-token",
            "refresh_token": "refresh-123",
            "expires_at": time.time() - 10,
            "token_url": "https://auth.example.com/token",
            "client_id": "test-client",
            # F03: No client_secret in cache — resolved from DB via _resolve_secret
        }
        with patch.object(oauth_manager, "_refresh_token") as mock_refresh:
            mock_refresh.return_value = "new-token"
            token = await oauth_manager.get_token(server_id=1)
            assert token == "new-token"
            mock_refresh.assert_called_once()


# ---------------------------------------------------------------------------
# Client Credentials Flow
# ---------------------------------------------------------------------------

class TestClientCredentials:

    @pytest.mark.asyncio
    @_DNS_PATCH
    async def test_client_credentials_fetches_new_token(self, mock_dns, oauth_manager):
        """client_credentials flow fetches new token from token_url."""
        with patch("app.services.mcp_oauth_manager.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post.return_value = MagicMock(
                status_code=200,
                json=lambda: {
                    "access_token": "new-cc-token",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                },
            )
            mock_client_cls.return_value = mock_client

            token = await oauth_manager.client_credentials_flow(
                server_id=1,
                token_url="https://auth.example.com/token",
                client_id="test-client",
                client_secret="test-secret",
            )
            assert token == "new-cc-token"
            assert 1 in oauth_manager._token_cache
            # F03: Verify client_secret NOT in cache
            assert "client_secret" not in oauth_manager._token_cache[1]


# ---------------------------------------------------------------------------
# Authorization Code Flow
# ---------------------------------------------------------------------------

class TestAuthorizationCode:

    @pytest.mark.asyncio
    @_DNS_PATCH
    async def test_auth_code_generates_state_and_verifier(self, mock_dns, oauth_manager):
        """authorization_code flow generates state + code_verifier, stores in Redis."""
        redirect_url = await oauth_manager.initiate_auth_code_flow(
            server_id=1,
            tenant_id=42,
            authorize_url="https://auth.example.com/authorize",
            client_id="test-client",
            scopes=["read", "write"],
        )
        assert "https://auth.example.com/authorize" in redirect_url
        assert "state=" in redirect_url
        assert "code_challenge=" in redirect_url
        # F02: Verify Redis called twice — state key + reverse-index key
        assert oauth_manager._redis.setex.call_count == 2

    @pytest.mark.asyncio
    @_DNS_PATCH
    async def test_callback_validates_state(self, mock_dns, oauth_manager):
        """callback validates state, exchanges code for token."""
        # F03: State data does NOT include client_secret
        state_data = json.dumps({
            "server_id": 1,
            "tenant_id": 42,
            "code_verifier": "test-verifier-abc123",
            "token_url": "https://auth.example.com/token",
            "client_id": "test-client",
        })
        oauth_manager._redis.get.return_value = state_data.encode()
        oauth_manager._redis.delete = AsyncMock()

        with patch("app.services.mcp_oauth_manager.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post.return_value = MagicMock(
                status_code=200,
                json=lambda: {
                    "access_token": "auth-code-token",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "refresh_token": "refresh-xyz",
                },
            )
            mock_client_cls.return_value = mock_client

            result = await oauth_manager.handle_callback(
                state="valid-state-nonce",
                code="auth-code-123",
            )
            assert result["access_token"] == "auth-code-token"

    @pytest.mark.asyncio
    async def test_callback_rejects_invalid_state(self, oauth_manager):
        """callback rejects invalid state parameter."""
        oauth_manager._redis.get.return_value = None

        with pytest.raises(OAuthFlowError, match="Invalid.*state"):
            await oauth_manager.handle_callback(
                state="invalid-state",
                code="auth-code-123",
            )

    def test_callback_url_hardcoded(self):
        """callback URL is exactly https://smartaihub.app/auth/mcp/callback."""
        assert CALLBACK_URL == "https://smartaihub.app/auth/mcp/callback"


# ---------------------------------------------------------------------------
# PKCE
# ---------------------------------------------------------------------------

class TestPKCE:

    def test_code_verifier_is_32_bytes_base64url(self):
        """code_verifier is 32 bytes base64url, stored server-side only."""
        verifier = _generate_code_verifier()
        assert len(verifier) == 43
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=" for c in verifier)


# ---------------------------------------------------------------------------
# Token Revocation + Audit
# ---------------------------------------------------------------------------

class TestRevocationAndAudit:

    @pytest.mark.asyncio
    @_DNS_PATCH
    async def test_token_revocation_on_delete(self, mock_dns, oauth_manager):
        """token revocation called on server delete (RFC 7009)."""
        with patch("app.services.mcp_oauth_manager.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post.return_value = MagicMock(status_code=200)
            mock_client_cls.return_value = mock_client

            await oauth_manager.revoke_token(
                revocation_url="https://auth.example.com/revoke",
                access_token="token-to-revoke",
                client_id="test-client",
            )
            mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_audit_event_on_token_refresh(self, oauth_manager):
        """audit event logged on token refresh."""
        with patch("app.services.mcp_oauth_manager.logger") as mock_logger:
            oauth_manager._token_cache[1] = {
                "access_token": "old",
                "refresh_token": "refresh-123",
                "expires_at": time.time() - 10,
                "token_url": "https://auth.example.com/token",
                "client_id": "test-client",
                # F03: No client_secret in cache
            }
            with patch.object(oauth_manager, "_refresh_token") as mock_refresh:
                mock_refresh.return_value = "new-token"
                await oauth_manager.get_token(server_id=1)
                mock_logger.info.assert_any_call(
                    "mcp_oauth_token_refreshed",
                    server_id=1,
                )
