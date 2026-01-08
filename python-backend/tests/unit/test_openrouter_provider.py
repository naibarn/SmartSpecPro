"""
SmartSpec Pro - OpenRouter Provider Tests

Comprehensive tests for OpenRouter LLM provider.
Tests cover:
- Provider initialization
- Model selection
- API invocation with mocked client
- Error handling
- Cost calculation
- Message building
- Extra headers for OpenRouter
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import ProviderConfig
from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_openai_client():
    """Create a mock OpenAI-compatible client for OpenRouter API."""
    mock_client = AsyncMock()
    
    # Mock response
    mock_response = MagicMock()
    mock_response.id = "gen-123456"
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Test response from OpenRouter"
    mock_response.choices[0].finish_reason = "stop"
    mock_response.usage = MagicMock()
    mock_response.usage.total_tokens = 200
    mock_response.usage.prompt_tokens = 60
    mock_response.usage.completion_tokens = 140
    
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    
    return mock_client


@pytest.fixture
def openrouter_config():
    """Create default OpenRouter provider configuration."""
    return OpenRouterProvider.create_default_config(
        api_key="test-api-key",
        enabled=True
    )


@pytest.fixture
def openrouter_provider(openrouter_config, mock_openai_client):
    """Create OpenRouter provider with mocked client."""
    return OpenRouterProvider(
        config=openrouter_config,
        client=mock_openai_client,
        site_url="https://example.com",
        site_name="Test App"
    )


# =============================================================================
# Test Classes
# =============================================================================

class TestOpenRouterProviderInitialization:
    """Test OpenRouter provider initialization."""
    
    def test_init_with_config(self, openrouter_config, mock_openai_client):
        """Test provider initialization with config."""
        provider = OpenRouterProvider(
            config=openrouter_config,
            client=mock_openai_client,
            site_url="https://example.com",
            site_name="Test App"
        )
        
        assert provider.name == "OpenRouter"
        assert provider.type == "openrouter"
        assert provider.enabled is True
        assert provider.api_key == "test-api-key"
        assert provider.site_url == "https://example.com"
        assert provider.site_name == "Test App"
    
    def test_init_disabled_provider(self, openrouter_config):
        """Test initialization with disabled provider."""
        openrouter_config.enabled = False
        provider = OpenRouterProvider(
            config=openrouter_config,
            client=mock_openai_client
        )
        
        assert provider.enabled is False
    
    def test_default_config_creation(self):
        """Test creating default configuration."""
        config = OpenRouterProvider.create_default_config(
            api_key="my-api-key",
            enabled=True
        )
        
        assert config.name == "OpenRouter"
        assert config.type == "openrouter"
        assert "openai/gpt-4o" in config.models
        assert "anthropic/claude-3.5-sonnet" in config.models
        assert config.api_key == "my-api-key"
        assert config.base_url == OpenRouterProvider.BASE_URL
    
    def test_lazy_client_loading(self, openrouter_config):
        """Test that client is lazily loaded."""
        provider = OpenRouterProvider(config=openrouter_config, client=None)
        
        # Access client property - should try to create
        with patch('openai.AsyncOpenAI') as mock_client_class:
            mock_instance = AsyncMock()
            mock_client_class.return_value = mock_instance
            
            client = provider.client
            
            assert mock_client_class.called
    
    def test_site_url_none(self, openrouter_config, mock_openai_client):
        """Test initialization without site URL."""
        provider = OpenRouterProvider(
            config=openrouter_config,
            client=mock_openai_client,
            site_url=None,
            site_name=None
        )
        
        assert provider.site_url is None
        assert provider.site_name is None


class TestOpenRouterProviderModels:
    """Test OpenRouter provider model management."""
    
    def test_default_models(self, openrouter_config):
        """Test default models are set correctly."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        assert "openai/gpt-4o" in provider.models
        assert "anthropic/claude-3.5-sonnet" in provider.models
        assert "google/gemini-flash-1.5" in provider.models
        assert "meta-llama/llama-3.1-70b-instruct" in provider.models
    
    def test_get_max_tokens_gpt4o(self, openrouter_provider):
        """Test getting max tokens for gpt-4o."""
        max_tokens = openrouter_provider.get_max_tokens("openai/gpt-4o")
        
        assert max_tokens == 4096
    
    def test_get_max_tokens_gemini_flash(self, openrouter_provider):
        """Test getting max tokens for gemini-flash-1.5."""
        max_tokens = openrouter_provider.get_max_tokens("google/gemini-flash-1.5")
        
        assert max_tokens == 8192


class TestOpenRouterProviderInvocation:
    """Test OpenRouter provider API invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self, openrouter_provider, mock_openai_client):
        """Test successful API invocation."""
        request = LLMRequest(
            prompt="What is the meaning of life?",
            task_type="simple"
        )
        
        response = await openrouter_provider.invoke("openai/gpt-4o", request)
        
        assert response.content == "Test response from OpenRouter"
        assert response.provider == "openrouter"
        assert response.model == "openai/gpt-4o"
        assert response.tokens_used == 200
        assert response.cost > 0
    
    @pytest.mark.asyncio
    async def test_invoke_with_custom_max_tokens(self, openrouter_provider, mock_openai_client):
        """Test invocation with custom max tokens."""
        request = LLMRequest(
            prompt="Write a detailed essay",
            task_type="analysis",
            max_tokens=2000
        )
        
        response = await openrouter_provider.invoke("anthropic/claude-3.5-sonnet", request)
        
        assert response is not None
        mock_openai_client.chat.completions.create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_with_temperature(self, openrouter_provider, mock_openai_client):
        """Test invocation with custom temperature."""
        request = LLMRequest(
            prompt="Creative prompt",
            task_type="planning",
            temperature=0.7
        )
        
        response = await openrouter_provider.invoke("openai/gpt-4o-mini", request)
        
        assert response is not None
    
    @pytest.mark.asyncio
    async def test_invoke_disabled_provider(self, openrouter_config, mock_openai_client):
        """Test invocation with disabled provider."""
        openrouter_config.enabled = False
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert "disabled" in str(exc_info.value).lower()


class TestOpenRouterProviderErrorHandling:
    """Test OpenRouter provider error handling."""
    
    @pytest.mark.asyncio
    async def test_invoke_api_error(self, openrouter_config):
        """Test handling API errors."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("API rate limit exceeded")
        )
        
        provider = OpenRouterProvider(config=openrouter_config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert "API error" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_invoke_auth_error(self, openrouter_config):
        """Test handling authentication errors."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("Authentication failed: Invalid API key")
        )
        
        provider = OpenRouterProvider(config=openrouter_config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError):
            await provider.invoke("openai/gpt-4o", request)


class TestOpenRouterProviderCostCalculation:
    """Test OpenRouter provider cost calculation."""
    
    def test_calculate_cost_gpt4o(self, openrouter_provider):
        """Test cost calculation for gpt-4o."""
        cost = openrouter_provider.calculate_cost("openai/gpt-4o", 1000)
        
        # gpt-4o costs $5/1M = $0.005/1k
        assert cost == pytest.approx(0.005, rel=0.01)
    
    def test_calculate_cost_gpt4o_mini(self, openrouter_provider):
        """Test cost calculation for gpt-4o-mini."""
        cost = openrouter_provider.calculate_cost("openai/gpt-4o-mini", 1000)
        
        # gpt-4o-mini costs $0.15/1M = $0.00015/1k
        assert cost == pytest.approx(0.00015, rel=0.01)
    
    def test_calculate_cost_claude_sonnet(self, openrouter_provider):
        """Test cost calculation for claude-3.5-sonnet."""
        cost = openrouter_provider.calculate_cost("anthropic/claude-3.5-sonnet", 1000)
        
        # claude-3.5-sonnet costs $3/1M = $0.003/1k
        assert cost == pytest.approx(0.003, rel=0.01)
    
    def test_calculate_cost_zero_tokens(self, openrouter_provider):
        """Test cost calculation with zero tokens."""
        cost = openrouter_provider.calculate_cost("openai/gpt-4o", 0)
        
        assert cost == 0
    
    def test_calculate_cost_free_model(self, openrouter_provider):
        """Test cost calculation for potentially free models."""
        # Note: Some models might be free or have different pricing
        cost = openrouter_provider.calculate_cost("google/gemini-flash-1.5", 1000)
        
        assert cost >= 0


class TestOpenRouterProviderMessageBuilding:
    """Test OpenRouter provider message building."""
    
    def test_build_messages_with_system_prompt(self, openrouter_provider):
        """Test building messages with system prompt."""
        request = LLMRequest(
            prompt="User question",
            system_prompt="You are a helpful AI assistant.",
            task_type="simple"
        )
        
        messages = openrouter_provider._build_messages(request)
        
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are a helpful AI assistant."
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "User question"
    
    def test_build_messages_without_system_prompt(self, openrouter_provider):
        """Test building messages without system prompt."""
        request = LLMRequest(
            prompt="Just a question",
            task_type="simple"
        )
        
        messages = openrouter_provider._build_messages(request)
        
        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Just a question"
    
    def test_build_messages_empty_prompt(self, openrouter_provider):
        """Test building messages with empty prompt."""
        request = LLMRequest(
            prompt="",
            task_type="simple"
        )
        
        messages = openrouter_provider._build_messages(request)
        
        assert len(messages) == 1


class TestOpenRouterProviderExtraHeaders:
    """Test OpenRouter provider extra headers for rankings."""
    
    def test_extra_headers_with_site_info(self, openrouter_provider):
        """Test that extra headers include site info when present."""
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        # Build messages and check headers are prepared
        messages = openrouter_provider._build_messages(request)
        
        # The headers are passed during API call
        assert openrouter_provider.site_url == "https://example.com"
        assert openrouter_provider.site_name == "Test App"
    
    def test_extra_headers_without_site_info(self, openrouter_config, mock_openai_client):
        """Test that extra headers are None when no site info."""
        provider = OpenRouterProvider(
            config=openrouter_config,
            client=mock_openai_client,
            site_url=None,
            site_name=None
        )
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        messages = provider._build_messages(request)
        
        assert provider.site_url is None
        assert provider.site_name is None


class TestOpenRouterProviderCostMatrix:
    """Test OpenRouter provider cost matrix configuration."""
    
    def test_cost_per_1k_tokens_config(self, openrouter_config):
        """Test cost per 1K tokens is configured correctly."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        assert provider.config.cost_per_1k_tokens["openai/gpt-4o"] == 0.005
        assert provider.config.cost_per_1k_tokens["openai/gpt-4o-mini"] == 0.00015
        assert provider.config.cost_per_1k_tokens["anthropic/claude-3.5-sonnet"] == 0.003
    
    def test_max_tokens_config(self, openrouter_config):
        """Test max tokens is configured correctly."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        assert provider.config.max_tokens["openai/gpt-4o"] == 4096
        assert provider.config.max_tokens["google/gemini-flash-1.5"] == 8192


class TestOpenRouterProviderCapabilities:
    """Test OpenRouter provider capabilities."""
    
    def test_default_capabilities(self, openrouter_config):
        """Test default capabilities are set."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        assert "planning" in provider.capabilities
        assert "code_generation" in provider.capabilities
        assert "analysis" in provider.capabilities
        assert "decision" in provider.capabilities
        assert "simple" in provider.capabilities


class TestOpenRouterProviderEdgeCases:
    """Test edge cases for OpenRouter provider."""
    
    @pytest.mark.asyncio
    async def test_invoke_different_models(self, openrouter_config, mock_openai_client):
        """Test invocation with different models."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        models = [
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "anthropic/claude-3.5-sonnet",
            "anthropic/claude-3-haiku",
            "google/gemini-flash-1.5"
        ]
        
        for model in models:
            request = LLMRequest(
                prompt=f"Test for {model}",
                task_type="simple"
            )
            
            response = await provider.invoke(model, request)
            
            assert response is not None
            assert response.provider == "openrouter"
    
    @pytest.mark.asyncio
    async def test_invoke_different_task_types(self, openrouter_config, mock_openai_client):
        """Test invocation with different task types."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        task_types = ["planning", "code_generation", "analysis", "decision", "simple"]
        
        for task_type in task_types:
            request = LLMRequest(
                prompt=f"Test for {task_type}",
                task_type=task_type
            )
            
            response = await provider.invoke("openai/gpt-4o", request)
            
            assert response is not None
            assert response.provider == "openrouter"
    
    @pytest.mark.asyncio
    async def test_invoke_with_budget_priority(self, openrouter_config, mock_openai_client):
        """Test invocation with different budget priorities."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        for priority in ["quality", "cost", "speed"]:
            request = LLMRequest(
                prompt="Test prompt",
                task_type="analysis",
                budget_priority=priority
            )
            
            response = await provider.invoke("openai/gpt-4o", request)
            
            assert response is not None
            assert response.provider == "openrouter"


class TestOpenRouterProviderAccurateCost:
    """Test OpenRouter provider accurate cost retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_accurate_cost_success(self, openrouter_config, mock_openai_client):
        """Test getting accurate cost from OpenRouter."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        # Mock httpx response
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "cost": 0.001,
                "total_tokens": 250,
                "prompt_tokens": 75,
                "completion_tokens": 175
            }
            mock_response.raise_for_status = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            result = await provider.get_accurate_cost("gen-123456")
            
            assert result["cost"] == 0.001
            assert result["total_tokens"] == 250
    
    @pytest.mark.asyncio
    async def test_get_accurate_cost_error(self, openrouter_config, mock_openai_client):
        """Test getting accurate cost with error."""
        provider = OpenRouterProvider(config=openrouter_config, client=mock_openai_client)
        
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(
                side_effect=Exception("Network error")
            )
            mock_client_class.return_value.__aenter__.return_value = mock_client
            
            result = await provider.get_accurate_cost("gen-123456")
            
            assert result == {}


class TestOpenRouterProviderBaseURL:
    """Test OpenRouter provider base URL."""
    
    def test_base_url_constant(self):
        """Test base URL constant is correct."""
        assert OpenRouterProvider.BASE_URL == "https://openrouter.ai/api/v1"
    
    def test_config_uses_base_url(self, openrouter_config):
        """Test configuration uses the correct base URL."""
        assert openrouter_config.base_url == OpenRouterProvider.BASE_URL
