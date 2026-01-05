"""
SmartSpec Pro - Z.AI Provider (Refactored)
Uses Strategy Pattern and Dependency Injection
GLM-4.7 and GLM series models by Zhipu AI
"""

import structlog
from typing import Optional, Any

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class ZAIProvider(BaseLLMProvider):
    """
    Z.AI LLM Provider (Zhipu AI) with Dependency Injection support.
    
    Features:
    - Uses ProviderConfig for configuration
    - Supports client injection for testing
    - Access to GLM series models (GLM-4.7, GLM-4.5, etc.)
    - Long context support (200K tokens)
    
    API Docs: https://docs.z.ai
    """
    
    # Default model configuration
    DEFAULT_MODELS = [
        "glm-4.7",
        "glm-4.6",
        "glm-4.5",
        "glm-4",
        "glm-4-flash"
    ]
    
    # Cost per 1k tokens (converted from per 1M)
    DEFAULT_COST_PER_1K = {
        "glm-4.7": 0.001,
        "glm-4.6": 0.001,
        "glm-4.5": 0.001,
        "glm-4": 0.001,
        "glm-4-flash": 0.0  # Free model
    }
    
    # Max tokens per model
    DEFAULT_MAX_TOKENS = {
        "glm-4.7": 8192,
        "glm-4.6": 8192,
        "glm-4.5": 8192,
        "glm-4": 8192,
        "glm-4-flash": 4096
    }
    
    # Capabilities
    DEFAULT_CAPABILITIES = [
        "planning",
        "code_generation",
        "analysis",
        "decision",
        "simple"
    ]
    
    # Base URLs
    STANDARD_BASE_URL = "https://api.z.ai/api/paas/v4"
    CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4"
    
    def __init__(
        self,
        config: ProviderConfig,
        client: Optional[Any] = None,
        use_coding_endpoint: bool = False
    ):
        """
        Initialize Z.AI provider.
        
        Args:
            config: Provider configuration
            client: Optional AsyncOpenAI client for testing
            use_coding_endpoint: Use coding endpoint (for GLM Coding Plan)
        """
        super().__init__(config)
        self._client = client
        self.use_coding_endpoint = use_coding_endpoint
        
        logger.info(
            "Z.AI provider initialized",
            name=self.name,
            use_coding_endpoint=use_coding_endpoint,
            models=self.models
        )
    
    @property
    def base_url(self) -> str:
        """Get appropriate base URL."""
        if self.config.base_url:
            return self.config.base_url
        return self.CODING_BASE_URL if self.use_coding_endpoint else self.STANDARD_BASE_URL
    
    @property
    def client(self):
        """Lazy load OpenAI-compatible client."""
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
        return self._client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke Z.AI API.
        
        Args:
            model: Model name to use (e.g., glm-4.7)
            request: LLM request
            
        Returns:
            LLMResponse with generated content
        """
        if not self.enabled:
            raise ProviderError(
                message="Z.AI provider is disabled",
                provider=self.type,
                model=model
            )
        
        try:
            logger.info(
                "Invoking Z.AI",
                model=model,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            
            # Build messages
            messages = self._build_messages(request)
            
            # Call Z.AI API (OpenAI-compatible)
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=request.max_tokens or self.get_max_tokens(model),
                temperature=request.temperature,
                extra_headers={
                    "Accept-Language": "en-US,en"
                }
            )
            
            content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            finish_reason = response.choices[0].finish_reason
            
            # Calculate cost
            cost = self.calculate_cost(model, tokens_used)
            
            logger.info(
                "Z.AI invocation complete",
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
                "Z.AI invocation failed",
                model=model,
                error=str(e),
                exc_info=e
            )
            raise ProviderError(
                message=f"Z.AI API error: {str(e)}",
                provider=self.type,
                model=model,
                original_error=e
            )
    
    def _build_messages(self, request: LLMRequest) -> list[dict]:
        """Build messages array for Z.AI API."""
        messages = []
        
        # GLM models support system messages
        system_prompt = request.system_prompt or "You are a helpful AI assistant."
        messages.append({
            "role": "system",
            "content": system_prompt
        })
        
        messages.append({
            "role": "user",
            "content": request.prompt
        })
        
        return messages
    
    def calculate_cost(self, model: str, tokens_used: int) -> float:
        """
        Calculate cost for GLM model.
        
        Note: glm-4-flash is free. GLM Coding Plan offers flat rate.
        """
        # glm-4-flash is free
        if model == "glm-4-flash":
            return 0.0
        
        return super().calculate_cost(model, tokens_used)
    
    def get_model_info(self, model: str) -> dict:
        """
        Get information about a GLM model.
        
        Args:
            model: Model name
            
        Returns:
            Model information
        """
        model_info = {
            "glm-4.7": {
                "name": "GLM-4.7",
                "description": "Latest flagship model optimized for coding and reasoning",
                "context_length": 200000,
                "strengths": ["coding", "reasoning", "long-context"],
                "languages": ["en", "zh"]
            },
            "glm-4.6": {
                "name": "GLM-4.6",
                "description": "Previous flagship model",
                "context_length": 200000,
                "strengths": ["general", "reasoning"],
                "languages": ["en", "zh"]
            },
            "glm-4.5": {
                "name": "GLM-4.5",
                "description": "Hybrid reasoning model with thinking and non-thinking modes",
                "context_length": 200000,
                "strengths": ["reasoning", "tool-use"],
                "languages": ["en", "zh"]
            },
            "glm-4": {
                "name": "GLM-4",
                "description": "Standard multi-lingual model",
                "context_length": 128000,
                "strengths": ["general", "multi-lingual"],
                "languages": ["en", "zh"]
            },
            "glm-4-flash": {
                "name": "GLM-4-Flash",
                "description": "Free, fast model for real-time applications",
                "context_length": 128000,
                "strengths": ["speed", "cost-effective"],
                "languages": ["en", "zh"],
                "free": True
            }
        }
        
        return model_info.get(model, {
            "name": model,
            "description": "Unknown model",
            "context_length": 0,
            "strengths": [],
            "languages": []
        })
    
    @classmethod
    def create_default_config(
        cls,
        api_key: str,
        use_coding_endpoint: bool = False,
        enabled: bool = True
    ) -> ProviderConfig:
        """
        Create default configuration for Z.AI provider.
        
        Args:
            api_key: Z.AI API key
            use_coding_endpoint: Use coding endpoint
            enabled: Whether provider is enabled
            
        Returns:
            ProviderConfig with default settings
        """
        base_url = cls.CODING_BASE_URL if use_coding_endpoint else cls.STANDARD_BASE_URL
        
        return ProviderConfig(
            name="Z.AI",
            type="zai",
            api_key=api_key,
            base_url=base_url,
            models=cls.DEFAULT_MODELS,
            cost_per_1k_tokens=cls.DEFAULT_COST_PER_1K,
            max_tokens=cls.DEFAULT_MAX_TOKENS,
            capabilities=cls.DEFAULT_CAPABILITIES,
            enabled=enabled
        )
