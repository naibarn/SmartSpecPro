"""
Admin Impersonation API
Endpoints for admin user impersonation
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.impersonation_service import ImpersonationService


router = APIRouter(prefix="/api/v1/admin")


# ============================================================================
# Request/Response Models
# ============================================================================

class StartImpersonationRequest(BaseModel):
    """Start impersonation request"""
    target_user_id: str = Field(..., description="User ID to impersonate")
    reason: str = Field(..., min_length=10, max_length=500, description="Reason for impersonation")


class StopImpersonationRequest(BaseModel):
    """Stop impersonation request"""
    session_id: str = Field(..., description="Impersonation session ID")


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
# Impersonation Endpoints
# ============================================================================

@router.post("/impersonate/start")
async def start_impersonation(
    request: StartImpersonationRequest,
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Start impersonating a user
    
    **Admin Only**
    
    Allows an admin to login as another user for support purposes.
    All actions during impersonation are logged in the audit trail.
    
    **Security:**
    - Cannot impersonate other admins
    - Session expires after 2 hours
    - All actions are logged
    - Reason is required and recorded
    
    **Response includes:**
    - Access token for impersonated user
    - Session ID for tracking
    - Impersonated user details
    - Admin details
    
    **⚠️ Important:** Use this feature responsibly and only for legitimate support purposes.
    """
    service = ImpersonationService(db)
    
    try:
        session = await service.start_impersonation(
            admin_id=current_user["id"],
            target_user_id=request.target_user_id,
            reason=request.reason
        )
        
        return session
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start impersonation: {str(e)}"
        )


@router.post("/impersonate/stop")
async def stop_impersonation(
    request: StopImpersonationRequest,
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Stop an impersonation session
    
    **Admin Only**
    
    Ends an active impersonation session.
    The impersonation token will no longer be valid.
    """
    service = ImpersonationService(db)
    
    try:
        success = await service.stop_impersonation(
            admin_id=current_user["id"],
            session_id=request.session_id
        )
        
        if success:
            return {
                "message": "Impersonation session stopped",
                "session_id": request.session_id
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop impersonation: {str(e)}"
        )


@router.get("/impersonate/active")
async def get_active_impersonations(
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get list of active impersonation sessions
    
    **Admin Only**
    
    Returns all currently active impersonation sessions.
    Useful for monitoring and auditing.
    """
    service = ImpersonationService(db)
    
    sessions = await service.get_active_impersonations(
        admin_id=current_user["id"]
    )
    
    return {
        "active_sessions": sessions,
        "total": len(sessions)
    }


@router.get("/impersonate/history")
async def get_impersonation_history(
    user_id: Optional[str] = None,
    admin_id: Optional[str] = None,
    days: int = 30,
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get impersonation history
    
    **Admin Only**
    
    Returns historical impersonation events.
    Can be filtered by user ID, admin ID, or time period.
    
    **Parameters:**
    - `user_id`: Filter by target user ID
    - `admin_id`: Filter by admin ID
    - `days`: Number of days to look back (default: 30)
    """
    service = ImpersonationService(db)
    
    history = await service.get_impersonation_history(
        user_id=user_id,
        admin_id=admin_id,
        days=days
    )
    
    return {
        "history": history,
        "total": len(history),
        "period_days": days
    }


@router.get("/impersonate/verify")
async def verify_impersonation(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Verify if current session is an impersonation
    
    Returns impersonation details if the current session
    is an impersonation session, otherwise returns null.
    
    **Useful for:**
    - Displaying impersonation banner in UI
    - Logging impersonated actions
    - Security auditing
    """
    service = ImpersonationService(db)
    
    impersonation_info = await service.verify_impersonation_token(current_user)
    
    if impersonation_info:
        return {
            "is_impersonated": True,
            **impersonation_info
        }
    else:
        return {
            "is_impersonated": False
        }
