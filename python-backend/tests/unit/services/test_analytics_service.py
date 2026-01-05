"""
Unit Tests for AnalyticsService
Tests analytics data retrieval and aggregation with comprehensive mocking
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta
from decimal import Decimal
import uuid

from app.services.analytics_service import AnalyticsService
from app.models.credit import CreditTransaction
from app.models.payment import PaymentTransaction


class TestAnalyticsServiceWithMocks:
    """Tests for AnalyticsService with proper mocking"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        db = MagicMock()
        db.execute = AsyncMock()
        return db
    
    @pytest.fixture
    def analytics_service(self, mock_db):
        """Create analytics service with mock db"""
        return AnalyticsService(db=mock_db)
    
    @pytest.fixture
    def sample_credit_transaction(self):
        """Create sample credit transaction"""
        tx = MagicMock(spec=CreditTransaction)
        tx.id = "tx-123"
        tx.user_id = "user-123"
        tx.amount = 100
        tx.type = "deduction"
        tx.description = "LLM usage"
        tx.created_at = datetime.utcnow()
        tx.metadata = {
            "provider": "openai",
            "model": "gpt-4"
        }
        return tx
    
    @pytest.fixture
    def sample_payment_transaction(self):
        """Create sample payment transaction"""
        payment = MagicMock(spec=PaymentTransaction)
        payment.id = "pay-123"
        payment.user_id = "user-123"
        payment.amount_usd = 10.00
        payment.credits_added = 10000
        payment.status = "completed"
        payment.created_at = datetime.utcnow()
        return payment
    
    # =========================================================================
    # get_usage_summary tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_usage_summary_success(
        self, analytics_service, mock_db, 
        sample_credit_transaction, sample_payment_transaction
    ):
        """Test getting usage summary"""
        credit_result = MagicMock()
        credit_result.scalars.return_value.all.return_value = [sample_credit_transaction]
        
        payment_result = MagicMock()
        payment_result.scalars.return_value.all.return_value = [sample_payment_transaction]
        
        mock_db.execute.side_effect = [credit_result, payment_result]
        
        summary = await analytics_service.get_usage_summary(
            user_id="user-123",
            days=30
        )
        
        assert "period" in summary
        assert "usage" in summary
        assert "payments" in summary
        assert "by_provider" in summary
        assert "by_model" in summary
        assert "by_day" in summary
        
        assert summary["usage"]["total_requests"] == 1
        assert summary["usage"]["total_credits"] == 100
        assert summary["payments"]["total_paid_usd"] == 10.00
    
    @pytest.mark.asyncio
    async def test_get_usage_summary_invalid_days_too_low(self, analytics_service):
        """Test usage summary with invalid days (too low)"""
        with pytest.raises(ValueError) as exc_info:
            await analytics_service.get_usage_summary(user_id="user-123", days=0)
        
        assert "Days must be between 1 and 365" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_get_usage_summary_invalid_days_too_high(self, analytics_service):
        """Test usage summary with invalid days (too high)"""
        with pytest.raises(ValueError) as exc_info:
            await analytics_service.get_usage_summary(user_id="user-123", days=400)
        
        assert "Days must be between 1 and 365" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_get_usage_summary_no_transactions(self, analytics_service, mock_db):
        """Test usage summary with no transactions"""
        credit_result = MagicMock()
        credit_result.scalars.return_value.all.return_value = []
        
        payment_result = MagicMock()
        payment_result.scalars.return_value.all.return_value = []
        
        mock_db.execute.side_effect = [credit_result, payment_result]
        
        summary = await analytics_service.get_usage_summary(
            user_id="user-123",
            days=30
        )
        
        assert summary["usage"]["total_requests"] == 0
        assert summary["usage"]["total_credits"] == 0
        assert summary["usage"]["avg_credits_per_request"] == 0
        assert summary["payments"]["payment_count"] == 0
    
    @pytest.mark.asyncio
    async def test_get_usage_summary_missing_metadata(self, analytics_service, mock_db, sample_payment_transaction):
        """Test usage summary with missing metadata"""
        tx = MagicMock(spec=CreditTransaction)
        tx.amount = 50
        tx.created_at = datetime.utcnow()
        tx.metadata = None
        
        credit_result = MagicMock()
        credit_result.scalars.return_value.all.return_value = [tx]
        
        payment_result = MagicMock()
        payment_result.scalars.return_value.all.return_value = []
        
        mock_db.execute.side_effect = [credit_result, payment_result]
        
        summary = await analytics_service.get_usage_summary(
            user_id="user-123",
            days=30
        )
        
        assert "unknown" in summary["by_provider"]
    
    # =========================================================================
    # get_time_series tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_time_series_day_granularity(
        self, analytics_service, mock_db, sample_credit_transaction
    ):
        """Test getting time series with day granularity"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_credit_transaction]
        mock_db.execute.return_value = mock_result
        
        data = await analytics_service.get_time_series(
            user_id="user-123",
            days=30,
            granularity="day"
        )
        
        assert len(data) == 1
        assert "timestamp" in data[0]
        assert "requests" in data[0]
        assert "credits" in data[0]
        assert "cost_usd" in data[0]
    
    @pytest.mark.asyncio
    async def test_get_time_series_hour_granularity(
        self, analytics_service, mock_db, sample_credit_transaction
    ):
        """Test getting time series with hour granularity"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_credit_transaction]
        mock_db.execute.return_value = mock_result
        
        data = await analytics_service.get_time_series(
            user_id="user-123",
            days=7,
            granularity="hour"
        )
        
        assert len(data) == 1
        assert ":00" in data[0]["timestamp"]
    
    @pytest.mark.asyncio
    async def test_get_time_series_invalid_days(self, analytics_service):
        """Test time series with invalid days"""
        with pytest.raises(ValueError) as exc_info:
            await analytics_service.get_time_series(
                user_id="user-123",
                days=0
            )
        
        assert "Days must be between 1 and 365" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_get_time_series_invalid_granularity(self, analytics_service):
        """Test time series with invalid granularity"""
        with pytest.raises(ValueError) as exc_info:
            await analytics_service.get_time_series(
                user_id="user-123",
                days=30,
                granularity="minute"
            )
        
        assert "Granularity must be 'day' or 'hour'" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_get_time_series_empty(self, analytics_service, mock_db):
        """Test time series with no data"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        data = await analytics_service.get_time_series(
            user_id="user-123",
            days=30
        )
        
        assert data == []
    
    @pytest.mark.asyncio
    async def test_get_time_series_multiple_transactions_same_day(
        self, analytics_service, mock_db
    ):
        """Test time series aggregates transactions on same day"""
        tx1 = MagicMock(spec=CreditTransaction)
        tx1.amount = 100
        tx1.created_at = datetime.utcnow()
        
        tx2 = MagicMock(spec=CreditTransaction)
        tx2.amount = 200
        tx2.created_at = datetime.utcnow()
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tx1, tx2]
        mock_db.execute.return_value = mock_result
        
        data = await analytics_service.get_time_series(
            user_id="user-123",
            days=30,
            granularity="day"
        )
        
        assert len(data) == 1
        assert data[0]["requests"] == 2
        assert data[0]["credits"] == 300
    
    # =========================================================================
    # get_provider_comparison tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_provider_comparison_success(
        self, analytics_service, mock_db, sample_credit_transaction
    ):
        """Test getting provider comparison"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_credit_transaction]
        mock_db.execute.return_value = mock_result
        
        comparison = await analytics_service.get_provider_comparison(
            user_id="user-123",
            days=30
        )
        
        assert len(comparison) == 1
        assert comparison[0]["provider"] == "openai"
        assert comparison[0]["requests"] == 1
        assert "cost_percentage" in comparison[0]
        assert "avg_cost_per_request" in comparison[0]
    
    @pytest.mark.asyncio
    async def test_get_provider_comparison_multiple_providers(
        self, analytics_service, mock_db
    ):
        """Test provider comparison with multiple providers"""
        tx1 = MagicMock(spec=CreditTransaction)
        tx1.amount = 100
        tx1.created_at = datetime.utcnow()
        tx1.metadata = {"provider": "openai", "model": "gpt-4"}
        
        tx2 = MagicMock(spec=CreditTransaction)
        tx2.amount = 50
        tx2.created_at = datetime.utcnow()
        tx2.metadata = {"provider": "anthropic", "model": "claude-3"}
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tx1, tx2]
        mock_db.execute.return_value = mock_result
        
        comparison = await analytics_service.get_provider_comparison(
            user_id="user-123",
            days=30
        )
        
        assert len(comparison) == 2
        assert comparison[0]["provider"] == "openai"
        assert comparison[1]["provider"] == "anthropic"
    
    @pytest.mark.asyncio
    async def test_get_provider_comparison_empty(self, analytics_service, mock_db):
        """Test provider comparison with no data"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        comparison = await analytics_service.get_provider_comparison(
            user_id="user-123",
            days=30
        )
        
        assert comparison == []
    
    @pytest.mark.asyncio
    async def test_get_provider_comparison_models_used(
        self, analytics_service, mock_db
    ):
        """Test provider comparison tracks models used"""
        tx1 = MagicMock(spec=CreditTransaction)
        tx1.amount = 100
        tx1.created_at = datetime.utcnow()
        tx1.metadata = {"provider": "openai", "model": "gpt-4"}
        
        tx2 = MagicMock(spec=CreditTransaction)
        tx2.amount = 50
        tx2.created_at = datetime.utcnow()
        tx2.metadata = {"provider": "openai", "model": "gpt-3.5-turbo"}
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tx1, tx2]
        mock_db.execute.return_value = mock_result
        
        comparison = await analytics_service.get_provider_comparison(
            user_id="user-123",
            days=30
        )
        
        assert len(comparison) == 1
        assert len(comparison[0]["models_used"]) == 2
        assert "gpt-4" in comparison[0]["models_used"]
        assert "gpt-3.5-turbo" in comparison[0]["models_used"]
    
    # =========================================================================
    # export_usage_csv tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_export_usage_csv_success(
        self, analytics_service, mock_db, sample_credit_transaction
    ):
        """Test exporting usage to CSV"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_credit_transaction]
        mock_db.execute.return_value = mock_result
        
        csv_data = await analytics_service.export_usage_csv(
            user_id="user-123",
            days=30
        )
        
        assert "Date" in csv_data
        assert "Time" in csv_data
        assert "Provider" in csv_data
        assert "Model" in csv_data
        assert "Credits" in csv_data
        assert "Cost (USD)" in csv_data
        assert "openai" in csv_data
        assert "gpt-4" in csv_data
    
    @pytest.mark.asyncio
    async def test_export_usage_csv_empty(self, analytics_service, mock_db):
        """Test exporting empty CSV"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        csv_data = await analytics_service.export_usage_csv(
            user_id="user-123",
            days=30
        )
        
        assert "Date" in csv_data
        assert "Provider" in csv_data
    
    @pytest.mark.asyncio
    async def test_export_usage_csv_missing_metadata(self, analytics_service, mock_db):
        """Test CSV export with missing metadata"""
        tx = MagicMock(spec=CreditTransaction)
        tx.amount = 50
        tx.created_at = datetime.utcnow()
        tx.metadata = None
        tx.description = None
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tx]
        mock_db.execute.return_value = mock_result
        
        csv_data = await analytics_service.export_usage_csv(
            user_id="user-123",
            days=30
        )
        
        assert "N/A" in csv_data
    
    # =========================================================================
    # get_top_models tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_top_models_success(
        self, analytics_service, mock_db, sample_credit_transaction
    ):
        """Test getting top models"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_credit_transaction]
        mock_db.execute.return_value = mock_result
        
        models = await analytics_service.get_top_models(
            user_id="user-123",
            days=30,
            limit=10
        )
        
        assert len(models) == 1
        assert models[0]["model"] == "openai/gpt-4"
        assert models[0]["provider"] == "openai"
        assert models[0]["model_name"] == "gpt-4"
        assert "avg_cost_per_request" in models[0]
    
    @pytest.mark.asyncio
    async def test_get_top_models_limit(self, analytics_service, mock_db):
        """Test top models respects limit"""
        transactions = []
        for i in range(15):
            tx = MagicMock(spec=CreditTransaction)
            tx.amount = 100 - i
            tx.created_at = datetime.utcnow()
            tx.metadata = {"provider": f"provider{i}", "model": f"model{i}"}
            transactions.append(tx)
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = transactions
        mock_db.execute.return_value = mock_result
        
        models = await analytics_service.get_top_models(
            user_id="user-123",
            days=30,
            limit=5
        )
        
        assert len(models) == 5
    
    @pytest.mark.asyncio
    async def test_get_top_models_empty(self, analytics_service, mock_db):
        """Test top models with no data"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        models = await analytics_service.get_top_models(
            user_id="user-123",
            days=30
        )
        
        assert models == []
    
    @pytest.mark.asyncio
    async def test_get_top_models_sorted_by_cost(self, analytics_service, mock_db):
        """Test top models sorted by cost descending"""
        tx1 = MagicMock(spec=CreditTransaction)
        tx1.amount = 50
        tx1.created_at = datetime.utcnow()
        tx1.metadata = {"provider": "openai", "model": "gpt-3.5"}
        
        tx2 = MagicMock(spec=CreditTransaction)
        tx2.amount = 200
        tx2.created_at = datetime.utcnow()
        tx2.metadata = {"provider": "openai", "model": "gpt-4"}
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tx1, tx2]
        mock_db.execute.return_value = mock_result
        
        models = await analytics_service.get_top_models(
            user_id="user-123",
            days=30
        )
        
        assert models[0]["model_name"] == "gpt-4"
        assert models[1]["model_name"] == "gpt-3.5"
    
    @pytest.mark.asyncio
    async def test_get_top_models_aggregates_same_model(self, analytics_service, mock_db):
        """Test top models aggregates same model usage"""
        tx1 = MagicMock(spec=CreditTransaction)
        tx1.amount = 100
        tx1.created_at = datetime.utcnow()
        tx1.metadata = {"provider": "openai", "model": "gpt-4"}
        
        tx2 = MagicMock(spec=CreditTransaction)
        tx2.amount = 150
        tx2.created_at = datetime.utcnow()
        tx2.metadata = {"provider": "openai", "model": "gpt-4"}
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [tx1, tx2]
        mock_db.execute.return_value = mock_result
        
        models = await analytics_service.get_top_models(
            user_id="user-123",
            days=30
        )
        
        assert len(models) == 1
        assert models[0]["requests"] == 2
        assert models[0]["credits"] == 250
