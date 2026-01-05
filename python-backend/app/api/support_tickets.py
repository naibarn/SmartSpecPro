"""
Support Tickets API
Endpoints for user support ticket system
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.ticket_service import TicketService


router = APIRouter(prefix="/api/v1")


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateTicketRequest(BaseModel):
    """Create ticket request"""
    subject: str = Field(..., min_length=5, max_length=500)
    description: str = Field(..., min_length=20, max_length=5000)
    category: str = Field(..., description="Category: technical, billing, feature_request, bug_report, account, other")
    priority: str = Field(default="medium", description="Priority: low, medium, high, urgent")


class UpdateTicketRequest(BaseModel):
    """Update ticket request"""
    status: Optional[str] = Field(None, description="Status: open, in_progress, waiting_user, resolved, closed")
    priority: Optional[str] = Field(None, description="Priority: low, medium, high, urgent")
    assigned_to: Optional[str] = Field(None, description="Admin user ID to assign")


class AddMessageRequest(BaseModel):
    """Add message request"""
    message: str = Field(..., min_length=1, max_length=5000)
    attachments: Optional[List[str]] = Field(None, description="List of attachment URLs")


# ============================================================================
# Middleware for admin check
# ============================================================================

async def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ============================================================================
# Support Ticket Endpoints
# ============================================================================

@router.post("/support/tickets")
async def create_ticket(
    request: CreateTicketRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Create a support ticket
    
    Users can create support tickets for help with:
    - Technical issues
    - Billing questions
    - Feature requests
    - Bug reports
    - Account issues
    - Other inquiries
    
    **Response includes:**
    - Ticket number (e.g., TICK-20240115-1234)
    - Ticket ID
    - Status and priority
    """
    service = TicketService(db)
    
    try:
        ticket = await service.create_ticket(
            user_id=current_user["id"],
            subject=request.subject,
            description=request.description,
            category=request.category,
            priority=request.priority
        )
        
        return ticket.to_dict()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/support/tickets")
async def get_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get user's support tickets
    
    Returns all tickets created by the current user.
    Can be filtered by status, category, and priority.
    """
    service = TicketService(db)
    
    tickets = await service.get_tickets(
        user_id=current_user["id"],
        status=status,
        category=category,
        priority=priority,
        limit=limit,
        offset=offset
    )
    
    return {
        "tickets": [ticket.to_dict() for ticket in tickets],
        "total": len(tickets),
        "limit": limit,
        "offset": offset
    }


@router.get("/support/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get ticket details
    
    Returns full ticket details including all messages.
    """
    service = TicketService(db)
    
    # Get ticket
    ticket = await service.get_ticket(
        ticket_id=ticket_id,
        user_id=current_user["id"]
    )
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    # Get messages
    messages = await service.get_messages(ticket_id)
    
    ticket_dict = ticket.to_dict()
    ticket_dict["messages"] = [msg.to_dict() for msg in messages]
    
    return ticket_dict


@router.post("/support/tickets/{ticket_id}/messages")
async def add_message(
    ticket_id: str,
    request: AddMessageRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Add a message to a ticket
    
    Users can add messages to their tickets.
    Staff responses will be marked as such.
    """
    service = TicketService(db)
    
    # Verify ticket ownership
    ticket = await service.get_ticket(
        ticket_id=ticket_id,
        user_id=current_user["id"]
    )
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    message = await service.add_message(
        ticket_id=ticket_id,
        user_id=current_user["id"],
        message=request.message,
        is_staff_response=False,
        attachments=request.attachments
    )
    
    return message.to_dict()


@router.get("/support/tickets/{ticket_id}/messages")
async def get_messages(
    ticket_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get all messages for a ticket
    
    Returns all messages in chronological order.
    """
    service = TicketService(db)
    
    # Verify ticket ownership
    ticket = await service.get_ticket(
        ticket_id=ticket_id,
        user_id=current_user["id"]
    )
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    messages = await service.get_messages(ticket_id)
    
    return {
        "messages": [msg.to_dict() for msg in messages],
        "total": len(messages)
    }


@router.get("/support/statistics")
async def get_statistics(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Get ticket statistics
    
    Returns statistics about user's tickets:
    - Total tickets
    - Breakdown by status
    - Breakdown by priority
    - Breakdown by category
    """
    service = TicketService(db)
    
    stats = await service.get_ticket_statistics(
        user_id=current_user["id"]
    )
    
    return stats


@router.get("/support/search")
async def search_tickets(
    q: str = Query(..., min_length=2),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Search user's tickets
    
    Search by ticket number, subject, or description.
    """
    service = TicketService(db)
    
    tickets = await service.search_tickets(
        search_term=q,
        user_id=current_user["id"],
        limit=limit
    )
    
    return {
        "tickets": [ticket.to_dict() for ticket in tickets],
        "total": len(tickets),
        "search_term": q
    }


# ============================================================================
# Admin Endpoints
# ============================================================================

@router.get("/admin/support/tickets")
async def admin_get_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get all support tickets
    
    **Admin Only**
    
    Returns all tickets with optional filters.
    """
    service = TicketService(db)
    
    tickets = await service.get_tickets(
        status=status,
        category=category,
        priority=priority,
        assigned_to=assigned_to,
        limit=limit,
        offset=offset
    )
    
    return {
        "tickets": [ticket.to_dict() for ticket in tickets],
        "total": len(tickets),
        "limit": limit,
        "offset": offset
    }


@router.put("/admin/support/tickets/{ticket_id}")
async def admin_update_ticket(
    ticket_id: str,
    request: UpdateTicketRequest,
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Update a ticket
    
    **Admin Only**
    
    Admins can update ticket status, priority, and assignment.
    """
    service = TicketService(db)
    
    ticket = await service.update_ticket(
        ticket_id=ticket_id,
        status=request.status,
        priority=request.priority,
        assigned_to=request.assigned_to
    )
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    return ticket.to_dict()


@router.post("/admin/support/tickets/{ticket_id}/messages")
async def admin_add_message(
    ticket_id: str,
    request: AddMessageRequest,
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Add a staff response to a ticket
    
    **Admin Only**
    
    Admins can respond to tickets.
    Responses are marked as staff responses.
    """
    service = TicketService(db)
    
    # Verify ticket exists
    ticket = await service.get_ticket(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    message = await service.add_message(
        ticket_id=ticket_id,
        user_id=current_user["id"],
        message=request.message,
        is_staff_response=True,
        attachments=request.attachments
    )
    
    return message.to_dict()


@router.get("/admin/support/statistics")
async def admin_get_statistics(
    current_user: dict = Depends(require_admin),
    db = Depends(get_db)
):
    """
    Get global ticket statistics
    
    **Admin Only**
    
    Returns statistics about all tickets in the system.
    """
    service = TicketService(db)
    
    stats = await service.get_ticket_statistics()
    
    return stats
