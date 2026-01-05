"""
Unit Tests for PaymentService
Tests payment processing, validation, and Stripe integration
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
from datetime import datetime
import uuid

from fastapi import HTTPException

from app.services.payment_service import PaymentService
from app.models.payment import PaymentTransaction
from app.models.user import User


class TestPaymentServiceInit:
    """Test PaymentService initialization"""
    
    def test_init(self, test_db):
        """Test service initialization"""
        service = PaymentService(test_db)
        
        assert service.db == test_db
        assert service.credit_service is not None
    
    def test_top_up_amounts_defined(self, test_db):
        """Test that top-up amounts are defined"""
        service = PaymentService(test_db)
        
        assert "small" in service.TOP_UP_AMOUNTS
        assert "medium" in service.TOP_UP_AMOUNTS
        assert "large" in service.TOP_UP_AMOUNTS
        assert "xlarge" in service.TOP_UP_AMOUNTS
    
    def test_top_up_amounts_structure(self, test_db):
        """Test top-up amounts have correct structure"""
        service = PaymentService(test_db)
        
        for key, value in service.TOP_UP_AMOUNTS.items():
            assert "amount_usd" in value
            assert "credits" in value
            assert "label" in value
            assert isinstance(value["amount_usd"], Decimal)
            assert isinstance(value["credits"], int)
            assert isinstance(value["label"], str)


class TestPaymentServiceValidation:
    """Test payment validation methods"""
    
    def test_validate_amount_valid(self, test_db):
        """Test validating valid amount"""
        service = PaymentService(test_db)
        
        # Should not raise
        result = service.validate_amount(Decimal("10.00"))
        assert result is True
    
    def test_validate_amount_minimum(self, test_db):
        """Test validating minimum amount"""
        service = PaymentService(test_db)
        
        # Minimum is typically $5 or $10
        with pytest.raises(HTTPException) as exc_info:
            service.validate_amount(Decimal("0.50"))
        
        assert exc_info.value.status_code == 400
        assert "at least" in exc_info.value.detail.lower()
    
    def test_validate_amount_maximum(self, test_db):
        """Test validating maximum amount"""
        service = PaymentService(test_db)
        
        # Maximum is typically $10000
        with pytest.raises(HTTPException) as exc_info:
            service.validate_amount(Decimal("100000.00"))
        
        assert exc_info.value.status_code == 400
        assert "exceed" in exc_info.value.detail.lower()
    
    def test_validate_amount_edge_case_zero(self, test_db):
        """Test validating zero amount"""
        service = PaymentService(test_db)
        
        with pytest.raises(HTTPException):
            service.validate_amount(Decimal("0.00"))
    
    def test_validate_amount_negative(self, test_db):
        """Test validating negative amount"""
        service = PaymentService(test_db)
        
        with pytest.raises(HTTPException):
            service.validate_amount(Decimal("-10.00"))


class TestPaymentServiceCalculateCredits:
    """Test credit calculation methods"""
    
    def test_calculate_credits_small(self, test_db):
        """Test calculating credits for small amount"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("10.00"))
        
        assert credits > 0
        assert isinstance(credits, int)
    
    def test_calculate_credits_medium(self, test_db):
        """Test calculating credits for medium amount"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("50.00"))
        
        assert credits > 0
        assert isinstance(credits, int)
    
    def test_calculate_credits_large(self, test_db):
        """Test calculating credits for large amount"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("100.00"))
        
        assert credits > 0
        assert isinstance(credits, int)
    
    def test_calculate_credits_proportional(self, test_db):
        """Test that credits scale proportionally"""
        service = PaymentService(test_db)
        
        credits_10 = service.calculate_credits(Decimal("10.00"))
        credits_50 = service.calculate_credits(Decimal("50.00"))
        
        # 5x the amount should give approximately 5x the credits
        ratio = credits_50 / credits_10
        assert 4.5 <= ratio <= 5.5  # Allow some variance for rounding


class TestPaymentServiceTopUpAmounts:
    """Test predefined top-up amounts"""
    
    def test_small_top_up(self, test_db):
        """Test small top-up configuration"""
        service = PaymentService(test_db)
        
        small = service.TOP_UP_AMOUNTS["small"]
        assert small["amount_usd"] == Decimal("10.00")
        assert small["credits"] > 0
    
    def test_medium_top_up(self, test_db):
        """Test medium top-up configuration"""
        service = PaymentService(test_db)
        
        medium = service.TOP_UP_AMOUNTS["medium"]
        assert medium["amount_usd"] == Decimal("50.00")
        assert medium["credits"] > 0
    
    def test_large_top_up(self, test_db):
        """Test large top-up configuration"""
        service = PaymentService(test_db)
        
        large = service.TOP_UP_AMOUNTS["large"]
        assert large["amount_usd"] == Decimal("100.00")
        assert large["credits"] > 0
    
    def test_xlarge_top_up(self, test_db):
        """Test extra large top-up configuration"""
        service = PaymentService(test_db)
        
        xlarge = service.TOP_UP_AMOUNTS["xlarge"]
        assert xlarge["amount_usd"] == Decimal("500.00")
        assert xlarge["credits"] > 0
    
    def test_top_up_credits_increase_with_amount(self, test_db):
        """Test that larger top-ups give more credits"""
        service = PaymentService(test_db)
        
        small_credits = service.TOP_UP_AMOUNTS["small"]["credits"]
        medium_credits = service.TOP_UP_AMOUNTS["medium"]["credits"]
        large_credits = service.TOP_UP_AMOUNTS["large"]["credits"]
        xlarge_credits = service.TOP_UP_AMOUNTS["xlarge"]["credits"]
        
        assert small_credits < medium_credits < large_credits < xlarge_credits


class TestPaymentServiceCheckoutSession:
    """Test checkout session creation"""
    
    @pytest.mark.asyncio
    async def test_create_checkout_session_invalid_amount(self, test_db, test_user):
        """Test creating checkout session with invalid amount"""
        service = PaymentService(test_db)
        
        with pytest.raises(HTTPException) as exc_info:
            await service.create_checkout_session(
                user=test_user,
                amount_usd=Decimal("0.50"),
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel"
            )
        
        assert exc_info.value.status_code == 400
    
    @pytest.mark.asyncio
    @patch('stripe.checkout.Session.create')
    async def test_create_checkout_session_success(self, mock_stripe, test_db, test_user):
        """Test successful checkout session creation"""
        # Mock Stripe response
        mock_session = MagicMock()
        mock_session.id = "cs_test_123"
        mock_session.url = "https://checkout.stripe.com/test"
        mock_stripe.return_value = mock_session
        
        service = PaymentService(test_db)
        
        result = await service.create_checkout_session(
            user=test_user,
            amount_usd=Decimal("10.00"),
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel"
        )
        
        assert "session_id" in result
        assert "url" in result
        assert "credits_to_receive" in result
        assert result["credits_to_receive"] > 0
    
    @pytest.mark.asyncio
    @patch('stripe.checkout.Session.create')
    async def test_create_checkout_session_stripe_error(self, mock_stripe, test_db, test_user):
        """Test checkout session creation with Stripe error"""
        import stripe
        mock_stripe.side_effect = stripe.error.StripeError("Test error")
        
        service = PaymentService(test_db)
        
        with pytest.raises(HTTPException) as exc_info:
            await service.create_checkout_session(
                user=test_user,
                amount_usd=Decimal("10.00"),
                success_url="https://example.com/success",
                cancel_url="https://example.com/cancel"
            )
        
        assert exc_info.value.status_code == 500


class TestPaymentServiceGetPaymentStatus:
    """Test payment status retrieval"""
    
    @pytest.mark.asyncio
    async def test_get_payment_status_not_found(self, test_db, test_user):
        """Test getting status for non-existent payment"""
        service = PaymentService(test_db)
        
        with pytest.raises(HTTPException) as exc_info:
            await service.get_payment_status(
                session_id="non_existent_session",
                user=test_user
            )
        
        assert exc_info.value.status_code == 404
    
    @pytest.mark.asyncio
    @patch('stripe.checkout.Session.retrieve')
    async def test_get_payment_status_success(self, mock_stripe, test_db, test_user):
        """Test successful payment status retrieval"""
        # Create a mock payment transaction
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.stripe_session_id = "cs_test_123"
        mock_payment_tx.user_id = test_user.id
        mock_payment_tx.status = "pending"
        mock_payment_tx.amount_usd = Decimal("10.00")
        mock_payment_tx.credits_amount = 8695
        mock_payment_tx.stripe_payment_intent_id = None
        mock_payment_tx.created_at = datetime.utcnow()
        mock_payment_tx.completed_at = None
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        
        # Mock Stripe session
        mock_session = MagicMock()
        mock_session.payment_status = "unpaid"
        mock_session.payment_intent = None
        mock_stripe.return_value = mock_session
        
        result = await service.get_payment_status(
            session_id="cs_test_123",
            user=test_user
        )
        
        assert result["session_id"] == "cs_test_123"
        assert result["status"] == "pending"
        assert result["amount_usd"] == 10.0
    
    @pytest.mark.asyncio
    @patch('stripe.checkout.Session.retrieve')
    async def test_get_payment_status_completed(self, mock_stripe, test_db, test_user):
        """Test payment status when payment is completed"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.stripe_session_id = "cs_test_123"
        mock_payment_tx.user_id = test_user.id
        mock_payment_tx.status = "pending"
        mock_payment_tx.amount_usd = Decimal("10.00")
        mock_payment_tx.credits_amount = 8695
        mock_payment_tx.stripe_payment_intent_id = None
        mock_payment_tx.created_at = datetime.utcnow()
        mock_payment_tx.completed_at = None
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        
        # Mock Stripe session - payment completed
        mock_session = MagicMock()
        mock_session.payment_status = "paid"
        mock_session.payment_intent = "pi_test_123"
        mock_stripe.return_value = mock_session
        
        result = await service.get_payment_status(
            session_id="cs_test_123",
            user=test_user
        )
        
        # Should update status to completed
        assert mock_payment_tx.status == "completed"
        assert mock_payment_tx.stripe_payment_intent_id == "pi_test_123"
    
    @pytest.mark.asyncio
    @patch('stripe.checkout.Session.retrieve')
    async def test_get_payment_status_stripe_error(self, mock_stripe, test_db, test_user):
        """Test payment status with Stripe error"""
        import stripe
        
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.stripe_session_id = "cs_test_123"
        mock_payment_tx.user_id = test_user.id
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Mock Stripe error
        mock_stripe.side_effect = stripe.error.StripeError("Test error")
        
        with pytest.raises(HTTPException) as exc_info:
            await service.get_payment_status(
                session_id="cs_test_123",
                user=test_user
            )
        
        assert exc_info.value.status_code == 500


class TestPaymentServiceWebhooks:
    """Test webhook handling"""
    
    @pytest.mark.asyncio
    async def test_handle_checkout_completed_missing_transaction(self, test_db):
        """Test handling checkout completed with missing transaction"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        session_data = {
            'id': 'cs_test_123',
            'client_reference_id': str(uuid.uuid4()),
            'payment_intent': 'pi_test_123'
        }
        
        # Should handle gracefully without raising
        await service.handle_checkout_completed(session_data)
    
    @pytest.mark.asyncio
    async def test_handle_checkout_completed_already_processed(self, test_db):
        """Test handling checkout completed for already processed payment"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock already completed payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.status = "completed"
        mock_payment_tx.stripe_payment_intent_id = "pi_test_123"
        mock_payment_tx.credits_added_at = datetime.utcnow()
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        session_data = {
            'id': 'cs_test_123',
            'client_reference_id': str(uuid.uuid4()),
            'payment_intent': 'pi_test_123'
        }
        
        # Should return early without processing again
        await service.handle_checkout_completed(session_data)
        
        # Verify no commit was called (idempotency)
        mock_db.commit.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_handle_checkout_completed_success(self, test_db):
        """Test successful checkout completed handling"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock pending payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.id = 1
        mock_payment_tx.user_id = uuid.uuid4()
        mock_payment_tx.status = "pending"
        mock_payment_tx.stripe_payment_intent_id = None
        mock_payment_tx.credits_added_at = None
        mock_payment_tx.credits_amount = 8695
        mock_payment_tx.amount_usd = Decimal("10.00")
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        
        # Mock credit service
        service.credit_service = MagicMock()
        service.credit_service.add_credits = AsyncMock()
        
        session_data = {
            'id': 'cs_test_123',
            'client_reference_id': str(mock_payment_tx.user_id),
            'payment_intent': 'pi_test_123'
        }
        
        await service.handle_checkout_completed(session_data)
        
        # Verify status was updated
        assert mock_payment_tx.status == "completed"
        assert mock_payment_tx.stripe_payment_intent_id == "pi_test_123"
        
        # Verify credits were added
        service.credit_service.add_credits.assert_called_once()
        mock_db.commit.assert_called()
    
    @pytest.mark.asyncio
    async def test_handle_checkout_completed_credit_error(self, test_db):
        """Test checkout completed with credit addition error"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock pending payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.id = 1
        mock_payment_tx.user_id = uuid.uuid4()
        mock_payment_tx.status = "pending"
        mock_payment_tx.stripe_payment_intent_id = None
        mock_payment_tx.credits_added_at = None
        mock_payment_tx.credits_amount = 8695
        mock_payment_tx.amount_usd = Decimal("10.00")
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()
        
        # Mock credit service to raise error
        service.credit_service = MagicMock()
        service.credit_service.add_credits = AsyncMock(side_effect=Exception("Credit error"))
        
        session_data = {
            'id': 'cs_test_123',
            'client_reference_id': str(mock_payment_tx.user_id),
            'payment_intent': 'pi_test_123'
        }
        
        with pytest.raises(Exception, match="Credit error"):
            await service.handle_checkout_completed(session_data)
        
        # Verify rollback was called
        mock_db.rollback.assert_called()
    
    @pytest.mark.asyncio
    async def test_handle_payment_failed_missing_transaction(self, test_db):
        """Test handling payment failed with missing transaction"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        payment_intent_data = {
            'id': 'pi_test_123',
            'last_payment_error': {'message': 'Card declined'}
        }
        
        # Should handle gracefully without raising
        await service.handle_payment_failed(payment_intent_data)
    
    @pytest.mark.asyncio
    async def test_handle_payment_failed_success(self, test_db):
        """Test successful payment failed handling"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock payment transaction
        mock_payment_tx = MagicMock()
        mock_payment_tx.id = 1
        mock_payment_tx.status = "pending"
        mock_payment_tx.stripe_payment_intent_id = "pi_test_123"
        mock_payment_tx.metadata = {}
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.commit = AsyncMock()
        
        payment_intent_data = {
            'id': 'pi_test_123',
            'last_payment_error': {'message': 'Card declined'}
        }
        
        await service.handle_payment_failed(payment_intent_data)
        
        # Verify status was updated
        assert mock_payment_tx.status == "failed"
        assert mock_payment_tx.metadata['failure_reason'] == 'Card declined'
        mock_db.commit.assert_called()


class TestPaymentServicePaymentHistory:
    """Test payment history methods"""
    
    @pytest.mark.asyncio
    async def test_get_payment_history_empty(self, test_db, test_user):
        """Test getting payment history for user with no payments"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock empty results
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 0
        
        mock_db.execute = AsyncMock(side_effect=[mock_result, mock_count_result])
        
        result = await service.get_payment_history(user=test_user)
        
        assert result["payments"] == []
        assert result["total"] == 0
        assert result["limit"] == 10
        assert result["offset"] == 0
    
    @pytest.mark.asyncio
    async def test_get_payment_history_with_payments(self, test_db, test_user):
        """Test getting payment history with existing payments"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock payment transactions
        mock_payment1 = MagicMock()
        mock_payment1.to_dict.return_value = {
            "id": 1,
            "amount_usd": 10.00,
            "status": "completed"
        }
        
        mock_payment2 = MagicMock()
        mock_payment2.to_dict.return_value = {
            "id": 2,
            "amount_usd": 50.00,
            "status": "pending"
        }
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_payment1, mock_payment2]
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 2
        
        mock_db.execute = AsyncMock(side_effect=[mock_result, mock_count_result])
        
        result = await service.get_payment_history(user=test_user)
        
        assert len(result["payments"]) == 2
        assert result["total"] == 2
    
    @pytest.mark.asyncio
    async def test_get_payment_history_pagination(self, test_db, test_user):
        """Test payment history pagination"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 25
        
        mock_db.execute = AsyncMock(side_effect=[mock_result, mock_count_result])
        
        result = await service.get_payment_history(
            user=test_user,
            limit=5,
            offset=10
        )
        
        assert result["limit"] == 5
        assert result["offset"] == 10
        assert result["total"] == 25


class TestPaymentServiceWebhookVerification:
    """Test webhook signature verification"""
    
    def test_verify_webhook_signature_success(self, test_db):
        """Test successful webhook signature verification"""
        import stripe
        
        with patch('stripe.Webhook.construct_event') as mock_construct:
            mock_event = MagicMock()
            mock_event.type = "checkout.session.completed"
            mock_construct.return_value = mock_event
            
            result = PaymentService.verify_webhook_signature(
                payload=b'test_payload',
                sig_header='test_signature'
            )
            
            assert result == mock_event
    
    def test_verify_webhook_signature_invalid_payload(self, test_db):
        """Test webhook verification with invalid payload"""
        with patch('stripe.Webhook.construct_event') as mock_construct:
            mock_construct.side_effect = ValueError("Invalid payload")
            
            with pytest.raises(HTTPException) as exc_info:
                PaymentService.verify_webhook_signature(
                    payload=b'invalid_payload',
                    sig_header='test_signature'
                )
            
            assert exc_info.value.status_code == 400
            assert "Invalid payload" in exc_info.value.detail
    
    def test_verify_webhook_signature_invalid_signature(self, test_db):
        """Test webhook verification with invalid signature"""
        import stripe
        
        with patch('stripe.Webhook.construct_event') as mock_construct:
            mock_construct.side_effect = stripe.error.SignatureVerificationError(
                "Invalid signature", "sig_header"
            )
            
            with pytest.raises(HTTPException) as exc_info:
                PaymentService.verify_webhook_signature(
                    payload=b'test_payload',
                    sig_header='invalid_signature'
                )
            
            assert exc_info.value.status_code == 400
            assert "Invalid signature" in exc_info.value.detail


class TestPaymentServiceEdgeCases:
    """Test edge cases and error handling"""
    
    def test_validate_amount_decimal_precision(self, test_db):
        """Test amount validation with high decimal precision"""
        service = PaymentService(test_db)
        
        # Should handle decimal precision
        result = service.validate_amount(Decimal("10.99"))
        assert result is True
    
    def test_calculate_credits_decimal(self, test_db):
        """Test credit calculation with decimal amount"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("10.50"))
        
        assert credits > 0
        assert isinstance(credits, int)
    
    def test_calculate_credits_string_decimal(self, test_db):
        """Test credit calculation with string-converted decimal"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("10.00"))
        
        assert credits > 0
    
    def test_calculate_credits_very_small_amount(self, test_db):
        """Test credit calculation with very small amount"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("1.00"))
        
        assert credits >= 0
        assert isinstance(credits, int)
    
    def test_calculate_credits_large_amount(self, test_db):
        """Test credit calculation with large amount"""
        service = PaymentService(test_db)
        
        credits = service.calculate_credits(Decimal("1000.00"))
        
        assert credits > 0
        assert isinstance(credits, int)


class TestPaymentServiceIdempotency:
    """Test idempotency handling"""
    
    @pytest.mark.asyncio
    async def test_double_webhook_processing_prevented(self, test_db):
        """Test that double webhook processing is prevented"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock already processed payment
        mock_payment_tx = MagicMock()
        mock_payment_tx.status = "completed"
        mock_payment_tx.stripe_payment_intent_id = "pi_test_123"
        mock_payment_tx.credits_added_at = datetime.utcnow()
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        session_data = {
            'id': 'cs_test_123',
            'client_reference_id': str(uuid.uuid4()),
            'payment_intent': 'pi_test_123'
        }
        
        # First call
        await service.handle_checkout_completed(session_data)
        
        # Second call with same data should not process again
        await service.handle_checkout_completed(session_data)
        
        # Verify commit was not called (idempotent)
        mock_db.commit.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_credits_not_added_twice(self, test_db):
        """Test that credits are not added twice for same payment"""
        mock_db = AsyncMock()
        service = PaymentService(mock_db)
        
        # Mock payment with credits already added
        mock_payment_tx = MagicMock()
        mock_payment_tx.status = "pending"  # Status might not be updated yet
        mock_payment_tx.stripe_payment_intent_id = None
        mock_payment_tx.credits_added_at = datetime.utcnow()  # But credits were added
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_payment_tx
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        service.credit_service = MagicMock()
        service.credit_service.add_credits = AsyncMock()
        
        session_data = {
            'id': 'cs_test_123',
            'client_reference_id': str(uuid.uuid4()),
            'payment_intent': 'pi_test_123'
        }
        
        await service.handle_checkout_completed(session_data)
        
        # Verify credits were not added again
        service.credit_service.add_credits.assert_not_called()
