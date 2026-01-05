"""
SmartSpec Pro - Google Provider (Refactored)
Uses Strategy Pattern and Dependency Injection
"""

import structlog
from typing import Optional, Any

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class GoogleProvider(BaseLLMProvider):
    """
    Google (Gemini) LLM Provider with Dependency Injection support.
    
    Features:
    - Uses ProviderConfig for configuration
    - Supports client injection for testing
    - Lazy initialization of genai module
    """
    
    # Default model configuration
    DEFAULT_MODELS = [
        "gemini-pro",
        "gemini-1.5-pro",
        "gemini-1.5-flash"
    ]
    
    # Cost per 1k tokens (converted from per 1M)
    DEFAULT_COST_PER_1K = {
        "gemini-pro": 0.001,  # $1/1M = $0.001/1k
        "gemini-1.5-pro": 0.00125,
        "gemini-1.5-flash": 0.000075
    }
    
    # Max tokens per model
    DEFAULT_MAX_TOKENS = {
        "gemini-pro": 8192,
        "gemini-1.5-pro": 8192,
        "gemini-1.5-flash": 8192
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
        genai_module: Optional[Any] = None
    ):
        """
        Initialize Google provider.
        
        Args:
            config: Provider configuration
            genai_module: Optional google.generativeai module for testing
        """
        super().__init__(config)
        self._genai = genai_module
        self._configured = False
        
        logger.info(
            "Google provider initialized",
            name=self.name,
            models=self.models
        )
    
    @property
    def genai(self):
        """Lazy load and configure genai module."""
        if self._genai is None:
            import google.generativeai as genai
            self._genai = genai
        
        if not self._configured and self.api_key:
            self._genai.configure(api_key=self.api_key)
            self._configured = True
        
        return self._genai
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke Google Gemini API.
        
        Args:
            model: Model name to use
            request: LLM request
            
        Returns:
            LLMResponse with generated content
        """
        if not self.enabled:
            raise ProviderError(
                message="Google provider is disabled",
                provider=self.type,
                model=model
            )
        
        try:
            logger.info(
                "Invoking Google",
                model=model,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            
            # Create model instance
            generative_model = self.genai.GenerativeModel(model)
            
            # Build generation config
            generation_config = self.genai.types.GenerationConfig(
                max_output_tokens=request.max_tokens or self.get_max_tokens(model),
                temperature=request.temperature
            )
            
            # Generate content
            response = await generative_model.generate_content_async(
                request.prompt,
                generation_config=generation_config
            )
            
            content = response.text
            
            # Estimate tokens (Google doesn't always provide exact count)
            tokens_used = self._estimate_tokens(request.prompt, content)
            
            # Calculate cost
            cost = self.calculate_cost(model, tokens_used)
            
            logger.info(
                "Google invocation complete",
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
                finish_reason="stop"
            )
        
        except Exception as e:
            logger.error(
                "Google invocation failed",
                model=model,
                error=str(e),
                exc_info=e
            )
            raise ProviderError(
                message=f"Google API error: {str(e)}",
                provider=self.type,
                model=model,
                original_error=e
            )
    
    def _estimate_tokens(self, prompt: str, response: str) -> int:
        """Estimate token count from text."""
        # Rough estimation: ~1.3 tokens per word
        words = len(prompt.split()) + len(response.split())
        return int(words * 1.3)
    
    @classmethod
    def create_default_config(
        cls,
        api_key: str,
        enabled: bool = True
    ) -> ProviderConfig:
        """
        Create default configuration for Google provider.
        
        Args:
            api_key: Google API key
            enabled: Whether provider is enabled
            
        Returns:
            ProviderConfig with default settings
        """
        return ProviderConfig(
            name="Google",
            type="google",
            api_key=api_key,
            models=cls.DEFAULT_MODELS,
            cost_per_1k_tokens=cls.DEFAULT_COST_PER_1K,
            max_tokens=cls.DEFAULT_MAX_TOKENS,
            capabilities=cls.DEFAULT_CAPABILITIES,
            enabled=enabled
        )
