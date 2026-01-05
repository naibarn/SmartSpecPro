"""
Payment Service - Stripe Integration
Handles payment processing, checkout sessions, and webhooks
"""

from decimal import Decimal
from typing import Dict, Any, Optional, List
from datetime import datetime
import uuid
import stripe
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.credits import usd_to_credits, DEFAULT_MARKUP_PERCENT
from app.models.payment import PaymentTransaction
from app.models.user import User
from app.services.credit_service import CreditService, InsufficientCreditsError
from app.services.refund_service import RefundService

logger = structlog.get_logger()

# Initialize Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


class PaymentService:
    """
    Payment Service for Stripe integration
    
    Features:
    - Create checkout sessions
    - Process webhook events
    - Track payment transactions
    - Add credits after successful payment
    """
    
    # Predefined top-up amounts
    TOP_UP_AMOUNTS = {
        "small": {
            "amount_usd": Decimal("10.00"),
            "credits": 8695,
            "label": "Small Top-up"
        },
        "medium": {
            "amount_usd": Decimal("50.00"),
            "credits": 43478,
            "label": "Medium Top-up"
        },
        "large": {
            "amount_usd": Decimal("100.00"),
            "credits": 86956,
            "label": "Large Top-up"
        },
        "xlarge": {
            "amount_usd": Decimal("500.00"),
            "credits": 434782,
            "label": "Extra Large Top-up"
        }
    }
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.credit_service = CreditService(db)
    
    def validate_amount(self, amount_usd: Decimal) -> bool:
        """
        Validate payment amount
        
        Args:
            amount_usd: Payment amount in USD
        
        Returns:
            True if valid
        
        Raises:
            HTTPException: If invalid amount
        """
        min_amount = Decimal(str(settings.PAYMENT_MIN_AMOUNT))
        max_amount = Decimal(str(settings.PAYMENT_MAX_AMOUNT))
        
        if amount_usd < min_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment amount must be at least ${min_amount}"
            )
        
        if amount_usd > max_amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment amount must not exceed ${max_amount}"
            )
        
        return True
    
    def calculate_credits(self, amount_usd: Decimal) -> int:
        """
        Calculate credits from payment amount
        
        Args:
            amount_usd: Payment amount in USD
        
        Returns:
            Credits amount
        """
        return usd_to_credits(amount_usd)
    
    @retry(
        retry=retry_if_exception_type(stripe.error.APIConnectionError),
        wait=wait_exponential(multiplier=1, min=2, max=60),
        stop=stop_after_attempt(5)
    )
    async def create_checkout_session(
        self,
        user: User,
        amount_usd: Decimal,
        success_url: str,
        cancel_url: str
    ) -> Dict[str, Any]:
        """
        Create Stripe Checkout Session
        
        Args:
            user: User object
            amount_usd: Payment amount in USD
            success_url: URL to redirect after successful payment
            cancel_url: URL to redirect after cancelled payment
        
        Returns:
            Checkout session info
        
        Raises:
            HTTPException: If creation fails
        """
        # Validate amount
        self.validate_amount(amount_usd)
        
        # Calculate credits
        credits = self.calculate_credits(amount_usd)
        
        logger.info(
            "creating_checkout_session",
            user_id=user.id,
            amount_usd=float(amount_usd),
            credits=credits
        )
        
        try:
            # Create Stripe Checkout Session
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': settings.STRIPE_CURRENCY.lower(),
                        'product_data': {
                            'name': f'SmartSpec Pro Credits - {credits:,} credits',
                            'description': f'Top-up ${amount_usd} → {credits:,} credits',
                        },
                        'unit_amount': int(amount_usd * 100),  # Amount in cents
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=success_url,
                cancel_url=cancel_url,
                customer_email=user.email,
                client_reference_id=str(user.id),
                # R3.2: Idempotency for webhook processing
                invoice_creation={"enabled": True, "invoice_data": {"metadata": {"idempotency_key": str(uuid.uuid4())}}},
                metadata={
                    'user_id': str(user.id),
                    'credits_amount': str(credits),
                    'amount_usd': str(amount_usd)
                }
            )
            
            # Create payment transaction record
            payment_tx = PaymentTransaction(
                user_id=user.id,
                stripe_session_id=session.id,
                amount_usd=amount_usd,
                currency=settings.STRIPE_CURRENCY,
                status='pending',
                credits_amount=credits,
                metadata={
                    'session_url': session.url,
                    'success_url': success_url,
                    'cancel_url': cancel_url
                }
            )
            
            self.db.add(payment_tx)
            await self.db.commit()
            await self.db.refresh(payment_tx)
            
            logger.info(
                "checkout_session_created",
                user_id=user.id,
                session_id=session.id,
                payment_tx_id=payment_tx.id,
                amount_usd=float(amount_usd),
                credits=credits
            )
            
            return {
                "session_id": session.id,
                "url": session.url,
                "credits_to_receive": credits,
                "amount_usd": float(amount_usd),
                "payment_transaction_id": payment_tx.id
            }
        
        except stripe.error.StripeError as e:
            logger.error(
                "stripe_error",
                user_id=user.id,
                error=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Payment service error: {str(e)}"
            )
    
    @retry(
        retry=retry_if_exception_type(stripe.error.APIConnectionError),
        wait=wait_exponential(multiplier=1, min=2, max=60),
        stop=stop_after_attempt(3)
    )
    async def get_payment_status(
        self,
        session_id: str,
        user: User
    ) -> Dict[str, Any]:
        """
        Get payment status by session ID
        
        Args:
            session_id: Stripe session ID
            user: User object
        
        Returns:
            Payment status info
        
        Raises:
            HTTPException: If not found or unauthorized
        """
        # Get payment transaction
        stmt = select(PaymentTransaction).where(
            and_(
                PaymentTransaction.stripe_session_id == session_id,
                PaymentTransaction.user_id == user.id
            )
        )
        result = await self.db.execute(stmt)
        payment_tx = result.scalar_one_or_none()
        
        if not payment_tx:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment transaction not found"
            )
        
        # Get Stripe session
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            
            # Update payment transaction if needed
            if session.payment_status == 'paid' and payment_tx.status == 'pending':
                payment_tx.status = 'completed'
                payment_tx.stripe_payment_intent_id = session.payment_intent
                payment_tx.completed_at = datetime.utcnow()
                await self.db.commit()
            
            return {
                "session_id": session_id,
                "status": payment_tx.status,
                "amount_usd": float(payment_tx.amount_usd),
                "credits_amount": payment_tx.credits_amount,
                "credits_added": payment_tx.credits_amount if payment_tx.status == 'completed' else 0,
                "payment_intent_id": payment_tx.stripe_payment_intent_id,
                "created_at": payment_tx.created_at.isoformat() if payment_tx.created_at else None,
                "completed_at": payment_tx.completed_at.isoformat() if payment_tx.completed_at else None
            }
        
        except stripe.error.StripeError as e:
            logger.error(
                "stripe_error_get_status",
                session_id=session_id,
                error=str(e)
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Payment service error: {str(e)}"
            )
    
    async def handle_checkout_completed(self, session: Dict[str, Any]):
        """
        Handle checkout.session.completed webhook event
        
        Args:
            session: Stripe session object
        """
        session_id = session['id']
        user_id = session['client_reference_id']
        payment_intent_id = session.get('payment_intent')
        
        logger.info(
            "handling_checkout_completed",
            session_id=session_id,
            user_id=user_id,
            payment_intent_id=payment_intent_id
        )
        
        # Get payment transaction
        stmt = select(PaymentTransaction).where(
            PaymentTransaction.stripe_session_id == session_id
        )
        result = await self.db.execute(stmt)
        payment_tx = result.scalar_one_or_none()
        
        if not payment_tx:
            logger.error(
                "payment_transaction_not_found",
                session_id=session_id
            )
            return
        
        # R3.2: Idempotency check. If we've already processed this, log and exit.
        if payment_tx.status == 'completed' and payment_tx.stripe_payment_intent_id == payment_intent_id:
            logger.warning(
                "webhook_already_processed",
                session_id=session_id,
                payment_tx_id=payment_tx.id
            )
            return

        # R3.1: More robust check to prevent double-crediting
        if payment_tx.credits_added_at is not None:
            logger.error(
                "credits_already_added_for_tx",
                session_id=session_id,
                payment_tx_id=payment_tx.id,
                credits_added_at=payment_tx.credits_added_at
            )
            # Potentially alert for manual review
            return
            logger.info(
                "payment_already_processed",
                session_id=session_id,
                payment_tx_id=payment_tx.id
            )
            return
        
        # Update payment transaction
        payment_tx.status = 'completed'
        payment_tx.stripe_payment_intent_id = payment_intent_id
        payment_tx.completed_at = datetime.utcnow()
        payment_tx.credits_added_at = datetime.utcnow()
        
        # Add credits to user
        try:
            await self.credit_service.add_credits(
                user_id=payment_tx.user_id,
                credits=payment_tx.credits_amount,
                description=f"Payment via Stripe - ${payment_tx.amount_usd}",
                metadata={
                    "stripe_session_id": session_id,
                    "stripe_payment_intent_id": payment_intent_id,
                    "payment_transaction_id": payment_tx.id,
                    "amount_usd": float(payment_tx.amount_usd)
                }
            )
            
            await self.db.commit()
            
            logger.info(
                "payment_completed_credits_added",
                session_id=session_id,
                payment_tx_id=payment_tx.id,
                user_id=payment_tx.user_id,
                credits_added=payment_tx.credits_amount,
                amount_usd=float(payment_tx.amount_usd)
            )
        
        except Exception as e:
            logger.error(
                "failed_to_add_credits",
                session_id=session_id,
                payment_tx_id=payment_tx.id,
                error=str(e)
            )
            await self.db.rollback()
            raise
    
    async def handle_payment_failed(self, payment_intent: Dict[str, Any]):
        """
        Handle payment_intent.payment_failed webhook event
        
        Args:
            payment_intent: Stripe payment intent object
        """
        payment_intent_id = payment_intent['id']
        
        logger.info(
            "handling_payment_failed",
            payment_intent_id=payment_intent_id
        )
        
        # Get payment transaction
        stmt = select(PaymentTransaction).where(
            PaymentTransaction.stripe_payment_intent_id == payment_intent_id
        )
        result = await self.db.execute(stmt)
        payment_tx = result.scalar_one_or_none()
        
        if not payment_tx:
            logger.warning(
                "payment_transaction_not_found_for_failed",
                payment_intent_id=payment_intent_id
            )
            return
        
        # Update status
        payment_tx.status = 'failed'
        payment_tx.metadata = payment_tx.metadata or {}
        payment_tx.metadata['failure_reason'] = payment_intent.get('last_payment_error', {}).get('message')
        
        await self.db.commit()
        
        logger.info(
            "payment_marked_as_failed",
            payment_intent_id=payment_intent_id,
            payment_tx_id=payment_tx.id
        )
    
    async def get_payment_history(
        self,
        user: User,
        limit: int = 10,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get user payment history
        
        Args:
            user: User object
            limit: Number of records to return
            offset: Offset for pagination
        
        Returns:
            Payment history
        """
        # Get payments
        stmt = select(PaymentTransaction).where(
            PaymentTransaction.user_id == user.id
        ).order_by(
            PaymentTransaction.created_at.desc()
        ).limit(limit).offset(offset)
        
        result = await self.db.execute(stmt)
        payments = result.scalars().all()
        
        # Get total count
        count_stmt = select(func.count(PaymentTransaction.id)).where(
            PaymentTransaction.user_id == user.id
        )
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar()
        
        return {
            "payments": [payment.to_dict() for payment in payments],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    
    @staticmethod
    def verify_webhook_signature(payload: bytes, sig_header: str) -> stripe.Event:
        """
        Verify Stripe webhook signature
        
        Args:
            payload: Request body
            sig_header: Stripe-Signature header
        
        Returns:
            Stripe Event object
        
        Raises:
            HTTPException: If verification fails
        """
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
            return event
        except ValueError:
            logger.error("webhook_invalid_payload")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payload"
            )
        except stripe.error.SignatureVerificationError:
            logger.error("webhook_invalid_signature")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid signature"
            )
