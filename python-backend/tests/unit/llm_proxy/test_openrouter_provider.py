"""
SmartSpec Pro - OpenRouter Provider Tests
Comprehensive tests for OpenRouterProvider including edge cases

Coverage targets:
- create_default_config() method
- Disabled provider handling
- API error handling
- get_accurate_cost() method
- Extra headers (site_url, site_name)
- System prompt handling
- Lazy initialization
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import ProviderConfig, ProviderError
from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider


# =============================================================================
# Helper Functions
# =============================================================================

def create_openrouter_config(
    api_key: str = "test-api-key",
    enabled: bool = True
) -> ProviderConfig:
    """Create OpenRouter provider config for testing."""
    return ProviderConfig(
        name="OpenRouter",
        type="openrouter",
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        models=[
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "anthropic/claude-3.5-sonnet"
        ],
        cost_per_1k_tokens={
            "openai/gpt-4o": 0.005,
            "openai/gpt-4o-mini": 0.00015,
            "anthropic/claude-3.5-sonnet": 0.003
        },
        max_tokens={
            "openai/gpt-4o": 4096,
            "openai/gpt-4o-mini": 4096,
            "anthropic/claude-3.5-sonnet": 4096
        },
        capabilities=["planning", "code_generation", "analysis"],
        enabled=enabled
    )


def create_mock_openai_client(response_content: str = "Test response"):
    """Create mock OpenAI-compatible client for testing."""
    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.id = "gen-test-123"
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = response_content
    mock_response.choices[0].finish_reason = "stop"
    mock_response.usage = MagicMock()
    mock_response.usage.total_tokens = 100
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    return mock_client


# =============================================================================
# Test: create_default_config() - Quick Win #1
# =============================================================================

class TestCreateDefaultConfig:
    """Test create_default_config class method."""
    
    def test_create_default_config_basic(self):
        """Test creating default config with API key."""
        config = OpenRouterProvider.create_default_config(api_key="sk-or-test-key")
        
        assert config.name == "OpenRouter"
        assert config.type == "openrouter"
        assert config.api_key == "sk-or-test-key"
        assert config.base_url == "https://openrouter.ai/api/v1"
        assert config.enabled is True  # Enabled by default
    
    def test_create_default_config_disabled(self):
        """Test creating default config with enabled=False."""
        config = OpenRouterProvider.create_default_config(
            api_key="sk-or-test-key",
            enabled=False
        )
        
        assert config.enabled is False
    
    def test_create_default_config_has_models(self):
        """Test that default config includes models."""
        config = OpenRouterProvider.create_default_config(api_key="test")
        
        assert len(config.models) > 0
        assert "openai/gpt-4o" in config.models
        assert "anthropic/claude-3.5-sonnet" in config.models
    
    def test_create_default_config_has_capabilities(self):
        """Test that default config includes capabilities."""
        config = OpenRouterProvider.create_default_config(api_key="test")
        
        assert len(config.capabilities) > 0
        assert "planning" in config.capabilities
        assert "code_generation" in config.capabilities
    
    def test_create_default_config_has_costs(self):
        """Test that default config includes cost information."""
        config = OpenRouterProvider.create_default_config(api_key="test")
        
        assert len(config.cost_per_1k_tokens) > 0
        # GPT-4o should be more expensive than GPT-4o-mini
        assert config.cost_per_1k_tokens.get("openai/gpt-4o", 0) > \
               config.cost_per_1k_tokens.get("openai/gpt-4o-mini", 0)


# =============================================================================
# Test: Disabled Provider - Quick Win #2
# =============================================================================

class TestDisabledProvider:
    """Test provider behavior when disabled."""
    
    @pytest.mark.asyncio
    async def test_invoke_disabled_provider_raises_error(self):
        """Test that invoking a disabled provider raises ProviderError."""
        config = create_openrouter_config(enabled=False)
        provider = OpenRouterProvider(config)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert "disabled" in str(exc_info.value).lower()
        assert exc_info.value.provider == "openrouter"
    
    @pytest.mark.asyncio
    async def test_disabled_provider_error_message(self):
        """Test that disabled provider error has correct message."""
        config = create_openrouter_config(enabled=False)
        provider = OpenRouterProvider(config)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert "OpenRouter provider is disabled" in str(exc_info.value)


# =============================================================================
# Test: API Error Handling - Quick Win #3
# =============================================================================

class TestAPIErrorHandling:
    """Test API error handling."""
    
    @pytest.mark.asyncio
    async def test_generic_api_error(self):
        """Test handling of generic API error."""
        config = create_openrouter_config()
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("Rate limit exceeded")
        )
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert "OpenRouter API error" in str(exc_info.value)
        assert "Rate limit exceeded" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_authentication_error(self):
        """Test handling of authentication error."""
        config = create_openrouter_config()
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("Invalid API key")
        )
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert exc_info.value.provider == "openrouter"
    
    @pytest.mark.asyncio
    async def test_error_preserves_original_exception(self):
        """Test that original exception is preserved in ProviderError."""
        config = create_openrouter_config()
        original_error = ValueError("Original error message")
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=original_error)
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("openai/gpt-4o", request)
        
        assert exc_info.value.original_error is original_error


# =============================================================================
# Test: get_accurate_cost() - Quick Win #4
# =============================================================================

class TestGetAccurateCost:
    """Test get_accurate_cost method."""
    
    @pytest.mark.asyncio
    async def test_get_accurate_cost_success(self):
        """Test successful retrieval of accurate cost."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "id": "gen-test-123",
            "native_tokens_prompt": 50,
            "native_tokens_completion": 100,
            "total_cost": 0.0015
        }
        mock_response.raise_for_status = MagicMock()
        
        with patch('httpx.AsyncClient') as mock_httpx:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.return_value.__aenter__.return_value = mock_client
            
            result = await provider.get_accurate_cost("gen-test-123")
            
            assert result["total_cost"] == 0.0015
            assert result["native_tokens_prompt"] == 50
    
    @pytest.mark.asyncio
    async def test_get_accurate_cost_error_returns_empty(self):
        """Test that errors return empty dict."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        with patch('httpx.AsyncClient') as mock_httpx:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=Exception("Network error"))
            mock_httpx.return_value.__aenter__.return_value = mock_client
            
            result = await provider.get_accurate_cost("gen-test-123")
            
            assert result == {}
    
    @pytest.mark.asyncio
    async def test_get_accurate_cost_uses_correct_endpoint(self):
        """Test that correct endpoint is called."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        mock_response = MagicMock()
        mock_response.json.return_value = {}
        mock_response.raise_for_status = MagicMock()
        
        with patch('httpx.AsyncClient') as mock_httpx:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.return_value.__aenter__.return_value = mock_client
            
            await provider.get_accurate_cost("gen-abc-456")
            
            # Verify correct URL was called
            call_args = mock_client.get.call_args
            assert "generation?id=gen-abc-456" in str(call_args)


# =============================================================================
# Test: Extra Headers - Quick Win #5
# =============================================================================

class TestExtraHeaders:
    """Test extra headers (site_url, site_name)."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_site_url(self):
        """Test that HTTP-Referer header is sent when site_url is set."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(
            config,
            client=mock_client,
            site_url="https://smartspec.pro"
        )
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify extra_headers was passed
        call_args = mock_client.chat.completions.create.call_args
        extra_headers = call_args.kwargs.get('extra_headers', {})
        assert extra_headers.get("HTTP-Referer") == "https://smartspec.pro"
    
    @pytest.mark.asyncio
    async def test_invoke_with_site_name(self):
        """Test that X-Title header is sent when site_name is set."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(
            config,
            client=mock_client,
            site_name="SmartSpec Pro"
        )
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify extra_headers was passed
        call_args = mock_client.chat.completions.create.call_args
        extra_headers = call_args.kwargs.get('extra_headers', {})
        assert extra_headers.get("X-Title") == "SmartSpec Pro"
    
    @pytest.mark.asyncio
    async def test_invoke_with_both_site_info(self):
        """Test that both headers are sent when both are set."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(
            config,
            client=mock_client,
            site_url="https://smartspec.pro",
            site_name="SmartSpec Pro"
        )
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify both headers were passed
        call_args = mock_client.chat.completions.create.call_args
        extra_headers = call_args.kwargs.get('extra_headers', {})
        assert extra_headers.get("HTTP-Referer") == "https://smartspec.pro"
        assert extra_headers.get("X-Title") == "SmartSpec Pro"
    
    @pytest.mark.asyncio
    async def test_invoke_without_site_info(self):
        """Test that no extra headers are sent when site info is not set."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify extra_headers is None or empty
        call_args = mock_client.chat.completions.create.call_args
        extra_headers = call_args.kwargs.get('extra_headers')
        assert extra_headers is None or extra_headers == {}


# =============================================================================
# Test: System Prompt Handling - Quick Win #6
# =============================================================================

class TestSystemPromptHandling:
    """Test system prompt handling."""
    
    @pytest.mark.asyncio
    async def test_invoke_with_system_prompt(self):
        """Test that system prompt is included in messages."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(
            prompt="What is 2+2?",
            task_type="simple",
            system_prompt="You are a helpful math tutor."
        )
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify messages include system prompt
        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs.get('messages', [])
        
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are a helpful math tutor."
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "What is 2+2?"
    
    @pytest.mark.asyncio
    async def test_invoke_without_system_prompt(self):
        """Test that only user message is sent when no system prompt."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(
            prompt="Hello",
            task_type="simple"
        )
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify messages only include user message
        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs.get('messages', [])
        
        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Hello"
    
    def test_build_messages_with_system_prompt(self):
        """Test _build_messages helper with system prompt."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        request = LLMRequest(
            prompt="User message",
            system_prompt="System message"
        )
        
        messages = provider._build_messages(request)
        
        assert len(messages) == 2
        assert messages[0] == {"role": "system", "content": "System message"}
        assert messages[1] == {"role": "user", "content": "User message"}
    
    def test_build_messages_without_system_prompt(self):
        """Test _build_messages helper without system prompt."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        request = LLMRequest(prompt="User message only")
        
        messages = provider._build_messages(request)
        
        assert len(messages) == 1
        assert messages[0] == {"role": "user", "content": "User message only"}


# =============================================================================
# Test: Lazy Initialization - Quick Win #7
# =============================================================================

class TestLazyInitialization:
    """Test lazy initialization of OpenAI client."""
    
    def test_client_not_created_on_init(self):
        """Test that client is not created during initialization."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        # Client should be None initially
        assert provider._client is None
    
    def test_client_created_on_first_access(self):
        """Test that client is created on first access."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        # Mock openai module at import time
        with patch('openai.AsyncOpenAI') as mock_openai:
            mock_client = MagicMock()
            mock_openai.return_value = mock_client
            
            # Access client - this triggers lazy initialization
            client = provider.client
            
            # Verify client was created
            assert client is not None
    
    def test_client_reused_on_subsequent_access(self):
        """Test that client is reused on subsequent access."""
        config = create_openrouter_config()
        mock_client = MagicMock()
        
        # Inject a mock client
        provider = OpenRouterProvider(config, client=mock_client)
        
        # Access client multiple times
        client1 = provider.client
        client2 = provider.client
        
        # Verify same client is returned
        assert client1 is client2
        assert client1 is mock_client


# =============================================================================
# Test: Successful Invocation
# =============================================================================

class TestSuccessfulInvocation:
    """Test successful invocation scenarios."""
    
    @pytest.mark.asyncio
    async def test_invoke_success(self):
        """Test successful OpenRouter invocation."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client("Hello from GPT-4o!")
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(
            prompt="Say hello",
            task_type="simple",
            temperature=0.7
        )
        
        response = await provider.invoke("openai/gpt-4o", request)
        
        assert response.content == "Hello from GPT-4o!"
        assert response.provider == "openrouter"
        assert response.model == "openai/gpt-4o"
        assert response.tokens_used == 100
    
    @pytest.mark.asyncio
    async def test_invoke_calculates_cost(self):
        """Test that cost is calculated correctly."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        mock_client.chat.completions.create.return_value.usage.total_tokens = 1000
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        response = await provider.invoke("openai/gpt-4o", request)
        
        # 1000 tokens * $0.005/1k = $0.005
        assert response.cost == 0.005
    
    @pytest.mark.asyncio
    async def test_invoke_with_max_tokens(self):
        """Test invocation with custom max_tokens."""
        config = create_openrouter_config()
        mock_client = create_mock_openai_client()
        
        provider = OpenRouterProvider(config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            max_tokens=500
        )
        
        await provider.invoke("openai/gpt-4o", request)
        
        # Verify max_tokens was passed to API
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs.get('max_tokens') == 500


# =============================================================================
# Test: Cost Calculation
# =============================================================================

class TestCostCalculation:
    """Test cost calculation logic."""
    
    def test_calculate_cost_gpt4o(self):
        """Test cost calculation for GPT-4o."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        cost = provider.calculate_cost("openai/gpt-4o", 1000)
        
        # $0.005 per 1k tokens
        assert cost == 0.005
    
    def test_calculate_cost_gpt4o_mini(self):
        """Test cost calculation for GPT-4o-mini."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        cost = provider.calculate_cost("openai/gpt-4o-mini", 1000)
        
        # $0.00015 per 1k tokens
        assert cost == 0.00015
    
    def test_calculate_cost_unknown_model(self):
        """Test cost calculation for unknown model."""
        config = create_openrouter_config()
        provider = OpenRouterProvider(config)
        
        cost = provider.calculate_cost("unknown/model", 1000)
        
        # Should return 0 for unknown models
        assert cost == 0.0
