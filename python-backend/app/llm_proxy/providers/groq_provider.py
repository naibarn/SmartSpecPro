"""
SmartSpec Pro - Groq Provider (Refactored)
Uses Strategy Pattern and Dependency Injection
"""

import structlog
from typing import Optional, Any

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class GroqProvider(BaseLLMProvider):
    """
    Groq LLM Provider with Dependency Injection support.
    
    Features:
    - Uses ProviderConfig for configuration
    - Supports client injection for testing
    - Fast inference with Llama and Mixtral models
    """
    
    # Default model configuration
    DEFAULT_MODELS = [
        "llama-3.1-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "gemma2-9b-it"
    ]
    
    # Cost per 1k tokens (converted from per 1M)
    DEFAULT_COST_PER_1K = {
        "llama-3.1-70b-versatile": 0.00059,
        "llama-3.1-8b-instant": 0.00005,
        "mixtral-8x7b-32768": 0.00024,
        "gemma2-9b-it": 0.00007
    }
    
    # Max tokens per model
    DEFAULT_MAX_TOKENS = {
        "llama-3.1-70b-versatile": 8192,
        "llama-3.1-8b-instant": 8192,
        "mixtral-8x7b-32768": 32768,
        "gemma2-9b-it": 8192
    }
    
    # Capabilities
    DEFAULT_CAPABILITIES = [
        "planning",
        "code_generation",
        "analysis",
        "decision",
        "simple"
    ]
    
    def __init__(
        self,
        config: ProviderConfig,
        client: Optional[Any] = None
    ):
        """
        Initialize Groq provider.
        
        Args:
            config: Provider configuration
            client: Optional AsyncGroq client for testing
        """
        super().__init__(config)
        self._client = client
        
        logger.info(
            "Groq provider initialized",
            name=self.name,
            models=self.models
        )
    
    @property
    def client(self):
        """Lazy load Groq client."""
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=self.api_key)
        return self._client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke Groq API.
        
        Args:
            model: Model name to use
            request: LLM request
            
        Returns:
            LLMResponse with generated content
        """
        if not self.enabled:
            raise ProviderError(
                message="Groq provider is disabled",
                provider=self.type,
                model=model
            )
        
        try:
            logger.info(
                "Invoking Groq",
                model=model,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            
            # Build messages
            messages = self._build_messages(request)
            
            # Call Groq API
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=request.max_tokens or self.get_max_tokens(model),
                temperature=request.temperature
            )
            
            content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens
            finish_reason = response.choices[0].finish_reason
            
            # Calculate cost
            cost = self.calculate_cost(model, tokens_used)
            
            logger.info(
                "Groq invocation complete",
                model=model,
                tokens_used=tokens_used,
                cost=cost
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
                "Groq invocation failed",
                model=model,
                error=str(e),
                exc_info=e
            )
            raise ProviderError(
                message=f"Groq API error: {str(e)}",
                provider=self.type,
                model=model,
                original_error=e
            )
    
    def _build_messages(self, request: LLMRequest) -> list[dict]:
        """Build messages array for Groq API."""
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
    
    @classmethod
    def create_default_config(
        cls,
        api_key: str,
        enabled: bool = True
    ) -> ProviderConfig:
        """
        Create default configuration for Groq provider.
        
        Args:
            api_key: Groq API key
            enabled: Whether provider is enabled
            
        Returns:
            ProviderConfig with default settings
        """
        return ProviderConfig(
            name="Groq",
            type="groq",
            api_key=api_key,
            models=cls.DEFAULT_MODELS,
            cost_per_1k_tokens=cls.DEFAULT_COST_PER_1K,
            max_tokens=cls.DEFAULT_MAX_TOKENS,
            capabilities=cls.DEFAULT_CAPABILITIES,
            enabled=enabled
        )
