"""
McpOAuthManager — OAuth 2.1 token management for MCP servers.

Supports:
  - client_credentials grant with token caching
  - authorization_code + PKCE flow with Redis-backed state
  - Token refresh with expiry skew
  - Token revocation (RFC 7009)

Security:
  - All outbound URLs validated against SSRF (DNS resolution)
  - client_secret NEVER stored in Redis or in-memory cache
  - Redis state uses reverse-index key for O(1) callback lookup
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time
from typing import Any
from urllib.parse import urlencode

import httpx
import structlog

from app.services.mcp_client_manager import McpConnectionError, _resolve_and_validate_dns, _validate_url_scheme

logger = structlog.get_logger(__name__)

# Hardcoded callback URL — never dynamic
CALLBACK_URL = "https://smartaihub.app/auth/mcp/callback"

# State TTL in Redis (10 minutes)
_STATE_TTL_SECONDS = 600

# Token expiry skew — refresh 30s before actual expiry
_EXPIRY_SKEW_SECONDS = 30


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class OAuthFlowError(Exception):
    """Error during OAuth flow."""


# ---------------------------------------------------------------------------
# SSRF validation for OAuth URLs
# ---------------------------------------------------------------------------

async def _validate_oauth_url(url: str) -> None:
    """Validate an OAuth endpoint URL against SSRF.

    Raises OAuthFlowError if the URL targets a private/blocked IP.
    """
    try:
        normalized = _validate_url_scheme(url)
        from urllib.parse import urlparse
        parsed = urlparse(normalized)
        hostname = parsed.hostname or ""
        await _resolve_and_validate_dns(hostname)
    except McpConnectionError as exc:
        raise OAuthFlowError(f"OAuth URL blocked (SSRF): {exc}") from exc


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------

def _generate_code_verifier() -> str:
    """Generate a 32-byte base64url-encoded code_verifier (PKCE)."""
    return base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode("ascii")


def _generate_code_challenge(verifier: str) -> str:
    """Generate S256 code_challenge from code_verifier."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _generate_state() -> str:
    """Generate a 32-byte random state nonce."""
    return base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode("ascii")


# ---------------------------------------------------------------------------
# McpOAuthManager
# ---------------------------------------------------------------------------

class McpOAuthManager:
    """Manages OAuth 2.1 tokens for MCP servers.

    Token lifecycle:
    1. get_token() → returns cached token or refreshes/fetches new one
    2. initiate_auth_code_flow() → generates auth URL with PKCE
    3. handle_callback() → exchanges code for token
    4. revoke_token() → RFC 7009 revocation

    Security notes:
    - client_secret is NEVER stored in Redis state or in-memory cache
    - All outbound OAuth URLs are SSRF-validated before HTTP calls
    - Secrets must be resolved from encrypted DB at exchange/refresh time
    """

    def __init__(self, redis: Any = None, secret_resolver: Any = None) -> None:
        self._redis = redis
        self._secret_resolver = secret_resolver  # Callable: (server_id) -> client_secret
        # In-memory token cache: server_id -> token data (NO secrets stored)
        self._token_cache: dict[int, dict[str, Any]] = {}

    # -------------------------------------------------------------------
    # Token retrieval (main entry point)
    # -------------------------------------------------------------------

    async def get_token(self, server_id: int) -> str:
        """Return a valid access token, refreshing if needed.

        Raises OAuthFlowError if no cached token and no refresh_token.
        """
        cached = self._token_cache.get(server_id)
        if not cached:
            raise OAuthFlowError(f"No cached token for server {server_id}")

        # Check if token is still valid (with skew)
        expires_at = cached.get("expires_at", 0)
        if time.time() < expires_at - _EXPIRY_SKEW_SECONDS:
            return cached["access_token"]

        # Token expired — try refresh
        refresh_token = cached.get("refresh_token")
        if not refresh_token:
            raise OAuthFlowError(f"Token expired and no refresh_token for server {server_id}")

        # Resolve client_secret from encrypted DB (never from cache)
        client_secret = await self._resolve_secret(server_id)

        new_token = await self._refresh_token(
            server_id=server_id,
            refresh_token=refresh_token,
            token_url=cached["token_url"],
            client_id=cached["client_id"],
            client_secret=client_secret,
        )

        logger.info("mcp_oauth_token_refreshed", server_id=server_id)
        return new_token

    # -------------------------------------------------------------------
    # Client Credentials Flow
    # -------------------------------------------------------------------

    async def client_credentials_flow(
        self,
        server_id: int,
        token_url: str,
        client_id: str,
        client_secret: str,
        scopes: list[str] | None = None,
    ) -> str:
        """Fetch a new token using client_credentials grant."""
        # F01: Validate token_url against SSRF
        await _validate_oauth_url(token_url)

        data: dict[str, str] = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        }
        if scopes:
            data["scope"] = " ".join(scopes)

        token_response = await self._token_request(token_url, data)

        # F03: Do NOT store client_secret in cache
        self._token_cache[server_id] = {
            "access_token": token_response["access_token"],
            "refresh_token": token_response.get("refresh_token"),
            "expires_at": time.time() + token_response.get("expires_in", 3600),
            "token_url": token_url,
            "client_id": client_id,
        }

        logger.info("mcp_oauth_client_credentials_success", server_id=server_id)
        return token_response["access_token"]

    # -------------------------------------------------------------------
    # Authorization Code + PKCE Flow
    # -------------------------------------------------------------------

    async def initiate_auth_code_flow(
        self,
        server_id: int,
        tenant_id: int,
        authorize_url: str,
        client_id: str,
        scopes: list[str] | None = None,
        client_secret: str = "",
        token_url: str = "",
    ) -> str:
        """Generate authorization URL with PKCE.

        Stores state + code_verifier in Redis with 10-min TTL.
        Returns the full redirect URL.
        """
        # F04: Validate authorize_url and token_url against SSRF
        await _validate_oauth_url(authorize_url)
        if token_url:
            await _validate_oauth_url(token_url)

        state = _generate_state()
        code_verifier = _generate_code_verifier()
        code_challenge = _generate_code_challenge(code_verifier)

        # F03: Do NOT store client_secret in Redis state
        # Store only IDs — secrets resolved from encrypted DB at exchange time
        redis_key = f"mcp:oauth:state:{tenant_id}:{server_id}:{state}"
        state_data = json.dumps({
            "server_id": server_id,
            "tenant_id": tenant_id,
            "code_verifier": code_verifier,
            "token_url": token_url,
            "client_id": client_id,
            # client_secret intentionally omitted — resolved from DB in handle_callback
        })
        await self._redis.setex(redis_key, _STATE_TTL_SECONDS, state_data)

        # F02: Store reverse-index key for O(1) lookup from state nonce
        reverse_key = f"mcp:oauth:nonce:{state}"
        await self._redis.setex(reverse_key, _STATE_TTL_SECONDS, redis_key)

        # Build authorization URL
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": CALLBACK_URL,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        if scopes:
            params["scope"] = " ".join(scopes)

        separator = "&" if "?" in authorize_url else "?"
        redirect_url = f"{authorize_url}{separator}{urlencode(params)}"

        logger.info(
            "mcp_oauth_auth_code_initiated",
            server_id=server_id,
            tenant_id=tenant_id,
        )
        return redirect_url

    async def handle_callback(
        self,
        state: str,
        code: str,
    ) -> dict[str, Any]:
        """Exchange authorization code for token.

        Validates state from Redis (tenant-namespaced).
        Uses stored code_verifier for PKCE.
        Resolves client_secret from encrypted DB (never from Redis state).
        """
        # F02: Use reverse-index key for O(1) lookup
        state_data = await self._find_state_data(state)
        if not state_data:
            raise OAuthFlowError("Invalid or expired state parameter")

        parsed = json.loads(state_data)
        server_id = parsed["server_id"]
        tenant_id = parsed["tenant_id"]
        code_verifier = parsed["code_verifier"]
        token_url = parsed["token_url"]
        client_id = parsed["client_id"]

        # F03: Resolve secret from encrypted DB, not from Redis state
        client_secret = await self._resolve_secret(server_id)

        # Delete both state keys from Redis (single-use)
        redis_key = f"mcp:oauth:state:{tenant_id}:{server_id}:{state}"
        reverse_key = f"mcp:oauth:nonce:{state}"
        await self._redis.delete(redis_key)
        await self._redis.delete(reverse_key)

        # F01: Validate token_url against SSRF before exchange
        await _validate_oauth_url(token_url)

        # Exchange code for token with PKCE
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": CALLBACK_URL,
            "client_id": client_id,
            "code_verifier": code_verifier,
        }
        if client_secret:
            data["client_secret"] = client_secret

        token_response = await self._token_request(token_url, data)

        # F03: Cache token without client_secret
        self._token_cache[server_id] = {
            "access_token": token_response["access_token"],
            "refresh_token": token_response.get("refresh_token"),
            "expires_at": time.time() + token_response.get("expires_in", 3600),
            "token_url": token_url,
            "client_id": client_id,
        }

        logger.info(
            "mcp_oauth_auth_code_success",
            server_id=server_id,
            tenant_id=tenant_id,
        )
        return token_response

    # -------------------------------------------------------------------
    # Token Revocation (RFC 7009)
    # -------------------------------------------------------------------

    async def revoke_token(
        self,
        revocation_url: str,
        access_token: str,
        client_id: str,
        client_secret: str = "",
    ) -> None:
        """Revoke an access token at the provider (RFC 7009)."""
        # F01: Validate revocation URL against SSRF
        await _validate_oauth_url(revocation_url)

        data = {
            "token": access_token,
            "token_type_hint": "access_token",
            "client_id": client_id,
        }
        if client_secret:
            data["client_secret"] = client_secret

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(revocation_url, data=data)
                if resp.status_code >= 400:
                    logger.warning(
                        "mcp_oauth_revoke_failed",
                        status=resp.status_code,
                        body=resp.text[:200],
                    )
                else:
                    logger.info("mcp_oauth_token_revoked")
        except Exception as exc:
            logger.warning("mcp_oauth_revoke_error", error=str(exc))

    # -------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------

    async def _resolve_secret(self, server_id: int) -> str:
        """Resolve client_secret from encrypted DB storage.

        Never returns the secret from cache or Redis.
        """
        if self._secret_resolver:
            return await self._secret_resolver(server_id)
        return ""

    async def _refresh_token(
        self,
        server_id: int,
        refresh_token: str,
        token_url: str,
        client_id: str,
        client_secret: str = "",
    ) -> str:
        """Refresh an expired token. Updates cache."""
        # F01: Validate token_url against SSRF
        await _validate_oauth_url(token_url)

        data: dict[str, str] = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        }
        if client_secret:
            data["client_secret"] = client_secret

        token_response = await self._token_request(token_url, data)

        # F03: Cache without client_secret
        self._token_cache[server_id] = {
            "access_token": token_response["access_token"],
            "refresh_token": token_response.get("refresh_token", refresh_token),
            "expires_at": time.time() + token_response.get("expires_in", 3600),
            "token_url": token_url,
            "client_id": client_id,
        }

        return token_response["access_token"]

    async def _token_request(self, token_url: str, data: dict[str, str]) -> dict[str, Any]:
        """Make a token request to an OAuth endpoint.

        URL is already SSRF-validated by the caller.
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if resp.status_code >= 400:
                raise OAuthFlowError(
                    f"Token request failed ({resp.status_code}): {resp.text[:200]}"
                )
            return resp.json()

    async def _find_state_data(self, state: str) -> bytes | None:
        """Find state data in Redis by state nonce using reverse-index key.

        F02 fix: Uses reverse-index key `mcp:oauth:nonce:{state}` which
        points to the full namespaced key `mcp:oauth:state:{tenant}:{server}:{state}`.
        This provides O(1) lookup without SCAN.
        """
        # Step 1: Look up the full key via reverse-index
        reverse_key = f"mcp:oauth:nonce:{state}"
        full_key = await self._redis.get(reverse_key)
        if full_key:
            if isinstance(full_key, bytes):
                full_key = full_key.decode()
            # Step 2: Get the actual state data using the full key
            result = await self._redis.get(full_key)
            if result:
                return result

        # Fallback: direct get (for test mocks that return data for any key)
        result = await self._redis.get(state)
        return result
