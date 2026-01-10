"""
SmartSpec Pro - LLM Proxy Models
Phase 0.2
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class LLMProvider(BaseModel):
    """LLM Provider configuration"""
    name: str
    type: Literal['openai', 'anthropic', 'google', 'ollama', 'groq', 'custom']
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    models: list[str]
    cost_per_1k_tokens: dict[str, float]  # {model: cost}
    max_tokens: dict[str, int]  # {model: max_tokens}
    capabilities: list[str]  # ['code', 'planning', 'analysis', etc.]
    enabled: bool = True


class LLMRequest(BaseModel):
    """Request to invoke LLM"""
    prompt: str
    task_type: Literal['planning', 'code_generation', 'analysis', 'decision', 'simple'] = 'simple'
    max_tokens: int = Field(default=4000, ge=1, le=128000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    preferred_provider: Optional[str] = None
    preferred_model: Optional[str] = None
    budget_priority: Literal['cost', 'quality', 'speed'] = 'quality'
    system_prompt: Optional[str] = None
    messages: Optional[list[dict]] = None  # For chat-style APIs


class LLMResponse(BaseModel):
    """Response from LLM invocation"""
    content: str
    provider: str
    model: str
    tokens_used: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: Optional[int] = None
    finish_reason: Optional[str] = None
    credits_used: Optional[int] = None  # Credits deducted for this request
    credits_balance: Optional[int] = None  # User's remaining credit balance


class LLMUsageStats(BaseModel):
    """Usage statistics for LLM Proxy"""
    total_requests: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0
    requests_by_provider: dict[str, int] = Field(default_factory=dict)
    tokens_by_provider: dict[str, int] = Field(default_factory=dict)
    cost_by_provider: dict[str, float] = Field(default_factory=dict)
    requests_by_task_type: dict[str, int] = Field(default_factory=dict)
    average_latency_ms: float = 0.0


class ProviderHealth(BaseModel):
    """Health status of an LLM provider"""
    provider: str
    status: Literal['healthy', 'degraded', 'down']
    last_check: str
    error_rate: float = 0.0
    average_latency_ms: float = 0.0
    last_error: Optional[str] = None
