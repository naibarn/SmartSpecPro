"""
SmartSpec Pro - Execution Database Models
Phase 0 - Critical Gap Fix #2
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Text, Enum as SQLEnum
import uuid
import enum

from app.core.database import Base


class ExecutionStatus(str, enum.Enum):
    """Execution status enum"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExecutionModel(Base):
    """Database model for workflow executions"""
    
    __tablename__ = "executions"
    
    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Execution info
    workflow_id = Column(String, nullable=False, index=True)
    status = Column(SQLEnum(ExecutionStatus), default=ExecutionStatus.PENDING, nullable=False, index=True)
    
    # Steps
    steps = Column(JSON, default=list)
    current_step = Column(Integer, default=0)
    total_steps = Column(Integer, default=0)
    
    # Files
    files_created = Column(JSON, default=list)
    files_modified = Column(JSON, default=list)
    files_deleted = Column(JSON, default=list)
    
    # Outputs
    outputs = Column(JSON, default=dict)
    
    # Metrics
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    duration_seconds = Column(Float, default=0.0)
    
    # Error info
    error = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "status": self.status.value if isinstance(self.status, enum.Enum) else self.status,
            "steps": self.steps,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "files_created": self.files_created,
            "files_modified": self.files_modified,
            "files_deleted": self.files_deleted,
            "outputs": self.outputs,
            "tokens_used": self.tokens_used,
            "cost": self.cost,
            "duration_seconds": self.duration_seconds,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class CheckpointModel(Base):
    """Database model for execution checkpoints"""
    
    __tablename__ = "checkpoints"
    
    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign key
    execution_id = Column(String, nullable=False, index=True)
    
    # Checkpoint info
    step_number = Column(Integer, nullable=False)
    step_name = Column(String, nullable=False)
    
    # State snapshot
    state = Column(JSON, nullable=False)
    
    # Metrics at checkpoint
    tokens_used = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "execution_id": self.execution_id,
            "step_number": self.step_number,
            "step_name": self.step_name,
            "state": self.state,
            "tokens_used": self.tokens_used,
            "cost": self.cost,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
