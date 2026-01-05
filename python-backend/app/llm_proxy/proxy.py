"""
SmartSpec Pro - LLM Proxy V2
Refactored with Strategy Pattern and Dependency Injection

This module provides the refactored LLMProxy that uses:
- Strategy Pattern: Providers are interchangeable strategies
- Dependency Injection: Providers are injected, not created internally
- Factory Pattern: Provider creation is delegated to ProviderFactory

Key Benefits:
- 100% testable without mocking external APIs
- Easy to add new providers without modifying LLMProxy
- Clear separation of concerns

Example Usage (Production):
    >>> from app.llm_proxy.providers.factory import create_providers_from_settings
    >>> providers = create_providers_from_settings()
    >>> proxy = LLMProxyV2(providers)
    >>> response = await proxy.invoke(request)

Example Usage (Testing):
    >>> mock_provider = MockProvider()
    >>> proxy = LLMProxyV2({"mock": mock_provider})
    >>> response = await proxy.invoke(request)
"""

import time
from typing import Optional

import structlog

from app.llm_proxy.models import (
    LLMRequest,
    LLMResponse,
    LLMUsageStats,
)
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderError

logger = structlog.get_logger()


class LLMProxyV2:
    """
    Refactored LLM Proxy with Dependency Injection.
    
    This class acts as a facade for multiple LLM providers. It handles:
    - Provider selection based on task type and budget priority
    - Automatic fallback when preferred provider is unavailable
    - Usage statistics tracking
    - Cost calculation
    
    The key difference from the original LLMProxy is that providers
    are injected rather than created internally, making it fully testable.
    
    Attributes:
        providers: Dictionary of provider name to provider instance.
        usage_stats: Accumulated usage statistics.
    
    Example:
        >>> # Production usage
        >>> from app.llm_proxy.providers.factory import create_providers_from_settings
        >>> proxy = LLMProxyV2(create_providers_from_settings())
        >>> 
        >>> # Testing usage
        >>> mock_openai = MockProvider(name="openai")
        >>> proxy = LLMProxyV2({"openai": mock_openai})
    """
    
    # Selection matrix for task types and budget priorities
    # Maps (task_type, budget_priority) -> (provider_name, model_name)
    SELECTION_MAP = {
        "planning": {
            "quality": ("openai", "gpt-4"),
            "cost": ("google", "gemini-pro"),
            "speed": ("groq", "llama-3.1-70b-versatile")
        },
        "code_generation": {
            "quality": ("anthropic", "claude-3-sonnet-20240229"),
            "cost": ("ollama", "codellama"),
            "speed": ("groq", "llama-3.1-70b-versatile")
        },
        "analysis": {
            "quality": ("anthropic", "claude-3-sonnet-20240229"),
            "cost": ("google", "gemini-pro"),
            "speed": ("groq", "mixtral-8x7b-32768")
        },
        "decision": {
            "quality": ("openai", "gpt-4"),
            "cost": ("anthropic", "claude-3-haiku-20240307"),
            "speed": ("groq", "llama-3.1-70b-versatile")
        },
        "simple": {
            "quality": ("openai", "gpt-3.5-turbo"),
            "cost": ("ollama", "llama3"),
            "speed": ("openai", "gpt-3.5-turbo")
        }
    }
    
    def __init__(self, providers: dict[str, BaseLLMProvider] = None):
        """
        Initialize the LLM Proxy.
        
        Args:
            providers: Dictionary mapping provider names to provider instances.
                      If None, creates providers from settings (production mode).
        """
        if providers is None:
            # Production mode: create providers from settings
            from app.llm_proxy.providers.factory import create_providers_from_settings
            providers = create_providers_from_settings()
        
        self.providers = providers
        self.usage_stats = LLMUsageStats()
        
        enabled_count = len([p for p in providers.values() if p.enabled])
        logger.info(
            "LLMProxyV2 initialized",
            total_providers=len(providers),
            enabled_providers=enabled_count
        )
    
    # =========================================================================
    # Public API
    # =========================================================================
    
    async def invoke(self, request: LLMRequest) -> LLMResponse:
        """
        Invoke an LLM with the given request.
        
        This method:
        1. Selects the appropriate provider and model
        2. Invokes the provider
        3. Calculates cost and latency
        4. Updates usage statistics
        
        Args:
            request: The LLM request containing prompt, task type, etc.
        
        Returns:
            LLMResponse with generated content and metadata.
        
        Raises:
            RuntimeError: If no providers are available.
            ProviderError: If the provider invocation fails.
        """
        # Select provider and model
        provider_name, model_name = self.select_provider(request)
        provider = self.providers[provider_name]
        
        start_time = time.time()
        
        try:
            # Invoke the provider (Strategy Pattern in action)
            response = await provider.invoke(model_name, request)
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Calculate cost
            cost = provider.calculate_cost(model_name, response.tokens_used)
            
            # Update usage stats
            self._update_usage_stats(
                provider_name,
                request.task_type,
                response.tokens_used,
                cost
            )
            
            # Return enriched response
            return LLMResponse(
                content=response.content,
                provider=provider_name,
                model=model_name,
                tokens_used=response.tokens_used,
                cost=cost,
                latency_ms=latency_ms,
                finish_reason=response.finish_reason
            )
        
        except Exception as e:
            logger.error(
                "LLM invocation failed",
                provider=provider_name,
                model=model_name,
                error=str(e),
                exc_info=e
            )
            raise
    
    def select_llm(self, request: LLMRequest) -> tuple[str, str]:
        """
        Alias for select_provider (backward compatibility).
        
        Args:
            request: LLM request with task type and preferences
            
        Returns:
            Tuple of (provider_name, model_name)
        """
        return self.select_provider(request)
    
    def select_provider(self, request: LLMRequest) -> tuple[str, str]:
        """
        Select the best provider and model for the request.
        
        Selection priority:
        1. User-specified provider and model (if available and enabled)
        2. Selection map based on task type and budget priority
        3. Fallback to any available provider
        
        Args:
            request: The LLM request.
        
        Returns:
            Tuple of (provider_name, model_name).
        
        Raises:
            RuntimeError: If no providers are available.
        """
        # Priority 1: User preference
        if request.preferred_provider and request.preferred_model:
            if self._is_provider_available(
                request.preferred_provider,
                request.preferred_model
            ):
                logger.info(
                    "Using user-specified LLM",
                    provider=request.preferred_provider,
                    model=request.preferred_model
                )
                return (request.preferred_provider, request.preferred_model)
        
        # Priority 2: Selection map
        provider_name, model_name = self._get_from_selection_map(
            request.task_type,
            request.budget_priority
        )
        
        if self._is_provider_available(provider_name, model_name):
            logger.info(
                "Selected LLM from map",
                provider=provider_name,
                model=model_name,
                task_type=request.task_type,
                budget_priority=request.budget_priority
            )
            return (provider_name, model_name)
        
        # Priority 3: Fallback
        logger.warning(
            "Selected provider not available, using fallback",
            selected=provider_name,
            task_type=request.task_type
        )
        return self._get_fallback_provider(request.task_type)
    
    def get_providers(self) -> list["LLMProvider"]:
        """Get list of all configured providers as Pydantic models."""
        from app.llm_proxy.models import LLMProvider
        return [
            LLMProvider(
                name=p.name,
                type=p.type,
                api_key=None,  # Don't expose API keys
                base_url=p.base_url,
                models=p.models,
                cost_per_1k_tokens=p.config.cost_per_1k_tokens,
                max_tokens=p.config.max_tokens,
                capabilities=p.capabilities,
                enabled=p.enabled,
            )
            for p in self.providers.values()
        ]
    
    def get_usage_stats(self) -> LLMUsageStats:
        """Get current usage statistics."""
        return self.usage_stats
    
    def enable_provider(self, provider_name: str):
        """Enable a provider by name."""
        if provider_name in self.providers:
            self.providers[provider_name].enable()
            logger.info("Provider enabled", provider=provider_name)
    
    def disable_provider(self, provider_name: str):
        """Disable a provider by name."""
        if provider_name in self.providers:
            self.providers[provider_name].disable()
            logger.info("Provider disabled", provider=provider_name)
    
    # =========================================================================
    # Private Methods
    # =========================================================================
    
    def _is_provider_available(self, provider_name: str, model_name: str) -> bool:
        """Check if a provider is available and supports the model."""
        if provider_name not in self.providers:
            return False
        
        provider = self.providers[provider_name]
        return provider.enabled and provider.supports_model(model_name)
    
    def _get_from_selection_map(
        self,
        task_type: str,
        budget_priority: str
    ) -> tuple[str, str]:
        """Get provider and model from selection map."""
        task_map = self.SELECTION_MAP.get(task_type, self.SELECTION_MAP["simple"])
        return task_map.get(budget_priority, ("openai", "gpt-3.5-turbo"))
    
    def _get_fallback_provider(self, task_type: str) -> tuple[str, str]:
        """
        Get fallback provider when preferred is unavailable.
        
        Tries to find:
        1. Any enabled provider with the required capability
        2. Any enabled provider (last resort)
        
        Args:
            task_type: The task type to find a provider for.
        
        Returns:
            Tuple of (provider_name, model_name).
        
        Raises:
            RuntimeError: If no providers are available.
        """
        # Try to find provider with matching capability
        for name, provider in self.providers.items():
            if provider.enabled and provider.supports_capability(task_type):
                logger.info(
                    "Using fallback provider with capability",
                    provider=name,
                    task_type=task_type
                )
                return (name, provider.models[0])
        
        # Last resort: any enabled provider
        for name, provider in self.providers.items():
            if provider.enabled:
                logger.warning(
                    "Using last-resort fallback provider",
                    provider=name,
                    task_type=task_type
                )
                return (name, provider.models[0])
        
        raise RuntimeError("No enabled LLM providers available")
    
    def _update_usage_stats(
        self,
        provider: str,
        task_type: str,
        tokens: int,
        cost: float
    ):
        """Update usage statistics."""
        self.usage_stats.total_requests += 1
        self.usage_stats.total_tokens += tokens
        self.usage_stats.total_cost += cost
        
        # By provider
        self.usage_stats.requests_by_provider[provider] = \
            self.usage_stats.requests_by_provider.get(provider, 0) + 1
        self.usage_stats.tokens_by_provider[provider] = \
            self.usage_stats.tokens_by_provider.get(provider, 0) + tokens
        self.usage_stats.cost_by_provider[provider] = \
            self.usage_stats.cost_by_provider.get(provider, 0.0) + cost
        
        # By task type
        self.usage_stats.requests_by_task_type[task_type] = \
            self.usage_stats.requests_by_task_type.get(task_type, 0) + 1


# =============================================================================
# Global instance (for backward compatibility)
# =============================================================================

# Lazy initialization to avoid import-time side effects
_llm_proxy_v2: Optional[LLMProxyV2] = None


def get_llm_proxy() -> LLMProxyV2:
    """
    Get the global LLMProxyV2 instance.
    
    Uses lazy initialization to avoid creating providers at import time.
    This makes it easier to test modules that import this.
    
    Returns:
        The global LLMProxyV2 instance.
    """
    global _llm_proxy_v2
    if _llm_proxy_v2 is None:
        _llm_proxy_v2 = LLMProxyV2()
    return _llm_proxy_v2


# =============================================================================
# Exception class (for backward compatibility)
# =============================================================================

class LLMProviderError(ProviderError):
    """Alias for ProviderError for backward compatibility."""
    pass


# =============================================================================
# Backward compatibility aliases
# =============================================================================

# Alias for backward compatibility with existing code
LLMProxy = LLMProxyV2
llm_proxy = get_llm_proxy()
