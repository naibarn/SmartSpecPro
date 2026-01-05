"""
SmartSpec Pro - LLM Gateway V2 (Legacy Compatibility)

This module is deprecated. Please use gateway_unified.py directly.
This file is kept for backward compatibility only.
"""

# Re-export from unified gateway for backward compatibility
from app.llm_proxy.gateway_unified import (
    LLMGateway,
    LLMGatewayV1,
    LLMGatewayV2,
    COST_PER_1K_TOKENS,
    MODEL_MATRIX,
)

__all__ = [
    "LLMGateway",
    "LLMGatewayV1",
    "LLMGatewayV2",
    "COST_PER_1K_TOKENS",
    "MODEL_MATRIX",
]

# Deprecation warning
import warnings
warnings.warn(
    "app.llm_proxy.gateway_v2 is deprecated. "
    "Please use app.llm_proxy.gateway_unified instead.",
    DeprecationWarning,
    stacklevel=2
)
