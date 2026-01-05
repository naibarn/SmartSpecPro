"""
SmartSpec Pro - Provider Factory
Factory Pattern Implementation

This module provides a factory for creating LLM provider instances.
It encapsulates the logic of reading configuration and instantiating
the appropriate provider classes.

Benefits:
- Separates provider creation from usage
- Makes it easy to test provider creation logic
- Allows configuration injection for testing
"""

from typing import Optional
import structlog

from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig
from app.llm_proxy.providers.openai_provider import OpenAIProvider
from app.llm_proxy.providers.anthropic_provider import AnthropicProvider

logger = structlog.get_logger()


class ProviderFactory:
    """
    Factory for creating LLM provider instances.
    
    This class encapsulates all the logic for reading configuration
    and creating provider instances. It can be used with real settings
    or with mock settings for testing.
    
    Example (Production):
        >>> from app.core.config import settings
        >>> factory = ProviderFactory(settings)
        >>> providers = factory.create_all_providers()
    
    Example (Testing):
        >>> mock_settings = MockSettings(OPENAI_API_KEY="test-key")
        >>> factory = ProviderFactory(mock_settings)
        >>> providers = factory.create_all_providers()
        >>> assert "openai" in providers
    """
    
    def __init__(self, settings):
        """
        Initialize the factory with settings.
        
        Args:
            settings: Configuration object with API keys and settings.
                      Can be the real settings or a mock for testing.
        """
        self.settings = settings
    
    def create_all_providers(self) -> dict[str, BaseLLMProvider]:
        """
        Create all available providers based on configuration.
        
        This method checks which API keys are available and creates
        the corresponding provider instances.
        
        Returns:
            Dictionary mapping provider names to provider instances.
        """
        providers = {}
        
        # OpenAI
        openai_provider = self.create_openai_provider()
        if openai_provider:
            providers["openai"] = openai_provider
        
        # Anthropic
        anthropic_provider = self.create_anthropic_provider()
        if anthropic_provider:
            providers["anthropic"] = anthropic_provider
        
        # Google
        google_provider = self.create_google_provider()
        if google_provider:
            providers["google"] = google_provider
        
        # Groq
        groq_provider = self.create_groq_provider()
        if groq_provider:
            providers["groq"] = groq_provider
        
        # Ollama (always created but disabled by default)
        ollama_provider = self.create_ollama_provider()
        if ollama_provider:
            providers["ollama"] = ollama_provider
        
        # OpenRouter
        openrouter_provider = self.create_openrouter_provider()
        if openrouter_provider:
            providers["openrouter"] = openrouter_provider
        
        # Z.AI
        zai_provider = self.create_zai_provider()
        if zai_provider:
            providers["zai"] = zai_provider
        
        enabled_count = len([p for p in providers.values() if p.enabled])
        logger.info(
            "Provider factory created providers",
            total=len(providers),
            enabled=enabled_count
        )
        
        return providers
    
    def create_openai_provider(self) -> Optional[OpenAIProvider]:
        """Create OpenAI provider if API key is available."""
        api_key = getattr(self.settings, 'OPENAI_API_KEY', None)
        if not api_key:
            return None
        
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key=api_key,
            base_url=getattr(self.settings, 'OPENAI_BASE_URL', None),
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
            enabled=True
        )
        
        logger.info("OpenAI provider created")
        return OpenAIProvider(config)
    
    def create_anthropic_provider(self) -> Optional[AnthropicProvider]:
        """Create Anthropic provider if API key is available."""
        api_key = getattr(self.settings, 'ANTHROPIC_API_KEY', None)
        if not api_key:
            return None
        
        config = ProviderConfig(
            name="Anthropic",
            type="anthropic",
            api_key=api_key,
            base_url=getattr(self.settings, 'ANTHROPIC_BASE_URL', None),
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
            enabled=True
        )
        
        logger.info("Anthropic provider created")
        return AnthropicProvider(config)
    
    def create_google_provider(self) -> Optional[BaseLLMProvider]:
        """Create Google provider if API key is available."""
        api_key = getattr(self.settings, 'GOOGLE_API_KEY', None)
        if not api_key:
            return None
        
        # Import here to avoid circular imports
        from app.llm_proxy.providers.google_provider import GoogleProvider
        
        config = ProviderConfig(
            name="Google",
            type="google",
            api_key=api_key,
            models=["gemini-pro", "gemini-pro-vision"],
            cost_per_1k_tokens={
                "gemini-pro": 0.0005,
                "gemini-pro-vision": 0.0005
            },
            max_tokens={
                "gemini-pro": 32000,
                "gemini-pro-vision": 16000
            },
            capabilities=["planning", "analysis", "simple"],
            enabled=True
        )
        
        logger.info("Google provider created")
        return GoogleProvider(config)
    
    def create_groq_provider(self) -> Optional[BaseLLMProvider]:
        """Create Groq provider if API key is available."""
        api_key = getattr(self.settings, 'GROQ_API_KEY', None)
        if not api_key:
            return None
        
        # Import here to avoid circular imports
        from app.llm_proxy.providers.groq_provider import GroqProvider
        
        config = ProviderConfig(
            name="Groq",
            type="groq",
            api_key=api_key,
            base_url=getattr(self.settings, 'GROQ_BASE_URL', None),
            models=["llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
            cost_per_1k_tokens={
                "llama-3.1-70b-versatile": 0.0005,
                "mixtral-8x7b-32768": 0.0002
            },
            max_tokens={
                "llama-3.1-70b-versatile": 8192,
                "mixtral-8x7b-32768": 32768
            },
            capabilities=["code_generation", "analysis", "simple", "decision"],
            enabled=True
        )
        
        logger.info("Groq provider created")
        return GroqProvider(config)
    
    def create_ollama_provider(self) -> Optional[BaseLLMProvider]:
        """Create Ollama provider (disabled by default)."""
        # Import here to avoid circular imports
        from app.llm_proxy.providers.ollama_provider import OllamaProvider
        
        config = ProviderConfig(
            name="Ollama",
            type="ollama",
            base_url=getattr(self.settings, 'OLLAMA_BASE_URL', 'http://localhost:11434'),
            models=["llama3", "codellama", "mistral"],
            cost_per_1k_tokens={
                "llama3": 0.0,
                "codellama": 0.0,
                "mistral": 0.0
            },
            max_tokens={
                "llama3": 8192,
                "codellama": 16384,
                "mistral": 8192
            },
            capabilities=["code_generation", "simple"],
            enabled=False  # Disabled by default
        )
        
        logger.info("Ollama provider created (disabled)")
        return OllamaProvider(config)
    
    def create_openrouter_provider(self) -> Optional[BaseLLMProvider]:
        """Create OpenRouter provider if API key is available."""
        api_key = getattr(self.settings, 'OPENROUTER_API_KEY', None)
        if not api_key:
            return None
        
        # Import here to avoid circular imports
        from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider
        
        config = ProviderConfig(
            name="OpenRouter",
            type="openrouter",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            models=[
                "openai/gpt-4o",
                "openai/gpt-4o-mini",
                "anthropic/claude-3.5-sonnet",
                "google/gemini-flash-1.5",
                "meta-llama/llama-3.1-70b-instruct"
            ],
            cost_per_1k_tokens={
                "openai/gpt-4o": 0.005,
                "openai/gpt-4o-mini": 0.0002,
                "anthropic/claude-3.5-sonnet": 0.003,
                "google/gemini-flash-1.5": 0.00008,
                "meta-llama/llama-3.1-70b-instruct": 0.0005
            },
            max_tokens={
                "openai/gpt-4o": 128000,
                "openai/gpt-4o-mini": 128000,
                "anthropic/claude-3.5-sonnet": 200000,
                "google/gemini-flash-1.5": 1000000,
                "meta-llama/llama-3.1-70b-instruct": 131072
            },
            capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
            enabled=True
        )
        
        logger.info("OpenRouter provider created")
        return OpenRouterProvider(config)
    
    def create_zai_provider(self) -> Optional[BaseLLMProvider]:
        """Create Z.AI provider if API key is available."""
        api_key = getattr(self.settings, 'ZAI_API_KEY', None)
        if not api_key:
            return None
        
        # Import here to avoid circular imports
        from app.llm_proxy.providers.zai_provider import ZAIProvider
        
        use_coding = getattr(self.settings, 'ZAI_USE_CODING_ENDPOINT', False)
        base_url = (
            "https://api.z.ai/api/coding/paas/v4" if use_coding
            else "https://api.z.ai/api/paas/v4"
        )
        
        config = ProviderConfig(
            name="Z.AI",
            type="zai",
            api_key=api_key,
            base_url=base_url,
            models=["glm-4.7", "glm-4.6", "glm-4.5", "glm-4-flash"],
            cost_per_1k_tokens={
                "glm-4.7": 0.001,
                "glm-4.6": 0.001,
                "glm-4.5": 0.001,
                "glm-4-flash": 0.0
            },
            max_tokens={
                "glm-4.7": 200000,
                "glm-4.6": 200000,
                "glm-4.5": 200000,
                "glm-4-flash": 128000
            },
            capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
            enabled=True
        )
        
        logger.info(f"Z.AI provider created (endpoint: {base_url})")
        return ZAIProvider(config)


# =============================================================================
# Convenience function for creating providers from settings
# =============================================================================

def create_providers_from_settings(settings=None) -> dict[str, BaseLLMProvider]:
    """
    Create all providers from settings.
    
    This is a convenience function that creates a ProviderFactory
    and returns all available providers.
    
    Args:
        settings: Optional settings object. If not provided, uses app settings.
    
    Returns:
        Dictionary mapping provider names to provider instances.
    """
    if settings is None:
        from app.core.config import settings
    
    factory = ProviderFactory(settings)
    return factory.create_all_providers()
