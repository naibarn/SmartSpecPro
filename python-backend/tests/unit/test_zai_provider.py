"""
SmartSpec Pro - Z.AI Provider Tests

Comprehensive tests for Z.AI (Zhipu AI) LLM provider.
Tests cover:
- Provider initialization
- Model selection
- API invocation with mocked client
- Error handling
- Cost calculation
- Model information
- Message building
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import ProviderConfig
from app.llm_proxy.providers.zai_provider import ZAIProvider


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_openai_client():
    """Create a mock OpenAI-compatible client for Z.AI API."""
    mock_client = AsyncMock()
    
    # Mock response
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Test response from Z.AI"
    mock_response.choices[0].finish_reason = "stop"
    mock_response.usage = MagicMock()
    mock_response.usage.total_tokens = 150
    mock_response.usage.prompt_tokens = 50
    mock_response.usage.completion_tokens = 100
    
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    
    return mock_client


@pytest.fixture
def zai_config():
    """Create default Z.AI provider configuration."""
    return ZAIProvider.create_default_config(
        api_key="test-api-key",
        enabled=True
    )


@pytest.fixture
def zai_provider(zai_config, mock_openai_client):
    """Create Z.AI provider with mocked client."""
    return ZAIProvider(config=zai_config, client=mock_openai_client)


# =============================================================================
# Test Classes
# =============================================================================

class TestZAIProviderInitialization:
    """Test Z.AI provider initialization."""
    
    def test_init_with_config(self, zai_config, mock_openai_client):
        """Test provider initialization with config."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert provider.name == "Z.AI"
        assert provider.type == "zai"
        assert provider.enabled is True
        assert provider.api_key == "test-api-key"
    
    def test_init_disabled_provider(self, zai_config):
        """Test initialization with disabled provider."""
        zai_config.enabled = False
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert provider.enabled is False
    
    def test_default_config_creation(self):
        """Test creating default configuration."""
        config = ZAIProvider.create_default_config(
            api_key="my-api-key",
            enabled=True
        )
        
        assert config.name == "Z.AI"
        assert config.type == "zai"
        assert "glm-4.7" in config.models
        assert "glm-4-flash" in config.models
        assert config.api_key == "my-api-key"
        assert config.base_url == ZAIProvider.STANDARD_BASE_URL
    
    def test_coding_endpoint_config(self):
        """Test creating configuration with coding endpoint."""
        config = ZAIProvider.create_default_config(
            api_key="my-api-key",
            use_coding_endpoint=True,
            enabled=True
        )
        
        assert config.base_url == ZAIProvider.CODING_BASE_URL
    
    def test_lazy_client_loading(self, zai_config):
        """Test that client is lazily loaded."""
        provider = ZAIProvider(config=zai_config, client=None)
        
        # Access client property - should try to create
        with patch('openai.AsyncOpenAI') as mock_client_class:
            mock_instance = AsyncMock()
            mock_client_class.return_value = mock_instance
            
            client = provider.client
            
            assert mock_client_class.called


class TestZAIProviderModels:
    """Test Z.AI provider model management."""
    
    def test_default_models(self, zai_config):
        """Test default models are set correctly."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert "glm-4.7" in provider.models
        assert "glm-4.6" in provider.models
        assert "glm-4.5" in provider.models
        assert "glm-4" in provider.models
        assert "glm-4-flash" in provider.models
    
    def test_get_max_tokens(self, zai_provider):
        """Test getting max tokens for a model."""
        max_tokens = zai_provider.get_max_tokens("glm-4.7")
        
        assert max_tokens == 8192
    
    def test_get_max_tokens_glm_flash(self, zai_provider):
        """Test getting max tokens for GLM-4-Flash."""
        max_tokens = zai_provider.get_max_tokens("glm-4-flash")
        
        assert max_tokens == 4096


class TestZAIProviderInvocation:
    """Test Z.AI provider API invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self, zai_provider, mock_openai_client):
        """Test successful API invocation."""
        request = LLMRequest(
            prompt="What is machine learning?",
            task_type="simple"
        )
        
        response = await zai_provider.invoke("glm-4.7", request)
        
        assert response.content == "Test response from Z.AI"
        assert response.provider == "zai"
        assert response.model == "glm-4.7"
        assert response.tokens_used == 150
        assert response.cost > 0
    
    @pytest.mark.asyncio
    async def test_invoke_with_custom_max_tokens(self, zai_provider, mock_openai_client):
        """Test invocation with custom max tokens."""
        request = LLMRequest(
            prompt="Write a long essay",
            task_type="analysis",
            max_tokens=4000
        )
        
        response = await zai_provider.invoke("glm-4.6", request)
        
        assert response is not None
        mock_openai_client.chat.completions.create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_with_temperature(self, zai_provider, mock_openai_client):
        """Test invocation with custom temperature."""
        request = LLMRequest(
            prompt="Creative prompt",
            task_type="planning",
            temperature=0.7
        )
        
        response = await zai_provider.invoke("glm-4.5", request)
        
        assert response is not None
    
    @pytest.mark.asyncio
    async def test_invoke_disabled_provider(self, zai_config, mock_openai_client):
        """Test invocation with disabled provider."""
        zai_config.enabled = False
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("glm-4.7", request)
        
        assert "disabled" in str(exc_info.value).lower()


class TestZAIProviderErrorHandling:
    """Test Z.AI provider error handling."""
    
    @pytest.mark.asyncio
    async def test_invoke_api_error(self, zai_config):
        """Test handling API errors."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("API rate limit exceeded")
        )
        
        provider = ZAIProvider(config=zai_config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("glm-4.7", request)
        
        assert "API error" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_invoke_auth_error(self, zai_config):
        """Test handling authentication errors."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("Authentication failed: Invalid API key")
        )
        
        provider = ZAIProvider(config=zai_config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError):
            await provider.invoke("glm-4.7", request)


class TestZAIProviderCostCalculation:
    """Test Z.AI provider cost calculation."""
    
    def test_calculate_cost_glm_47(self, zai_provider):
        """Test cost calculation for glm-4.7."""
        cost = zai_provider.calculate_cost("glm-4.7", 1000)
        
        # glm-4.7 costs $1/1M = $0.001/1k
        assert cost == pytest.approx(0.001, rel=0.01)
    
    def test_calculate_cost_glm_flash_free(self, zai_provider):
        """Test that glm-4-flash is free."""
        cost = zai_provider.calculate_cost("glm-4-flash", 1000)
        
        assert cost == 0.0
    
    def test_calculate_cost_zero_tokens(self, zai_provider):
        """Test cost calculation with zero tokens."""
        cost = zai_provider.calculate_cost("glm-4.7", 0)
        
        assert cost == 0
    
    def test_calculate_cost_inherited(self, zai_provider):
        """Test cost calculation uses inherited method for paid models."""
        cost = zai_provider.calculate_cost("glm-4", 1000)
        
        assert cost == pytest.approx(0.001, rel=0.01)


class TestZAIProviderMessageBuilding:
    """Test Z.AI provider message building."""
    
    def test_build_messages_with_system_prompt(self, zai_provider):
        """Test building messages with system prompt."""
        request = LLMRequest(
            prompt="User question",
            system_prompt="You are a helpful AI.",
            task_type="simple"
        )
        
        messages = zai_provider._build_messages(request)
        
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are a helpful AI."
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "User question"
    
    def test_build_messages_without_system_prompt(self, zai_provider):
        """Test building messages without system prompt."""
        request = LLMRequest(
            prompt="Just a question",
            task_type="simple"
        )
        
        messages = zai_provider._build_messages(request)
        
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert "helpful AI assistant" in messages[0]["content"]
        assert messages[1]["role"] == "user"
    
    def test_build_messages_empty_prompt(self, zai_provider):
        """Test building messages with empty prompt."""
        request = LLMRequest(
            prompt="",
            task_type="simple"
        )
        
        messages = zai_provider._build_messages(request)
        
        assert len(messages) == 2


class TestZAIProviderModelInfo:
    """Test Z.AI provider model information."""
    
    def test_get_model_info_glm_47(self, zai_provider):
        """Test getting info for glm-4.7."""
        info = zai_provider.get_model_info("glm-4.7")
        
        assert info["name"] == "GLM-4.7"
        assert info["context_length"] == 200000
        assert "coding" in info["strengths"]
    
    def test_get_model_info_glm_flash(self, zai_provider):
        """Test getting info for glm-4-flash."""
        info = zai_provider.get_model_info("glm-4-flash")
        
        assert info["name"] == "GLM-4-Flash"
        assert info["free"] is True
        assert "speed" in info["strengths"]
    
    def test_get_model_info_unknown(self, zai_provider):
        """Test getting info for unknown model."""
        info = zai_provider.get_model_info("unknown-model")
        
        assert info["name"] == "unknown-model"
        assert info["context_length"] == 0
        assert len(info["strengths"]) == 0


class TestZAIProviderCostMatrix:
    """Test Z.AI provider cost matrix configuration."""
    
    def test_cost_per_1k_tokens_config(self, zai_config):
        """Test cost per 1K tokens is configured correctly."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert provider.config.cost_per_1k_tokens["glm-4.7"] == 0.001
        assert provider.config.cost_per_1k_tokens["glm-4-flash"] == 0.0
    
    def test_max_tokens_config(self, zai_config):
        """Test max tokens is configured correctly."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert provider.config.max_tokens["glm-4.7"] == 8192
        assert provider.config.max_tokens["glm-4-flash"] == 4096


class TestZAIProviderCapabilities:
    """Test Z.AI provider capabilities."""
    
    def test_default_capabilities(self, zai_config):
        """Test default capabilities are set."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert "planning" in provider.capabilities
        assert "code_generation" in provider.capabilities
        assert "analysis" in provider.capabilities
        assert "decision" in provider.capabilities
        assert "simple" in provider.capabilities


class TestZAIProviderEdgeCases:
    """Test edge cases for Z.AI provider."""
    
    @pytest.mark.asyncio
    async def test_invoke_different_models(self, zai_config, mock_openai_client):
        """Test invocation with different models."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        models = ["glm-4.7", "glm-4.6", "glm-4.5", "glm-4", "glm-4-flash"]
        
        for model in models:
            request = LLMRequest(
                prompt=f"Test for {model}",
                task_type="simple"
            )
            
            response = await provider.invoke(model, request)
            
            assert response is not None
            assert response.provider == "zai"
    
    @pytest.mark.asyncio
    async def test_invoke_different_task_types(self, zai_config, mock_openai_client):
        """Test invocation with different task types."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        task_types = ["planning", "code_generation", "analysis", "decision", "simple"]
        
        for task_type in task_types:
            request = LLMRequest(
                prompt=f"Test for {task_type}",
                task_type=task_type
            )
            
            response = await provider.invoke("glm-4.7", request)
            
            assert response is not None
            assert response.provider == "zai"
    
    @pytest.mark.asyncio
    async def test_invoke_with_budget_priority(self, zai_config, mock_openai_client):
        """Test invocation with different budget priorities."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        for priority in ["quality", "cost", "speed"]:
            request = LLMRequest(
                prompt="Test prompt",
                task_type="analysis",
                budget_priority=priority
            )
            
            response = await provider.invoke("glm-4.7", request)
            
            assert response is not None
            assert response.provider == "zai"


class TestZAIProviderBaseURL:
    """Test Z.AI provider base URL handling."""
    
    def test_standard_base_url(self, zai_config):
        """Test standard base URL."""
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert provider.base_url == ZAIProvider.STANDARD_BASE_URL
    
    def test_coding_endpoint_base_url(self, zai_config):
        """Test coding endpoint base URL."""
        provider = ZAIProvider(
            config=zai_config,
            client=mock_openai_client,
            use_coding_endpoint=True
        )
        
        assert provider.base_url == ZAIProvider.CODING_BASE_URL
    
    def test_custom_base_url(self, zai_config):
        """Test custom base URL from config."""
        zai_config.base_url = "https://custom.api.example.com"
        provider = ZAIProvider(config=zai_config, client=mock_openai_client)
        
        assert provider.base_url == "https://custom.api.example.com"
