"""
Provider Configuration Model

Stores encrypted API keys and configuration for LLM providers.
Only accessible by admin users.
"""

from sqlalchemy import Column, String, Text, Boolean, DateTime, JSON
from sqlalchemy.sql import func
import uuid

from app.core.database import Base


class ProviderConfig(Base):
    """
    Provider configuration for LLM APIs.

    Stores encrypted API keys and settings for various LLM providers
    (OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter, Z.AI, etc.)
    """

    __tablename__ = "provider_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)

    # Provider identification
    provider_name = Column(String(50), unique=True, nullable=False, index=True)
    # e.g., "openai", "anthropic", "google", "groq", "ollama", "openrouter", "zai"

    display_name = Column(String(100), nullable=False)
    # e.g., "OpenAI", "Anthropic Claude", "Google AI", etc.

    # Encrypted API credentials
    api_key_encrypted = Column(Text, nullable=True)
    # Encrypted API key (null if not set)

    # Base URL configuration
    base_url = Column(String(255), nullable=True)
    # e.g., "https://api.openai.com/v1"

    # Additional configuration (JSON)
    config_json = Column(JSON, nullable=True)
    # Provider-specific settings:
    # - site_url, site_name (for OpenRouter)
    # - use_coding_endpoint (for Z.AI)
    # - default_model, timeout, etc.

    # Status
    is_enabled = Column(Boolean, default=True, nullable=False)
    # Whether this provider is enabled for use

    # Metadata
    description = Column(Text, nullable=True)
    # Optional description or notes

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<ProviderConfig {self.provider_name} ({self.display_name})>"
