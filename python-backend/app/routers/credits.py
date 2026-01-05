"""
SmartSpec Pro - Credits Router
API endpoints for credits management and subscription plans.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.credits import TransactionType, UsageType
from app.services.generation.credits_repository import (
    CreditsRepository,
    get_credits_repository,
)

router = APIRouter(prefix="/credits", tags=["Credits"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class BalanceResponse(BaseModel):
    """Credits balance response."""
    total_credits: float
    used_credits: float
    reserved_credits: float
    available_credits: float
    subscription_tier: str
    monthly_allowance: float


class TransactionResponse(BaseModel):
    """Credit transaction response."""
    id: str
    transaction_type: str
    amount: float
    balance_before: float
    balance_after: float
    reference_type: Optional[str]
    reference_id: Optional[str]
    description: Optional[str]
    created_at: datetime


class TransactionListResponse(BaseModel):
    """List of transactions."""
    transactions: List[TransactionResponse]
    count: int


class UsageSummaryResponse(BaseModel):
    """Usage summary response."""
    summary: dict
    period_start: Optional[datetime]
    period_end: Optional[datetime]


class DailyUsageResponse(BaseModel):
    """Daily usage response."""
    data: List[dict]
    days: int


class ModelUsageResponse(BaseModel):
    """Model usage statistics response."""
    data: List[dict]
    days: int


class PlanResponse(BaseModel):
    """Subscription plan response."""
    id: str
    name: str
    display_name: str
    description: Optional[str]
    price_monthly: float
    price_yearly: float
    currency: str
    monthly_credits: float
    bonus_credits: float
    max_storage_mb: int
    features: List[str]


class PlansListResponse(BaseModel):
    """List of subscription plans."""
    plans: List[PlanResponse]


class AddCreditsRequest(BaseModel):
    """Request to add credits (admin only)."""
    amount: float = Field(..., gt=0, description="Amount of credits to add")
    reason: str = Field(..., min_length=1, description="Reason for adding credits")


# =============================================================================
# BALANCE ENDPOINTS
# =============================================================================

@router.get("/balance", response_model=BalanceResponse)
async def get_balance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's credits balance."""
    repo = get_credits_repository(db)
    balance = await repo.get_or_create_balance(current_user.id)
    
    return BalanceResponse(
        total_credits=balance.total_credits,
        used_credits=balance.used_credits,
        reserved_credits=balance.reserved_credits,
        available_credits=balance.available_credits,
        subscription_tier=balance.subscription_tier,
        monthly_allowance=balance.monthly_allowance,
    )


# =============================================================================
# TRANSACTION ENDPOINTS
# =============================================================================

@router.get("/transactions", response_model=TransactionListResponse)
async def get_transactions(
    transaction_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get credit transaction history."""
    repo = get_credits_repository(db)
    
    type_enum = TransactionType(transaction_type) if transaction_type else None
    
    transactions = await repo.get_transactions(
        user_id=current_user.id,
        transaction_type=type_enum,
        limit=min(limit, 100),
        offset=offset,
    )
    
    return TransactionListResponse(
        transactions=[
            TransactionResponse(
                id=str(t.id),
                transaction_type=t.transaction_type.value,
                amount=t.amount,
                balance_before=t.balance_before,
                balance_after=t.balance_after,
                reference_type=t.reference_type,
                reference_id=t.reference_id,
                description=t.description,
                created_at=t.created_at,
            )
            for t in transactions
        ],
        count=len(transactions),
    )


@router.get("/transactions/summary", response_model=UsageSummaryResponse)
async def get_transaction_summary(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get transaction summary by type."""
    repo = get_credits_repository(db)
    
    summary = await repo.get_transaction_summary(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    
    return UsageSummaryResponse(
        summary=summary,
        period_start=start_date,
        period_end=end_date,
    )


# =============================================================================
# USAGE ENDPOINTS
# =============================================================================

@router.get("/usage/summary", response_model=UsageSummaryResponse)
async def get_usage_summary(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get usage summary by type."""
    repo = get_credits_repository(db)
    
    summary = await repo.get_usage_summary(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    
    return UsageSummaryResponse(
        summary=summary,
        period_start=start_date,
        period_end=end_date,
    )


@router.get("/usage/daily", response_model=DailyUsageResponse)
async def get_daily_usage(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get daily usage for the past N days."""
    repo = get_credits_repository(db)
    
    data = await repo.get_daily_usage(
        user_id=current_user.id,
        days=min(days, 90),
    )
    
    return DailyUsageResponse(data=data, days=days)


@router.get("/usage/models", response_model=ModelUsageResponse)
async def get_model_usage(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get usage statistics by model."""
    repo = get_credits_repository(db)
    
    data = await repo.get_model_usage_stats(
        user_id=current_user.id,
        days=min(days, 90),
    )
    
    return ModelUsageResponse(data=data, days=days)


# =============================================================================
# SUBSCRIPTION PLANS ENDPOINTS
# =============================================================================

@router.get("/plans", response_model=PlansListResponse)
async def get_subscription_plans(
    db: AsyncSession = Depends(get_db),
):
    """Get available subscription plans."""
    repo = get_credits_repository(db)
    
    # Ensure default plans exist
    await repo.create_default_plans()
    await db.commit()
    
    plans = await repo.get_active_plans()
    
    return PlansListResponse(
        plans=[
            PlanResponse(
                id=str(p.id),
                name=p.name,
                display_name=p.display_name,
                description=p.description,
                price_monthly=p.price_monthly,
                price_yearly=p.price_yearly,
                currency=p.currency,
                monthly_credits=p.monthly_credits,
                bonus_credits=p.bonus_credits,
                max_storage_mb=p.max_storage_mb,
                features=p.features or [],
            )
            for p in plans
        ]
    )


# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================

@router.post("/admin/add-credits/{user_id}")
async def admin_add_credits(
    user_id: str,
    data: AddCreditsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add credits to a user's balance (admin only).
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    
    repo = get_credits_repository(db)
    
    transaction = await repo.add_credits(
        user_id=user_id,
        amount=data.amount,
        transaction_type=TransactionType.ADJUSTMENT,
        reference_type="admin_adjustment",
        reference_id=str(current_user.id),
        description=data.reason,
    )
    
    await db.commit()
    
    return {
        "success": True,
        "transaction_id": str(transaction.id),
        "amount": data.amount,
        "user_id": user_id,
    }
