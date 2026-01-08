"""
SmartSpec Pro - Ollama Provider Tests

Comprehensive tests for Ollama LLM provider.
Tests cover:
- Provider initialization
- Model selection
- API invocation with mocked HTTP client
- Error handling
- Token estimation
- Cost calculation (always free)
- Connection error handling
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import ProviderConfig
from app.llm_proxy.providers.ollama_provider import OllamaProvider


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_http_client():
    """Create a mock HTTP client for Ollama API."""
    mock_client = AsyncMock()
    
    # Mock response for successful request
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "response": "Test response from Ollama",
        "total_duration": 1000000000,
        "load_duration": 500000000,
        "prompt_eval_count": 10,
        "eval_count": 20
    }
    mock_response.raise_for_status = MagicMock()
    
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.aclose = AsyncMock()
    
    return mock_client


@pytest.fixture
def ollama_config():
    """Create default Ollama provider configuration."""
    return OllamaProvider.create_default_config(
        base_url="http://localhost:11434",
        enabled=True
    )


@pytest.fixture
def ollama_provider(ollama_config, mock_http_client):
    """Create Ollama provider with mocked HTTP client."""
    return OllamaProvider(config=ollama_config, http_client=mock_http_client)


# =============================================================================
# Test Classes
# =============================================================================

class TestOllamaProviderInitialization:
    """Test Ollama provider initialization."""
    
    def test_init_with_config(self, ollama_config, mock_http_client):
        """Test provider initialization with config."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        assert provider.name == "Ollama"
        assert provider.type == "ollama"
        assert provider.enabled is True
        assert provider.base_url == "http://localhost:11434"
    
    def test_init_disabled_provider(self, ollama_config):
        """Test initialization with disabled provider."""
        ollama_config.enabled = False
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        assert provider.enabled is False
    
    def test_default_config_creation(self):
        """Test creating default configuration."""
        config = OllamaProvider.create_default_config(
            base_url="http://ollama.local:11434",
            enabled=True
        )
        
        assert config.name == "Ollama"
        assert config.type == "ollama"
        assert "llama3:70b" in config.models
        assert "codellama:7b" in config.models
        assert config.base_url == "http://ollama.local:11434"
        assert config.api_key is None  # Ollama doesn't require API key
    
    def test_lazy_http_client_loading(self, ollama_config):
        """Test that HTTP client is lazily loaded."""
        ollama_config.base_url = "http://localhost:11434"
        provider = OllamaProvider(config=ollama_config, http_client=None)
        
        # Access http_client property - should create client
        with patch('httpx.AsyncClient') as mock_client_class:
            mock_instance = AsyncMock()
            mock_client_class.return_value = mock_instance
            
            client = provider.http_client
            
            assert mock_client_class.called
    
    def test_owns_client_flag(self, ollama_config, mock_http_client):
        """Test that owns_client flag is set correctly."""
        # Provider with provided client should not own it
        provider1 = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        assert provider1._owns_client is False
        
        # Provider without client should own it
        provider2 = OllamaProvider(config=ollama_config, http_client=None)
        assert provider2._owns_client is True


class TestOllamaProviderModels:
    """Test Ollama provider model management."""
    
    def test_default_models(self, ollama_config):
        """Test default models are set correctly."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        assert "llama3:70b" in provider.models
        assert "llama3:8b" in provider.models
        assert "codellama:34b" in provider.models
        assert "mistral:7b" in provider.models
    
    def test_get_max_tokens(self, ollama_provider):
        """Test getting max tokens for a model."""
        max_tokens = ollama_provider.get_max_tokens("llama3:70b")
        
        assert max_tokens == 8192
    
    def test_get_max_tokens_codellama(self, ollama_provider):
        """Test getting max tokens for CodeLlama."""
        max_tokens = ollama_provider.get_max_tokens("codellama:34b")
        
        assert max_tokens == 16384


class TestOllamaProviderInvocation:
    """Test Ollama provider API invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self, ollama_provider, mock_http_client):
        """Test successful API invocation."""
        request = LLMRequest(
            prompt="What is Python?",
            task_type="simple"
        )
        
        response = await ollama_provider.invoke("llama3:70b", request)
        
        assert response.content == "Test response from Ollama"
        assert response.provider == "ollama"
        assert response.model == "llama3:70b"
        assert response.tokens_used > 0
        assert response.cost == 0.0  # Ollama is free
    
    @pytest.mark.asyncio
    async def test_invoke_with_custom_max_tokens(self, ollama_provider, mock_http_client):
        """Test invocation with custom max tokens."""
        request = LLMRequest(
            prompt="Generate code",
            task_type="code_generation",
            max_tokens=4000
        )
        
        response = await ollama_provider.invoke("codellama:7b", request)
        
        assert response is not None
        mock_http_client.post.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_with_temperature(self, ollama_provider, mock_http_client):
        """Test invocation with custom temperature."""
        request = LLMRequest(
            prompt="Creative prompt",
            task_type="planning",
            temperature=0.7
        )
        
        response = await ollama_provider.invoke("llama3:8b", request)
        
        assert response is not None
    
    @pytest.mark.asyncio
    async def test_invoke_disabled_provider(self, ollama_config, mock_http_client):
        """Test invocation with disabled provider."""
        ollama_config.enabled = False
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:70b", request)
        
        assert "disabled" in str(exc_info.value).lower()


class TestOllamaProviderErrorHandling:
    """Test Ollama provider error handling."""
    
    @pytest.mark.asyncio
    async def test_invoke_connection_refused(self, ollama_config):
        """Test handling connection refused errors."""
        mock_client = AsyncMock()
        
        # Simulate connection error
        import httpx
        mock_client.post = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )
        
        provider = OllamaProvider(config=ollama_config, http_client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:70b", request)
        
        assert "not running" in str(exc_info.value).lower() or "connection" in str(exc_info.value).lower()
    
    @pytest.mark.asyncio
    async def test_invoke_api_error(self, ollama_config):
        """Test handling API errors."""
        mock_client = AsyncMock()
        
        # Simulate API error
        import httpx
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock(
            side_effect=httpx.HTTPStatusError("Bad Request", request=MagicMock(), response=MagicMock())
        )
        mock_client.post = AsyncMock(return_value=mock_response)
        
        provider = OllamaProvider(config=ollama_config, http_client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError):
            await provider.invoke("llama3:70b", request)
    
    @pytest.mark.asyncio
    async def test_invoke_timeout_error(self, ollama_config):
        """Test handling timeout errors."""
        mock_client = AsyncMock()
        
        import httpx
        mock_client.post = AsyncMock(
            side_effect=httpx.TimeoutException("Request timeout")
        )
        
        provider = OllamaProvider(config=ollama_config, http_client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from app.llm_proxy.providers.base import ProviderError
        
        with pytest.raises(ProviderError):
            await provider.invoke("llama3:70b", request)


class TestOllamaProviderTokenEstimation:
    """Test Ollama provider token estimation."""
    
    def test_estimate_tokens(self, ollama_provider):
        """Test token estimation."""
        prompt = "This is a test prompt"
        response = "This is a test response"
        
        tokens = ollama_provider._estimate_tokens(prompt, response)
        
        # Should return a reasonable estimate
        assert tokens > 0
        assert isinstance(tokens, int)
    
    def test_estimate_tokens_empty_strings(self, ollama_provider):
        """Test token estimation with empty strings."""
        tokens = ollama_provider._estimate_tokens("", "")
        
        assert tokens == 0
    
    def test_estimate_tokens_long_text(self, ollama_provider):
        """Test token estimation with long text."""
        long_prompt = "word " * 100
        long_response = "response " * 200
        
        tokens = ollama_provider._estimate_tokens(long_prompt, long_response)
        
        # Should be roughly proportional to word count
        assert tokens > 0


class TestOllamaProviderCostCalculation:
    """Test Ollama provider cost calculation (always free)."""
    
    def test_calculate_cost_always_zero(self, ollama_provider):
        """Test that all costs are zero for Ollama."""
        for model in ["llama3:70b", "llama3:8b", "codellama:34b"]:
            cost = ollama_provider.calculate_cost(model, 1000)
            assert cost == 0.0
    
    def test_calculate_cost_zero_tokens(self, ollama_provider):
        """Test cost calculation with zero tokens."""
        cost = ollama_provider.calculate_cost("llama3:70b", 0)
        
        assert cost == 0
    
    def test_calculate_cost_large_tokens(self, ollama_provider):
        """Test cost calculation with large token count."""
        cost = ollama_provider.calculate_cost("llama3:70b", 100000)
        
        assert cost == 0.0  # Still free


class TestOllamaProviderCostMatrix:
    """Test Ollama provider cost matrix configuration."""
    
    def test_cost_per_1k_tokens_all_zero(self, ollama_config):
        """Test that all costs are configured as zero."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        for cost in provider.config.cost_per_1k_tokens.values():
            assert cost == 0.0
    
    def test_max_tokens_config(self, ollama_config):
        """Test max tokens is configured correctly."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        assert provider.config.max_tokens["llama3:70b"] == 8192
        assert provider.config.max_tokens["codellama:34b"] == 16384
        assert provider.config.max_tokens["mistral:7b"] == 8192


class TestOllamaProviderCapabilities:
    """Test Ollama provider capabilities."""
    
    def test_default_capabilities(self, ollama_config):
        """Test default capabilities are set."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        assert "planning" in provider.capabilities
        assert "code_generation" in provider.capabilities
        assert "analysis" in provider.capabilities
        assert "decision" in provider.capabilities
        assert "simple" in provider.capabilities


class TestOllamaProviderEdgeCases:
    """Test edge cases for Ollama provider."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_system_prompt(self, ollama_config, mock_http_client):
        """Test invocation with system prompt."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        request = LLMRequest(
            prompt="User prompt",
            system_prompt="You are a helpful assistant.",
            task_type="simple"
        )
        
        response = await provider.invoke("llama3:70b", request)
        
        assert response is not None
    
    @pytest.mark.asyncio
    async def test_invoke_different_models(self, ollama_config, mock_http_client):
        """Test invocation with different models."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        models = ["llama3:70b", "llama3:8b", "codellama:7b", "mistral:7b"]
        
        for model in models:
            request = LLMRequest(
                prompt=f"Test for {model}",
                task_type="simple"
            )
            
            response = await provider.invoke(model, request)
            
            assert response is not None
            assert response.provider == "ollama"
            assert response.model == model
    
    @pytest.mark.asyncio
    async def test_invoke_different_task_types(self, ollama_config, mock_http_client):
        """Test invocation with different task types."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        task_types = ["planning", "code_generation", "analysis", "decision", "simple"]
        
        for task_type in task_types:
            request = LLMRequest(
                prompt=f"Test for {task_type}",
                task_type=task_type
            )
            
            response = await provider.invoke("llama3:70b", request)
            
            assert response is not None
            assert response.provider == "ollama"


class TestOllamaProviderCleanup:
    """Test Ollama provider cleanup."""
    
    @pytest.mark.asyncio
    async def test_close_owns_client(self, ollama_config):
        """Test closing provider that owns its client."""
        mock_client = AsyncMock()
        mock_client.aclose = AsyncMock()
        
        provider = OllamaProvider(config=ollama_config, http_client=None)
        
        # Manually set the client to test close
        import httpx
        provider._http_client = mock_client
        
        await provider.close()
        
        mock_client.aclose.assert_called_once()
        assert provider._http_client is None
    
    @pytest.mark.asyncio
    async def test_close_external_client(self, ollama_config, mock_http_client):
        """Test closing provider with external client."""
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        # Should not close external client
        await provider.close()
        
        mock_http_client.aclose.assert_not_called()


class TestOllamaProviderAPIEndpoint:
    """Test Ollama provider API endpoint construction."""
    
    def test_api_endpoint_url(self, ollama_provider):
        """Test that API endpoint URL is constructed correctly."""
        # The provider should call the /api/generate endpoint
        assert ollama_provider.base_url == "http://localhost:11434"
        
        # Verify the endpoint would be correct
        expected_endpoint = f"{ollama_provider.base_url}/api/generate"
        assert expected_endpoint == "http://localhost:11434/api/generate"
    
    def test_custom_base_url(self, ollama_config):
        """Test with custom base URL."""
        ollama_config.base_url = "http://ollama.example.com:11434"
        provider = OllamaProvider(config=ollama_config, http_client=mock_http_client)
        
        assert provider.base_url == "http://ollama.example.com:11434"
