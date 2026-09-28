"""
Authentication API Endpoints
"""

from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import re
import time

from app.core.database import get_db
from app.core.auth import (
    create_access_token,
    get_password_hash,
    verify_password,
    verify_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.models.user import User
from app.services.email_analysis import analyze_email

router = APIRouter(prefix="/api/auth", tags=["authentication"])


# ---------- Per-endpoint rate limiter for auth ----------
_AUTH_RATE: dict[str, list[float]] = {}
_AUTH_RATE_LIMIT = 10   # max requests
_AUTH_RATE_WINDOW = 60  # per 60 seconds


def _check_auth_rate(request: Request):
    """Strict rate limit for authentication endpoints (10 req/min per IP)."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    key = f"auth:{ip}"
    hits = _AUTH_RATE.setdefault(key, [])
    hits[:] = [t for t in hits if now - t < _AUTH_RATE_WINDOW]
    if len(hits) >= _AUTH_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Try again later.",
            headers={"Retry-After": str(_AUTH_RATE_WINDOW)},
        )
    hits.append(now)


# Request/Response Models
class RegisterRequest(BaseModel):
    """User registration request with password strength validation"""
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)
    
    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """
        Validate password strength
        
        Requirements:
        - At least 8 characters
        - At least one uppercase letter
        - At least one lowercase letter
        - At least one digit
        - At least one special character
        """
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)')
        
        # Check for common passwords
        common_passwords = [
            'password', '12345678', 'qwerty', 'abc123', 'password123',
            'admin', 'letmein', 'welcome', 'monkey', '1234567890'
        ]
        if v.lower() in common_passwords:
            raise ValueError('Password is too common. Please choose a stronger password.')
        
        return v


class LoginRequest(BaseModel):
    """User login request"""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Token response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: dict


class UserResponse(BaseModel):
    """User response"""
    id: str
    email: str
    full_name: Optional[str]
    credits_balance: float
    is_admin: bool
    email_verified: bool
    created_at: str
    is_new_user: bool = False


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    _rate: None = Depends(_check_auth_rate),
):
    """
    Register new user

    - Creates new user account with 10,000 credits ($10 USD trial)
    - Returns JWT access token
    """
    # Email analysis and trust scoring
    email_info = analyze_email(request.email)
    ip_address = http_request.client.host if http_request.client else "unknown"
    fingerprint_hash = http_request.headers.get("x-device-fingerprint")

    # Check if user already exists (by email or normalized email)
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Calculate trust score
    trust_score = 100
    if email_info.is_disposable:
        trust_score -= 50
    if email_info.is_plus_alias:
        trust_score -= 10
    if email_info.is_dot_variant:
        trust_score -= 5

    # Check for accounts with same normalized email
    norm_result = await db.execute(
        select(User).where(User.normalizedEmail == email_info.normalized)
    )
    same_norm_count = len(norm_result.scalars().all())
    trust_score -= same_norm_count * 30
    trust_score = max(0, min(100, trust_score))

    trust_outcome = "allowed" if trust_score >= 70 else ("flagged" if trust_score >= 40 else "blocked")

    # Determine signup credits based on trust score
    signup_credits = 10000 if trust_score >= 70 else 0

    # Create new user
    user = User(
        email=request.email,
        password=get_password_hash(request.password),
        name=request.full_name,
        credits=signup_credits,
        isDisabled=False,
        normalizedEmail=email_info.normalized,
        trustScore=trust_score,
        registrationIp=ip_address,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    if trust_score < 70:
        import logging
        logging.getLogger(__name__).warning(
            f"Registration flagged: email={request.email} trust_score={trust_score} outcome={trust_outcome}"
        )

    # Send welcome email (async, don't wait)
    from app.services.email_service import get_email_service
    import asyncio

    email_service = get_email_service()
    asyncio.create_task(email_service.send_welcome_email(
        to_email=user.email,
        user_name=user.full_name
    ))

    # Create access token
    access_token = create_access_token(
        data={"user_id": str(user.id), "email": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user={
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "credits_balance": float(user.credits_balance),
            "is_admin": user.is_admin,
            "email_verified": user.email_verified
        }
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    _rate: None = Depends(_check_auth_rate),
):
    """
    User login
    
    - Validates credentials
    - Returns JWT access token
    """
    # Get user by email
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verify password (user.password is the hash stored in database)
    if not user.password or not verify_password(request.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Check if user is banned
    if getattr(user, 'is_banned', False):
        from datetime import datetime as _dt
        banned_until = getattr(user, 'banned_until', None)
        if banned_until and banned_until < _dt.utcnow():
            # Ban expired — unban
            user.is_banned = False
            user.ban_reason = None
            user.banned_until = None
            await db.commit()
        else:
            reason = getattr(user, 'ban_reason', '') or 'Policy violation'
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is banned: {reason}"
            )
    
    # Create access token
    access_token = create_access_token(
        data={"user_id": str(user.id), "email": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user={
            "id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "credits_balance": float(user.credits_balance),
            "is_admin": user.is_admin,
            "email_verified": user.email_verified
        }
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Get current user information
    
    - Requires authentication
    """
    # OAuth exchange needs to know whether this token came from the callback
    # that created the account. The claim is signed by the Python backend; it
    # is not accepted from the browser request body alone.
    authorization = http_request.headers.get("authorization", "")
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    token_payload = verify_token(token, expected_type="access") if token else None

    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        credits_balance=float(current_user.credits_balance),
        is_admin=current_user.is_admin,
        email_verified=current_user.email_verified,
        created_at=current_user.created_at.isoformat(),
        is_new_user=bool(token_payload and token_payload.get("oauth_new_user") is True),
    )


@router.post("/refresh")
async def refresh_token(
    refresh_token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh access token using refresh token
    
    - Requires valid refresh token
    - Returns new access and refresh tokens
    """
    from app.services.auth_service import AuthService
    
    auth_service = AuthService(db)
    tokens = await auth_service.refresh_access_token(refresh_token)
    
    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    return tokens


@router.post("/logout")
async def logout(
    access_token: str,
    refresh_token: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Logout user by blacklisting tokens
    
    - Requires access token
    - Optional: refresh token
    - Invalidates tokens
    """
    from app.services.auth_service import AuthService
    
    auth_service = AuthService(db)
    success = await auth_service.logout(access_token, refresh_token)
    
    return {"message": "Logged out successfully", "success": success}


class ForgotPasswordRequest(BaseModel):
    """Forgot password request"""
    email: EmailStr


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    _rate: None = Depends(_check_auth_rate),
):
    """
    Request password reset
    
    - Sends password reset email
    - Always returns success (don't reveal if email exists)
    """
    from app.services.auth_service import AuthService
    
    # Find user
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()
    
    if user:
        from app.services.email_service import get_email_service
        
        auth_service = AuthService(db)
        token = await auth_service.create_password_reset_token(user.id)
        
        # Send password reset email
        email_service = get_email_service()
        await email_service.send_password_reset_email(
            to_email=user.email,
            reset_token=token,
            user_name=user.full_name
        )
        
        return {
            "message": "Password reset email sent"
        }
    
    # Always return success to prevent email enumeration
    return {"message": "Password reset email sent"}


class ResetPasswordRequest(BaseModel):
    """Reset password request"""
    token: str
    new_password: str = Field(..., min_length=8, max_length=100)
    
    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    _rate: None = Depends(_check_auth_rate),
):
    """
    Reset password using reset token
    
    - Requires valid reset token
    - Updates password
    - Invalidates all sessions
    """
    from app.services.auth_service import AuthService
    
    auth_service = AuthService(db)
    success = await auth_service.reset_password(request.token, request.new_password)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    return {"message": "Password reset successfully"}


@router.post("/test-protected")
async def test_protected_endpoint(
    current_user: User = Depends(get_current_user)
):
    """
    Test protected endpoint
    
    - Requires authentication
    - Returns user info
    """
    return {
        "message": "Authentication successful",
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "credits_balance": float(current_user.credits_balance)
        }
    }
