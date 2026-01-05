"""
SmartSpec Pro - Stripe Payment Service
Handles Stripe payment operations including subscriptions and one-time payments.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

import stripe
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.stripe_config import get_stripe_config
from app.models.credits import TransactionType
from app.services.generation.credits_repository import CreditsRepository

logger = structlog.get_logger()


class StripeService:
    """
    Stripe payment service.
    
    Handles:
    - Customer management
    - Subscription management
    - One-time credit purchases
    - Payment method management
    - Invoice handling
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.config = get_stripe_config()
        self.credits_repo = CreditsRepository(session)
        
        # Initialize Stripe
        if self.config.is_configured:
            stripe.api_key = self.config.secret_key
    
    # =========================================================================
    # CUSTOMER MANAGEMENT
    # =========================================================================
    
    async def get_or_create_customer(
        self,
        user_id: str,
        email: str,
        name: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Get or create a Stripe customer for a user.
        
        Args:
            user_id: Internal user ID
            email: User's email
            name: User's name
            metadata: Additional metadata
            
        Returns:
            Stripe customer object
        """
        try:
            # Search for existing customer
            customers = stripe.Customer.search(
                query=f"metadata['user_id']:'{user_id}'"
            )
            
            if customers.data:
                customer = customers.data[0]
                logger.info("Found existing Stripe customer", customer_id=customer.id)
                return customer
            
            # Create new customer
            customer = stripe.Customer.create(
                email=email,
                name=name,
                metadata={
                    "user_id": user_id,
                    **(metadata or {}),
                },
            )
            
            logger.info("Created Stripe customer", customer_id=customer.id, user_id=user_id)
            return customer
            
        except stripe.error.StripeError as e:
            logger.error("Stripe customer error", error=str(e))
            raise
    
    async def update_customer(
        self,
        customer_id: str,
        email: Optional[str] = None,
        name: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Update a Stripe customer."""
        try:
            update_data = {}
            if email:
                update_data["email"] = email
            if name:
                update_data["name"] = name
            if metadata:
                update_data["metadata"] = metadata
            
            customer = stripe.Customer.modify(customer_id, **update_data)
            return customer
            
        except stripe.error.StripeError as e:
            logger.error("Stripe customer update error", error=str(e))
            raise
    
    # =========================================================================
    # SUBSCRIPTION MANAGEMENT
    # =========================================================================
    
    async def create_subscription_checkout(
        self,
        user_id: str,
        email: str,
        plan: str,
        interval: str = "monthly",
        success_url: str = "",
        cancel_url: str = "",
    ) -> Dict[str, Any]:
        """
        Create a Stripe Checkout session for subscription.
        
        Args:
            user_id: Internal user ID
            email: User's email
            plan: Plan name (pro, enterprise)
            interval: Billing interval (monthly, yearly)
            success_url: URL to redirect on success
            cancel_url: URL to redirect on cancel
            
        Returns:
            Checkout session with URL
        """
        try:
            # Get or create customer
            customer = await self.get_or_create_customer(user_id, email)
            
            # Get price ID
            price_id = self.config.get_price_id(plan, interval)
            if not price_id:
                raise ValueError(f"Invalid plan or interval: {plan}/{interval}")
            
            # Create checkout session
            session = stripe.checkout.Session.create(
                customer=customer.id,
                mode="subscription",
                line_items=[{
                    "price": price_id,
                    "quantity": 1,
                }],
                success_url=success_url or f"{self.config.success_url}?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=cancel_url or self.config.cancel_url,
                metadata={
                    "user_id": user_id,
                    "plan": plan,
                    "interval": interval,
                },
                subscription_data={
                    "metadata": {
                        "user_id": user_id,
                        "plan": plan,
                    },
                },
                allow_promotion_codes=True,
            )
            
            logger.info(
                "Created subscription checkout",
                session_id=session.id,
                user_id=user_id,
                plan=plan,
            )
            
            return {
                "session_id": session.id,
                "url": session.url,
            }
            
        except stripe.error.StripeError as e:
            logger.error("Stripe checkout error", error=str(e))
            raise
    
    async def create_credits_checkout(
        self,
        user_id: str,
        email: str,
        credits_amount: int,
        price_per_credit: float = 0.10,
        success_url: str = "",
        cancel_url: str = "",
    ) -> Dict[str, Any]:
        """
        Create a Stripe Checkout session for one-time credit purchase.
        
        Args:
            user_id: Internal user ID
            email: User's email
            credits_amount: Number of credits to purchase
            price_per_credit: Price per credit in USD
            success_url: URL to redirect on success
            cancel_url: URL to redirect on cancel
            
        Returns:
            Checkout session with URL
        """
        try:
            # Get or create customer
            customer = await self.get_or_create_customer(user_id, email)
            
            # Calculate total price in cents
            total_cents = int(credits_amount * price_per_credit * 100)
            
            # Create checkout session
            session = stripe.checkout.Session.create(
                customer=customer.id,
                mode="payment",
                line_items=[{
                    "price_data": {
                        "currency": self.config.currency,
                        "product_data": {
                            "name": f"{credits_amount} Credits",
                            "description": f"SmartSpec Pro credits for AI generation",
                        },
                        "unit_amount": total_cents,
                    },
                    "quantity": 1,
                }],
                success_url=success_url or f"{self.config.success_url}?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=cancel_url or self.config.cancel_url,
                metadata={
                    "user_id": user_id,
                    "credits_amount": str(credits_amount),
                    "type": "credits_purchase",
                },
            )
            
            logger.info(
                "Created credits checkout",
                session_id=session.id,
                user_id=user_id,
                credits=credits_amount,
            )
            
            return {
                "session_id": session.id,
                "url": session.url,
            }
            
        except stripe.error.StripeError as e:
            logger.error("Stripe checkout error", error=str(e))
            raise
    
    async def get_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Get subscription details."""
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            return subscription
        except stripe.error.StripeError as e:
            logger.error("Stripe subscription error", error=str(e))
            raise
    
    async def cancel_subscription(
        self,
        subscription_id: str,
        at_period_end: bool = True,
    ) -> Dict[str, Any]:
        """
        Cancel a subscription.
        
        Args:
            subscription_id: Stripe subscription ID
            at_period_end: If True, cancel at end of billing period
            
        Returns:
            Updated subscription
        """
        try:
            if at_period_end:
                subscription = stripe.Subscription.modify(
                    subscription_id,
                    cancel_at_period_end=True,
                )
            else:
                subscription = stripe.Subscription.delete(subscription_id)
            
            logger.info(
                "Cancelled subscription",
                subscription_id=subscription_id,
                at_period_end=at_period_end,
            )
            
            return subscription
            
        except stripe.error.StripeError as e:
            logger.error("Stripe cancel error", error=str(e))
            raise
    
    async def reactivate_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Reactivate a subscription that was set to cancel."""
        try:
            subscription = stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=False,
            )
            
            logger.info("Reactivated subscription", subscription_id=subscription_id)
            return subscription
            
        except stripe.error.StripeError as e:
            logger.error("Stripe reactivate error", error=str(e))
            raise
    
    async def change_subscription_plan(
        self,
        subscription_id: str,
        new_plan: str,
        new_interval: str,
        prorate: bool = True,
    ) -> Dict[str, Any]:
        """
        Change subscription to a different plan.
        
        Args:
            subscription_id: Current subscription ID
            new_plan: New plan name
            new_interval: New billing interval
            prorate: Whether to prorate the change
            
        Returns:
            Updated subscription
        """
        try:
            # Get current subscription
            subscription = stripe.Subscription.retrieve(subscription_id)
            
            # Get new price ID
            new_price_id = self.config.get_price_id(new_plan, new_interval)
            if not new_price_id:
                raise ValueError(f"Invalid plan or interval: {new_plan}/{new_interval}")
            
            # Update subscription
            updated = stripe.Subscription.modify(
                subscription_id,
                items=[{
                    "id": subscription["items"]["data"][0]["id"],
                    "price": new_price_id,
                }],
                proration_behavior="create_prorations" if prorate else "none",
                metadata={
                    "plan": new_plan,
                },
            )
            
            logger.info(
                "Changed subscription plan",
                subscription_id=subscription_id,
                new_plan=new_plan,
            )
            
            return updated
            
        except stripe.error.StripeError as e:
            logger.error("Stripe plan change error", error=str(e))
            raise
    
    # =========================================================================
    # PAYMENT METHODS
    # =========================================================================
    
    async def get_payment_methods(self, customer_id: str) -> List[Dict[str, Any]]:
        """Get customer's payment methods."""
        try:
            methods = stripe.PaymentMethod.list(
                customer=customer_id,
                type="card",
            )
            return methods.data
        except stripe.error.StripeError as e:
            logger.error("Stripe payment methods error", error=str(e))
            raise
    
    async def set_default_payment_method(
        self,
        customer_id: str,
        payment_method_id: str,
    ) -> Dict[str, Any]:
        """Set default payment method for customer."""
        try:
            customer = stripe.Customer.modify(
                customer_id,
                invoice_settings={
                    "default_payment_method": payment_method_id,
                },
            )
            return customer
        except stripe.error.StripeError as e:
            logger.error("Stripe default payment error", error=str(e))
            raise
    
    async def delete_payment_method(self, payment_method_id: str) -> Dict[str, Any]:
        """Delete a payment method."""
        try:
            method = stripe.PaymentMethod.detach(payment_method_id)
            return method
        except stripe.error.StripeError as e:
            logger.error("Stripe delete payment error", error=str(e))
            raise
    
    # =========================================================================
    # BILLING PORTAL
    # =========================================================================
    
    async def create_billing_portal_session(
        self,
        customer_id: str,
        return_url: str,
    ) -> Dict[str, Any]:
        """
        Create a Stripe Billing Portal session.
        
        Allows customers to manage their subscription and payment methods.
        """
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
            
            return {
                "url": session.url,
            }
            
        except stripe.error.StripeError as e:
            logger.error("Stripe portal error", error=str(e))
            raise
    
    # =========================================================================
    # INVOICES
    # =========================================================================
    
    async def get_invoices(
        self,
        customer_id: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Get customer's invoices."""
        try:
            invoices = stripe.Invoice.list(
                customer=customer_id,
                limit=limit,
            )
            return invoices.data
        except stripe.error.StripeError as e:
            logger.error("Stripe invoices error", error=str(e))
            raise
    
    async def get_upcoming_invoice(self, customer_id: str) -> Optional[Dict[str, Any]]:
        """Get customer's upcoming invoice."""
        try:
            invoice = stripe.Invoice.upcoming(customer=customer_id)
            return invoice
        except stripe.error.InvalidRequestError:
            # No upcoming invoice
            return None
        except stripe.error.StripeError as e:
            logger.error("Stripe upcoming invoice error", error=str(e))
            raise
    
    # =========================================================================
    # CREDITS FULFILLMENT
    # =========================================================================
    
    async def fulfill_credits_purchase(
        self,
        user_id: str,
        credits_amount: int,
        payment_intent_id: str,
    ):
        """
        Fulfill a credits purchase after successful payment.
        
        Called by webhook handler after payment confirmation.
        """
        try:
            # Add credits to user balance
            await self.credits_repo.add_credits(
                user_id=UUID(user_id),
                amount=float(credits_amount),
                transaction_type=TransactionType.PURCHASE,
                reference_type="stripe_payment",
                reference_id=payment_intent_id,
                description=f"Purchased {credits_amount} credits",
            )
            
            await self.session.commit()
            
            logger.info(
                "Fulfilled credits purchase",
                user_id=user_id,
                credits=credits_amount,
                payment_intent=payment_intent_id,
            )
            
        except Exception as e:
            logger.error("Credits fulfillment error", error=str(e))
            raise
    
    async def fulfill_subscription(
        self,
        user_id: str,
        plan: str,
        subscription_id: str,
    ):
        """
        Fulfill a subscription after successful payment.
        
        Called by webhook handler after subscription creation/renewal.
        """
        try:
            # Get plan credits
            plan_credits = {
                "pro": 500,
                "enterprise": 5000,
            }
            
            credits = plan_credits.get(plan, 0)
            
            if credits > 0:
                # Add monthly credits
                await self.credits_repo.add_credits(
                    user_id=UUID(user_id),
                    amount=float(credits),
                    transaction_type=TransactionType.SUBSCRIPTION,
                    reference_type="stripe_subscription",
                    reference_id=subscription_id,
                    description=f"{plan.title()} plan monthly credits",
                )
                
                # Update subscription tier
                balance = await self.credits_repo.get_or_create_balance(UUID(user_id))
                balance.subscription_tier = plan
                balance.monthly_allowance = float(credits)
                
                await self.session.commit()
            
            logger.info(
                "Fulfilled subscription",
                user_id=user_id,
                plan=plan,
                credits=credits,
            )
            
        except Exception as e:
            logger.error("Subscription fulfillment error", error=str(e))
            raise


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_stripe_service(session: AsyncSession) -> StripeService:
    """Get Stripe service instance."""
    return StripeService(session)
