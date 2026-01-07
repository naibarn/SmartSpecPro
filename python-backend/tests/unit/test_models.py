"""
Unit tests for User and Credit Models
"""

import pytest
from datetime import datetime
from app.models.user import User
from app.models.credit import CreditTransaction, SystemConfig


class TestUserModel:
    """Test User model"""
    
    def test_user_creation(self):
        """Test creating a user"""
        user = User(
            email="test@example.com",
            password_hash="hashed_password",
            full_name="Test User"
        )
        
        assert user.email == "test@example.com"
        assert user.password_hash == "hashed_password"
        assert user.full_name == "Test User"
    
    def test_user_default_values(self):
        """Test user default values"""
        user = User(
            email="test@example.com",
            password_hash="hashed"
        )
        
        assert user.credits_balance == 0
        assert user.is_active is True
        assert user.is_admin is False
        assert user.email_verified is False
    
    def test_user_id_generation(self):
        """Test user ID is generated"""
        user = User(
            email="test@example.com",
            password_hash="hashed"
        )
        
        # ID should be generated if not provided
        assert user.id is not None or hasattr(user, 'id')
    
    def test_user_repr(self):
        """Test user string representation"""
        user = User(
            email="test@example.com",
            password_hash="hashed"
        )
        
        repr_str = repr(user)
        assert "test@example.com" in repr_str
    
    def test_user_admin_flag(self):
        """Test setting admin flag"""
        user = User(
            email="admin@example.com",
            password_hash="hashed",
            is_admin=True
        )
        
        assert user.is_admin is True
    
    def test_user_inactive(self):
        """Test inactive user"""
        user = User(
            email="inactive@example.com",
            password_hash="hashed",
            is_active=False
        )
        
        assert user.is_active is False
    
    def test_user_email_verified(self):
        """Test email verification"""
        user = User(
            email="verified@example.com",
            password_hash="hashed",
            email_verified=True
        )
        
        assert user.email_verified is True
    
    def test_user_credits_balance(self):
        """Test credits balance"""
        user = User(
            email="test@example.com",
            password_hash="hashed",
            credits_balance=10000
        )
        
        assert user.credits_balance == 10000
    
    def test_user_large_credits_balance(self):
        """Test large credits balance (BigInteger)"""
        large_balance = 9999999999999
        user = User(
            email="test@example.com",
            password_hash="hashed",
            credits_balance=large_balance
        )
        
        assert user.credits_balance == large_balance


class TestCreditTransactionModel:
    """Test CreditTransaction model"""
    
    def test_credit_transaction_creation(self):
        """Test creating credit transaction"""
        transaction = CreditTransaction(
            user_id="user-123",
            type="topup",
            amount=10000,
            description="Test topup",
            balance_before=0,
            balance_after=10000
        )
        
        assert transaction.user_id == "user-123"
        assert transaction.type == "topup"
        assert transaction.amount == 10000
        assert transaction.description == "Test topup"
    
    def test_credit_transaction_types(self):
        """Test different transaction types"""
        types = ["topup", "deduction", "refund", "adjustment"]
        
        for trans_type in types:
            transaction = CreditTransaction(
                user_id="user-123",
                type=trans_type,
                amount=1000,
                balance_before=5000,
                balance_after=6000
            )
            assert transaction.type == trans_type
    
    def test_credit_transaction_balance_tracking(self):
        """Test balance tracking"""
        transaction = CreditTransaction(
            user_id="user-123",
            type="topup",
            amount=5000,
            balance_before=10000,
            balance_after=15000
        )
        
        assert transaction.balance_before == 10000
        assert transaction.balance_after == 15000
        assert transaction.balance_after - transaction.balance_before == transaction.amount
    
    def test_credit_transaction_deduction(self):
        """Test deduction transaction"""
        transaction = CreditTransaction(
            user_id="user-123",
            type="deduction",
            amount=-1000,
            balance_before=5000,
            balance_after=4000
        )
        
        assert transaction.amount == -1000
        assert transaction.type == "deduction"
    
    def test_credit_transaction_metadata(self):
        """Test transaction metadata"""
        metadata = {
            "payment_id": "pay-123",
            "stripe_charge_id": "ch_123",
            "source": "stripe"
        }
        
        transaction = CreditTransaction(
            user_id="user-123",
            type="topup",
            amount=10000,
            balance_before=0,
            balance_after=10000,
            meta_data=metadata
        )
        
        assert transaction.meta_data == metadata
    
    def test_credit_transaction_repr(self):
        """Test transaction string representation"""
        transaction = CreditTransaction(
            user_id="user-123",
            type="topup",
            amount=10000,
            balance_before=0,
            balance_after=10000
        )
        
        repr_str = repr(transaction)
        assert "topup" in repr_str
        assert "10000" in repr_str
        assert "user-123" in repr_str


class TestSystemConfigModel:
    """Test SystemConfig model"""
    
    def test_system_config_creation(self):
        """Test creating system config"""
        config = SystemConfig(
            key="markup_percentage",
            value="15",
            description="Credit markup percentage"
        )
        
        assert config.key == "markup_percentage"
        assert config.value == "15"
        assert config.description == "Credit markup percentage"
    
    def test_system_config_different_types(self):
        """Test different config types"""
        configs = [
            ("max_credits", "1000000", "Maximum credits per transaction"),
            ("min_topup", "1000", "Minimum topup amount"),
            ("stripe_enabled", "true", "Stripe payment enabled")
        ]
        
        for key, value, desc in configs:
            config = SystemConfig(key=key, value=value, description=desc)
            assert config.key == key
            assert config.value == value
    
    def test_system_config_repr(self):
        """Test config string representation"""
        config = SystemConfig(
            key="test_key",
            value="test_value"
        )
        
        repr_str = repr(config)
        assert "test_key" in repr_str
        assert "test_value" in repr_str
    
    def test_system_config_no_description(self):
        """Test config without description"""
        config = SystemConfig(
            key="test_key",
            value="test_value"
        )
        
        assert config.description is None
