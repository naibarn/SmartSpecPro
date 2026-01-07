"""
Unit tests for Payment Service
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from decimal import Decimal
from datetime import datetime
from fastapi import HTTPException
from app.services.payment_service import PaymentService
from app.models.user import User
from app.models.payment import PaymentTransaction

class TestPaymentService:
    """Test PaymentService class"""

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()
    
    @pytest.fixture
    def mock_credit_service(self):
        return AsyncMock()

    @pytest.fixture
    def payment_service(self, mock_db, mock_credit_service):
        with patch("app.services.payment_service.CreditService", return_value=mock_credit_service):
            service = PaymentService(mock_db)
            service.credit_service = mock_credit_service # Explicitly set mocked instance
            return service

    @pytest.fixture
    def mock_user(self):
        return User(id="user_123", email="test@example.com")

    def test_validate_amount(self, payment_service):
        """Test amount validation"""
        # Valid amount
        assert payment_service.validate_amount(Decimal("10.00")) is True
        
        # Too low
        with pytest.raises(HTTPException):
            payment_service.validate_amount(Decimal("0.50"))
            
        # Too high
        with pytest.raises(HTTPException):
            payment_service.validate_amount(Decimal("10000.00"))

    def test_calculate_credits(self, payment_service):
        """Test credit calculation"""
        # Mock global usd_to_credits function
        with patch("app.services.payment_service.usd_to_credits", return_value=1000):
            credits = payment_service.calculate_credits(Decimal("10.00"))
            assert credits == 1000

    @pytest.mark.asyncio
    async def test_create_checkout_session(self, payment_service, mock_user, mock_db):
        """Test creating checkout session"""
        
        # Mock Stripe
        with patch("stripe.checkout.Session.create") as mock_stripe_create, \
             patch.object(payment_service, "validate_amount", return_value=True), \
             patch.object(payment_service, "calculate_credits", return_value=1000):
            
            mock_session = Mock()
            mock_session.id = "sess_123"
            mock_session.url = "http://stripe.com/checkout"
            mock_stripe_create.return_value = mock_session
            
            result = await payment_service.create_checkout_session(
                user=mock_user,
                amount_usd=Decimal("10.00"),
                success_url="http://success",
                cancel_url="http://cancel"
            )
            
            # Verify Stripe call
            mock_stripe_create.assert_called_once()
            call_kwargs = mock_stripe_create.call_args[1]
            assert call_kwargs["client_reference_id"] == "user_123"
            assert call_kwargs["customer_email"] == "test@example.com"
            
            # Verify DB creation
            mock_db.add.assert_called_once()
            mock_db.commit.assert_called_once()
            
            assert result["session_id"] == "sess_123"
            assert result["credits_to_receive"] == 1000

    @pytest.mark.asyncio
    async def test_get_payment_status_success(self, payment_service, mock_user, mock_db):
        """Test getting payment status success"""
        
        # Mock DB transaction
        tx = PaymentTransaction(
            id="tx_123", 
            stripe_session_id="sess_123", 
            status="pending",
            amount_usd=Decimal("10.00"),
            credits_amount=1000
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = tx
        mock_db.execute.return_value = mock_result
        
        # Mock Stripe retrieval
        with patch("stripe.checkout.Session.retrieve") as mock_retrieve:
            mock_session = Mock()
            mock_session.payment_status = "paid"
            mock_session.payment_intent = "pi_123"
            mock_retrieve.return_value = mock_session
            
            result = await payment_service.get_payment_status("sess_123", mock_user)
            
            assert result["status"] == "completed"
            assert result["payment_intent_id"] == "pi_123"
            
            # Verify DB update
            assert tx.status == "completed"
            assert tx.stripe_payment_intent_id == "pi_123"
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_checkout_completed(self, payment_service, mock_db):
        """Test webhook: checkout completed"""
        
        # Match webhook logic inside handle_checkout_completed
        session_payload = {
            "id": "sess_123",
            "client_reference_id": "user_123",
            "payment_intent": "pi_123"
        }
        
        # Mock DB transaction found
        tx = PaymentTransaction(
            id="tx_123", 
            user_id="user_123",
            stripe_session_id="sess_123", 
            status="pending",
            amount_usd=Decimal("10.00"),
            credits_amount=1000
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = tx
        mock_db.execute.return_value = mock_result
        
        await payment_service.handle_checkout_completed(session_payload)
        
        # Verify transaction updated
        assert tx.status == "completed"
        assert tx.stripe_payment_intent_id == "pi_123"
        assert tx.credits_added_at is not None
        
        # Verify credits added via credit service
        payment_service.credit_service.add_credits.assert_called_once()
        call_kwargs = payment_service.credit_service.add_credits.call_args[1]
        assert call_kwargs["user_id"] == "user_123"
        assert call_kwargs["credits"] == 1000
        
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_checkout_completed_idempotency(self, payment_service, mock_db):
        """Test webhook idempotency (already processed)"""
        session_payload = {
            "id": "sess_123",
            "client_reference_id": "user_123",
            "payment_intent": "pi_123"
        }
        
        # Mock DB transaction already completed
        tx = PaymentTransaction(
            status="completed",
            stripe_payment_intent_id="pi_123"
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = tx
        mock_db.execute.return_value = mock_result
        
        await payment_service.handle_checkout_completed(session_payload)
        
        # Verify NO credits added
        payment_service.credit_service.add_credits.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_payment_failed(self, payment_service, mock_db):
        """Test webhook: payment failed"""
        payment_intent_payload = {
            "id": "pi_123",
            "last_payment_error": {"message": "Card declined"}
        }
        
        # Mock DB transaction
        tx = PaymentTransaction(
            status="pending",
            stripe_payment_intent_id="pi_123"
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = tx
        mock_db.execute.return_value = mock_result
        
        await payment_service.handle_payment_failed(payment_intent_payload)
        
        assert tx.status == "failed"
        assert tx.metadata["failure_reason"] == "Card declined"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_payment_history(self, payment_service, mock_user, mock_db):
        """Test getting payment history"""
        
        # Mock payments list
        txs = [
            PaymentTransaction(to_dict=lambda: {"id": "1"}),
            PaymentTransaction(to_dict=lambda: {"id": "2"})
        ]
        mock_result = MagicMock()
        mock_result.scalars().all.return_value = txs
        
        # Mock count result
        mock_count = MagicMock()
        mock_count.scalar.return_value = 2
        
        mock_db.execute.side_effect = [mock_result, mock_count]
        
        result = await payment_service.get_payment_history(mock_user)
        
        assert len(result["payments"]) == 2
        assert result["total"] == 2

    def test_verify_webhook_signature_success(self):
        """Test valid webhook signature"""
        with patch("stripe.Webhook.construct_event") as mock_construct:
            mock_construct.return_value = {"type": "test"}
            
            event = PaymentService.verify_webhook_signature(b"payload", "sig")
            
            assert event == {"type": "test"}

    def test_verify_webhook_signature_invalid(self):
        """Test invalid webhook signature"""
        with patch("stripe.Webhook.construct_event", side_effect=ValueError):
            with pytest.raises(HTTPException) as exc:
                PaymentService.verify_webhook_signature(b"payload", "sig")
            assert exc.value.status_code == 400
