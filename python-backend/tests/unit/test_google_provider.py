"""
SmartSpec Pro - Google Provider Tests

Comprehensive tests for Google/Gemini LLM provider.
Tests cover:
- Provider initialization
- Model selection
- API invocation with mocks
- Error handling
- Token estimation
- Cost calculation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import ProviderConfig
from app.llm_proxy.providers.google_provider import GoogleProvider


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_genai():
    """Create a mock google.generativeai module."""
    mock_module = MagicMock()
    
    # Mock GenerativeModel
    mock_model = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Test response from Gemini"
    mock_model.generate_content_async = AsyncMock(return_value=mock_response)
    mock_module.GenerativeModel.return_value = mock_model
    
    # Mock types
    mock_module.types = MagicMock()
    mock_module.types.GenerationConfig = MagicMock()
    
    # Mock configure
    mock_module.configure = MagicMock()
    
    return mock_module


@pytest.fixture
def google_config():
    """Create default Google provider configuration."""
    return GoogleProvider.create_default_config(
        api_key="test-api-key",
        enabled=True
    )


@pytest.fixture
def google_provider(google_config, mock_genai):
    """Create Google provider with mocked genai module."""
    return GoogleProvider(config=google_config, genai_module=mock_genai)


# =============================================================================
# Test Classes
# =============================================================================

class TestGoogleProviderInitialization:
    """Test Google provider initialization."""
    
    def test_init_with_config(self, google_config, mock_genai):
        """Test provider initialization with config."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        assert provider.name == "Google"
        assert provider.type == "google"
        assert provider.enabled is True
        assert provider.api_key == "test-api-key"
    
    def test_init_disabled_provider(self, google_config):
        """Test initialization with disabled provider."""
        google_config.enabled = False
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        assert provider.enabled is False
    
    def test_default_config_creation(self):
        """Test creating default configuration."""
        config = GoogleProvider.create_default_config(
            api_key="my-api-key",
            enabled=True
        )
        
        assert config.name == "Google"
        assert config.type == "google"
        assert "gemini-pro" in config.models
        assert "gemini-1.5-flash" in config.models
        assert config.api_key == "my-api-key"
    
    def test_lazy_genai_loading(self, google_config, mock_genai):
        """Test that genai is lazily loaded."""
        google_config.api_key = None  # No API key
        provider = GoogleProvider(config=google_config, genai_module=None)
        
        # Access genai property - should try to import
        with patch.dict('sys.modules', {'google.generativeai': mock_genai}):
            genai = provider.genai
            assert genai is not None


class TestGoogleProviderModels:
    """Test Google provider model management."""
    
    def test_default_models(self, google_config):
        """Test default models are set correctly."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        assert "gemini-pro" in provider.models
        assert "gemini-1.5-pro" in provider.models
        assert "gemini-1.5-flash" in provider.models
    
    def test_get_max_tokens(self, google_provider):
        """Test getting max tokens for a model."""
        max_tokens = google_provider.get_max_tokens("gemini-1.5-flash")
        
        assert max_tokens == 8192
    
    def test_get_max_tokens_unknown_model(self, google_provider):
        """Test getting max tokens for unknown model."""
        max_tokens = google_provider.get_max_tokens("unknown-model")
        
        # Should return default from config or raise
        assert max_tokens is not None


class TestGoogleProviderInvocation:
    """Test Google provider API invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self, google_provider, mock_genai):
        """Test successful API invocation."""
        request = LLMRequest(
            prompt="What is the capital of France?",
            task_type="simple"
        )
        
        response = await google_provider.invoke("gemini-1.5-flash", request)
        
        assert response.content == "Test response from Gemini"
        assert response.provider == "google"
        assert response.model == "gemini-1.5-flash"
        assert response.tokens_used > 0
        assert response.cost >= 0
    
    @pytest.mark.asyncio
    async def test_invoke_with_custom_max_tokens(self, google_provider, mock_genai):
        """Test invocation with custom max tokens."""
        request = LLMRequest(
            prompt="Write a long story",
            task_type="code_generation",
            max_tokens=4000
        )
        
        response = await google_provider.invoke("gemini-1.5-flash", request)
        
        assert response is not None
        mock_genai.GenerativeModel.return_value.generate_content_async.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_disabled_provider(self, google_config, mock_genai):
        """Test invocation with disabled provider."""
        google_config.enabled = False
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("gemini-1.5-flash", request)
        
        assert "disabled" in str(exc_info.value).lower()
    
    @pytest.mark.asyncio
    async def test_invoke_with_temperature(self, google_provider, mock_genai):
        """Test invocation with custom temperature."""
        request = LLMRequest(
            prompt="Creative prompt",
            task_type="planning",
            temperature=0.7
        )
        
        response = await google_provider.invoke("gemini-1.5-pro", request)
        
        assert response is not None


class TestGoogleProviderErrorHandling:
    """Test Google provider error handling."""
    
    @pytest.mark.asyncio
    async def test_invoke_api_error(self, google_config, mock_genai):
        """Test handling API errors."""
        # Make the API call raise an exception
        mock_model = MagicMock()
        mock_model.generate_content_async = AsyncMock(
            side_effect=Exception("API rate limit exceeded")
        )
        mock_genai.GenerativeModel.return_value = mock_model
        
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("gemini-1.5-flash", request)
        
        assert "API error" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_invoke_connection_error(self, google_config, mock_genai):
        """Test handling connection errors."""
        mock_model = MagicMock()
        mock_model.generate_content_async = AsyncMock(
            side_effect=Exception("Connection refused")
        )
        mock_genai.GenerativeModel.return_value = mock_model
        
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError):
            await provider.invoke("gemini-1.5-flash", request)


class TestGoogleProviderTokenEstimation:
    """Test Google provider token estimation."""
    
    def test_estimate_tokens(self, google_provider):
        """Test token estimation."""
        prompt = "This is a test prompt"
        response = "This is a test response"
        
        tokens = google_provider._estimate_tokens(prompt, response)
        
        # Should return a reasonable estimate
        assert tokens > 0
        assert isinstance(tokens, int)
    
    def test_estimate_tokens_empty_strings(self, google_provider):
        """Test token estimation with empty strings."""
        tokens = google_provider._estimate_tokens("", "")
        
        assert tokens == 0
    
    def test_estimate_tokens_long_text(self, google_provider):
        """Test token estimation with long text."""
        long_prompt = "word " * 100
        long_response = "response " * 200
        
        tokens = google_provider._estimate_tokens(long_prompt, long_response)
        
        # Should be roughly proportional to word count
        assert tokens > 0


class TestGoogleProviderCostCalculation:
    """Test Google provider cost calculation."""
    
    def test_calculate_cost_gemini_pro(self, google_provider):
        """Test cost calculation for gemini-pro."""
        cost = google_provider.calculate_cost("gemini-pro", 1000)
        
        # gemini-pro costs $1/1M = $0.001/1k
        assert cost == pytest.approx(0.001, rel=0.01)
    
    def test_calculate_cost_gemini_flash(self, google_provider):
        """Test cost calculation for gemini-1.5-flash."""
        cost = google_provider.calculate_cost("gemini-1.5-flash", 1000)
        
        # gemini-1.5-flash costs $0.075/1M = $0.000075/1k
        assert cost == pytest.approx(0.000075, rel=0.01)
    
    def test_calculate_cost_zero_tokens(self, google_provider):
        """Test cost calculation with zero tokens."""
        cost = google_provider.calculate_cost("gemini-pro", 0)
        
        assert cost == 0


class TestGoogleProviderCostMatrix:
    """Test Google provider cost matrix configuration."""
    
    def test_cost_per_1k_tokens_config(self, google_config):
        """Test cost per 1K tokens is configured correctly."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        assert provider.config.cost_per_1k_tokens["gemini-pro"] == 0.001
        assert provider.config.cost_per_1k_tokens["gemini-1.5-pro"] == 0.00125
        assert provider.config.cost_per_1k_tokens["gemini-1.5-flash"] == 0.000075
    
    def test_max_tokens_config(self, google_config):
        """Test max tokens is configured correctly."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        assert provider.config.max_tokens["gemini-pro"] == 8192
        assert provider.config.max_tokens["gemini-1.5-pro"] == 8192
        assert provider.config.max_tokens["gemini-1.5-flash"] == 8192


class TestGoogleProviderCapabilities:
    """Test Google provider capabilities."""
    
    def test_default_capabilities(self, google_config):
        """Test default capabilities are set."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        assert "planning" in provider.capabilities
        assert "code_generation" in provider.capabilities
        assert "analysis" in provider.capabilities
        assert "decision" in provider.capabilities
        assert "simple" in provider.capabilities


class TestGoogleProviderEdgeCases:
    """Test edge cases for Google provider."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_system_prompt(self, google_config, mock_genai):
        """Test invocation with system prompt (should be ignored for Gemini)."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        request = LLMRequest(
            prompt="User prompt",
            system_prompt="You are a helpful assistant.",
            task_type="simple"
        )
        
        response = await provider.invoke("gemini-1.5-flash", request)
        
        assert response is not None
        # System prompt is not explicitly handled in Gemini API
    
    @pytest.mark.asyncio
    async def test_invoke_with_budget_priority(self, google_config, mock_genai):
        """Test invocation with different budget priorities."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        for priority in ["quality", "cost", "speed"]:
            request = LLMRequest(
                prompt="Test prompt",
                task_type="analysis",
                budget_priority=priority
            )
            
            response = await provider.invoke("gemini-1.5-flash", request)
            
            assert response is not None
            assert response.provider == "google"
    
    @pytest.mark.asyncio
    async def test_invoke_different_task_types(self, google_config, mock_genai):
        """Test invocation with different task types."""
        provider = GoogleProvider(config=google_config, genai_module=mock_genai)
        
        task_types = ["planning", "code_generation", "analysis", "decision", "simple"]
        
        for task_type in task_types:
            request = LLMRequest(
                prompt=f"Test for {task_type}",
                task_type=task_type
            )
            
            response = await provider.invoke("gemini-1.5-flash", request)
            
            assert response is not None
            assert response.provider == "google"
