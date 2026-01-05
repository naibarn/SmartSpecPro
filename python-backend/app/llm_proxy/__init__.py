"""
SmartSpec Pro - LLM Proxy Module

This module provides:
- LLMProxy: Direct provider access
- LLMGateway: Unified gateway with credit checking
- Models: Request/Response schemas
"""

from app.llm_proxy.proxy import LLMProxy, llm_proxy, LLMProviderError
from app.llm_proxy.models import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMUsageStats,
    ProviderHealth,
)
from app.llm_proxy.gateway_unified import (
    LLMGateway,
    LLMGatewayV1,
    LLMGatewayV2,
)

__all__ = [
    # Proxy
    "LLMProxy",
    "llm_proxy",
    "LLMProviderError",
    # Models
    "LLMProvider",
    "LLMRequest",
    "LLMResponse",
    "LLMUsageStats",
    "ProviderHealth",
    # Gateway (unified)
    "LLMGateway",
    "LLMGatewayV1",
    "LLMGatewayV2",
]
