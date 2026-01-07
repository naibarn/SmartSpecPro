"""
Unit tests for LLM Monitoring Service
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from decimal import Decimal
from app.services.llm_monitoring import LLMMonitoringService, ProviderHealthMonitor, _provider_health
from app.models.credit import CreditTransaction

class TestLLMMonitoringService:
    """Test LLMMonitoringService class"""

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.fixture
    def monitor_service(self, mock_db):
        return LLMMonitoringService(mock_db)

    @pytest.mark.asyncio
    async def test_log_llm_request(self, monitor_service):
        """Test logging LLM request"""
        # Just verifying it doesn't crash and logs
        await monitor_service.log_llm_request(
            user_id=1,
            provider="openai",
            model="gpt-4",
            model_requested="gpt-4",
            task_type="chat",
            budget_priority="high",
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30,
            cost_usd=Decimal("0.001"),
            credits_used=100,
            latency_ms=500.0,
            success=True
        )

    @pytest.mark.asyncio
    async def test_get_user_usage_stats(self, monitor_service, mock_db):
        """Test usage stats"""
        # Mock DB result row
        row = Mock()
        row.total_requests = 10
        row.total_credits = 1000
        row.avg_credits_per_request = 100
        
        mock_result = MagicMock()
        mock_result.first.return_value = row
        mock_db.execute.return_value = mock_result
        
        with patch("app.core.credits.credits_to_usd", return_value=1.0):
            stats = await monitor_service.get_user_usage_stats(user_id=1)
            
            assert stats["total_requests"] == 10
            assert stats["total_credits"] == 1000
            assert stats["total_usd"] == 1.0

    @pytest.mark.asyncio
    async def test_get_user_usage_stats_empty(self, monitor_service, mock_db):
        """Test usage stats empty"""
        mock_result = MagicMock()
        mock_result.first.return_value = None
        mock_db.execute.return_value = mock_result
        
        stats = await monitor_service.get_user_usage_stats(user_id=1)
        
        assert stats["total_requests"] == 0

    @pytest.mark.asyncio
    async def test_get_provider_usage_breakdown(self, monitor_service, mock_db):
        """Test provider breakdown"""
        # Mock transactions
        tx1 = CreditTransaction(amount=100, metadata={"provider": "openai", "tokens": 10})
        tx2 = CreditTransaction(amount=50, metadata={"provider": "anthropic", "tokens": 5})
        
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [tx1, tx2]
        mock_db.execute.return_value = mock_result
        
        with patch("app.core.credits.credits_to_usd", side_effect=[0.1, 0.05]):
            stats = await monitor_service.get_provider_usage_breakdown(user_id=1)
            
            assert len(stats) == 2
            assert stats[0]["provider"] == "openai"
            assert stats[0]["credits"] == 100

    @pytest.mark.asyncio
    async def test_get_model_usage_breakdown(self, monitor_service, mock_db):
        """Test model breakdown"""
        tx1 = CreditTransaction(amount=100, metadata={"model": "gpt-4"})
        
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [tx1]
        mock_db.execute.return_value = mock_result
        
        with patch("app.core.credits.credits_to_usd", return_value=0.1):
            stats = await monitor_service.get_model_usage_breakdown(user_id=1)
            
            assert stats[0]["model"] == "gpt-4"

    @pytest.mark.asyncio
    async def test_get_task_type_breakdown(self, monitor_service, mock_db):
        """Test task type breakdown"""
        tx1 = CreditTransaction(amount=100, metadata={"task_type": "chat"})
        
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = [tx1]
        mock_db.execute.return_value = mock_result
        
        with patch("app.core.credits.credits_to_usd", return_value=0.1):
            stats = await monitor_service.get_task_type_breakdown(user_id=1)
            
            assert stats[0]["task_type"] == "chat"


class TestProviderHealthMonitor:
    """Test ProviderHealthMonitor class"""
    
    def setup_method(self):
        """Clear health data before each test"""
        _provider_health.clear()
        
    def teardown_method(self):
        """Clear health data after each test"""
        _provider_health.clear()

    def test_record_request(self):
        """Test recording requests"""
        ProviderHealthMonitor.record_request("openai", "gpt-4", True, 100.0)
        ProviderHealthMonitor.record_request("openai", "gpt-4", False, 100.0, "Error")
        
        stats = ProviderHealthMonitor.get_provider_health("openai", "gpt-4")
        
        assert stats["total_requests"] == 2
        assert stats["successful_requests"] == 1
        assert stats["failed_requests"] == 1
        assert stats["success_rate"] == 0.5
        assert stats["avg_latency_ms"] == 100.0

    def test_get_all_provider_health(self):
        """Test getting all health stats"""
        ProviderHealthMonitor.record_request("p1", "m1", True, 10.0)
        ProviderHealthMonitor.record_request("p2", "m2", False, 10.0)
        
        all_stats = ProviderHealthMonitor.get_all_provider_health()
        
        assert len(all_stats) == 2
        # p1 should be first (higher success rate)
        assert all_stats[0]["provider"] == "p1"

    def test_is_provider_healthy(self):
        """Test health check logic"""
        # Unknown provider -> assume healthy
        assert ProviderHealthMonitor.is_provider_healthy("unknown", "model") is True
        
        # Less than 10 requests -> assume healthy
        for _ in range(5):
            ProviderHealthMonitor.record_request("p1", "m1", False, 10.0)
        assert ProviderHealthMonitor.is_provider_healthy("p1", "m1") is True
        
        # More than 10 requests, low success rate -> unhealthy
        for _ in range(6):
             ProviderHealthMonitor.record_request("p1", "m1", False, 10.0)
        # Total 11 fails, 0 success
        assert ProviderHealthMonitor.is_provider_healthy("p1", "m1") is False

