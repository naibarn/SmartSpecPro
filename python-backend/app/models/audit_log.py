
"""
Audit Log Model
Track all user and admin actions
"""

from sqlalchemy import Column, String, Text, DateTime, JSON, Index
from datetime import datetime
import uuid

from app.core.database import Base


class AuditLog(Base):
    """Audit log for tracking all actions"""
    
    __tablename__ = "audit_logs"
    
    # Primary key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # User information
    user_id = Column(String(36), nullable=True, index=True)
    user_email = Column(String(255), nullable=True)
    user_role = Column(String(50), nullable=True)
    
    # Impersonation tracking
    impersonator_id = Column(String(36), nullable=True, index=True)
    impersonator_email = Column(String(255), nullable=True)
    is_impersonated = Column(String(10), default="false")  # "true" or "false"
    
    # Action details
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100), nullable=True, index=True)
    resource_id = Column(String(255), nullable=True, index=True)
    
    # Request details
    method = Column(String(10), nullable=True)
    endpoint = Column(String(500), nullable=True, index=True)
    status_code = Column(String(10), nullable=True)
    
    # Additional data
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    
    # Metadata
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_audit_user_timestamp', 'user_id', 'timestamp'),
        Index('idx_audit_action_timestamp', 'action', 'timestamp'),
        Index('idx_audit_resource', 'resource_type', 'resource_id'),
        Index('idx_audit_impersonator', 'impersonator_id', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action}, user={self.user_email})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "user_email": self.user_email,
            "user_role": self.user_role,
            "impersonator_id": str(self.impersonator_id) if self.impersonator_id else None,
            "impersonator_email": self.impersonator_email,
            "is_impersonated": self.is_impersonated == "true",
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "method": self.method,
            "endpoint": self.endpoint,
            "status_code": self.status_code,
            "details": self.details,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }
