'''
Support Ticket Model
User support ticket system
'''

from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.core.database import Base


class TicketStatus(str, enum.Enum):
    """Ticket status enum"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_USER = "waiting_user"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    """Ticket priority enum"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TicketCategory(str, enum.Enum):
    """Ticket category enum"""
    TECHNICAL = "technical"
    BILLING = "billing"
    FEATURE_REQUEST = "feature_request"
    BUG_REPORT = "bug_report"
    ACCOUNT = "account"
    OTHER = "other"


class SupportTicket(Base):
    """Support ticket model"""
    
    __tablename__ = "support_tickets"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_number = Column(String(20), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subject = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(Enum(TicketCategory), nullable=False, index=True)
    priority = Column(Enum(TicketPriority), default=TicketPriority.MEDIUM, nullable=False, index=True)
    status = Column(Enum(TicketStatus), default=TicketStatus.OPEN, nullable=False, index=True)
    assigned_to = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index('idx_ticket_user_status', 'user_id', 'status'),
        Index('idx_ticket_assigned_status', 'assigned_to', 'status'),
        Index('idx_ticket_status_priority', 'status', 'priority'),
    )
    
    def __repr__(self):
        return f"<SupportTicket(id={self.id}, number={self.ticket_number}, status={self.status})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "ticket_number": self.ticket_number,
            "user_id": str(self.user_id),
            "subject": self.subject,
            "description": self.description,
            "category": self.category.value,
            "priority": self.priority.value,
            "status": self.status.value,
            "assigned_to": str(self.assigned_to) if self.assigned_to else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "closed_at": self.closed_at.isoformat() if self.closed_at else None
        }


class TicketMessage(Base):
    """Ticket message/response model"""
    
    __tablename__ = "ticket_messages"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(String(36), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    is_staff_response = Column(String(10), default="false")
    attachments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    def __repr__(self):
        return f"<TicketMessage(id={self.id}, ticket={self.ticket_id})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        import json
        
        return {
            "id": str(self.id),
            "ticket_id": str(self.ticket_id),
            "user_id": str(self.user_id),
            "message": self.message,
            "is_staff_response": self.is_staff_response == "true",
            "attachments": json.loads(self.attachments) if self.attachments else [],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
