"""
Media Generation Task Model
Tracks async media generation tasks with status and results
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base


class TaskStatus(str, enum.Enum):
    """Task status enum"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MediaType(str, enum.Enum):
    """Media type enum"""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class MediaTask(Base):
    """Media generation task"""
    __tablename__ = "media_tasks"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    media_type = Column(Enum(MediaType), nullable=False)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING, nullable=False)

    # Request parameters
    model = Column(String(100), nullable=False)
    prompt = Column(Text, nullable=False)
    parameters = Column(JSON, nullable=True)  # Additional model-specific params

    # Result data
    result_url = Column(Text, nullable=True)
    result_data = Column(JSON, nullable=True)  # Complete response data
    error_message = Column(Text, nullable=True)

    # Credits tracking
    credits_used = Column(Integer, nullable=True)
    credits_balance = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="media_tasks")

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "media_type": self.media_type.value if self.media_type else None,
            "status": self.status.value if self.status else None,
            "model": self.model,
            "prompt": self.prompt,
            "parameters": self.parameters,
            "result_url": self.result_url,
            "result_data": self.result_data,
            "error_message": self.error_message,
            "credits_used": self.credits_used,
            "credits_balance": self.credits_balance,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
