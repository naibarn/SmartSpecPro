"""
Audit Service
Log and track all user and admin actions
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func

from app.models.audit_log import AuditLog


class AuditService:
    """Service for audit logging"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def log_action(
        self,
        action: str,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        user_role: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        method: Optional[str] = None,
        endpoint: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        impersonator_id: Optional[str] = None,
        impersonator_email: Optional[str] = None
    ) -> AuditLog:
        """
        Log an action to the audit log
        
        Args:
            action: Action type (e.g., "user.login", "payment.create")
            user_id: User ID
            user_email: User email
            user_role: User role
            resource_type: Type of resource (e.g., "user", "payment")
            resource_id: ID of the resource
            method: HTTP method
            endpoint: API endpoint
            status_code: HTTP status code
            details: Additional details (JSON)
            ip_address: IP address
            user_agent: User agent
            impersonator_id: Admin ID if impersonating
            impersonator_email: Admin email if impersonating
        
        Returns:
            Created audit log entry
        """
        audit_log = AuditLog(
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            impersonator_id=impersonator_id,
            impersonator_email=impersonator_email,
            is_impersonated="true" if impersonator_id else "false",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            method=method,
            endpoint=endpoint,
            status_code=str(status_code) if status_code else None,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        self.db.add(audit_log)
        await self.db.commit()
        await self.db.refresh(audit_log)
        
        return audit_log
    
    async def get_logs(
        self,
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        impersonator_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[AuditLog]:
        """
        Get audit logs with filters
        
        Args:
            user_id: Filter by user ID
            action: Filter by action type
            resource_type: Filter by resource type
            resource_id: Filter by resource ID
            impersonator_id: Filter by impersonator ID
            start_date: Filter by start date
            end_date: Filter by end date
            limit: Maximum number of results
            offset: Offset for pagination
        
        Returns:
            List of audit logs
        """
        query = select(AuditLog)
        
        # Apply filters
        conditions = []
        
        if user_id:
            conditions.append(AuditLog.user_id == user_id)
        
        if action:
            conditions.append(AuditLog.action == action)
        
        if resource_type:
            conditions.append(AuditLog.resource_type == resource_type)
        
        if resource_id:
            conditions.append(AuditLog.resource_id == resource_id)
        
        if impersonator_id:
            conditions.append(AuditLog.impersonator_id == impersonator_id)
        
        if start_date:
            conditions.append(AuditLog.timestamp >= start_date)
        
        if end_date:
            conditions.append(AuditLog.timestamp <= end_date)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # Order by timestamp descending
        query = query.order_by(AuditLog.timestamp.desc())
        
        # Apply pagination
        query = query.limit(limit).offset(offset)
        
        result = await self.db.execute(query)
        logs = result.scalars().all()
        
        return logs
    
    async def get_user_activity(
        self,
        user_id: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get user activity summary
        
        Args:
            user_id: User ID
            days: Number of days to look back
        
        Returns:
            User activity summary
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get all logs for user
        logs = await self.get_logs(
            user_id=user_id,
            start_date=start_date,
            limit=10000
        )
        
        # Count by action
        action_counts = {}
        for log in logs:
            action = log.action
            action_counts[action] = action_counts.get(action, 0) + 1
        
        # Sort by count
        top_actions = sorted(
            action_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]
        
        return {
            "user_id": user_id,
            "period_days": days,
            "total_actions": len(logs),
            "unique_actions": len(action_counts),
            "top_actions": [
                {"action": action, "count": count}
                for action, count in top_actions
            ],
            "first_action": logs[-1].timestamp.isoformat() if logs else None,
            "last_action": logs[0].timestamp.isoformat() if logs else None
        }
    
    async def get_impersonation_logs(
        self,
        impersonator_id: Optional[str] = None,
        target_user_id: Optional[str] = None,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get impersonation logs
        
        Args:
            impersonator_id: Filter by admin ID
            target_user_id: Filter by target user ID
            days: Number of days to look back
        
        Returns:
            List of impersonation events
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        query = select(AuditLog).where(
            and_(
                AuditLog.is_impersonated == "true",
                AuditLog.timestamp >= start_date
            )
        )
        
        if impersonator_id:
            query = query.where(AuditLog.impersonator_id == impersonator_id)
        
        if target_user_id:
            query = query.where(AuditLog.user_id == target_user_id)
        
        query = query.order_by(AuditLog.timestamp.desc())
        
        result = await self.db.execute(query)
        logs = result.scalars().all()
        
        return [log.to_dict() for log in logs]
    
    async def get_action_statistics(
        self,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get action statistics
        
        Args:
            days: Number of days to look back
        
        Returns:
            Action statistics
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Count total actions
        total_result = await self.db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.timestamp >= start_date
            )
        )
        total_actions = total_result.scalar()
        
        # Count by action type
        action_result = await self.db.execute(
            select(
                AuditLog.action,
                func.count(AuditLog.id).label('count')
            ).where(
                AuditLog.timestamp >= start_date
            ).group_by(AuditLog.action).order_by(func.count(AuditLog.id).desc())
        )
        action_counts = action_result.all()
        
        # Count unique users
        user_result = await self.db.execute(
            select(func.count(func.distinct(AuditLog.user_id))).where(
                AuditLog.timestamp >= start_date
            )
        )
        unique_users = user_result.scalar()
        
        return {
            "period_days": days,
            "total_actions": total_actions,
            "unique_users": unique_users,
            "actions_by_type": [
                {"action": action, "count": count}
                for action, count in action_counts[:20]
            ]
        }
    
    async def search_logs(
        self,
        search_term: str,
        limit: int = 100
    ) -> List[AuditLog]:
        """
        Search audit logs
        
        Args:
            search_term: Search term
            limit: Maximum number of results
        
        Returns:
            List of matching audit logs
        """
        query = select(AuditLog).where(
            or_(
                AuditLog.user_email.ilike(f"%{search_term}%"),
                AuditLog.action.ilike(f"%{search_term}%"),
                AuditLog.endpoint.ilike(f"%{search_term}%"),
                AuditLog.resource_id.ilike(f"%{search_term}%")
            )
        ).order_by(AuditLog.timestamp.desc()).limit(limit)
        
        result = await self.db.execute(query)
        logs = result.scalars().all()
        
        return logs
