"""
SmartSpec Pro - LLM Proxy V2 Tests
Demonstrating Testing with Dependency Injection

This test file shows how the refactored LLMProxy can be tested
without mocking external APIs. Instead, we inject mock providers
that simulate the behavior we want to test.

Key Testing Patterns:
1. Mock providers are injected directly into LLMProxyV2
2. No need to patch external libraries (openai, anthropic, etc.)
3. Each test is isolated and fast
4. Full coverage of all code paths is achievable
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from dataclasses import dataclass

from app.llm_proxy.models import LLMRequest, LLMResponse, LLMUsageStats
from app.llm_proxy.proxy_v2 import LLMProxyV2, LLMProviderError
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError


# =============================================================================
# Mock Provider for Testing
# =============================================================================

class MockProvider(BaseLLMProvider):
    """
    Mock provider for testing LLMProxyV2.
    
    This provider can be configured to return specific responses
    or raise specific errors, making it easy to test all code paths.
    """
    
    def __init__(
        self,
        name: str = "mock",
        type: str = "mock",
        models: list[str] = None,
        capabilities: list[str] = None,
        enabled: bool = True,
        response_content: str = "Mock response",
        response_tokens: int = 100,
        should_fail: bool = False,
        error_message: str = "Mock error"
    ):
        config = ProviderConfig(
            name=name,
            type=type,
            api_key="mock-key",
            models=models or ["mock-model"],
            cost_per_1k_tokens={"mock-model": 0.001},
            max_tokens={"mock-model": 4096},
            capabilities=capabilities or ["simple", "planning", "code_generation"],
            enabled=enabled
        )
        super().__init__(config)
        
        self.response_content = response_content
        self.response_tokens = response_tokens
        self.should_fail = should_fail
        self.error_message = error_message
        
        # Track invocations for assertions
        self.invoke_count = 0
        self.last_model = None
        self.last_request = None
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        """Mock invoke that returns configured response or raises error."""
        self.invoke_count += 1
        self.last_model = model
        self.last_request = request
        
        if self.should_fail:
            raise ProviderError(
                message=self.error_message,
                provider=self.type,
                model=model
            )
        
        return LLMResponse(
            content=self.response_content,
            provider=self.type,
            model=model,
            tokens_used=self.response_tokens,
            cost=0.0,
            latency_ms=0,
            finish_reason="stop"
        )


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def mock_openai_provider():
    """Create a mock OpenAI provider."""
    return MockProvider(
        name="OpenAI",
        type="openai",
        models=["gpt-4", "gpt-3.5-turbo"],
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
        response_content="OpenAI response"
    )


@pytest.fixture
def mock_anthropic_provider():
    """Create a mock Anthropic provider."""
    return MockProvider(
        name="Anthropic",
        type="anthropic",
        models=["claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
        response_content="Anthropic response"
    )


@pytest.fixture
def mock_groq_provider():
    """Create a mock Groq provider."""
    return MockProvider(
        name="Groq",
        type="groq",
        models=["llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
        capabilities=["code_generation", "analysis", "simple", "decision"],
        response_content="Groq response"
    )


@pytest.fixture
def proxy_with_mocks(mock_openai_provider, mock_anthropic_provider, mock_groq_provider):
    """Create LLMProxyV2 with mock providers."""
    providers = {
        "openai": mock_openai_provider,
        "anthropic": mock_anthropic_provider,
        "groq": mock_groq_provider
    }
    return LLMProxyV2(providers)


# =============================================================================
# Test Classes
# =============================================================================

class TestLLMProxyV2Initialization:
    """Test LLMProxyV2 initialization with dependency injection."""
    
    def test_init_with_injected_providers(self, mock_openai_provider):
        """Test that providers can be injected."""
        proxy = LLMProxyV2({"openai": mock_openai_provider})
        
        assert "openai" in proxy.providers
        assert proxy.providers["openai"] == mock_openai_provider
    
    def test_init_with_multiple_providers(self, proxy_with_mocks):
        """Test initialization with multiple providers."""
        assert len(proxy_with_mocks.providers) == 3
        assert "openai" in proxy_with_mocks.providers
        assert "anthropic" in proxy_with_mocks.providers
        assert "groq" in proxy_with_mocks.providers
    
    def test_usage_stats_initialized(self, proxy_with_mocks):
        """Test that usage stats are initialized."""
        stats = proxy_with_mocks.get_usage_stats()
        
        assert stats.total_requests == 0
        assert stats.total_tokens == 0
        assert stats.total_cost == 0.0


class TestProviderSelection:
    """Test provider selection logic."""
    
    def test_select_user_preferred_provider(self, proxy_with_mocks, mock_openai_provider):
        """Test that user-preferred provider is selected."""
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        provider_name, model_name = proxy_with_mocks.select_provider(request)
        
        assert provider_name == "openai"
        assert model_name == "gpt-4"
    
    def test_select_from_map_for_planning_quality(self, proxy_with_mocks):
        """Test selection for planning with quality priority."""
        request = LLMRequest(
            prompt="Test",
            task_type="planning",
            budget_priority="quality"
        )
        
        provider_name, model_name = proxy_with_mocks.select_provider(request)
        
        # Should select OpenAI gpt-4 for planning/quality
        assert provider_name == "openai"
        assert model_name == "gpt-4"
    
    def test_select_from_map_for_code_generation_quality(self, proxy_with_mocks):
        """Test selection for code generation with quality priority."""
        request = LLMRequest(
            prompt="Test",
            task_type="code_generation",
            budget_priority="quality"
        )
        
        provider_name, model_name = proxy_with_mocks.select_provider(request)
        
        # Should select Anthropic claude-3-sonnet for code_generation/quality
        assert provider_name == "anthropic"
        assert model_name == "claude-3-sonnet-20240229"
    
    def test_fallback_when_preferred_unavailable(self, mock_openai_provider):
        """Test fallback when preferred provider is unavailable."""
        # Only OpenAI is available
        proxy = LLMProxyV2({"openai": mock_openai_provider})
        
        request = LLMRequest(
            prompt="Test",
            task_type="code_generation",
            budget_priority="quality"
            # This would normally select Anthropic, but it's not available
        )
        
        provider_name, model_name = proxy.select_provider(request)
        
        # Should fallback to OpenAI
        assert provider_name == "openai"
    
    def test_fallback_to_any_enabled_provider(self, mock_groq_provider):
        """Test fallback to any enabled provider when no capability match."""
        # Only Groq is available, and it doesn't have "planning" in capabilities
        mock_groq_provider.config.capabilities = ["simple"]  # Remove planning
        proxy = LLMProxyV2({"groq": mock_groq_provider})
        
        request = LLMRequest(
            prompt="Test",
            task_type="planning",  # Groq doesn't have this capability
            budget_priority="quality"
        )
        
        provider_name, model_name = proxy.select_provider(request)
        
        # Should fallback to Groq as last resort
        assert provider_name == "groq"
    
    def test_error_when_no_providers_available(self):
        """Test error when no providers are available."""
        proxy = LLMProxyV2({})
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple"
        )
        
        with pytest.raises(RuntimeError, match="No enabled LLM providers available"):
            proxy.select_provider(request)
    
    def test_disabled_provider_not_selected(self, mock_openai_provider, mock_anthropic_provider):
        """Test that disabled providers are not selected."""
        mock_openai_provider.disable()  # Disable OpenAI
        
        proxy = LLMProxyV2({
            "openai": mock_openai_provider,
            "anthropic": mock_anthropic_provider
        })
        
        request = LLMRequest(
            prompt="Test",
            task_type="planning",
            budget_priority="quality"
            # Would normally select OpenAI, but it's disabled
        )
        
        provider_name, model_name = proxy.select_provider(request)
        
        # Should not select disabled OpenAI
        assert provider_name != "openai"
        assert provider_name == "anthropic"


class TestInvocation:
    """Test LLM invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self, proxy_with_mocks, mock_openai_provider):
        """Test successful invocation."""
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        response = await proxy_with_mocks.invoke(request)
        
        assert response.content == "OpenAI response"
        assert response.provider == "openai"
        assert response.model == "gpt-4"
        assert response.tokens_used == 100
        assert mock_openai_provider.invoke_count == 1
    
    @pytest.mark.asyncio
    async def test_invoke_updates_usage_stats(self, proxy_with_mocks):
        """Test that invocation updates usage stats."""
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        await proxy_with_mocks.invoke(request)
        
        stats = proxy_with_mocks.get_usage_stats()
        assert stats.total_requests == 1
        assert stats.total_tokens == 100
        assert stats.requests_by_provider["openai"] == 1
        assert stats.requests_by_task_type["simple"] == 1
    
    @pytest.mark.asyncio
    async def test_invoke_error_handling(self, mock_openai_provider):
        """Test error handling during invocation."""
        mock_openai_provider.should_fail = True
        mock_openai_provider.error_message = "API Error"
        
        proxy = LLMProxyV2({"openai": mock_openai_provider})
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        with pytest.raises(ProviderError, match="API Error"):
            await proxy.invoke(request)
    
    @pytest.mark.asyncio
    async def test_invoke_calculates_cost(self):
        """Test that cost is calculated correctly."""
        # Create provider with specific cost configuration
        provider = MockProvider(
            name="OpenAI",
            type="openai",
            models=["gpt-4"],
            response_tokens=1000
        )
        # Set cost per 1k tokens for gpt-4
        provider.config.cost_per_1k_tokens = {"gpt-4": 0.03}
        
        proxy = LLMProxyV2({"openai": provider})
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        response = await proxy.invoke(request)
        
        # Cost should be (1000/1000) * 0.03 = 0.03
        assert response.cost == pytest.approx(0.03, rel=0.01)


class TestProviderManagement:
    """Test provider enable/disable functionality."""
    
    def test_enable_provider(self, proxy_with_mocks, mock_openai_provider):
        """Test enabling a provider."""
        mock_openai_provider.disable()
        assert not mock_openai_provider.enabled
        
        proxy_with_mocks.enable_provider("openai")
        
        assert mock_openai_provider.enabled
    
    def test_disable_provider(self, proxy_with_mocks, mock_openai_provider):
        """Test disabling a provider."""
        assert mock_openai_provider.enabled
        
        proxy_with_mocks.disable_provider("openai")
        
        assert not mock_openai_provider.enabled
    
    def test_get_providers(self, proxy_with_mocks):
        """Test getting list of providers."""
        providers = proxy_with_mocks.get_providers()
        
        assert len(providers) == 3
        assert all(isinstance(p, BaseLLMProvider) for p in providers)


class TestUsageStatistics:
    """Test usage statistics tracking."""
    
    @pytest.mark.asyncio
    async def test_multiple_invocations_accumulate_stats(self, proxy_with_mocks):
        """Test that multiple invocations accumulate stats."""
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        await proxy_with_mocks.invoke(request)
        await proxy_with_mocks.invoke(request)
        await proxy_with_mocks.invoke(request)
        
        stats = proxy_with_mocks.get_usage_stats()
        assert stats.total_requests == 3
        assert stats.total_tokens == 300  # 100 tokens per request
        assert stats.requests_by_provider["openai"] == 3
    
    @pytest.mark.asyncio
    async def test_stats_by_task_type(self, proxy_with_mocks):
        """Test stats are tracked by task type."""
        request1 = LLMRequest(prompt="Test", task_type="simple", preferred_provider="openai", preferred_model="gpt-4")
        request2 = LLMRequest(prompt="Test", task_type="planning", preferred_provider="openai", preferred_model="gpt-4")
        
        await proxy_with_mocks.invoke(request1)
        await proxy_with_mocks.invoke(request1)
        await proxy_with_mocks.invoke(request2)
        
        stats = proxy_with_mocks.get_usage_stats()
        assert stats.requests_by_task_type["simple"] == 2
        assert stats.requests_by_task_type["planning"] == 1


# =============================================================================
# Test Provider Factory
# =============================================================================

class TestProviderFactory:
    """Test ProviderFactory with mock settings."""
    
    def test_factory_creates_openai_when_key_exists(self):
        """Test factory creates OpenAI provider when API key is set."""
        from app.llm_proxy.providers.factory import ProviderFactory
        
        # Create mock settings
        class MockSettings:
            OPENAI_API_KEY = "test-key"
            OPENAI_BASE_URL = None
            ANTHROPIC_API_KEY = None
            GOOGLE_API_KEY = None
            GROQ_API_KEY = None
            OLLAMA_BASE_URL = "http://localhost:11434"
            OPENROUTER_API_KEY = None
            ZAI_API_KEY = None
        
        factory = ProviderFactory(MockSettings())
        providers = factory.create_all_providers()
        
        assert "openai" in providers
        assert "anthropic" not in providers
        assert providers["openai"].name == "OpenAI"
    
    def test_factory_creates_multiple_providers(self):
        """Test factory creates multiple providers when keys are set."""
        from app.llm_proxy.providers.factory import ProviderFactory
        
        class MockSettings:
            OPENAI_API_KEY = "openai-key"
            OPENAI_BASE_URL = None
            ANTHROPIC_API_KEY = "anthropic-key"
            ANTHROPIC_BASE_URL = None
            GOOGLE_API_KEY = None
            GROQ_API_KEY = None
            OLLAMA_BASE_URL = "http://localhost:11434"
            OPENROUTER_API_KEY = None
            ZAI_API_KEY = None
        
        factory = ProviderFactory(MockSettings())
        providers = factory.create_all_providers()
        
        assert "openai" in providers
        assert "anthropic" in providers
        assert "ollama" in providers  # Always created but disabled
        assert not providers["ollama"].enabled
    
    def test_factory_ollama_always_disabled(self):
        """Test that Ollama is always created but disabled by default."""
        from app.llm_proxy.providers.factory import ProviderFactory
        
        class MockSettings:
            OPENAI_API_KEY = None
            ANTHROPIC_API_KEY = None
            GOOGLE_API_KEY = None
            GROQ_API_KEY = None
            OLLAMA_BASE_URL = "http://localhost:11434"
            OPENROUTER_API_KEY = None
            ZAI_API_KEY = None
        
        factory = ProviderFactory(MockSettings())
        providers = factory.create_all_providers()
        
        assert "ollama" in providers
        assert not providers["ollama"].enabled


# =============================================================================
# Test Individual Provider Classes
# =============================================================================

class TestOpenAIProvider:
    """Test OpenAI provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_mock_client(self):
        """Test OpenAI provider invoke with injected mock client."""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        from app.llm_proxy.providers.base import ProviderConfig
        
        # Create mock client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.usage.total_tokens = 50
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Create provider with injected client
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key="test-key",
            models=["gpt-4"],
            cost_per_1k_tokens={"gpt-4": 0.03},
            capabilities=["simple"]
        )
        provider = OpenAIProvider(config, client=mock_client)
        
        # Invoke
        request = LLMRequest(prompt="Test", task_type="simple")
        response = await provider.invoke("gpt-4", request)
        
        # Verify
        assert response.content == "Test response"
        assert response.tokens_used == 50
        mock_client.chat.completions.create.assert_called_once()


class TestAnthropicProvider:
    """Test Anthropic provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_mock_client(self):
        """Test Anthropic provider invoke with injected mock client."""
        from app.llm_proxy.providers.anthropic_provider import AnthropicProvider
        from app.llm_proxy.providers.base import ProviderConfig
        
        # Create mock client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = "Claude response"
        mock_response.stop_reason = "end_turn"
        mock_response.usage.input_tokens = 20
        mock_response.usage.output_tokens = 30
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        
        # Create provider with injected client
        config = ProviderConfig(
            name="Anthropic",
            type="anthropic",
            api_key="test-key",
            models=["claude-3-sonnet-20240229"],
            cost_per_1k_tokens={"claude-3-sonnet-20240229": 0.003},
            capabilities=["simple"]
        )
        provider = AnthropicProvider(config, client=mock_client)
        
        # Invoke
        request = LLMRequest(prompt="Test", task_type="simple")
        response = await provider.invoke("claude-3-sonnet-20240229", request)
        
        # Verify
        assert response.content == "Claude response"
        assert response.tokens_used == 50  # 20 + 30
        mock_client.messages.create.assert_called_once()
