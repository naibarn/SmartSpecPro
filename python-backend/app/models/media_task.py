"""
Media Generation Task Model
Tracks async media generation tasks with status and results
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base


class TaskStatus(str, enum.Enum):
    """Task status enum - used for validation in Python code"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MediaType(str, enum.Enum):
    """Media type enum - used for validation in Python code"""
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"


class MediaTask(Base):
    """Media generation task"""
    __tablename__ = "media_tasks"

    id = Column(String(36), primary_key=True)
    task_id = Column(String(64), nullable=True, index=True)  # External provider task ID (e.g., Kie.ai task ID)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Use String instead of Enum to match existing database schema (varchar columns)
    media_type = Column(String(20), nullable=False)
    status = Column(String(20), default=TaskStatus.PENDING.value, nullable=False)

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
    # NOTE: Removed user relationship to prevent MissingGreenlet error in async SQLAlchemy
    # Access user via user_id instead
    # user = relationship("User")

    def to_dict(self):
        """Convert to dictionary"""
        # Helper to get value from enum or string
        def get_value(val):
            if val is None:
                return None
            return val.value if hasattr(val, 'value') else val

        return {
            "id": self.id,
            "task_id": self.task_id,
            "user_id": self.user_id,
            "media_type": get_value(self.media_type),
            "status": get_value(self.status),
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
