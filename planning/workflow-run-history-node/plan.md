# Implementation Plan: `run_history` Workflow Node Executor

## Problem Statement

Workflow developers need a way to record, list, load, and replay execution state
at specific points within a workflow. This enables three core use cases:

1. **Debugging** -- record state before and after critical operations so developers
   can inspect what data was flowing through the graph at any checkpoint.
2. **Recovery** -- when a workflow fails partway through, replay from the last
   known good checkpoint instead of restarting from scratch.
3. **Testing** -- capture production execution state and replay it in a development
   environment to reproduce issues.

The existing `CheckpointManager` (file-based) and `CheckpointModel` (SQLAlchemy)
are used by the legacy orchestrator. The LangGraph runtime uses its own PostgreSQL
checkpointer via `langgraph-checkpoint-postgres`. Neither of these is exposed as a
user-controllable workflow node. This plan introduces a `run_history` node type
that gives workflow authors explicit control over checkpoint placement.

---

## Affected Files

### New Files (5)

| # | File | Purpose |
|---|------|---------|
| 1 | `python-backend/app/models/workflow_checkpoint.py` | SQLAlchemy model for `workflow_execution_checkpoints` table |
| 2 | `python-backend/app/orchestrator/node_executors/flow_executors/run_history_executor.py` | Executor implementation (4 operations) |
| 3 | `python-backend/app/services/checkpoint_service.py` | Async service layer for checkpoint CRUD + replay |
| 4 | `python-backend/tests/unit/orchestrator/test_run_history_executor.py` | Unit tests for executor |
| 5 | `python-backend/tests/unit/services/test_checkpoint_service.py` | Unit tests for service layer |

### Modified Files (3)

| # | File | Change |
|---|------|--------|
| 1 | `python-backend/app/orchestrator/node_registry.py` | Register `run_history` node type |
| 2 | `python-backend/app/models/all_models.py` | Import `WorkflowExecutionCheckpoint` model |
| 3 | `python-backend/app/core/database.py` | Import the new model module in `init_db()` |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| State data exceeds 1 MB limit | Medium | Enforce size check before INSERT; return error to workflow |
| Too many checkpoints degrade query performance | Low | Per-workflow limit (default 10) with auto-cleanup; B-tree index on `(workflow_id, created_at)` |
| Replay from stale checkpoint causes data inconsistency | Medium | Replay returns state data only; the orchestrator decides whether to re-execute. Mark replayed checkpoints with metadata |
| JSON serialization fails for non-serializable state | Medium | Use `json.dumps` with `default=str` fallback; catch and report serialization errors |
| New table migration on production | Low | Nullable columns only; ADD TABLE is safe (no existing data at risk) |

---

## 1. Database Schema: `workflow_execution_checkpoints`

### SQLAlchemy Model

File: `python-backend/app/models/workflow_checkpoint.py`

```python
"""SQLAlchemy model for workflow execution checkpoints.

Provides persistent storage for user-controlled checkpoint nodes
within the workflow editor.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    JSON,
    String,
    Text,
)

from app.core.database import Base


class WorkflowExecutionCheckpoint(Base):
    """Stores execution state snapshots at user-defined checkpoint nodes."""

    __tablename__ = "workflow_execution_checkpoints"

    # Primary key -- UUID string
    id = Column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # Workflow reference (Workflow.id is Integer in workflows table)
    workflow_id = Column(Integer, nullable=False, index=True)

    # Execution reference (WorkflowExecution.id is String(20))
    execution_id = Column(String(20), nullable=False, index=True)

    # User-assigned checkpoint name (unique per workflow)
    checkpoint_name = Column(String(255), nullable=False)

    # Serialized state snapshot (max 1 MB enforced at application layer)
    state_data = Column(JSON, nullable=True)

    # Serialized node output data
    node_data = Column(JSON, nullable=True)

    # Size of state_data in bytes (for monitoring and limit enforcement)
    state_size_bytes = Column(Integer, nullable=False, default=0)

    # Metadata
    node_id = Column(String(255), nullable=True)  # Node that created the checkpoint
    created_by_user_id = Column(Integer, nullable=True)
    tenant_id = Column(String(36), nullable=True)

    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        # Unique constraint: one checkpoint name per workflow
        Index(
            "uq_wec_workflow_checkpoint_name",
            "workflow_id",
            "checkpoint_name",
            unique=True,
        ),
        # Query pattern: list checkpoints for a workflow, newest first
        Index(
            "ix_wec_workflow_created",
            "workflow_id",
            "created_at",
        ),
        # Query pattern: list checkpoints for an execution
        Index(
            "ix_wec_execution",
            "execution_id",
        ),
        # Tenant isolation
        Index(
            "ix_wec_tenant",
            "tenant_id",
        ),
    )

    def to_dict(self) -> dict:
        """Convert to API response dictionary."""
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "execution_id": self.execution_id,
            "checkpoint_name": self.checkpoint_name,
            "state_size_bytes": self.state_size_bytes,
            "node_id": self.node_id,
            "created_by_user_id": self.created_by_user_id,
            "tenant_id": self.tenant_id,
            "created_at": (
                self.created_at.isoformat() + "Z" if self.created_at else None
            ),
            # state_data and node_data are intentionally excluded from the
            # default dict to avoid large payloads in list responses.
            # Use to_full_dict() when the caller needs state.
        }

    def to_full_dict(self) -> dict:
        """Convert to dictionary including state and node data."""
        d = self.to_dict()
        d["state_data"] = self.state_data
        d["node_data"] = self.node_data
        return d
```

### Alembic Migration Notes

- **Risk level**: Low (new table, no existing data affected).
- **Migration command**: `cd python-backend && alembic revision --autogenerate -m "add_workflow_execution_checkpoints" && alembic upgrade head`
- **Alternatively**: Use `init_db()` for dev environments since the model extends `Base`.
- No backup required (new table).

---

## 2. Service Layer: `CheckpointService`

File: `python-backend/app/services/checkpoint_service.py`

This service encapsulates all database operations for checkpoints. The executor
delegates to this service so the executor itself stays thin and testable.

### Interface

```python
class CheckpointService:
    """Async service for workflow execution checkpoint management."""

    MAX_CHECKPOINT_SIZE_BYTES = 1_048_576  # 1 MB
    DEFAULT_MAX_CHECKPOINTS = 10

    async def record_checkpoint(
        self,
        db: AsyncSession,
        *,
        workflow_id: int,
        execution_id: str,
        checkpoint_name: str,
        state_data: dict | None,
        node_data: dict | None,
        node_id: str | None = None,
        user_id: int | None = None,
        tenant_id: str | None = None,
        max_checkpoints: int = DEFAULT_MAX_CHECKPOINTS,
    ) -> dict:
        """Record a new checkpoint.

        Steps:
        1. Serialize state_data and node_data to JSON.
        2. Enforce 1 MB size limit.
        3. Upsert (update if same checkpoint_name exists for this workflow).
        4. Auto-delete oldest checkpoints if count exceeds max_checkpoints.
        5. Return checkpoint metadata dict.

        Returns:
            {"checkpointId": str, "success": True, "state_size_bytes": int}

        Raises:
            ValueError: If serialized state exceeds 1 MB.
        """

    async def list_checkpoints(
        self,
        db: AsyncSession,
        *,
        workflow_id: int,
        tenant_id: str | None = None,
    ) -> list[dict]:
        """List all checkpoints for a workflow, newest first.

        Returns:
            List of checkpoint metadata dicts (without state_data/node_data).
        """

    async def load_checkpoint(
        self,
        db: AsyncSession,
        *,
        checkpoint_name: str,
        workflow_id: int,
        tenant_id: str | None = None,
    ) -> dict | None:
        """Load a checkpoint by name.

        Returns:
            Full checkpoint dict including state_data and node_data,
            or None if not found.
        """

    async def replay_from(
        self,
        db: AsyncSession,
        *,
        checkpoint_name: str,
        workflow_id: int,
        tenant_id: str | None = None,
    ) -> dict | None:
        """Load checkpoint state for replay.

        Identical to load_checkpoint but adds replay metadata:
        - replayed_at timestamp
        - replay_source_checkpoint_id

        The actual re-execution is handled by the orchestrator;
        this method just provides the state to replay from.

        Returns:
            Full checkpoint dict with replay metadata, or None if not found.
        """

    async def _enforce_max_checkpoints(
        self,
        db: AsyncSession,
        workflow_id: int,
        max_checkpoints: int,
    ) -> int:
        """Delete oldest checkpoints beyond the limit.

        Returns:
            Number of checkpoints deleted.
        """
```

### Key Implementation Details

1. **Size enforcement**: Serialize `state_data` and `node_data` via `json.dumps(data, default=str)`,
   measure `len(serialized.encode("utf-8"))`. Reject if > 1 MB.

2. **Upsert semantics**: Use PostgreSQL `INSERT ... ON CONFLICT (workflow_id, checkpoint_name) DO UPDATE`
   so re-recording the same checkpoint name overwrites the previous snapshot.

3. **Auto-cleanup**: After each `record_checkpoint`, query count for the workflow.
   If count > `max_checkpoints`, delete the oldest rows beyond the limit using:
   ```sql
   DELETE FROM workflow_execution_checkpoints
   WHERE id IN (
       SELECT id FROM workflow_execution_checkpoints
       WHERE workflow_id = :wf_id
       ORDER BY created_at ASC
       LIMIT :excess_count
   )
   ```

4. **Tenant isolation**: All queries filter by `tenant_id` when provided to prevent
   cross-tenant checkpoint access.

---

## 3. Executor: `RunHistoryExecutor`

File: `python-backend/app/orchestrator/node_executors/flow_executors/run_history_executor.py`

### Class Structure

```python
class RunHistoryExecutor:
    """Executor for run_history nodes.

    Supports four operations:
    - record_checkpoint: Save current execution state
    - list_checkpoints: List available checkpoints for the workflow
    - load_checkpoint: Load state from a specific checkpoint
    - replay_from: Load state for replay from a checkpoint
    """

    VALID_OPERATIONS = {
        "record_checkpoint",
        "list_checkpoints",
        "load_checkpoint",
        "replay_from",
    }

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Route to the appropriate operation handler."""
        config = data.config
        operation = config.get("operation", "record_checkpoint")

        if operation not in self.VALID_OPERATIONS:
            return {
                "success": False,
                "checkpointId": None,
                "checkpoints": [],
                "state": None,
                "error": f"Invalid operation: {operation}. "
                         f"Must be one of: {', '.join(sorted(self.VALID_OPERATIONS))}",
            }

        # Get database session from context
        db = context.extra_data.get("db_session")
        if db is None:
            return {
                "success": False,
                "error": "Database session not available in execution context.",
            }

        handler = getattr(self, f"_op_{operation}")
        return await handler(data, context, db)

    async def _op_record_checkpoint(self, data, context, db) -> dict:
        """Handle record_checkpoint operation."""
        ...

    async def _op_list_checkpoints(self, data, context, db) -> dict:
        """Handle list_checkpoints operation."""
        ...

    async def _op_load_checkpoint(self, data, context, db) -> dict:
        """Handle load_checkpoint operation."""
        ...

    async def _op_replay_from(self, data, context, db) -> dict:
        """Handle replay_from operation."""
        ...
```

### Operation Output Mapping

Each operation populates the output ports differently:

| Operation | `checkpointId` | `checkpoints` | `state` | `success` |
|-----------|----------------|---------------|---------|-----------|
| `record_checkpoint` | UUID string | `[]` | `None` | `True/False` |
| `list_checkpoints` | `None` | `[{...}, ...]` | `None` | `True` |
| `load_checkpoint` | Loaded ID | `[]` | `{state_data, node_data}` | `True/False` |
| `replay_from` | Source ID | `[]` | `{state_data, node_data, replay_metadata}` | `True/False` |

### Error Handling

The executor never raises exceptions. All errors are returned in the output dict:

```python
return {
    "success": False,
    "checkpointId": None,
    "checkpoints": [],
    "state": None,
    "error": "Human-readable error message",
}
```

---

## 4. Node Registry Entry

Add to `_register_core_nodes()` in `python-backend/app/orchestrator/node_registry.py`:

```python
# Run History (Execution Replay)
self.register_node_type(
    NodeTypeSpec(
        type="run_history",
        display_name="Run History",
        description="Record, list, load, or replay execution checkpoints for debugging and recovery",
        icon="history",
        color="slate",
        category="flow_control",
        inputs=[
            InputSpec(
                name="operation",
                display_name="Operation",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="record_checkpoint",
                options=[
                    {"label": "Record Checkpoint", "value": "record_checkpoint"},
                    {"label": "List Checkpoints", "value": "list_checkpoints"},
                    {"label": "Load Checkpoint", "value": "load_checkpoint"},
                    {"label": "Replay From Checkpoint", "value": "replay_from"},
                ],
            ),
            InputSpec(
                name="checkpointName",
                display_name="Checkpoint Name",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="pre-llm-call, after-validation, final-state...",
                validation={"max_length": 255},
            ),
            InputSpec(
                name="includeState",
                display_name="Include Workflow State",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
            InputSpec(
                name="includeData",
                display_name="Include Node Data",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
            InputSpec(
                name="maxCheckpoints",
                display_name="Max Checkpoints Per Workflow",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 100},
            ),
        ],
        outputs=[
            OutputSpec(
                name="checkpointId",
                display_name="Checkpoint ID",
                data_type="text",
            ),
            OutputSpec(
                name="checkpoints",
                display_name="Checkpoints List",
                data_type="array",
            ),
            OutputSpec(
                name="state",
                display_name="Checkpoint State",
                data_type="json",
            ),
            OutputSpec(
                name="success",
                display_name="Success",
                data_type="boolean",
            ),
        ],
        executor="app.orchestrator.node_executors.flow_executors.run_history_executor.RunHistoryExecutor",
    )
)
```

---

## 5. Operation Details

### 5.1 `record_checkpoint`

**Required inputs**: `checkpointName`

**Logic**:
1. Validate `checkpointName` is non-empty (max 255 chars).
2. Build state snapshot:
   - If `includeState` is True: capture `data.state` (full workflow state dict).
   - If `includeData` is True: capture `data.inputs` and node outputs from `data.state`.
3. Serialize to JSON, check size <= 1 MB.
4. Call `CheckpointService.record_checkpoint()`.
5. Return `checkpointId` and `success`.

**Auto-cleanup**: After recording, enforce `maxCheckpoints` limit by deleting
the oldest checkpoints for this workflow beyond the configured maximum.

### 5.2 `list_checkpoints`

**Required inputs**: None (uses `workflow_id` from context).

**Logic**:
1. Call `CheckpointService.list_checkpoints()`.
2. Return array of checkpoint metadata (id, name, created_at, state_size_bytes).
3. Does not return state_data or node_data (use load_checkpoint for that).

### 5.3 `load_checkpoint`

**Required inputs**: `checkpointName`

**Logic**:
1. Validate `checkpointName` is non-empty.
2. Call `CheckpointService.load_checkpoint()`.
3. If found: return full state including `state_data` and `node_data`.
4. If not found: return `success: False` with error message.

### 5.4 `replay_from`

**Required inputs**: `checkpointName`

**Logic**:
1. Load the checkpoint (same as `load_checkpoint`).
2. Add replay metadata: `replayed_at`, `replay_execution_id`, `source_checkpoint_id`.
3. The returned state object can be used by the orchestrator to reset execution
   state to the checkpoint and re-run from that point.
4. **Important**: The executor itself does NOT trigger re-execution. It provides
   the state data; the orchestrator or a downstream node decides what to do with it.

---

## 6. Data Flow Diagram

```
Workflow Execution
        |
        v
  [Node A: LLM Call]
        |
        v
  [run_history: record_checkpoint]   <-- checkpointName="after-llm"
        |                                 Saves: state + node_data
        |                                 Returns: checkpointId
        v
  [Node B: Image Gen]
        |
        v (on failure)
  [run_history: load_checkpoint]     <-- checkpointName="after-llm"
        |                                 Returns: state from checkpoint
        v
  [Retry / Branch logic]
```

---

## 7. Implementation Order

Execute these steps in sequence. Each step should be committed and tested
before proceeding to the next.

### Step 1: Database Model
- [ ] Create `python-backend/app/models/workflow_checkpoint.py`
- [ ] Add import to `python-backend/app/models/all_models.py`
- [ ] Add import to `python-backend/app/core/database.py` `init_db()`
- [ ] Generate and run Alembic migration
- [ ] Verify table exists with correct indexes

### Step 2: Service Layer
- [ ] Create `python-backend/app/services/checkpoint_service.py`
- [ ] Implement `record_checkpoint` with size enforcement and upsert
- [ ] Implement `list_checkpoints` with tenant filtering
- [ ] Implement `load_checkpoint` with full state retrieval
- [ ] Implement `replay_from` with replay metadata
- [ ] Implement `_enforce_max_checkpoints` cleanup
- [ ] Write unit tests: `python-backend/tests/unit/services/test_checkpoint_service.py`

### Step 3: Executor
- [ ] Create `python-backend/app/orchestrator/node_executors/flow_executors/run_history_executor.py`
- [ ] Implement operation routing (`execute` method)
- [ ] Implement `_op_record_checkpoint`
- [ ] Implement `_op_list_checkpoints`
- [ ] Implement `_op_load_checkpoint`
- [ ] Implement `_op_replay_from`
- [ ] Write unit tests: `python-backend/tests/unit/orchestrator/test_run_history_executor.py`

### Step 4: Registry Integration
- [ ] Add `run_history` NodeTypeSpec to `node_registry.py` `_register_core_nodes()`
- [ ] Verify node appears in `/api/v1/workflows/node-types` response
- [ ] Verify frontend renders the node in the palette

### Step 5: Integration Testing
- [ ] End-to-end test: record checkpoint -> list checkpoints -> load checkpoint
- [ ] Test auto-cleanup when exceeding maxCheckpoints
- [ ] Test 1 MB size limit enforcement
- [ ] Test tenant isolation (checkpoint from tenant A not visible to tenant B)
- [ ] Test upsert semantics (re-recording same checkpoint name)

---

## 8. Test Plan

### Unit Tests: CheckpointService

| Test | Description |
|------|-------------|
| `test_record_checkpoint_basic` | Records a checkpoint and verifies it is saved with correct fields |
| `test_record_checkpoint_upsert` | Re-recording same name overwrites previous checkpoint |
| `test_record_checkpoint_size_limit` | Rejects state_data exceeding 1 MB |
| `test_record_checkpoint_auto_cleanup` | Auto-deletes oldest when exceeding max_checkpoints |
| `test_list_checkpoints_empty` | Returns empty list for workflow with no checkpoints |
| `test_list_checkpoints_ordered` | Returns checkpoints newest-first |
| `test_list_checkpoints_tenant_isolation` | Only returns checkpoints for the specified tenant |
| `test_load_checkpoint_found` | Returns full state when checkpoint exists |
| `test_load_checkpoint_not_found` | Returns None when checkpoint name does not exist |
| `test_replay_from_adds_metadata` | Replay response includes replayed_at and source info |
| `test_replay_from_not_found` | Returns None when checkpoint does not exist |

### Unit Tests: RunHistoryExecutor

| Test | Description |
|------|-------------|
| `test_invalid_operation` | Returns error for unknown operation |
| `test_no_db_session` | Returns error when db_session not in context |
| `test_record_missing_name` | Returns error when checkpointName is empty |
| `test_record_success` | Records checkpoint and returns checkpointId |
| `test_list_success` | Lists checkpoints and returns array |
| `test_load_success` | Loads checkpoint and returns state |
| `test_load_not_found` | Returns success=False when checkpoint not found |
| `test_replay_success` | Loads checkpoint with replay metadata |
| `test_include_state_false` | Records checkpoint without state_data |
| `test_include_data_false` | Records checkpoint without node_data |

---

## 9. Security Considerations

1. **Tenant isolation**: All checkpoint queries MUST filter by `tenant_id`. A user
   in tenant A must never be able to load a checkpoint from tenant B.

2. **Size limits**: The 1 MB limit prevents a single node from consuming excessive
   database storage. The `state_size_bytes` column enables monitoring.

3. **No code execution**: The `replay_from` operation returns data only. It does
   NOT execute arbitrary code or re-trigger workflow nodes directly. The
   orchestrator is responsible for deciding how to use the replayed state.

4. **Checkpoint name validation**: Enforce max 255 characters, alphanumeric +
   hyphens + underscores only. Prevent injection via checkpoint names.

5. **Rate limiting**: Checkpoint operations go through the normal workflow
   execution rate limiter. No additional rate limiting is needed.

---

## 10. Relationship to Existing Checkpointing

The system already has three checkpointing mechanisms:

| System | Storage | Scope | User Control |
|--------|---------|-------|--------------|
| `CheckpointManager` (legacy) | Filesystem JSON | Per execution step | None (automatic) |
| `CheckpointModel` (legacy) | PostgreSQL | Per execution step | None (automatic) |
| LangGraph `checkpointer` | PostgreSQL (via langgraph-checkpoint-postgres) | Per graph state update | None (automatic) |
| **`run_history` node (NEW)** | PostgreSQL (`workflow_execution_checkpoints`) | **User-defined points** | **Full (explicit node placement)** |

The `run_history` node is complementary to existing systems:
- LangGraph's checkpointer handles graph-level state persistence for interrupt/resume.
- The `run_history` node gives workflow authors explicit, named snapshots at
  semantically meaningful points they choose.

There is no duplication or conflict. The new table is separate from all existing
checkpoint storage.

---

## 11. Frontend Integration Notes

The `run_history` node will appear automatically in the workflow editor palette
because the frontend fetches node types from the backend registry via
`GET /api/v1/workflows/node-types`. No frontend code changes are needed for
basic functionality.

The node will render with:
- **Icon**: `history` (Lucide)
- **Color**: `slate`
- **Category**: `flow_control`
- **Inputs**: Operation selector, checkpoint name text field, two toggles, number input
- **Outputs**: Four ports (checkpointId, checkpoints, state, success)

For enhanced UX (e.g., a checkpoint browser panel), future work could add a
dedicated frontend component, but that is out of scope for this plan.
