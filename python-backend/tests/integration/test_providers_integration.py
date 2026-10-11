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
from types import SimpleNamespace

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.factory import ProviderFactory


def make_provider_factory(**overrides):
    """Build the current settings-backed factory with synthetic credentials."""
    values = {
        "OPENAI_API_KEY": "test-openai-key",
        "ANTHROPIC_API_KEY": "test-anthropic-key",
        "GOOGLE_API_KEY": "test-google-key",
        "GROQ_API_KEY": "test-groq-key",
        "OPENROUTER_API_KEY": "test-openrouter-key",
        "ZAI_API_KEY": "test-zai-key",
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "KILOCODE_API_KEY": None,
    }
    values.update(overrides)
    return ProviderFactory(SimpleNamespace(**values))


def create_test_providers():
    return make_provider_factory().create_all_providers()


# =============================================================================
# Provider Factory Tests
# =============================================================================

class TestProviderFactory:
    """Test provider factory functionality."""
    
    def test_create_openai_provider(self):
        """Test creating OpenAI provider."""
        provider = make_provider_factory().create_openai_provider()
        
        assert provider is not None
        assert provider.type == "openai"
        assert provider.name == "OpenAI"
    
    def test_create_anthropic_provider(self):
        """Test creating Anthropic provider."""
        provider = make_provider_factory().create_anthropic_provider()
        
        assert provider is not None
        assert provider.type == "anthropic"
        assert provider.name == "Anthropic"
    
    def test_create_google_provider(self):
        """Test creating Google provider."""
        provider = make_provider_factory().create_google_provider()
        
        assert provider is not None
        assert provider.type == "google"
        assert provider.name == "Google"
    
    def test_create_groq_provider(self):
        """Test creating Groq provider."""
        provider = make_provider_factory().create_groq_provider()
        
        assert provider is not None
        assert provider.type == "groq"
        assert provider.name == "Groq"
    
    def test_create_ollama_provider(self):
        """Test creating Ollama provider."""
        provider = make_provider_factory().create_ollama_provider()
        
        assert provider is not None
        assert provider.type == "ollama"
        assert provider.name == "Ollama"
    
    def test_create_zai_provider(self):
        """Test creating Z.AI provider."""
        provider = make_provider_factory().create_zai_provider()
        
        assert provider is not None
        assert provider.type == "zai"
        assert provider.name == "Z.AI"
    
    def test_create_openrouter_provider(self):
        """Test creating OpenRouter provider."""
        provider = make_provider_factory().create_openrouter_provider()
        
        assert provider is not None
        assert provider.type == "openrouter"
        assert provider.name == "OpenRouter"
    
    def test_create_unknown_provider(self):
        """The settings-backed factory only creates registered providers."""
        providers = create_test_providers()

        assert "unknown" not in providers


class TestProviderSelection:
    """Test provider selection logic."""
    
    def test_select_provider_by_task_type(self):
        """Test selecting provider based on task type."""
        providers = create_test_providers()

        assert "planning" in providers["openai"].config.capabilities
        assert "code_generation" in providers["openai"].config.capabilities
        assert "analysis" in providers["anthropic"].config.capabilities
        assert "planning" in providers["google"].config.capabilities
        assert "code_generation" not in providers["google"].config.capabilities
    
    def test_select_provider_by_budget(self):
        """Test selecting provider based on budget."""
        # High-quality providers are more expensive
        providers = create_test_providers()

        openai_config = providers["openai"].config
        ollama_config = providers["ollama"].config

        assert all(cost == 0.0 for cost in ollama_config.cost_per_1k_tokens.values())
        assert openai_config.cost_per_1k_tokens["gpt-4"] > 0


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
        """Test that provider-specific capabilities match configured contracts."""
        providers = create_test_providers()
        expected = {
            "openai": {"planning", "code_generation", "analysis", "decision", "simple"},
            "anthropic": {"planning", "code_generation", "analysis", "decision", "simple"},
            "google": {"planning", "analysis", "simple"},
            "groq": {"code_generation", "analysis", "decision", "simple"},
            "zai": {"planning", "code_generation", "analysis", "decision", "simple"},
            "openrouter": {"planning", "code_generation", "analysis", "decision", "simple"},
        }

        for name, capabilities in expected.items():
            assert set(providers[name].config.capabilities) == capabilities


class TestProviderCostComparison:
    """Test provider cost comparison."""
    
    def test_compare_provider_costs(self):
        """Test comparing costs across providers."""
        # Get cost for similar token count across providers
        token_count = 1000
        
        providers = create_test_providers()
        openai_cost = providers["openai"].config.cost_per_1k_tokens["gpt-4"]
        anthropic_cost = providers["anthropic"].config.cost_per_1k_tokens[
            "claude-3-opus-20240229"
        ]
        groq_cost = providers["groq"].config.cost_per_1k_tokens[
            "llama-3.1-70b-versatile"
        ]
        ollama_cost = providers["ollama"].config.cost_per_1k_tokens["llama3"]

        assert ollama_cost == 0
        assert openai_cost > 0
        assert anthropic_cost > 0
        assert groq_cost >= 0


class TestProviderModelSupport:
    """Test provider model support."""
    
    def test_provider_has_models(self):
        """Test that providers have models configured."""
        providers = create_test_providers()
        expected_models = {
            "openai": ["gpt-4", "gpt-4-turbo"],
            "anthropic": ["claude-3-opus-20240229"],
            "google": ["gemini-pro"],
            "groq": ["llama-3.1-70b-versatile"],
            "zai": ["glm-4.7"],
            "openrouter": ["openai/gpt-4o"],
        }

        for name, models in expected_models.items():
            config = providers[name].config
            for model in models:
                assert model in config.models, f"{config.name} missing {model}"


class TestProviderConfigValidation:
    """Test provider configuration validation."""
    
    def test_config_requires_api_key(self):
        """Test that most providers require API key."""
        factory = make_provider_factory(
            OPENAI_API_KEY="synthetic-openai-key",
            ANTHROPIC_API_KEY="synthetic-anthropic-key",
        )
        providers = factory.create_all_providers()
        assert providers["openai"].api_key == "synthetic-openai-key"
        assert providers["anthropic"].api_key == "synthetic-anthropic-key"
    
    def test_ollama_no_api_key(self):
        """Test that Ollama doesn't require API key."""
        ollama = create_test_providers()["ollama"]
        assert ollama.api_key is None
    
    def test_config_enabled_flag(self):
        """Test provider enabled flag."""
        providers = create_test_providers()
        assert providers["openai"].enabled is True
        assert providers["ollama"].enabled is False
