"""
Authentication Module
JWT token generation and validation using enhanced JWT Manager
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.core.config import settings
from app.core.database import get_db
from app.core.jwt_manager import get_jwt_manager, create_access_token as jwt_create_access, create_refresh_token as jwt_create_refresh
from app.models.user import User
from app.models.token_blacklist import TokenBlacklist

logger = structlog.get_logger(__name__)

# Re-export ACCESS_TOKEN_EXPIRE_MINUTES from settings for backwards compatibility
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token (backwards compatible)

    Args:
        data: Data to encode in token (should include 'sub' with user_id)
        expires_delta: Token expiration time (ignored, uses JWT Manager config)

    Returns:
        JWT token string
    """
    # Extract user_id from data
    user_id = data.get("sub")
    if not user_id:
        # Fallback to old format
        user_id = data.get("user_id")

    if not user_id:
        raise ValueError("user_id is required in token data")

    # Use JWT Manager for token creation
    additional_claims = {k: v for k, v in data.items() if k not in ["sub", "exp", "iat"]}
    return jwt_create_access(int(user_id), **additional_claims)


def create_refresh_token(user_id: int) -> str:
    """
    Create JWT refresh token

    Args:
        user_id: User ID

    Returns:
        JWT refresh token string
    """
    return jwt_create_refresh(user_id)


def verify_token(token: str, expected_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Verify JWT token

    Args:
        token: JWT token string
        expected_type: Expected token type ("access" or "refresh")

    Returns:
        Decoded token payload or None if invalid
    """
    try:
        jwt_manager = get_jwt_manager()
        payload = jwt_manager.verify_token(token, expected_type=expected_type)
        return payload
    except JWTError as e:
        logger.warning("token_verification_failed", error=str(e))
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current authenticated user
    
    Args:
        credentials: HTTP Bearer credentials
        db: Database session
    
    Returns:
        User object
    
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials

    # Verify token (expect access token)
    payload = verify_token(token, expected_type="access")
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token is blacklisted (JTI check)
    jti = payload.get("jti")
    if jti:
        blacklist_result = await db.execute(
            select(TokenBlacklist).where(TokenBlacklist.jti == jti)
        )
        if blacklist_result.scalar_one_or_none() is not None:
            logger.warning("revoked_token_used", jti=jti)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Get user_id from token (JWT Manager uses 'sub')
    user_id_str = payload.get("sub")
    if not user_id_str:
        # Fallback to old format
        user_id_str = payload.get("user_id")

    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning("token_user_not_found", user_id=user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user (convenience function)"""
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current admin user
    
    Raises:
        HTTPException: If user is not admin
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    Get current user if authenticated, return None otherwise.
    
    This is useful for endpoints that work differently for authenticated
    vs anonymous users.
    
    Args:
        credentials: Optional HTTP Bearer credentials
        db: Database session
    
    Returns:
        User object if authenticated, None otherwise
    """
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


# Alias for superuser (uses admin check)
# Use as: current_user: User = Depends(get_current_active_superuser)
get_current_active_superuser = get_current_admin_user

# Alias for require_admin (backwards compatibility)
# Use as: current_user: User = Depends(require_admin)
require_admin = get_current_admin_user
