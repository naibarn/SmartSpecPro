"""
Credits API Endpoints
"""

from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.credit_service import CreditService
from app.core.credits import (
    credits_to_usd,
    calculate_credits_from_payment,
    calculate_payment_from_credits
)

router = APIRouter(prefix="/api/credits", tags=["credits"])


# Request/Response Models
class TopUpRequest(BaseModel):
    """Top-up credits request with validation"""
    payment_usd: Decimal = Field(
        ...,
        gt=0,
        ge=5.0,
        le=10000.0,
        description="Payment amount in USD (min: $5, max: $10,000)"
    )
    payment_method: str = Field(
        default="stripe",
        description="Payment method (stripe, paypal, etc.)"
    )
    payment_id: Optional[str] = Field(
        default=None,
        description="Payment transaction ID from payment provider"
    )
    
    @property
    def payment_usd_float(self) -> float:
        """Get payment amount as float"""
        return float(self.payment_usd)
    
    class Config:
        json_schema_extra = {
            "example": {
                "payment_usd": 100.00,
                "payment_method": "stripe",
                "payment_id": "pi_1234567890"
            }
        }


class TopUpResponse(BaseModel):
    """Top-up response"""
    transaction_id: str
    payment_usd: float
    markup_percent: float
    markup_amount_usd: float
    credits_received: int
    balance_credits: int
    balance_usd: float
    message: str


class BalanceResponse(BaseModel):
    """Balance response"""
    balance_credits: int
    balance_usd: float
    stats: dict


class TransactionResponse(BaseModel):
    """Transaction response"""
    id: str
    type: str
    amount: int
    amount_usd: float
    description: str
    balance_before: int
    balance_after: int
    metadata: dict
    created_at: str


class TransactionListResponse(BaseModel):
    """Transaction list response"""
    transactions: List[TransactionResponse]
    total: int


class CreditCalculationRequest(BaseModel):
    """Credit calculation request"""
    payment_usd: Optional[Decimal] = Field(default=None, description="Payment amount to calculate credits")
    credits: Optional[int] = Field(default=None, description="Credits to calculate payment")


class CreditCalculationResponse(BaseModel):
    """Credit calculation response"""
    payment_usd: float
    credits: int
    markup_percent: float
    markup_amount_usd: float
    actual_value_usd: float


@router.post("/topup", response_model=TopUpResponse)
async def topup_credits(
    request: TopUpRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Top up credits with payment
    
    Business logic:
    - User pays $100 (including markup)
    - Markup is 15% → $15 goes to SmartSpec
    - User gets credits worth $85 → 85,000 credits
    
    Example:
        Payment: $100, Markup: 15%
        → Actual value: $85
        → Credits: 85,000
    """
    credit_service = CreditService(db)
    
    # Get markup percentage
    markup_percent = await credit_service.get_markup_percent()
    
    # Calculate credits
    credits_received = calculate_credits_from_payment(request.payment_usd, markup_percent)
    actual_value_usd = credits_to_usd(credits_received)
    markup_amount_usd = request.payment_usd - actual_value_usd
    
    # Create transaction
    transaction = await credit_service.topup_credits(
        user_id=current_user.id,
        payment_usd=request.payment_usd,
        description=f"Top-up via {request.payment_method}",
        metadata={
            "payment_method": request.payment_method,
            "payment_id": request.payment_id,
        }
    )
    
    # Get new balance
    balance_credits = await credit_service.get_balance(current_user.id)
    balance_usd = credits_to_usd(balance_credits)
    
    return TopUpResponse(
        transaction_id=transaction.id,
        payment_usd=float(request.payment_usd),
        markup_percent=float(markup_percent),
        markup_amount_usd=float(markup_amount_usd),
        credits_received=credits_received,
        balance_credits=balance_credits,
        balance_usd=float(balance_usd),
        message=f"Successfully topped up {credits_received:,} credits (${actual_value_usd:.2f} value). "
                f"Your new balance is {balance_credits:,} credits (${balance_usd:.2f})."
    )


@router.get("/balance", response_model=BalanceResponse)
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get current credit balance and statistics
    """
    credit_service = CreditService(db)
    
    balance_credits = await credit_service.get_balance(current_user.id)
    balance_usd = credits_to_usd(balance_credits)
    stats = await credit_service.get_transaction_stats(current_user.id)
    
    return BalanceResponse(
        balance_credits=balance_credits,
        balance_usd=float(balance_usd),
        stats=stats
    )


@router.get("/transactions", response_model=TransactionListResponse)
async def get_transactions(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get credit transaction history
    """
    credit_service = CreditService(db)
    
    transactions = await credit_service.get_transactions(
        user_id=current_user.id,
        limit=limit,
        offset=offset
    )
    
    transaction_responses = [
        TransactionResponse(
            id=t.id,
            type=t.type,
            amount=t.amount,
            amount_usd=float(credits_to_usd(t.amount)),
            description=t.description or "",
            balance_before=t.balance_before,
            balance_after=t.balance_after,
            metadata=t.meta_data or {},
            created_at=t.created_at.isoformat()
        )
        for t in transactions
    ]
    
    return TransactionListResponse(
        transactions=transaction_responses,
        total=len(transaction_responses)
    )


@router.post("/calculate", response_model=CreditCalculationResponse)
async def calculate_credits(
    request: CreditCalculationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Calculate credits from payment or payment from credits
    
    Use cases:
    - User wants to know how many credits they'll get for $X
    - User wants to know how much to pay to get X credits
    """
    credit_service = CreditService(db)
    markup_percent = await credit_service.get_markup_percent()
    
    if request.payment_usd is not None:
        # Calculate credits from payment
        credits = calculate_credits_from_payment(request.payment_usd, markup_percent)
        payment_usd = request.payment_usd
    elif request.credits is not None:
        # Calculate payment from credits
        payment_usd = calculate_payment_from_credits(request.credits, markup_percent)
        credits = request.credits
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either payment_usd or credits must be provided"
        )
    
    actual_value_usd = credits_to_usd(credits)
    markup_amount_usd = payment_usd - actual_value_usd
    
    return CreditCalculationResponse(
        payment_usd=float(payment_usd),
        credits=credits,
        markup_percent=float(markup_percent),
        markup_amount_usd=float(markup_amount_usd),
        actual_value_usd=float(actual_value_usd)
    )
