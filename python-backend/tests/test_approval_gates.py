"""
Tests for approval service database persistence.

Simple tests to verify ApprovalService can be instantiated with database session.
Full functional tests will be added when service is fully refactored.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.approval import ApprovalRequest, ApprovalStatus, ApprovalType


@pytest.mark.unit
def test_approval_models_can_be_imported():
    """Test that approval database models can be imported"""
    # This is a smoke test to ensure models are properly defined
    assert ApprovalRequest is not None
    assert ApprovalStatus is not None
    assert ApprovalType is not None


@pytest.mark.unit
def test_approval_request_model_has_required_fields():
    """Test that ApprovalRequest model has required database fields"""
    # Check that model has expected fields
    assert hasattr(ApprovalRequest, 'id')
    assert hasattr(ApprovalRequest, 'request_type')
    assert hasattr(ApprovalRequest, 'status')
    assert hasattr(ApprovalRequest, 'created_at')
    assert hasattr(ApprovalRequest, 'tenant_id')


@pytest.mark.unit
def test_approval_status_enum():
    """Test ApprovalStatus enum values"""
    assert ApprovalStatus.PENDING == "pending"
    assert ApprovalStatus.APPROVED == "approved"
    assert ApprovalStatus.REJECTED == "rejected"
    assert ApprovalStatus.EXPIRED == "expired"


@pytest.mark.unit
def test_approval_type_enum():
    """Test ApprovalType enum has required values"""
    # Verify enum has expected approval types
    assert ApprovalType.CODE_EXECUTION == "code_execution"
    assert ApprovalType.COST_THRESHOLD == "cost_threshold"


@pytest.mark.unit
def test_approval_db_service_can_be_imported():
    """Test that ApprovalDBService can be imported"""
    from app.services.approval_db_service import ApprovalDBService

    assert ApprovalDBService is not None


@pytest.mark.unit
def test_approval_db_service_has_required_methods():
    """Test that ApprovalDBService has required methods"""
    from app.services.approval_db_service import ApprovalDBService

    # Check that service has expected methods
    assert hasattr(ApprovalDBService, '__init__')
    assert hasattr(ApprovalDBService, 'create_request')
    assert hasattr(ApprovalDBService, 'get_request')
    assert hasattr(ApprovalDBService, 'list_pending_requests')
    assert hasattr(ApprovalDBService, 'submit_decision')
    assert hasattr(ApprovalDBService, 'cleanup_expired_requests')


@pytest.mark.asyncio
async def test_cancel_request_revalidates_requester_and_tenant():
    from app.services.approval_db_service import ApprovalDBService

    request = SimpleNamespace(
        id="approval-1",
        requester_id=7,
        tenant_id="tenant-1",
        status=ApprovalStatus.PENDING,
        resolved_at=None,
    )
    db = SimpleNamespace(commit=AsyncMock())
    service = ApprovalDBService(db)
    service.get_request = AsyncMock(return_value=request)

    unauthorized = await service.cancel_request("approval-1", cancelled_by=8, tenant_id="tenant-1")
    assert unauthorized is None
    db.commit.assert_not_awaited()

    cancelled = await service.cancel_request("approval-1", cancelled_by=7, tenant_id="tenant-1")
    assert cancelled is request
    assert request.status == ApprovalStatus.CANCELLED
    db.commit.assert_awaited_once()


# Placeholder for future integration tests with full database
@pytest.mark.skip(reason="Requires database refactoring of ApprovalService")
class TestApprovalServiceDatabase:
    """Integration tests for database-backed approval service"""

    @pytest.mark.asyncio
    async def test_create_request_persists(self):
        """Test creating approval request saves to database"""
        pass

    @pytest.mark.asyncio
    async def test_get_pending_requests(self):
        """Test retrieving pending requests from database"""
        pass
