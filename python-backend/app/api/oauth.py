"""
OAuth API Endpoints
Handles OAuth 2.0 authentication with Google and GitHub
"""

from typing import Optional
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import os

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.oauth_config import get_oauth_config
from app.services.oauth_service import OAuthService
from app.models.user import User

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


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
    redirect_uri = cfg.get("googleRedirectUri", "")

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
    redirect_uri = cfg.get("googleRedirectUri", "")

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth callback failed: {str(e)}"
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth callback failed: {str(e)}"
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
        redirect_uri = cfg.get("googleRedirectUri", "")
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
