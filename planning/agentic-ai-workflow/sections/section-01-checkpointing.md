# Section 01: PostgreSQL Checkpointing Implementation

**Phase**: 1 - Foundation
**Estimated Time**: 3-4 days
**Priority**: Critical (blocks Section 05)
**Dependencies**: None

---

## Overview

Implement PostgreSQL-backed checkpointing for LangGraph workflows to enable state persistence across process restarts. Currently, the `CheckpointerFactory` ignores the `use_postgres` parameter and always returns an in-memory `MemorySaver`, which loses state on crashes.

**Problem**:
```python
# python-backend/app/core/checkpointer.py (current code)
@staticmethod
async def create(use_postgres: bool = False) -> MemorySaver:
    """
    Args:
        use_postgres: Ignored (PostgreSQL support disabled)
    Returns:
        MemorySaver instance
    """
    return get_memory_checkpointer()
```

**Solution**: Enable `AsyncPostgresSaver` with proper connection pooling and checkpoint table setup.

---

## Goals

- ✅ PostgreSQL checkpoint tables created and migrated
- ✅ `CheckpointerFactory.create(use_postgres=True)` returns `AsyncPostgresSaver`
- ✅ Workflow state persists across process restarts
- ✅ Checkpoint write latency p95 < 100ms
- ✅ All tests in `tests/test_checkpointing.py` pass
- ✅ `psycopg` vs `psycopg2` driver conflict resolved

---

## Files to Modify/Create

### Python Backend

**Modified**:
- `python-backend/app/core/checkpointer.py` - Enable PostgreSQL saver
- `python-backend/requirements.txt` - Remove psycopg2-binary, keep psycopg[binary]
- `python-backend/app/orchestrator/orchestrator.py` - Uncomment AsyncPostgresSaver import

**Created**:
- `python-backend/tests/test_checkpointing.py` - Unit and integration tests
- `python-backend/alembic/versions/YYYY_MM_DD_create_checkpoint_tables.py` - Migration

---

## Implementation Steps

### Step 1: Resolve psycopg Driver Conflict

**Problem**: Both `psycopg2-binary` and `psycopg[binary]` are in requirements.txt, causing conflicts.

**Action**:
```bash
cd python-backend

# Remove psycopg2-binary from requirements.txt
sed -i '/psycopg2-binary/d' requirements.txt

# Ensure psycopg[binary] is present
grep -q 'psycopg\[binary\]' requirements.txt || echo 'psycopg[binary]>=3.1.0' >> requirements.txt

# Reinstall dependencies
pip install -r requirements.txt
```

**Verify**:
```bash
python -c "import psycopg; print(psycopg.__version__)"
# Should print: 3.1.x or higher
```

---

### Step 2: Create Checkpoint Tables Migration

**Create Alembic migration**:

```bash
cd python-backend
alembic revision -m "create_checkpoint_tables"
```

**Edit migration file** (`alembic/versions/YYYY_MM_DD_create_checkpoint_tables.py`):

```python
"""create_checkpoint_tables

Revision ID: abc123def456
Revises: previous_revision_id
Create Date: 2026-02-08 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = 'abc123def456'
down_revision = 'previous_revision_id'  # Update to actual previous revision
branch_labels = None
depends_on = None


def upgrade():
    # Create checkpoints table
    op.create_table(
        'checkpoints',
        sa.Column('thread_id', sa.String(), nullable=False),
        sa.Column('checkpoint_ns', sa.String(), nullable=False, server_default=''),
        sa.Column('checkpoint_id', sa.String(), nullable=False),
        sa.Column('parent_checkpoint_id', sa.String(), nullable=True),
        sa.Column('type', sa.String(), nullable=True),
        sa.Column('checkpoint', postgresql.JSONB, nullable=False),
        sa.Column('metadata', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.PrimaryKeyConstraint('thread_id', 'checkpoint_ns', 'checkpoint_id')
    )

    # Create checkpoint_writes table
    op.create_table(
        'checkpoint_writes',
        sa.Column('thread_id', sa.String(), nullable=False),
        sa.Column('checkpoint_ns', sa.String(), nullable=False, server_default=''),
        sa.Column('checkpoint_id', sa.String(), nullable=False),
        sa.Column('task_id', sa.String(), nullable=False),
        sa.Column('idx', sa.Integer(), nullable=False),
        sa.Column('channel', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=True),
        sa.Column('value', postgresql.JSONB, nullable=True),
        sa.PrimaryKeyConstraint('thread_id', 'checkpoint_ns', 'checkpoint_id', 'task_id', 'idx')
    )

    # Create indexes for performance
    op.create_index('idx_checkpoints_thread_id', 'checkpoints', ['thread_id'])
    op.create_index('idx_checkpoint_writes_thread_id', 'checkpoint_writes', ['thread_id'])


def downgrade():
    op.drop_table('checkpoint_writes')
    op.drop_table('checkpoints')
```

**Run migration**:
```bash
alembic upgrade head
```

**Verify tables created**:
```bash
psql $DATABASE_URL -c "\dt checkpoints*"
# Should show: checkpoints, checkpoint_writes
```

---

### Step 3: Update CheckpointerFactory

**Edit `python-backend/app/core/checkpointer.py`**:

```python
from typing import Union
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver  # Uncomment this
import asyncpg
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Singleton instances
_memory_checkpointer = None
_postgres_checkpointer = None
_postgres_pool = None


def get_memory_checkpointer() -> MemorySaver:
    """Get or create in-memory checkpointer (for testing)"""
    global _memory_checkpointer
    if _memory_checkpointer is None:
        _memory_checkpointer = MemorySaver()
    return _memory_checkpointer


async def get_postgres_checkpointer() -> AsyncPostgresSaver:
    """Get or create PostgreSQL checkpointer"""
    global _postgres_checkpointer, _postgres_pool

    if _postgres_checkpointer is None:
        logger.info("Initializing PostgreSQL checkpointer")

        # Create connection pool
        _postgres_pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=60
        )

        # Create checkpointer
        _postgres_checkpointer = AsyncPostgresSaver(_postgres_pool)

        # Setup tables (idempotent - safe to call multiple times)
        await _postgres_checkpointer.setup()

        logger.info("PostgreSQL checkpointer initialized successfully")

    return _postgres_checkpointer


class CheckpointerFactory:
    """Factory for creating checkpointers"""

    @staticmethod
    async def create(use_postgres: bool = True) -> Union[MemorySaver, AsyncPostgresSaver]:
        """
        Create a checkpointer.

        Args:
            use_postgres: If True, use PostgreSQL (production).
                         If False, use in-memory (testing only).

        Returns:
            AsyncPostgresSaver (if use_postgres=True) or MemorySaver (if False)
        """
        if use_postgres:
            return await get_postgres_checkpointer()
        else:
            logger.warning("Using in-memory checkpointer - state will not persist!")
            return get_memory_checkpointer()


async def cleanup_checkpointers():
    """Cleanup checkpointer resources (call on shutdown)"""
    global _postgres_pool

    if _postgres_pool:
        await _postgres_pool.close()
        logger.info("PostgreSQL checkpointer pool closed")
```

**Update `app/core/config.py`** to ensure DATABASE_URL is available:

```python
class Settings(BaseSettings):
    DATABASE_URL: str  # Ensure this exists
    # ... other settings
```

---

### Step 4: Update Orchestrator to Use PostgreSQL Checkpointer

**Edit `python-backend/app/orchestrator/orchestrator.py`**:

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver  # Uncomment
from app.core.checkpointer import CheckpointerFactory

class WorkflowOrchestrator:
    def __init__(self):
        self.checkpointer = None

    async def initialize(self):
        """Initialize orchestrator with PostgreSQL checkpointer"""
        self.checkpointer = await CheckpointerFactory.create(use_postgres=True)

    async def start_workflow(self, template_id: int, user_id: int, inputs: dict):
        """Start a new workflow execution"""
        if not self.checkpointer:
            await self.initialize()

        # ... rest of implementation
```

**Update FastAPI startup**:

```python
# app/main.py
from app.orchestrator.orchestrator import WorkflowOrchestrator

orchestrator = WorkflowOrchestrator()

@app.on_event("startup")
async def startup_event():
    await orchestrator.initialize()
    logger.info("Orchestrator initialized with PostgreSQL checkpointing")

@app.on_event("shutdown")
async def shutdown_event():
    from app.core.checkpointer import cleanup_checkpointers
    await cleanup_checkpointers()
```

---

### Step 5: Write Tests

**Create `python-backend/tests/test_checkpointing.py`**:

```python
import pytest
import asyncio
from uuid import uuid4
from app.core.checkpointer import CheckpointerFactory, get_postgres_checkpointer
from app.orchestrator.orchestrator import WorkflowOrchestrator

class TestPostgreSQLCheckpointing:
    """Tests for PostgreSQL checkpointing"""

    @pytest.fixture
    async def checkpointer(self):
        """Fixture: Create PostgreSQL checkpointer"""
        saver = await CheckpointerFactory.create(use_postgres=True)
        yield saver
        # Cleanup after test
        # (Alembic migration handles table cleanup in test database)

    @pytest.fixture
    def workflow_state(self):
        """Fixture: Sample workflow state"""
        return {
            "execution_id": str(uuid4()),
            "skill_id": "test_skill",
            "user_id": 1,
            "tenant_id": 1,
            "inputs": {"brief": "Test"},
            "step_results": {},
            "artifacts": [],
            "approvals": {},
            "dependencies": {},
            "budget": {"reserved": 0, "spent": 0},
            "current_step": "parse_brief"
        }

    @pytest.mark.asyncio
    async def test_checkpoint_save_and_load(self, checkpointer, workflow_state):
        """Test that checkpoint can be saved and loaded"""
        # Arrange
        thread_id = workflow_state["execution_id"]
        config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": "workflow"}}

        # Act: Save checkpoint
        await checkpointer.aput(config, workflow_state, {})

        # Assert: Load checkpoint
        loaded = await checkpointer.aget(config)
        assert loaded is not None
        assert loaded["execution_id"] == workflow_state["execution_id"]

    @pytest.mark.asyncio
    async def test_checkpoint_write_latency(self, checkpointer, workflow_state):
        """Test that checkpoint write latency is < 100ms (p95)"""
        import time

        latencies = []
        thread_id = workflow_state["execution_id"]

        for i in range(100):
            workflow_state["current_step"] = f"step_{i}"
            config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": "workflow"}}

            start = time.perf_counter()
            await checkpointer.aput(config, workflow_state, {})
            end = time.perf_counter()

            latencies.append((end - start) * 1000)  # ms

        p95 = sorted(latencies)[94]
        assert p95 < 100, f"Checkpoint write p95 latency {p95:.2f}ms exceeds 100ms"

    @pytest.mark.asyncio
    async def test_checkpoint_survives_process_restart(self, checkpointer):
        """Test that state persists across orchestrator restart"""
        # Arrange: Create workflow and save state
        thread_id = str(uuid4())
        state = {
            "execution_id": thread_id,
            "current_step": "approve_script",
            "step_results": {"plan_script": {"script": "Test script"}}
        }
        config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": "workflow"}}
        await checkpointer.aput(config, state, {})

        # Act: Simulate process restart (create new checkpointer instance)
        checkpointer_new = await get_postgres_checkpointer()
        loaded = await checkpointer_new.aget(config)

        # Assert: State preserved
        assert loaded is not None
        assert loaded["execution_id"] == thread_id
        assert loaded["current_step"] == "approve_script"


@pytest.mark.integration
class TestCheckpointIntegration:
    """Integration tests with full orchestrator"""

    @pytest.mark.asyncio
    async def test_workflow_resume_after_crash(self):
        """Test workflow can resume after simulated crash"""
        # Arrange: Start workflow
        orchestrator = WorkflowOrchestrator()
        await orchestrator.initialize()

        execution_id = await orchestrator.start_workflow(
            template_id=1,
            user_id=1,
            inputs={"brief": "Test"}
        )

        # Wait for first approval gate
        await asyncio.sleep(2)

        # Act: Simulate crash - create new orchestrator
        orchestrator_new = WorkflowOrchestrator()
        await orchestrator_new.initialize()

        state = await orchestrator_new.get_workflow_state(execution_id)

        # Assert: State preserved
        assert state is not None
        assert state["execution_id"] == execution_id
```

**Run tests**:
```bash
cd python-backend
pytest tests/test_checkpointing.py -v
```

---

## Test Requirements

All tests in `tests/test_checkpointing.py` must pass:

- ✅ `test_checkpoint_save_and_load` - Basic persistence
- ✅ `test_checkpoint_write_latency` - Performance (<100ms p95)
- ✅ `test_checkpoint_survives_process_restart` - Crash recovery
- ✅ `test_workflow_resume_after_crash` - Integration test

**Run with coverage**:
```bash
pytest tests/test_checkpointing.py --cov=app.core.checkpointer --cov-fail-under=80
```

---

## Verification

### Manual Verification

1. **Check tables exist**:
```bash
psql $DATABASE_URL -c "\d checkpoints"
psql $DATABASE_URL -c "\d checkpoint_writes"
```

2. **Start workflow and check checkpoint**:
```bash
# Start Python shell
python
>>> from app.orchestrator.orchestrator import WorkflowOrchestrator
>>> import asyncio
>>> async def test():
...     orch = WorkflowOrchestrator()
...     await orch.initialize()
...     exec_id = await orch.start_workflow(template_id=1, user_id=1, inputs={})
...     print(f"Execution ID: {exec_id}")
>>> asyncio.run(test())
```

3. **Query checkpoint table**:
```sql
SELECT thread_id, checkpoint_id, checkpoint->>'current_step'
FROM checkpoints
ORDER BY checkpoint_id DESC
LIMIT 5;
```

### Performance Verification

Run performance test:
```bash
pytest tests/test_checkpointing.py::TestPostgreSQLCheckpointing::test_checkpoint_write_latency -v
```

Expected output:
```
test_checkpoint_write_latency PASSED
```

If latency exceeds 100ms, investigate:
- Database connection pool size
- Network latency (if DB on remote server)
- JSONB serialization overhead

---

## Rollback Plan

If checkpointing causes issues:

1. **Revert to in-memory** (temporary):
```python
# In orchestrator.py
self.checkpointer = await CheckpointerFactory.create(use_postgres=False)
```

2. **Rollback migration**:
```bash
alembic downgrade -1
```

3. **Remove psycopg**:
```bash
pip uninstall psycopg
pip install psycopg2-binary  # Fallback to old driver
```

---

## Dependencies

**Required Before**:
- None (this is a foundational section)

**Enables**:
- Section 05: Workflow State Management
- All workflow execution features

---

## Notes

- **Critical**: This section must complete before workflow execution can be production-ready
- **Performance**: Monitor checkpoint write latency in production; add indexes if needed
- **Scaling**: Connection pool size (max=10) is tuned for 2-3 workers; increase if scaling
- **Backup**: Checkpoint tables should be included in database backup strategy

---

## Completion Checklist

- [ ] psycopg driver conflict resolved
- [ ] Alembic migration created and run
- [ ] Checkpoint tables exist in database
- [ ] CheckpointerFactory returns AsyncPostgresSaver
- [ ] Orchestrator initialized with PostgreSQL checkpointer
- [ ] All unit tests pass
- [ ] Integration test passes
- [ ] Performance test passes (<100ms p95)
- [ ] Manual verification successful
- [ ] Documentation updated

**Estimated Completion**: 3-4 days
