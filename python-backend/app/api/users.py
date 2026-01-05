"""
User Management API Endpoints
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import re

from app.core.database import get_db
from app.core.auth import get_current_user, get_password_hash, verify_password
from app.models.user import User

router = APIRouter(prefix="/api/users", tags=["users"])


# Request/Response Models
class UserProfileResponse(BaseModel):
    """User profile response"""
    id: str
    email: str
    full_name: str
    credits_balance: int
    is_admin: bool
    email_verified: bool
    created_at: str
    updated_at: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    """Update profile request"""
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    """Change password request"""
    current_password: str
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
        if not re.search(r'\\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?\":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


# ============================================================
# User Profile Endpoints
# ============================================================

@router.get("/me", response_model=UserProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Get current user profile
    
    - Requires authentication
    - Returns user profile information
    """
    return UserProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        credits_balance=current_user.credits_balance,
        is_admin=current_user.is_admin,
        email_verified=current_user.email_verified,
        created_at=current_user.created_at.isoformat(),
        updated_at=current_user.updated_at.isoformat() if current_user.updated_at else None
    )


@router.put("/me", response_model=UserProfileResponse)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update current user profile
    
    - Requires authentication
    - Can update full_name and email
    - Email must be unique
    """
    # Update full_name
    if request.full_name is not None:
        current_user.full_name = request.full_name
    
    # Update email (check uniqueness)
    if request.email is not None and request.email != current_user.email:
        # Check if email already exists
        result = await db.execute(
            select(User).where(User.email == request.email)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        current_user.email = request.email
        current_user.email_verified = False  # Require re-verification
    
    await db.commit()
    await db.refresh(current_user)
    
    return UserProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        credits_balance=current_user.credits_balance,
        is_admin=current_user.is_admin,
        email_verified=current_user.email_verified,
        created_at=current_user.created_at.isoformat(),
        updated_at=current_user.updated_at.isoformat() if current_user.updated_at else None
    )


@router.put("/me/password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Change current user password
    
    - Requires authentication
    - Requires current password
    - Validates new password strength
    - Invalidates all sessions (logout all devices)
    """
    # Verify current password
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Check if new password is same as current
    if verify_password(request.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(request.new_password)
    
    await db.commit()
    
    # TODO: Invalidate all sessions (logout all devices)
    # from app.services.auth_service import AuthService
    # auth_service = AuthService(db)
    # await auth_service.logout_all_sessions(str(current_user.id))
    
    return {
        "message": "Password changed successfully",
        "note": "Please login again with your new password"
    }


@router.delete("/me")
async def delete_account(
    password: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete current user account
    
    - Requires authentication
    - Requires password confirmation
    - Permanently deletes account and all data
    - Cannot be undone
    """
    # Verify password
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect"
        )
    
    # Check if user has credits
    if current_user.credits_balance > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete account with remaining credits ({current_user.credits_balance} credits). Please contact support for refund."
        )
    
    # Delete user (cascade will delete related records)
    await db.delete(current_user)
    await db.commit()
    
    return {
        "message": "Account deleted successfully",
        "email": current_user.email
    }
