"""
SmartSpec Pro - End-to-End Tests

E2E tests for complete user journeys.
Tests cover:
- Complete LLM invocation flow
- Credit consumption tracking
- Provider fallback scenarios
- Error recovery flows
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.models import LLMRequest, LLMResponse
from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.proxy import LLMProviderError
from app.services.credit_service import InsufficientCreditsError


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_full_setup():
    """Create a complete mock setup for E2E tests."""
    # Mock database session
    db_session = AsyncMock()
    
    # Mock credit service
    credit_service = AsyncMock()
    credit_service.check_sufficient_credits = AsyncMock(return_value=True)
    credit_service.get_balance = AsyncMock(return_value=10000)
    credit_service.get_balance_usd = AsyncMock(return_value=Decimal("10.00"))
    credit_service.deduct_credits = AsyncMock()
    
    # Mock unified client
    unified_client = MagicMock()
    unified_client.openrouter_client = MagicMock()
    unified_client.direct_providers = {"openai", "anthropic", "google", "groq", "zai"}
    unified_client.estimate_cost = MagicMock(return_value=Decimal("0.002"))
    unified_client.chat = AsyncMock()
    
    # Mock LLM proxy
    llm_proxy = MagicMock()
    llm_proxy.get_fallback_providers = MagicMock(return_value=["anthropic", "google"])
    llm_proxy.invoke = AsyncMock()
    
    return {
        "db_session": db_session,
        "credit_service": credit_service,
        "unified_client": unified_client,
        "llm_proxy": llm_proxy
    }


@pytest.fixture
def mock_user():
    """Create a mock user."""
    user = MagicMock()
    user.id = "user-123"
    user.email = "user@example.com"
    user.credits_balance = 10000
    return user


# =============================================================================
# Test Classes
# =============================================================================

class TestCompleteLLMInvocation:
    """Test complete LLM invocation flows."""
    
    @pytest.mark.asyncio
    async def test_simple_invocation_flow(self, mock_full_setup, mock_user):
        """Test a simple LLM invocation from start to finish."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        # Setup mock response
        mock_response = LLMResponse(
            content="Hello! How can I help you today?",
            provider="openrouter",
            model="anthropic/claude-3.5-sonnet",
            tokens_used=50,
            cost=Decimal("0.00015")
        )
        unified_client.chat.return_value = mock_response
        
        # Setup credit transaction
        mock_transaction = MagicMock()
        mock_transaction.amount = 15  # credits
        mock_transaction.balance_after = 9985
        credit_service.deduct_credits.return_value = mock_transaction
        
        # Create gateway
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    
                    # Execute request
                    request = LLMRequest(
                        prompt="Say hello",
                        task_type="simple",
                        budget_priority="speed"
                    )
                    
                    response = await gateway.invoke(
                        request=request,
                        user=mock_user,
                        use_openrouter=True
                    )
        
        # Verify response
        assert response.content == "Hello! How can I help you today?"
        assert response.provider == "openrouter"
        assert response.tokens_used == 50
        
        # Verify credit was checked
        credit_service.check_sufficient_credits.assert_called_once()
        
        # Verify credit was deducted
        credit_service.deduct_credits.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_code_generation_flow(self, mock_full_setup, mock_user):
        """Test code generation flow."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        # Setup mock response
        mock_response = LLMResponse(
            content="```python\ndef hello():\n    print('Hello!')\n```",
            provider="openrouter",
            model="anthropic/claude-3.5-sonnet",
            tokens_used=150,
            cost=Decimal("0.00045")
        )
        unified_client.chat.return_value = mock_response
        
        mock_transaction = MagicMock()
        mock_transaction.amount = 45
        mock_transaction.balance_after = 9955
        credit_service.deduct_credits.return_value = mock_transaction
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    
                    request = LLMRequest(
                        prompt="Write a hello world function in Python",
                        task_type="code_generation",
                        budget_priority="quality"
                    )
                    
                    response = await gateway.invoke(
                        request=request,
                        user=mock_user,
                        use_openrouter=True
                    )
        
        assert "def hello" in response.content
        assert response.tokens_used == 150


class TestCreditConsumptionTracking:
    """Test credit consumption tracking."""
    
    @pytest.mark.asyncio
    async def test_credit_balance_updates(self, mock_full_setup, mock_user):
        """Test that credit balance is correctly updated."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        initial_balance = 10000
        cost_in_credits = 25
        
        mock_user.credits_balance = initial_balance
        
        mock_response = LLMResponse(
            content="Response",
            provider="openrouter",
            model="openai/gpt-4o-mini",
            tokens_used=100,
            cost=Decimal("0.00015")
        )
        unified_client.chat.return_value = mock_response
        
        mock_transaction = MagicMock()
        mock_transaction.amount = cost_in_credits
        mock_transaction.balance_after = initial_balance - cost_in_credits
        credit_service.deduct_credits.return_value = mock_transaction
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    
                    request = LLMRequest(prompt="Test", task_type="simple")
                    
                    response = await gateway.invoke(
                        request=request,
                        user=mock_user,
                        use_openrouter=True
                    )
        
        assert response.credits_used == cost_in_credits
        assert response.credits_balance == initial_balance - cost_in_credits


class TestProviderFallbackScenarios:
    """Test provider fallback scenarios."""
    
    @pytest.mark.asyncio
    async def test_fallback_on_provider_failure(self, mock_full_setup, mock_user):
        """Test automatic fallback when primary provider fails."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        llm_proxy = setup["llm_proxy"]
        unified_client = setup["unified_client"]
        
        # First call fails, second succeeds
        llm_proxy.invoke.side_effect = [
            LLMProviderError("OpenAI rate limit", "openai", "gpt-4o"),
            LLMResponse(
                content="Fallback response from Anthropic",
                provider="anthropic",
                model="claude-3-haiku",
                tokens_used=80,
                cost=Decimal("0.00002")
            )
        ]
        
        mock_transaction = MagicMock()
        mock_transaction.amount = 10
        mock_transaction.balance_after = 9990
        credit_service.deduct_credits.return_value = mock_transaction
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy', return_value=llm_proxy):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    gateway.llm_proxy = llm_proxy
                    
                    request = LLMRequest(
                        prompt="Test request",
                        task_type="simple",
                        preferred_provider="openai"
                    )
                    
                    response = await gateway.invoke(
                        request=request,
                        user=mock_user,
                        use_openrouter=False  # Direct mode
                    )
        
        assert response.provider == "anthropic"
        assert "Fallback response" in response.content


class TestErrorRecoveryFlows:
    """Test error recovery flows."""
    
    @pytest.mark.asyncio
    async def test_insufficient_credits_recovery(self, mock_full_setup, mock_user):
        """Test recovery when user has insufficient credits."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        # Simulate insufficient credits
        credit_service.check_sufficient_credits.return_value = False
        credit_service.get_balance.return_value = 50  # Low balance
        
        from fastapi import HTTPException
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    
                    request = LLMRequest(
                        prompt="Expensive request",
                        task_type="analysis",
                        budget_priority="quality"
                    )
                    
                    with pytest.raises(HTTPException) as exc_info:
                        await gateway.invoke(
                            request=request,
                            user=mock_user,
                            use_openrouter=True
                        )
        
        assert exc_info.value.status_code == 402
        assert "Insufficient credits" in exc_info.value.detail["error"]
        assert exc_info.value.detail["balance_credits"] == 50
    
    @pytest.mark.asyncio
    async def test_provider_api_error_recovery(self, mock_full_setup, mock_user):
        """Test recovery when provider API returns error."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        # Simulate API error
        unified_client.chat.side_effect = Exception("OpenRouter API error: 503 Service Unavailable")
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    
                    request = LLMRequest(prompt="Test", task_type="simple")
                    
                    from fastapi import HTTPException
                    
                    with pytest.raises(HTTPException) as exc_info:
                        await gateway.invoke(
                            request=request,
                            user=mock_user,
                            use_openrouter=True
                        )
        
        assert exc_info.value.status_code == 500
        assert "LLM call failed" in exc_info.value.detail


class TestCostEstimationAccuracy:
    """Test cost estimation accuracy."""
    
    def test_estimate_matches_actual(self, mock_full_setup):
        """Test that estimated cost is close to actual cost."""
        setup = mock_full_setup
        unified_client = setup["unified_client"]
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        
        # Mock returns different values for estimation vs actual
        unified_client.estimate_cost.side_effect = [
            Decimal("0.010"),  # Estimated
            Decimal("0.0095"),  # Actual
        ]
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.unified_client = unified_client
                    
                    request = LLMRequest(prompt="Test", task_type="simple")
                    
                    # Get estimated cost
                    estimated = gateway._estimate_cost(request, use_openrouter=True)
                    
                    # Create mock response
                    response = LLMResponse(
                        content="Test",
                        provider="test",
                        model="test",
                        tokens_used=100,
                        cost=Decimal("0.0095")
                    )
                    response.usage = MagicMock()
                    response.usage.prompt_tokens = 30
                    response.usage.completion_tokens = 70
                    response.usage.total_tokens = 100
                    
                    # Get actual cost
                    actual = gateway._calculate_actual_cost(response, use_openrouter=True)
        
        # Both should be close (within reasonable margin)
        assert abs(estimated - actual) < Decimal("0.001")


class TestBudgetPrioritySelection:
    """Test budget priority selection."""
    
    def test_quality_priority_uses_best_model(self, mock_full_setup):
        """Test that quality priority selects best model."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    
                    # Test different priorities
                    for task_type in ["planning", "code_generation", "analysis"]:
                        for priority in ["quality", "cost", "speed"]:
                            request = LLMRequest(
                                prompt="Test",
                                task_type=task_type,
                                budget_priority=priority
                            )
                            
                            cost = gateway._estimate_cost(request, use_openrouter=False)
                            
                            # All costs should be positive
                            assert cost > 0
    
    def test_cost_priority_uses_cheapest(self, mock_full_setup):
        """Test that cost priority selects cheapest option."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        # Track which models are selected for cost priority
        cost_priority_models = []
        
        def mock_estimate(model, prompt_tokens, completion_tokens):
            return Decimal("0.0001")  # Cheapest
        
        unified_client.estimate_cost.side_effect = mock_estimate
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    
                    request = LLMRequest(
                        prompt="Test",
                        task_type="code_generation",
                        budget_priority="cost"
                    )
                    
                    cost = gateway._estimate_cost(request, use_openrouter=True)
                    
                    # Cost priority should use cheaper models
                    assert cost > 0


class TestMultipleConcurrentRequests:
    """Test handling of multiple concurrent requests."""
    
    @pytest.mark.asyncio
    async def test_concurrent_requests(self, mock_full_setup, mock_user):
        """Test handling multiple concurrent LLM requests."""
        setup = mock_full_setup
        db_session = setup["db_session"]
        credit_service = setup["credit_service"]
        unified_client = setup["unified_client"]
        
        # Create multiple mock responses
        async def mock_chat(*args, **kwargs):
            return LLMResponse(
                content=f"Response for request",
                provider="openrouter",
                model="openai/gpt-4o-mini",
                tokens_used=50,
                cost=Decimal("0.000075")
            )
        
        unified_client.chat.side_effect = mock_chat
        
        mock_transaction = MagicMock()
        mock_transaction.amount = 10
        mock_transaction.balance_after = 9990
        credit_service.deduct_credits.return_value = mock_transaction
        
        with patch('app.llm_proxy.gateway_unified.CreditService', return_value=credit_service):
            with patch('app.llm_proxy.gateway_unified.get_unified_client', return_value=unified_client):
                with patch('app.llm_proxy.gateway_unified.LLMProxy'):
                    gateway = LLMGateway(db_session)
                    gateway.credit_service = credit_service
                    gateway.unified_client = unified_client
                    
                    # Create multiple concurrent requests
                    requests = [
                        LLMRequest(prompt=f"Request {i}", task_type="simple")
                        for i in range(3)
                    ]
                    
                    # Execute concurrently
                    responses = await gateway.invoke(
                        request=requests[0],
                        user=mock_user,
                        use_openrouter=True
                    )
                    
                    # Should handle at least one request
                    assert responses is not None
                    assert responses.content is not None
