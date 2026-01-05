"""
SmartSpec Pro - Ollama Provider Tests
Comprehensive tests for OllamaProvider including edge cases

Coverage targets:
- create_default_config() method
- Disabled provider handling
- Connection error handling
- API error handling
- close() method
- Lazy initialization
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import ProviderConfig, ProviderError
from app.llm_proxy.providers.ollama_provider import OllamaProvider


# =============================================================================
# Helper Functions
# =============================================================================

def create_ollama_config(enabled: bool = True) -> ProviderConfig:
    """Create Ollama provider config for testing."""
    return ProviderConfig(
        name="Ollama",
        type="ollama",
        base_url="http://localhost:11434",
        models=["llama3:8b", "codellama:7b", "mistral:7b"],
        cost_per_1k_tokens={
            "llama3:8b": 0.0,
            "codellama:7b": 0.0,
            "mistral:7b": 0.0
        },
        max_tokens={
            "llama3:8b": 8192,
            "codellama:7b": 16384,
            "mistral:7b": 8192
        },
        capabilities=["code_generation", "simple"],
        enabled=enabled
    )


def create_mock_http_client(response_content: str = "Test response"):
    """Create mock HTTP client for testing."""
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.json.return_value = {"response": response_content}
    mock_response.raise_for_status = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    return mock_client


# =============================================================================
# Test: create_default_config() - Quick Win #1
# =============================================================================

class TestCreateDefaultConfig:
    """Test create_default_config class method."""
    
    def test_create_default_config_basic(self):
        """Test creating default config with no arguments."""
        config = OllamaProvider.create_default_config()
        
        assert config.name == "Ollama"
        assert config.type == "ollama"
        assert config.api_key is None  # Ollama doesn't need API key
        assert config.base_url == "http://localhost:11434"
        assert config.enabled is False  # Disabled by default
    
    def test_create_default_config_with_custom_base_url(self):
        """Test creating default config with custom base URL."""
        config = OllamaProvider.create_default_config(
            base_url="http://192.168.1.100:11434"
        )
        
        assert config.base_url == "http://192.168.1.100:11434"
    
    def test_create_default_config_enabled(self):
        """Test creating default config with enabled=True."""
        config = OllamaProvider.create_default_config(enabled=True)
        
        assert config.enabled is True
    
    def test_create_default_config_has_models(self):
        """Test that default config includes models."""
        config = OllamaProvider.create_default_config()
        
        assert len(config.models) > 0
        assert "llama3:70b" in config.models or "llama3:8b" in config.models
    
    def test_create_default_config_has_capabilities(self):
        """Test that default config includes capabilities."""
        config = OllamaProvider.create_default_config()
        
        assert len(config.capabilities) > 0
        assert "simple" in config.capabilities
    
    def test_create_default_config_free_cost(self):
        """Test that all models have zero cost (Ollama is free)."""
        config = OllamaProvider.create_default_config()
        
        for model, cost in config.cost_per_1k_tokens.items():
            assert cost == 0.0, f"Model {model} should be free"


# =============================================================================
# Test: Disabled Provider - Quick Win #2
# =============================================================================

class TestDisabledProvider:
    """Test provider behavior when disabled."""
    
    @pytest.mark.asyncio
    async def test_invoke_disabled_provider_raises_error(self):
        """Test that invoking a disabled provider raises ProviderError."""
        config = create_ollama_config(enabled=False)
        provider = OllamaProvider(config)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert "disabled" in str(exc_info.value).lower()
        assert exc_info.value.provider == "ollama"
    
    @pytest.mark.asyncio
    async def test_disabled_provider_error_message(self):
        """Test that disabled provider error has correct message."""
        config = create_ollama_config(enabled=False)
        provider = OllamaProvider(config)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert "Ollama provider is disabled" in str(exc_info.value)


# =============================================================================
# Test: Connection Error Handling - Quick Win #3
# =============================================================================

class TestConnectionErrorHandling:
    """Test connection error handling."""
    
    @pytest.mark.asyncio
    async def test_connection_refused_error(self):
        """Test handling of connection refused error."""
        config = create_ollama_config()
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception("Connection refused"))
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert "Ollama is not running" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_connect_error(self):
        """Test handling of ConnectError."""
        config = create_ollama_config()
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception("ConnectError: Unable to connect"))
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert "ollama serve" in str(exc_info.value).lower()


# =============================================================================
# Test: API Error Handling - Quick Win #4
# =============================================================================

class TestAPIErrorHandling:
    """Test API error handling."""
    
    @pytest.mark.asyncio
    async def test_generic_api_error(self):
        """Test handling of generic API error."""
        config = create_ollama_config()
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception("Internal Server Error"))
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert "Ollama API error" in str(exc_info.value)
        assert "Internal Server Error" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_http_status_error(self):
        """Test handling of HTTP status error."""
        config = create_ollama_config()
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = Exception("404 Not Found")
        mock_client.post = AsyncMock(return_value=mock_response)
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert exc_info.value.provider == "ollama"
    
    @pytest.mark.asyncio
    async def test_error_preserves_original_exception(self):
        """Test that original exception is preserved in ProviderError."""
        config = create_ollama_config()
        original_error = ValueError("Original error message")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=original_error)
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("llama3:8b", request)
        
        assert exc_info.value.original_error is original_error


# =============================================================================
# Test: close() Method - Quick Win #5
# =============================================================================

class TestCloseMethod:
    """Test close() method for HTTP client cleanup."""
    
    @pytest.mark.asyncio
    async def test_close_owned_client(self):
        """Test closing an owned HTTP client."""
        config = create_ollama_config()
        
        # Create provider without injecting client (will create its own)
        with patch.dict('sys.modules', {'httpx': MagicMock()}):
            import sys
            mock_httpx = sys.modules['httpx']
            mock_client = AsyncMock()
            mock_httpx.AsyncClient.return_value = mock_client
            
            provider = OllamaProvider(config)
            # Manually set the client to simulate lazy initialization
            provider._http_client = mock_client
            provider._owns_client = True
            
            # Close the client
            await provider.close()
            
            # Verify client was closed
            mock_client.aclose.assert_called_once()
            assert provider._http_client is None
    
    @pytest.mark.asyncio
    async def test_close_injected_client_not_closed(self):
        """Test that injected client is not closed (we don't own it)."""
        config = create_ollama_config()
        mock_client = AsyncMock()
        
        # Inject client (provider doesn't own it)
        provider = OllamaProvider(config, http_client=mock_client)
        
        # Close should not close injected client
        await provider.close()
        
        # Verify client was NOT closed (we don't own it)
        mock_client.aclose.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_close_when_no_client(self):
        """Test close() when no client was ever created."""
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        # Close without ever accessing client
        await provider.close()
        
        # Should not raise any errors
        assert provider._http_client is None


# =============================================================================
# Test: Lazy Initialization - Quick Win #6
# =============================================================================

class TestLazyInitialization:
    """Test lazy initialization of HTTP client."""
    
    def test_client_not_created_on_init(self):
        """Test that client is not created during initialization."""
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        # Client should be None initially
        assert provider._http_client is None
    
    def test_client_created_on_first_access(self):
        """Test that client is created on first access."""
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        # Mock httpx at import time inside the property
        with patch.dict('sys.modules', {'httpx': MagicMock()}):
            import sys
            mock_httpx = sys.modules['httpx']
            mock_client = MagicMock()
            mock_httpx.AsyncClient.return_value = mock_client
            
            # Access client - this triggers lazy initialization
            client = provider.http_client
            
            # Verify client was created
            assert client is not None
    
    def test_client_reused_on_subsequent_access(self):
        """Test that client is reused on subsequent access."""
        config = create_ollama_config()
        mock_client = MagicMock()
        
        # Inject a mock client
        provider = OllamaProvider(config, http_client=mock_client)
        
        # Access client multiple times
        client1 = provider.http_client
        client2 = provider.http_client
        
        # Verify same client is returned
        assert client1 is client2
        assert client1 is mock_client


# =============================================================================
# Test: Successful Invocation (Existing)
# =============================================================================

class TestSuccessfulInvocation:
    """Test successful invocation scenarios."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self):
        """Test successful Ollama invocation."""
        config = create_ollama_config()
        mock_client = create_mock_http_client("Hello, world!")
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(
            prompt="Say hello",
            task_type="simple",
            temperature=0.7
        )
        
        response = await provider.invoke("llama3:8b", request)
        
        assert response.content == "Hello, world!"
        assert response.provider == "ollama"
        assert response.model == "llama3:8b"
        assert response.cost == 0.0  # Ollama is free
    
    @pytest.mark.asyncio
    async def test_invoke_with_max_tokens(self):
        """Test invocation with custom max_tokens."""
        config = create_ollama_config()
        mock_client = create_mock_http_client("Response")
        
        provider = OllamaProvider(config, http_client=mock_client)
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            max_tokens=500
        )
        
        await provider.invoke("llama3:8b", request)
        
        # Verify max_tokens was passed to API
        call_args = mock_client.post.call_args
        payload = call_args.kwargs.get('json', {})
        assert payload['options']['num_predict'] == 500


# =============================================================================
# Test: Token Estimation
# =============================================================================

class TestTokenEstimation:
    """Test token estimation logic."""
    
    def test_estimate_tokens(self):
        """Test token estimation from text."""
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        prompt = "Hello world"  # 2 words
        response = "Hi there how are you"  # 5 words
        
        tokens = provider._estimate_tokens(prompt, response)
        
        # 7 words * 1.3 = ~9 tokens
        assert tokens == int(7 * 1.3)
    
    def test_estimate_tokens_empty(self):
        """Test token estimation with empty strings."""
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        tokens = provider._estimate_tokens("", "")
        
        assert tokens == 0


# =============================================================================
# Test: Base URL Configuration
# =============================================================================

class TestBaseURLConfiguration:
    """Test base URL configuration."""
    
    def test_default_base_url(self):
        """Test default base URL."""
        config = ProviderConfig(
            name="Ollama",
            type="ollama",
            models=["llama3:8b"]
        )
        provider = OllamaProvider(config)
        
        assert provider.base_url == "http://localhost:11434"
    
    def test_custom_base_url(self):
        """Test custom base URL from config."""
        config = ProviderConfig(
            name="Ollama",
            type="ollama",
            base_url="http://remote-server:11434",
            models=["llama3:8b"]
        )
        provider = OllamaProvider(config)
        
        assert provider.base_url == "http://remote-server:11434"
