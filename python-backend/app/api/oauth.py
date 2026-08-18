"""
OAuth API Endpoints
Handles OAuth 2.0 authentication with Google and GitHub
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import os

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.oauth_config import get_oauth_config, is_valid_google_login_redirect_uri
from app.services.oauth_service import OAuthService
from app.services.google_token_service import GoogleTokenService, InvalidGrantError as GoogleInvalidGrantError
from app.services.microsoft_token_service import MicrosoftTokenService, InvalidGrantError as MicrosoftInvalidGrantError
from app.models.user import User

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _require_google_login_redirect_uri(value: str) -> str:
    if not is_valid_google_login_redirect_uri(value):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth login redirect URI must end with /auth/callback/google",
        )
    return value


class OAuthCallbackRequest(BaseModel):
    """OAuth callback request"""
    code: str
    state: Optional[str] = None


class LinkOAuthRequest(BaseModel):
    """Link OAuth account request"""
    code: str
    provider: str
    state: Optional[str] = None


@router.get("/google/authorize")
async def google_authorize(db: AsyncSession = Depends(get_db)):
    """
    Get Google OAuth authorization URL with CSRF state token
    """
    cfg = await get_oauth_config(db)
    client_id = cfg.get("googleClientId", "")
    redirect_uri = _require_google_login_redirect_uri(cfg.get("googleRedirectUri", ""))

    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured"
        )

    oauth_service = OAuthService(db)
    state = oauth_service.generate_oauth_state()

    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={quote(client_id, safe='')}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={quote(state, safe='')}"
    )

    return {"authorization_url": auth_url, "state": state}


@router.get("/github/authorize")
async def github_authorize(db: AsyncSession = Depends(get_db)):
    """
    Get GitHub OAuth authorization URL with CSRF state token
    """
    cfg = await get_oauth_config(db)
    client_id = cfg.get("githubClientId", "")
    redirect_uri = cfg.get("githubRedirectUri", "")

    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured"
        )

    oauth_service = OAuthService(db)
    state = oauth_service.generate_oauth_state()

    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={quote(client_id, safe='')}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&scope=user:email"
        f"&state={quote(state, safe='')}"
    )

    return {"authorization_url": auth_url, "state": state}


@router.post("/google/callback")
async def google_callback(
    request: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Google OAuth callback

    - Validates CSRF state token
    - Exchanges code for access token
    - Creates or logs in user
    - Returns JWT token
    """
    cfg = await get_oauth_config(db)
    client_id = cfg.get("googleClientId", "")
    client_secret = cfg.get("googleClientSecret", "")
    redirect_uri = _require_google_login_redirect_uri(cfg.get("googleRedirectUri", ""))

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured"
        )

    if not request.state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth state parameter"
        )

    try:
        oauth_service = OAuthService(db)
        result = await oauth_service.handle_oauth_callback(
            provider="google",
            code=request.code,
            redirect_uri=redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            state=request.state
        )

        return result

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception("OAuth callback error for provider google")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth callback failed"
        )


@router.post("/github/callback")
async def github_callback(
    request: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle GitHub OAuth callback

    - Validates CSRF state token
    - Exchanges code for access token
    - Creates or logs in user
    - Returns JWT token
    """
    cfg = await get_oauth_config(db)
    client_id = cfg.get("githubClientId", "")
    client_secret = cfg.get("githubClientSecret", "")
    redirect_uri = cfg.get("githubRedirectUri", "")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured"
        )

    if not request.state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth state parameter"
        )

    try:
        oauth_service = OAuthService(db)
        result = await oauth_service.handle_oauth_callback(
            provider="github",
            code=request.code,
            redirect_uri=redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            state=request.state
        )

        return result

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception("OAuth callback error for provider github")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OAuth callback failed"
        )


@router.post("/link")
async def link_oauth_account(
    request: LinkOAuthRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Link OAuth account to current user

    - Requires authentication
    - Links Google or GitHub account
    """
    provider = request.provider.lower()

    if provider not in ["google", "github"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider. Must be 'google' or 'github'"
        )

    # Get OAuth config from DB / env
    cfg = await get_oauth_config(db)
    if provider == "google":
        client_id = cfg.get("googleClientId", "")
        client_secret = cfg.get("googleClientSecret", "")
        redirect_uri = _require_google_login_redirect_uri(cfg.get("googleRedirectUri", ""))
    else:  # github
        client_id = cfg.get("githubClientId", "")
        client_secret = cfg.get("githubClientSecret", "")
        redirect_uri = cfg.get("githubRedirectUri", "")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider.title()} OAuth is not configured"
        )

    if not request.state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth state parameter"
        )

    try:
        oauth_service = OAuthService(db)
        success = await oauth_service.link_oauth_account(
            user_id=str(current_user.id),
            provider=provider,
            code=request.code,
            redirect_uri=redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            state=request.state
        )

        if success:
            return {"message": f"{provider.title()} account linked successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to link OAuth account"
            )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to link account: {str(e)}"
        )


@router.delete("/unlink/{provider}")
async def unlink_oauth_account(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unlink OAuth account from current user

    - Requires authentication
    - Unlinks Google or GitHub account
    - Prevents unlinking if it's the only auth method
    """
    provider = provider.lower()

    if provider not in ["google", "github"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider. Must be 'google' or 'github'"
        )

    try:
        oauth_service = OAuthService(db)
        success = await oauth_service.unlink_oauth_account(
            user_id=str(current_user.id),
            provider=provider
        )

        if success:
            return {"message": f"{provider.title()} account unlinked successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{provider.title()} account not found"
            )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unlink account: {str(e)}"
        )


@router.get("/connections")
async def get_oauth_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user's OAuth connections

    - Requires authentication
    - Returns list of linked OAuth providers
    """
    from sqlalchemy import select
    from app.models.oauth import OAuthConnection

    result = await db.execute(
        select(OAuthConnection).where(
            OAuthConnection.user_id == str(current_user.id)
        )
    )
    connections = result.scalars().all()

    return {
        "connections": [
            {
                "provider": conn.provider,
                "connected_at": conn.created_at.isoformat(),
                "email_verified": True
            }
            for conn in connections
        ]
    }


# ─── Google Drive OAuth (per-user incremental consent) ───


class DriveCallbackRequest(BaseModel):
    code: str
    state: str


@router.get("/google/drive/authorize")
async def drive_authorize(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get Google OAuth URL with Drive scopes for an authenticated user."""
    try:
        svc = GoogleTokenService(db)
        return await svc.build_drive_auth_url(user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )


@router.post("/google/drive/callback")
async def drive_callback(
    request: DriveCallbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Drive OAuth code for tokens and store them."""
    try:
        svc = GoogleTokenService(db)
        result = await svc.exchange_drive_code(
            user_id=current_user.id,
            code=request.code,
            state=request.state,
            tenant_id=getattr(current_user, "tenant_id", None),
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/google/drive/status")
async def drive_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's Google Drive connection status."""
    svc = GoogleTokenService(db)
    return await svc.get_connection_status(user_id=current_user.id)


@router.delete("/google/drive/disconnect")
async def drive_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Google Drive for the current user."""
    svc = GoogleTokenService(db)
    success = await svc.disconnect(user_id=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Google Drive connection found",
        )
    return {"success": True}


# ─── Microsoft OneDrive OAuth (per-user consent) ───


class OneDriveCallbackRequest(BaseModel):
    code: str
    state: str


@router.get("/microsoft/onedrive/authorize")
async def onedrive_authorize(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get Microsoft OAuth URL with OneDrive scopes for an authenticated user."""
    try:
        svc = MicrosoftTokenService(db)
        return await svc.build_onedrive_auth_url(user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )


@router.post("/microsoft/onedrive/callback")
async def onedrive_callback(
    request: OneDriveCallbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange OneDrive OAuth code for tokens and store them."""
    try:
        svc = MicrosoftTokenService(db)
        result = await svc.exchange_onedrive_code(
            user_id=current_user.id,
            code=request.code,
            state=request.state,
            tenant_id=getattr(current_user, "tenant_id", None),
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/microsoft/onedrive/status")
async def onedrive_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's OneDrive connection status."""
    svc = MicrosoftTokenService(db)
    return await svc.get_connection_status(user_id=current_user.id)


@router.delete("/microsoft/onedrive/disconnect")
async def onedrive_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect OneDrive for the current user."""
    svc = MicrosoftTokenService(db)
    success = await svc.disconnect(user_id=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No OneDrive connection found",
        )
    return {"success": True}
