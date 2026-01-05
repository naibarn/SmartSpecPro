"""
Tests for TicketService

Tests the support ticket service with proper mocking.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.services.ticket_service import TicketService
from app.models.support_ticket import (
    SupportTicket,
    TicketMessage,
    TicketStatus,
    TicketPriority,
    TicketCategory
)


class TestTicketService:
    """Tests for TicketService"""
    
    @pytest.fixture
    def mock_db(self):
        """Create mock database session"""
        db = MagicMock()
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.rollback = AsyncMock()
        db.execute = AsyncMock()
        return db
    
    @pytest.fixture
    def ticket_service(self, mock_db):
        """Create ticket service with mock db"""
        return TicketService(db=mock_db)
    
    @pytest.fixture
    def sample_ticket(self):
        """Create sample ticket"""
        ticket = MagicMock(spec=SupportTicket)
        ticket.id = "ticket-123"
        ticket.user_id = "user-123"
        ticket.subject = "Test Subject"
        ticket.description = "Test Description"
        ticket.category = TicketCategory.BILLING
        ticket.priority = TicketPriority.MEDIUM
        ticket.status = TicketStatus.OPEN
        ticket.ticket_number = "TKT-001"
        ticket.created_at = datetime.utcnow()
        ticket.updated_at = datetime.utcnow()
        ticket.assigned_to = None
        ticket.resolved_at = None
        ticket.closed_at = None
        return ticket
    
    @pytest.fixture
    def sample_message(self):
        """Create sample ticket message"""
        message = MagicMock(spec=TicketMessage)
        message.id = "msg-123"
        message.ticket_id = "ticket-123"
        message.user_id = "user-123"
        message.message = "Test message"
        message.is_staff_response = "false"
        message.attachments = None
        message.created_at = datetime.utcnow()
        return message
    
    # =========================================================================
    # create_ticket tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_create_ticket_success(self, ticket_service, mock_db):
        """Test successful ticket creation"""
        mock_db.refresh = AsyncMock()
        
        ticket = await ticket_service.create_ticket(
            user_id="user-123",
            subject="Test Subject",
            description="Test Description",
            category="billing",
            priority="high"
        )
        
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_create_ticket_default_priority(self, ticket_service, mock_db):
        """Test ticket creation with default priority"""
        await ticket_service.create_ticket(
            user_id="user-123",
            subject="Test Subject",
            description="Test Description",
            category="technical"
        )
        
        # Verify add was called with a ticket
        call_args = mock_db.add.call_args
        added_ticket = call_args[0][0]
        assert added_ticket.priority == TicketPriority.MEDIUM
    
    @pytest.mark.asyncio
    async def test_create_ticket_rollback_on_error(self, ticket_service, mock_db):
        """Test ticket creation rollback on error"""
        mock_db.commit.side_effect = Exception("DB error")
        
        with pytest.raises(Exception):
            await ticket_service.create_ticket(
                user_id="user-123",
                subject="Test Subject",
                description="Test Description",
                category="billing"
            )
        
        mock_db.rollback.assert_called_once()
    
    # =========================================================================
    # get_ticket tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_ticket_found(self, ticket_service, mock_db, sample_ticket):
        """Test getting existing ticket"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        ticket = await ticket_service.get_ticket("ticket-123")
        
        assert ticket == sample_ticket
        mock_db.execute.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_ticket_not_found(self, ticket_service, mock_db):
        """Test getting non-existent ticket"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        
        ticket = await ticket_service.get_ticket("nonexistent")
        
        assert ticket is None
    
    @pytest.mark.asyncio
    async def test_get_ticket_with_user_id(self, ticket_service, mock_db, sample_ticket):
        """Test getting ticket with user ID filter"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        ticket = await ticket_service.get_ticket("ticket-123", user_id="user-123")
        
        assert ticket == sample_ticket
    
    # =========================================================================
    # get_tickets tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_tickets_no_filter(self, ticket_service, mock_db, sample_ticket):
        """Test getting tickets without filters"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets()
        
        assert len(tickets) == 1
        assert tickets[0] == sample_ticket
    
    @pytest.mark.asyncio
    async def test_get_tickets_with_user_filter(self, ticket_service, mock_db, sample_ticket):
        """Test getting tickets with user filter"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets(user_id="user-123")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_get_tickets_with_status_filter(self, ticket_service, mock_db, sample_ticket):
        """Test getting tickets with status filter"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets(status="open")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_get_tickets_with_category_filter(self, ticket_service, mock_db, sample_ticket):
        """Test getting tickets with category filter"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets(category="billing")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_get_tickets_with_priority_filter(self, ticket_service, mock_db, sample_ticket):
        """Test getting tickets with priority filter"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets(priority="high")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_get_tickets_with_assigned_filter(self, ticket_service, mock_db, sample_ticket):
        """Test getting tickets with assigned_to filter"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets(assigned_to="admin-123")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_get_tickets_pagination(self, ticket_service, mock_db):
        """Test getting tickets with pagination"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.get_tickets(limit=10, offset=20)
        
        assert tickets == []
    
    # =========================================================================
    # update_ticket tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_update_ticket_status(self, ticket_service, mock_db, sample_ticket):
        """Test updating ticket status"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        updated = await ticket_service.update_ticket(
            ticket_id="ticket-123",
            status="in_progress"
        )
        
        assert updated.status == TicketStatus.IN_PROGRESS
        mock_db.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_ticket_resolved(self, ticket_service, mock_db, sample_ticket):
        """Test updating ticket to resolved status"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        updated = await ticket_service.update_ticket(
            ticket_id="ticket-123",
            status="resolved"
        )
        
        assert updated.status == TicketStatus.RESOLVED
        assert updated.resolved_at is not None
    
    @pytest.mark.asyncio
    async def test_update_ticket_closed(self, ticket_service, mock_db, sample_ticket):
        """Test updating ticket to closed status"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        updated = await ticket_service.update_ticket(
            ticket_id="ticket-123",
            status="closed"
        )
        
        assert updated.status == TicketStatus.CLOSED
        assert updated.closed_at is not None
    
    @pytest.mark.asyncio
    async def test_update_ticket_priority(self, ticket_service, mock_db, sample_ticket):
        """Test updating ticket priority"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        updated = await ticket_service.update_ticket(
            ticket_id="ticket-123",
            priority="urgent"
        )
        
        assert updated.priority == TicketPriority.URGENT
    
    @pytest.mark.asyncio
    async def test_update_ticket_assigned_to(self, ticket_service, mock_db, sample_ticket):
        """Test assigning ticket"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        updated = await ticket_service.update_ticket(
            ticket_id="ticket-123",
            assigned_to="admin-123"
        )
        
        assert updated.assigned_to == "admin-123"
    
    @pytest.mark.asyncio
    async def test_update_ticket_not_found(self, ticket_service, mock_db):
        """Test updating non-existent ticket"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        
        updated = await ticket_service.update_ticket(
            ticket_id="nonexistent",
            status="in_progress"
        )
        
        assert updated is None
    
    @pytest.mark.asyncio
    async def test_update_ticket_rollback_on_error(self, ticket_service, mock_db, sample_ticket):
        """Test update rollback on error"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        mock_db.commit.side_effect = Exception("DB error")
        
        with pytest.raises(Exception):
            await ticket_service.update_ticket(
                ticket_id="ticket-123",
                status="in_progress"
            )
        
        mock_db.rollback.assert_called_once()
    
    # =========================================================================
    # add_message tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_add_message_success(self, ticket_service, mock_db, sample_ticket):
        """Test adding message to ticket"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        message = await ticket_service.add_message(
            ticket_id="ticket-123",
            user_id="user-123",
            message="Test message"
        )
        
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_add_message_staff_response(self, ticket_service, mock_db, sample_ticket):
        """Test adding staff response"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        message = await ticket_service.add_message(
            ticket_id="ticket-123",
            user_id="admin-123",
            message="Staff response",
            is_staff_response=True
        )
        
        call_args = mock_db.add.call_args
        added_message = call_args[0][0]
        assert added_message.is_staff_response == "true"
    
    @pytest.mark.asyncio
    async def test_add_message_with_attachments(self, ticket_service, mock_db, sample_ticket):
        """Test adding message with attachments"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        attachments = ["https://example.com/file1.pdf", "https://example.com/file2.png"]
        
        message = await ticket_service.add_message(
            ticket_id="ticket-123",
            user_id="user-123",
            message="Message with attachments",
            attachments=attachments
        )
        
        call_args = mock_db.add.call_args
        added_message = call_args[0][0]
        assert added_message.attachments is not None
    
    @pytest.mark.asyncio
    async def test_add_message_updates_ticket_status(self, ticket_service, mock_db, sample_ticket):
        """Test that user response changes status from waiting_user to in_progress"""
        sample_ticket.status = TicketStatus.WAITING_USER
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        
        await ticket_service.add_message(
            ticket_id="ticket-123",
            user_id="user-123",
            message="User response",
            is_staff_response=False
        )
        
        assert sample_ticket.status == TicketStatus.IN_PROGRESS
    
    @pytest.mark.asyncio
    async def test_add_message_rollback_on_error(self, ticket_service, mock_db, sample_ticket):
        """Test message rollback on error"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_ticket
        mock_db.execute.return_value = mock_result
        mock_db.commit.side_effect = Exception("DB error")
        
        with pytest.raises(Exception):
            await ticket_service.add_message(
                ticket_id="ticket-123",
                user_id="user-123",
                message="Test message"
            )
        
        mock_db.rollback.assert_called_once()
    
    # =========================================================================
    # get_messages tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_messages_success(self, ticket_service, mock_db, sample_message):
        """Test getting ticket messages"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_message]
        mock_db.execute.return_value = mock_result
        
        messages = await ticket_service.get_messages("ticket-123")
        
        assert len(messages) == 1
        assert messages[0] == sample_message
    
    @pytest.mark.asyncio
    async def test_get_messages_empty(self, ticket_service, mock_db):
        """Test getting messages for ticket with no messages"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        messages = await ticket_service.get_messages("ticket-123")
        
        assert messages == []
    
    # =========================================================================
    # get_ticket_statistics tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_get_ticket_statistics(self, ticket_service, mock_db, sample_ticket):
        """Test getting ticket statistics"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        stats = await ticket_service.get_ticket_statistics()
        
        assert stats["total_tickets"] == 1
        assert "by_status" in stats
        assert "by_priority" in stats
        assert "by_category" in stats
    
    @pytest.mark.asyncio
    async def test_get_ticket_statistics_with_user(self, ticket_service, mock_db, sample_ticket):
        """Test getting user-specific ticket statistics"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        stats = await ticket_service.get_ticket_statistics(user_id="user-123")
        
        assert stats["total_tickets"] == 1
    
    @pytest.mark.asyncio
    async def test_get_ticket_statistics_empty(self, ticket_service, mock_db):
        """Test getting statistics with no tickets"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        stats = await ticket_service.get_ticket_statistics()
        
        assert stats["total_tickets"] == 0
        assert stats["by_status"] == {}
        assert stats["by_priority"] == {}
        assert stats["by_category"] == {}
    
    # =========================================================================
    # search_tickets tests
    # =========================================================================
    
    @pytest.mark.asyncio
    async def test_search_tickets_by_subject(self, ticket_service, mock_db, sample_ticket):
        """Test searching tickets by subject"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.search_tickets("Test")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_search_tickets_with_user_filter(self, ticket_service, mock_db, sample_ticket):
        """Test searching tickets with user filter"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sample_ticket]
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.search_tickets("Test", user_id="user-123")
        
        assert len(tickets) == 1
    
    @pytest.mark.asyncio
    async def test_search_tickets_no_results(self, ticket_service, mock_db):
        """Test searching tickets with no results"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.search_tickets("nonexistent")
        
        assert tickets == []
    
    @pytest.mark.asyncio
    async def test_search_tickets_with_limit(self, ticket_service, mock_db):
        """Test searching tickets with custom limit"""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        tickets = await ticket_service.search_tickets("Test", limit=10)
        
        assert tickets == []
