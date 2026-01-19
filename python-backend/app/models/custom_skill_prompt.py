"""
Custom Skill Prompt Model
Allows users to customize system prompts for different skills
"""

from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


class CustomSkillPrompt(Base):
    """User-customized skill system prompts"""
    __tablename__ = "custom_skill_prompts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    skill_id = Column(String(100), nullable=False, index=True)
    custom_system_prompt = Column(Text, nullable=False)
    template_variables = Column(JSON, nullable=True)  # Dynamic variables like {style, model}
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Ensure one custom prompt per user per skill
    __table_args__ = (
        UniqueConstraint('user_id', 'skill_id', name='unique_user_skill'),
    )

    # Relationships
    user = relationship("User", back_populates="custom_skill_prompts")

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "skill_id": self.skill_id,
            "custom_system_prompt": self.custom_system_prompt,
            "template_variables": self.template_variables,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class SkillPromptTemplate(Base):
    """Pre-made prompt templates that users can apply"""
    __tablename__ = "skill_prompt_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    skill_id = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=False)
    template_variables = Column(JSON, nullable=True)
    category = Column(String(100), nullable=True)  # e.g., "art", "documentary", "technical"
    is_public = Column(Boolean, default=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    usage_count = Column(Integer, default=0, nullable=False)  # Track popularity
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "skill_id": self.skill_id,
            "name": self.name,
            "description": self.description,
            "system_prompt": self.system_prompt,
            "template_variables": self.template_variables,
            "category": self.category,
            "is_public": self.is_public,
            "created_by": self.created_by,
            "usage_count": self.usage_count,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
