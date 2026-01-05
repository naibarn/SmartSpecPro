"""
Tests for StreamingService

Tests the refactored streaming service with proper mocking.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from app.services.streaming_service import (
    StreamingService,
    TokenCounter,
    SSEFormatter,
    OpenAIStreamProvider,
    AnthropicStreamProvider,
    FallbackStreamProvider,
)


class TestTokenCounter:
    """Tests for TokenCounter utility"""
    
    def test_count_tokens_fallback(self):
        """Test token counting with fallback method"""
        text = "Hello world, this is a test"
        count = TokenCounter.count_tokens(text, "unknown-model")
        # Fallback: len(text) // 4
        assert count == len(text) // 4
    
    def test_count_tokens_empty_string(self):
        """Test token counting with empty string"""
        count = TokenCounter.count_tokens("", "gpt-4")
        assert count == 0
    
    def test_count_tokens_for_messages(self):
        """Test token counting for messages"""
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"}
        ]
        count = TokenCounter.count_tokens_for_messages(messages, "unknown-model")
        # Each message: content tokens + 4 overhead
        expected = (len("Hello") // 4 + 4) + (len("Hi there") // 4 + 4)
        assert count == expected
    
    def test_count_tokens_for_empty_messages(self):
        """Test token counting for empty messages"""
        count = TokenCounter.count_tokens_for_messages([], "gpt-4")
        assert count == 0


class TestSSEFormatter:
    """Tests for SSEFormatter utility"""
    
    def test_format_basic(self):
        """Test basic SSE formatting"""
        data = {"type": "test", "value": 123}
        result = SSEFormatter.format(data)
        assert result == f"data: {json.dumps(data)}\n\n"
    
    def test_format_error(self):
        """Test error SSE formatting"""
        result = SSEFormatter.error("Something went wrong")
        parsed = json.loads(result.replace("data: ", "").strip())
        assert parsed["type"] == "error"
        assert parsed["error"] == "Something went wrong"
    
    def test_format_start(self):
        """Test start event SSE formatting"""
        result = SSEFormatter.start("gpt-4", "openai", "req-123")
        parsed = json.loads(result.replace("data: ", "").strip())
        assert parsed["type"] == "start"
        assert parsed["model"] == "gpt-4"
        assert parsed["provider"] == "openai"
        assert parsed["request_id"] == "req-123"
    
    def test_format_token(self):
        """Test token event SSE formatting"""
        result = SSEFormatter.token("Hello")
        parsed = json.loads(result.replace("data: ", "").strip())
        assert parsed["type"] == "token"
        assert parsed["content"] == "Hello"
    
    def test_format_done(self):
        """Test done event SSE formatting"""
        result = SSEFormatter.done(100, 0.005, 5, "Full response")
        parsed = json.loads(result.replace("data: ", "").strip())
        assert parsed["type"] == "done"
        assert parsed["total_tokens"] == 100
        assert parsed["cost_usd"] == 0.005
        assert parsed["credits_used"] == 5
        assert parsed["full_content"] == "Full response"


class TestStreamingService:
    """Tests for StreamingService"""
    
    @pytest.fixture
    def mock_llm_client(self):
        """Create mock LLM client"""
        client = MagicMock()
        client.select_model.return_value = {
            "model": "gpt-4",
            "provider": "openai"
        }
        client.calculate_cost.return_value = 0.005
        return client
    
    @pytest.fixture
    def mock_credit_service(self):
        """Create mock credit service"""
        service = MagicMock()
        service.get_balance = AsyncMock(return_value=100)
        service.deduct_credits = AsyncMock(return_value=True)
        return service
    
    @pytest.fixture
    def streaming_service(self, mock_llm_client, mock_credit_service):
        """Create streaming service with mocks"""
        return StreamingService(
            llm_client=mock_llm_client,
            credit_service=mock_credit_service
        )
    
    @pytest.mark.asyncio
    async def test_check_credits_success(self, streaming_service, mock_credit_service):
        """Test credit check with sufficient balance"""
        result = await streaming_service._check_credits("user-123")
        assert result is True
        mock_credit_service.get_balance.assert_called_once_with("user-123")
    
    @pytest.mark.asyncio
    async def test_check_credits_insufficient(self, streaming_service, mock_credit_service):
        """Test credit check with insufficient balance"""
        mock_credit_service.get_balance.return_value = 0
        result = await streaming_service._check_credits("user-123")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_credits_error(self, streaming_service, mock_credit_service):
        """Test credit check with error"""
        mock_credit_service.get_balance.side_effect = Exception("DB error")
        result = await streaming_service._check_credits("user-123")
        assert result is False
    
    def test_select_model_with_provided(self, streaming_service):
        """Test model selection with provided model and provider"""
        model, provider = streaming_service._select_model(
            "gpt-4", "openai", "general", "balanced"
        )
        assert model == "gpt-4"
        assert provider == "openai"
    
    def test_select_model_auto(self, streaming_service, mock_llm_client):
        """Test automatic model selection"""
        model, provider = streaming_service._select_model(
            None, None, "coding", "performance"
        )
        assert model == "gpt-4"
        assert provider == "openai"
        mock_llm_client.select_model.assert_called_once_with(
            task_type="coding",
            budget_priority="performance"
        )
    
    def test_calculate_cost(self, streaming_service, mock_llm_client):
        """Test cost calculation"""
        messages = [{"role": "user", "content": "Hello"}]
        cost_usd, credits_used = streaming_service._calculate_cost(
            messages, "Response text", "gpt-4", "openai"
        )
        assert cost_usd == 0.005
        assert credits_used == 5  # 0.005 * 1000
    
    @pytest.mark.asyncio
    async def test_deduct_credits_success(self, streaming_service, mock_credit_service):
        """Test successful credit deduction"""
        result = await streaming_service._deduct_credits(
            user_id="user-123",
            credits_used=5,
            request_id="req-123",
            provider="openai",
            model="gpt-4",
            total_tokens=100,
            cost_usd=0.005
        )
        assert result is True
        mock_credit_service.deduct_credits.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_deduct_credits_failure(self, streaming_service, mock_credit_service):
        """Test credit deduction failure"""
        mock_credit_service.deduct_credits.side_effect = Exception("Deduction failed")
        result = await streaming_service._deduct_credits(
            user_id="user-123",
            credits_used=5,
            request_id="req-123",
            provider="openai",
            model="gpt-4",
            total_tokens=100,
            cost_usd=0.005
        )
        assert result is False
    
    def test_register_provider(self, streaming_service):
        """Test provider registration"""
        mock_provider = MagicMock()
        streaming_service.register_provider("custom", mock_provider)
        assert "custom" in streaming_service._providers
        assert streaming_service._providers["custom"] == mock_provider
    
    def test_get_provider_registered(self, streaming_service):
        """Test getting registered provider"""
        mock_provider = MagicMock()
        streaming_service.register_provider("custom", mock_provider)
        provider = streaming_service._get_provider("custom")
        assert provider == mock_provider
    
    def test_get_provider_openai(self, streaming_service):
        """Test getting OpenAI provider"""
        provider = streaming_service._get_provider("openai")
        assert isinstance(provider, OpenAIStreamProvider)
    
    def test_get_provider_anthropic(self, streaming_service):
        """Test getting Anthropic provider"""
        provider = streaming_service._get_provider("anthropic")
        assert isinstance(provider, AnthropicStreamProvider)
    
    def test_get_provider_fallback(self, streaming_service):
        """Test getting fallback provider"""
        provider = streaming_service._get_provider("unknown")
        assert isinstance(provider, FallbackStreamProvider)
    
    @pytest.mark.asyncio
    async def test_stream_chat_completion_insufficient_credits(
        self, streaming_service, mock_credit_service
    ):
        """Test streaming with insufficient credits"""
        mock_credit_service.get_balance.return_value = 0
        
        events = []
        async for event in streaming_service.stream_chat_completion(
            user_id="user-123",
            messages=[{"role": "user", "content": "Hello"}]
        ):
            events.append(event)
        
        assert len(events) == 1
        parsed = json.loads(events[0].replace("data: ", "").strip())
        assert parsed["type"] == "error"
        assert "Insufficient credits" in parsed["error"]


class TestOpenAIStreamProvider:
    """Tests for OpenAI stream provider"""
    
    def test_init_default(self):
        """Test default initialization"""
        provider = OpenAIStreamProvider()
        assert provider.api_key is None
        assert provider.base_url is None
    
    def test_init_with_params(self):
        """Test initialization with parameters"""
        provider = OpenAIStreamProvider(
            api_key="test-key",
            base_url="https://custom.api.com"
        )
        assert provider.api_key == "test-key"
        assert provider.base_url == "https://custom.api.com"


class TestAnthropicStreamProvider:
    """Tests for Anthropic stream provider"""
    
    def test_init_default(self):
        """Test default initialization"""
        provider = AnthropicStreamProvider()
        assert provider.api_key is None
    
    def test_init_with_api_key(self):
        """Test initialization with API key"""
        provider = AnthropicStreamProvider(api_key="test-key")
        assert provider.api_key == "test-key"


class TestFallbackStreamProvider:
    """Tests for fallback stream provider"""
    
    def test_init(self):
        """Test initialization"""
        mock_client = MagicMock()
        provider = FallbackStreamProvider(mock_client)
        assert provider.llm_client == mock_client
    
    @pytest.mark.asyncio
    async def test_stream_chunks_content(self):
        """Test that fallback provider chunks content"""
        mock_client = MagicMock()
        mock_client.chat_completion = AsyncMock(return_value={
            "content": "Hello world",
            "usage": {"total_tokens": 10}
        })
        
        provider = FallbackStreamProvider(mock_client)
        
        chunks = []
        async for chunk in provider.stream(
            messages=[{"role": "user", "content": "Hi"}],
            model="test-model",
            temperature=0.7,
            max_tokens=100,
            provider="test"
        ):
            chunks.append(chunk)
        
        # Should have content chunks + usage chunk
        content_chunks = [c for c in chunks if c["type"] == "content"]
        usage_chunks = [c for c in chunks if c["type"] == "usage"]
        
        assert len(content_chunks) >= 1
        assert len(usage_chunks) == 1
        assert usage_chunks[0]["total_tokens"] == 10
        
        # Reconstruct content
        full_content = "".join(c["content"] for c in content_chunks)
        assert full_content == "Hello world"
