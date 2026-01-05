"""
Dashboard API Endpoints
Provides aggregated data for user dashboard
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.dashboard_service import DashboardService
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# Response Models

class BalanceInfo(BaseModel):
    """Balance information"""
    credits: int
    usd: float
    last_updated: Optional[str]


class Statistics(BaseModel):
    """User statistics"""
    total_spent_usd: float
    total_credits_purchased: int
    total_credits_used: int
    total_requests: int
    avg_cost_per_request: float
    current_month_spending: float
    last_30_days_usage: int


class DashboardSummaryResponse(BaseModel):
    """Dashboard summary response"""
    balance: BalanceInfo
    stats: Statistics


class DailyUsage(BaseModel):
    """Daily usage data"""
    date: str
    credits_used: int
    requests: int
    cost_usd: float


class UsageOverTimeResponse(BaseModel):
    """Usage over time response"""
    daily_usage: list[DailyUsage]
    days: int
    start_date: str
    end_date: str


class LLMUsageBreakdownResponse(BaseModel):
    """LLM usage breakdown response"""
    by_model: list
    by_provider: list
    by_task_type: list
    total_credits: int
    note: Optional[str] = None


class Transaction(BaseModel):
    """Transaction data"""
    id: str
    type: str
    date: Optional[str]
    amount_usd: float
    credits: int
    status: str
    description: str


class RecentTransactionsResponse(BaseModel):
    """Recent transactions response"""
    transactions: list[Transaction]
    total: int
    limit: int
    type: Optional[str]


class ProviderStatisticsResponse(BaseModel):
    """Provider statistics response"""
    providers: list
    note: Optional[str] = None


# API Endpoints

@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Dashboard Summary
    
    Returns user's credit balance and overall statistics
    
    Args:
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Dashboard summary with balance and stats
    
    Example:
        ```
        GET /api/dashboard/summary
        ```
        
        Response:
        ```json
        {
          "balance": {
            "credits": 86956,
            "usd": 86.956,
            "last_updated": "2025-12-30T12:00:00Z"
          },
          "stats": {
            "total_spent_usd": 1234.56,
            "total_credits_purchased": 1234567,
            "total_credits_used": 987654,
            "total_requests": 12345,
            "avg_cost_per_request": 0.15,
            "current_month_spending": 234.56,
            "last_30_days_usage": 123456
          }
        }
        ```
    """
    dashboard_service = DashboardService(db)
    summary = await dashboard_service.get_summary(current_user)
    return DashboardSummaryResponse(**summary)


@router.get("/usage", response_model=UsageOverTimeResponse)
async def get_usage_over_time(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Usage Over Time
    
    Returns daily usage statistics for the specified time period
    
    Args:
        days: Number of days to look back (1-365)
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Daily usage data
    
    Example:
        ```
        GET /api/dashboard/usage?days=30
        ```
        
        Response:
        ```json
        {
          "daily_usage": [
            {
              "date": "2025-12-01",
              "credits_used": 5000,
              "requests": 50,
              "cost_usd": 5.00
            },
            ...
          ],
          "days": 30,
          "start_date": "2025-11-30T12:00:00Z",
          "end_date": "2025-12-30T12:00:00Z"
        }
        ```
    """
    dashboard_service = DashboardService(db)
    usage = await dashboard_service.get_usage_over_time(current_user, days)
    return UsageOverTimeResponse(**usage)


@router.get("/llm-usage", response_model=LLMUsageBreakdownResponse)
async def get_llm_usage_breakdown(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get LLM Usage Breakdown
    
    Returns usage breakdown by model, provider, and task type
    
    Args:
        days: Number of days to look back (1-365)
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        LLM usage breakdown
    
    Example:
        ```
        GET /api/dashboard/llm-usage?days=30
        ```
        
        Response:
        ```json
        {
          "by_model": [
            {
              "model": "gpt-4o",
              "requests": 100,
              "credits_used": 10000,
              "cost_usd": 10.00,
              "percentage": 25.5
            },
            ...
          ],
          "by_provider": [...],
          "by_task_type": [...],
          "total_credits": 39200
        }
        ```
    
    Note:
        This endpoint will be fully implemented when LLM usage tracking is added.
        Currently returns empty arrays.
    """
    dashboard_service = DashboardService(db)
    breakdown = await dashboard_service.get_llm_usage_breakdown(current_user, days)
    return LLMUsageBreakdownResponse(**breakdown)


@router.get("/transactions", response_model=RecentTransactionsResponse)
async def get_recent_transactions(
    limit: int = Query(20, ge=1, le=100, description="Number of transactions to return"),
    type: Optional[str] = Query(None, regex="^(payment|usage)$", description="Filter by type"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Recent Transactions
    
    Returns recent payment and usage transactions
    
    Args:
        limit: Number of transactions to return (1-100)
        type: Filter by type ('payment' or 'usage', optional)
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Recent transactions
    
    Example:
        ```
        GET /api/dashboard/transactions?limit=20&type=payment
        ```
        
        Response:
        ```json
        {
          "transactions": [
            {
              "id": "payment_123",
              "type": "payment",
              "date": "2025-12-30T12:00:00Z",
              "amount_usd": 100.00,
              "credits": 86956,
              "status": "completed",
              "description": "Credit top-up - $100.0"
            },
            {
              "id": "usage_124",
              "type": "usage",
              "date": "2025-12-30T11:00:00Z",
              "amount_usd": -0.15,
              "credits": -150,
              "status": "completed",
              "description": "LLM usage"
            },
            ...
          ],
          "total": 20,
          "limit": 20,
          "type": "payment"
        }
        ```
    """
    dashboard_service = DashboardService(db)
    transactions = await dashboard_service.get_recent_transactions(
        current_user,
        limit,
        type
    )
    return RecentTransactionsResponse(**transactions)


@router.get("/providers", response_model=ProviderStatisticsResponse)
async def get_provider_statistics(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Provider Statistics
    
    Returns statistics for each LLM provider
    
    Args:
        days: Number of days to look back (1-365)
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Provider statistics
    
    Example:
        ```
        GET /api/dashboard/providers?days=30
        ```
        
        Response:
        ```json
        {
          "providers": [
            {
              "provider": "openai",
              "requests": 200,
              "credits_used": 20000,
              "cost_usd": 20.00,
              "success_rate": 99.5,
              "avg_latency_ms": 1234,
              "percentage": 51.0
            },
            ...
          ]
        }
        ```
    
    Note:
        This endpoint will be fully implemented when LLM monitoring is integrated.
        Currently returns empty array.
    """
    dashboard_service = DashboardService(db)
    stats = await dashboard_service.get_provider_statistics(current_user, days)
    return ProviderStatisticsResponse(**stats)
