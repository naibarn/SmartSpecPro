"""
Refund Service
Handles payment refunds with Stripe integration
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import stripe

from app.core.config import settings
from app.models.refund import Refund, RefundStatus, RefundType
from app.models.payment import PaymentTransaction
from app.models.user import User
from app.services.credit_service import CreditService

# Configure Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


class RefundService:
    """Service for handling refunds"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.credit_service = CreditService(db)
    
    async def create_refund(
        self,
        payment_id: str,
        user_id: str,
        refund_type: RefundType,
        amount_usd: Optional[float] = None,
        reason: Optional[str] = None,
        requested_by: Optional[str] = None
    ) -> Refund:
        """
        Create a refund request
        
        Args:
            payment_id: Payment transaction ID
            user_id: User ID
            refund_type: Full or partial refund
            amount_usd: Refund amount (required for partial refunds)
            reason: Refund reason
            requested_by: User or admin ID who requested the refund
        
        Returns:
            Refund object
        
        Raises:
            ValueError: If payment not found or invalid refund amount
        """
        # Get payment transaction
        result = await self.db.execute(
            select(PaymentTransaction).where(PaymentTransaction.id == payment_id)
        )
        payment = result.scalar_one_or_none()
        
        if not payment:
            raise ValueError("Payment not found")
        
        if payment.user_id != user_id:
            raise ValueError("Payment does not belong to user")
        
        if payment.status != "completed":
            raise ValueError("Can only refund completed payments")
        
        # Calculate refund amount
        if refund_type == RefundType.FULL:
            refund_amount = payment.amount_usd
            credits_to_deduct = payment.credits_added
        else:
            if not amount_usd or amount_usd <= 0:
                raise ValueError("Partial refund requires valid amount")
            
            if amount_usd > payment.amount_usd:
                raise ValueError("Refund amount cannot exceed payment amount")
            
            refund_amount = amount_usd
            # Calculate proportional credits
            credits_to_deduct = int((amount_usd / payment.amount_usd) * payment.credits_added)
        
        # Check if user has enough credits (with row locking to prevent race conditions)
        from sqlalchemy.orm import with_for_update
        
        result = await self.db.execute(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise ValueError("User not found")
        
        if user.credits_balance < credits_to_deduct:
            raise ValueError(f"Insufficient credits for refund (need {credits_to_deduct}, have {user.credits_balance})")
        
        # Note: The row is now locked until transaction commits or rolls back
        
        # Create refund record
        refund = Refund(
            id=str(uuid.uuid4()),
            payment_id=payment_id,
            user_id=user_id,
            refund_type=refund_type,
            amount_usd=refund_amount,
            credits_deducted=credits_to_deduct,
            reason=reason,
            status=RefundStatus.PENDING,
            requested_by=requested_by or user_id,
            requested_at=datetime.utcnow()
        )
        
        self.db.add(refund)
        await self.db.commit()
        await self.db.refresh(refund)
        
        return refund
    
    async def process_refund(self, refund_id: str) -> Refund:
        """
        Process a refund (Stripe + credit deduction)
        
        Args:
            refund_id: Refund ID
        
        Returns:
            Updated refund object
        
        Raises:
            ValueError: If refund not found or cannot be processed
        """
        # Get refund
        result = await self.db.execute(
            select(Refund).where(Refund.id == refund_id)
        )
        refund = result.scalar_one_or_none()
        
        if not refund:
            raise ValueError("Refund not found")
        
        if refund.status != RefundStatus.PENDING:
            raise ValueError(f"Refund is not pending (status: {refund.status})")
        
        # Update status to processing
        refund.status = RefundStatus.PROCESSING
        refund.processed_at = datetime.utcnow()
        await self.db.commit()
        
        try:
            # Get payment transaction
            result = await self.db.execute(
                select(PaymentTransaction).where(PaymentTransaction.id == refund.payment_id)
            )
            payment = result.scalar_one_or_none()
            
            if not payment or not payment.stripe_payment_intent_id:
                raise ValueError("Payment or Stripe payment intent not found")
            
            # Create Stripe refund
            stripe_refund = stripe.Refund.create(
                payment_intent=payment.stripe_payment_intent_id,
                amount=int(refund.amount_usd * 100),  # Convert to cents
                reason="requested_by_customer" if refund.requested_by == refund.user_id else "requested_by_admin",
                metadata={
                    "refund_id": refund_id,
                    "payment_id": refund.payment_id,
                    "user_id": refund.user_id
                }
            )
            
            # Update refund with Stripe ID
            refund.stripe_refund_id = stripe_refund.id
            
            # Deduct credits from user
            await self.credit_service.deduct_credits(
                user_id=refund.user_id,
                amount=refund.credits_deducted,
                description=f"Refund for payment {refund.payment_id}",
                metadata={
                    "refund_id": refund_id,
                    "payment_id": refund.payment_id,
                    "stripe_refund_id": stripe_refund.id,
                    "reason": refund.reason
                }
            )
            
            # Update refund status
            refund.status = RefundStatus.COMPLETED
            refund.completed_at = datetime.utcnow()
            
            await self.db.commit()
            await self.db.refresh(refund)
            
            return refund
        
        except stripe.error.StripeError as e:
            # Stripe error - mark as failed
            refund.status = RefundStatus.FAILED
            refund.reason = f"{refund.reason or ''}\nStripe error: {str(e)}"
            await self.db.commit()
            raise ValueError(f"Stripe refund failed: {str(e)}")
        
        except Exception as e:
            # Other error - mark as failed
            refund.status = RefundStatus.FAILED
            refund.reason = f"{refund.reason or ''}\nError: {str(e)}"
            await self.db.commit()
            raise
    
    async def cancel_refund(self, refund_id: str, reason: Optional[str] = None) -> Refund:
        """
        Cancel a pending refund
        
        Args:
            refund_id: Refund ID
            reason: Cancellation reason
        
        Returns:
            Updated refund object
        
        Raises:
            ValueError: If refund not found or cannot be cancelled
        """
        # Get refund
        result = await self.db.execute(
            select(Refund).where(Refund.id == refund_id)
        )
        refund = result.scalar_one_or_none()
        
        if not refund:
            raise ValueError("Refund not found")
        
        if refund.status != RefundStatus.PENDING:
            raise ValueError(f"Can only cancel pending refunds (status: {refund.status})")
        
        # Update status
        refund.status = RefundStatus.CANCELLED
        if reason:
            refund.reason = f"{refund.reason or ''}\nCancelled: {reason}"
        
        await self.db.commit()
        await self.db.refresh(refund)
        
        return refund
    
    async def get_refund(self, refund_id: str) -> Optional[Refund]:
        """Get refund by ID"""
        result = await self.db.execute(
            select(Refund).where(Refund.id == refund_id)
        )
        return result.scalar_one_or_none()
    
    async def get_user_refunds(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> list[Refund]:
        """Get user's refunds"""
        result = await self.db.execute(
            select(Refund)
            .where(Refund.user_id == user_id)
            .order_by(Refund.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
    
    async def get_payment_refunds(self, payment_id: str) -> list[Refund]:
        """Get refunds for a payment"""
        result = await self.db.execute(
            select(Refund)
            .where(Refund.payment_id == payment_id)
            .order_by(Refund.created_at.desc())
        )
        return list(result.scalars().all())
