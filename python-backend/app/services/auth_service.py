"""
Authentication Service
Handles user authentication, token management, and password reset
"""

import uuid
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete


from app.core.config import settings
from app.core.security import (
    get_password_hash, verify_password,
    create_access_token as create_access_token_util,
    create_refresh_token as create_refresh_token_util,
    decode_token,
    add_to_blacklist,
    is_token_blacklisted as is_token_blacklisted_in_memory,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.models.user import User
from app.models.token_blacklist import TokenBlacklist
from app.models.password_reset import PasswordResetToken


# JWT settings are now centralized in core.security


class AuthService:
    """Service for authentication operations"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ============================================================
    # Token Generation
    # ============================================================
    
    def create_access_token(
        self,
        user_id: str,
        email: str,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        Create JWT access token
        
        Args:
            user_id: User ID
            email: User email
            expires_delta: Token expiration time (default: 30 minutes)
        
        Returns:
            JWT access token
        """
        return create_access_token_util(
            data={"sub": user_id, "email": email, "jti": str(uuid.uuid4())},
            expires_delta=expires_delta
        )
    
    def create_refresh_token(
        self,
        user_id: str,
        email: str,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """
        Create JWT refresh token
        
        Args:
            user_id: User ID
            email: User email
            expires_delta: Token expiration time (default: 30 days)
        
        Returns:
            JWT refresh token
        """
        return create_refresh_token_util(
            data={"sub": user_id, "email": email, "jti": str(uuid.uuid4())},
            expires_delta=expires_delta
        )
    
    def create_token_pair(
        self,
        user_id: str,
        email: str
    ) -> Dict[str, str]:
        """
        Create access and refresh token pair
        
        Args:
            user_id: User ID
            email: User email
        
        Returns:
            Dictionary with access_token and refresh_token
        """
        access_token = self.create_access_token(user_id, email)
        refresh_token = self.create_refresh_token(user_id, email)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60  # seconds
        }
    
    # ============================================================
    # Token Verification
    # ============================================================
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify JWT token
        
        Args:
            token: JWT token string
        
        Returns:
            Decoded token payload or None if invalid
        """
        return decode_token(token)
    
    async def is_token_blacklisted(self, jti: str) -> bool:
        """
        Check if token is blacklisted
        
        Args:
            jti: JWT ID
        
        Returns:
            True if blacklisted, False otherwise
        """
        # R1.3: Check in-memory blacklist first for performance
        if is_token_blacklisted_in_memory(jti):
            return True
        
        # Fallback to database check
        result = await self.db.execute(
            select(TokenBlacklist).where(TokenBlacklist.jti == jti)
        )
        return result.scalar_one_or_none() is not None
    
    # ============================================================
    # Token Refresh
    # ============================================================
    
    async def refresh_access_token(
        self,
        refresh_token: str
    ) -> Optional[Dict[str, str]]:
        """
        Refresh access token using refresh token
        
        Args:
            refresh_token: Refresh token
        
        Returns:
            New token pair or None if invalid
        """
        # Verify refresh token
        payload = self.verify_token(refresh_token)
        if not payload:
            return None
        
        # Check token type
        if payload.get("type") != "refresh":
            return None
        
        # Check if blacklisted
        jti = payload.get("jti")
        if jti and await self.is_token_blacklisted(jti):
            return None
        
        # Get user
        user_id = payload.get("sub")
        email = payload.get("email")
        
        if not user_id or not email:
            return None
        
        # Verify user exists
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        # Create new token pair
        return self.create_token_pair(user_id, email)
    
    # ============================================================
    # Logout
    # ============================================================
    
    async def logout(
        self,
        access_token: str,
        refresh_token: Optional[str] = None
    ) -> bool:
        """
        Logout user by blacklisting tokens
        
        Args:
            access_token: Access token to blacklist
            refresh_token: Refresh token to blacklist (optional)
        
        Returns:
            True if successful
        """
        tokens_to_blacklist = [access_token]
        if refresh_token:
            tokens_to_blacklist.append(refresh_token)
        
        for token in tokens_to_blacklist:
            payload = self.verify_token(token)
            if not payload:
                continue
            
            jti = payload.get("jti")
            user_id = payload.get("sub")
            token_type = payload.get("type", "access")
            exp = payload.get("exp")
            
            if not jti or not user_id or not exp:
                continue
            
            # R1.3: Add to both in-memory and DB blacklist
            add_to_blacklist(jti) # In-memory
            
            # Add to database
            db_entry = await self.db.execute(select(TokenBlacklist).where(TokenBlacklist.jti == jti))
            if db_entry.scalar_one_or_none() is None:
                blacklist_entry = TokenBlacklist(
                    jti=jti,
                    user_id=user_id,
                    token_type=token_type,
                    expires_at=datetime.fromtimestamp(exp),
                    reason="logout"
                )
                self.db.add(blacklist_entry)
        
        await self.db.commit()
        return True
    
    async def logout_all_sessions(self, user_id: str) -> int:
        """
        Logout all sessions for a user
        
        This is a placeholder - in production, you'd need to track all active sessions
        
        Args:
            user_id: User ID
        
        Returns:
            Number of sessions logged out
        """
        # In a real implementation, you'd:
        # 1. Store all active sessions in Redis
        # 2. Blacklist all JTIs for this user
        # 3. Clear session storage
        
        # For now, just return 0 as we don't track sessions
        return 0
    
    # ============================================================
    # Password Reset
    # ============================================================
    
    async def create_password_reset_token(
        self,
        user_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> str:
        """
        Create password reset token
        
        Args:
            user_id: User ID
            ip_address: Request IP address
            user_agent: Request user agent
        
        Returns:
            Reset token
        """
        import hashlib
        
        # Generate secure random token
        token = secrets.token_urlsafe(32)
        
        # Hash the token for storage (R12.1)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Create reset token record
        reset_token = PasswordResetToken(
            id=str(uuid.uuid4()),
            user_id=user_id,
            token_hash=token_hash,
            expires_at=PasswordResetToken.get_expiry_time(),
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        self.db.add(reset_token)
        await self.db.commit()
        
        return token
    
    async def verify_password_reset_token(
        self,
        token: str
    ) -> Optional[str]:
        """
        Verify password reset token
        
        Args:
            token: Reset token
        
        Returns:
            User ID if valid, None otherwise
        """
        import hashlib
        
        # Hash the token to compare with stored hash
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        result = await self.db.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
        reset_token = result.scalar_one_or_none()
        
        if not reset_token or not reset_token.is_valid():
            return None
        
        return reset_token.user_id
    
    async def reset_password(
        self,
        token: str,
        new_password: str
    ) -> bool:
        """
        Reset password using reset token
        
        Args:
            token: Reset token
            new_password: New password
        
        Returns:
            True if successful, False otherwise
        """
        # Verify token
        user_id = await self.verify_password_reset_token(token)
        if not user_id:
            return False
        
        # Get user
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            return False
        
        # Update password
        user.hashed_password = get_password_hash(new_password)
        
        # Mark token as used
        import hashlib
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        result = await self.db.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
        reset_token = result.scalar_one_or_none()
        
        if reset_token:
            reset_token.used_at = datetime.utcnow()
        
        await self.db.commit()
        
        # Logout all sessions (invalidate all tokens)
        await self.logout_all_sessions(user_id)
        
        return True
    
    # ============================================================
    # Cleanup
    # ============================================================
    
    async def cleanup_expired_tokens(self) -> Tuple[int, int]:
        """
        Clean up expired tokens from blacklist and reset tokens
        
        Returns:
            Tuple of (blacklist_deleted, reset_tokens_deleted)
        """
        now = datetime.utcnow()
        
        # Delete expired blacklist entries
        result1 = await self.db.execute(
            delete(TokenBlacklist).where(TokenBlacklist.expires_at < now)
        )
        blacklist_deleted = result1.rowcount
        
        # Delete expired/used reset tokens older than 24 hours
        cutoff = now - timedelta(hours=24)
        result2 = await self.db.execute(
            delete(PasswordResetToken).where(
                (PasswordResetToken.expires_at < now) |
                ((PasswordResetToken.used_at != None) & (PasswordResetToken.used_at < cutoff))
            )
        )
        reset_deleted = result2.rowcount
        
        await self.db.commit()
        
        return (blacklist_deleted, reset_deleted)
