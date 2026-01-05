"""
SmartSpec Pro - OpenRouter Provider (Refactored)
Uses Strategy Pattern and Dependency Injection
Unified API for 400+ AI models
"""

import structlog
from typing import Optional, Any

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class OpenRouterProvider(BaseLLMProvider):
    """
    OpenRouter LLM Provider with Dependency Injection support.
    
    Features:
    - Uses ProviderConfig for configuration
    - Supports client injection for testing
    - Access to 400+ AI models through unified API
    - Automatic fallbacks and load balancing
    
    API Docs: https://openrouter.ai/docs
    """
    
    # Default model configuration
    DEFAULT_MODELS = [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3-haiku",
        "google/gemini-flash-1.5",
        "meta-llama/llama-3.1-70b-instruct"
    ]
    
    # Cost per 1k tokens (converted from per 1M)
    DEFAULT_COST_PER_1K = {
        "openai/gpt-4o": 0.005,
        "openai/gpt-4o-mini": 0.00015,
        "anthropic/claude-3.5-sonnet": 0.003,
        "anthropic/claude-3-haiku": 0.00025,
        "google/gemini-flash-1.5": 0.000075,
        "meta-llama/llama-3.1-70b-instruct": 0.00052
    }
    
    # Max tokens per model
    DEFAULT_MAX_TOKENS = {
        "openai/gpt-4o": 4096,
        "openai/gpt-4o-mini": 4096,
        "anthropic/claude-3.5-sonnet": 4096,
        "anthropic/claude-3-haiku": 4096,
        "google/gemini-flash-1.5": 8192,
        "meta-llama/llama-3.1-70b-instruct": 8192
    }
    
    # Capabilities
    DEFAULT_CAPABILITIES = [
        "planning",
        "code_generation",
        "analysis",
        "decision",
        "simple"
    ]
    
    # Base URL
    BASE_URL = "https://openrouter.ai/api/v1"
    
    def __init__(
        self,
        config: ProviderConfig,
        client: Optional[Any] = None,
        site_url: str = None,
        site_name: str = None
    ):
        """
        Initialize OpenRouter provider.
        
        Args:
            config: Provider configuration
            client: Optional AsyncOpenAI client for testing
            site_url: Your site URL (for rankings on openrouter.ai)
            site_name: Your site name (for rankings on openrouter.ai)
        """
        super().__init__(config)
        self._client = client
        self.site_url = site_url
        self.site_name = site_name
        
        logger.info(
            "OpenRouter provider initialized",
            name=self.name,
            site_url=site_url,
            site_name=site_name,
            models=self.models
        )
    
    @property
    def client(self):
        """Lazy load OpenAI-compatible client."""
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.BASE_URL
            )
        return self._client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke OpenRouter API.
        
        Args:
            model: Model name to use (format: provider/model)
            request: LLM request
            
        Returns:
            LLMResponse with generated content
        """
        if not self.enabled:
            raise ProviderError(
                message="OpenRouter provider is disabled",
                provider=self.type,
                model=model
            )
        
        try:
            logger.info(
                "Invoking OpenRouter",
                model=model,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            
            # Build messages
            messages = self._build_messages(request)
            
            # Prepare extra headers for OpenRouter
            extra_headers = {}
            if self.site_url:
                extra_headers["HTTP-Referer"] = self.site_url
            if self.site_name:
                extra_headers["X-Title"] = self.site_name
            
            # Call OpenRouter API (OpenAI-compatible)
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=request.max_tokens or self.get_max_tokens(model),
                temperature=request.temperature,
                extra_headers=extra_headers if extra_headers else None
            )
            
            content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            finish_reason = response.choices[0].finish_reason
            
            # Calculate estimated cost
            cost = self.calculate_cost(model, tokens_used)
            
            logger.info(
                "OpenRouter invocation complete",
                model=model,
                response_id=response.id,
                tokens_used=tokens_used,
                estimated_cost=cost
            )
            
            return LLMResponse(
                content=content,
                provider=self.type,
                model=model,
                tokens_used=tokens_used,
                cost=cost,
                latency_ms=0,
                finish_reason=finish_reason or "stop"
            )
        
        except Exception as e:
            logger.error(
                "OpenRouter invocation failed",
                model=model,
                error=str(e),
                exc_info=e
            )
            raise ProviderError(
                message=f"OpenRouter API error: {str(e)}",
                provider=self.type,
                model=model,
                original_error=e
            )
    
    def _build_messages(self, request: LLMRequest) -> list[dict]:
        """Build messages array for OpenRouter API."""
        messages = []
        
        if request.system_prompt:
            messages.append({
                "role": "system",
                "content": request.system_prompt
            })
        
        messages.append({
            "role": "user",
            "content": request.prompt
        })
        
        return messages
    
    async def get_accurate_cost(self, generation_id: str) -> dict:
        """
        Get accurate cost and stats from OpenRouter.
        
        Query the /api/v1/generation endpoint for precise token counts
        and cost using the model's native tokenizer.
        
        Args:
            generation_id: Response ID from OpenRouter
            
        Returns:
            Generation stats including accurate cost
        """
        try:
            import httpx
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/generation?id={generation_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                )
                response.raise_for_status()
                return response.json()
        
        except Exception as e:
            logger.error(
                "Failed to get accurate cost from OpenRouter",
                generation_id=generation_id,
                error=str(e)
            )
            return {}
    
    @classmethod
    def create_default_config(
        cls,
        api_key: str,
        enabled: bool = True
    ) -> ProviderConfig:
        """
        Create default configuration for OpenRouter provider.
        
        Args:
            api_key: OpenRouter API key
            enabled: Whether provider is enabled
            
        Returns:
            ProviderConfig with default settings
        """
        return ProviderConfig(
            name="OpenRouter",
            type="openrouter",
            api_key=api_key,
            base_url=cls.BASE_URL,
            models=cls.DEFAULT_MODELS,
            cost_per_1k_tokens=cls.DEFAULT_COST_PER_1K,
            max_tokens=cls.DEFAULT_MAX_TOKENS,
            capabilities=cls.DEFAULT_CAPABILITIES,
            enabled=enabled
        )
