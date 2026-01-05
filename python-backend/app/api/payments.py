"""
Payment API Endpoints
Handles Stripe payment integration
"""

from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.payment_service import PaymentService
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/payments", tags=["payments"])


# Request/Response Models

class CreateCheckoutRequest(BaseModel):
    """Request to create checkout session"""
    amount_usd: float = Field(..., gt=0, description="Payment amount in USD")
    success_url: str = Field(..., description="URL to redirect after successful payment")
    cancel_url: str = Field(..., description="URL to redirect after cancelled payment")


class CheckoutResponse(BaseModel):
    """Checkout session response"""
    session_id: str
    url: str
    credits_to_receive: int
    amount_usd: float
    payment_transaction_id: int


class PaymentStatusResponse(BaseModel):
    """Payment status response"""
    session_id: str
    status: str
    amount_usd: float
    credits_amount: int
    credits_added: int
    payment_intent_id: Optional[str]
    created_at: Optional[str]
    completed_at: Optional[str]


class PaymentHistoryResponse(BaseModel):
    """Payment history response"""
    payments: list
    total: int
    limit: int
    offset: int


class WebhookResponse(BaseModel):
    """Webhook response"""
    received: bool


# API Endpoints

@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    request: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create Stripe Checkout Session
    
    Creates a checkout session for credit top-up
    
    Args:
        request: Checkout request with amount and URLs
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Checkout session info with URL to redirect
    
    Example:
        ```
        POST /api/payments/checkout
        {
          "amount_usd": 100.00,
          "success_url": "https://app.smartspec.pro/dashboard?payment=success",
          "cancel_url": "https://app.smartspec.pro/dashboard?payment=cancel"
        }
        ```
    """
    payment_service = PaymentService(db)
    
    amount_usd = Decimal(str(request.amount_usd))
    
    result = await payment_service.create_checkout_session(
        user=current_user,
        amount_usd=amount_usd,
        success_url=request.success_url,
        cancel_url=request.cancel_url
    )
    
    return CheckoutResponse(**result)


@router.get("/status/{session_id}", response_model=PaymentStatusResponse)
async def get_payment_status(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Payment Status
    
    Check the status of a payment by session ID
    
    Args:
        session_id: Stripe session ID
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Payment status info
    
    Example:
        ```
        GET /api/payments/status/cs_test_...
        ```
    """
    payment_service = PaymentService(db)
    
    result = await payment_service.get_payment_status(
        session_id=session_id,
        user=current_user
    )
    
    return PaymentStatusResponse(**result)


@router.get("/history", response_model=PaymentHistoryResponse)
async def get_payment_history(
    limit: int = 10,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Payment History
    
    Get user's payment transaction history
    
    Args:
        limit: Number of records to return (default: 10)
        offset: Offset for pagination (default: 0)
        current_user: Current authenticated user
        db: Database session
    
    Returns:
        Payment history with pagination
    
    Example:
        ```
        GET /api/payments/history?limit=10&offset=0
        ```
    """
    payment_service = PaymentService(db)
    
    result = await payment_service.get_payment_history(
        user=current_user,
        limit=limit,
        offset=offset
    )
    
    return PaymentHistoryResponse(**result)


@router.post("/webhook", response_model=WebhookResponse)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Stripe Webhook Handler
    
    Handles webhook events from Stripe
    
    Args:
        request: FastAPI request object
        db: Database session
    
    Returns:
        Webhook received confirmation
    
    Events handled:
    - checkout.session.completed: Payment succeeded
    - payment_intent.payment_failed: Payment failed
    
    Note:
        This endpoint must be registered in Stripe Dashboard
        URL: https://api.smartspec.pro/api/payments/webhook
    """
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    if not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing stripe-signature header"
        )
    
    # Verify webhook signature
    event = PaymentService.verify_webhook_signature(payload, sig_header)
    
    logger.info(
        "webhook_received",
        event_type=event['type'],
        event_id=event['id']
    )
    
    payment_service = PaymentService(db)
    
    # Handle different event types
    event_type = event['type']
    
    try:
        if event_type == 'checkout.session.completed':
            session = event['data']['object']
            await payment_service.handle_checkout_completed(session)
        
        elif event_type == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            await payment_service.handle_payment_failed(payment_intent)
        
        else:
            logger.info(
                "webhook_event_not_handled",
                event_type=event_type
            )
    
    except Exception as e:
        logger.error(
            "webhook_handler_error",
            event_type=event_type,
            event_id=event['id'],
            error=str(e)
        )
        # Return 200 to acknowledge receipt even if processing failed
        # Stripe will retry failed webhooks
    
    return WebhookResponse(received=True)


@router.get("/amounts")
async def get_predefined_amounts():
    """
    Get Predefined Top-up Amounts
    
    Returns predefined top-up amounts with calculated credits
    
    Returns:
        Dictionary of predefined amounts
    
    Example:
        ```
        GET /api/payments/amounts
        ```
    """
    return {
        "amounts": PaymentService.TOP_UP_AMOUNTS,
        "currency": "USD",
        "min_amount": 5.00,
        "max_amount": 10000.00
    }


# ============================================================
# Refund Endpoints
# ============================================================

class RefundRequest(BaseModel):
    """Refund request"""
    payment_id: str
    refund_type: str = Field(..., pattern="^(full|partial)$")
    amount_usd: Optional[float] = Field(None, gt=0)
    reason: Optional[str] = Field(None, max_length=500)


class RefundResponse(BaseModel):
    """Refund response"""
    id: str
    payment_id: str
    user_id: str
    refund_type: str
    amount_usd: float
    credits_deducted: int
    status: str
    reason: Optional[str]
    stripe_refund_id: Optional[str]
    requested_at: str
    completed_at: Optional[str]


@router.post("/refund", response_model=RefundResponse)
async def request_refund(
    request: RefundRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Request a refund for a payment
    
    - Requires authentication
    - Can request full or partial refund
    - Credits will be deducted from account
    - Refund processed via Stripe
    
    Args:
        request: Refund request details
    
    Returns:
        Refund details
    """
    from app.services.refund_service import RefundService
    from app.models.refund import RefundType
    
    refund_service = RefundService(db)
    
    try:
        # Create refund
        refund = await refund_service.create_refund(
            payment_id=request.payment_id,
            user_id=str(current_user.id),
            refund_type=RefundType(request.refund_type),
            amount_usd=request.amount_usd,
            reason=request.reason,
            requested_by=str(current_user.id)
        )
        
        # Process refund immediately
        refund = await refund_service.process_refund(str(refund.id))
        
        return RefundResponse(
            id=str(refund.id),
            payment_id=refund.payment_id,
            user_id=refund.user_id,
            refund_type=refund.refund_type.value,
            amount_usd=refund.amount_usd,
            credits_deducted=refund.credits_deducted,
            status=refund.status.value,
            reason=refund.reason,
            stripe_refund_id=refund.stripe_refund_id,
            requested_at=refund.requested_at.isoformat(),
            completed_at=refund.completed_at.isoformat() if refund.completed_at else None
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/refunds", response_model=List[RefundResponse])
async def get_refunds(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get user's refund history
    
    - Requires authentication
    - Returns list of refunds
    - Supports pagination
    """
    from app.services.refund_service import RefundService
    
    refund_service = RefundService(db)
    refunds = await refund_service.get_user_refunds(
        user_id=str(current_user.id),
        limit=limit,
        offset=offset
    )
    
    return [
        RefundResponse(
            id=str(refund.id),
            payment_id=refund.payment_id,
            user_id=refund.user_id,
            refund_type=refund.refund_type.value,
            amount_usd=refund.amount_usd,
            credits_deducted=refund.credits_deducted,
            status=refund.status.value,
            reason=refund.reason,
            stripe_refund_id=refund.stripe_refund_id,
            requested_at=refund.requested_at.isoformat(),
            completed_at=refund.completed_at.isoformat() if refund.completed_at else None
        )
        for refund in refunds
    ]


@router.get("/refund/{refund_id}", response_model=RefundResponse)
async def get_refund(
    refund_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get refund details
    
    - Requires authentication
    - Returns refund details
    """
    from app.services.refund_service import RefundService
    
    refund_service = RefundService(db)
    refund = await refund_service.get_refund(refund_id)
    
    if not refund:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Refund not found"
        )
    
    if refund.user_id != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return RefundResponse(
        id=str(refund.id),
        payment_id=refund.payment_id,
        user_id=refund.user_id,
        refund_type=refund.refund_type.value,
        amount_usd=refund.amount_usd,
        credits_deducted=refund.credits_deducted,
        status=refund.status.value,
        reason=refund.reason,
        stripe_refund_id=refund.stripe_refund_id,
        requested_at=refund.requested_at.isoformat(),
        completed_at=refund.completed_at.isoformat() if refund.completed_at else None
    )


# ============================================================
# Export & Invoice Endpoints
# ============================================================

from fastapi.responses import StreamingResponse
from datetime import datetime as dt


@router.get("/export/payments")
async def export_payment_history(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Export payment history
    
    - Requires authentication
    - Supports CSV format
    - Optional date range filtering
    
    Args:
        format: Export format (csv)
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
    
    Returns:
        CSV file download
    """
    from app.services.export_service import ExportService
    
    export_service = ExportService(db)
    
    # Parse dates
    start = dt.fromisoformat(start_date) if start_date else None
    end = dt.fromisoformat(end_date) if end_date else None
    
    # Export
    if format == "csv":
        content = await export_service.export_payment_history_csv(
            user_id=str(current_user.id),
            start_date=start,
            end_date=end
        )
        
        return StreamingResponse(
            io.BytesIO(content),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=payment_history_{dt.now().strftime('%Y%m%d')}.csv"
            }
        )
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid format"
    )


@router.get("/export/credits")
async def export_credit_history(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Export credit transaction history
    
    - Requires authentication
    - Supports CSV format
    - Optional date range filtering
    """
    from app.services.export_service import ExportService
    
    export_service = ExportService(db)
    
    # Parse dates
    start = dt.fromisoformat(start_date) if start_date else None
    end = dt.fromisoformat(end_date) if end_date else None
    
    # Export
    content = await export_service.export_credit_history_csv(
        user_id=str(current_user.id),
        start_date=start,
        end_date=end
    )
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=credit_history_{dt.now().strftime('%Y%m%d')}.csv"
        }
    )


@router.get("/export/all")
async def export_full_history(
    format: str = Query("csv", pattern="^(csv)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Export full transaction history (payments + credits)
    
    - Requires authentication
    - Supports CSV format
    - Optional date range filtering
    """
    from app.services.export_service import ExportService
    
    export_service = ExportService(db)
    
    # Parse dates
    start = dt.fromisoformat(start_date) if start_date else None
    end = dt.fromisoformat(end_date) if end_date else None
    
    # Export
    content = await export_service.export_full_transaction_history_csv(
        user_id=str(current_user.id),
        start_date=start,
        end_date=end
    )
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=full_history_{dt.now().strftime('%Y%m%d')}.csv"
        }
    )


@router.get("/invoice/{payment_id}")
async def get_invoice(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate and download invoice PDF
    
    - Requires authentication
    - Returns PDF invoice
    
    Args:
        payment_id: Payment transaction ID
    
    Returns:
        PDF file download
    """
    from app.services.export_service import ExportService
    
    export_service = ExportService(db)
    
    try:
        pdf_content = await export_service.generate_invoice_pdf(
            payment_id=payment_id,
            user_id=str(current_user.id)
        )
        
        return StreamingResponse(
            io.BytesIO(pdf_content),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=invoice_{payment_id[:8]}.pdf"
            }
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
