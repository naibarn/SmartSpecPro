"""
Authentication API Endpoints
"""

from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import re

from app.core.database import get_db
from app.core.auth import (
    create_access_token,
    get_password_hash,
    verify_password,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["authentication"])


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


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register new user
    
    - Creates new user account with 0 credits
    - Returns JWT access token
    """
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user = User(
        email=request.email,
        password_hash=get_password_hash(request.password),
        full_name=request.full_name,
        credits_balance=0,  # Start with 0 credits
        is_active=True,
        is_admin=False,
        email_verified=False
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
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
    db: AsyncSession = Depends(get_db)
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
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
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
    current_user: User = Depends(get_current_user)
):
    """
    Get current user information
    
    - Requires authentication
    """
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        credits_balance=float(current_user.credits_balance),
        is_admin=current_user.is_admin,
        email_verified=current_user.email_verified,
        created_at=current_user.created_at.isoformat()
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
    db: AsyncSession = Depends(get_db)
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
    db: AsyncSession = Depends(get_db)
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
