"""
SmartSpec Pro - Anthropic Provider
Strategy Pattern Implementation

This module implements the Anthropic (Claude) provider using the BaseLLMProvider interface.
It demonstrates handling of a non-OpenAI-compatible API.
"""

import time
from typing import Optional

import structlog
from anthropic import AsyncAnthropic

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError

logger = structlog.get_logger()


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic (Claude) LLM Provider implementation.
    
    This provider supports Claude 3 models (Opus, Sonnet, Haiku).
    It uses the Anthropic Python SDK which has a different API structure
    than OpenAI-compatible providers.
    
    Example:
        >>> config = ProviderConfig(
        ...     name="Anthropic",
        ...     type="anthropic",
        ...     api_key="sk-ant-...",
        ...     models=["claude-3-opus-20240229", "claude-3-sonnet-20240229"]
        ... )
        >>> provider = AnthropicProvider(config)
        >>> response = await provider.invoke("claude-3-sonnet-20240229", request)
    
    For Testing:
        >>> mock_client = AsyncMock()
        >>> provider = AnthropicProvider(config, client=mock_client)
    """
    
    # Model selection matrix for task types and priorities
    MODEL_SELECTION = {
        "planning": {
            "quality": "claude-3-opus-20240229",
            "cost": "claude-3-haiku-20240307",
            "speed": "claude-3-haiku-20240307"
        },
        "code_generation": {
            "quality": "claude-3-sonnet-20240229",
            "cost": "claude-3-haiku-20240307",
            "speed": "claude-3-haiku-20240307"
        },
        "analysis": {
            "quality": "claude-3-sonnet-20240229",
            "cost": "claude-3-haiku-20240307",
            "speed": "claude-3-haiku-20240307"
        },
        "decision": {
            "quality": "claude-3-opus-20240229",
            "cost": "claude-3-haiku-20240307",
            "speed": "claude-3-haiku-20240307"
        },
        "simple": {
            "quality": "claude-3-haiku-20240307",
            "cost": "claude-3-haiku-20240307",
            "speed": "claude-3-haiku-20240307"
        }
    }
    
    def __init__(
        self,
        config: ProviderConfig,
        client: Optional[AsyncAnthropic] = None
    ):
        """
        Initialize the Anthropic provider.
        
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
        
        logger.info("Anthropic provider initialized", name=self.name)
    
    @property
    def client(self) -> AsyncAnthropic:
        """
        Get or create the Anthropic client.
        
        Uses lazy initialization to defer client creation until needed.
        """
        if self._client is None:
            self._client = AsyncAnthropic(api_key=self.api_key)
        return self._client
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke the Anthropic API with the given request.
        
        Note: Anthropic's API uses a different message format than OpenAI.
        System prompts are passed as a separate parameter, not in messages.
        
        Args:
            model: The model name to use (e.g., "claude-3-sonnet-20240229").
            request: The LLM request containing prompt and parameters.
        
        Returns:
            LLMResponse with generated content and metadata.
        
        Raises:
            ProviderError: If the API call fails.
        """
        start_time = time.time()
        
        try:
            # Build messages (without system prompt - Anthropic handles it separately)
            if request.messages:
                messages = list(request.messages)
            else:
                messages = [{"role": "user", "content": request.prompt}]
            
            logger.info(
                "Invoking Anthropic",
                model=model,
                task_type=request.task_type,
                message_count=len(messages)
            )
            
            # Make API call (Anthropic uses different parameter names)
            response = await self.client.messages.create(
                model=model,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                system=request.system_prompt or "",  # System prompt is separate
                messages=messages
            )
            
            # Extract response data (Anthropic response structure is different)
            content = response.content[0].text
            tokens_used = response.usage.input_tokens + response.usage.output_tokens
            finish_reason = response.stop_reason
            latency_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                "Anthropic invocation complete",
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
                "Anthropic invocation failed",
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
        Get the best Anthropic model for a given task type and budget priority.
        
        Args:
            task_type: Type of task (planning, code_generation, etc.)
            budget_priority: Budget priority (quality, cost, speed)
        
        Returns:
            Model name to use.
        """
        task_models = self.MODEL_SELECTION.get(task_type, self.MODEL_SELECTION["simple"])
        return task_models.get(budget_priority, "claude-3-haiku-20240307")


# =============================================================================
# Factory function for easy creation
# =============================================================================

def create_anthropic_provider(
    api_key: str,
    enabled: bool = True
) -> AnthropicProvider:
    """
    Factory function to create an Anthropic provider with default configuration.
    
    Args:
        api_key: Anthropic API key.
        enabled: Whether the provider should be enabled.
    
    Returns:
        Configured AnthropicProvider instance.
    """
    config = ProviderConfig(
        name="Anthropic",
        type="anthropic",
        api_key=api_key,
        models=[
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
        ],
        cost_per_1k_tokens={
            "claude-3-opus-20240229": 0.015,
            "claude-3-sonnet-20240229": 0.003,
            "claude-3-haiku-20240307": 0.00025
        },
        max_tokens={
            "claude-3-opus-20240229": 200000,
            "claude-3-sonnet-20240229": 200000,
            "claude-3-haiku-20240307": 200000
        },
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
        enabled=enabled
    )
    return AnthropicProvider(config)
