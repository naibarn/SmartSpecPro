"""
SmartSpec Pro - LLM Proxy Tests
Updated for LLMProxyV2 with Strategy Pattern and DI

Tests for:
- LLMProxy: Direct provider access
- Provider selection and fallback
- Usage statistics
- Backward compatibility
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy import (
    LLMProxy,
    LLMRequest,
    LLMResponse,
    LLMGateway,
    LLMGatewayV1,
    LLMGatewayV2,
    LLMProviderError,
)
from app.llm_proxy.proxy import LLMProxyV2
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError


# =============================================================================
# Mock Provider for Testing
# =============================================================================

class MockProvider(BaseLLMProvider):
    """Mock provider for testing."""
    
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
        self.invoke_count = 0
    
    async def invoke(self, model: str, request: LLMRequest) -> LLMResponse:
        self.invoke_count += 1
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
# Fixtures
# =============================================================================

@pytest.fixture
def llm_proxy():
    """Create LLM Proxy instance for testing"""
    return LLMProxy()


@pytest.fixture
def mock_llm_proxy():
    """Create LLM Proxy with mock providers"""
    mock_openai = MockProvider(
        name="OpenAI",
        type="openai",
        models=["gpt-4", "gpt-3.5-turbo"],
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"]
    )
    mock_anthropic = MockProvider(
        name="Anthropic",
        type="anthropic",
        models=["claude-3-sonnet-20240229"],
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
        response_content="Anthropic response"
    )
    
    providers = {
        "openai": mock_openai,
        "anthropic": mock_anthropic
    }
    
    return LLMProxyV2(providers)


# =============================================================================
# Test Classes
# =============================================================================

class TestLLMProxyInitialization:
    """Test LLM Proxy initialization"""
    
    def test_llm_proxy_initialization(self, llm_proxy):
        """Test LLM Proxy initializes correctly"""
        assert llm_proxy is not None
        assert len(llm_proxy.providers) > 0
    
    def test_providers_have_required_attributes(self, llm_proxy):
        """Test that all providers have required attributes"""
        for name, provider in llm_proxy.providers.items():
            assert hasattr(provider, 'name')
            assert hasattr(provider, 'models')
            assert hasattr(provider, 'enabled')


class TestLLMSelection:
    """Test LLM selection logic"""
    
    def test_select_llm_planning_quality(self, llm_proxy):
        """Test LLM selection for planning with quality priority"""
        request = LLMRequest(
            prompt="Test",
            task_type="planning",
            budget_priority="quality"
        )
        
        provider, model = llm_proxy.select_llm(request)
        
        # Should select a valid provider
        assert provider in ['openai', 'google', 'groq', 'anthropic', 'ollama', 'openrouter', 'zai']
    
    def test_select_llm_code_generation_cost(self, llm_proxy):
        """Test LLM selection for code generation with cost priority"""
        request = LLMRequest(
            prompt="Test",
            task_type="code_generation",
            budget_priority="cost"
        )
        
        provider, model = llm_proxy.select_llm(request)
        
        # Should select a valid provider
        assert provider in ['ollama', 'groq', 'google', 'anthropic', 'openai', 'openrouter', 'zai']
    
    def test_select_llm_preferred_provider(self, llm_proxy):
        """Test LLM selection with user preference"""
        # Find first enabled provider
        enabled_providers = [p for p in llm_proxy.providers.values() if p.enabled]
        if not enabled_providers:
            pytest.skip("No enabled providers")
        
        provider = enabled_providers[0]
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider=provider.type,
            preferred_model=provider.models[0] if provider.models else None
        )
        
        selected_provider, selected_model = llm_proxy.select_llm(request)
        
        assert selected_provider == provider.type
    
    def test_select_llm_analysis_quality(self, llm_proxy):
        """Test LLM selection for analysis with quality priority"""
        request = LLMRequest(
            prompt="Test",
            task_type="analysis",
            budget_priority="quality"
        )
        
        provider, model = llm_proxy.select_llm(request)
        
        # Should select a valid provider
        assert provider in ['openai', 'google', 'groq', 'anthropic', 'ollama', 'openrouter', 'zai']
    
    def test_select_llm_decision_speed(self, llm_proxy):
        """Test LLM selection for decision with speed priority"""
        request = LLMRequest(
            prompt="Test",
            task_type="decision",
            budget_priority="speed"
        )
        
        provider, model = llm_proxy.select_llm(request)
        
        # Should select a valid provider
        assert provider in ['openai', 'google', 'groq', 'anthropic', 'ollama', 'openrouter', 'zai']
    
    def test_select_llm_simple_cost(self, llm_proxy):
        """Test LLM selection for simple with cost priority"""
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            budget_priority="cost"
        )
        
        provider, model = llm_proxy.select_llm(request)
        
        # Should select a valid provider
        assert provider in ['openai', 'google', 'groq', 'anthropic', 'ollama', 'openrouter', 'zai']


class TestProviderManagement:
    """Test provider management"""
    
    def test_get_providers(self, llm_proxy):
        """Test getting list of providers"""
        providers = llm_proxy.get_providers()
        
        assert isinstance(providers, list)
        assert len(providers) > 0
        
        for provider in providers:
            assert hasattr(provider, 'name')
            assert hasattr(provider, 'models')
            assert hasattr(provider, 'enabled')
    
    def test_enable_disable_provider(self, llm_proxy):
        """Test enabling and disabling providers"""
        # Get first provider
        provider_name = list(llm_proxy.providers.keys())[0]
        
        # Disable
        llm_proxy.disable_provider(provider_name)
        assert not llm_proxy.providers[provider_name].enabled
        
        # Enable
        llm_proxy.enable_provider(provider_name)
        assert llm_proxy.providers[provider_name].enabled
    
    def test_enable_nonexistent_provider(self, llm_proxy):
        """Test enabling a non-existent provider"""
        llm_proxy.enable_provider("nonexistent_provider")
        # Should not raise an error
    
    def test_disable_nonexistent_provider(self, llm_proxy):
        """Test disabling a non-existent provider"""
        llm_proxy.disable_provider("nonexistent_provider")
        # Should not raise an error


class TestUsageStatistics:
    """Test usage statistics tracking"""
    
    def test_usage_stats(self, llm_proxy):
        """Test usage statistics tracking"""
        stats = llm_proxy.get_usage_stats()
        
        assert stats.total_requests >= 0
        assert stats.total_tokens >= 0
        assert stats.total_cost >= 0.0
        assert isinstance(stats.requests_by_provider, dict)
        assert isinstance(stats.tokens_by_provider, dict)
        assert isinstance(stats.cost_by_provider, dict)
    
    def test_update_usage_stats(self, llm_proxy):
        """Test updating usage statistics"""
        initial_requests = llm_proxy.usage_stats.total_requests
        initial_tokens = llm_proxy.usage_stats.total_tokens
        initial_cost = llm_proxy.usage_stats.total_cost
        
        llm_proxy._update_usage_stats("openai", "simple", 100, 0.01)
        
        assert llm_proxy.usage_stats.total_requests == initial_requests + 1
        assert llm_proxy.usage_stats.total_tokens == initial_tokens + 100
        assert llm_proxy.usage_stats.total_cost == initial_cost + 0.01
        assert llm_proxy.usage_stats.requests_by_provider.get("openai", 0) >= 1
        assert llm_proxy.usage_stats.tokens_by_provider.get("openai", 0) >= 100
        assert llm_proxy.usage_stats.requests_by_task_type.get("simple", 0) >= 1


class TestLLMInvocation:
    """Test LLM invocation with mock providers"""
    
    @pytest.mark.asyncio
    async def test_invoke_llm_mock(self, mock_llm_proxy):
        """Test LLM invocation with mock provider"""
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-3.5-turbo"
        )
        
        response = await mock_llm_proxy.invoke(request)
        
        assert response.content == "Mock response"
        assert response.provider == "openai"
    
    @pytest.mark.asyncio
    async def test_invoke_llm_error_handling(self):
        """Test LLM invocation error handling"""
        mock_provider = MockProvider(
            name="OpenAI",
            type="openai",
            should_fail=True,
            error_message="API Error"
        )
        
        proxy = LLMProxyV2({"openai": mock_provider})
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="mock-model"
        )
        
        with pytest.raises(ProviderError) as exc_info:
            await proxy.invoke(request)
        
        assert "API Error" in str(exc_info.value)


class TestProviderCalls:
    """Test individual provider calls with mock providers"""
    
    @pytest.mark.asyncio
    async def test_call_openai_mock(self):
        """Test OpenAI provider call with mock"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.usage = MagicMock()
        mock_response.usage.total_tokens = 50
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key="test-key",
            models=["gpt-3.5-turbo"],
            cost_per_1k_tokens={"gpt-3.5-turbo": 0.001}
        )
        
        provider = OpenAIProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test prompt", task_type="simple")
        response = await provider.invoke("gpt-3.5-turbo", request)
        
        assert response.content == "Test response"
        assert response.tokens_used == 50
    
    @pytest.mark.asyncio
    async def test_call_anthropic_mock(self):
        """Test Anthropic provider call with mock"""
        from app.llm_proxy.providers.anthropic_provider import AnthropicProvider
        
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = "Test response"
        mock_response.stop_reason = "end_turn"
        mock_response.usage = MagicMock()
        mock_response.usage.input_tokens = 20
        mock_response.usage.output_tokens = 30
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        
        config = ProviderConfig(
            name="Anthropic",
            type="anthropic",
            api_key="test-key",
            models=["claude-3-haiku-20240307"],
            cost_per_1k_tokens={"claude-3-haiku-20240307": 0.00025}
        )
        
        provider = AnthropicProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test prompt", task_type="simple")
        response = await provider.invoke("claude-3-haiku-20240307", request)
        
        assert response.content == "Test response"
        assert response.tokens_used == 50
    
    @pytest.mark.asyncio
    async def test_call_groq_mock(self):
        """Test Groq provider call with mock"""
        from app.llm_proxy.providers.groq_provider import GroqProvider
        
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.usage = MagicMock()
        mock_response.usage.total_tokens = 40
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        config = ProviderConfig(
            name="Groq",
            type="groq",
            api_key="test-key",
            models=["llama-3.1-70b-versatile"],
            cost_per_1k_tokens={"llama-3.1-70b-versatile": 0.0005}
        )
        
        provider = GroqProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test prompt", task_type="simple")
        response = await provider.invoke("llama-3.1-70b-versatile", request)
        
        assert response.content == "Test response"
        assert response.tokens_used == 40


class TestLLMProviderError:
    """Test LLM Provider Error"""
    
    def test_provider_error_creation(self):
        """Test creating provider error"""
        error = LLMProviderError(
            message="Test error",
            provider="openai",
            model="gpt-4"
        )
        
        assert "Test error" in str(error)
        assert error.provider == "openai"
        assert error.model == "gpt-4"


class TestRequestWithMessages:
    """Test requests with messages and system prompts"""
    
    @pytest.mark.asyncio
    async def test_invoke_with_messages(self):
        """Test invocation with messages"""
        mock_provider = MockProvider(
            name="OpenAI",
            type="openai",
            response_content="Response with messages"
        )
        
        proxy = LLMProxyV2({"openai": mock_provider})
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="mock-model"
        )
        
        response = await proxy.invoke(request)
        
        assert response.content == "Response with messages"
    
    @pytest.mark.asyncio
    async def test_invoke_with_system_prompt(self):
        """Test invocation with system prompt"""
        mock_provider = MockProvider(
            name="OpenAI",
            type="openai",
            response_content="Response with system prompt"
        )
        
        proxy = LLMProxyV2({"openai": mock_provider})
        
        request = LLMRequest(
            prompt="Test prompt",
            system_prompt="You are a helpful assistant.",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="mock-model"
        )
        
        response = await proxy.invoke(request)
        
        assert response.content == "Response with system prompt"


class TestBackwardCompatibility:
    """Test backward compatibility with old API"""
    
    def test_llm_proxy_alias(self):
        """Test that LLMProxy is an alias for LLMProxyV2"""
        assert LLMProxy is LLMProxyV2
    
    def test_llm_provider_error_is_provider_error(self):
        """Test that LLMProviderError is a subclass of ProviderError"""
        assert issubclass(LLMProviderError, ProviderError)
    
    def test_select_llm_alias(self, llm_proxy):
        """Test that select_llm is an alias for select_provider"""
        request = LLMRequest(prompt="Test", task_type="simple")
        
        result1 = llm_proxy.select_llm(request)
        result2 = llm_proxy.select_provider(request)
        
        # Both should return the same result
        assert result1 == result2
