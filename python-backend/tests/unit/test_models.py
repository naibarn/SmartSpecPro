"""
Unit tests for User and Credit Models
"""

from app.models.user import Plan, Role, User
from app.models.credit import CreditTransaction, SystemConfig, TransactionType


class TestUserModel:
    """Test User model"""
    
    def test_user_creation(self):
        """Test creating a user"""
        user = User(
            email="test@example.com",
            password="hashed_password",
            name="Test User",
        )

        assert user.email == "test@example.com"
        assert user.password == "hashed_password"
        assert user.full_name == "Test User"
    
    def test_user_default_values(self):
        """Test user default values"""
        columns = User.__table__.columns

        assert columns["credits"].default.arg == 0
        assert columns["isDisabled"].default.arg is False
        assert columns["role"].default.arg is Role.user
        assert columns["plan"].default.arg is Plan.free
    
    def test_user_id_generation(self):
        """Test user ID is generated"""
        id_column = User.__table__.columns["id"]
        assert id_column.primary_key is True
        assert id_column.autoincrement is True
    
    def test_user_repr(self):
        """Test user string representation"""
        user = User(
            email="test@example.com",
            password="hashed",
        )
        
        repr_str = repr(user)
        assert "test@example.com" in repr_str
    
    def test_user_admin_flag(self):
        """Test setting admin flag"""
        user = User(
            email="admin@example.com",
            password="hashed",
            role=Role.admin,
        )
        
        assert user.is_admin is True
    
    def test_user_inactive(self):
        """Test inactive user"""
        user = User(
            email="inactive@example.com",
            password="hashed",
            isDisabled=True,
        )
        
        assert user.is_active is False
    
    def test_email_verified_compatibility_property(self):
        """The current users schema has no mutable email verification field."""
        user = User(
            email="verified@example.com",
            password="hashed",
        )

        assert user.email_verified is True
    
    def test_user_credits_balance(self):
        """Test credits balance"""
        user = User(
            email="test@example.com",
            password="hashed",
            credits=10000,
        )
        
        assert user.credits_balance == 10000
    
    def test_user_large_credits_balance(self):
        """Test the largest balance supported by the current SQL INTEGER column."""
        large_balance = 2_147_483_647
        user = User(
            email="test@example.com",
            password="hashed",
            credits=large_balance,
        )
        
        assert user.credits_balance == large_balance


class TestCreditTransactionModel:
    """Test CreditTransaction model"""
    
    def test_credit_transaction_creation(self):
        """Test creating credit transaction"""
        transaction = CreditTransaction(
            user_id=123,
            type=TransactionType.purchase,
            amount=10000,
            description="Test topup",
            balance_after=10000
        )

        assert transaction.user_id == 123
        assert transaction.type == TransactionType.purchase
        assert transaction.amount == 10000
        assert transaction.description == "Test topup"
    
    def test_credit_transaction_types(self):
        """Test different transaction types"""
        types = [
            TransactionType.purchase,
            TransactionType.usage,
            TransactionType.refund,
            TransactionType.adjustment,
        ]
        
        for trans_type in types:
            transaction = CreditTransaction(
                user_id=123,
                type=trans_type,
                amount=1000,
                balance_after=6000
            )
            assert transaction.type == trans_type
    
    def test_credit_transaction_records_balance_after(self):
        """The current transaction schema stores the post-transaction balance."""
        transaction = CreditTransaction(
            user_id=123,
            type=TransactionType.purchase,
            amount=5000,
            balance_after=15000
        )

        assert transaction.balance_after == 15000
    
    def test_credit_transaction_deduction(self):
        """Test deduction transaction"""
        transaction = CreditTransaction(
            user_id=123,
            type=TransactionType.usage,
            amount=-1000,
            balance_after=4000,
        )

        assert transaction.amount == -1000
        assert transaction.type == TransactionType.usage
    
    def test_credit_transaction_metadata(self):
        """Test transaction metadata"""
        metadata = {
            "payment_id": "pay-123",
            "stripe_charge_id": "ch_123",
            "source": "stripe"
        }
        
        transaction = CreditTransaction(
            user_id=123,
            type=TransactionType.purchase,
            amount=10000,
            balance_after=10000,
            meta=metadata,
        )

        assert transaction.meta == metadata
    
    def test_credit_transaction_repr(self):
        """Test transaction string representation"""
        transaction = CreditTransaction(
            user_id=123,
            type=TransactionType.purchase,
            amount=10000,
            balance_after=10000
        )
        
        repr_str = repr(transaction)
        assert "purchase" in repr_str
        assert "10000" in repr_str
        assert "123" in repr_str


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
