# Section 02: Approval Service Database Migration

**Phase**: 1 - Foundation
**Estimated Time**: 3-5 days
**Priority**: Critical (blocks all approval workflows)
**Dependencies**: None

---

## Overview

Migrate the approval service from in-memory dictionary storage to PostgreSQL-backed persistence. Currently, `ApprovalService` stores all approval requests and rules in Python dictionaries (`self._requests`, `self._rules`), which are lost on process restart and don't work in multi-process deployments.

**Current Problem**:
```python
# python-backend/app/orchestrator/approval_gates/approval_service.py
class ApprovalService:
    def __init__(self):
        # Storage (replace with database in production)  ← Comment indicates this needs fixing
        self._requests: Dict[str, ApprovalRequest] = {}
        self._rules: Dict[str, ApprovalRule] = {}
```

**Goal**: Use existing SQLAlchemy models in `app/models/approval.py` for persistent storage.

---

## Goals

- ✅ Approval requests persist to PostgreSQL via SQLAlchemy
- ✅ Multi-process safety (FastAPI + Celery workers share state)
- ✅ All approval CRUD operations use database
- ✅ Migration from in-memory (if any existing data) to database
- ✅ All tests in `tests/test_approval_gates.py` pass
- ✅ Database indexes added for common queries

---

## Files to Modify/Create

### Python Backend

**Modified**:
- `python-backend/app/orchestrator/approval_gates/approval_service.py` - Replace dicts with DB queries
- `python-backend/app/models/approval.py` - Extend models (add workflow-specific fields)

**Created**:
- `python-backend/tests/test_approval_gates.py` - Service tests
- `python-backend/alembic/versions/YYYY_MM_DD_extend_approval_tables.py` - Migration

---

## Implementation Steps

### Step 1: Extend Approval Models

**Edit `python-backend/app/models/approval.py`**:

```python
from sqlalchemy import Column, Integer, String, DateTime, Text, Enum as SQLEnum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.models.base import Base
import enum
from datetime import datetime

class ApprovalType(enum.Enum):
    GENERAL = "general"
    CONTENT = "content"
    MEDIA = "media"
    # NEW: Workflow-specific types
    WORKFLOW_SCRIPT = "workflow_script"
    WORKFLOW_STORYBOARD = "workflow_storyboard"
    WORKFLOW_IMAGES = "workflow_images"
    WORKFLOW_VIDEOS = "workflow_videos"
    WORKFLOW_EXECUTION = "workflow_execution"

class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approval_type = Column(SQLEnum(ApprovalType), nullable=False)
    content = Column(JSONB, nullable=False)
    status = Column(String(20), default="pending")  # pending, approved, rejected, expired
    created_at = Column(DateTime, default=datetime.utcnow)
    responded_at = Column(DateTime, nullable=True)
    responder_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)

    # NEW: Workflow-specific fields
    workflow_execution_id = Column(UUID, ForeignKey("workflow_executions.id"), nullable=True)
    gate_id = Column(String(100), nullable=True)  # e.g., "approve_script"
    change_notes = Column(JSONB, nullable=True)  # Per-item notes for rerenders

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    responder = relationship("User", foreign_keys=[responder_id])

    # Indexes for common queries
    __table_args__ = (
        Index('idx_approval_user_status', 'user_id', 'status'),
        Index('idx_approval_workflow_exec', 'workflow_execution_id'),
        Index('idx_approval_created', 'created_at'),
    )


class ApprovalRule(Base):
    __tablename__ = "approval_rules"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approval_type = Column(SQLEnum(ApprovalType), nullable=False)
    auto_approve = Column(Boolean, default=False)
    timeout_minutes = Column(Integer, default=1440)  # 24 hours
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User")
```

**Create Alembic migration**:

```bash
cd python-backend
alembic revision -m "extend_approval_tables_for_workflows"
```

**Edit migration file**:

```python
def upgrade():
    # Add new approval types
    op.execute("""
        ALTER TYPE approvaltype ADD VALUE IF NOT EXISTS 'workflow_script';
        ALTER TYPE approvaltype ADD VALUE IF NOT EXISTS 'workflow_storyboard';
        ALTER TYPE approvaltype ADD VALUE IF NOT EXISTS 'workflow_images';
        ALTER TYPE approvaltype ADD VALUE IF NOT EXISTS 'workflow_videos';
        ALTER TYPE approvaltype ADD VALUE IF NOT EXISTS 'workflow_execution';
    """)

    # Add new columns
    op.add_column('approval_requests', sa.Column('workflow_execution_id', postgresql.UUID(), nullable=True))
    op.add_column('approval_requests', sa.Column('gate_id', sa.String(100), nullable=True))
    op.add_column('approval_requests', sa.Column('change_notes', postgresql.JSONB(), nullable=True))

    # Add foreign key
    op.create_foreign_key(
        'fk_approval_workflow_execution',
        'approval_requests',
        'workflow_executions',
        ['workflow_execution_id'],
        ['id']
    )

    # Add indexes
    op.create_index('idx_approval_user_status', 'approval_requests', ['user_id', 'status'])
    op.create_index('idx_approval_workflow_exec', 'approval_requests', ['workflow_execution_id'])
    op.create_index('idx_approval_created', 'approval_requests', ['created_at'])


def downgrade():
    op.drop_index('idx_approval_created', 'approval_requests')
    op.drop_index('idx_approval_workflow_exec', 'approval_requests')
    op.drop_index('idx_approval_user_status', 'approval_requests')
    op.drop_constraint('fk_approval_workflow_execution', 'approval_requests', type_='foreignkey')
    op.drop_column('approval_requests', 'change_notes')
    op.drop_column('approval_requests', 'gate_id')
    op.drop_column('approval_requests', 'workflow_execution_id')
```

**Run migration**:
```bash
alembic upgrade head
```

---

### Step 2: Refactor ApprovalService to Use Database

**Edit `python-backend/app/orchestrator/approval_gates/approval_service.py`**:

```python
from typing import List, Optional, Dict
from uuid import uuid4
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.approval import ApprovalRequest, ApprovalRule, ApprovalType
import logging

logger = logging.getLogger(__name__)


class ApprovalService:
    """Service for managing approval workflows (database-backed)"""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def create_request(
        self,
        execution_id: str,
        user_id: int,
        gate_id: str,
        content: dict,
        approval_type: ApprovalType,
        timeout_minutes: int = 1440
    ) -> ApprovalRequest:
        """
        Create a new approval request (persisted to database).

        Args:
            execution_id: Workflow execution ID
            user_id: User who needs to approve
            gate_id: Approval gate ID (e.g., "approve_script")
            content: Content to approve (JSON)
            approval_type: Type of approval
            timeout_minutes: Timeout in minutes (default 24 hours)

        Returns:
            Created ApprovalRequest
        """
        request = ApprovalRequest(
            id=str(uuid4()),
            user_id=user_id,
            workflow_execution_id=execution_id,
            gate_id=gate_id,
            content=content,
            approval_type=approval_type,
            status="pending",
            created_at=datetime.utcnow()
        )

        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)

        logger.info(f"Created approval request {request.id} for user {user_id}, gate {gate_id}")
        return request

    async def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """Get approval request by ID"""
        result = await self.db.execute(
            select(ApprovalRequest).where(ApprovalRequest.id == request_id)
        )
        return result.scalar_one_or_none()

    async def list_pending_requests(self, user_id: int) -> List[ApprovalRequest]:
        """List all pending approval requests for a user"""
        result = await self.db.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.user_id == user_id)
            .where(ApprovalRequest.status == "pending")
            .order_by(ApprovalRequest.created_at.desc())
        )
        return result.scalars().all()

    async def submit_decision(
        self,
        request_id: str,
        responder_id: int,
        action: str,  # "approve", "reject", "request_changes"
        notes: Optional[str] = None,
        change_notes: Optional[dict] = None
    ) -> ApprovalRequest:
        """
        Submit approval decision.

        Args:
            request_id: Approval request ID
            responder_id: User who is responding
            action: "approve", "reject", or "request_changes"
            notes: Optional text notes
            change_notes: Optional per-item change notes (for rerenders)

        Returns:
            Updated ApprovalRequest
        """
        request = await self.get_request(request_id)
        if not request:
            raise ValueError(f"Approval request {request_id} not found")

        if request.status != "pending":
            raise ValueError(f"Approval request {request_id} is not pending (status: {request.status})")

        # Map action to status
        status_map = {
            "approve": "approved",
            "reject": "rejected",
            "request_changes": "changes_requested"
        }
        new_status = status_map.get(action)
        if not new_status:
            raise ValueError(f"Invalid action: {action}")

        # Update request
        await self.db.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == request_id)
            .values(
                status=new_status,
                responded_at=datetime.utcnow(),
                responder_id=responder_id,
                notes=notes,
                change_notes=change_notes
            )
        )
        await self.db.commit()

        # Refresh to get updated values
        await self.db.refresh(request)

        logger.info(f"Approval request {request_id} {action}d by user {responder_id}")
        return request

    async def is_expired(self, request_id: str, timeout_minutes: int = 1440) -> bool:
        """Check if approval request has expired"""
        request = await self.get_request(request_id)
        if not request:
            return True

        if request.status != "pending":
            return False

        age = datetime.utcnow() - request.created_at
        return age.total_seconds() > (timeout_minutes * 60)

    async def cleanup_expired_requests(self, timeout_minutes: int = 10080):
        """
        Mark old pending requests as expired (run as periodic task).

        Args:
            timeout_minutes: Timeout in minutes (default 7 days)
        """
        cutoff = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        result = await self.db.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.status == "pending")
            .where(ApprovalRequest.created_at < cutoff)
            .values(status="expired")
        )
        await self.db.commit()

        count = result.rowcount
        if count > 0:
            logger.info(f"Marked {count} approval requests as expired")
```

---

### Step 3: Update Celery Task for Cleanup

**Create periodic task in `python-backend/app/core/celery_app.py`**:

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    # ... existing tasks ...

    "cleanup-expired-approvals": {
        "task": "app.tasks.approval_tasks.cleanup_expired_approvals",
        "schedule": crontab(hour=4, minute=0),  # Daily at 4:00 AM UTC
    },
}
```

**Create `python-backend/app/tasks/approval_tasks.py`**:

```python
from app.core.celery_app import app
from app.orchestrator.approval_gates.approval_service import ApprovalService
from app.core.database import get_db_session
import logging

logger = logging.getLogger(__name__)


@app.task(name="app.tasks.approval_tasks.cleanup_expired_approvals")
async def cleanup_expired_approvals():
    """Cleanup expired approval requests (Celery periodic task)"""
    async with get_db_session() as session:
        service = ApprovalService(session)
        await service.cleanup_expired_requests(timeout_minutes=10080)  # 7 days

    logger.info("Completed expired approval cleanup")
```

---

### Step 4: Write Tests

**Create `python-backend/tests/test_approval_gates.py`** (refer to `claude-plan-tdd.md` for full tests):

```python
import pytest
from datetime import datetime, timedelta
from app.orchestrator.approval_gates.approval_service import ApprovalService
from app.models.approval import ApprovalType

class TestApprovalService:
    @pytest.fixture
    async def approval_service(self, db_session):
        return ApprovalService(db_session)

    @pytest.mark.asyncio
    async def test_create_approval_request(self, approval_service):
        """Test creating approval request persists to database"""
        request = await approval_service.create_request(
            execution_id="exec-123",
            user_id=1,
            gate_id="approve_script",
            content={"script": "Test"},
            approval_type=ApprovalType.WORKFLOW_SCRIPT
        )

        assert request.id is not None
        assert request.status == "pending"

        # Verify persisted
        loaded = await approval_service.get_request(request.id)
        assert loaded.workflow_execution_id == "exec-123"

    # ... more tests (refer to TDD plan)
```

**Run tests**:
```bash
pytest tests/test_approval_gates.py -v --cov=app.orchestrator.approval_gates
```

---

## Verification

### Database Verification

```sql
-- Check approval requests table
SELECT id, user_id, gate_id, status, workflow_execution_id
FROM approval_requests
WHERE workflow_execution_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- Check indexes exist
\di idx_approval_*
```

### Integration Test

```python
# Test in Python shell
from app.orchestrator.approval_gates.approval_service import ApprovalService
from app.core.database import get_db_session
import asyncio

async def test():
    async with get_db_session() as session:
        service = ApprovalService(session)

        # Create request
        req = await service.create_request(
            execution_id="test-exec",
            user_id=1,
            gate_id="approve_script",
            content={"test": "data"},
            approval_type=ApprovalType.WORKFLOW_SCRIPT
        )
        print(f"Created: {req.id}")

        # List pending
        pending = await service.list_pending_requests(user_id=1)
        print(f"Pending: {len(pending)}")

        # Submit decision
        await service.submit_decision(req.id, responder_id=1, action="approve")
        print("Approved!")

asyncio.run(test())
```

---

## Dependencies

**Required Before**: None
**Enables**: All approval gate workflows, smart invalidation

---

## Completion Checklist

- [ ] Alembic migration created and run
- [ ] ApprovalService refactored to use database
- [ ] All dictionary references removed
- [ ] Periodic cleanup task created
- [ ] All unit tests pass
- [ ] Integration test passes
- [ ] Database indexes verified
- [ ] Manual verification successful

**Estimated Completion**: 3-5 days
