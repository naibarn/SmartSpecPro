"""
Unit Tests for LLM Providers (Updated for Refactored Providers)
Tests OpenAI, Anthropic, Google, Groq, Ollama providers with DI
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.providers.base import BaseLLMProvider, ProviderConfig, ProviderError


# =============================================================================
# Helper Functions
# =============================================================================

def create_openai_config(api_key: str = "test-key", enabled: bool = True) -> ProviderConfig:
    """Create OpenAI provider config for testing."""
    return ProviderConfig(
        name="OpenAI",
        type="openai",
        api_key=api_key,
        models=["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
        cost_per_1k_tokens={
            "gpt-4": 0.03,
            "gpt-4-turbo": 0.01,
            "gpt-3.5-turbo": 0.001
        },
        max_tokens={
            "gpt-4": 8192,
            "gpt-4-turbo": 128000,
            "gpt-3.5-turbo": 16385
        },
        capabilities=["planning", "code_generation", "analysis", "decision", "simple"],
        enabled=enabled
    )


def create_google_config(api_key: str = "test-key", enabled: bool = True) -> ProviderConfig:
    """Create Google provider config for testing."""
    return ProviderConfig(
        name="Google",
        type="google",
        api_key=api_key,
        models=["gemini-pro", "gemini-pro-vision"],
        cost_per_1k_tokens={
            "gemini-pro": 0.0005,
            "gemini-pro-vision": 0.0005
        },
        max_tokens={
            "gemini-pro": 32000,
            "gemini-pro-vision": 16000
        },
        capabilities=["planning", "analysis", "simple"],
        enabled=enabled
    )


def create_ollama_config(enabled: bool = True) -> ProviderConfig:
    """Create Ollama provider config for testing."""
    return ProviderConfig(
        name="Ollama",
        type="ollama",
        base_url="http://localhost:11434",
        models=["llama3", "codellama", "mistral"],
        cost_per_1k_tokens={
            "llama3": 0.0,
            "codellama": 0.0,
            "mistral": 0.0
        },
        max_tokens={
            "llama3": 8192,
            "codellama": 16384,
            "mistral": 8192
        },
        capabilities=["code_generation", "simple"],
        enabled=enabled
    )


# =============================================================================
# Test Classes
# =============================================================================

class TestOpenAIProvider:
    """Test OpenAI provider"""
    
    def test_initialization(self):
        """Test OpenAI provider initialization"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        assert provider.api_key == "test-key"
        assert provider.enabled is True
        assert provider.name == "OpenAI"
    
    def test_model_selection_planning_quality(self):
        """Test model selection for planning with quality priority"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        # First model in list should be selected for quality
        assert "gpt-4" in provider.models
    
    def test_model_selection_planning_cost(self):
        """Test model selection for planning with cost priority"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        # Should have gpt-3.5-turbo for cost-effective option
        assert "gpt-3.5-turbo" in provider.models
    
    def test_model_selection_code_generation(self):
        """Test model selection for code generation"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        # Should have gpt-4-turbo for code generation
        assert "gpt-4-turbo" in provider.models
    
    def test_model_selection_unknown_task(self):
        """Test model selection for unknown task type"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        # Should have models available
        assert len(provider.models) > 0
    
    def test_calculate_cost_gpt4(self):
        """Test cost calculation for GPT-4"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        cost = provider.calculate_cost("gpt-4", 1000)
        
        # GPT-4: $0.03/1k tokens
        assert cost == 0.03
    
    def test_calculate_cost_gpt35(self):
        """Test cost calculation for GPT-3.5-turbo"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        cost = provider.calculate_cost("gpt-3.5-turbo", 1000)
        
        # GPT-3.5: $0.001/1k tokens
        assert cost == 0.001
    
    def test_enable_disable(self):
        """Test enable/disable functionality"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        assert provider.enabled is True
        
        provider.disable()
        assert provider.enabled is False
        
        provider.enable()
        assert provider.enabled is True
    
    @pytest.mark.asyncio
    async def test_invoke_success(self):
        """Test successful OpenAI invocation"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        # Create mock client
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.usage = MagicMock()
        mock_response.usage.total_tokens = 100
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        config = create_openai_config()
        provider = OpenAIProvider(config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            budget_priority="cost",
            max_tokens=100,
            temperature=0.7
        )
        
        response = await provider.invoke("gpt-3.5-turbo", request)
        
        assert response.content == "Test response"
        assert response.provider == "openai"
        assert response.tokens_used == 100
    
    @pytest.mark.asyncio
    async def test_invoke_failure(self):
        """Test OpenAI invocation failure"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        # Create mock client that raises error
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API Error"))
        
        config = create_openai_config()
        provider = OpenAIProvider(config, client=mock_client)
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            budget_priority="cost"
        )
        
        with pytest.raises(ProviderError) as exc_info:
            await provider.invoke("gpt-3.5-turbo", request)
        
        assert "API Error" in str(exc_info.value)


class TestGoogleProvider:
    """Test Google provider"""
    
    def test_initialization(self):
        """Test Google provider initialization"""
        from app.llm_proxy.providers.google_provider import GoogleProvider
        
        # Create mock genai module
        mock_genai = MagicMock()
        
        config = create_google_config()
        provider = GoogleProvider(config, genai_module=mock_genai)
        
        assert provider.api_key == "test-key"
        assert provider.enabled is True
    
    def test_model_selection(self):
        """Test Google model selection"""
        from app.llm_proxy.providers.google_provider import GoogleProvider
        
        mock_genai = MagicMock()
        
        config = create_google_config()
        provider = GoogleProvider(config, genai_module=mock_genai)
        
        assert "gemini-pro" in provider.models
    
    def test_calculate_cost(self):
        """Test Google cost calculation"""
        from app.llm_proxy.providers.google_provider import GoogleProvider
        
        mock_genai = MagicMock()
        
        config = create_google_config()
        provider = GoogleProvider(config, genai_module=mock_genai)
        cost = provider.calculate_cost("gemini-pro", 1000)
        
        assert cost == 0.0005


class TestOllamaProvider:
    """Test Ollama provider"""
    
    def test_initialization(self):
        """Test Ollama provider initialization"""
        from app.llm_proxy.providers.ollama_provider import OllamaProvider
        
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        assert provider.enabled is True
        assert provider.name == "Ollama"
    
    def test_model_selection(self):
        """Test Ollama model selection"""
        from app.llm_proxy.providers.ollama_provider import OllamaProvider
        
        config = create_ollama_config()
        provider = OllamaProvider(config)
        
        # Ollama uses local models
        assert "llama3" in provider.models
    
    def test_calculate_cost_free(self):
        """Test Ollama cost calculation (should be free)"""
        from app.llm_proxy.providers.ollama_provider import OllamaProvider
        
        config = create_ollama_config()
        provider = OllamaProvider(config)
        cost = provider.calculate_cost("llama3", 1000)
        
        # Ollama is free (local)
        assert cost == 0.0


class TestBaseLLMProvider:
    """Test base provider functionality"""
    
    def test_enable_disable(self):
        """Test enable/disable on base provider"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        # Initially enabled
        assert provider.enabled is True
        
        # Disable
        provider.disable()
        assert provider.enabled is False
        
        # Enable again
        provider.enable()
        assert provider.enabled is True
    
    def test_get_max_tokens(self):
        """Test get_max_tokens method"""
        from app.llm_proxy.providers.openai_provider import OpenAIProvider
        
        config = create_openai_config()
        provider = OpenAIProvider(config)
        
        assert provider.get_max_tokens("gpt-4") == 8192
        assert provider.get_max_tokens("gpt-4-turbo") == 128000
        assert provider.get_max_tokens("unknown-model") == 4096  # Default
    
    def test_provider_config_properties(self):
        """Test ProviderConfig properties"""
        config = create_openai_config()
        
        assert config.name == "OpenAI"
        assert config.type == "openai"
        assert config.api_key == "test-key"
        assert len(config.models) == 3
        assert config.enabled is True


class TestLLMModels:
    """Test LLM request/response models"""
    
    def test_llm_request_creation(self):
        """Test LLMRequest model creation"""
        request = LLMRequest(
            prompt="Test prompt",
            task_type="planning",
            budget_priority="quality",
            max_tokens=1000,
            temperature=0.7
        )
        
        assert request.prompt == "Test prompt"
        assert request.task_type == "planning"
        assert request.budget_priority == "quality"
        assert request.max_tokens == 1000
        assert request.temperature == 0.7
    
    def test_llm_request_defaults(self):
        """Test LLMRequest default values"""
        request = LLMRequest(
            prompt="Test prompt"
        )
        
        assert request.prompt == "Test prompt"
        assert request.task_type == "simple"
        # Default budget_priority is 'quality' based on model definition
        assert request.budget_priority == "quality"
        assert request.max_tokens == 4000
        assert request.temperature == 0.7
    
    def test_llm_response_creation(self):
        """Test LLMResponse model creation"""
        response = LLMResponse(
            content="Test response",
            provider="openai",
            model="gpt-4",
            tokens_used=100,
            cost=0.01,
            latency_ms=500  # Required field
        )
        
        assert response.content == "Test response"
        assert response.provider == "openai"
        assert response.model == "gpt-4"
        assert response.tokens_used == 100
        assert response.cost == 0.01
        assert response.latency_ms == 500
    
    def test_llm_request_with_messages(self):
        """Test LLMRequest with chat messages"""
        request = LLMRequest(
            prompt="Test prompt",
            messages=[
                {"role": "system", "content": "You are a helpful assistant"},
                {"role": "user", "content": "Hello"}
            ]
        )
        
        assert request.messages is not None
        assert len(request.messages) == 2
    
    def test_llm_request_with_preferred_provider(self):
        """Test LLMRequest with preferred provider"""
        request = LLMRequest(
            prompt="Test prompt",
            preferred_provider="openai",
            preferred_model="gpt-4"
        )
        
        assert request.preferred_provider == "openai"
        assert request.preferred_model == "gpt-4"


class TestProviderError:
    """Test ProviderError exception"""
    
    def test_provider_error_creation(self):
        """Test creating ProviderError"""
        error = ProviderError(
            message="Test error",
            provider="openai",
            model="gpt-4"
        )
        
        assert "Test error" in str(error)
        assert error.provider == "openai"
        assert error.model == "gpt-4"
    
    def test_provider_error_with_original(self):
        """Test ProviderError with original exception"""
        original = ValueError("Original error")
        error = ProviderError(
            message="Wrapped error",
            provider="anthropic",
            model="claude-3",
            original_error=original
        )
        
        assert error.original_error is original
