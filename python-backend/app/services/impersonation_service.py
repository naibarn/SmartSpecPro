"""
User Impersonation Service
Allow admins to login as other users for support purposes
"""

import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.user import User
from app.core.security import create_access_token
from app.services.audit_service import AuditService


class ImpersonationService:
    """Service for user impersonation"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def start_impersonation(
        self,
        admin_id: str,
        target_user_id: str,
        reason: str
    ) -> Dict[str, Any]:
        """
        Start impersonating a user
        
        Args:
            admin_id: Admin user ID
            target_user_id: Target user ID to impersonate
            reason: Reason for impersonation
        
        Returns:
            Impersonation session details with token
        """
        # Verify admin exists and is admin
        admin_result = await self.db.execute(
            select(User).where(User.id == admin_id)
        )
        admin = admin_result.scalar_one_or_none()
        
        if not admin:
            raise ValueError("Admin user not found")
        
        if admin.role != "admin":
            raise ValueError("User is not an admin")
        
        # Verify target user exists
        target_result = await self.db.execute(
            select(User).where(User.id == target_user_id)
        )
        target_user = target_result.scalar_one_or_none()
        
        if not target_user:
            raise ValueError("Target user not found")
        
        # Cannot impersonate another admin
        if target_user.role == "admin":
            raise ValueError("Cannot impersonate another admin")
        
        # Create impersonation session
        session_id = str(uuid.uuid4())
        
        # Create token for impersonated user
        token_data = {
            "sub": target_user_id,
            "email": target_user.email,
            "role": target_user.role,
            "impersonated": True,
            "impersonator_id": admin_id,
            "session_id": session_id
        }
        
        access_token = create_access_token(
            data=token_data,
            expires_delta=timedelta(hours=2)  # Shorter expiration for security
        )
        
        # Log impersonation start
        await self._log_impersonation(
            admin_id=admin_id,
            target_user_id=target_user_id,
            action="start",
            reason=reason,
            session_id=session_id
        )
        
        return {
            "session_id": session_id,
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": 7200,  # 2 hours
            "impersonated_user": {
                "id": target_user.id,
                "email": target_user.email,
                "name": target_user.name,
                "role": target_user.role
            },
            "admin": {
                "id": admin.id,
                "email": admin.email,
                "name": admin.name
            },
            "started_at": datetime.utcnow().isoformat(),
            "reason": reason
        }
    
    async def stop_impersonation(
        self,
        admin_id: str,
        session_id: str
    ) -> bool:
        """
        Stop an impersonation session
        
        Args:
            admin_id: Admin user ID
            session_id: Impersonation session ID
        
        Returns:
            True if stopped successfully
        """
        # Log impersonation stop
        await self._log_impersonation(
            admin_id=admin_id,
            target_user_id=None,  # Will be fetched from log
            action="stop",
            reason="Session ended",
            session_id=session_id
        )
        
        return True
    
    async def get_active_impersonations(
        self,
        admin_id: Optional[str] = None
    ) -> list[Dict[str, Any]]:
        """
        Get list of active impersonation sessions
        
        Args:
            admin_id: Optional filter by admin ID
        
        Returns:
            List of active impersonation sessions
        """
        # This would query from audit logs or a dedicated impersonation_sessions table
        # For now, return empty list (implement with audit logs)
        return []
    
    async def _log_impersonation(
        self,
        admin_id: str,
        target_user_id: Optional[str],
        action: str,
        reason: str,
        session_id: str
    ):
        """
        Log impersonation action to audit log
        
        Args:
            admin_id: Admin user ID
            target_user_id: Target user ID
            action: Action type (start, stop)
            reason: Reason for action
            session_id: Session ID
        """
        # Get admin and target user details
        admin_result = await self.db.execute(
            select(User).where(User.id == admin_id)
        )
        admin = admin_result.scalar_one_or_none()
        
        target_user = None
        if target_user_id:
            target_result = await self.db.execute(
                select(User).where(User.id == target_user_id)
            )
            target_user = target_result.scalar_one_or_none()
        
        # Log to audit service
        audit_service = AuditService(self.db)
        await audit_service.log_action(
            action=f"impersonation.{action}",
            user_id=target_user_id,
            user_email=target_user.email if target_user else None,
            user_role=target_user.role if target_user else None,
            impersonator_id=admin_id,
            impersonator_email=admin.email if admin else None,
            resource_type="impersonation_session",
            resource_id=session_id,
            details={
                "action": action,
                "reason": reason,
                "session_id": session_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
    
    async def verify_impersonation_token(
        self,
        token_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Verify if a token is for an impersonation session
        
        Args:
            token_data: Decoded token data
        
        Returns:
            Impersonation details if valid
        """
        if not token_data.get("impersonated"):
            return None
        
        return {
            "is_impersonated": True,
            "impersonator_id": token_data.get("impersonator_id"),
            "session_id": token_data.get("session_id"),
            "target_user_id": token_data.get("sub")
        }
    
    async def get_impersonation_history(
        self,
        user_id: Optional[str] = None,
        admin_id: Optional[str] = None,
        days: int = 30
    ) -> list[Dict[str, Any]]:
        """
        Get impersonation history
        
        Args:
            user_id: Optional filter by target user ID
            admin_id: Optional filter by admin ID
            days: Number of days to look back
        
        Returns:
            List of impersonation events
        """
        # This would query from audit logs
        # For now, return empty list (implement with audit logs)
        return []
