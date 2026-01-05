"""
Notification Model
"""

from sqlalchemy import Column, String, Text, DateTime, Boolean, JSON
from datetime import datetime

from app.core.database import Base


class Notification(Base):
    """User notification"""
    __tablename__ = "notifications"
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    type = Column(String(50), nullable=False, index=True)  # info, warning, error, success
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    data = Column(JSON, nullable=True)  # Additional data
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
