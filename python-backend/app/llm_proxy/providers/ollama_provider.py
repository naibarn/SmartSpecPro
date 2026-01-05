"""
SmartSpec Pro - Ollama Provider (Refactored)
Uses Strategy Pattern and Dependency Injection
"""

import structlog
from typing import Optional, Any

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class OllamaProvider(BaseLLMProvider):
    """
    Ollama LLM Provider with Dependency Injection support.
    
    Features:
    - Uses ProviderConfig for configuration
    - Supports httpx client injection for testing
    - Local models (free)
    """
    
    # Default model configuration
    DEFAULT_MODELS = [
        "llama3:70b",
        "llama3:8b",
        "codellama:34b",
        "codellama:7b",
        "mistral:7b"
    ]
    
    # Cost per 1k tokens (Ollama is free/local)
    DEFAULT_COST_PER_1K = {
        "llama3:70b": 0.0,
        "llama3:8b": 0.0,
        "codellama:34b": 0.0,
        "codellama:7b": 0.0,
        "mistral:7b": 0.0
    }
    
    # Max tokens per model
    DEFAULT_MAX_TOKENS = {
        "llama3:70b": 8192,
        "llama3:8b": 8192,
        "codellama:34b": 16384,
        "codellama:7b": 16384,
        "mistral:7b": 8192
    }
    
    # Capabilities
    DEFAULT_CAPABILITIES = [
        "planning",
        "code_generation",
        "analysis",
        "decision",
        "simple"
    ]
    
    # Default base URL
    DEFAULT_BASE_URL = "http://localhost:11434"
    
    def __init__(
        self,
        config: ProviderConfig,
        http_client: Optional[Any] = None
    ):
        """
        Initialize Ollama provider.
        
        Args:
            config: Provider configuration
            http_client: Optional httpx.AsyncClient for testing
        """
        super().__init__(config)
        self._http_client = http_client
        self._owns_client = http_client is None
        
        logger.info(
            "Ollama provider initialized",
            name=self.name,
            base_url=self.config.base_url or self.DEFAULT_BASE_URL,
            models=self.models
        )
    
    @property
    def base_url(self) -> str:
        """Get Ollama base URL."""
        return self.config.base_url or self.DEFAULT_BASE_URL
    
    @property
    def http_client(self):
        """Lazy load httpx client."""
        if self._http_client is None:
            import httpx
            self._http_client = httpx.AsyncClient()
        return self._http_client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke Ollama API.
        
        Args:
            model: Model name to use
            request: LLM request
            
        Returns:
            LLMResponse with generated content
        """
        if not self.enabled:
            raise ProviderError(
                message="Ollama provider is disabled",
                provider=self.type,
                model=model
            )
        
        try:
            logger.info(
                "Invoking Ollama",
                model=model,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            
            # Build request payload
            payload = {
                "model": model,
                "prompt": request.prompt,
                "stream": False,
                "options": {
                    "temperature": request.temperature,
                    "num_predict": request.max_tokens or self.get_max_tokens(model)
                }
            }
            
            # Call Ollama API
            response = await self.http_client.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=120.0
            )
            
            response.raise_for_status()
            data = response.json()
            
            content = data.get("response", "")
            
            # Estimate tokens (Ollama doesn't provide exact count)
            tokens_used = self._estimate_tokens(request.prompt, content)
            
            # Ollama is free (local)
            cost = 0.0
            
            logger.info(
                "Ollama invocation complete",
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
            error_msg = str(e)
            if "ConnectError" in error_msg or "Connection refused" in error_msg:
                logger.error(
                    "Ollama connection failed - is Ollama running?",
                    error=error_msg
                )
                raise ProviderError(
                    message="Ollama is not running. Please start Ollama: ollama serve",
                    provider=self.type,
                    model=model,
                    original_error=e
                )
            
            logger.error(
                "Ollama invocation failed",
                model=model,
                error=error_msg,
                exc_info=e
            )
            raise ProviderError(
                message=f"Ollama API error: {error_msg}",
                provider=self.type,
                model=model,
                original_error=e
            )
    
    def _estimate_tokens(self, prompt: str, response: str) -> int:
        """Estimate token count from text."""
        # Rough estimation: ~1.3 tokens per word
        words = len(prompt.split()) + len(response.split())
        return int(words * 1.3)
    
    async def close(self):
        """Close HTTP client if we own it."""
        if self._owns_client and self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None
    
    @classmethod
    def create_default_config(
        cls,
        base_url: str = None,
        enabled: bool = False  # Disabled by default (requires local setup)
    ) -> ProviderConfig:
        """
        Create default configuration for Ollama provider.
        
        Args:
            base_url: Ollama server URL
            enabled: Whether provider is enabled
            
        Returns:
            ProviderConfig with default settings
        """
        return ProviderConfig(
            name="Ollama",
            type="ollama",
            api_key=None,  # Not required for Ollama
            base_url=base_url or cls.DEFAULT_BASE_URL,
            models=cls.DEFAULT_MODELS,
            cost_per_1k_tokens=cls.DEFAULT_COST_PER_1K,
            max_tokens=cls.DEFAULT_MAX_TOKENS,
            capabilities=cls.DEFAULT_CAPABILITIES,
            enabled=enabled
        )
