"""
SmartSpec Pro - Base LLM Provider
Strategy Pattern Implementation for LLM Proxy Refactoring

This module defines the abstract base class for all LLM providers.
Each concrete provider must implement the core methods defined here.

Design Patterns Used:
- Strategy Pattern: Each provider is a strategy for invoking LLMs
- Template Method: Common logic in base class, specifics in subclasses
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from app.llm_proxy.models import LLMRequest, LLMResponse


@dataclass
class ProviderConfig:
    """
    Configuration for an LLM provider.
    
    This dataclass encapsulates all configuration needed to initialize
    and operate a provider, making it easy to pass around and test.
    
    Attributes:
        name: Human-readable provider name (e.g., "OpenAI")
        type: Provider type identifier (e.g., "openai")
        api_key: API key for authentication
        base_url: Optional custom API endpoint
        models: List of available model names
        cost_per_1k_tokens: Cost mapping per model
        max_tokens: Max token limits per model
        capabilities: Task types this provider supports
        enabled: Whether the provider is active
    """
    name: str
    type: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    models: list[str] = field(default_factory=list)
    cost_per_1k_tokens: dict[str, float] = field(default_factory=dict)
    max_tokens: dict[str, int] = field(default_factory=dict)
    capabilities: list[str] = field(default_factory=list)
    enabled: bool = True


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers.
    
    This class defines the interface that all concrete providers must implement.
    It follows the Strategy Pattern, allowing the LLMProxy to work with any
    provider without knowing its implementation details.
    
    Key Benefits:
    - Testability: Each provider can be tested in isolation
    - Extensibility: New providers can be added without modifying LLMProxy
    - Maintainability: Provider-specific logic is encapsulated
    
    Example Usage:
        >>> config = ProviderConfig(
        ...     name="OpenAI",
        ...     type="openai",
        ...     api_key="sk-...",
        ...     models=["gpt-4", "gpt-3.5-turbo"],
        ...     cost_per_1k_tokens={"gpt-4": 0.03, "gpt-3.5-turbo": 0.001},
        ...     capabilities=["planning", "code_generation"]
        ... )
        >>> provider = OpenAIProvider(config)
        >>> response = await provider.invoke("gpt-4", request)
    """
    
    def __init__(self, config: ProviderConfig):
        """
        Initialize the provider with configuration.
        
        Args:
            config: Provider configuration object containing all settings.
        """
        self.config = config
        self._enabled = config.enabled
    
    # =========================================================================
    # Properties
    # =========================================================================
    
    @property
    def name(self) -> str:
        """Human-readable provider name."""
        return self.config.name
    
    @property
    def type(self) -> str:
        """Provider type identifier."""
        return self.config.type
    
    @property
    def api_key(self) -> Optional[str]:
        """API key for authentication."""
        return self.config.api_key
    
    @property
    def base_url(self) -> Optional[str]:
        """Custom API endpoint URL."""
        return self.config.base_url
    
    @property
    def models(self) -> list[str]:
        """List of available models."""
        return self.config.models
    
    @property
    def capabilities(self) -> list[str]:
        """List of supported task types."""
        return self.config.capabilities
    
    @property
    def enabled(self) -> bool:
        """Check if the provider is enabled."""
        return self._enabled
    
    @enabled.setter
    def enabled(self, value: bool):
        """Enable or disable the provider."""
        self._enabled = value
    
    # =========================================================================
    # Public Methods
    # =========================================================================
    
    def enable(self):
        """Enable this provider."""
        self._enabled = True
    
    def disable(self):
        """Disable this provider."""
        self._enabled = False
    
    def is_enabled(self) -> bool:
        """Check if provider is enabled."""
        return self._enabled
    
    def supports_capability(self, capability: str) -> bool:
        """
        Check if provider supports a specific capability/task type.
        
        Args:
            capability: Task type to check (e.g., "planning", "code_generation")
        
        Returns:
            True if the provider supports this capability.
        """
        return capability in self.config.capabilities
    
    def supports_model(self, model: str) -> bool:
        """
        Check if provider supports a specific model.
        
        Args:
            model: Model name to check.
        
        Returns:
            True if the provider supports this model.
        """
        return model in self.config.models
    
    def get_cost_per_1k_tokens(self, model: str) -> float:
        """
        Get cost per 1k tokens for a specific model.
        
        Args:
            model: Model name.
        
        Returns:
            Cost in USD per 1000 tokens, or 0.0 if not found.
        """
        return self.config.cost_per_1k_tokens.get(model, 0.0)
    
    def get_max_tokens(self, model: str) -> int:
        """
        Get maximum token limit for a specific model.
        
        Args:
            model: Model name.
        
        Returns:
            Maximum tokens allowed, or 4096 as default.
        """
        return self.config.max_tokens.get(model, 4096)
    
    def calculate_cost(self, model: str, tokens_used: int) -> float:
        """
        Calculate cost for a specific model and token count.
        
        Args:
            model: Model name.
            tokens_used: Number of tokens used.
        
        Returns:
            Cost in USD.
        """
        cost_per_1k = self.get_cost_per_1k_tokens(model)
        return (tokens_used / 1000) * cost_per_1k
    
    def get_model_for_task(self, task_type: str, budget_priority: str) -> str:
        """
        Get the best model for a given task type and budget priority.
        
        This is a default implementation that returns the first model.
        Subclasses can override this for more sophisticated selection.
        
        Args:
            task_type: Type of task (planning, code_generation, etc.)
            budget_priority: Budget priority (quality, cost, speed)
        
        Returns:
            Model name to use.
        """
        if not self.models:
            raise ValueError(f"No models available for provider {self.name}")
        return self.models[0]
    
    # =========================================================================
    # Abstract Methods (Must be implemented by subclasses)
    # =========================================================================
    
    @abstractmethod
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """
        Invoke the LLM with the given request.
        
        This is the main method that concrete providers must implement.
        It should handle all the specifics of calling the provider's API.
        
        Args:
            model: The model name to use for this request.
            request: The LLM request containing prompt, parameters, etc.
        
        Returns:
            LLMResponse containing the generated content and metadata.
        
        Raises:
            ProviderError: If the API call fails.
        """
        pass
    
    # =========================================================================
    # Protected Helper Methods (For use by subclasses)
    # =========================================================================
    
    def _build_messages(self, request: LLMRequest) -> list[dict]:
        """
        Build messages array from request.
        
        Helper method to construct the messages array from either
        the messages field or the prompt field.
        
        Args:
            request: The LLM request.
        
        Returns:
            List of message dictionaries with role and content.
        """
        if request.messages:
            messages = list(request.messages)
        else:
            messages = [{"role": "user", "content": request.prompt}]
        
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})
        
        return messages
    
    def _create_response(
        self,
        content: str,
        model: str,
        tokens_used: int,
        finish_reason: Optional[str] = None
    ) -> LLMResponse:
        """
        Create a standardized LLMResponse.
        
        Helper method to create response objects with consistent structure.
        Cost and latency will be calculated by the LLMProxy.
        
        Args:
            content: Generated text content.
            model: Model that was used.
            tokens_used: Total tokens consumed.
            finish_reason: Reason for completion (e.g., "stop", "length").
        
        Returns:
            LLMResponse object.
        """
        return LLMResponse(
            content=content,
            provider=self.type,
            model=model,
            tokens_used=tokens_used,
            cost=0.0,  # Will be calculated by LLMProxy
            latency_ms=0,  # Will be calculated by LLMProxy
            finish_reason=finish_reason
        )


class ProviderError(Exception):
    """
    Exception raised when a provider operation fails.
    
    This exception provides detailed context about the failure,
    making it easier to debug and handle errors appropriately.
    
    Attributes:
        message: Error description.
        provider: Name of the provider that failed.
        model: Model that was being used.
        original_error: The underlying exception, if any.
    
    Example:
        >>> try:
        ...     response = await provider.invoke(model, request)
        ... except ProviderError as e:
        ...     logger.error(f"Provider failed: {e}")
        ...     if e.original_error:
        ...         logger.debug(f"Original error: {e.original_error}")
    """
    
    def __init__(
        self,
        message: str,
        provider: str,
        model: str,
        original_error: Exception = None
    ):
        self.message = message
        self.provider = provider
        self.model = model
        self.original_error = original_error
        super().__init__(self.message)
    
    def __str__(self):
        return f"[{self.provider}/{self.model}] {self.message}"
    
    def __repr__(self):
        return (
            f"ProviderError(message={self.message!r}, "
            f"provider={self.provider!r}, model={self.model!r})"
        )
