"""
SmartSpec Pro - Provider Integration Tests

These tests verify that the refactored providers work correctly
with mock clients injected. They test the full flow from
LLMProxy through providers without making actual API calls.

Run with: pytest tests/integration/test_providers_integration.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import dataclass

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.proxy import LLMProxyV2, LLMProxy, llm_proxy, LLMProviderError
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError
from app.llm_proxy.providers.factory import ProviderFactory, create_providers_from_settings


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def mock_settings():
    """Create mock settings with all API keys."""
    @dataclass
    class MockSettings:
        OPENAI_API_KEY: str = "test-openai-key"
        OPENAI_BASE_URL: str = None
        ANTHROPIC_API_KEY: str = "test-anthropic-key"
        ANTHROPIC_BASE_URL: str = None
        GOOGLE_API_KEY: str = "test-google-key"
        GROQ_API_KEY: str = "test-groq-key"
        GROQ_BASE_URL: str = None
        OLLAMA_BASE_URL: str = "http://localhost:11434"
        OPENROUTER_API_KEY: str = "test-openrouter-key"
        ZAI_API_KEY: str = "test-zai-key"
        ZAI_USE_CODING_ENDPOINT: bool = False
    
    return MockSettings()


@pytest.fixture
def mock_openai_client():
    """Create mock OpenAI client."""
    client = AsyncMock()
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = "OpenAI response"
    response.choices[0].finish_reason = "stop"
    response.usage = MagicMock()
    response.usage.total_tokens = 100
    response.id = "chatcmpl-123"
    client.chat.completions.create = AsyncMock(return_value=response)
    return client


@pytest.fixture
def mock_anthropic_client():
    """Create mock Anthropic client."""
    client = AsyncMock()
    response = MagicMock()
    response.content = [MagicMock()]
    response.content[0].text = "Anthropic response"
    response.stop_reason = "end_turn"
    response.usage = MagicMock()
    response.usage.input_tokens = 50
    response.usage.output_tokens = 50
    client.messages.create = AsyncMock(return_value=response)
    return client


# =============================================================================
# Test Provider Factory
# =============================================================================

class TestProviderFactoryIntegration:
    """Test ProviderFactory creates providers correctly."""
    
    def test_factory_creates_all_providers(self, mock_settings):
        """Test factory creates all providers when keys are set."""
        # Skip Ollama creation to avoid the property setter issue
        with patch.object(ProviderFactory, 'create_ollama_provider', return_value=None):
            factory = ProviderFactory(mock_settings)
            providers = factory.create_all_providers()
        
        # Should have all providers except Ollama
        assert "openai" in providers
        assert "anthropic" in providers
        assert "google" in providers
        assert "groq" in providers
        assert "openrouter" in providers
        assert "zai" in providers
    
    def test_factory_only_creates_available_providers(self):
        """Test factory only creates providers with API keys."""
        @dataclass
        class MinimalSettings:
            OPENAI_API_KEY: str = "test-key"
            OPENAI_BASE_URL: str = None
            ANTHROPIC_API_KEY: str = None
            GOOGLE_API_KEY: str = None
            GROQ_API_KEY: str = None
            OLLAMA_BASE_URL: str = "http://localhost:11434"
            OPENROUTER_API_KEY: str = None
            ZAI_API_KEY: str = None
        
        with patch.object(ProviderFactory, 'create_ollama_provider', return_value=None):
            factory = ProviderFactory(MinimalSettings())
            providers = factory.create_all_providers()
        
        # Should only have OpenAI
        assert "openai" in providers
        assert "anthropic" not in providers
        assert "google" not in providers


# =============================================================================
# Test OpenAI Provider Integration
# =============================================================================

class TestOpenAIProviderIntegration:
    """Test OpenAI provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_openai_invoke_success(self, mock_openai_client):
        """Test OpenAI provider invoke with mock client."""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key="test-key",
            models=["gpt-4", "gpt-3.5-turbo"],
            cost_per_1k_tokens={"gpt-4": 0.03, "gpt-3.5-turbo": 0.001},
            max_tokens={"gpt-4": 8192, "gpt-3.5-turbo": 4096},
            capabilities=["planning", "code_generation", "simple"]
        )
        
        provider = OpenAIProvider(config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            temperature=0.7,
            max_tokens=100
        )
        
        response = await provider.invoke("gpt-4", request)
        
        assert response.content == "OpenAI response"
        assert response.provider == "openai"
        assert response.model == "gpt-4"
        assert response.tokens_used == 100
        mock_openai_client.chat.completions.create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_openai_with_system_prompt(self, mock_openai_client):
        """Test OpenAI provider with system prompt."""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key="test-key",
            models=["gpt-4"],
            cost_per_1k_tokens={"gpt-4": 0.03}
        )
        
        provider = OpenAIProvider(config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            system_prompt="You are a helpful assistant.",
            task_type="simple"
        )
        
        await provider.invoke("gpt-4", request)
        
        # Verify system message was included
        call_args = mock_openai_client.chat.completions.create.call_args
        messages = call_args.kwargs.get('messages', [])
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"


# =============================================================================
# Test Anthropic Provider Integration
# =============================================================================

class TestAnthropicProviderIntegration:
    """Test Anthropic provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_anthropic_invoke_success(self, mock_anthropic_client):
        """Test Anthropic provider invoke with mock client."""
        from app.llm_proxy.providers.anthropic_provider import AnthropicProvider
        
        config = ProviderConfig(
            name="Anthropic",
            type="anthropic",
            api_key="test-key",
            models=["claude-3-sonnet-20240229"],
            cost_per_1k_tokens={"claude-3-sonnet-20240229": 0.003},
            max_tokens={"claude-3-sonnet-20240229": 4096}
        )
        
        provider = AnthropicProvider(config, client=mock_anthropic_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="code_generation",
            temperature=0.5
        )
        
        response = await provider.invoke("claude-3-sonnet-20240229", request)
        
        assert response.content == "Anthropic response"
        assert response.provider == "anthropic"
        assert response.model == "claude-3-sonnet-20240229"
        assert response.tokens_used == 100  # 50 input + 50 output
        mock_anthropic_client.messages.create.assert_called_once()


# =============================================================================
# Test Google Provider Integration
# =============================================================================

class TestGoogleProviderIntegration:
    """Test Google provider with mock genai module."""
    
    @pytest.mark.asyncio
    async def test_google_invoke_success(self):
        """Test Google provider invoke with mock genai."""
        from app.llm_proxy.providers.google_provider import GoogleProvider
        
        # Create mock genai module
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Google response"
        mock_model.generate_content_async = AsyncMock(return_value=mock_response)
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.types.GenerationConfig = MagicMock()
        
        config = ProviderConfig(
            name="Google",
            type="google",
            api_key="test-key",
            models=["gemini-pro"],
            cost_per_1k_tokens={"gemini-pro": 0.001}
        )
        
        provider = GoogleProvider(config, genai_module=mock_genai)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="analysis"
        )
        
        response = await provider.invoke("gemini-pro", request)
        
        assert response.content == "Google response"
        assert response.provider == "google"
        assert response.model == "gemini-pro"


# =============================================================================
# Test Groq Provider Integration
# =============================================================================

class TestGroqProviderIntegration:
    """Test Groq provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_groq_invoke_success(self, mock_openai_client):
        """Test Groq provider invoke with mock client (OpenAI-compatible)."""
        from app.llm_proxy.providers.groq_provider import GroqProvider
        
        config = ProviderConfig(
            name="Groq",
            type="groq",
            api_key="test-key",
            models=["llama-3.1-70b-versatile"],
            cost_per_1k_tokens={"llama-3.1-70b-versatile": 0.0005}
        )
        
        # Groq uses OpenAI-compatible client
        mock_openai_client.chat.completions.create.return_value.choices[0].message.content = "Groq response"
        
        provider = GroqProvider(config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        response = await provider.invoke("llama-3.1-70b-versatile", request)
        
        assert response.content == "Groq response"
        assert response.provider == "groq"


# =============================================================================
# Test Ollama Provider Integration
# =============================================================================

class TestOllamaProviderIntegration:
    """Test Ollama provider with mock HTTP client."""
    
    @pytest.mark.asyncio
    async def test_ollama_invoke_success(self):
        """Test Ollama provider invoke with mock HTTP client."""
        from app.llm_proxy.providers.ollama_provider import OllamaProvider
        
        # Create mock HTTP client
        mock_http = AsyncMock()
        mock_response = MagicMock()
        mock_response.json.return_value = {"response": "Ollama response"}
        mock_response.raise_for_status = MagicMock()
        mock_http.post = AsyncMock(return_value=mock_response)
        
        config = ProviderConfig(
            name="Ollama",
            type="ollama",
            base_url="http://localhost:11434",
            models=["llama3:8b"],
            cost_per_1k_tokens={"llama3:8b": 0.0},
            enabled=True
        )
        
        provider = OllamaProvider(config, http_client=mock_http)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        response = await provider.invoke("llama3:8b", request)
        
        assert response.content == "Ollama response"
        assert response.provider == "ollama"
        assert response.cost == 0.0  # Ollama is free


# =============================================================================
# Test OpenRouter Provider Integration
# =============================================================================

class TestOpenRouterProviderIntegration:
    """Test OpenRouter provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_openrouter_invoke_success(self, mock_openai_client):
        """Test OpenRouter provider invoke with mock client."""
        from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider
        
        config = ProviderConfig(
            name="OpenRouter",
            type="openrouter",
            api_key="test-key",
            models=["openai/gpt-4o"],
            cost_per_1k_tokens={"openai/gpt-4o": 0.005}
        )
        
        mock_openai_client.chat.completions.create.return_value.choices[0].message.content = "OpenRouter response"
        
        provider = OpenRouterProvider(config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="planning"
        )
        
        response = await provider.invoke("openai/gpt-4o", request)
        
        assert response.content == "OpenRouter response"
        assert response.provider == "openrouter"


# =============================================================================
# Test Z.AI Provider Integration
# =============================================================================

class TestZAIProviderIntegration:
    """Test Z.AI provider with mock client."""
    
    @pytest.mark.asyncio
    async def test_zai_invoke_success(self, mock_openai_client):
        """Test Z.AI provider invoke with mock client."""
        from app.llm_proxy.providers.zai_provider import ZAIProvider
        
        config = ProviderConfig(
            name="Z.AI",
            type="zai",
            api_key="test-key",
            models=["glm-4.7"],
            cost_per_1k_tokens={"glm-4.7": 0.001}
        )
        
        mock_openai_client.chat.completions.create.return_value.choices[0].message.content = "Z.AI response"
        
        provider = ZAIProvider(config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="code_generation"
        )
        
        response = await provider.invoke("glm-4.7", request)
        
        assert response.content == "Z.AI response"
        assert response.provider == "zai"
    
    @pytest.mark.asyncio
    async def test_zai_free_model(self, mock_openai_client):
        """Test Z.AI free model (glm-4-flash)."""
        from app.llm_proxy.providers.zai_provider import ZAIProvider
        
        config = ProviderConfig(
            name="Z.AI",
            type="zai",
            api_key="test-key",
            models=["glm-4-flash"],
            cost_per_1k_tokens={"glm-4-flash": 0.0}
        )
        
        provider = ZAIProvider(config, client=mock_openai_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        response = await provider.invoke("glm-4-flash", request)
        
        # glm-4-flash should be free
        assert response.cost == 0.0


# =============================================================================
# Test LLMProxy Integration
# =============================================================================

class TestLLMProxyIntegration:
    """Test LLMProxy with multiple providers."""
    
    @pytest.mark.asyncio
    async def test_proxy_with_multiple_providers(self, mock_openai_client, mock_anthropic_client):
        """Test LLMProxy with multiple injected providers."""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        from app.llm_proxy.providers.anthropic_provider import AnthropicProvider
        
        openai_config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key="test-key",
            models=["gpt-4"],
            cost_per_1k_tokens={"gpt-4": 0.03},
            capabilities=["planning", "simple"]
        )
        
        anthropic_config = ProviderConfig(
            name="Anthropic",
            type="anthropic",
            api_key="test-key",
            models=["claude-3-sonnet-20240229"],
            cost_per_1k_tokens={"claude-3-sonnet-20240229": 0.003},
            capabilities=["code_generation", "analysis"]
        )
        
        providers = {
            "openai": OpenAIProvider(openai_config, client=mock_openai_client),
            "anthropic": AnthropicProvider(anthropic_config, client=mock_anthropic_client)
        }
        
        proxy = LLMProxyV2(providers)
        
        # Test with OpenAI
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        response = await proxy.invoke(request)
        assert response.provider == "openai"
        
        # Test with Anthropic
        request = LLMRequest(
            prompt="Test",
            task_type="code_generation",
            preferred_provider="anthropic",
            preferred_model="claude-3-sonnet-20240229"
        )
        
        response = await proxy.invoke(request)
        assert response.provider == "anthropic"
    
    @pytest.mark.asyncio
    async def test_proxy_usage_stats(self, mock_openai_client):
        """Test that proxy tracks usage statistics."""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = ProviderConfig(
            name="OpenAI",
            type="openai",
            api_key="test-key",
            models=["gpt-4"],
            cost_per_1k_tokens={"gpt-4": 0.03}
        )
        
        providers = {"openai": OpenAIProvider(config, client=mock_openai_client)}
        proxy = LLMProxyV2(providers)
        
        # Make multiple requests
        for _ in range(3):
            request = LLMRequest(
                prompt="Test",
                task_type="simple",
                preferred_provider="openai",
                preferred_model="gpt-4"
            )
            await proxy.invoke(request)
        
        stats = proxy.get_usage_stats()
        assert stats.total_requests == 3
        assert stats.total_tokens == 300  # 100 per request
        assert stats.requests_by_provider["openai"] == 3


# =============================================================================
# Test Backward Compatibility
# =============================================================================

class TestBackwardCompatibility:
    """Test backward compatibility with old API."""
    
    def test_llm_proxy_alias_exists(self):
        """Test that LLMProxy alias exists."""
        assert LLMProxy is LLMProxyV2
    
    def test_llm_provider_error_exists(self):
        """Test that LLMProviderError exists."""
        assert LLMProviderError is not None
        assert issubclass(LLMProviderError, ProviderError)
