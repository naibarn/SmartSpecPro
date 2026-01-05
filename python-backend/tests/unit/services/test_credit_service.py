"""
Unit Tests for CreditService
Tests credit balance, transactions, deductions, and top-ups
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import uuid

from app.services.credit_service import CreditService, InsufficientCreditsError
from app.models.user import User
from app.models.credit import CreditTransaction, SystemConfig
from app.core.credits import usd_to_credits, credits_to_usd


class TestCreditServiceBalance:
    """Test balance-related methods"""
    
    @pytest.mark.asyncio
    async def test_get_balance(self, test_db, test_user):
        """Test getting user credit balance"""
        service = CreditService(test_db)
        
        balance = await service.get_balance(str(test_user.id))
        
        assert isinstance(balance, int)
        assert balance >= 0
        assert balance == test_user.credits_balance
    
    @pytest.mark.asyncio
    async def test_get_balance_nonexistent_user(self, test_db):
        """Test getting balance for non-existent user"""
        service = CreditService(test_db)
        fake_user_id = str(uuid.uuid4())
        
        with pytest.raises(ValueError, match="User not found"):
            await service.get_balance(fake_user_id)
    
    @pytest.mark.asyncio
    async def test_get_balance_usd(self, test_db, test_user):
        """Test getting user credit balance in USD"""
        service = CreditService(test_db)
        
        balance_usd = await service.get_balance_usd(str(test_user.id))
        
        assert isinstance(balance_usd, Decimal)
        assert balance_usd >= 0
        # 100000 credits = $100
        expected_usd = credits_to_usd(test_user.credits_balance)
        assert balance_usd == expected_usd


class TestCreditServiceMarkup:
    """Test markup-related methods"""
    
    @pytest.mark.asyncio
    async def test_get_markup_percent_default(self, test_db):
        """Test getting default markup percentage"""
        service = CreditService(test_db)
        
        markup = await service.get_markup_percent()
        
        assert isinstance(markup, Decimal)
        assert markup == Decimal("15")  # Default markup
    
    @pytest.mark.asyncio
    async def test_set_and_get_markup_percent(self, test_db):
        """Test setting and getting markup percentage"""
        service = CreditService(test_db)
        
        # Set custom markup
        await service.set_markup_percent(Decimal("20"))
        
        # Get and verify
        markup = await service.get_markup_percent()
        assert markup == Decimal("20")
    
    @pytest.mark.asyncio
    async def test_update_existing_markup(self, test_db):
        """Test updating existing markup percentage"""
        service = CreditService(test_db)
        
        # Set initial markup
        await service.set_markup_percent(Decimal("10"))
        
        # Update markup
        await service.set_markup_percent(Decimal("25"))
        
        # Verify update
        markup = await service.get_markup_percent()
        assert markup == Decimal("25")


class TestCreditServiceSufficientCredits:
    """Test credit sufficiency checks"""
    
    @pytest.mark.asyncio
    async def test_check_sufficient_credits_true(self, test_db, test_user):
        """Test checking sufficient credits when user has enough"""
        service = CreditService(test_db)
        
        # User has 100000 credits, check for small amount
        result = await service.check_sufficient_credits(str(test_user.id), Decimal("0.01"))
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_sufficient_credits_false(self, test_db, test_user):
        """Test checking sufficient credits when user doesn't have enough"""
        service = CreditService(test_db)
        
        # Check for very large amount (more than 100000 credits = $100)
        result = await service.check_sufficient_credits(str(test_user.id), Decimal("1000000"))
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_sufficient_credits_exact(self, test_db, test_user):
        """Test checking sufficient credits when user has exact amount"""
        service = CreditService(test_db)
        
        # User has 100000 credits = $100
        result = await service.check_sufficient_credits(str(test_user.id), Decimal("100"))
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_sufficient_credits_boundary(self, test_db, test_user):
        """Test checking sufficient credits at boundary"""
        service = CreditService(test_db)
        
        # Just over the limit
        result = await service.check_sufficient_credits(str(test_user.id), Decimal("100.01"))
        
        assert result is False


class TestCreditServiceDeduction:
    """Test credit deduction methods"""
    
    @pytest.mark.asyncio
    async def test_deduct_credits_success(self, test_db, test_user):
        """Test successful credit deduction"""
        service = CreditService(test_db)
        initial_balance = test_user.credits_balance
        
        # Deduct $1 = 1000 credits
        transaction = await service.deduct_credits(
            user_id=str(test_user.id),
            llm_cost_usd=Decimal("1.00"),
            description="Test LLM usage",
            metadata={"model": "gpt-4"}
        )
        
        assert transaction is not None
        assert transaction.type == "deduction"
        assert transaction.amount == 1000
        assert transaction.balance_before == initial_balance
        assert transaction.balance_after == initial_balance - 1000
        assert transaction.metadata["model"] == "gpt-4"
    
    @pytest.mark.asyncio
    async def test_deduct_credits_insufficient(self, test_db, test_user):
        """Test credit deduction with insufficient balance"""
        service = CreditService(test_db)
        
        # Try to deduct more than available
        with pytest.raises(InsufficientCreditsError) as exc_info:
            await service.deduct_credits(
                user_id=str(test_user.id),
                llm_cost_usd=Decimal("1000000"),  # Way more than available
                description="Test LLM usage"
            )
        
        assert exc_info.value.available == test_user.credits_balance
    
    @pytest.mark.asyncio
    async def test_deduct_credits_nonexistent_user(self, test_db):
        """Test credit deduction for non-existent user"""
        service = CreditService(test_db)
        fake_user_id = str(uuid.uuid4())
        
        with pytest.raises(ValueError, match="User not found"):
            await service.deduct_credits(
                user_id=fake_user_id,
                llm_cost_usd=Decimal("1.00"),
                description="Test"
            )


class TestCreditServiceTopup:
    """Test credit top-up methods"""
    
    @pytest.mark.asyncio
    async def test_topup_credits(self, test_db, test_user):
        """Test credit top-up with markup"""
        service = CreditService(test_db)
        initial_balance = test_user.credits_balance
        
        # Top up $100 with 15% markup
        # User pays $100, gets credits worth $85 = 85000 credits
        transaction = await service.topup_credits(
            user_id=str(test_user.id),
            payment_usd=Decimal("100"),
            description="Test top-up",
            metadata={"payment_method": "stripe"}
        )
        
        assert transaction is not None
        assert transaction.type == "topup"
        # With 15% markup: $100 / 1.15 ≈ $86.96 → 86956 credits
        assert transaction.amount > 0
        assert transaction.balance_after > initial_balance
        assert "payment_method" in transaction.metadata
    
    @pytest.mark.asyncio
    async def test_add_credits_direct(self, test_db, test_user):
        """Test adding credits directly (no markup)"""
        service = CreditService(test_db)
        initial_balance = test_user.credits_balance
        
        # Add 5000 credits directly
        transaction = await service.add_credits(
            user_id=str(test_user.id),
            amount=5000,
            description="Test adjustment",
            transaction_type="adjustment"
        )
        
        assert transaction is not None
        assert transaction.type == "adjustment"
        assert transaction.amount == 5000
        assert transaction.balance_after == initial_balance + 5000


class TestCreditServiceTransactionHistory:
    """Test transaction history methods"""
    
    @pytest.mark.asyncio
    async def test_get_transactions(self, test_db, test_user):
        """Test getting transaction history"""
        service = CreditService(test_db)
        
        # Create some transactions first
        await service.deduct_credits(
            user_id=str(test_user.id),
            llm_cost_usd=Decimal("0.10"),
            description="Test transaction 1"
        )
        await service.deduct_credits(
            user_id=str(test_user.id),
            llm_cost_usd=Decimal("0.20"),
            description="Test transaction 2"
        )
        
        transactions = await service.get_transactions(
            user_id=str(test_user.id),
            limit=10,
            offset=0
        )
        
        assert isinstance(transactions, list)
        assert len(transactions) >= 2
    
    @pytest.mark.asyncio
    async def test_get_transaction_stats(self, test_db, test_user):
        """Test getting transaction statistics"""
        service = CreditService(test_db)
        
        # Create some transactions
        await service.add_credits(
            user_id=str(test_user.id),
            amount=1000,
            description="Test add"
        )
        await service.deduct_credits(
            user_id=str(test_user.id),
            llm_cost_usd=Decimal("0.50"),
            description="Test deduct"
        )
        
        stats = await service.get_transaction_stats(str(test_user.id))
        
        assert isinstance(stats, dict)
        assert "total_added_credits" in stats
        assert "total_deducted_credits" in stats
        assert "transaction_count" in stats
        assert "current_balance_credits" in stats
    
    @pytest.mark.asyncio
    async def test_get_transactions_with_pagination(self, test_db, test_user):
        """Test getting transactions with pagination"""
        service = CreditService(test_db)
        
        # Create multiple transactions
        for i in range(5):
            await service.deduct_credits(
                user_id=str(test_user.id),
                llm_cost_usd=Decimal("0.01"),
                description=f"Transaction {i}"
            )
        
        # Get first page
        page1 = await service.get_transactions(
            user_id=str(test_user.id),
            limit=2,
            offset=0
        )
        
        # Get second page
        page2 = await service.get_transactions(
            user_id=str(test_user.id),
            limit=2,
            offset=2
        )
        
        assert len(page1) == 2
        assert len(page2) == 2


class TestInsufficientCreditsError:
    """Test InsufficientCreditsError exception"""
    
    def test_error_message(self):
        """Test error message formatting"""
        error = InsufficientCreditsError(required=1000, available=500)
        
        assert "1,000" in str(error)
        assert "500" in str(error)
        assert error.required == 1000
        assert error.available == 500
    
    def test_error_with_large_numbers(self):
        """Test error message with large numbers"""
        error = InsufficientCreditsError(required=1000000, available=500000)
        
        assert "1,000,000" in str(error)
        assert "500,000" in str(error)
    
    def test_error_attributes(self):
        """Test error attributes"""
        error = InsufficientCreditsError(required=100, available=50)
        
        assert hasattr(error, 'required')
        assert hasattr(error, 'available')
        assert error.required == 100
        assert error.available == 50


class TestCreditConversions:
    """Test credit conversion utilities"""
    
    def test_usd_to_credits(self):
        """Test USD to credits conversion"""
        # $1 = 1000 credits
        assert usd_to_credits(Decimal("1")) == 1000
        assert usd_to_credits(Decimal("0.10")) == 100
        assert usd_to_credits(Decimal("100")) == 100000
    
    def test_credits_to_usd(self):
        """Test credits to USD conversion"""
        # 1000 credits = $1
        assert credits_to_usd(1000) == Decimal("1.00")
        assert credits_to_usd(100) == Decimal("0.10")
        assert credits_to_usd(100000) == Decimal("100.00")
    
    def test_conversion_roundtrip(self):
        """Test conversion roundtrip"""
        original_usd = Decimal("50.00")
        credits = usd_to_credits(original_usd)
        back_to_usd = credits_to_usd(credits)
        
        assert back_to_usd == original_usd
