"""
OAuth Service
Handles OAuth 2.0 authentication flow for Google and GitHub
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import json
import uuid
from itsdangerous import URLSafeTimedSerializer
from app.core.config import settings

from app.models.user import User
from app.models.oauth import OAuthConnection
from app.core.auth import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES


# R11.1: Use a serializer for the state parameter to prevent CSRF
state_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt='oauth-state-salt')

class OAuthService:
    """OAuth service for handling social login"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def handle_oauth_callback(
        self,
        provider: str,
        code: str,
        redirect_uri: str,
        client_id: str,
        client_secret: str,
        state: str
    ) -> Dict[str, Any]:
        """
        Handle OAuth callback and create/login user
        
        Args:
            provider: OAuth provider (google, github)
            code: Authorization code from provider
            redirect_uri: Callback URL
            client_id: OAuth client ID
            client_secret: OAuth client secret
            
        Returns:
            Dict with access_token, user info
        """
        # R11.2: Validate the state parameter to prevent CSRF
        try:
            # State expires in 10 minutes
            state_serializer.loads(state, max_age=600)
        except Exception:
            raise ValueError("Invalid or expired OAuth state token")

        # Exchange code for access token
        token_data = await self._exchange_code_for_token(
            provider, code, redirect_uri, client_id, client_secret
        )
        
        if not token_data:
            raise ValueError("Failed to exchange code for token")
        
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")
        
        # Get user profile from provider
        profile = await self._get_user_profile(provider, access_token)
        
        if not profile or not profile.get("email"):
            raise ValueError("Failed to get user profile or email not provided")
        
        # Find or create user
        user = await self._find_or_create_user(
            provider=provider,
            profile=profile,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in
        )
        
        # Create JWT access token
        jwt_token = create_access_token(
            data={"user_id": str(user.id), "email": user.email},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return {
            "access_token": jwt_token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "credits_balance": float(user.credits_balance),
                "is_admin": user.is_admin,
                "email_verified": user.email_verified
            }
        }
    
    async def _exchange_code_for_token(
        self,
        provider: str,
        code: str,
        redirect_uri: str,
        client_id: str,
        client_secret: str,
        state: str
    ) -> Optional[Dict[str, Any]]:
        """Exchange authorization code for access token"""
        
        token_urls = {
            "google": "https://oauth2.googleapis.com/token",
            "github": "https://github.com/login/oauth/access_token"
        }
        
        token_url = token_urls.get(provider)
        if not token_url:
            return None
        
        data = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }
        
        headers = {"Accept": "application/json"}
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data, headers=headers)
            
            if response.status_code == 200:
                return response.json()
            
            return None
    
    async def _get_user_profile(
        self,
        provider: str,
        access_token: str
    ) -> Optional[Dict[str, Any]]:
        """Get user profile from OAuth provider"""
        
        profile_urls = {
            "google": "https://www.googleapis.com/oauth2/v2/userinfo",
            "github": "https://api.github.com/user"
        }
        
        profile_url = profile_urls.get(provider)
        if not profile_url:
            return None
        
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(profile_url, headers=headers)
            
            if response.status_code == 200:
                profile = response.json()
                
                # Normalize profile data
                if provider == "google":
                    return {
                        "id": profile.get("id"),
                        "email": profile.get("email"),
                        "name": profile.get("name"),
                        "picture": profile.get("picture"),
                        "verified_email": profile.get("verified_email", False)
                    }
                elif provider == "github":
                    # GitHub might not return email in profile, need to fetch separately
                    email = profile.get("email")
                    if not email:
                        email = await self._get_github_primary_email(access_token)
                    
                    return {
                        "id": str(profile.get("id")),
                        "email": email,
                        "name": profile.get("name") or profile.get("login"),
                        "picture": profile.get("avatar_url"),
                        "verified_email": True  # GitHub emails are verified
                    }
            
            return None
    
    async def _get_github_primary_email(self, access_token: str) -> Optional[str]:
        """Get primary email from GitHub (separate API call)"""
        
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/user/emails",
                headers=headers
            )
            
            if response.status_code == 200:
                emails = response.json()
                # Find primary verified email
                for email_data in emails:
                    if email_data.get("primary") and email_data.get("verified"):
                        return email_data.get("email")
                
                # Fallback to first verified email
                for email_data in emails:
                    if email_data.get("verified"):
                        return email_data.get("email")
            
            return None
    
    async def _find_or_create_user(
        self,
        provider: str,
        profile: Dict[str, Any],
        access_token: str,
        refresh_token: Optional[str],
        expires_in: Optional[int]
    ) -> User:
        """Find existing user or create new one from OAuth profile"""
        
        provider_user_id = profile["id"]
        email = profile["email"]
        
        # Check if OAuth connection exists
        result = await self.db.execute(
            select(OAuthConnection).where(
                OAuthConnection.provider == provider,
                OAuthConnection.provider_user_id == provider_user_id
            )
        )
        oauth_conn = result.scalar_one_or_none()
        
        if oauth_conn:
            # Update existing connection
            oauth_conn.access_token = access_token
            oauth_conn.refresh_token = refresh_token
            if expires_in:
                oauth_conn.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            oauth_conn.profile_data = json.dumps(profile)
            oauth_conn.updated_at = datetime.utcnow()
            
            await self.db.commit()
            await self.db.refresh(oauth_conn)
            
            return oauth_conn.user
        
        # Check if user exists with this email
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user
            user = User(
                email=email,
                password_hash="",  # No password for OAuth users
                full_name=profile.get("name", ""),
                credits_balance=0,
                is_active=True,
                is_admin=False,
                email_verified=profile.get("verified_email", False)
            )
            self.db.add(user)
            await self.db.flush()
        
        # Create OAuth connection
        oauth_connection = OAuthConnection(
            user_id=str(user.id),
            provider=provider,
            provider_user_id=provider_user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None,
            profile_data=json.dumps(profile)
        )
        
        self.db.add(oauth_connection)
        await self.db.commit()
        await self.db.refresh(user)
        
        return user
    
    def generate_oauth_state(self) -> str:
        """Generates a signed, timed state token for OAuth flows."""
        return state_serializer.dumps(str(uuid.uuid4()))

    async def link_oauth_account(
        self,
        user_id: str,
        provider: str,
        code: str,
        redirect_uri: str,
        client_id: str,
        client_secret: str,
        state: str
    ) -> bool:
        """Link OAuth account to existing user"""
        
        # R11.2: Validate the state parameter
        try:
            state_serializer.loads(state, max_age=600)
        except Exception:
            raise ValueError("Invalid or expired OAuth state token")

        # Exchange code for token
        token_data = await self._exchange_code_for_token(
            provider, code, redirect_uri, client_id, client_secret
        )
        
        if not token_data:
            return False
        
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")
        
        # Get profile
        profile = await self._get_user_profile(provider, access_token)
        
        if not profile:
            return False
        
        provider_user_id = profile["id"]
        
        # Check if this OAuth account is already linked
        result = await self.db.execute(
            select(OAuthConnection).where(
                OAuthConnection.provider == provider,
                OAuthConnection.provider_user_id == provider_user_id
            )
        )
        existing_conn = result.scalar_one_or_none()
        
        if existing_conn:
            # Already linked to another user
            if str(existing_conn.user_id) != user_id:
                raise ValueError("This OAuth account is already linked to another user")
            
            # Update existing connection
            existing_conn.access_token = access_token
            existing_conn.refresh_token = refresh_token
            if expires_in:
                existing_conn.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            existing_conn.profile_data = json.dumps(profile)
            existing_conn.updated_at = datetime.utcnow()
        else:
            # Create new connection
            oauth_connection = OAuthConnection(
                user_id=user_id,
                provider=provider,
                provider_user_id=provider_user_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None,
                profile_data=json.dumps(profile)
            )
            self.db.add(oauth_connection)
        
        await self.db.commit()
        return True
    
    async def unlink_oauth_account(
        self,
        user_id: str,
        provider: str
    ) -> bool:
        """Unlink OAuth account from user"""
        
        # Check if user has password (prevent locking out)
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            return False
        
        # Count OAuth connections
        result = await self.db.execute(
            select(OAuthConnection).where(OAuthConnection.user_id == user_id)
        )
        oauth_connections = result.scalars().all()
        
        # Prevent unlinking if it's the only auth method and no password
        if len(oauth_connections) == 1 and not user.password_hash:
            raise ValueError("Cannot unlink the only authentication method")
        
        # Delete OAuth connection
        result = await self.db.execute(
            select(OAuthConnection).where(
                OAuthConnection.user_id == user_id,
                OAuthConnection.provider == provider
            )
        )
        oauth_conn = result.scalar_one_or_none()
        
        if oauth_conn:
            await self.db.delete(oauth_conn)
            await self.db.commit()
            return True
        
        return False
