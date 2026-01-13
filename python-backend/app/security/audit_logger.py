"""
Audit Logger for Security Events
Phase 3: SaaS Readiness
"""

import structlog
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
import uuid
import json

logger = structlog.get_logger(__name__)


class AuditAction(str, Enum):
    """Types of auditable actions."""
    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"
    MFA_ENABLED = "mfa_enabled"
    MFA_DISABLED = "mfa_disabled"
    
    # Authorization
    PERMISSION_GRANTED = "permission_granted"
    PERMISSION_REVOKED = "permission_revoked"
    ROLE_ASSIGNED = "role_assigned"
    ROLE_REMOVED = "role_removed"
    
    # Data Access
    DATA_READ = "data_read"
    DATA_CREATE = "data_create"
    DATA_UPDATE = "data_update"
    DATA_DELETE = "data_delete"
    DATA_EXPORT = "data_export"
    
    # Secrets
    SECRET_READ = "secret_read"
    SECRET_CREATE = "secret_create"
    SECRET_UPDATE = "secret_update"
    SECRET_DELETE = "secret_delete"
    SECRET_ROTATE = "secret_rotate"
    
    # API
    API_KEY_CREATED = "api_key_created"
    API_KEY_REVOKED = "api_key_revoked"
    API_CALL = "api_call"
    
    # Admin
    CONFIG_CHANGE = "config_change"
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    TENANT_CREATE = "tenant_create"
    TENANT_UPDATE = "tenant_update"
    
    # Workflow
    WORKFLOW_START = "workflow_start"
    WORKFLOW_COMPLETE = "workflow_complete"
    APPROVAL_REQUEST = "approval_request"
    APPROVAL_GRANTED = "approval_granted"
    APPROVAL_DENIED = "approval_denied"
    
    # Security
    SECURITY_ALERT = "security_alert"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"


class AuditSeverity(str, Enum):
    """Severity levels for audit events."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class AuditEvent:
    """
    An audit event record.
    """
    
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    # Action
    action: AuditAction = AuditAction.DATA_READ
    severity: AuditSeverity = AuditSeverity.INFO
    
    # Actor
    actor_id: Optional[str] = None
    actor_type: str = "user"  # user, service, system
    actor_email: Optional[str] = None
    actor_ip: Optional[str] = None
    actor_user_agent: Optional[str] = None
    
    # Target
    target_type: Optional[str] = None  # user, project, secret, etc.
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    
    # Context
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    
    # Details
    description: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    
    # Result
    success: bool = True
    error_message: Optional[str] = None
    
    # Timestamps
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "event_id": self.event_id,
            "action": self.action.value,
            "severity": self.severity.value,
            "actor_id": self.actor_id,
            "actor_type": self.actor_type,
            "actor_email": self.actor_email,
            "actor_ip": self.actor_ip,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "target_name": self.target_name,
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "session_id": self.session_id,
            "request_id": self.request_id,
            "description": self.description,
            "details": self.details,
            "success": self.success,
            "error_message": self.error_message,
            "timestamp": self.timestamp.isoformat(),
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class AuditLogger:
    """
    Logger for security audit events.
    
    Features:
    - Structured event logging
    - Multiple output targets
    - Query and search
    - Retention management
    """
    
    def __init__(
        self,
        retention_days: int = 90,
        max_events: int = 100000,
    ):
        """
        Initialize audit logger.
        
        Args:
            retention_days: Days to retain events
            max_events: Maximum events to store
        """
        self.retention_days = retention_days
        self.max_events = max_events
        
        # Storage (replace with database in production)
        self._events: List[AuditEvent] = []
        
        # Indexes
        self._by_actor: Dict[str, List[str]] = {}
        self._by_tenant: Dict[str, List[str]] = {}
        self._by_action: Dict[str, List[str]] = {}
        
        self._logger = logger.bind(component="audit_logger")
    
    async def log(
        self,
        action: AuditAction,
        actor_id: Optional[str] = None,
        actor_type: str = "user",
        actor_email: Optional[str] = None,
        actor_ip: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        target_name: Optional[str] = None,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        description: str = "",
        details: Optional[Dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None,
        severity: Optional[AuditSeverity] = None,
        **kwargs,
    ) -> AuditEvent:
        """
        Log an audit event.
        
        Args:
            action: Action type
            actor_id: Actor ID
            actor_type: Actor type
            actor_email: Actor email
            actor_ip: Actor IP address
            target_type: Target type
            target_id: Target ID
            target_name: Target name
            tenant_id: Tenant ID
            project_id: Project ID
            description: Event description
            details: Additional details
            success: Whether action succeeded
            error_message: Error message if failed
            severity: Event severity
            **kwargs: Additional event fields
        
        Returns:
            Created audit event
        """
        # Determine severity
        if severity is None:
            if not success:
                severity = AuditSeverity.ERROR
            elif action in [
                AuditAction.LOGIN_FAILED,
                AuditAction.SECURITY_ALERT,
                AuditAction.SUSPICIOUS_ACTIVITY,
            ]:
                severity = AuditSeverity.WARNING
            else:
                severity = AuditSeverity.INFO
        
        # Create event
        event = AuditEvent(
            action=action,
            severity=severity,
            actor_id=actor_id,
            actor_type=actor_type,
            actor_email=actor_email,
            actor_ip=actor_ip,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            tenant_id=tenant_id,
            project_id=project_id,
            description=description,
            details=details or {},
            success=success,
            error_message=error_message,
            **kwargs,
        )
        
        # Store event
        self._events.append(event)
        
        # Update indexes
        if actor_id:
            if actor_id not in self._by_actor:
                self._by_actor[actor_id] = []
            self._by_actor[actor_id].append(event.event_id)
        
        if tenant_id:
            if tenant_id not in self._by_tenant:
                self._by_tenant[tenant_id] = []
            self._by_tenant[tenant_id].append(event.event_id)
        
        action_key = action.value
        if action_key not in self._by_action:
            self._by_action[action_key] = []
        self._by_action[action_key].append(event.event_id)
        
        # Log to structured logger
        log_method = self._logger.info
        if severity == AuditSeverity.WARNING:
            log_method = self._logger.warning
        elif severity in [AuditSeverity.ERROR, AuditSeverity.CRITICAL]:
            log_method = self._logger.error
        
        log_method(
            "audit_event",
            event_id=event.event_id,
            action=action.value,
            actor_id=actor_id,
            target_type=target_type,
            target_id=target_id,
            success=success,
        )
        
        # Enforce max events
        if len(self._events) > self.max_events:
            self._events = self._events[-self.max_events:]
        
        return event
    
    async def query(
        self,
        action: Optional[AuditAction] = None,
        actor_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        success: Optional[bool] = None,
        severity: Optional[AuditSeverity] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AuditEvent]:
        """
        Query audit events.
        
        Args:
            action: Filter by action
            actor_id: Filter by actor
            tenant_id: Filter by tenant
            target_type: Filter by target type
            target_id: Filter by target ID
            success: Filter by success
            severity: Filter by severity
            start_time: Start of time range
            end_time: End of time range
            limit: Maximum results
            offset: Result offset
        
        Returns:
            List of matching events
        """
        events = self._events.copy()
        
        # Apply filters
        if action:
            events = [e for e in events if e.action == action]
        
        if actor_id:
            events = [e for e in events if e.actor_id == actor_id]
        
        if tenant_id:
            events = [e for e in events if e.tenant_id == tenant_id]
        
        if target_type:
            events = [e for e in events if e.target_type == target_type]
        
        if target_id:
            events = [e for e in events if e.target_id == target_id]
        
        if success is not None:
            events = [e for e in events if e.success == success]
        
        if severity:
            events = [e for e in events if e.severity == severity]
        
        if start_time:
            events = [e for e in events if e.timestamp >= start_time]
        
        if end_time:
            events = [e for e in events if e.timestamp <= end_time]
        
        # Sort by timestamp descending
        events.sort(key=lambda e: e.timestamp, reverse=True)
        
        # Apply pagination
        return events[offset:offset + limit]
    
    async def get_event(self, event_id: str) -> Optional[AuditEvent]:
        """Get an event by ID."""
        for event in self._events:
            if event.event_id == event_id:
                return event
        return None
    
    async def get_actor_activity(
        self,
        actor_id: str,
        limit: int = 50,
    ) -> List[AuditEvent]:
        """Get recent activity for an actor."""
        return await self.query(actor_id=actor_id, limit=limit)
    
    async def get_security_alerts(
        self,
        tenant_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[AuditEvent]:
        """Get security alerts."""
        events = await self.query(
            tenant_id=tenant_id,
            severity=AuditSeverity.WARNING,
            limit=limit * 2,  # Get more to filter
        )
        
        # Also include errors and critical
        errors = await self.query(
            tenant_id=tenant_id,
            severity=AuditSeverity.ERROR,
            limit=limit,
        )
        
        critical = await self.query(
            tenant_id=tenant_id,
            severity=AuditSeverity.CRITICAL,
            limit=limit,
        )
        
        all_events = events + errors + critical
        all_events.sort(key=lambda e: e.timestamp, reverse=True)
        
        return all_events[:limit]
    
    async def get_failed_logins(
        self,
        actor_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        hours: int = 24,
    ) -> List[AuditEvent]:
        """Get failed login attempts."""
        from datetime import timedelta
        
        start_time = datetime.utcnow() - timedelta(hours=hours)
        
        return await self.query(
            action=AuditAction.LOGIN_FAILED,
            actor_id=actor_id,
            tenant_id=tenant_id,
            start_time=start_time,
            limit=1000,
        )
    
    async def cleanup_old_events(self) -> int:
        """Remove events older than retention period."""
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(days=self.retention_days)
        
        original_count = len(self._events)
        self._events = [e for e in self._events if e.timestamp >= cutoff]
        
        removed = original_count - len(self._events)
        
        if removed > 0:
            self._logger.info("audit_cleanup", removed=removed)
        
        return removed
    
    def get_stats(
        self,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get audit statistics."""
        events = self._events
        if tenant_id:
            events = [e for e in events if e.tenant_id == tenant_id]
        
        return {
            "total_events": len(events),
            "by_action": {
                action.value: sum(1 for e in events if e.action == action)
                for action in AuditAction
                if any(e.action == action for e in events)
            },
            "by_severity": {
                sev.value: sum(1 for e in events if e.severity == sev)
                for sev in AuditSeverity
            },
            "success_rate": (
                sum(1 for e in events if e.success) / len(events)
                if events else 0
            ),
            "retention_days": self.retention_days,
        }


# Global instance
_audit_logger: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    """Get global audit logger instance."""
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = AuditLogger()
    return _audit_logger
