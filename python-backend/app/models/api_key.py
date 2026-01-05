
"""
API Key Model
For managing user API keys
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.core.database import Base


class APIKey(Base):
    """
    API Key Model
    
    Represents an API key for programmatic access
    """
    
    __tablename__ = "api_keys"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # Key details
    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), unique=True, nullable=False)
    key_prefix = Column(String(20), nullable=False)  # For display (e.g., "sk_...abc123")
    
    # Permissions and limits
    permissions = Column(JSON, default=dict)  # {"endpoints": ["*"], "methods": ["GET", "POST"]}
    rate_limit = Column(Integer, default=60)  # Requests per minute
    
    # Status
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    
    # Metadata
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="api_keys")
    usage_logs = relationship("APIKeyUsage", back_populates="api_key", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<APIKey {self.name} ({self.key_prefix})>"
    
    def is_expired(self) -> bool:
        """Check if API key is expired"""
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if API key is valid"""
        return self.is_active and not self.is_expired()
    
    def has_permission(self, endpoint: str, method: str) -> bool:
        """Check if API key has permission for endpoint and method"""
        if not self.permissions:
            return True  # No restrictions
        
        # Check endpoints
        allowed_endpoints = self.permissions.get("endpoints", ["*"])
        if "*" not in allowed_endpoints and endpoint not in allowed_endpoints:
            return False
        
        # Check methods
        allowed_methods = self.permissions.get("methods", ["*"])
        if "*" not in allowed_methods and method not in allowed_methods:
            return False
        
        return True


class APIKeyUsage(Base):
    """
    API Key Usage Log
    
    Tracks API key usage for analytics
    """
    
    __tablename__ = "api_key_usage"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    api_key_id = Column(String(36), ForeignKey("api_keys.id"), nullable=False)
    
    # Request details
    endpoint = Column(String(500), nullable=False)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=False)
    
    # Performance
    response_time = Column(Integer, nullable=False)  # Milliseconds
    
    # Credits
    credits_used = Column(Integer, default=0)
    
    # Metadata
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    api_key = relationship("APIKey", back_populates="usage_logs")
    
    def __repr__(self):
        return f"<APIKeyUsage {self.method} {self.endpoint} - {self.status_code}>"
