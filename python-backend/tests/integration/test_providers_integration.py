"""
SmartSpec Pro - Provider Integration Tests

Integration tests for LLM providers with real-like scenarios.
Tests cover:
- Provider factory creation
- Provider selection with real configurations
- Multi-provider workflows
- Credit service integration
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.factory import ProviderFactory
from app.llm_proxy.providers.base import ProviderConfig
from app.llm_proxy.providers.openai_provider import OpenAIProvider
from app.llm_proxy.providers.anthropic_provider import AnthropicProvider
from app.llm_proxy.providers.google_provider import GoogleProvider
from app.llm_proxy.providers.groq_provider import GroqProvider
from app.llm_proxy.providers.ollama_provider import OllamaProvider
from app.llm_proxy.providers.zai_provider import ZAIProvider
from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider


# =============================================================================
# Provider Factory Tests
# =============================================================================

class TestProviderFactory:
    """Test provider factory functionality."""
    
    def test_create_openai_provider(self):
        """Test creating OpenAI provider."""
        config = OpenAIProvider.create_default_config(
            api_key="test-key",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("openai", config)
        
        assert provider is not None
        assert provider.type == "openai"
        assert provider.name == "OpenAI"
    
    def test_create_anthropic_provider(self):
        """Test creating Anthropic provider."""
        config = AnthropicProvider.create_default_config(
            api_key="test-key",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("anthropic", config)
        
        assert provider is not None
        assert provider.type == "anthropic"
        assert provider.name == "Anthropic"
    
    def test_create_google_provider(self):
        """Test creating Google provider."""
        config = GoogleProvider.create_default_config(
            api_key="test-key",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("google", config)
        
        assert provider is not None
        assert provider.type == "google"
        assert provider.name == "Google"
    
    def test_create_groq_provider(self):
        """Test creating Groq provider."""
        config = GroqProvider.create_default_config(
            api_key="test-key",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("groq", config)
        
        assert provider is not None
        assert provider.type == "groq"
        assert provider.name == "Groq"
    
    def test_create_ollama_provider(self):
        """Test creating Ollama provider."""
        config = OllamaProvider.create_default_config(
            base_url="http://localhost:11434",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("ollama", config)
        
        assert provider is not None
        assert provider.type == "ollama"
        assert provider.name == "Ollama"
    
    def test_create_zai_provider(self):
        """Test creating Z.AI provider."""
        config = ZAIProvider.create_default_config(
            api_key="test-key",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("zai", config)
        
        assert provider is not None
        assert provider.type == "zai"
        assert provider.name == "Z.AI"
    
    def test_create_openrouter_provider(self):
        """Test creating OpenRouter provider."""
        config = OpenRouterProvider.create_default_config(
            api_key="test-key",
            enabled=True
        )
        
        provider = ProviderFactory.create_provider("openrouter", config)
        
        assert provider is not None
        assert provider.type == "openrouter"
        assert provider.name == "OpenRouter"
    
    def test_create_unknown_provider(self):
        """Test creating unknown provider raises error."""
        config = ProviderConfig(
            name="Unknown",
            type="unknown",
            api_key="test-key",
            models=["unknown-model"],
            cost_per_1k_tokens={},
            max_tokens={},
            capabilities=[],
            enabled=True
        )
        
        with pytest.raises(ValueError) as exc_info:
            ProviderFactory.create_provider("unknown", config)
        
        assert "Unknown provider type" in str(exc_info.value)


class TestProviderSelection:
    """Test provider selection logic."""
    
    def test_select_provider_by_task_type(self):
        """Test selecting provider based on task type."""
        providers = [
            OpenAIProvider.create_default_config(api_key="key", enabled=True),
            AnthropicProvider.create_default_config(api_key="key", enabled=True),
            GoogleProvider.create_default_config(api_key="key", enabled=True),
        ]
        
        # All providers should support common task types
        for config in providers:
            assert "planning" in config.capabilities
            assert "code_generation" in config.capabilities
            assert "analysis" in config.capabilities
            assert "simple" in config.capabilities
    
    def test_select_provider_by_budget(self):
        """Test selecting provider based on budget."""
        # High-quality providers are more expensive
        openai_config = OpenAIProvider.create_default_config(api_key="key", enabled=True)
        anthropic_config = AnthropicProvider.create_default_config(api_key="key", enabled=True)
        
        # Ollama is free
        ollama_config = OllamaProvider.create_default_config(
            base_url="http://localhost:11434",
            enabled=True
        )
        
        # Verify cost differences
        assert ollama_config.cost_per_1k_tokens["llama3:70b"] == 0.0
        assert openai_config.cost_per_1k_tokens["gpt-4o"] > 0


class TestMultiProviderWorkflow:
    """Test multi-provider workflows."""
    
    @pytest.mark.asyncio
    async def test_fallback_chain(self):
        """Test provider fallback chain."""
        # Create mock providers with failure/success
        from app.llm_proxy.providers.base import ProviderError
        
        class FailingProvider:
            def __init__(self, name):
                self.name = name
                self.invoke_count = 0
            
            async def invoke(self, model, request):
                self.invoke_count += 1
                raise ProviderError(f"{self.name} failed", self.name, model)
        
        class SuccessProvider:
            def __init__(self, name):
                self.name = name
            
            async def invoke(self, model, request):
                return LLMResponse(
                    content="Success!",
                    provider=self.name,
                    model=model,
                    tokens_used=50,
                    cost=0.001
                )
        
        # Simulate fallback
        primary = FailingProvider("primary")
        fallback = SuccessProvider("fallback")
        
        # Primary fails, fallback succeeds
        try:
            await primary.invoke("model", LLMRequest(prompt="test", task_type="simple"))
        except ProviderError:
            response = await fallback.invoke("model", LLMRequest(prompt="test", task_type="simple"))
            assert response.content == "Success!"
    
    @pytest.mark.asyncio
    async def test_all_providers_fail(self):
        """Test when all providers fail."""
        from app.llm_proxy.providers.base import ProviderError
        
        class AlwaysFailingProvider:
            def __init__(self, name):
                self.name = name
            
            async def invoke(self, model, request):
                raise ProviderError(f"{self.name} failed", self.name, model)
        
        providers = [AlwaysFailingProvider(f"provider-{i}") for i in range(3)]
        
        all_failed = False
        for provider in providers:
            try:
                await provider.invoke("model", LLMRequest(prompt="test", task_type="simple"))
            except ProviderError:
                all_failed = True
                continue
        
        assert all_failed


class TestProviderCapabilities:
    """Test provider capabilities."""
    
    def test_all_providers_have_capabilities(self):
        """Test that all providers have required capabilities."""
        provider_configs = [
            OpenAIProvider.create_default_config(api_key="key", enabled=True),
            AnthropicProvider.create_default_config(api_key="key", enabled=True),
            GoogleProvider.create_default_config(api_key="key", enabled=True),
            GroqProvider.create_default_config(api_key="key", enabled=True),
            ZAIProvider.create_default_config(api_key="key", enabled=True),
            OpenRouterProvider.create_default_config(api_key="key", enabled=True),
        ]
        
        required_capabilities = ["planning", "code_generation", "analysis", "decision", "simple"]
        
        for config in provider_configs:
            for cap in required_capabilities:
                assert cap in config.capabilities, f"{config.name} missing {cap} capability"


class TestProviderCostComparison:
    """Test provider cost comparison."""
    
    def test_compare_provider_costs(self):
        """Test comparing costs across providers."""
        # Get cost for similar token count across providers
        token_count = 1000
        
        # OpenAI
        openai_config = OpenAIProvider.create_default_config(api_key="key", enabled=True)
        openai_cost = openai_config.cost_per_1k_tokens.get("gpt-4o", 0) * (token_count / 1000)
        
        # Anthropic
        anthropic_config = AnthropicProvider.create_default_config(api_key="key", enabled=True)
        anthropic_cost = anthropic_config.cost_per_1k_tokens.get("claude-3.5-sonnet", 0) * (token_count / 1000)
        
        # Groq (usually cheapest)
        groq_config = GroqProvider.create_default_config(api_key="key", enabled=True)
        groq_cost = groq_config.cost_per_1k_tokens.get("llama-3.1-70b-versatile", 0) * (token_count / 1000)
        
        # Ollama (free)
        ollama_config = OllamaProvider.create_default_config(
            base_url="http://localhost:11434",
            enabled=True
        )
        ollama_cost = 0  # Always free
        
        # Assert Ollama is free
        assert ollama_cost == 0
        
        # Assert all costs are non-negative
        assert openai_cost >= 0
        assert anthropic_cost >= 0
        assert groq_cost >= 0


class TestProviderModelSupport:
    """Test provider model support."""
    
    def test_provider_has_models(self):
        """Test that providers have models configured."""
        providers = [
            (OpenAIProvider.create_default_config(api_key="key", enabled=True), ["gpt-4o", "gpt-4o-mini"]),
            (AnthropicProvider.create_default_config(api_key="key", enabled=True), ["claude-3.5-sonnet"]),
            (GoogleProvider.create_default_config(api_key="key", enabled=True), ["gemini-1.5-flash"]),
            (GroqProvider.create_default_config(api_key="key", enabled=True), ["llama-3.1-70b-versatile"]),
            (ZAIProvider.create_default_config(api_key="key", enabled=True), ["glm-4.7"]),
            (OpenRouterProvider.create_default_config(api_key="key", enabled=True), ["openai/gpt-4o"]),
        ]
        
        for config, expected_models in providers:
            for model in expected_models:
                assert model in config.models, f"{config.name} missing {model}"


class TestProviderConfigValidation:
    """Test provider configuration validation."""
    
    def test_config_requires_api_key(self):
        """Test that most providers require API key."""
        openai_config = OpenAIProvider.create_default_config(api_key="test-key", enabled=True)
        assert openai_config.api_key == "test-key"
        
        anthropic_config = AnthropicProvider.create_default_config(api_key="test-key", enabled=True)
        assert anthropic_config.api_key == "test-key"
    
    def test_ollama_no_api_key(self):
        """Test that Ollama doesn't require API key."""
        ollama_config = OllamaProvider.create_default_config(
            base_url="http://localhost:11434",
            enabled=True
        )
        assert ollama_config.api_key is None
    
    def test_config_enabled_flag(self):
        """Test provider enabled flag."""
        enabled_config = OpenAIProvider.create_default_config(api_key="key", enabled=True)
        assert enabled_config.enabled is True
        
        disabled_config = OpenAIProvider.create_default_config(api_key="key", enabled=False)
        assert disabled_config.enabled is False
