"""
Unit Tests for Unified LLM Gateway
Tests credit checking, cost estimation, and LLM invocation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid

from app.llm_proxy.gateway_unified import (
    LLMGateway,
    LLMGatewayV1,
    LLMGatewayV2,
    COST_PER_1K_TOKENS,
    MODEL_MATRIX,
)
from fastapi import HTTPException
from app.llm_proxy.models import LLMRequest, LLMResponse, LLMUsageStats
from app.llm_proxy.proxy import LLMProviderError
from app.services.credit_service import InsufficientCreditsError


class TestGatewayInitialization:
    """Test gateway initialization and backward compatibility"""
    
    def test_gateway_classes_are_same(self):
        """Test that all gateway classes point to the same implementation"""
        assert LLMGateway is LLMGatewayV1
        assert LLMGateway is LLMGatewayV2
    
    def test_cost_matrix_exists(self):
        """Test that cost matrix is properly defined"""
        assert len(COST_PER_1K_TOKENS) > 0
        
        # Check some expected keys
        assert ("planning", "quality") in COST_PER_1K_TOKENS
        assert ("code_generation", "cost") in COST_PER_1K_TOKENS
        assert ("simple", "speed") in COST_PER_1K_TOKENS
    
    def test_model_matrix_exists(self):
        """Test that model matrix is properly defined"""
        assert len(MODEL_MATRIX) > 0
        
        # Check some expected keys
        assert ("code_generation", "quality") in MODEL_MATRIX
        assert ("analysis", "cost") in MODEL_MATRIX


class TestCostEstimation:
    """Test cost estimation methods"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def gateway(self, mock_db):
        """Create gateway instance with mocked dependencies"""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client'):
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    return LLMGateway(mock_db)
    
    def test_estimate_cost_simple_task(self, gateway):
        """Test cost estimation for simple task"""
        request = LLMRequest(
            prompt="Hello world",
            messages=[{"role": "user", "content": "Hello world"}],
            task_type="simple",
            budget_priority="cost"
        )
        
        cost = gateway._estimate_cost(request, use_openrouter=False)
        
        assert isinstance(cost, Decimal)
        assert cost >= Decimal("0.0001")  # Minimum cost
    
    def test_estimate_cost_complex_task(self, gateway):
        """Test cost estimation for complex task"""
        # Create a longer message
        long_content = "This is a test message. " * 100
        request = LLMRequest(
            prompt=long_content,
            messages=[{"role": "user", "content": long_content}],
            task_type="code_generation",
            budget_priority="quality"
        )
        
        cost = gateway._estimate_cost(request, use_openrouter=False)
        
        assert isinstance(cost, Decimal)
        assert cost > Decimal("0.0001")  # Should be higher than minimum
    
    def test_estimate_cost_different_priorities(self, gateway):
        """Test that different priorities result in different costs"""
        base_request = {
            "prompt": "Test prompt",
            "messages": [{"role": "user", "content": "Test prompt"}],
            "task_type": "planning",
        }
        
        quality_request = LLMRequest(**base_request, budget_priority="quality")
        cost_request = LLMRequest(**base_request, budget_priority="cost")
        
        quality_cost = gateway._estimate_cost(quality_request, use_openrouter=False)
        cost_priority_cost = gateway._estimate_cost(cost_request, use_openrouter=False)
        
        # Quality priority should generally cost more
        assert quality_cost >= cost_priority_cost


class TestCreditChecking:
    """Test credit checking functionality"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def gateway_with_mocks(self, mock_db):
        """Create gateway with mocked credit service"""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client'):
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    mock_credit_service = AsyncMock()
                    MockCreditService.return_value = mock_credit_service
                    gateway = LLMGateway(mock_db)
                    gateway.credit_service = mock_credit_service
                    return gateway, mock_credit_service
    
    @pytest.mark.asyncio
    async def test_check_credits_sufficient(self, gateway_with_mocks):
        """Test credit check when user has sufficient credits"""
        gateway, mock_credit_service = gateway_with_mocks
        mock_credit_service.check_sufficient_credits.return_value = True
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        # Should not raise exception
        await gateway._check_credits(mock_user, Decimal("1.00"))
        
        mock_credit_service.check_sufficient_credits.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_check_credits_insufficient(self, gateway_with_mocks):
        """Test credit check when user has insufficient credits"""
        from fastapi import HTTPException
        
        gateway, mock_credit_service = gateway_with_mocks
        mock_credit_service.check_sufficient_credits.return_value = False
        mock_credit_service.get_balance.return_value = 100  # 100 credits
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._check_credits(mock_user, Decimal("100.00"))
        
        assert exc_info.value.status_code == 402


class TestUserBalance:
    """Test user balance retrieval"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def gateway_with_mocks(self, mock_db):
        """Create gateway with mocked credit service"""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client'):
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    mock_credit_service = AsyncMock()
                    MockCreditService.return_value = mock_credit_service
                    gateway = LLMGateway(mock_db)
                    gateway.credit_service = mock_credit_service
                    return gateway, mock_credit_service
    
    @pytest.mark.asyncio
    async def test_get_user_balance(self, gateway_with_mocks):
        """Test getting user balance"""
        gateway, mock_credit_service = gateway_with_mocks
        
        mock_credit_service.get_balance.return_value = 10000
        mock_credit_service.get_balance_usd.return_value = Decimal("10.00")
        mock_credit_service.get_transaction_stats.return_value = {
            "total_added_credits": 10000,
            "total_deducted_credits": 0,
            "transaction_count": 1
        }
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        result = await gateway.get_user_balance(mock_user)
        
        assert "balance_credits" in result
        assert "balance_usd" in result
        assert "stats" in result
        assert result["balance_credits"] == 10000
        assert result["balance_usd"] == 10.00


class TestAvailableModels:
    """Test available models retrieval"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def gateway_with_mocks(self, mock_db):
        """Create gateway with mocked unified client"""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.direct_providers = {"openai": True, "anthropic": True}
                    mock_get_client.return_value = mock_client
                    gateway = LLMGateway(mock_db)
                    return gateway
    
    @pytest.mark.asyncio
    async def test_get_available_models(self, gateway_with_mocks):
        """Test getting available models"""
        result = await gateway_with_mocks.get_available_models()
        
        assert "openrouter" in result
        assert "direct_providers" in result
        assert "recommended_models" in result
        
        # Check recommended models structure
        assert "code_generation" in result["recommended_models"]
        assert "analysis" in result["recommended_models"]
        assert "planning" in result["recommended_models"]


class TestActualCostCalculation:
    """Test actual cost calculation from response"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def gateway(self, mock_db):
        """Create gateway instance"""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    mock_client = MagicMock()
                    mock_client.estimate_cost.return_value = Decimal("0.01")
                    mock_get_client.return_value = mock_client
                    return LLMGateway(mock_db)
    
    def test_calculate_cost_with_cost_field(self, gateway):
        """Test cost calculation when response has cost field"""
        response = MagicMock()
        response.cost = 0.05
        response.usage = None
        
        cost = gateway._calculate_actual_cost(response, use_openrouter=False)
        
        assert cost == Decimal("0.05")
    
    def test_calculate_cost_without_usage(self, gateway):
        """Test cost calculation when response has no usage stats"""
        response = MagicMock()
        response.cost = None
        response.usage = None
        response.content = "Test response content"
        
        cost = gateway._calculate_actual_cost(response, use_openrouter=False)
        
        assert isinstance(cost, Decimal)
        assert cost >= Decimal("0")


class TestBackwardCompatibility:
    """Test backward compatibility with legacy imports"""
    
    def test_import_from_gateway(self):
        """Test importing from gateway.py (deprecated)"""
        # This should work but emit deprecation warning
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            from app.llm_proxy.gateway import LLMGateway as GatewayV1
            
            # Check that deprecation warning was issued
            assert len(w) >= 1
            assert issubclass(w[0].category, DeprecationWarning)
    
    def test_import_from_gateway_v2(self):
        """Test importing from gateway_v2.py (deprecated)"""
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            from app.llm_proxy.gateway_v2 import LLMGatewayV2 as GatewayV2
            
            # Check that deprecation warning was issued
            assert len(w) >= 1
            assert issubclass(w[0].category, DeprecationWarning)
    
    def test_import_from_init(self):
        """Test importing from __init__.py (recommended)"""
        from app.llm_proxy import LLMGateway, LLMGatewayV1, LLMGatewayV2
        
        # All should be the same class
        assert LLMGateway is LLMGatewayV1
        assert LLMGateway is LLMGatewayV2


# =============================================================================
# Phase 1 Additional: Credit Checking Edge Cases
# =============================================================================

class TestCreditCheckingEdgeCases:
    """
    Additional credit checking tests for edge cases.
    
    These tests cover scenarios not covered by the existing TestCreditChecking class,
    including zero balance, detailed error messages, and balance info in errors.
    """
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def gateway_with_mocks(self, mock_db):
        """Create gateway with mocked credit service"""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client'):
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    mock_credit_service = AsyncMock()
                    MockCreditService.return_value = mock_credit_service
                    gateway = LLMGateway(mock_db)
                    gateway.credit_service = mock_credit_service
                    return gateway, mock_credit_service
    
    @pytest.mark.asyncio
    async def test_check_credits_zero_balance(self, gateway_with_mocks):
        """Test credit check when user has zero balance."""
        from fastapi import HTTPException
        
        gateway, mock_credit_service = gateway_with_mocks
        mock_credit_service.check_sufficient_credits.return_value = False
        mock_credit_service.get_balance.return_value = 0
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._check_credits(mock_user, Decimal("0.01"))
        
        assert exc_info.value.status_code == 402
        assert exc_info.value.detail["balance_credits"] == 0
    
    @pytest.mark.asyncio
    async def test_check_credits_includes_detailed_error_message(self, gateway_with_mocks):
        """Test that the 402 error includes detailed balance information."""
        from fastapi import HTTPException
        
        gateway, mock_credit_service = gateway_with_mocks
        mock_credit_service.check_sufficient_credits.return_value = False
        mock_credit_service.get_balance.return_value = 500
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._check_credits(mock_user, Decimal("0.50"))
        
        detail = exc_info.value.detail
        assert "balance_credits" in detail
        assert "balance_usd" in detail
        assert "required_credits" in detail
        assert "required_usd" in detail
        assert "message" in detail
        assert "top up" in detail["message"].lower()
    
    @pytest.mark.asyncio
    async def test_check_credits_verifies_service_call_args(self, gateway_with_mocks):
        """Test that _check_credits calls credit service with correct arguments."""
        gateway, mock_credit_service = gateway_with_mocks
        mock_credit_service.check_sufficient_credits.return_value = True
        
        mock_user = MagicMock()
        mock_user.id = "test-user-123"
        
        await gateway._check_credits(mock_user, Decimal("1.50"))
        
        mock_credit_service.check_sufficient_credits.assert_called_once_with(
            user_id="test-user-123",
            estimated_cost_usd=Decimal("1.50")
        )


# =============================================================================
# Phase 2: OpenRouter Path Tests (_invoke_via_openrouter)
# =============================================================================

class TestOpenRouterPath:
    """
    Test Phase 2: OpenRouter invocation path.
    
    The _invoke_via_openrouter method routes requests through the OpenRouter
    unified client, which provides access to multiple LLM providers through
    a single API.
    """
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def mock_llm_response(self):
        """Create a mock LLMResponse object."""
        response = MagicMock()
        response.content = "I'm doing well, thank you for asking!"
        response.model = "gpt-4o"
        response.provider = "openai"
        response.tokens_used = 50
        response.usage = MagicMock()
        response.usage.prompt_tokens = 20
        response.usage.completion_tokens = 30
        response.usage.total_tokens = 50
        response.cost = Decimal("0.001")
        return response
    
    @pytest.fixture
    def gateway_with_openrouter(self, mock_db, mock_llm_response):
        """Create gateway with mocked OpenRouter client."""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.chat = AsyncMock(return_value=mock_llm_response)
                    mock_get_client.return_value = mock_client
                    gateway = LLMGateway(mock_db)
                    gateway._mock_unified_client = mock_client
                    return gateway
    
    @pytest.mark.asyncio
    async def test_invoke_via_openrouter_success(self, gateway_with_openrouter, mock_llm_response):
        """Test successful invocation via OpenRouter."""
        gateway = gateway_with_openrouter
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="quality",
        )
        
        response = await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort=None,
            data_collection="allow",
            zdr=None,
            max_price=None,
        )
        
        assert response == mock_llm_response
        gateway._mock_unified_client.chat.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_via_openrouter_with_fallback_models(self, gateway_with_openrouter, mock_llm_response):
        """Test OpenRouter invocation with fallback models specified."""
        gateway = gateway_with_openrouter
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="quality",
        )
        
        fallback_models = ["anthropic/claude-3-haiku", "google/gemini-flash-1.5"]
        
        await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=fallback_models,
            sort="price",
            data_collection="deny",
            zdr=True,
            max_price={"prompt": 0.001, "completion": 0.002},
        )
        
        # Verify chat was called with the correct parameters
        call_kwargs = gateway._mock_unified_client.chat.call_args.kwargs
        assert call_kwargs["fallback_models"] == fallback_models
        assert call_kwargs["sort"] == "price"
        assert call_kwargs["data_collection"] == "deny"
        assert call_kwargs["zdr"] is True
    
    @pytest.mark.asyncio
    async def test_invoke_via_openrouter_failure_raises_500(self, mock_db):
        """Test that OpenRouter failure raises HTTP 500."""
        from fastapi import HTTPException
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.chat = AsyncMock(side_effect=Exception("OpenRouter API error"))
                    mock_get_client.return_value = mock_client
                    gateway = LLMGateway(mock_db)
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="quality",
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._invoke_via_openrouter(
                request=request,
                user=mock_user,
                fallback_models=None,
                sort=None,
                data_collection="allow",
                zdr=None,
                max_price=None,
            )
        
        assert exc_info.value.status_code == 500
        assert "LLM call failed" in exc_info.value.detail
        assert "OpenRouter API error" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_invoke_via_openrouter_passes_request_params(self, gateway_with_openrouter, mock_llm_response):
        """Test that request parameters are correctly passed to OpenRouter."""
        gateway = gateway_with_openrouter
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Write code",
            messages=[{"role": "user", "content": "Write code"}],
            preferred_model="anthropic/claude-3.5-sonnet",
            task_type="code_generation",
            budget_priority="quality",
            temperature=0.3,
            max_tokens=2000,
        )
        
        await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort=None,
            data_collection="allow",
            zdr=None,
            max_price=None,
        )
        
        call_kwargs = gateway._mock_unified_client.chat.call_args.kwargs
        assert call_kwargs["messages"] == request.messages
        assert call_kwargs["model"] == request.preferred_model
        assert call_kwargs["task_type"] == request.task_type
        assert call_kwargs["budget_priority"] == request.budget_priority
        assert call_kwargs["temperature"] == request.temperature
        assert call_kwargs["max_tokens"] == request.max_tokens
        assert call_kwargs["use_openrouter"] is True


# =============================================================================
# Phase 2 Additional: Full invoke() with OpenRouter
# =============================================================================

class TestInvokeWithOpenRouter:
    """
    Test the full invoke() method when using OpenRouter path.
    
    This tests the complete flow: credit check → OpenRouter call → 
    cost calculation → credit deduction → response.
    """
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        return AsyncMock()
    
    @pytest.fixture
    def mock_llm_response(self):
        """Create a mock LLMResponse object."""
        response = MagicMock()
        response.content = "I'm doing well, thank you for asking!"
        response.model = "gpt-4o"
        response.provider = "openai"
        response.tokens_used = 50
        response.usage = MagicMock()
        response.usage.prompt_tokens = 20
        response.usage.completion_tokens = 30
        response.usage.total_tokens = 50
        response.cost = Decimal("0.001")
        return response
    
    @pytest.fixture
    def gateway_full_mocks(self, mock_db, mock_llm_response):
        """Create gateway with all dependencies mocked for full flow testing."""
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as mock_proxy_class:
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    # Setup credit service mock
                    mock_credit_service = AsyncMock()
                    mock_credit_service.check_sufficient_credits.return_value = True
                    mock_credit_service.get_balance.return_value = 10000
                    
                    mock_transaction = MagicMock()
                    mock_transaction.amount = 100
                    mock_transaction.balance_after = 9900
                    mock_credit_service.deduct_credits.return_value = mock_transaction
                    MockCreditService.return_value = mock_credit_service
                    
                    # Setup unified client mock
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.chat = AsyncMock(return_value=mock_llm_response)
                    mock_client.estimate_cost.return_value = Decimal("0.01")  # Return proper Decimal
                    mock_get_client.return_value = mock_client
                    
                    gateway = LLMGateway(mock_db)
                    gateway._mock_credit_service = mock_credit_service
                    gateway._mock_unified_client = mock_client
                    
                    return gateway
    
    @pytest.mark.asyncio
    async def test_invoke_openrouter_full_flow_success(self, gateway_full_mocks, mock_llm_response):
        """Test complete successful flow through OpenRouter."""
        gateway = gateway_full_mocks
        
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="quality",
        )
        
        response = await gateway.invoke(
            request=request,
            user=mock_user,
            use_openrouter=True,
        )
        
        # Verify the response
        assert response.content == mock_llm_response.content
        assert response.credits_used == 100
        assert response.credits_balance == 9900
        
        # Verify credit check was called
        gateway._mock_credit_service.check_sufficient_credits.assert_called_once()
        
        # Verify OpenRouter was called
        gateway._mock_unified_client.chat.assert_called_once()
        
        # Verify credits were deducted
        gateway._mock_credit_service.deduct_credits.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_openrouter_insufficient_credits_stops_early(self, mock_db, mock_llm_response):
        """Test that insufficient credits stops the flow before LLM call."""
        from fastapi import HTTPException
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    # Setup insufficient credits
                    mock_credit_service = AsyncMock()
                    mock_credit_service.check_sufficient_credits.return_value = False
                    mock_credit_service.get_balance.return_value = 10
                    MockCreditService.return_value = mock_credit_service
                    
                    # Setup unified client mock
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.chat = AsyncMock(return_value=mock_llm_response)
                    mock_client.estimate_cost.return_value = Decimal("0.01")  # Return proper Decimal
                    mock_get_client.return_value = mock_client
                    
                    gateway = LLMGateway(mock_db)
                    
                    mock_user = MagicMock()
                    mock_user.id = str(uuid.uuid4())
                    
                    request = LLMRequest(
                        prompt="Hello",
                        messages=[{"role": "user", "content": "Hello"}],
                        preferred_model="gpt-4o",
                        task_type="simple",
                        budget_priority="quality",
                    )
                    
                    with pytest.raises(HTTPException) as exc_info:
                        await gateway.invoke(
                            request=request,
                            user=mock_user,
                            use_openrouter=True,
                        )
                    
                    assert exc_info.value.status_code == 402
                    
                    # Verify OpenRouter was NOT called
                    mock_client.chat.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_invoke_deduct_credits_race_condition(self, mock_db, mock_llm_response):
        """
        Test handling of race condition where credits become insufficient
        between check and deduction.
        """
        from fastapi import HTTPException
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    # Setup: check passes but deduction fails
                    mock_credit_service = AsyncMock()
                    mock_credit_service.check_sufficient_credits.return_value = True
                    mock_credit_service.deduct_credits.side_effect = InsufficientCreditsError(
                        required=Decimal("1.00"),
                        available=Decimal("0.50"),
                    )
                    MockCreditService.return_value = mock_credit_service
                    
                    # Setup unified client mock
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.chat = AsyncMock(return_value=mock_llm_response)
                    mock_client.estimate_cost.return_value = Decimal("0.01")  # Return proper Decimal
                    mock_get_client.return_value = mock_client
                    
                    gateway = LLMGateway(mock_db)
                    
                    mock_user = MagicMock()
                    mock_user.id = str(uuid.uuid4())
                    
                    request = LLMRequest(
                        prompt="Hello",
                        messages=[{"role": "user", "content": "Hello"}],
                        preferred_model="gpt-4o",
                        task_type="simple",
                        budget_priority="quality",
                    )
                    
                    with pytest.raises(HTTPException) as exc_info:
                        await gateway.invoke(
                            request=request,
                            user=mock_user,
                            use_openrouter=True,
                        )
                    
                    assert exc_info.value.status_code == 402
                    assert "Insufficient credits" in exc_info.value.detail["error"]


# =============================================================================
# Phase 3: Direct Provider Path Tests (Lines 281-333)
# =============================================================================

class TestDirectProviderPath:
    """Tests for _invoke_via_direct() method - Lines 281-333."""
    
    @pytest.fixture
    def mock_db(self):
        return AsyncMock()
    
    @pytest.fixture
    def mock_llm_response(self):
        return LLMResponse(
            content="Direct provider response",
            model="gpt-4o",
            provider="openai",
            tokens_used=150,
            cost=Decimal("0.01"),
            latency_ms=100,
        )
    
    @pytest.fixture
    def mock_user(self):
        user = MagicMock()
        user.id = str(uuid.uuid4())
        return user
    
    @pytest.fixture
    def base_request(self):
        return LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            preferred_provider="openai",
            task_type="simple",
            budget_priority="quality",
        )
    
    @pytest.mark.asyncio
    async def test_direct_path_primary_provider_success(self, mock_db, mock_llm_response, mock_user, base_request):
        """
        Test: Primary provider succeeds on first attempt.
        Lines covered: 281-288 (primary provider success path)
        """
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            # Setup LLMProxy mock
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(return_value=mock_llm_response)
            mock_proxy.get_fallback_providers = MagicMock(return_value=["anthropic", "google"])
            MockLLMProxy.return_value = mock_proxy
            
            # Setup CreditService mock
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            mock_credit_service.deduct_credits.return_value = MagicMock(
                success=True,
                new_balance=Decimal("99.99"),
                amount_deducted=Decimal("0.01"),
                amount=100,  # 100 credits = $0.10
                balance_after=99990,  # Balance in credits
            )
            MockCreditService.return_value = mock_credit_service
            
            # Setup unified client mock
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.01")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            # Invoke via direct path (use_openrouter=False)
            response = await gateway.invoke(
                request=base_request,
                user=mock_user,
                use_openrouter=False,
            )
            
            # Verify primary provider was called
            mock_proxy.invoke.assert_called_once()
            assert response.content == "Direct provider response"
            assert response.provider == "openai"
    
    @pytest.mark.asyncio
    async def test_direct_path_primary_fails_fallback_succeeds(self, mock_db, mock_user, base_request):
        """
        Test: Primary provider fails, first fallback succeeds.
        Lines covered: 290-315 (primary fails, fallback success path)
        """
        # Create different responses for primary and fallback
        fallback_response = LLMResponse(
            content="Fallback provider response",
            model="claude-3-opus",
            provider="anthropic",
            tokens_used=150,
            cost=Decimal("0.02"),
            latency_ms=120,
        )
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            # Setup LLMProxy mock - primary fails, fallback succeeds
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=[
                LLMProviderError("Primary provider failed", "openai", "gpt-4o"),  # First call fails
                fallback_response,  # Second call (fallback) succeeds
            ])
            mock_proxy.get_fallback_providers = MagicMock(return_value=["anthropic", "google"])
            MockLLMProxy.return_value = mock_proxy
            
            # Setup CreditService mock
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            mock_credit_service.deduct_credits.return_value = MagicMock(
                success=True,
                new_balance=Decimal("99.98"),
                amount_deducted=Decimal("0.02"),
                amount=200,  # 200 credits = $0.20
                balance_after=99980,  # Balance in credits
            )
            MockCreditService.return_value = mock_credit_service
            
            # Setup unified client mock
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.02")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            # Invoke via direct path
            response = await gateway.invoke(
                request=base_request,
                user=mock_user,
                use_openrouter=False,
            )
            
            # Verify fallback was used
            assert mock_proxy.invoke.call_count == 2
            assert response.content == "Fallback provider response"
            assert response.provider == "anthropic"
    
    @pytest.mark.asyncio
    async def test_direct_path_primary_fails_second_fallback_succeeds(self, mock_db, mock_user, base_request):
        """
        Test: Primary and first fallback fail, second fallback succeeds.
        Lines covered: 317-324 (first fallback fails, continue to next)
        """
        second_fallback_response = LLMResponse(
            content="Second fallback response",
            model="gemini-pro",
            provider="google",
            tokens_used=150,
            cost=Decimal("0.015"),
            latency_ms=110,
        )
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            # Setup LLMProxy mock - primary and first fallback fail
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=[
                LLMProviderError("Primary provider failed", "openai", "gpt-4o"),
                LLMProviderError("First fallback failed", "anthropic", "claude-3"),
                second_fallback_response,  # Second fallback succeeds
            ])
            mock_proxy.get_fallback_providers = MagicMock(return_value=["anthropic", "google"])
            MockLLMProxy.return_value = mock_proxy
            
            # Setup CreditService mock
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            mock_credit_service.deduct_credits.return_value = MagicMock(
                success=True,
                new_balance=Decimal("99.985"),
                amount_deducted=Decimal("0.015"),
                amount=150,  # 150 credits = $0.15
                balance_after=99985,  # Balance in credits
            )
            MockCreditService.return_value = mock_credit_service
            
            # Setup unified client mock
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.015")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            # Invoke via direct path
            response = await gateway.invoke(
                request=base_request,
                user=mock_user,
                use_openrouter=False,
            )
            
            # Verify all three providers were tried
            assert mock_proxy.invoke.call_count == 3
            assert response.content == "Second fallback response"
            assert response.provider == "google"
    
    @pytest.mark.asyncio
    async def test_direct_path_all_providers_fail_raises_503(self, mock_db, mock_user, base_request):
        """
        Test: All providers (primary + all fallbacks) fail.
        Lines covered: 326-339 (all fallbacks failed, raise 503)
        """
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            # Setup LLMProxy mock - all providers fail
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=LLMProviderError("Provider unavailable", "openai", "gpt-4o"))
            mock_proxy.get_fallback_providers = MagicMock(return_value=["anthropic", "google"])
            MockLLMProxy.return_value = mock_proxy
            
            # Setup CreditService mock
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            MockCreditService.return_value = mock_credit_service
            
            # Setup unified client mock
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.01")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            # Invoke should raise 503
            with pytest.raises(HTTPException) as exc_info:
                await gateway.invoke(
                    request=base_request,
                    user=mock_user,
                    use_openrouter=False,
                )
            
            assert exc_info.value.status_code == 503
            assert "All LLM providers are currently unavailable" in exc_info.value.detail
            
            # Verify all providers were tried (primary + 2 fallbacks)
            assert mock_proxy.invoke.call_count == 3
    
    @pytest.mark.asyncio
    async def test_direct_path_no_fallbacks_available(self, mock_db, mock_user, base_request):
        """
        Test: Primary fails and no fallback providers available.
        Lines covered: 326-339 (empty fallbacks list)
        """
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            # Setup LLMProxy mock - primary fails, no fallbacks
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=LLMProviderError("Primary failed", "openai", "gpt-4o"))
            mock_proxy.get_fallback_providers = MagicMock(return_value=[])  # No fallbacks
            MockLLMProxy.return_value = mock_proxy
            
            # Setup CreditService mock
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            MockCreditService.return_value = mock_credit_service
            
            # Setup unified client mock
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.01")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            # Invoke should raise 503 immediately after primary fails
            with pytest.raises(HTTPException) as exc_info:
                await gateway.invoke(
                    request=base_request,
                    user=mock_user,
                    use_openrouter=False,
                )
            
            assert exc_info.value.status_code == 503
            # Only primary was tried (no fallbacks)
            assert mock_proxy.invoke.call_count == 1
    
    @pytest.mark.asyncio
    async def test_direct_path_fallback_request_has_updated_provider(self, mock_db, mock_user, base_request):
        """
        Test: Fallback request has the correct provider field updated.
        Lines covered: 306 (request.copy with updated provider)
        """
        fallback_response = LLMResponse(
            content="Fallback response",
            model="claude-3-opus",
            provider="anthropic",
            tokens_used=150,
            cost=Decimal("0.02"),
            latency_ms=120,
        )
        
        captured_requests = []
        
        async def capture_invoke(req):
            captured_requests.append(req)
            if len(captured_requests) == 1:
                raise LLMProviderError("Primary failed", "openai", "gpt-4o")
            return fallback_response
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=capture_invoke)
            mock_proxy.get_fallback_providers = MagicMock(return_value=["anthropic"])
            MockLLMProxy.return_value = mock_proxy
            
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            mock_credit_service.deduct_credits.return_value = MagicMock(
                success=True,
                new_balance=Decimal("99.98"),
                amount_deducted=Decimal("0.02"),
                amount=200,  # 200 credits = $0.20
                balance_after=99980,  # Balance in credits
            )
            MockCreditService.return_value = mock_credit_service
            
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.02")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            await gateway.invoke(
                request=base_request,
                user=mock_user,
                use_openrouter=False,
            )
            
            # Verify first request had original provider
            assert captured_requests[0].preferred_provider == "openai"
            # Verify second request (fallback) had updated provider
            assert captured_requests[1].preferred_provider == "anthropic"


class TestDirectPathWithCreditDeduction:
    """Tests for direct path with credit deduction integration."""
    
    @pytest.fixture
    def mock_db(self):
        return AsyncMock()
    
    @pytest.fixture
    def mock_user(self):
        user = MagicMock()
        user.id = str(uuid.uuid4())
        return user
    
    @pytest.fixture
    def base_request(self):
        return LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            preferred_provider="openai",
            task_type="simple",
            budget_priority="quality",
        )
    
    @pytest.mark.asyncio
    async def test_direct_path_deducts_credits_on_success(self, mock_db, mock_user, base_request):
        """
        Test: Credits are deducted after successful direct path invocation.
        """
        mock_response = LLMResponse(
            content="Response",
            model="gpt-4o",
            provider="openai",
            tokens_used=150,
            cost=Decimal("0.01"),
            latency_ms=100,
        )
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(return_value=mock_response)
            mock_proxy.get_fallback_providers = MagicMock(return_value=[])
            MockLLMProxy.return_value = mock_proxy
            
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            mock_credit_service.deduct_credits.return_value = MagicMock(
                success=True,
                new_balance=Decimal("99.99"),
                amount_deducted=Decimal("0.01"),
                amount=100,  # 100 credits = $0.10
                balance_after=99990,  # Balance in credits
            )
            MockCreditService.return_value = mock_credit_service
            
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.01")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            await gateway.invoke(
                request=base_request,
                user=mock_user,
                use_openrouter=False,
            )
            
            # Verify credits were deducted
            mock_credit_service.deduct_credits.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_direct_path_insufficient_credits_returns_402(self, mock_db, mock_user, base_request):
        """
        Test: Direct path returns 402 when credits are insufficient.
        """
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            mock_proxy = MagicMock()
            MockLLMProxy.return_value = mock_proxy
            
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = False
            mock_credit_service.get_balance.return_value = Decimal("0.001")
            MockCreditService.return_value = mock_credit_service
            
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.01")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            with pytest.raises(HTTPException) as exc_info:
                await gateway.invoke(
                    request=base_request,
                    user=mock_user,
                    use_openrouter=False,
                )
            
            assert exc_info.value.status_code == 402
            # LLM was never called
            mock_proxy.invoke.assert_not_called()


class TestDirectPathEdgeCases:
    """Edge case tests for direct provider path."""
    
    @pytest.fixture
    def mock_db(self):
        return AsyncMock()
    
    @pytest.fixture
    def mock_user(self):
        user = MagicMock()
        user.id = str(uuid.uuid4())
        return user
    
    @pytest.mark.asyncio
    async def test_direct_path_with_many_fallbacks(self, mock_db, mock_user):
        """
        Test: System handles many fallback providers correctly.
        """
        # Last fallback succeeds
        final_response = LLMResponse(
            content="Final fallback response",
            model="llama-3",
            provider="groq",
            tokens_used=150,
            cost=Decimal("0.005"),
            latency_ms=80,
        )
        
        request = LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            provider="openai",
            task_type="simple",
            budget_priority="quality",
        )
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            # 5 fallbacks, only the last one succeeds
            fallbacks = ["anthropic", "google", "mistral", "cohere", "groq"]
            
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=[
                LLMProviderError("openai failed", "openai", "gpt-4o"),
                LLMProviderError("anthropic failed", "anthropic", "claude-3"),
                LLMProviderError("google failed", "google", "gemini"),
                LLMProviderError("mistral failed", "mistral", "mistral"),
                LLMProviderError("cohere failed", "cohere", "command"),
                final_response,  # groq succeeds
            ])
            mock_proxy.get_fallback_providers = MagicMock(return_value=fallbacks)
            MockLLMProxy.return_value = mock_proxy
            
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            mock_credit_service.deduct_credits.return_value = MagicMock(
                success=True,
                new_balance=Decimal("99.995"),
                amount_deducted=Decimal("0.005"),
                amount=50,  # 50 credits = $0.05
                balance_after=99995,  # Balance in credits
            )
            MockCreditService.return_value = mock_credit_service
            
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.005")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            response = await gateway.invoke(
                request=request,
                user=mock_user,
                use_openrouter=False,
            )
            
            # All 6 providers were tried (1 primary + 5 fallbacks)
            assert mock_proxy.invoke.call_count == 6
            assert response.provider == "groq"
    
    @pytest.mark.asyncio
    async def test_direct_path_error_message_includes_final_error(self, mock_db, mock_user):
        """
        Test: 503 error message includes the final error details.
        Lines covered: 337 (error message formatting)
        """
        request = LLMRequest(
            prompt="Hello",
            messages=[{"role": "user", "content": "Hello"}],
            preferred_model="gpt-4o",
            provider="openai",
            task_type="simple",
            budget_priority="quality",
        )
        
        with patch('app.llm_proxy.gateway_unified.LLMProxy') as MockLLMProxy, \
             patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client, \
             patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
            
            mock_proxy = MagicMock()
            mock_proxy.invoke = AsyncMock(side_effect=LLMProviderError("Rate limit exceeded", "openai", "gpt-4o"))
            mock_proxy.get_fallback_providers = MagicMock(return_value=["anthropic"])
            MockLLMProxy.return_value = mock_proxy
            
            mock_credit_service = AsyncMock()
            mock_credit_service.check_sufficient_credits.return_value = True
            MockCreditService.return_value = mock_credit_service
            
            mock_client = MagicMock()
            mock_client.estimate_cost.return_value = Decimal("0.01")
            mock_get_client.return_value = mock_client
            
            gateway = LLMGateway(mock_db)
            
            with pytest.raises(HTTPException) as exc_info:
                await gateway.invoke(
                    request=request,
                    user=mock_user,
                    use_openrouter=False,
                )
            
            # Error message should include the original error
            assert "Rate limit exceeded" in exc_info.value.detail


# =============================================================================
# Phase 2 Extended: Additional OpenRouter Tests
# =============================================================================

class TestOpenRouterEdgeCases:
    """
    Additional edge case tests for OpenRouter path.
    
    These tests cover scenarios not covered by the basic OpenRouter tests:
    - Different sort options
    - ZDR (Zero Data Retention) settings
    - Max price configurations
    - Various data collection policies
    """
    
    @pytest.fixture
    def mock_db(self):
        return AsyncMock()
    
    @pytest.fixture
    def mock_llm_response(self):
        response = MagicMock()
        response.content = "Test response"
        response.model = "gpt-4o"
        response.provider = "openai"
        response.tokens_used = 100
        response.usage = MagicMock()
        response.usage.prompt_tokens = 40
        response.usage.completion_tokens = 60
        response.usage.total_tokens = 100
        response.cost = Decimal("0.002")
        return response
    
    @pytest.fixture
    def gateway_with_mocks(self, mock_db, mock_llm_response):
        """Create gateway with all mocks for OpenRouter testing."""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    mock_credit_service = AsyncMock()
                    mock_credit_service.check_sufficient_credits.return_value = True
                    mock_credit_service.get_balance.return_value = 10000
                    mock_transaction = MagicMock()
                    mock_transaction.amount = 200
                    mock_transaction.balance_after = 9800
                    mock_credit_service.deduct_credits.return_value = mock_transaction
                    MockCreditService.return_value = mock_credit_service
                    
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()
                    mock_client.chat = AsyncMock(return_value=mock_llm_response)
                    mock_client.estimate_cost.return_value = Decimal("0.02")
                    mock_get_client.return_value = mock_client
                    
                    gateway = LLMGateway(mock_db)
                    gateway._mock_client = mock_client
                    gateway._mock_credit_service = mock_credit_service
                    return gateway
    
    @pytest.mark.asyncio
    async def test_openrouter_with_sort_throughput(self, gateway_with_mocks):
        """Test OpenRouter with throughput sorting."""
        gateway = gateway_with_mocks
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Test",
            messages=[{"role": "user", "content": "Test"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="speed",
        )
        
        await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort="throughput",
            data_collection="allow",
            zdr=None,
            max_price=None,
        )
        
        call_kwargs = gateway._mock_client.chat.call_args.kwargs
        assert call_kwargs["sort"] == "throughput"
    
    @pytest.mark.asyncio
    async def test_openrouter_with_sort_latency(self, gateway_with_mocks):
        """Test OpenRouter with latency sorting."""
        gateway = gateway_with_mocks
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Test",
            messages=[{"role": "user", "content": "Test"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="speed",
        )
        
        await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort="latency",
            data_collection="allow",
            zdr=None,
            max_price=None,
        )
        
        call_kwargs = gateway._mock_client.chat.call_args.kwargs
        assert call_kwargs["sort"] == "latency"
    
    @pytest.mark.asyncio
    async def test_openrouter_with_zdr_enabled(self, gateway_with_mocks):
        """Test OpenRouter with Zero Data Retention enabled."""
        gateway = gateway_with_mocks
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Sensitive data",
            messages=[{"role": "user", "content": "Sensitive data"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="quality",
        )
        
        await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort=None,
            data_collection="deny",
            zdr=True,
            max_price=None,
        )
        
        call_kwargs = gateway._mock_client.chat.call_args.kwargs
        assert call_kwargs["zdr"] is True
        assert call_kwargs["data_collection"] == "deny"
    
    @pytest.mark.asyncio
    async def test_openrouter_with_max_price(self, gateway_with_mocks):
        """Test OpenRouter with max price constraints."""
        gateway = gateway_with_mocks
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Budget-conscious request",
            messages=[{"role": "user", "content": "Budget-conscious request"}],
            preferred_model="gpt-4o",
            task_type="simple",
            budget_priority="cost",
        )
        
        max_price = {"prompt": 0.0005, "completion": 0.001}
        
        await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort="price",
            data_collection="allow",
            zdr=None,
            max_price=max_price,
        )
        
        call_kwargs = gateway._mock_client.chat.call_args.kwargs
        assert call_kwargs["max_price"] == max_price
        assert call_kwargs["sort"] == "price"
    
    @pytest.mark.asyncio
    async def test_openrouter_full_flow_with_all_options(self, gateway_with_mocks):
        """Test complete OpenRouter flow with all optional parameters."""
        gateway = gateway_with_mocks
        mock_user = MagicMock()
        mock_user.id = str(uuid.uuid4())
        
        request = LLMRequest(
            prompt="Complex request",
            messages=[{"role": "user", "content": "Complex request"}],
            preferred_model="anthropic/claude-3.5-sonnet",
            task_type="code_generation",
            budget_priority="quality",
            temperature=0.2,
            max_tokens=4000,
        )
        
        response = await gateway.invoke(
            request=request,
            user=mock_user,
            use_openrouter=True,
            fallback_models=["openai/gpt-4o", "google/gemini-pro"],
            sort="price",
            data_collection="deny",
            zdr=True,
            max_price={"prompt": 0.001, "completion": 0.002},
        )
        
        # Verify response has credit info
        assert response.credits_used == 200
        assert response.credits_balance == 9800
        
        # Verify all parameters were passed
        call_kwargs = gateway._mock_client.chat.call_args.kwargs
        assert call_kwargs["model"] == "anthropic/claude-3.5-sonnet"
        assert call_kwargs["task_type"] == "code_generation"
        assert call_kwargs["use_openrouter"] is True
        assert call_kwargs["fallback_models"] == ["openai/gpt-4o", "google/gemini-pro"]
        assert call_kwargs["sort"] == "price"
        assert call_kwargs["data_collection"] == "deny"
        assert call_kwargs["zdr"] is True


# =============================================================================
# Phase 4: Helper Method Tests
# =============================================================================

class TestHelperMethods:
    """
    Tests for gateway helper methods.
    
    These tests cover:
    - get_user_balance()
    - get_available_models()
    """
    
    @pytest.fixture
    def mock_db(self):
        return AsyncMock()
    
    @pytest.mark.asyncio
    async def test_get_user_balance(self, mock_db):
        """Test get_user_balance returns correct data."""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client'):
                with patch('app.llm_proxy.gateway_unified.CreditService') as MockCreditService:
                    mock_credit_service = AsyncMock()
                    mock_credit_service.get_balance.return_value = 5000
                    mock_credit_service.get_balance_usd.return_value = Decimal("5.00")
                    mock_credit_service.get_transaction_stats.return_value = {
                        "total_added": 10000,
                        "total_deducted": 5000,
                        "transaction_count": 15
                    }
                    MockCreditService.return_value = mock_credit_service
                    
                    gateway = LLMGateway(mock_db)
                    
                    mock_user = MagicMock()
                    mock_user.id = "test-user-123"
                    
                    result = await gateway.get_user_balance(mock_user)
                    
                    assert result["balance_credits"] == 5000
                    assert result["balance_usd"] == 5.00
                    assert result["stats"]["total_added"] == 10000
                    assert result["stats"]["total_deducted"] == 5000
    
    @pytest.mark.asyncio
    async def test_get_available_models_with_openrouter(self, mock_db):
        """Test get_available_models when OpenRouter is enabled."""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    mock_client = MagicMock()
                    mock_client.openrouter_client = MagicMock()  # OpenRouter enabled
                    mock_client.direct_providers = {"openai": True, "anthropic": True}
                    mock_get_client.return_value = mock_client
                    
                    gateway = LLMGateway(mock_db)
                    
                    result = await gateway.get_available_models()
                    
                    assert result["openrouter"]["enabled"] is True
                    assert "420+" in result["openrouter"]["models"]
                    assert "direct_providers" in result
                    assert "recommended_models" in result
    
    @pytest.mark.asyncio
    async def test_get_available_models_without_openrouter(self, mock_db):
        """Test get_available_models when OpenRouter is disabled."""
        with patch('app.llm_proxy.gateway_unified.LLMProxy'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_get_client:
                with patch('app.llm_proxy.gateway_unified.CreditService'):
                    mock_client = MagicMock()
                    mock_client.openrouter_client = None  # OpenRouter disabled
                    mock_client.direct_providers = {"openai": True}
                    mock_get_client.return_value = mock_client
                    
                    gateway = LLMGateway(mock_db)
                    
                    result = await gateway.get_available_models()
                    
                    assert result["openrouter"]["enabled"] is False
