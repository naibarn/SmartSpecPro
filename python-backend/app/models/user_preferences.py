"""
User Preferences Model
Stores user-specific preferences and settings
"""

from sqlalchemy import Column, String, Boolean, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.core.database import Base


class UserPreferences(Base):
    """User preferences model"""
    
    __tablename__ = "user_preferences"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign key
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Notification preferences
    email_notifications = Column(Boolean, default=True, nullable=False)
    low_credits_alert = Column(Boolean, default=True, nullable=False)
    payment_notifications = Column(Boolean, default=True, nullable=False)
    support_ticket_updates = Column(Boolean, default=True, nullable=False)
    marketing_emails = Column(Boolean, default=False, nullable=False)
    
    # Alert thresholds
    low_credits_threshold = Column(Integer, default=1000, nullable=False)  # Alert when credits < this
    
    # LLM preferences
    default_llm_model = Column(String(100), nullable=True)  # e.g., "gpt-4", "claude-3-opus"
    default_llm_provider = Column(String(50), nullable=True)  # e.g., "openai", "anthropic"
    default_budget_priority = Column(String(20), default="balanced", nullable=False)  # cost, balanced, performance
    
    # UI preferences
    theme = Column(String(20), default="light", nullable=False)  # light, dark, auto
    language = Column(String(10), default="en", nullable=False)  # en, th, etc.
    timezone = Column(String(50), default="UTC", nullable=False)  # e.g., "Asia/Bangkok"
    
    # Dashboard preferences
    dashboard_layout = Column(JSONB, nullable=True)  # Custom dashboard layout
    favorite_features = Column(JSONB, nullable=True)  # List of favorite features
    
    # API preferences
    default_api_key_rate_limit = Column(Integer, default=60, nullable=False)  # requests per minute
    
    # Advanced preferences
    custom_settings = Column(JSONB, nullable=True)  # Additional custom settings
    
    # Relationships
    user = relationship("User", back_populates="preferences")
    
    def __repr__(self):
        return f"<UserPreferences(user_id={self.user_id})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "email_notifications": self.email_notifications,
            "low_credits_alert": self.low_credits_alert,
            "payment_notifications": self.payment_notifications,
            "support_ticket_updates": self.support_ticket_updates,
            "marketing_emails": self.marketing_emails,
            "low_credits_threshold": self.low_credits_threshold,
            "default_llm_model": self.default_llm_model,
            "default_llm_provider": self.default_llm_provider,
            "default_budget_priority": self.default_budget_priority,
            "theme": self.theme,
            "language": self.language,
            "timezone": self.timezone,
            "dashboard_layout": self.dashboard_layout,
            "favorite_features": self.favorite_features,
            "default_api_key_rate_limit": self.default_api_key_rate_limit,
            "custom_settings": self.custom_settings
        }
