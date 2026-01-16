"""
SmartSpec Pro - LLM Proxy Models
Phase 0.2
"""

from typing import List, Dict, Optional, Literal, Union, TYPE_CHECKING
from decimal import Decimal
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


# ==================== MEDIA GENERATION MODELS ====================
# These must be defined before LLMRequest which references them

class ImageGenerationRequest(BaseModel):
    model: str
    prompt: str
    size: Optional[str] = None  # e.g., "1024x1024"
    quality: Optional[Literal["standard", "hd"]] = None
    style: Optional[str] = None
    n: Optional[int] = 1  # Number of images to generate
    response_format: Optional[Literal["url", "b64_json"]] = "url"
    user: Optional[str] = None
    # Kie.ai specific parameters
    aspect_ratio: Optional[str] = None # e.g., "16:9", "1:1"
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    cfg_scale: Optional[float] = None
    steps: Optional[int] = None
    # Reference images/styles
    reference_image_urls: Optional[List[str]] = None
    reference_style_url: Optional[str] = None


class ImageGenerationResponse(BaseModel):
    id: str
    model: str
    provider: str
    created: int
    data: List[Dict[str, str]]  # List of {'url': '...', 'b64_json': '...'}
    credits_used: Optional[Decimal] = None
    credits_balance: Optional[Decimal] = None


class VideoGenerationRequest(BaseModel):
    model: str
    prompt: str
    duration: Optional[int] = None  # in seconds
    resolution: Optional[str] = None # e.g., "1080p", "720p"
    fps: Optional[int] = None
    user: Optional[str] = None
    # Kie.ai specific parameters
    aspect_ratio: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    reference_video_url: Optional[str] = None
    reference_image_urls: Optional[List[str]] = None


class VideoGenerationResponse(BaseModel):
    id: str
    model: str
    provider: str
    created: int
    data: List[Dict[str, str]]  # List of {'url': '...'}
    credits_used: Optional[Decimal] = None
    credits_balance: Optional[Decimal] = None


class AudioGenerationRequest(BaseModel):
    model: str
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = None
    user: Optional[str] = None
    # Kie.ai specific parameters
    voice_id: Optional[str] = None # Elevenlabs specific
    stability: Optional[float] = None
    similarity_boost: Optional[float] = None
    output_format: Optional[Literal["mp3", "wav"]] = "mp3"


class AudioGenerationResponse(BaseModel):
    id: str
    model: str
    provider: str
    created: int
    data: List[Dict[str, str]]  # List of {'url': '...'}
    credits_used: Optional[Decimal] = None
    credits_balance: Optional[Decimal] = None


# ==================== LLM REQUEST/RESPONSE MODELS ====================

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
    # For Image/Video/Audio generation
    image_request: Optional[ImageGenerationRequest] = None
    video_request: Optional[VideoGenerationRequest] = None
    audio_request: Optional[AudioGenerationRequest] = None


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
    credits_balance: Optional[Decimal] = None  # User's remaining credit balance
    # For Image/Video/Audio generation
    image_response: Optional[ImageGenerationResponse] = None
    video_response: Optional[VideoGenerationResponse] = None
    audio_response: Optional[AudioGenerationResponse] = None


# ==================== STATISTICS AND HEALTH MODELS ====================

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
