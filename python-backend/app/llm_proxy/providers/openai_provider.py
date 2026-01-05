"""
SmartSpec Pro - OpenAI Provider
Strategy Pattern Implementation

This module implements the OpenAI provider using the BaseLLMProvider interface.
It demonstrates how to create a concrete provider that can be easily tested
and injected into the LLMProxy.

Key Features:
- Uses ProviderConfig for configuration injection
- Client is created lazily or can be injected for testing
- All API-specific logic is encapsulated here
"""

import time
from typing import Optional

import structlog
from openai import AsyncOpenAI

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI LLM Provider implementation.
    
    This provider supports GPT-4, GPT-4-turbo, and GPT-3.5-turbo models.
    It uses the OpenAI Python SDK for API communication.
    
    Example:
        >>> config = ProviderConfig(
        ...     name="OpenAI",
        ...     type="openai",
        ...     api_key="sk-...",
        ...     models=["gpt-4", "gpt-3.5-turbo"],
        ...     cost_per_1k_tokens={"gpt-4": 0.03, "gpt-3.5-turbo": 0.001}
        ... )
        >>> provider = OpenAIProvider(config)
        >>> response = await provider.invoke("gpt-4", request)
    
    For Testing:
        >>> mock_client = AsyncMock()
        >>> provider = OpenAIProvider(config, client=mock_client)
    """
    
    # Model selection matrix for task types and priorities
    MODEL_SELECTION = {
        "planning": {
            "quality": "gpt-4",
            "cost": "gpt-3.5-turbo",
            "speed": "gpt-3.5-turbo"
        },
        "code_generation": {
            "quality": "gpt-4-turbo",
            "cost": "gpt-3.5-turbo",
            "speed": "gpt-3.5-turbo"
        },
        "analysis": {
            "quality": "gpt-4",
            "cost": "gpt-3.5-turbo",
            "speed": "gpt-3.5-turbo"
        },
        "decision": {
            "quality": "gpt-4",
            "cost": "gpt-3.5-turbo",
            "speed": "gpt-3.5-turbo"
        },
        "simple": {
            "quality": "gpt-3.5-turbo",
            "cost": "gpt-3.5-turbo",
            "speed": "gpt-3.5-turbo"
        }
    }
    
    def __init__(
        self,
        config: ProviderConfig,
        client: Optional[AsyncOpenAI] = None
    ):
        """
        Initialize the OpenAI provider.
        
        Args:
            config: Provider configuration with API key and settings.
            client: Optional pre-configured client (useful for testing).
        """
        super().__init__(config)
        
        # Allow client injection for testing
        if client is not None:
            self._client = client
        else:
            self._client = None  # Lazy initialization
        
        logger.info("OpenAI provider initialized", name=self.name)
    
    @property
    def client(self) -> AsyncOpenAI:
        """
        Get or create the OpenAI client.
        
        Uses lazy initialization to defer client creation until needed.
        This allows the provider to be created without immediately
        requiring a valid API key (useful for testing).
        """
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
        return self._client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke the OpenAI API with the given request.
        
        Args:
            model: The model name to use (e.g., "gpt-4", "gpt-3.5-turbo").
            request: The LLM request containing prompt and parameters.
        
        Returns:
            LLMResponse with generated content and metadata.
        
        Raises:
            ProviderError: If the API call fails.
        """
        start_time = time.time()
        
        try:
            # Build messages from request
            messages = self._build_messages(request)
            
            logger.info(
                "Invoking OpenAI",
                model=model,
                task_type=request.task_type,
                message_count=len(messages)
            )
            
            # Make API call
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature
            )
            
            # Extract response data
            content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens
            finish_reason = response.choices[0].finish_reason
            latency_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                "OpenAI invocation complete",
                model=model,
                tokens_used=tokens_used,
                latency_ms=latency_ms,
                finish_reason=finish_reason
            )
            
            return self._create_response(
                content=content,
                model=model,
                tokens_used=tokens_used,
                finish_reason=finish_reason
            )
        
        except Exception as e:
            logger.error(
                "OpenAI invocation failed",
                model=model,
                error=str(e),
                exc_info=e
            )
            raise ProviderError(
                message=str(e),
                provider=self.type,
                model=model,
                original_error=e
            )
    
    def get_model_for_task(self, task_type: str, budget_priority: str) -> str:
        """
        Get the best OpenAI model for a given task type and budget priority.
        
        Args:
            task_type: Type of task (planning, code_generation, etc.)
            budget_priority: Budget priority (quality, cost, speed)
        
        Returns:
            Model name to use.
        """
        task_models = self.MODEL_SELECTION.get(task_type, self.MODEL_SELECTION["simple"])
        return task_models.get(budget_priority, "gpt-3.5-turbo")


# =============================================================================
# Factory function for easy creation
# =============================================================================

def create_openai_provider(
    api_key: str,
    base_url: Optional[str] = None,
    enabled: bool = True
) -> OpenAIProvider:
    """
    Factory function to create an OpenAI provider with default configuration.
    
    Args:
        api_key: OpenAI API key.
        base_url: Optional custom API endpoint.
        enabled: Whether the provider should be enabled.
    
    Returns:
        Configured OpenAIProvider instance.
    """
    config = ProviderConfig(
        name="OpenAI",
        type="openai",
        api_key=api_key,
        base_url=base_url,
        models=["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        cost_per_1k_tokens={
            "gpt-4": 0.03,
            "gpt-4-turbo": 0.01,
            "gpt-3.5-turbo": 0.001
        },
        max_tokens={
            "gpt-4": 8192,
            "gpt-4-turbo": 128000,
            "gpt-3.5-turbo": 16385
        },
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
        enabled=enabled
    )
    return OpenAIProvider(config)
