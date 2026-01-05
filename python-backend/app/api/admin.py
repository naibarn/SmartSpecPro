"""
Admin API Endpoints
"""

from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.credit import CreditTransaction
from app.models.payment import PaymentTransaction
from app.services.credit_service import CreditService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================
# Admin Authorization
# ============================================================

async def require_admin(current_user: User = Depends(get_current_user)):
    """Require admin role"""
    # R13.1: Stricter admin check
    if not current_user or not current_user.is_admin or not current_user.is_active:
        # R13.2: Log unauthorized access attempts
        # audit_service = AuditService(db) # db is not available here, need to handle in middleware
        # await audit_service.log_unauthorized_access(
        #     user_id=str(current_user.id) if current_user else None,
        #     ip_address=request.client.host,
        #     endpoint="/api/admin/*"
        # )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ============================================================
# Request/Response Models
# ============================================================

class UserListResponse(BaseModel):
    """User list response"""
    id: str
    email: str
    full_name: str
    credits_balance: int
    is_admin: bool
    email_verified: bool
    created_at: str
    last_login: Optional[str] = None


class UserDetailResponse(BaseModel):
    """User detail response"""
    id: str
    email: str
    full_name: str
    credits_balance: int
    is_admin: bool
    email_verified: bool
    created_at: str
    updated_at: Optional[str] = None
    last_login: Optional[str] = None
    total_spent: float
    total_credits_purchased: int
    total_credits_used: int


class AdjustCreditsRequest(BaseModel):
    """Adjust credits request"""
    user_id: str
    amount: int = Field(..., description="Amount to add (positive) or deduct (negative)")
    reason: str = Field(..., min_length=1, max_length=500)


class BanUserRequest(BaseModel):
    """Ban user request"""
    user_id: str
    reason: str = Field(..., min_length=1, max_length=500)
    duration_days: Optional[int] = Field(None, description="Ban duration in days (None = permanent)")


class SystemStatsResponse(BaseModel):
    """System statistics response"""
    total_users: int
    active_users_30d: int
    total_revenue: float
    total_credits_sold: int
    total_credits_used: int
    avg_credits_per_user: float


# ============================================================
# User Management
# ============================================================

@router.get("/users", response_model=List[UserListResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    List all users (admin only)
    
    - Requires admin role
    - Supports pagination
    - Supports search by email or name
    """
    query = select(User)
    
    # Search filter
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (User.email.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern))
        )
    
    # Order by created_at desc
    query = query.order_by(desc(User.created_at))
    
    # Pagination
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return [
        UserListResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            credits_balance=user.credits_balance,
            is_admin=user.is_admin,
            email_verified=user.email_verified,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None
        )
        for user in users
    ]


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user details (admin only)
    
    - Requires admin role
    - Returns detailed user information
    - Includes spending and usage statistics
    """
    # Get user
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Calculate statistics
    # Total spent (from payments)
    result = await db.execute(
        select(func.sum(PaymentTransaction.amount_usd)).where(
            (PaymentTransaction.user_id == user_id) &
            (PaymentTransaction.status == "completed")
        )
    )
    total_spent = result.scalar() or 0.0
    
    # Total credits purchased
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            (CreditTransaction.user_id == user_id) &
            (CreditTransaction.type.in_(["topup", "adjustment"]))
        )
    )
    total_credits_purchased = result.scalar() or 0
    
    # Total credits used
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            (CreditTransaction.user_id == user_id) &
            (CreditTransaction.type == "deduction")
        )
    )
    total_credits_used = result.scalar() or 0
    
    return UserDetailResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        credits_balance=user.credits_balance,
        is_admin=user.is_admin,
        email_verified=user.email_verified,
        created_at=user.created_at.isoformat(),
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
        total_spent=float(total_spent),
        total_credits_purchased=total_credits_purchased,
        total_credits_used=total_credits_used
    )


# ============================================================
# Credit Management
# ============================================================

@router.post("/credits/adjust")
async def adjust_user_credits(
    request: AdjustCreditsRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Adjust user credits (admin only)
    
    - Requires admin role
    - Can add or deduct credits
    - Records transaction with reason
    """
    credit_service = CreditService(db)
    
    try:
        transaction = await credit_service.add_credits(
            user_id=request.user_id,
            amount=request.amount,
            description=f"Admin adjustment: {request.reason}",
            transaction_type="adjustment",
            metadata={
                "admin_id": str(admin.id),
                "admin_email": admin.email,
                "reason": request.reason
            }
        )
        
        return {
            "message": "Credits adjusted successfully",
            "transaction_id": str(transaction.id),
            "amount": request.amount,
            "new_balance": transaction.balance_after
        }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


# ============================================================
# User Moderation
# ============================================================

@router.post("/users/ban")
async def ban_user(
    request: BanUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Ban user (admin only)
    
    - Requires admin role
    - Prevents user from logging in
    - Can be temporary or permanent
    
    Note: This is a placeholder - full implementation requires:
    - is_banned field in User model
    - banned_until field in User model
    - ban_reason field in User model
    - Check in login endpoint
    """
    # Get user
    result = await db.execute(
        select(User).where(User.id == request.user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # R13.3: Prevent admin from banning themselves
    if str(admin.id) == request.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin cannot ban themselves"
        )

    # TODO: Implement ban functionality
    # user.is_banned = True
    # user.ban_reason = request.reason
    # if request.duration_days:
    #     user.banned_until = datetime.utcnow() + timedelta(days=request.duration_days)
    # await db.commit()
    
    return {
        "message": "User ban feature not yet implemented",
        "note": "This requires database schema changes (is_banned, banned_until, ban_reason fields)"
    }


# ============================================================
# System Statistics
# ============================================================

@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get system statistics (admin only)
    
    - Requires admin role
    - Returns overall system metrics
    """
    # Total users
    result = await db.execute(select(func.count(User.id)))
    total_users = result.scalar() or 0
    
    # Active users (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    result = await db.execute(
        select(func.count(User.id)).where(User.last_login >= thirty_days_ago)
    )
    active_users_30d = result.scalar() or 0
    
    # Total revenue
    result = await db.execute(
        select(func.sum(PaymentTransaction.amount_usd)).where(
            PaymentTransaction.status == "completed"
        )
    )
    total_revenue = result.scalar() or 0.0
    
    # Total credits sold
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            CreditTransaction.type.in_(["topup", "adjustment"])
        )
    )
    total_credits_sold = result.scalar() or 0
    
    # Total credits used
    result = await db.execute(
        select(func.sum(CreditTransaction.amount)).where(
            CreditTransaction.type == "deduction"
        )
    )
    total_credits_used = result.scalar() or 0
    
    # Average credits per user
    avg_credits_per_user = total_credits_sold / total_users if total_users > 0 else 0.0
    
    return SystemStatsResponse(
        total_users=total_users,
        active_users_30d=active_users_30d,
        total_revenue=float(total_revenue),
        total_credits_sold=total_credits_sold,
        total_credits_used=total_credits_used,
        avg_credits_per_user=avg_credits_per_user
    )
