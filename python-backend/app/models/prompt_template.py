"""
Prompt Template Model
"""

from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, JSON
from datetime import datetime

from app.core.database import Base


class PromptTemplate(Base):
    """Prompt template for reusable prompts"""
    __tablename__ = "prompt_templates"
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    template = Column(Text, nullable=False)
    variables = Column(JSON, nullable=True)  # List of variable names
    category = Column(String(100), nullable=True, index=True)
    is_public = Column(Boolean, nullable=False, default=False)
    is_favorite = Column(Boolean, nullable=False, default=False)
    use_count = Column(Integer, nullable=False, default=0)
    version = Column(Integer, nullable=False, default=1)
    parent_id = Column(String(36), nullable=True)  # For versioning
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
