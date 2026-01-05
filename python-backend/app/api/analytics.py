"""
Analytics and Notifications API
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, Field
from typing import Optional, List

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.analytics_service import AnalyticsService
from app.services.notification_service import NotificationService


router = APIRouter(prefix="/api/v1")


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateNotificationRequest(BaseModel):
    """Create notification request"""
    type: str = Field(..., pattern="^(info|warning|error|success)$")
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    send_email: bool = False
    send_webhook: bool = False


# ============================================================================
# Analytics Endpoints
# ============================================================================

@router.get("/analytics/summary")
async def get_usage_summary(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get usage summary for a time period
    
    Provides comprehensive analytics including:
    - Total requests, credits, and costs
    - Breakdown by provider and model
    - Daily usage trends
    - Payment summary
    """
    service = AnalyticsService(db)
    
    summary = await service.get_usage_summary(
        user_id=current_user["id"],
        days=days
    )
    
    return summary


@router.get("/analytics/time-series")
async def get_time_series(
    days: int = 30,
    granularity: str = "day",
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get time-series data for charts
    
    Granularity options:
    - day: Daily aggregation
    - hour: Hourly aggregation
    """
    if granularity not in ["day", "hour"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Granularity must be 'day' or 'hour'"
        )
    
    service = AnalyticsService(db)
    
    data = await service.get_time_series(
        user_id=current_user["id"],
        days=days,
        granularity=granularity
    )
    
    return {
        "granularity": granularity,
        "period_days": days,
        "data_points": len(data),
        "data": data
    }


@router.get("/analytics/providers")
async def get_provider_comparison(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Compare providers by cost and performance
    
    Returns side-by-side comparison of all providers used
    with cost breakdowns and usage statistics.
    """
    service = AnalyticsService(db)
    
    comparison = await service.get_provider_comparison(
        user_id=current_user["id"],
        days=days
    )
    
    return {
        "period_days": days,
        "providers": comparison,
        "total_providers": len(comparison)
    }


@router.get("/analytics/top-models")
async def get_top_models(
    days: int = 30,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get top models by usage
    
    Returns the most-used models ranked by total cost.
    """
    service = AnalyticsService(db)
    
    top_models = await service.get_top_models(
        user_id=current_user["id"],
        days=days,
        limit=limit
    )
    
    return {
        "period_days": days,
        "limit": limit,
        "models": top_models,
        "total": len(top_models)
    }


@router.get("/analytics/export/csv")
async def export_usage_csv(
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Export usage data to CSV
    
    Downloads a CSV file with detailed usage data.
    """
    service = AnalyticsService(db)
    
    csv_data = await service.export_usage_csv(
        user_id=current_user["id"],
        days=days
    )
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=usage_{days}days.csv"
        }
    )


# ============================================================================
# Notifications Endpoints
# ============================================================================

@router.post("/notifications", status_code=status.HTTP_201_CREATED)
async def create_notification(
    request: CreateNotificationRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Create a new notification (admin only)
    
    Sends notification to user via selected channels.
    """
    # TODO: Add admin check
    
    service = NotificationService(db)
    
    notification = await service.create_notification(
        user_id=current_user["id"],
        type=request.type,
        title=request.title,
        message=request.message,
        send_email=request.send_email,
        send_webhook=request.send_webhook
    )
    
    return notification


@router.get("/notifications")
async def get_notifications(
    is_read: Optional[bool] = None,
    type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get user's notifications
    
    Supports filtering by read status and type.
    """
    service = NotificationService(db)
    
    notifications = await service.get_notifications(
        user_id=current_user["id"],
        is_read=is_read,
        type=type,
        limit=limit,
        offset=offset
    )
    
    return {
        "notifications": notifications,
        "total": len(notifications),
        "limit": limit,
        "offset": offset
    }


@router.get("/notifications/unread-count")
async def get_unread_count(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get count of unread notifications"""
    service = NotificationService(db)
    
    count = await service.get_unread_count(current_user["id"])
    
    return {"unread_count": count}


@router.put("/notifications/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Mark notification as read"""
    service = NotificationService(db)
    
    marked = await service.mark_as_read(notification_id, current_user["id"])
    
    if not marked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return {"message": "Notification marked as read"}


@router.put("/notifications/read-all")
async def mark_all_as_read(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Mark all notifications as read"""
    service = NotificationService(db)
    
    count = await service.mark_all_as_read(current_user["id"])
    
    return {
        "message": f"Marked {count} notifications as read",
        "count": count
    }


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Delete a notification"""
    service = NotificationService(db)
    
    deleted = await service.delete_notification(notification_id, current_user["id"])
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return None
