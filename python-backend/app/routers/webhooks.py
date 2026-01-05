"""
SmartSpec Pro - Webhook Handlers
Handles incoming webhooks from external services (Stripe, etc.).
"""

import json
from typing import Any, Dict

import stripe
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.stripe_config import get_stripe_config
from app.services.payment.stripe_service import StripeService

logger = structlog.get_logger()

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# =============================================================================
# STRIPE WEBHOOK
# =============================================================================

@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Stripe webhook events.
    
    Stripe sends events for:
    - checkout.session.completed - Payment successful
    - customer.subscription.created - New subscription
    - customer.subscription.updated - Subscription changed
    - customer.subscription.deleted - Subscription cancelled
    - invoice.paid - Invoice paid (subscription renewal)
    - invoice.payment_failed - Payment failed
    - payment_intent.succeeded - One-time payment successful
    """
    config = get_stripe_config()
    
    # Get raw body
    payload = await request.body()
    
    # Verify webhook signature
    try:
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            config.webhook_secret,
        )
    except ValueError as e:
        logger.error("Invalid webhook payload", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error("Invalid webhook signature", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Log event
    logger.info(
        "Received Stripe webhook",
        event_type=event.type,
        event_id=event.id,
    )
    
    # Handle event
    service = StripeService(db)
    
    try:
        if event.type == "checkout.session.completed":
            await handle_checkout_completed(event.data.object, service)
        
        elif event.type == "customer.subscription.created":
            await handle_subscription_created(event.data.object, service)
        
        elif event.type == "customer.subscription.updated":
            await handle_subscription_updated(event.data.object, service)
        
        elif event.type == "customer.subscription.deleted":
            await handle_subscription_deleted(event.data.object, service)
        
        elif event.type == "invoice.paid":
            await handle_invoice_paid(event.data.object, service)
        
        elif event.type == "invoice.payment_failed":
            await handle_invoice_payment_failed(event.data.object, service)
        
        elif event.type == "payment_intent.succeeded":
            await handle_payment_intent_succeeded(event.data.object, service)
        
        elif event.type == "customer.created":
            logger.info("Customer created", customer_id=event.data.object.id)
        
        else:
            logger.info("Unhandled event type", event_type=event.type)
        
        return {"status": "success", "event_id": event.id}
        
    except Exception as e:
        logger.error(
            "Webhook handler error",
            event_type=event.type,
            error=str(e),
        )
        # Return 200 to prevent Stripe from retrying
        # Log error for manual investigation
        return {"status": "error", "message": str(e)}


# =============================================================================
# EVENT HANDLERS
# =============================================================================

async def handle_checkout_completed(session: Dict[str, Any], service: StripeService):
    """
    Handle checkout.session.completed event.
    
    This is fired when a customer completes checkout (subscription or one-time).
    """
    logger.info(
        "Checkout completed",
        session_id=session.id,
        mode=session.mode,
    )
    
    metadata = session.get("metadata", {})
    user_id = metadata.get("user_id")
    
    if not user_id:
        logger.warning("No user_id in checkout metadata", session_id=session.id)
        return
    
    # Handle based on checkout mode
    if session.mode == "subscription":
        # Subscription checkout - credits will be added via invoice.paid
        plan = metadata.get("plan")
        logger.info(
            "Subscription checkout completed",
            user_id=user_id,
            plan=plan,
        )
    
    elif session.mode == "payment":
        # One-time payment - add credits
        if metadata.get("type") == "credits_purchase":
            credits_amount = int(metadata.get("credits_amount", 0))
            payment_intent = session.get("payment_intent")
            
            if credits_amount > 0:
                await service.fulfill_credits_purchase(
                    user_id=user_id,
                    credits_amount=credits_amount,
                    payment_intent_id=payment_intent,
                )


async def handle_subscription_created(subscription: Dict[str, Any], service: StripeService):
    """
    Handle customer.subscription.created event.
    
    This is fired when a new subscription is created.
    """
    logger.info(
        "Subscription created",
        subscription_id=subscription.id,
        status=subscription.status,
    )
    
    metadata = subscription.get("metadata", {})
    user_id = metadata.get("user_id")
    plan = metadata.get("plan")
    
    if user_id and plan:
        # Credits are added via invoice.paid event
        logger.info(
            "New subscription for user",
            user_id=user_id,
            plan=plan,
        )


async def handle_subscription_updated(subscription: Dict[str, Any], service: StripeService):
    """
    Handle customer.subscription.updated event.
    
    This is fired when a subscription is updated (plan change, status change, etc.).
    """
    logger.info(
        "Subscription updated",
        subscription_id=subscription.id,
        status=subscription.status,
    )
    
    metadata = subscription.get("metadata", {})
    user_id = metadata.get("user_id")
    
    if not user_id:
        return
    
    # Check if subscription is now active (e.g., after trial)
    if subscription.status == "active":
        plan = metadata.get("plan")
        if plan:
            logger.info(
                "Subscription activated",
                user_id=user_id,
                plan=plan,
            )
    
    # Check if subscription is past due
    elif subscription.status == "past_due":
        logger.warning(
            "Subscription past due",
            user_id=user_id,
            subscription_id=subscription.id,
        )
        # TODO: Send notification to user


async def handle_subscription_deleted(subscription: Dict[str, Any], service: StripeService):
    """
    Handle customer.subscription.deleted event.
    
    This is fired when a subscription is cancelled/deleted.
    """
    logger.info(
        "Subscription deleted",
        subscription_id=subscription.id,
    )
    
    metadata = subscription.get("metadata", {})
    user_id = metadata.get("user_id")
    
    if user_id:
        # Update user's subscription tier to free
        # Credits remain until used
        logger.info(
            "Subscription cancelled for user",
            user_id=user_id,
        )
        # TODO: Update user subscription tier


async def handle_invoice_paid(invoice: Dict[str, Any], service: StripeService):
    """
    Handle invoice.paid event.
    
    This is fired when an invoice is paid (subscription renewal).
    """
    logger.info(
        "Invoice paid",
        invoice_id=invoice.id,
        subscription=invoice.get("subscription"),
    )
    
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return
    
    # Get subscription details
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        metadata = subscription.get("metadata", {})
        user_id = metadata.get("user_id")
        plan = metadata.get("plan")
        
        if user_id and plan:
            await service.fulfill_subscription(
                user_id=user_id,
                plan=plan,
                subscription_id=subscription_id,
            )
            
    except Exception as e:
        logger.error(
            "Error processing invoice.paid",
            invoice_id=invoice.id,
            error=str(e),
        )


async def handle_invoice_payment_failed(invoice: Dict[str, Any], service: StripeService):
    """
    Handle invoice.payment_failed event.
    
    This is fired when a payment attempt fails.
    """
    logger.warning(
        "Invoice payment failed",
        invoice_id=invoice.id,
        customer=invoice.get("customer"),
    )
    
    # Get customer email for notification
    customer_id = invoice.get("customer")
    if customer_id:
        try:
            customer = stripe.Customer.retrieve(customer_id)
            user_id = customer.metadata.get("user_id")
            
            if user_id:
                logger.warning(
                    "Payment failed for user",
                    user_id=user_id,
                    invoice_id=invoice.id,
                )
                # TODO: Send payment failed notification
                
        except Exception as e:
            logger.error("Error getting customer", error=str(e))


async def handle_payment_intent_succeeded(payment_intent: Dict[str, Any], service: StripeService):
    """
    Handle payment_intent.succeeded event.
    
    This is fired when a one-time payment succeeds.
    Note: For checkout sessions, checkout.session.completed is preferred.
    """
    logger.info(
        "Payment intent succeeded",
        payment_intent_id=payment_intent.id,
    )
    
    # Most one-time payments are handled via checkout.session.completed
    # This handler is for direct payment intents if needed


# =============================================================================
# HEALTH CHECK ENDPOINT
# =============================================================================

@router.get("/health")
async def webhook_health():
    """Health check for webhook endpoint."""
    return {
        "status": "healthy",
        "stripe_configured": get_stripe_config().is_configured,
    }
