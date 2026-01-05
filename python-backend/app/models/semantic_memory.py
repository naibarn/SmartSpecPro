"""
SmartSpec Pro - Semantic Memory Model

This module defines the SemanticMemory model for storing long-term facts,
preferences, and learned information about users and projects.

Semantic memory stores:
- User preferences (coding style, frameworks, etc.)
- Project facts (tech stack, conventions, etc.)
- Learned patterns from past interactions
- Custom instructions and rules
"""

from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, JSON, 
    ForeignKey, Index, Enum as SQLEnum, Float
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class MemoryType(str, Enum):
    """Types of semantic memory."""
    
    # User-related memories
    USER_PREFERENCE = "user_preference"      # User coding preferences
    USER_INSTRUCTION = "user_instruction"    # Custom instructions from user
    
    # Project-related memories
    PROJECT_FACT = "project_fact"            # Facts about a project
    PROJECT_CONVENTION = "project_convention" # Project coding conventions
    PROJECT_TECH_STACK = "project_tech_stack" # Technology stack info
    
    # Interaction-related memories
    LEARNED_PATTERN = "learned_pattern"      # Patterns learned from interactions
    FEEDBACK = "feedback"                    # User feedback on outputs
    
    # System memories
    SKILL = "skill"                          # Learned skills (for Kilo integration)
    RULE = "rule"                            # Business rules


class MemoryScope(str, Enum):
    """Scope of the memory - who/what it applies to."""
    
    GLOBAL = "global"           # Applies to all users/projects
    USER = "user"               # Applies to a specific user
    PROJECT = "project"         # Applies to a specific project
    SESSION = "session"         # Applies to a specific session
    WORKFLOW = "workflow"       # Applies to a specific workflow


class SemanticMemory(Base):
    """
    Model for storing semantic (long-term) memories.
    
    Semantic memories are facts, preferences, and learned information
    that persist across sessions and can be retrieved based on relevance.
    """
    
    __tablename__ = "semantic_memories"
    
    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Memory identification
    memory_key = Column(String(255), nullable=False, index=True)
    memory_type = Column(SQLEnum(MemoryType), nullable=False, index=True)
    scope = Column(SQLEnum(MemoryScope), nullable=False, default=MemoryScope.USER)
    
    # Ownership
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(String(255), nullable=True, index=True)
    session_id = Column(String(255), nullable=True, index=True)
    workflow_id = Column(String(255), nullable=True, index=True)
    
    # Content
    content = Column(Text, nullable=False)
    extra_data = Column(JSON, nullable=True, default=dict)  # Renamed from 'metadata' (reserved)
    
    # Relevance and retrieval
    importance = Column(Float, nullable=False, default=1.0)  # 0.0 to 1.0
    access_count = Column(Integer, nullable=False, default=0)
    last_accessed_at = Column(DateTime, nullable=True)
    
    # Source tracking
    source = Column(String(255), nullable=True)  # Where this memory came from
    source_execution_id = Column(String(255), nullable=True)  # Execution that created it
    
    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # Optional expiration
    
    # Soft delete
    is_active = Column(Integer, nullable=False, default=1)
    
    # Relationships
    user = relationship("User", back_populates="semantic_memories", lazy="selectin")
    
    # Indexes for efficient querying
    __table_args__ = (
        Index('idx_semantic_memory_user_type', 'user_id', 'memory_type'),
        Index('idx_semantic_memory_project', 'project_id', 'memory_type'),
        Index('idx_semantic_memory_scope', 'scope', 'memory_type'),
        Index('idx_semantic_memory_key_user', 'memory_key', 'user_id'),
        Index('idx_semantic_memory_importance', 'importance', 'is_active'),
    )
    
    def __repr__(self) -> str:
        return f"<SemanticMemory(id={self.id}, key='{self.memory_key}', type={self.memory_type})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert memory to dictionary representation."""
        return {
            "id": self.id,
            "memory_key": self.memory_key,
            "memory_type": self.memory_type.value if self.memory_type else None,
            "scope": self.scope.value if self.scope else None,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "content": self.content,
            "extra_data": self.extra_data,
            "importance": self.importance,
            "access_count": self.access_count,
            "source": self.source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def increment_access(self):
        """Increment access count and update last accessed timestamp."""
        self.access_count += 1
        self.last_accessed_at = datetime.utcnow()
    
    @property
    def is_expired(self) -> bool:
        """Check if this memory has expired."""
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at
