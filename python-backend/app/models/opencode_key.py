"""
OpenCode API Key Model
Phase 2: API Key Storage for OpenCode Gateway

Separate from regular API keys to provide:
- OpenCode-specific permissions
- Token budget tracking
- Model access control
"""

from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, 
    ForeignKey, Text, JSON, Float, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
import uuid
import secrets
import hashlib

from app.core.database import Base


class OpenCodeKeyStatus(str, Enum):
    """Status of an OpenCode API key."""
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"
    SUSPENDED = "suspended"


class OpenCodeAPIKey(Base):
    """
    OpenCode API Key Model
    
    Represents an API key for OpenCode CLI and other external tools.
    Provides OpenAI-compatible authentication for the OpenCode Gateway.
    """
    
    __tablename__ = "opencode_api_keys"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    
    # Key identification
    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), unique=True, nullable=False, index=True)
    key_prefix = Column(String(20), nullable=False)  # For display: "ssp_...abc123"
    
    # Status
    status = Column(SQLEnum(OpenCodeKeyStatus), default=OpenCodeKeyStatus.ACTIVE, nullable=False)
    
    # Permissions
    allowed_models = Column(JSON, default=list)  # ["claude-3.5-sonnet", "gpt-4o"]
    allowed_endpoints = Column(JSON, default=list)  # ["chat/completions", "models"]
    
    # Budget limits
    max_tokens_per_request = Column(Integer, default=100000)
    max_tokens_per_day = Column(Integer, default=1000000)
    max_cost_per_day = Column(Float, default=50.0)  # USD
    
    # Usage tracking
    tokens_used_today = Column(Integer, default=0)
    cost_used_today = Column(Float, default=0.0)
    total_tokens_used = Column(Integer, default=0)
    total_cost = Column(Float, default=0.0)
    total_requests = Column(Integer, default=0)
    last_used_at = Column(DateTime, nullable=True)
    last_reset_at = Column(DateTime, default=datetime.utcnow)
    
    # Rate limiting
    rate_limit_rpm = Column(Integer, default=60)  # Requests per minute
    rate_limit_tpm = Column(Integer, default=100000)  # Tokens per minute
    
    # Metadata
    description = Column(Text, nullable=True)
    extra_metadata = Column(JSON, default=dict)  # Custom metadata
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="opencode_api_keys")
    usage_logs = relationship(
        "OpenCodeAPIKeyUsage", 
        back_populates="api_key", 
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<OpenCodeAPIKey {self.name} ({self.key_prefix})>"
    
    @classmethod
    def generate_key(cls) -> tuple[str, str, str]:
        """
        Generate a new API key.
        
        Returns:
            Tuple of (full_key, key_hash, key_prefix)
        """
        # Generate a secure random key
        random_bytes = secrets.token_bytes(32)
        key_id = secrets.token_hex(8)
        
        # Format: ssp_{key_id}_{random_hex}
        full_key = f"ssp_{key_id}_{random_bytes.hex()}"
        
        # Hash for storage
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        # Prefix for display
        key_prefix = f"ssp_{key_id}...{random_bytes.hex()[-6:]}"
        
        return full_key, key_hash, key_prefix
    
    @classmethod
    def hash_key(cls, key: str) -> str:
        """Hash an API key for comparison."""
        return hashlib.sha256(key.encode()).hexdigest()
    
    def is_expired(self) -> bool:
        """Check if API key is expired."""
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if API key is valid for use."""
        if self.status != OpenCodeKeyStatus.ACTIVE:
            return False
        if self.is_expired():
            return False
        return True
    
    def can_use_model(self, model: str) -> bool:
        """Check if API key can use a specific model."""
        if not self.allowed_models:
            return True  # No restrictions
        return model in self.allowed_models or "*" in self.allowed_models
    
    def can_use_endpoint(self, endpoint: str) -> bool:
        """Check if API key can use a specific endpoint."""
        if not self.allowed_endpoints:
            return True  # No restrictions
        return endpoint in self.allowed_endpoints or "*" in self.allowed_endpoints
    
    def check_budget(self, estimated_tokens: int = 0, estimated_cost: float = 0.0) -> tuple[bool, str]:
        """
        Check if request is within budget limits.
        
        Returns:
            Tuple of (allowed, reason)
        """
        # Check per-request limit
        if estimated_tokens > self.max_tokens_per_request:
            return False, f"Request exceeds max tokens per request ({self.max_tokens_per_request})"
        
        # Check daily token limit
        if self.tokens_used_today + estimated_tokens > self.max_tokens_per_day:
            return False, f"Daily token limit exceeded ({self.max_tokens_per_day})"
        
        # Check daily cost limit
        if self.cost_used_today + estimated_cost > self.max_cost_per_day:
            return False, f"Daily cost limit exceeded (${self.max_cost_per_day})"
        
        return True, "OK"
    
    def record_usage(self, tokens: int, cost: float):
        """Record usage for this API key."""
        self.tokens_used_today += tokens
        self.cost_used_today += cost
        self.total_tokens_used += tokens
        self.total_cost += cost
        self.total_requests += 1
        self.last_used_at = datetime.utcnow()
    
    def reset_daily_usage(self):
        """Reset daily usage counters."""
        self.tokens_used_today = 0
        self.cost_used_today = 0.0
        self.last_reset_at = datetime.utcnow()
    
    def revoke(self):
        """Revoke this API key."""
        self.status = OpenCodeKeyStatus.REVOKED
        self.revoked_at = datetime.utcnow()
    
    def to_dict(self, include_usage: bool = True) -> dict:
        """Convert to dictionary for API response."""
        result = {
            "id": self.id,
            "name": self.name,
            "key_prefix": self.key_prefix,
            "status": self.status.value,
            "allowed_models": self.allowed_models,
            "allowed_endpoints": self.allowed_endpoints,
            "max_tokens_per_request": self.max_tokens_per_request,
            "max_tokens_per_day": self.max_tokens_per_day,
            "max_cost_per_day": self.max_cost_per_day,
            "rate_limit_rpm": self.rate_limit_rpm,
            "rate_limit_tpm": self.rate_limit_tpm,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }
        
        if include_usage:
            result.update({
                "tokens_used_today": self.tokens_used_today,
                "cost_used_today": self.cost_used_today,
                "total_tokens_used": self.total_tokens_used,
                "total_cost": self.total_cost,
                "total_requests": self.total_requests,
                "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            })
        
        return result


class OpenCodeAPIKeyUsage(Base):
    """
    OpenCode API Key Usage Log
    
    Tracks individual API calls for auditing and analytics.
    """
    
    __tablename__ = "opencode_api_key_usage"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    api_key_id = Column(String(36), ForeignKey("opencode_api_keys.id"), nullable=False, index=True)
    
    # Request details
    endpoint = Column(String(255), nullable=False)
    model = Column(String(100), nullable=True)
    
    # Usage
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    cost = Column(Float, default=0.0)
    
    # Response
    status_code = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    
    # Metadata
    request_id = Column(String(36), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    
    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    api_key = relationship("OpenCodeAPIKey", back_populates="usage_logs")
    
    def __repr__(self):
        return f"<OpenCodeAPIKeyUsage {self.endpoint} {self.total_tokens} tokens>"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "endpoint": self.endpoint,
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "cost": self.cost,
            "status_code": self.status_code,
            "latency_ms": self.latency_ms,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
