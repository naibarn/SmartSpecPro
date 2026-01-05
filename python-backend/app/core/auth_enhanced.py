"""
Enhanced Authentication Module
JWT token generation, validation, and revocation
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.core.config import settings
from app.core.database import get_db
from app.core.cache import cache_manager
from app.core.security_enhanced import advanced_rate_limiter, audit_logger
from app.models.user import User

logger = structlog.get_logger()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token
security = HTTPBearer()

# JWT settings
SECRET_KEY = settings.SECRET_KEY
JWT_SECRET_KEY = getattr(settings, 'JWT_SECRET_KEY', settings.SECRET_KEY)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = getattr(settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 1440)
REFRESH_TOKEN_EXPIRE_DAYS = 30


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token
    
    Args:
        data: Data to encode in token (should include user_id, email)
        expires_delta: Token expiration time (default: from config)
    
    Returns:
        JWT token string
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any]) -> str:
    """
    Create JWT refresh token
    
    Args:
        data: Data to encode in token (should include user_id)
    
    Returns:
        JWT refresh token string
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh"
    })
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt


async def revoke_token(token: str):
    """
    Add token to blacklist
    
    Args:
        token: JWT token to revoke
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        exp = payload.get("exp")
        
        if exp:
            # Calculate TTL (time until expiration)
            ttl = exp - int(datetime.utcnow().timestamp())
            
            if ttl > 0:
                # Add to blacklist with TTL
                await cache_manager.set(f"revoked:{token}", True, ttl=ttl)
                
                logger.info(
                    "token_revoked",
                    user_id=payload.get("user_id"),
                    ttl=ttl
                )
    except JWTError:
        pass


async def is_token_revoked(token: str) -> bool:
    """
    Check if token is revoked
    
    Args:
        token: JWT token to check
    
    Returns:
        True if revoked, False otherwise
    """
    return await cache_manager.get(f"revoked:{token}") is not None


async def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verify JWT token
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token payload or None if invalid
    """
    try:
        # Decode token
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        # Check if revoked
        if await is_token_revoked(token):
            logger.warning("revoked_token_used", user_id=payload.get("user_id"))
            return None
        
        # Check token type
        token_type = payload.get("type", "access")
        if token_type != "access":
            logger.warning("invalid_token_type", type=token_type)
            return None
        
        return payload
        
    except JWTError as e:
        logger.warning("token_verification_failed", error=str(e))
        return None


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current authenticated user with rate limiting
    
    Args:
        request: HTTP request
        credentials: HTTP Bearer credentials
        db: Database session
    
    Returns:
        User object
    
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    
    # Rate limiting
    ip = request.client.host if request.client else "unknown"
    allowed, info = advanced_rate_limiter.check_rate_limit(ip, "/api/auth")
    
    if not allowed:
        logger.warning("rate_limit_exceeded", ip=ip, endpoint="/api/auth")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": "60"}
        )
    
    # Verify token
    payload = await verify_token(token)
    if payload is None:
        audit_logger.log_event(
            event_type="authentication_failed",
            user_id=None,
            ip_address=ip,
            details={"reason": "invalid_token"}
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user_id from token
    user_id: str = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        audit_logger.log_event(
            event_type="authentication_failed",
            user_id=user_id,
            ip_address=ip,
            details={"reason": "user_not_found"}
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        audit_logger.log_event(
            event_type="authentication_failed",
            user_id=user_id,
            ip_address=ip,
            details={"reason": "user_inactive"}
        )
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Log successful authentication
    audit_logger.log_event(
        event_type="authentication_success",
        user_id=user_id,
        ip_address=ip,
        details={"endpoint": str(request.url)}
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
        logger.warning("admin_access_denied", user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def refresh_access_token(refresh_token: str) -> Optional[str]:
    """
    Refresh access token using refresh token
    
    Args:
        refresh_token: Refresh token
    
    Returns:
        New access token or None if invalid
    """
    try:
        # Decode refresh token
        payload = jwt.decode(refresh_token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        
        # Check if revoked
        if await is_token_revoked(refresh_token):
            return None
        
        # Check token type
        if payload.get("type") != "refresh":
            return None
        
        # Create new access token
        user_id = payload.get("user_id")
        email = payload.get("email")
        
        if not user_id or not email:
            return None
        
        new_access_token = create_access_token(
            data={"user_id": user_id, "email": email}
        )
        
        logger.info("access_token_refreshed", user_id=user_id)
        
        return new_access_token
        
    except JWTError:
        return None
