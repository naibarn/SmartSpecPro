"""
SmartSpec Pro - Gateway Unified Tests

Comprehensive tests for LLMGateway with proper mocking.
Tests cover:
- Gateway initialization
- Cost estimation
- Credit checking
- Credit deduction
- LLM invocation (via OpenRouter and direct)
- User balance retrieval
- Available models
- Error handling
- Backward compatibility
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.gateway_unified import LLMGateway, COST_PER_1K_TOKENS, MODEL_MATRIX
from app.services.credit_service import InsufficientCreditsError


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db_session():
    """Create a mock database session."""
    session = AsyncMock()
    return session


@pytest.fixture
def mock_credit_service():
    """Create a mock credit service."""
    service = AsyncMock()
    service.check_sufficient_credits = AsyncMock(return_value=True)
    service.get_balance = AsyncMock(return_value=1000)
    service.deduct_credits = AsyncMock()
    return service


@pytest.fixture
def mock_unified_client():
    """Create a mock unified client."""
    client = MagicMock()
    client.openrouter_client = MagicMock()
    client.direct_providers = {"openai", "anthropic", "google", "groq", "ollama", "zai"}
    client.estimate_cost = MagicMock(return_value=Decimal("0.001"))
    client.chat = AsyncMock()
    return client


@pytest.fixture
def mock_llm_proxy():
    """Create a mock LLM proxy."""
    proxy = MagicMock()
    proxy.get_fallback_providers = MagicMock(return_value=["anthropic", "google"])
    return proxy


@pytest.fixture
def mock_user():
    """Create a mock user."""
    user = MagicMock()
    user.id = "test-user-id"
    user.email = "test@example.com"
    return user


@pytest.fixture
def gateway(mock_db_session, mock_credit_service, mock_unified_client, mock_llm_proxy):
    """Create a gateway instance with mocked dependencies."""
    with patch('app.llm_proxy.gateway_unified.CreditService', return_value=mock_credit_service):
        with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=mock_unified_client):
            with patch('app.llm_proxy.gateway_unified.LLMProxy', return_value=mock_llm_proxy):
                gw = LLMGateway(mock_db_session)
                gw.credit_service = mock_credit_service
                gw.unified_client = mock_unified_client
                gw.llm_proxy = mock_llm_proxy
                return gw


# =============================================================================
# Test Classes
# =============================================================================

class TestGatewayInitialization:
    """Test gateway initialization."""
    
    def test_init_creates_dependencies(self, mock_db_session):
        """Test that initialization creates all dependencies."""
        with patch('app.llm_proxy.gateway_unified.CreditService') as mock_credit_class:
            with patch('app.llm_proxy.gateway_unified.get_unified_client') as mock_client_func:
                with patch('app.llm_proxy.gateway_unified.LLMProxy') as mock_proxy_class:
                    mock_credit_instance = MagicMock()
                    mock_credit_class.return_value = mock_credit_instance
                    mock_client_func.return_value = MagicMock()
                    mock_proxy_class.return_value = MagicMock()
                    
                    gateway = LLMGateway(mock_db_session)
                    
                    mock_credit_class.assert_called_once_with(mock_db_session)
                    mock_client_func.assert_called_once()
                    mock_proxy_class.assert_called_once()
                    
                    assert gateway.db == mock_db_session
                    assert gateway.credit_service == mock_credit_instance
    
    def test_init_with_custom_settings(self, mock_db_session):
        """Test initialization preserves database session."""
        with patch('app.llm_proxy.gateway_unified.CreditService'):
            with patch('app.llm_proxy.gateway_unified.get_unified_client'):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(mock_db_session)
                    
                    assert gateway.db is mock_db_session


class TestCostEstimation:
    """Test cost estimation functionality."""
    
    def test_estimate_cost_with_openrouter(self, gateway, mock_unified_client):
        """Test cost estimation with OpenRouter enabled."""
        request = LLMRequest(
            prompt="Test prompt",
            task_type="planning",
            budget_priority="quality"
        )
        
        cost = gateway._estimate_cost(request, use_openrouter=True)
        
        assert cost > 0
        mock_unified_client.estimate_cost.assert_called()
    
    def test_estimate_cost_without_openrouter(self, gateway, mock_unified_client):
        """Test cost estimation with OpenRouter disabled."""
        mock_unified_client.openrouter_client = None
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="code_generation",
            budget_priority="cost"
        )
        
        cost = gateway._estimate_cost(request, use_openrouter=False)
        
        assert cost > 0
        # Should use static cost matrix
        mock_unified_client.estimate_cost.assert_not_called()
    
    def test_estimate_cost_minimum(self, gateway, mock_unified_client):
        """Test that minimum cost is enforced."""
        mock_unified_client.estimate_cost.return_value = Decimal("0.00001")
        
        request = LLMRequest(
            prompt="Short",
            task_type="simple",
            budget_priority="speed"
        )
        
        cost = gateway._estimate_cost(request, use_openrouter=False)
        
        # Minimum cost should be $0.0001
        assert cost >= Decimal("0.0001")
    
    def test_estimate_cost_different_task_types(self, gateway, mock_unified_client):
        """Test cost estimation for different task types."""
        task_types = ["planning", "code_generation", "analysis", "decision", "simple"]
        
        for task_type in task_types:
            request = LLMRequest(
                prompt="Test",
                task_type=task_type,
                budget_priority="quality"
            )
            
            cost = gateway._estimate_cost(request, use_openrouter=False)
            
            assert cost > 0
    
    def test_estimate_cost_different_priorities(self, gateway, mock_unified_client):
        """Test cost estimation for different budget priorities."""
        priorities = ["quality", "cost", "speed"]
        
        for priority in priorities:
            request = LLMRequest(
                prompt="Test",
                task_type="analysis",
                budget_priority=priority
            )
            
            cost = gateway._estimate_cost(request, use_openrouter=False)
            
            assert cost > 0


class TestCreditChecking:
    """Test credit checking functionality."""
    
    @pytest.mark.asyncio
    async def test_check_credits_sufficient(self, gateway, mock_credit_service, mock_user):
        """Test credit check with sufficient credits."""
        mock_credit_service.check_sufficient_credits.return_value = True
        
        # Should not raise
        await gateway._check_credits(mock_user, Decimal("0.01"))
        
        mock_credit_service.check_sufficient_credits.assert_called_once_with(
            user_id=mock_user.id,
            estimated_cost_usd=Decimal("0.01")
        )
    
    @pytest.mark.asyncio
    async def test_check_credits_insufficient(self, gateway, mock_credit_service, mock_user):
        """Test credit check with insufficient credits."""
        mock_credit_service.check_sufficient_credits.return_value = False
        mock_credit_service.get_balance.return_value = 100
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._check_credits(mock_user, Decimal("1.00"))
        
        assert exc_info.value.status_code == 402
        assert "Insufficient credits" in exc_info.value.detail["error"]
    
    @pytest.mark.asyncio
    async def test_check_credits_error_message(self, gateway, mock_credit_service, mock_user):
        """Test that error message contains balance info."""
        mock_credit_service.check_sufficient_credits.return_value = False
        mock_credit_service.get_balance.return_value = 500
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._check_credits(mock_user, Decimal("1.00"))
        
        detail = exc_info.value.detail
        assert "balance_credits" in detail
        assert "required_credits" in detail


class TestCreditDeduction:
    """Test credit deduction functionality."""
    
    @pytest.mark.asyncio
    async def test_deduct_credits_success(self, gateway, mock_credit_service, mock_user):
        """Test successful credit deduction."""
        mock_transaction = MagicMock()
        mock_transaction.amount = 100
        mock_transaction.balance_after = 900
        mock_credit_service.deduct_credits.return_value = mock_transaction
        
        request = LLMRequest(
            prompt="Test",
            task_type="simple",
            budget_priority="quality"
        )
        
        response = LLMResponse(
            content="Response",
            provider="openai",
            model="gpt-4o",
            tokens_used=100,
            cost=Decimal("0.001")
        )
        
        transaction = await gateway._deduct_credits(
            user=mock_user,
            actual_cost=Decimal("0.001"),
            request=request,
            response=response,
            estimated_cost=Decimal("0.001"),
            use_openrouter=True
        )
        
        assert transaction == mock_transaction
        mock_credit_service.deduct_credits.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_deduct_credits_insufficient(self, gateway, mock_credit_service, mock_user):
        """Test credit deduction with insufficient funds."""
        mock_credit_service.deduct_credits.side_effect = InsufficientCreditsError(
            required=Decimal("0.01"),
            available=Decimal("0.005")
        )
        
        request = LLMRequest(prompt="Test", task_type="simple")
        response = LLMResponse(
            content="Response",
            provider="openai",
            model="gpt-4o",
            tokens_used=100,
            cost=Decimal("0.01")
        )
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._deduct_credits(
                user=mock_user,
                actual_cost=Decimal("0.01"),
                request=request,
                response=response,
                estimated_cost=Decimal("0.005"),
                use_openrouter=True
            )
        
        assert exc_info.value.status_code == 402


class TestInvokeViaOpenRouter:
    """Test OpenRouter invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_openrouter_success(self, gateway, mock_unified_client, mock_user):
        """Test successful OpenRouter invocation."""
        mock_response = LLMResponse(
            content="OpenRouter response",
            provider="openrouter",
            model="anthropic/claude-3.5-sonnet",
            tokens_used=200,
            cost=Decimal("0.003")
        )
        mock_unified_client.chat.return_value = mock_response
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="planning",
            budget_priority="quality"
        )
        
        response = await gateway._invoke_via_openrouter(
            request=request,
            user=mock_user,
            fallback_models=None,
            sort=None,
            data_collection="allow",
            zdr=None,
            max_price=None
        )
        
        assert response.content == "OpenRouter response"
        mock_unified_client.chat.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_openrouter_error(self, gateway, mock_unified_client, mock_user):
        """Test OpenRouter invocation error handling."""
        mock_unified_client.chat.side_effect = Exception("API Error")
        
        request = LLMRequest(prompt="Test", task_type="simple")
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._invoke_via_openrouter(
                request=request,
                user=mock_user,
                fallback_models=None,
                sort=None,
                data_collection="allow",
                zdr=None,
                max_price=None
            )
        
        assert exc_info.value.status_code == 500
        assert "LLM call failed" in exc_info.value.detail


class TestInvokeViaDirect:
    """Test direct provider invocation."""
    
    @pytest.mark.asyncio
    async def test_invoke_direct_success(self, gateway, mock_llm_proxy, mock_user):
        """Test successful direct invocation."""
        mock_response = LLMResponse(
            content="Direct response",
            provider="openai",
            model="gpt-4o",
            tokens_used=150,
            cost=Decimal("0.005")
        )
        mock_llm_proxy.invoke.return_value = mock_response
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai"
        )
        
        response = await gateway._invoke_via_direct(request, mock_user)
        
        assert response.content == "Direct response"
        mock_llm_proxy.invoke.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_invoke_direct_fallback(self, gateway, mock_llm_proxy, mock_user):
        """Test direct invocation with fallback."""
        # First provider fails, second succeeds
        from app.llm_proxy.proxy import LLMProviderError
        
        mock_llm_proxy.invoke.side_effect = [
            LLMProviderError("Primary failed", "openai", "gpt-4o"),
            LLMResponse(
                content="Fallback response",
                provider="anthropic",
                model="claude-3-haiku",
                tokens_used=100,
                cost=Decimal("0.00025")
            )
        ]
        mock_llm_proxy.get_fallback_providers.return_value = ["anthropic"]
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai"
        )
        
        response = await gateway._invoke_via_direct(request, mock_user)
        
        assert response.provider == "anthropic"
        assert response.content == "Fallback response"
    
    @pytest.mark.asyncio
    async def test_invoke_direct_all_fallbacks_failed(self, gateway, mock_llm_proxy, mock_user):
        """Test when all direct providers fail."""
        from app.llm_proxy.proxy import LLMProviderError
        
        mock_llm_proxy.invoke.side_effect = LLMProviderError("All failed", "openai", "gpt-4o")
        mock_llm_proxy.get_fallback_providers.return_value = ["anthropic", "google"]
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            preferred_provider="openai"
        )
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway._invoke_via_direct(request, mock_user)
        
        assert exc_info.value.status_code == 503
        assert "unavailable" in exc_info.value.detail.lower()


class TestUserBalance:
    """Test user balance retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_user_balance(self, gateway, mock_credit_service, mock_user):
        """Test getting user balance."""
        mock_credit_service.get_balance.return_value = 1500
        mock_credit_service.get_balance_usd.return_value = Decimal("1.50")
        mock_credit_service.get_transaction_stats.return_value = {
            "total_transactions": 10,
            "total_credits_used": 500
        }
        
        balance = await gateway.get_user_balance(mock_user)
        
        assert balance["balance_credits"] == 1500
        assert balance["balance_usd"] == 1.50
        assert "stats" in balance


class TestAvailableModels:
    """Test available models retrieval."""
    
    def test_get_available_models(self, gateway):
        """Test getting available models."""
        models = gateway.get_available_models()
        
        assert "openrouter" in models
        assert "direct_providers" in models
        assert "recommended_models" in models
        
        assert models["openrouter"]["enabled"] is True
        assert "openai" in models["direct_providers"]
        assert "anthropic" in models["direct_providers"]
    
    def test_recommended_models_structure(self, gateway):
        """Test recommended models have correct structure."""
        models = gateway.get_available_models()
        recommended = models["recommended_models"]
        
        for task_type in ["code_generation", "analysis", "planning", "simple"]:
            assert task_type in recommended
            assert "quality" in recommended[task_type]
            assert "speed" in recommended[task_type]
            assert "cost" in recommended[task_type]


class TestCalculateActualCost:
    """Test actual cost calculation."""
    
    def test_calculate_cost_from_response(self, gateway, mock_unified_client):
        """Test cost calculation from response with cost field."""
        response = LLMResponse(
            content="Test",
            provider="openai",
            model="gpt-4o",
            tokens_used=100,
            cost=Decimal("0.005")
        )
        
        cost = gateway._calculate_actual_cost(response, use_openrouter=True)
        
        assert cost == Decimal("0.005")
    
    def test_calculate_cost_estimate_from_usage(self, gateway, mock_unified_client):
        """Test cost calculation when response has usage."""
        response = LLMResponse(
            content="Test",
            provider="openai",
            model="gpt-4o",
            tokens_used=0,
            cost=None
        )
        response.usage = MagicMock()
        response.usage.prompt_tokens = 50
        response.usage.completion_tokens = 100
        response.usage.total_tokens = 150
        
        cost = gateway._calculate_actual_cost(response, use_openrouter=True)
        
        mock_unified_client.estimate_cost.assert_called()
    
    def test_calculate_cost_fallback(self, gateway, mock_unified_client):
        """Test cost calculation fallback for old responses."""
        mock_unified_client.openrouter_client = None
        
        response = LLMResponse(
            content="Test content",
            provider="openai",
            model="gpt-4o",
            tokens_used=100,
            cost=None
        )
        response.usage = None
        
        cost = gateway._calculate_actual_cost(response, use_openrouter=False)
        
        assert cost > 0


class TestBackwardCompatibility:
    """Test backward compatibility aliases."""
    
    def test_gateway_v1_alias(self):
        """Test that LLMGatewayV1 is alias for LLMGateway."""
        from app.llm_proxy.gateway_unified import LLMGatewayV1
        
        assert LLMGatewayV1 is LLMGateway
    
    def test_gateway_v2_alias(self):
        """Test that LLMGatewayV2 is alias for LLMGateway."""
        from app.llm_proxy.gateway_unified import LLMGatewayV2
        
        assert LLMGatewayV2 is LLMGateway


class TestCostMatrix:
    """Test cost matrix constants."""
    
    def test_cost_per_1k_tokens_exists(self):
        """Test cost matrix is defined."""
        assert len(COST_PER_1K_TOKENS) > 0
        
        # Check some expected values
        assert ("planning", "quality") in COST_PER_1K_TOKENS
        assert ("code_generation", "cost") in COST_PER_1K_TOKENS
    
    def test_model_matrix_exists(self):
        """Test model matrix is defined."""
        assert len(MODEL_MATRIX) > 0
        
        # Check some expected values
        assert ("code_generation", "quality") in MODEL_MATRIX
        assert ("analysis", "speed") in MODEL_MATRIX


class TestGatewayInvokeFlow:
    """Test the complete gateway invoke flow."""
    
    @pytest.mark.asyncio
    async def test_invoke_full_flow(self, gateway, mock_credit_service, mock_unified_client, mock_user):
        """Test complete invoke flow with all steps."""
        # Setup mocks
        mock_credit_service.check_sufficient_credits.return_value = True
        mock_transaction = MagicMock()
        mock_transaction.amount = 100
        mock_transaction.balance_after = 900
        mock_credit_service.deduct_credits.return_value = mock_transaction
        
        mock_response = LLMResponse(
            content="Full flow response",
            provider="openrouter",
            model="anthropic/claude-3.5-sonnet",
            tokens_used=200,
            cost=Decimal("0.003")
        )
        mock_unified_client.chat.return_value = mock_response
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="planning",
            budget_priority="quality"
        )
        
        response = await gateway.invoke(
            request=request,
            user=mock_user,
            use_openrouter=True
        )
        
        assert response.content == "Full flow response"
        assert response.credits_used == mock_transaction.amount
        assert response.credits_balance == mock_transaction.balance_after
    
    @pytest.mark.asyncio
    async def test_invoke_direct_fallback_mode(self, gateway, mock_credit_service, mock_llm_proxy, mock_user):
        """Test invoke with direct mode (OpenRouter disabled)."""
        mock_credit_service.check_sufficient_credits.return_value = True
        mock_transaction = MagicMock()
        mock_transaction.amount = 50
        mock_transaction.balance_after = 950
        mock_credit_service.deduct_credits.return_value = mock_transaction
        
        mock_response = LLMResponse(
            content="Direct response",
            provider="openai",
            model="gpt-4o",
            tokens_used=100,
            cost=Decimal("0.005")
        )
        mock_llm_proxy.invoke.return_value = mock_response
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple",
            budget_priority="speed"
        )
        
        response = await gateway.invoke(
            request=request,
            user=mock_user,
            use_openrouter=False
        )
        
        assert response.content == "Direct response"
        mock_llm_proxy.invoke.assert_called_once()


class TestGatewayErrorHandling:
    """Test gateway error handling."""
    
    @pytest.mark.asyncio
    async def test_invoke_insufficient_credits(self, gateway, mock_credit_service, mock_user):
        """Test invoke with insufficient credits."""
        mock_credit_service.check_sufficient_credits.return_value = False
        mock_credit_service.get_balance.return_value = 100
        
        request = LLMRequest(
            prompt="Test prompt",
            task_type="simple"
        )
        
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            await gateway.invoke(
                request=request,
                user=mock_user,
                use_openrouter=True
            )
        
        assert exc_info.value.status_code == 402
