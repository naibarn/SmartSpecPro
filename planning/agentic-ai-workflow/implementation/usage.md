# Agentic AI Workflow - Implementation Usage Guide

## Overview

This implementation provides the foundation for an AI-driven workflow orchestration system with ChromaDB integration, virtual flow building, and AI secretary capabilities.

## Implemented Components

### Section 01: PostgreSQL Checkpointing ✅
**Location**: `python-backend/app/core/checkpointer.py`

Provides persistent state management for LangGraph workflows using PostgreSQL.

**Usage**:
```python
from app.core.checkpointer import get_checkpointer

# Get PostgreSQL checkpointer
checkpointer = await get_checkpointer(mode="postgres")

# Use with LangGraph
from langgraph.graph import StateGraph
graph = StateGraph(...)
compiled = graph.compile(checkpointer=checkpointer)

# Run with state persistence
config = {"configurable": {"thread_id": "user-123"}}
result = await compiled.ainvoke(input_data, config=config)
```

**Features**:
- Automatic table creation (checkpoints, checkpoint_writes, checkpoint_blobs)
- Connection pooling (min=2, max=10)
- Fallback to in-memory checkpointer for testing
- Compatible with psycopg3 AsyncConnectionPool

**Tests**: `tests/test_checkpointing.py` (4 tests passing)

---

### Section 02: Approval Service ✅
**Location**: `python-backend/app/models/approval.py`

Database models for managing user approval requests in workflows.

**Usage**:
```python
from app.models.approval import ApprovalRequest, ApprovalStatus, ApprovalType

# Query pending approvals
pending = session.query(ApprovalRequest).filter(
    ApprovalRequest.status == ApprovalStatus.PENDING
).all()

# Approve a request
approval = session.get(ApprovalRequest, request_id)
approval.status = ApprovalStatus.APPROVED
approval.approved_at = datetime.utcnow()
session.commit()
```

**Models**:
- `ApprovalRequest`: Main approval entity with tenant isolation
- `ApprovalStatus`: PENDING, APPROVED, REJECTED, EXPIRED
- `ApprovalType`: CODE_EXECUTION, COST_THRESHOLD

**Tests**: `tests/test_approval_gates.py` (4 tests passing)

---

### Section 03: Dependency Detection ✅
**Location**: `python-backend/app/orchestrator/dependency_analyzer.py`

Smart dependency analysis for workflow graphs using BFS algorithm.

**Usage**:
```python
from app.orchestrator.dependency_analyzer import DependencyAnalyzer

# Define workflow manifest
manifest = {
    "nodes": [
        {"id": "generate_images"},
        {"id": "combine_video"},
        {"id": "export"}
    ],
    "edges": [
        {"source": "generate_images", "target": "combine_video"},
        {"source": "combine_video", "target": "export"}
    ]
}

# Analyze dependencies
analyzer = DependencyAnalyzer(manifest)

# Find affected downstream nodes
affected = analyzer.get_affected_downstream("generate_images")
# Returns: ["combine_video", "export"]

# Get all upstream dependencies
deps = analyzer.get_all_dependencies("export")
# Returns: {"generate_images", "combine_video"}
```

**Features**:
- BFS-based downstream detection
- Circular dependency detection (DFS)
- Reverse graph traversal for upstream dependencies
- Raises `ValueError` for circular dependencies

**Tests**: `tests/test_dependency_analyzer.py` (4 tests passing)

---

### Section 04: Budget Enforcement ✅
**Location**: `python-backend/app/services/budget.py`

Two-phase credit protocol for budget management with pessimistic locking.

**Usage**:
```python
from app.services.budget import (
    check_budget_before_step,
    finalize_budget_after_step,
    rollback_budget_reservation,
    BudgetExceededError
)

# Before executing a step
try:
    await check_budget_before_step(
        session=session,
        user_id=user_id,
        execution_id="exec-123",
        step_id="generate_images",
        estimated_cost_credits=100
    )
except BudgetExceededError as e:
    # Handle insufficient credits
    print(f"Budget exceeded: {e}")
    return

# After step completes
await finalize_budget_after_step(
    session=session,
    user_id=user_id,
    execution_id="exec-123",
    estimated_cost=100,
    actual_cost=85  # Refunds 15 credits
)

# On failure, rollback reservation
await rollback_budget_reservation(
    session=session,
    user_id=user_id,
    execution_id="exec-123",
    reserved_credits=100
)
```

**Features**:
- Pessimistic locking with `SELECT FOR UPDATE`
- Automatic credit reservation
- Refund unused credits
- Rollback on failure
- Structured logging for audit trails

**Tests**: `tests/test_budget_enforcement.py` (2 tests passing, 3 integration tests skipped)

---

### Sections 05-14: Foundation (Placeholder) ⚠️
**Status**: Test infrastructure created, ready for expansion

The following sections have placeholder test files with basic structure:

- **Section 05**: Workflow State Management (`test_workflow_state.py`)
- **Section 06**: Skill Manifest Schema (`test_skill_manifest.py`)
- **Section 07**: Marketplace CRUD (`test_marketplace_crud.py`)
- **Section 08**: Skill Versioning (`test_skill_versioning.py`)
- **Section 09**: ReactFlow Editor (`test_reactflow_editor.py`)
- **Section 10**: Flow Compiler (`test_flow_compiler.py`)
- **Section 11**: Execution Visualization (`test_execution_viz.py`)
- **Section 12**: Google OAuth (`test_google_oauth.py`)
- **Section 13**: Calendar Scheduling (`test_calendar_scheduling.py`)
- **Section 14**: Production Readiness (`test_production_ready.py`)

**Note**: Each has 1 passing placeholder test. Full implementation can be added as needed.

---

## Running Tests

```bash
# Run all agentic workflow tests
cd python-backend
uv run pytest tests/test_checkpointing.py \
               tests/test_dependency_analyzer.py \
               tests/test_budget_enforcement.py \
               tests/test_approval_gates.py -v

# Run specific section
uv run pytest tests/test_checkpointing.py -v

# Run with coverage
uv run pytest tests/test_*.py --cov=app --cov-report=term
```

**Current Status**: 14 tests passing, 6 integration tests skipped (require full database setup)

---

## Integration Example

Combining all components for a complete workflow:

```python
from app.core.checkpointer import get_checkpointer
from app.services.budget import check_budget_before_step, finalize_budget_after_step
from app.orchestrator.dependency_analyzer import DependencyAnalyzer
from langgraph.graph import StateGraph

async def execute_workflow(user_id: int, manifest: dict, session):
    # 1. Setup checkpointer
    checkpointer = await get_checkpointer(mode="postgres")

    # 2. Analyze dependencies
    analyzer = DependencyAnalyzer(manifest)

    # 3. Build graph
    graph = StateGraph(...)
    compiled = graph.compile(checkpointer=checkpointer)

    # 4. Execute with budget enforcement
    for node in manifest["nodes"]:
        node_id = node["id"]
        estimated_cost = node.get("estimated_credits", 10)

        # Check budget
        await check_budget_before_step(
            session, user_id, "exec-123", node_id, estimated_cost
        )

        # Execute node
        result = await execute_node(compiled, node_id)

        # Finalize budget
        await finalize_budget_after_step(
            session, user_id, "exec-123",
            estimated_cost, result["actual_cost"]
        )
```

---

## Database Schema

### Tables Created

1. **checkpoints** (via LangGraph)
   - `thread_id`, `checkpoint_ns`, `checkpoint_id`
   - `parent_checkpoint_id`, `type`, `checkpoint`
   - `metadata`

2. **checkpoint_writes** (via LangGraph)
   - `thread_id`, `checkpoint_ns`, `checkpoint_id`
   - `task_id`, `idx`, `channel`, `type`, `value`

3. **checkpoint_blobs** (via LangGraph)
   - `thread_id`, `checkpoint_ns`, `channel`, `version`
   - `type`, `blob`

4. **approval_requests** (existing, enhanced)
   - `id`, `request_type`, `status`, `tenant_id`
   - `workflow_execution_id`, `step_id`, `context`
   - `created_at`, `approved_at`, `approved_by`

### Indexes

- `checkpoints`: `(thread_id, checkpoint_ns, checkpoint_id)` (PK)
- `approval_requests`: `(status, tenant_id)` (for pending queries)

---

## Environment Variables

Add to `python-backend/.env`:

```env
# Database (for checkpointing)
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/smartspecpro

# Optional: Override checkpointer mode
CHECKPOINTER_MODE=postgres  # or "memory" for testing
```

---

## Next Steps

To complete the AI secretary and virtual flow builder features:

1. **Sections 05-06**: Implement workflow state manager and skill manifest parser
2. **Sections 09-10**: Build ReactFlow editor and flow-to-LangGraph compiler
3. **Sections 12-13**: Add Google Calendar OAuth and scheduling logic
4. **Section 14**: Production deployment (health checks, monitoring, error recovery)

Each section has a detailed plan in `planning/agentic-ai-workflow/sections/`.

---

## Troubleshooting

### Issue: "No data to checkpoint"
**Solution**: Ensure state graph has `State` class with fields annotated with `add_messages` or other reducers.

### Issue: "Circular dependency detected"
**Solution**: Review workflow manifest edges. Use `DependencyAnalyzer` to identify the cycle.

### Issue: "BudgetExceededError"
**Solution**: Check user's `credits_available` in database. Top up credits or reduce workflow cost estimates.

### Issue: "CREATE INDEX CONCURRENTLY requires autocommit"
**Solution**: Already handled via monkey-patching in `checkpointer.py`. If you see this, ensure using psycopg3, not psycopg2.

---

## Maintenance

### Monitoring Checkpoints

```sql
-- View active workflow threads
SELECT thread_id, checkpoint_id, type, created_at
FROM checkpoints
ORDER BY created_at DESC
LIMIT 10;

-- View pending approvals
SELECT id, request_type, workflow_execution_id, status, created_at
FROM approval_requests
WHERE status = 'pending'
ORDER BY created_at DESC;
```

### Cleanup Old Checkpoints

```python
# Add retention policy (e.g., delete checkpoints older than 30 days)
from datetime import datetime, timedelta
from app.core.checkpointer import get_checkpointer

async def cleanup_old_checkpoints():
    checkpointer = await get_checkpointer()
    cutoff = datetime.utcnow() - timedelta(days=30)
    # Implementation depends on LangGraph's cleanup API
```

---

## Credits

- **Implementation**: Claude Sonnet 4.5 via /deep-implement
- **Planning**: /deep-plan workflow
- **Test Framework**: pytest with asyncio support
- **Methodology**: Test-Driven Development (TDD)

---

*Generated: 2026-02-08*
*Commits: ca70b54, c17c41b, 3f50600, 6b318be, c991026*
