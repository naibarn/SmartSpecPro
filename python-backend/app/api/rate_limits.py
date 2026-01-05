"""
Rate Limit Dashboard API
Endpoints for visualizing rate limits and usage
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.rate_limit_service import RateLimitService


router = APIRouter(prefix="/api/v1")


# ============================================================================
# Rate Limit Endpoints
# ============================================================================

@router.get("/rate-limits/status")
async def get_rate_limit_status(
    endpoint: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get current rate limit status
    
    Shows current usage, limits, and time until reset for all endpoints
    or a specific endpoint.
    
    **Example Response:**
    ```json
    {
        "user_id": "user123",
        "timestamp": "2024-01-15T10:30:00",
        "rate_limits": {
            "llm": {
                "current": 45,
                "limit": 60,
                "window_seconds": 60,
                "reset_in_seconds": 32,
                "percentage": 75.0
            },
            "credits": {
                "current": 12,
                "limit": 30,
                "window_seconds": 60,
                "reset_in_seconds": 45,
                "percentage": 40.0
            }
        },
        "total_endpoints": 2
    }
    ```
    """
    service = RateLimitService(db)
    
    status_data = await service.get_rate_limit_status(
        user_id=current_user["id"],
        endpoint=endpoint
    )
    
    return status_data


@router.get("/rate-limits/history")
async def get_rate_limit_history(
    hours: int = 24,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get rate limit history
    
    Returns historical rate limit data for visualization.
    Useful for creating time-series charts.
    
    **Parameters:**
    - `hours`: Number of hours to look back (default: 24)
    """
    service = RateLimitService(db)
    
    history = await service.get_rate_limit_history(
        user_id=current_user["id"],
        hours=hours
    )
    
    return {
        "period_hours": hours,
        "data_points": len(history),
        "history": history
    }


@router.get("/rate-limits/global-stats")
async def get_global_stats(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get global rate limit statistics
    
    Shows overall usage across all endpoints, including:
    - Total requests in current window
    - Active endpoints
    - Top endpoints by usage
    
    **Example Response:**
    ```json
    {
        "user_id": "user123",
        "total_requests_current_window": 157,
        "active_endpoints": 5,
        "top_endpoints": [
            {
                "endpoint": "llm",
                "requests": 89
            },
            {
                "endpoint": "credits",
                "requests": 45
            }
        ],
        "timestamp": "2024-01-15T10:30:00"
    }
    ```
    """
    service = RateLimitService(db)
    
    stats = await service.get_global_rate_limit_stats(
        user_id=current_user["id"]
    )
    
    return stats


@router.get("/rate-limits/api-key/{api_key_id}")
async def get_api_key_rate_limits(
    api_key_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get rate limits for a specific API key
    
    Shows current usage and limits for an API key.
    Useful for monitoring programmatic access.
    """
    from sqlalchemy import select, and_
    from app.models.api_key import APIKey
    
    # Verify ownership
    result = await db.execute(
        select(APIKey).where(
            and_(
                APIKey.id == api_key_id,
                APIKey.user_id == current_user["id"]
            )
        )
    )
    api_key = result.scalar_one_or_none()
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    service = RateLimitService(db)
    
    limits = await service.get_api_key_rate_limits(api_key_id)
    
    return limits


@router.post("/rate-limits/check")
async def check_rate_limit(
    endpoint: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Check if a request would be allowed under current rate limits
    
    **Does not** consume a request - this is for testing only.
    
    **Parameters:**
    - `endpoint`: Endpoint to check (e.g., "llm", "credits")
    
    **Example Response:**
    ```json
    {
        "allowed": true,
        "current": 45,
        "limit": 60,
        "remaining": 15,
        "reset_in_seconds": 32,
        "percentage": 75.0
    }
    ```
    """
    service = RateLimitService(db)
    
    # Check without incrementing
    status_data = await service.get_rate_limit_status(
        user_id=current_user["id"],
        endpoint=endpoint
    )
    
    if endpoint not in status_data["rate_limits"]:
        return {
            "allowed": True,
            "current": 0,
            "limit": 100,
            "remaining": 100,
            "reset_in_seconds": 60,
            "percentage": 0
        }
    
    limit_data = status_data["rate_limits"][endpoint]
    
    return {
        "allowed": limit_data["current"] < limit_data["limit"],
        "current": limit_data["current"],
        "limit": limit_data["limit"],
        "remaining": limit_data["limit"] - limit_data["current"],
        "reset_in_seconds": limit_data["reset_in_seconds"],
        "percentage": limit_data["percentage"]
    }
