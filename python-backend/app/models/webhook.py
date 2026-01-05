"""
Webhook Model
Stores webhook configurations and delivery logs
"""

from sqlalchemy import Column, String, Boolean, Integer, Text, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
import enum

from app.core.database import Base


class WebhookEvent(str, enum.Enum):
    """Webhook event types"""
    PAYMENT_SUCCESS = "payment.success"
    PAYMENT_FAILED = "payment.failed"
    REFUND_CREATED = "refund.created"
    CREDITS_LOW = "credits.low"
    CREDITS_ADDED = "credits.added"
    CREDITS_DEDUCTED = "credits.deducted"
    TICKET_CREATED = "ticket.created"
    TICKET_UPDATED = "ticket.updated"
    TICKET_CLOSED = "ticket.closed"
    USER_REGISTERED = "user.registered"
    API_KEY_CREATED = "api_key.created"
    API_KEY_REVOKED = "api_key.revoked"


class WebhookStatus(str, enum.Enum):
    """Webhook status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    FAILED = "failed"


class Webhook(Base):
    """Webhook configuration model"""
    
    __tablename__ = "webhooks"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign key
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Webhook details
    url = Column(String(2048), nullable=False)
    description = Column(Text, nullable=True)
    secret = Column(String(64), nullable=False)  # For signature verification
    
    # Events to subscribe to
    events = Column(JSONB, nullable=False)  # List of WebhookEvent values
    
    # Status
    status = Column(SQLEnum(WebhookStatus), default=WebhookStatus.ACTIVE, nullable=False)
    
    # Retry configuration
    max_retries = Column(Integer, default=3, nullable=False)
    retry_delay = Column(Integer, default=60, nullable=False)  # seconds
    
    # Statistics
    total_deliveries = Column(Integer, default=0, nullable=False)
    successful_deliveries = Column(Integer, default=0, nullable=False)
    failed_deliveries = Column(Integer, default=0, nullable=False)
    last_delivery_at = Column(DateTime, nullable=True)
    last_success_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="webhooks")
    deliveries = relationship("WebhookDelivery", back_populates="webhook", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Webhook(id={self.id}, url={self.url}, status={self.status})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "url": self.url,
            "description": self.description,
            "events": self.events,
            "status": self.status.value,
            "max_retries": self.max_retries,
            "retry_delay": self.retry_delay,
            "total_deliveries": self.total_deliveries,
            "successful_deliveries": self.successful_deliveries,
            "failed_deliveries": self.failed_deliveries,
            "last_delivery_at": self.last_delivery_at.isoformat() if self.last_delivery_at else None,
            "last_success_at": self.last_success_at.isoformat() if self.last_success_at else None,
            "last_failure_at": self.last_failure_at.isoformat() if self.last_failure_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }


class WebhookDeliveryStatus(str, enum.Enum):
    """Webhook delivery status"""
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


class WebhookDelivery(Base):
    """Webhook delivery log model"""
    
    __tablename__ = "webhook_deliveries"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign key
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False)
    
    # Delivery details
    event = Column(String(50), nullable=False)
    payload = Column(JSONB, nullable=False)
    
    # Request/Response
    request_headers = Column(JSONB, nullable=True)
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    response_headers = Column(JSONB, nullable=True)
    
    # Status
    status = Column(SQLEnum(WebhookDeliveryStatus), default=WebhookDeliveryStatus.PENDING, nullable=False)
    error_message = Column(Text, nullable=True)
    
    # Retry tracking
    attempts = Column(Integer, default=0, nullable=False)
    next_retry_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    delivered_at = Column(DateTime, nullable=True)
    
    # Relationships
    webhook = relationship("Webhook", back_populates="deliveries")
    
    def __repr__(self):
        return f"<WebhookDelivery(id={self.id}, event={self.event}, status={self.status})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "webhook_id": str(self.webhook_id),
            "event": self.event,
            "payload": self.payload,
            "status": self.status.value,
            "error_message": self.error_message,
            "attempts": self.attempts,
            "response_status": self.response_status,
            "created_at": self.created_at.isoformat(),
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None
        }
