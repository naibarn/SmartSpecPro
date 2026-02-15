"""
GoogleTokenService -- manages per-user Google OAuth token lifecycle for Drive integration.

Separate from the login OAuth flow (which creates/authenticates users).
This manages tokens for authenticated users who connect Google Drive.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.oauth_config import get_oauth_config
from app.core.smartspecweb_crypto import (
    decrypt_smartspecweb,
    encrypt_smartspecweb,
    is_encrypted,
)
from app.models.oauth import OAuthConnection
from app.services.oauth_service import OAuthService, state_serializer

logger = logging.getLogger(__name__)

# Drive scopes for incremental consent
DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Refresh buffer: refresh if token expires within this window
REFRESH_BUFFER = timedelta(minutes=5)


class InvalidGrantError(Exception):
    """Raised when Google returns invalid_grant during token refresh."""
    pass


class GoogleTokenService:
    """Manages Google OAuth tokens for Drive integration."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_connection(self, user_id: int) -> Optional[OAuthConnection]:
        """Get the user's Google OAuth connection."""
        result = await self.db.execute(
            select(OAuthConnection).where(
                OAuthConnection.user_id == user_id,
                OAuthConnection.provider == "google",
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _decrypt_token(token: Optional[str]) -> str:
        """Decrypt a token value, handling both encrypted and plaintext formats."""
        if not token:
            return ""
        if is_encrypted(token):
            return decrypt_smartspecweb(token)
        return token

    @staticmethod
    def _encrypt_token(token: str) -> str:
        """Encrypt a token value for storage."""
        if not token:
            return ""
        return encrypt_smartspecweb(token)

    async def get_valid_access_token(self, user_id: int) -> str:
        """
        Returns a valid access token, refreshing if near expiry.
        Raises InvalidGrantError if refresh fails with invalid_grant.
        Uses SELECT ... FOR UPDATE to prevent concurrent refresh races.
        """
        result = await self.db.execute(
            select(OAuthConnection)
            .where(
                OAuthConnection.user_id == user_id,
                OAuthConnection.provider == "google",
            )
            .with_for_update()
        )
        conn = result.scalar_one_or_none()
        if not conn:
            raise ValueError("No Google connection found for this user")

        now = datetime.now(timezone.utc)
        expires_at = conn.token_expires_at
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        # Return cached token if not near expiry
        if expires_at and (expires_at - now) > REFRESH_BUFFER:
            return self._decrypt_token(conn.access_token)

        # Refresh the token
        return await self._refresh_token(conn)

    async def _refresh_token(self, conn: OAuthConnection) -> str:
        """Refresh the access token using the stored refresh_token."""
        refresh_token = self._decrypt_token(conn.refresh_token)
        if not refresh_token:
            conn.status = "expired"
            await self.db.commit()
            raise InvalidGrantError("No refresh token available")

        cfg = await get_oauth_config(self.db)
        client_id = cfg.get("googleClientId", "")
        client_secret = cfg.get("googleClientSecret", "")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )

        data = resp.json()

        if resp.status_code != 200 or "error" in data:
            error = data.get("error", "unknown_error")
            if error == "invalid_grant":
                conn.status = "expired"
                await self.db.commit()
                raise InvalidGrantError(f"Google token refresh failed: {error}")
            raise ValueError(f"Token refresh failed: {error}")

        # Update stored tokens (encrypted)
        new_access_token = data["access_token"]
        conn.access_token = self._encrypt_token(new_access_token)
        if "refresh_token" in data:
            conn.refresh_token = self._encrypt_token(data["refresh_token"])
        conn.token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=data.get("expires_in", 3600)
        )
        conn.status = "active"
        await self.db.commit()

        logger.info("Refreshed Google access token for user %s", conn.user_id)
        return new_access_token

    async def build_drive_auth_url(self, user_id: int) -> dict:
        """Build Google OAuth URL with Drive scopes for incremental consent."""
        cfg = await get_oauth_config(self.db)
        client_id = cfg.get("googleClientId", "")
        redirect_uri = cfg.get(
            "googleDriveRedirectUri",
            "https://smartaihub.app/auth/callback/google-drive",
        )

        if not client_id:
            raise ValueError("Google OAuth is not configured")

        oauth_service = OAuthService(self.db)
        state = oauth_service.generate_oauth_state()

        scope = " ".join(DRIVE_SCOPES)

        auth_url = (
            f"https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id={quote(client_id, safe='')}"
            f"&redirect_uri={quote(redirect_uri, safe='')}"
            f"&response_type=code"
            f"&scope={quote(scope, safe='')}"
            f"&include_granted_scopes=true"
            f"&access_type=offline"
            f"&prompt=consent"
            f"&state={quote(state, safe='')}"
        )

        return {"authorization_url": auth_url, "state": state}

    async def exchange_drive_code(
        self, user_id: int, code: str, state: str, tenant_id: Optional[str] = None
    ) -> dict:
        """Exchange authorization code for tokens and store them."""
        # Validate CSRF state token (10 minute expiry)
        try:
            state_serializer.loads(state, max_age=600)
        except Exception:
            raise ValueError("Invalid or expired OAuth state token")

        cfg = await get_oauth_config(self.db)
        client_id = cfg.get("googleClientId", "")
        client_secret = cfg.get("googleClientSecret", "")
        redirect_uri = cfg.get(
            "googleDriveRedirectUri",
            "https://smartaihub.app/auth/callback/google-drive",
        )

        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )

        token_data = token_resp.json()
        if token_resp.status_code != 200 or "error" in token_data:
            error = token_data.get("error_description", token_data.get("error", "unknown"))
            raise ValueError(f"Token exchange failed: {error}")

        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)
        granted_scopes = token_data.get("scope", "").split()

        # Fetch user email from Google
        async with httpx.AsyncClient() as client:
            userinfo_resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )

        email = None
        if userinfo_resp.status_code == 200:
            email = userinfo_resp.json().get("email")

        # Upsert oauth_connections (encrypt tokens before storage)
        encrypted_access = self._encrypt_token(access_token)
        encrypted_refresh = self._encrypt_token(refresh_token) if refresh_token else None

        existing = await self._get_connection(user_id)
        if existing:
            existing.access_token = encrypted_access
            if encrypted_refresh:
                existing.refresh_token = encrypted_refresh
            existing.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            existing.status = "active"
            existing.scopes = ",".join(granted_scopes)
        else:
            new_conn = OAuthConnection(
                user_id=user_id,
                provider="google",
                provider_user_id=email or str(user_id),
                access_token=encrypted_access,
                refresh_token=encrypted_refresh,
                token_expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
                status="active",
                scopes=",".join(granted_scopes),
                tenant_id=tenant_id,
            )
            self.db.add(new_conn)

        await self.db.commit()

        return {
            "email": email,
            "scopes": granted_scopes,
            "status": "connected",
        }

    async def get_connection_status(self, user_id: int) -> dict:
        """Get current Google Drive connection status."""
        conn = await self._get_connection(user_id)
        if not conn:
            return {
                "status": "not_connected",
                "email": None,
                "scopes": [],
                "connectedAt": None,
            }

        email = await self._get_email_from_connection(conn)
        scopes = conn.scopes.split(",") if conn.scopes else []

        status = "connected" if conn.status == "active" else conn.status

        return {
            "status": status,
            "email": email,
            "scopes": scopes,
            "connectedAt": conn.created_at.isoformat() if conn.created_at else None,
        }

    async def _get_email_from_connection(self, conn: OAuthConnection) -> Optional[str]:
        """Extract email from connection (provider_user_id stores email for Google)."""
        pid = conn.provider_user_id
        if pid and "@" in pid:
            return pid
        return None

    async def revoke_token(self, user_id: int) -> bool:
        """
        Revoke the user's Google OAuth token and update connection status.

        Best-effort: updates status to 'revoked' regardless of Google's response.
        Returns True if Google accepted the revocation, False otherwise.
        """
        conn = await self._get_connection(user_id)
        if not conn:
            return False

        access_token = self._decrypt_token(conn.access_token)
        revoked_at_google = False

        if access_token:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://oauth2.googleapis.com/revoke",
                        data={"token": access_token},
                        headers={"Content-Type": "application/x-www-form-urlencoded"},
                    )
                revoked_at_google = resp.status_code == 200
                if not revoked_at_google:
                    logger.warning(
                        "Token revocation returned %d for user %d",
                        resp.status_code, user_id,
                    )
            except Exception as e:
                logger.warning("Token revocation request failed for user %d: %s", user_id, str(e))

        conn.status = "revoked"
        await self.db.commit()
        return revoked_at_google

    async def disconnect(self, user_id: int) -> bool:
        """Remove the Google Drive connection (simple version)."""
        conn = await self._get_connection(user_id)
        if not conn:
            return False
        await self.db.delete(conn)
        await self.db.commit()
        return True
