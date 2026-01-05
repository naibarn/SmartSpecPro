"""
Audit Logs API
Endpoints for viewing and searching audit logs
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from datetime import datetime, timedelta

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.audit_service import AuditService


router = APIRouter(prefix="/api/v1")


# ============================================================================
# Middleware for admin check
# ============================================================================

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ============================================================================
# Audit Log Endpoints
# ============================================================================

@router.get("/audit-logs")
async def get_audit_logs(
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    impersonator_id: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get audit logs with filters
    
    **Admin Only**
    
    Returns audit logs with optional filters.
    Useful for tracking user actions, debugging, and compliance.
    
    **Parameters:**
    - `user_id`: Filter by user ID
    - `action`: Filter by action type
    - `resource_type`: Filter by resource type
    - `resource_id`: Filter by resource ID
    - `impersonator_id`: Filter by impersonator ID
    - `days`: Number of days to look back (default: 30)
    - `limit`: Maximum number of results (default: 100)
    - `offset`: Offset for pagination (default: 0)
    """
    service = AuditService(db)
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    logs = await service.get_logs(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        impersonator_id=impersonator_id,
        start_date=start_date,
        limit=limit,
        offset=offset
    )
    
    return {
        "logs": [log.to_dict() for log in logs],
        "total": len(logs),
        "limit": limit,
        "offset": offset
    }


@router.get("/audit-logs/user/{user_id}/activity")
async def get_user_activity(
    user_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get user activity summary
    
    **Admin Only**
    
    Returns a summary of user's actions over a time period.
    Includes top actions, total actions, and activity timeline.
    """
    service = AuditService(db)
    
    activity = await service.get_user_activity(
        user_id=user_id,
        days=days
    )
    
    return activity


@router.get("/audit-logs/impersonations")
async def get_impersonation_logs(
    impersonator_id: Optional[str] = None,
    target_user_id: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get impersonation logs
    
    **Admin Only**
    
    Returns logs of all impersonation sessions.
    Useful for auditing admin actions.
    """
    service = AuditService(db)
    
    logs = await service.get_impersonation_logs(
        impersonator_id=impersonator_id,
        target_user_id=target_user_id,
        days=days
    )
    
    return {
        "logs": logs,
        "total": len(logs),
        "period_days": days
    }


@router.get("/audit-logs/statistics")
async def get_action_statistics(
    days: int = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get action statistics
    
    **Admin Only**
    
    Returns statistics about actions over a time period.
    Includes total actions, unique users, and action breakdown.
    """
    service = AuditService(db)
    
    stats = await service.get_action_statistics(days=days)
    
    return stats


@router.get("/audit-logs/search")
async def search_audit_logs(
    q: str = Query(..., min_length=2),
    limit: int = Query(default=100, ge=1, le=1000),
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Search audit logs
    
    **Admin Only**
    
    Search audit logs by user email, action, endpoint, or resource ID.
    """
    service = AuditService(db)
    
    logs = await service.search_logs(
        search_term=q,
        limit=limit
    )
    
    return {
        "logs": [log.to_dict() for log in logs],
        "total": len(logs),
        "search_term": q
    }


@router.get("/audit-logs/my-activity")
async def get_my_activity(
    days: int = Query(default=30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get my activity
    
    **User Endpoint**
    
    Returns the current user's activity summary.
    Users can view their own audit logs.
    """
    service = AuditService(db)
    
    activity = await service.get_user_activity(
        user_id=current_user["id"],
        days=days
    )
    
    return activity
