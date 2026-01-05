"""
SmartSpec Pro - Payment Router
API endpoints for Stripe payment integration.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.stripe_config import get_stripe_config
from app.models.user import User
from app.services.payment.stripe_service import StripeService, get_stripe_service

router = APIRouter(prefix="/payment", tags=["Payment"])


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================

class SubscriptionCheckoutRequest(BaseModel):
    """Request to create subscription checkout."""
    plan: str = Field(..., description="Plan name (pro, enterprise)")
    interval: str = Field(default="monthly", description="Billing interval (monthly, yearly)")
    success_url: Optional[str] = Field(default=None, description="Success redirect URL")
    cancel_url: Optional[str] = Field(default=None, description="Cancel redirect URL")


class CreditsCheckoutRequest(BaseModel):
    """Request to create credits checkout."""
    credits_amount: int = Field(..., ge=10, le=10000, description="Number of credits to purchase")
    success_url: Optional[str] = Field(default=None, description="Success redirect URL")
    cancel_url: Optional[str] = Field(default=None, description="Cancel redirect URL")


class CheckoutResponse(BaseModel):
    """Checkout session response."""
    session_id: str
    url: str


class CancelSubscriptionRequest(BaseModel):
    """Request to cancel subscription."""
    subscription_id: str
    at_period_end: bool = Field(default=True, description="Cancel at end of billing period")


class ChangePlanRequest(BaseModel):
    """Request to change subscription plan."""
    subscription_id: str
    new_plan: str
    new_interval: str = "monthly"
    prorate: bool = True


class BillingPortalRequest(BaseModel):
    """Request to create billing portal session."""
    return_url: str


class BillingPortalResponse(BaseModel):
    """Billing portal session response."""
    url: str


class PaymentMethodResponse(BaseModel):
    """Payment method response."""
    id: str
    brand: str
    last4: str
    exp_month: int
    exp_year: int
    is_default: bool


class InvoiceResponse(BaseModel):
    """Invoice response."""
    id: str
    number: Optional[str]
    amount_due: int
    amount_paid: int
    currency: str
    status: str
    created: int
    invoice_pdf: Optional[str]


class SubscriptionResponse(BaseModel):
    """Subscription response."""
    id: str
    status: str
    plan: str
    interval: str
    current_period_start: int
    current_period_end: int
    cancel_at_period_end: bool


class ConfigResponse(BaseModel):
    """Stripe config response (public key only)."""
    publishable_key: str


# =============================================================================
# CONFIG ENDPOINTS
# =============================================================================

@router.get("/config", response_model=ConfigResponse)
async def get_payment_config():
    """Get Stripe publishable key for client-side initialization."""
    config = get_stripe_config()
    
    if not config.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment system not configured",
        )
    
    return ConfigResponse(publishable_key=config.publishable_key)


# =============================================================================
# CHECKOUT ENDPOINTS
# =============================================================================

@router.post("/checkout/subscription", response_model=CheckoutResponse)
async def create_subscription_checkout(
    data: SubscriptionCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Stripe Checkout session for subscription.
    
    Returns a URL to redirect the user to Stripe's hosted checkout page.
    """
    service = get_stripe_service(db)
    
    try:
        result = await service.create_subscription_checkout(
            user_id=str(current_user.id),
            email=current_user.email,
            plan=data.plan,
            interval=data.interval,
            success_url=data.success_url,
            cancel_url=data.cancel_url,
        )
        
        return CheckoutResponse(**result)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment error: {str(e)}")


@router.post("/checkout/credits", response_model=CheckoutResponse)
async def create_credits_checkout(
    data: CreditsCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Stripe Checkout session for one-time credits purchase.
    
    Returns a URL to redirect the user to Stripe's hosted checkout page.
    """
    service = get_stripe_service(db)
    
    try:
        result = await service.create_credits_checkout(
            user_id=str(current_user.id),
            email=current_user.email,
            credits_amount=data.credits_amount,
            success_url=data.success_url,
            cancel_url=data.cancel_url,
        )
        
        return CheckoutResponse(**result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment error: {str(e)}")


# =============================================================================
# SUBSCRIPTION ENDPOINTS
# =============================================================================

@router.get("/subscription", response_model=Optional[SubscriptionResponse])
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's subscription details."""
    service = get_stripe_service(db)
    
    try:
        # Get customer
        customer = await service.get_or_create_customer(
            user_id=str(current_user.id),
            email=current_user.email,
        )
        
        # Get subscriptions
        import stripe
        subscriptions = stripe.Subscription.list(
            customer=customer.id,
            status="active",
            limit=1,
        )
        
        if not subscriptions.data:
            return None
        
        sub = subscriptions.data[0]
        plan = sub.metadata.get("plan", "unknown")
        
        return SubscriptionResponse(
            id=sub.id,
            status=sub.status,
            plan=plan,
            interval=sub.items.data[0].price.recurring.interval,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching subscription: {str(e)}")


@router.post("/subscription/cancel")
async def cancel_subscription(
    data: CancelSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a subscription."""
    service = get_stripe_service(db)
    
    try:
        result = await service.cancel_subscription(
            subscription_id=data.subscription_id,
            at_period_end=data.at_period_end,
        )
        
        return {
            "success": True,
            "subscription_id": result.id,
            "cancel_at_period_end": result.cancel_at_period_end,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cancelling subscription: {str(e)}")


@router.post("/subscription/reactivate")
async def reactivate_subscription(
    subscription_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a subscription that was set to cancel."""
    service = get_stripe_service(db)
    
    try:
        result = await service.reactivate_subscription(subscription_id)
        
        return {
            "success": True,
            "subscription_id": result.id,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reactivating subscription: {str(e)}")


@router.post("/subscription/change-plan")
async def change_subscription_plan(
    data: ChangePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change subscription to a different plan."""
    service = get_stripe_service(db)
    
    try:
        result = await service.change_subscription_plan(
            subscription_id=data.subscription_id,
            new_plan=data.new_plan,
            new_interval=data.new_interval,
            prorate=data.prorate,
        )
        
        return {
            "success": True,
            "subscription_id": result.id,
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error changing plan: {str(e)}")


# =============================================================================
# BILLING PORTAL
# =============================================================================

@router.post("/billing-portal", response_model=BillingPortalResponse)
async def create_billing_portal(
    data: BillingPortalRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Stripe Billing Portal session.
    
    Allows users to manage their subscription and payment methods.
    """
    service = get_stripe_service(db)
    
    try:
        # Get customer
        customer = await service.get_or_create_customer(
            user_id=str(current_user.id),
            email=current_user.email,
        )
        
        result = await service.create_billing_portal_session(
            customer_id=customer.id,
            return_url=data.return_url,
        )
        
        return BillingPortalResponse(**result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating portal: {str(e)}")


# =============================================================================
# PAYMENT METHODS
# =============================================================================

@router.get("/payment-methods")
async def get_payment_methods(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's saved payment methods."""
    service = get_stripe_service(db)
    
    try:
        # Get customer
        customer = await service.get_or_create_customer(
            user_id=str(current_user.id),
            email=current_user.email,
        )
        
        methods = await service.get_payment_methods(customer.id)
        default_method = customer.invoice_settings.default_payment_method
        
        return {
            "payment_methods": [
                PaymentMethodResponse(
                    id=m.id,
                    brand=m.card.brand,
                    last4=m.card.last4,
                    exp_month=m.card.exp_month,
                    exp_year=m.card.exp_year,
                    is_default=m.id == default_method,
                )
                for m in methods
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching payment methods: {str(e)}")


@router.delete("/payment-methods/{payment_method_id}")
async def delete_payment_method(
    payment_method_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a payment method."""
    service = get_stripe_service(db)
    
    try:
        await service.delete_payment_method(payment_method_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting payment method: {str(e)}")


# =============================================================================
# INVOICES
# =============================================================================

@router.get("/invoices")
async def get_invoices(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's invoice history."""
    service = get_stripe_service(db)
    
    try:
        # Get customer
        customer = await service.get_or_create_customer(
            user_id=str(current_user.id),
            email=current_user.email,
        )
        
        invoices = await service.get_invoices(customer.id, limit)
        
        return {
            "invoices": [
                InvoiceResponse(
                    id=inv.id,
                    number=inv.number,
                    amount_due=inv.amount_due,
                    amount_paid=inv.amount_paid,
                    currency=inv.currency,
                    status=inv.status,
                    created=inv.created,
                    invoice_pdf=inv.invoice_pdf,
                )
                for inv in invoices
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching invoices: {str(e)}")


@router.get("/invoices/upcoming")
async def get_upcoming_invoice(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's upcoming invoice."""
    service = get_stripe_service(db)
    
    try:
        # Get customer
        customer = await service.get_or_create_customer(
            user_id=str(current_user.id),
            email=current_user.email,
        )
        
        invoice = await service.get_upcoming_invoice(customer.id)
        
        if not invoice:
            return {"upcoming_invoice": None}
        
        return {
            "upcoming_invoice": {
                "amount_due": invoice.amount_due,
                "currency": invoice.currency,
                "next_payment_attempt": invoice.next_payment_attempt,
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching upcoming invoice: {str(e)}")
