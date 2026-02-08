Now I have all the context I need. Let me write the section file.

# Section 14: API Endpoint Updates

## Overview

This section updates the Python FastAPI endpoints in `/python-backend/app/api/workflows.py` to use the new `LangGraphRuntime` and `WorkflowCompiler` from Section 01, and adds new endpoints for Dead Letter Queue management. It also updates the Node.js tRPC proxy router in `/apps/web/server/routers/workflow.ts` to proxy the new and modified endpoints to the Python backend.

The existing endpoint structure is preserved (same URL prefix `/api/v1/workflows/`) to maintain backward compatibility with the frontend. The key changes are:

1. **`POST /compile`** -- Switch from `FlowCompiler` to `WorkflowCompiler`
2. **`POST /execute`** -- Use `LangGraphRuntime.execute()` with `workflow_executions` table tracking
3. **`GET /execute/{id}/stream`** -- Replace mock SSE with `astream_events` translation (detailed streaming spec is in Section 02; this section wires the endpoint)
4. **`POST /execute/{id}/resume`** -- Use `LangGraphRuntime.resume()` for HITL (detailed HITL spec is in Section 03; this section wires the endpoint)
5. **`GET /node-types`** -- No code changes needed; auto-serves from expanded registry
6. **`GET /dlq`** (new) -- List Dead Letter Queue items for the current tenant
7. **`POST /dlq/{id}/reprocess`** (new) -- Reprocess a DLQ item

### Dependencies

- **Section 01 (LangGraph Runtime Core)**: Provides `LangGraphRuntime`, `WorkflowCompiler`, `CompilationError`, `node_adapter.make_langgraph_node`
- **Section 13 (Database Schema)**: Provides `workflow_executions` and `workflow_dead_letter_queue` tables

---

## Endpoint Specifications

### 1. `POST /api/v1/workflows/compile`

**Purpose**: Compile ReactFlow JSON into a validated LangGraph-compatible manifest using the new `WorkflowCompiler`.

**Request Schema (Pydantic)**:

```python
# File: /home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py

class FlowCompileRequest(BaseModel):
    """Request to compile ReactFlow JSON to workflow manifest."""
    nodes: list[dict[str, Any]] = Field(
        ..., description="ReactFlow nodes", max_length=MAX_NODES
    )
    edges: list[dict[str, Any]] = Field(
        ..., description="ReactFlow edges", max_length=MAX_EDGES
    )
    metadata: dict[str, Any] | None = Field(
        default=None, description="Manifest metadata"
    )
```

*No schema change from current.* The request body remains identical.

**Response Schema**:

```python
class FlowCompileResponse(BaseModel):
    """Response from flow compilation."""
    success: bool
    manifest: dict[str, Any] | None = None
    errors: list[str] | None = None  # NEW: list of specific validation errors
    warnings: list[str] | None = None  # NEW: non-fatal warnings (e.g., unreachable nodes)
    error: str | None = None  # KEPT: backward-compat single error string
```

**Changes**: The `errors` field is added to return multiple validation failures from the new compiler (e.g., cycle detected AND missing trigger). The `warnings` field surfaces non-fatal issues like unreachable nodes. The old `error` field is kept for backward compatibility -- it is set to the first error in `errors` if present.

**Authentication**: `Depends(get_current_user)` -- requires valid Bearer JWT.

**Error Responses**:
- `200` with `success: false` and `errors` list -- compilation validation failures
- `401` -- missing or invalid JWT
- `500` -- unexpected internal error

**Implementation Change**:

```python
@router.post("/compile", response_model=FlowCompileResponse)
async def compile_flow(
    request: FlowCompileRequest,
    current_user: User = Depends(get_current_user),
):
    """Compile ReactFlow JSON to LangGraph-compatible workflow manifest."""
    try:
        flow_json = {"nodes": request.nodes, "edges": request.edges}
        metadata = request.metadata or {}
        if "author" not in metadata:
            metadata["author"] = current_user.email or "user@smartspecpro.com"

        # NEW: Use WorkflowCompiler instead of FlowCompiler
        from app.orchestrator.workflow_compiler import WorkflowCompiler, CompilationError

        compiler = WorkflowCompiler()
        result = compiler.compile(flow_json, metadata=metadata)

        return FlowCompileResponse(
            success=True,
            manifest=result.manifest,
            warnings=result.warnings or None,
        )

    except CompilationError as e:
        logger.warning(
            "flow_compilation_failed",
            user_id=current_user.id,
            errors=e.errors,
        )
        return FlowCompileResponse(
            success=False,
            errors=e.errors,
            error=e.errors[0] if e.errors else str(e),
        )
    except Exception as e:
        logger.exception("flow_compilation_unexpected_error", user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Internal compilation error.") from e
```

---

### 2. `POST /api/v1/workflows/execute`

**Purpose**: Start workflow execution using `LangGraphRuntime.execute()`, create a tracking record in `workflow_executions`, and return execution ID.

**Request Schema**:

```python
class ExecuteWorkflowRequest(BaseModel):
    """Request to execute a compiled workflow."""
    workflowJson: dict[str, Any] = Field(
        ..., description="Compiled workflow JSON with _compiledMetadata"
    )
    input_data: dict[str, Any] | None = Field(
        default=None,
        description="Optional input data for the trigger node",
    )
```

**Response Schema** (unchanged):

```python
class ExecuteWorkflowResponse(BaseModel):
    """Response from workflow execution start."""
    executionId: str
    status: str  # "running" or "pending"
    startedAt: str
```

**Authentication**: `Depends(get_current_user)` -- requires valid Bearer JWT.

**Error Responses**:
- `400` -- workflow not compiled (missing `_compiledMetadata`)
- `401` -- missing or invalid JWT
- `402` -- insufficient credits
- `500` -- internal error

**Implementation Change**:

```python
@router.post("/execute", response_model=ExecuteWorkflowResponse)
async def execute_workflow(
    request: ExecuteWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a compiled workflow using LangGraphRuntime."""
    workflow_json = request.workflowJson

    # 1. Validate workflow is compiled
    if "_compiledMetadata" not in workflow_json:
        raise HTTPException(status_code=400, detail="Workflow has not been compiled.")

    # 2. Estimate cost and check credits (existing logic preserved)
    cost_estimator = CostEstimator()
    cost_result = cost_estimator.estimate(workflow_json)
    estimated_cost = cost_result["total"]
    user_balance = getattr(current_user, "creditBalance", 100.0)
    if estimated_cost > user_balance:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Required: {estimated_cost:.2f}, Balance: {user_balance:.2f}",
        )

    # 3. Create execution record in workflow_executions table
    execution_id = f"exec-{uuid.uuid4().hex[:12]}"
    started_at = datetime.utcnow()

    from app.models.workflow_execution import WorkflowExecution  # SQLAlchemy model

    execution_record = WorkflowExecution(
        id=execution_id,
        workflow_id=workflow_json.get("id"),
        tenant_id=current_user.currentTenantId,
        user_id=current_user.id,
        status="running",
        input_data=request.input_data or {},
        started_at=started_at,
        node_count=len(workflow_json.get("nodes", [])),
    )
    db.add(execution_record)
    await db.commit()

    # 4. Start execution in background task (non-blocking)
    from app.orchestrator.langgraph_runtime import get_langgraph_runtime

    runtime = get_langgraph_runtime()
    config = {
        "configurable": {
            "thread_id": f"{current_user.currentTenantId}:{execution_id}",
            "user_id": current_user.id,
            "tenant_id": current_user.currentTenantId,
            "workflow_id": workflow_json.get("id"),
            "execution_id": execution_id,
            "credits_available": user_balance,
        }
    }

    # Fire-and-forget execution (results streamed via SSE)
    asyncio.create_task(
        runtime.execute(workflow_json, request.input_data or {}, config)
    )

    logger.info(
        "workflow_execution_started",
        execution_id=execution_id,
        user_id=current_user.id,
        estimated_cost=estimated_cost,
    )

    return ExecuteWorkflowResponse(
        executionId=execution_id,
        status="running",
        startedAt=started_at.isoformat() + "Z",
    )
```

---

### 3. `GET /api/v1/workflows/execute/{execution_id}/stream`

**Purpose**: SSE endpoint that translates LangGraph `astream_events` into the existing frontend SSE protocol. The detailed event mapping logic is specified in Section 02 (Streaming Integration). This section defines the endpoint wiring.

**Path Parameters**:
- `execution_id` (string, required): Execution ID in format `exec-{12 hex chars}`

**Query Parameters**:
- `lastEventId` (string, optional): Last event ID for reconnection replay (fallback for `Last-Event-ID` header)

**Headers**:
- `Authorization: Bearer {token}` -- JWT authentication
- `Last-Event-ID` (optional) -- SSE reconnection header

**Response**: `text/event-stream` with events:

```
event: node_start
data: {"event_type":"node_start","event_id":"...","timestamp":"...","node_id":"...","node_name":"..."}
id: {event_id}

event: node_complete
data: {"event_type":"node_complete","event_id":"...","timestamp":"...","node_id":"...","node_name":"...","output":{...},"duration_ms":...}
id: {event_id}

event: node_error
data: {"event_type":"node_error","event_id":"...","timestamp":"...","node_id":"...","node_name":"...","error":"..."}
id: {event_id}

event: token
data: {"node_id":"...","token":"..."}
id: {event_id}

event: approval_required
data: {"node_id":"...","message":"...","options":[...],"timeout_minutes":...}
id: {event_id}

event: workflow_complete
data: {"event_type":"workflow_complete","execution_id":"...","total_duration_ms":...,"node_results":{...}}
id: {event_id}

event: error
data: {"error":"Internal execution error"}

```

**Authentication**: `Depends(get_current_user)` -- same as current.

**Error Responses**:
- `400` -- invalid execution_id format
- `401` -- missing or invalid JWT
- `404` -- execution not found or does not belong to user's tenant

**Implementation Change**: Replace mock events with actual `astream_events` translation.

```python
@router.get("/execute/{execution_id}/stream")
async def stream_workflow_execution(
    execution_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    lastEventId: Optional[str] = None,
):
    """SSE endpoint for real-time workflow execution visualization."""
    # Validate execution_id format
    EXECUTION_ID_PATTERN = re.compile(r"^exec-[a-f0-9]{12}$")
    if not execution_id or not EXECUTION_ID_PATTERN.match(execution_id):
        raise HTTPException(status_code=400, detail="Invalid execution_id format")

    # Validate and resolve Last-Event-ID
    SAFE_EVENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,200}$")
    effective_last_event_id = last_event_id or lastEventId
    if effective_last_event_id and not SAFE_EVENT_ID_PATTERN.match(effective_last_event_id):
        effective_last_event_id = None

    # Verify execution exists and belongs to user's tenant
    from app.models.workflow_execution import WorkflowExecution

    result = await db.execute(
        select(WorkflowExecution).where(
            WorkflowExecution.id == execution_id,
            WorkflowExecution.tenant_id == current_user.currentTenantId,
        )
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    # Get the runtime's event stream translator
    from app.orchestrator.langgraph_runtime import get_langgraph_runtime
    from app.orchestrator.stream_translator import StreamTranslator  # Section 02

    runtime = get_langgraph_runtime()
    translator = StreamTranslator()

    async def event_generator():
        """Generate SSE events by translating astream_events."""
        try:
            # Replay missed events on reconnection
            if effective_last_event_id:
                ring_buffer = runtime.get_event_buffer(execution_id)
                if ring_buffer:
                    missed = ring_buffer.get_events_since(effective_last_event_id)
                    for event in missed:
                        yield event.to_sse_string()

            # Stream live events from LangGraph runtime
            thread_id = f"{current_user.currentTenantId}:{execution_id}"
            async for sse_event in translator.translate_stream(
                runtime, thread_id, execution_id
            ):
                yield sse_event

        except asyncio.CancelledError:
            logger.info("sse_connection_cancelled", execution_id=execution_id)
        except Exception as e:
            logger.exception("sse_stream_error", execution_id=execution_id)
            import json
            yield f"event: error\ndata: {json.dumps({'error': 'Internal execution error'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

---

### 4. `POST /api/v1/workflows/execute/{execution_id}/resume`

**Purpose**: Resume a workflow that is paused at an `interrupt()` point (HITL approval gate). Uses `LangGraphRuntime.resume()`. The detailed HITL mechanics are in Section 03.

**Request Schema**:

```python
class ResumeWorkflowRequest(BaseModel):
    """Request to resume a paused workflow (HITL response)."""
    response: dict[str, Any] = Field(
        ..., description="User response to the interrupt (e.g., {'approved': true, 'comment': '...'})"
    )
```

**Response Schema**:

```python
class ResumeWorkflowResponse(BaseModel):
    """Response from workflow resume."""
    executionId: str
    status: str  # "running" (resumed)
    resumedAt: str
```

**Authentication**: `Depends(get_current_user)`.

**Error Responses**:
- `400` -- invalid execution_id format, or execution is not in an interrupted state
- `401` -- missing or invalid JWT
- `404` -- execution not found or does not belong to user's tenant
- `409` -- execution is not paused (cannot resume)

**Implementation**:

```python
@router.post("/execute/{execution_id}/resume", response_model=ResumeWorkflowResponse)
async def resume_workflow(
    execution_id: str,
    request: ResumeWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused workflow after HITL interrupt."""
    EXECUTION_ID_PATTERN = re.compile(r"^exec-[a-f0-9]{12}$")
    if not EXECUTION_ID_PATTERN.match(execution_id):
        raise HTTPException(status_code=400, detail="Invalid execution_id format")

    # Verify execution exists and belongs to tenant
    from app.models.workflow_execution import WorkflowExecution

    result = await db.execute(
        select(WorkflowExecution).where(
            WorkflowExecution.id == execution_id,
            WorkflowExecution.tenant_id == current_user.currentTenantId,
        )
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    if execution.status != "interrupted":
        raise HTTPException(status_code=409, detail="Execution is not paused at an interrupt")

    # Resume via LangGraph runtime
    from app.orchestrator.langgraph_runtime import get_langgraph_runtime

    runtime = get_langgraph_runtime()
    thread_id = f"{current_user.currentTenantId}:{execution_id}"

    try:
        await runtime.resume(thread_id, request.response)
    except Exception as e:
        logger.exception("workflow_resume_failed", execution_id=execution_id)
        raise HTTPException(status_code=500, detail="Failed to resume workflow") from e

    # Update execution status
    execution.status = "running"
    await db.commit()

    resumed_at = datetime.utcnow()
    logger.info("workflow_resumed", execution_id=execution_id, user_id=current_user.id)

    return ResumeWorkflowResponse(
        executionId=execution_id,
        status="running",
        resumedAt=resumed_at.isoformat() + "Z",
    )
```

---

### 5. `GET /api/v1/workflows/node-types`

**No code changes needed.** This endpoint auto-serves from `NodeRegistry.get_instance().get_all_node_types()`. When Section 11 registers new nodes, they automatically appear in the response.

---

### 6. `GET /api/v1/workflows/dlq` (New)

**Purpose**: List Dead Letter Queue items for the current tenant, with optional filters.

**Query Parameters**:
- `workflow_id` (string, optional): Filter by workflow
- `status` (string, optional): Filter by DLQ status (`pending`, `reprocessed`, `discarded`)
- `limit` (int, optional, default=50, max=200): Pagination limit
- `offset` (int, optional, default=0): Pagination offset

**Response Schema**:

```python
class DLQItemResponse(BaseModel):
    """A single DLQ item."""
    id: str
    workflow_id: str | None
    execution_id: str
    node_id: str
    input_data: dict[str, Any]
    error: str
    retry_count: int
    status: str
    created_at: str

class DLQListResponse(BaseModel):
    """Paginated DLQ list."""
    items: list[DLQItemResponse]
    total: int
```

**Authentication**: `Depends(get_current_user)`.

**Error Responses**:
- `401` -- missing or invalid JWT

**Implementation**:

```python
@router.get("/dlq", response_model=DLQListResponse)
async def list_dlq_items(
    workflow_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(default=50, le=200, ge=1),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List Dead Letter Queue items for the current tenant."""
    from app.models.workflow_dlq import WorkflowDeadLetterQueue
    from sqlalchemy import func

    query = select(WorkflowDeadLetterQueue).where(
        WorkflowDeadLetterQueue.tenant_id == current_user.currentTenantId
    )
    count_query = select(func.count()).select_from(WorkflowDeadLetterQueue).where(
        WorkflowDeadLetterQueue.tenant_id == current_user.currentTenantId
    )

    if workflow_id:
        query = query.where(WorkflowDeadLetterQueue.workflow_id == workflow_id)
        count_query = count_query.where(WorkflowDeadLetterQueue.workflow_id == workflow_id)
    if status:
        query = query.where(WorkflowDeadLetterQueue.status == status)
        count_query = count_query.where(WorkflowDeadLetterQueue.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(WorkflowDeadLetterQueue.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return DLQListResponse(
        items=[
            DLQItemResponse(
                id=str(item.id),
                workflow_id=item.workflow_id,
                execution_id=item.execution_id,
                node_id=item.node_id,
                input_data=item.input_data or {},
                error=item.error or "",
                retry_count=item.retry_count,
                status=item.status,
                created_at=item.created_at.isoformat() + "Z",
            )
            for item in items
        ],
        total=total,
    )
```

---

### 7. `POST /api/v1/workflows/dlq/{dlq_id}/reprocess` (New)

**Purpose**: Reprocess a specific DLQ item by re-executing the failed node with its original input.

**Path Parameters**:
- `dlq_id` (string, required): DLQ item ID

**Request Schema**:

```python
class DLQReprocessRequest(BaseModel):
    """Optional overrides for DLQ reprocessing."""
    override_input: dict[str, Any] | None = Field(
        default=None,
        description="Override the original input data for the retry",
    )
```

**Response Schema**:

```python
class DLQReprocessResponse(BaseModel):
    """Response from DLQ reprocessing."""
    dlq_id: str
    new_execution_id: str | None  # ID of the retry execution, if applicable
    status: str  # "reprocessing"
```

**Authentication**: `Depends(get_current_user)`.

**Error Responses**:
- `400` -- DLQ item already reprocessed or discarded
- `401` -- missing or invalid JWT
- `404` -- DLQ item not found or does not belong to user's tenant

**Implementation**:

```python
@router.post("/dlq/{dlq_id}/reprocess", response_model=DLQReprocessResponse)
async def reprocess_dlq_item(
    dlq_id: str,
    request: DLQReprocessRequest = DLQReprocessRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reprocess a Dead Letter Queue item."""
    from app.models.workflow_dlq import WorkflowDeadLetterQueue

    result = await db.execute(
        select(WorkflowDeadLetterQueue).where(
            WorkflowDeadLetterQueue.id == int(dlq_id),
            WorkflowDeadLetterQueue.tenant_id == current_user.currentTenantId,
        )
    )
    dlq_item = result.scalar_one_or_none()
    if not dlq_item:
        raise HTTPException(status_code=404, detail="DLQ item not found")
    if dlq_item.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"DLQ item is already {dlq_item.status}; cannot reprocess",
        )

    # Update DLQ status
    dlq_item.status = "reprocessing"
    dlq_item.retry_count += 1
    await db.commit()

    # Trigger re-execution (fire-and-forget)
    from app.orchestrator.langgraph_runtime import get_langgraph_runtime

    runtime = get_langgraph_runtime()
    input_data = request.override_input or dlq_item.input_data

    new_execution_id = f"exec-{uuid.uuid4().hex[:12]}"

    asyncio.create_task(
        runtime.reprocess_dlq_item(
            dlq_item_id=dlq_item.id,
            node_id=dlq_item.node_id,
            input_data=input_data,
            execution_id=new_execution_id,
            tenant_id=current_user.currentTenantId,
            user_id=current_user.id,
        )
    )

    logger.info(
        "dlq_reprocess_started",
        dlq_id=dlq_id,
        new_execution_id=new_execution_id,
        user_id=current_user.id,
    )

    return DLQReprocessResponse(
        dlq_id=dlq_id,
        new_execution_id=new_execution_id,
        status="reprocessing",
    )
```

---

## SSE Streaming Endpoint -- Detailed Event Translation

The streaming endpoint (`GET /execute/{id}/stream`) translates LangGraph `astream_events(version="v2")` into the existing frontend SSE protocol. The event mapping is as follows:

| LangGraph Event (`event` field) | Metadata / Condition | SSE `event:` | SSE `data:` Content |
|---|---|---|---|
| `on_chain_start` | `metadata["langgraph_node"]` is present AND node is not a routing/internal node | `node_start` | `{event_type, event_id, timestamp, node_id, node_name}` |
| `on_chain_end` | `metadata["langgraph_node"]` is present AND node is not internal | `node_complete` | `{event_type, event_id, timestamp, node_id, node_name, output, duration_ms}` |
| `on_chain_error` | `metadata["langgraph_node"]` is present | `node_error` | `{event_type, event_id, timestamp, node_id, node_name, error}` |
| `on_chat_model_stream` | (any) | `token` | `{node_id, token}` |
| `dispatch_custom_event` | name=`"workflow_complete"` | `workflow_complete` | `{event_type, execution_id, total_duration_ms, node_results}` |
| `dispatch_custom_event` | name=`"interrupt"` | `approval_required` | `{node_id, message, options, timeout_minutes}` |

**Internal nodes to filter out**: LangGraph generates `on_chain_start`/`on_chain_end` events for its internal routing steps (e.g., `__start__`, `__end__`, conditional edge evaluators). These are identified by their node name starting with `__` or not having a `langgraph_node` metadata key. They must not be forwarded to the frontend.

**Ring buffer for reconnection**: Each active execution maintains an in-memory ring buffer (max 100 SSE events). On reconnection, events after `Last-Event-ID` are replayed from the buffer. For long-running workflows, the checkpoint state provides full recovery beyond the buffer window. The `StreamTranslator` class (Section 02) manages this.

---

## tRPC Proxy Updates

The tRPC router at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/workflow.ts` needs the following additions to proxy the new endpoints.

### New Procedures to Add

```typescript
// File: /home/dev/projects/SmartSpecPro/apps/web/server/routers/workflow.ts

// Add inside workflowRouter = router({ ... }):

/**
 * Resume a paused workflow (HITL response)
 */
resume: protectedProcedure
  .input(
    z.object({
      executionId: z.string().regex(/^exec-[a-f0-9]{12}$/),
      response: z.record(z.any()),
    })
  )
  .mutation(async ({ input, ctx }) => {
    try {
      const response = await fetchPythonBackend(
        `/api/v1/workflows/execute/${input.executionId}/resume`,
        {
          method: "POST",
          body: JSON.stringify({ response: input.response }),
        },
        ctx.userToken
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          detail: `HTTP ${response.status}: ${response.statusText}`,
        }));
        const code =
          response.status === 404
            ? "NOT_FOUND"
            : response.status === 409
              ? "CONFLICT"
              : "BAD_REQUEST";
        throw new TRPCError({
          code: code as any,
          message: error.detail || "Failed to resume workflow",
        });
      }

      const data = await response.json();
      console.log("[Workflow] Resumed", {
        userId: ctx.user.id,
        executionId: input.executionId,
      });
      return data;
    } catch (error: any) {
      console.error("[Workflow] Resume error:", error.message);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to resume workflow",
      });
    }
  }),

/**
 * List Dead Letter Queue items
 */
listDLQ: protectedProcedure
  .input(
    z.object({
      workflowId: z.string().optional(),
      status: z.enum(["pending", "reprocessed", "discarded"]).optional(),
      limit: z.number().min(1).max(200).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    })
  )
  .query(async ({ input, ctx }) => {
    try {
      const params = new URLSearchParams({
        limit: input.limit.toString(),
        offset: input.offset.toString(),
        ...(input.workflowId && { workflow_id: input.workflowId }),
        ...(input.status && { status: input.status }),
      });

      const response = await fetchPythonBackend(
        `/api/v1/workflows/dlq?${params}`,
        { method: "GET" },
        ctx.userToken
      );

      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to fetch DLQ items",
        });
      }

      return await response.json();
    } catch (error: any) {
      console.error("[Workflow] DLQ list error:", error.message);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list DLQ items",
      });
    }
  }),

/**
 * Reprocess a DLQ item
 */
reprocessDLQ: protectedProcedure
  .input(
    z.object({
      dlqId: z.string(),
      overrideInput: z.record(z.any()).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    try {
      const response = await fetchPythonBackend(
        `/api/v1/workflows/dlq/${input.dlqId}/reprocess`,
        {
          method: "POST",
          body: JSON.stringify({
            override_input: input.overrideInput || null,
          }),
        },
        ctx.userToken
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          detail: `HTTP ${response.status}: ${response.statusText}`,
        }));
        const code = response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST";
        throw new TRPCError({
          code: code as any,
          message: error.detail || "Failed to reprocess DLQ item",
        });
      }

      const data = await response.json();
      console.log("[Workflow] DLQ reprocessed", {
        userId: ctx.user.id,
        dlqId: input.dlqId,
      });
      return data;
    } catch (error: any) {
      console.error("[Workflow] DLQ reprocess error:", error.message);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to reprocess DLQ item",
      });
    }
  }),
```

### Existing Procedure Modifications

The existing `compile` procedure needs to handle the new `errors` and `warnings` fields in the response:

```typescript
// Update the compile procedure's success check:
// BEFORE:
//   if (!data.success) {
//     throw new TRPCError({ code: "BAD_REQUEST", message: data.error || "Compilation failed" });
//   }
// AFTER:
if (!data.success) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: data.errors?.join("; ") || data.error || "Compilation failed",
  });
}
// Pass through warnings:
return { ...data, warnings: data.warnings || [] };
```

The SSE streaming endpoint is NOT proxied through tRPC (it uses EventSource on the frontend which connects directly to the Python backend via the nginx reverse proxy). No tRPC change needed for streaming.

---

## Implementation Steps

1. **Add new Pydantic request/response models** to `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py`:
   - `ResumeWorkflowRequest`, `ResumeWorkflowResponse`
   - `DLQItemResponse`, `DLQListResponse`, `DLQReprocessRequest`, `DLQReprocessResponse`
   - Update `FlowCompileResponse` with `errors` and `warnings` fields
   - Update `ExecuteWorkflowRequest` with optional `input_data` field

2. **Update `POST /compile`** endpoint to use `WorkflowCompiler` instead of `FlowCompiler`. Import from `app.orchestrator.workflow_compiler`. Handle the new `CompilationError` which carries a list of validation errors.

3. **Update `POST /execute`** endpoint to:
   - Create a record in `workflow_executions` table (from Section 13)
   - Build LangGraph config with `thread_id = {tenant_id}:{execution_id}`
   - Call `LangGraphRuntime.execute()` via `asyncio.create_task` (fire-and-forget)

4. **Update `GET /execute/{id}/stream`** endpoint to:
   - Verify execution exists in `workflow_executions` table with tenant isolation
   - Replace mock SSE with `StreamTranslator` (Section 02) integration
   - Support ring buffer replay on reconnection

5. **Add `POST /execute/{id}/resume`** endpoint for HITL workflow resumption. Verify execution is in `interrupted` status, then call `LangGraphRuntime.resume()`.

6. **Add `GET /dlq`** endpoint for listing DLQ items filtered by tenant.

7. **Add `POST /dlq/{id}/reprocess`** endpoint for reprocessing DLQ items.

8. **Update tRPC router** at `/home/dev/projects/SmartSpecPro/apps/web/server/routers/workflow.ts`:
   - Add `resume` mutation procedure
   - Add `listDLQ` query procedure
   - Add `reprocessDLQ` mutation procedure
   - Update `compile` procedure to handle `errors`/`warnings` response shape

9. **Update imports** in `workflows.py`: remove `FlowCompiler` import, add `WorkflowCompiler` and `LangGraphRuntime` imports. Add `Query` from fastapi for query parameter validation.

10. **Verify existing endpoints** are not broken: `GET /node-types`, `POST /estimate-cost`, `GET /report/{id}`, `GET /available-models`, `GET /rag-collections`, `GET /available-approvers`, `GET /image-providers` should all continue working without changes.

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_api_workflows.py`

All tests use `pytest` with `httpx.AsyncClient` against the FastAPI test app. The LangGraph runtime and database are mocked for unit/integration isolation.

| Test | Type | What it verifies |
|------|------|-----------------|
| `test_compile_endpoint_success` | integration | `POST /compile` returns compiled manifest with `success: true` when given valid ReactFlow JSON |
| `test_compile_endpoint_validation_error` | integration | `POST /compile` returns `success: false` with `errors` list when workflow has cycle or missing trigger |
| `test_compile_endpoint_warnings` | integration | `POST /compile` returns `warnings` for unreachable nodes while still succeeding |
| `test_execute_endpoint_starts` | integration | `POST /execute` creates execution record, returns `execution_id` and `status: running` |
| `test_execute_endpoint_insufficient_credits` | integration | `POST /execute` returns 402 when user has insufficient credits |
| `test_execute_endpoint_not_compiled` | integration | `POST /execute` returns 400 when `_compiledMetadata` is missing |
| `test_stream_endpoint_sse` | integration | `GET /execute/{id}/stream` returns SSE-formatted events with correct `Content-Type` |
| `test_stream_endpoint_invalid_id` | integration | `GET /execute/{id}/stream` returns 400 for malformed execution_id |
| `test_stream_endpoint_not_found` | integration | `GET /execute/{id}/stream` returns 404 for non-existent execution |
| `test_resume_endpoint` | integration | `POST /execute/{id}/resume` resumes interrupted execution, returns `status: running` |
| `test_resume_endpoint_not_interrupted` | integration | `POST /execute/{id}/resume` returns 409 when execution is not paused |
| `test_resume_endpoint_not_found` | integration | `POST /execute/{id}/resume` returns 404 for non-existent execution |
| `test_dlq_list` | integration | `GET /dlq` returns paginated DLQ items filtered by tenant |
| `test_dlq_list_with_filters` | integration | `GET /dlq?status=pending&workflow_id=wf-1` applies filters correctly |
| `test_dlq_reprocess` | integration | `POST /dlq/{id}/reprocess` changes status to `reprocessing` and returns new execution_id |
| `test_dlq_reprocess_not_found` | integration | `POST /dlq/{id}/reprocess` returns 404 for non-existent item |
| `test_dlq_reprocess_already_processed` | integration | `POST /dlq/{id}/reprocess` returns 400 for already-reprocessed item |

```python
"""Tests for workflow API endpoints with LangGraph runtime integration."""
# File: /home/dev/projects/SmartSpecPro/python-backend/tests/test_api_workflows.py

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def mock_current_user():
    """Create a mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.email = "test@example.com"
    user.currentTenantId = "tenant-1"
    user.creditBalance = 100.0
    user.is_active = True
    return user


@pytest.fixture
def valid_workflow_nodes():
    """Minimal valid ReactFlow nodes for compilation."""
    return [
        {
            "id": "trigger-1",
            "type": "manual_trigger",
            "position": {"x": 0, "y": 0},
            "data": {"label": "Start", "config": {}},
        },
        {
            "id": "node-1",
            "type": "set_variable",
            "position": {"x": 200, "y": 0},
            "data": {"label": "Set Fields", "config": {"fields": []}},
        },
    ]


@pytest.fixture
def valid_workflow_edges():
    """Minimal valid ReactFlow edges."""
    return [
        {
            "id": "e1",
            "source": "trigger-1",
            "target": "node-1",
            "sourceHandle": "output",
            "targetHandle": "input",
        }
    ]


@pytest.mark.integration
class TestCompileEndpoint:
    """Tests for POST /api/v1/workflows/compile."""

    async def test_compile_endpoint_success(
        self, mock_current_user, valid_workflow_nodes, valid_workflow_edges
    ):
        """Valid ReactFlow JSON compiles successfully."""
        # Arrange: mock auth + compiler
        # Act: POST /compile with valid nodes/edges
        # Assert: response.success == True, manifest is not None
        ...

    async def test_compile_endpoint_validation_error(self, mock_current_user):
        """Invalid workflow returns 200 with success=false and errors list."""
        # Arrange: nodes with a cycle
        # Act: POST /compile
        # Assert: response.success == False, response.errors is list with >= 1 error
        ...

    async def test_compile_endpoint_warnings(
        self, mock_current_user, valid_workflow_nodes, valid_workflow_edges
    ):
        """Unreachable nodes produce warnings but compilation still succeeds."""
        # Arrange: add an orphan node
        # Act: POST /compile
        # Assert: response.success == True, response.warnings includes unreachable warning
        ...


@pytest.mark.integration
class TestExecuteEndpoint:
    """Tests for POST /api/v1/workflows/execute."""

    async def test_execute_endpoint_starts(self, mock_current_user):
        """Compiled workflow starts execution and returns execution_id."""
        # Arrange: compiled workflow JSON with _compiledMetadata
        # Act: POST /execute
        # Assert: response.executionId matches pattern, status == "running"
        ...

    async def test_execute_endpoint_insufficient_credits(self, mock_current_user):
        """Returns 402 when credits are insufficient."""
        # Arrange: user with 0 credits, workflow requiring > 0
        # Act: POST /execute
        # Assert: response.status_code == 402
        ...

    async def test_execute_endpoint_not_compiled(self, mock_current_user):
        """Returns 400 when workflow is not compiled."""
        # Arrange: workflow JSON without _compiledMetadata
        # Act: POST /execute
        # Assert: response.status_code == 400
        ...


@pytest.mark.integration
class TestStreamEndpoint:
    """Tests for GET /api/v1/workflows/execute/{id}/stream."""

    async def test_stream_endpoint_sse(self, mock_current_user):
        """SSE stream returns events with correct content type."""
        # Arrange: create execution record in DB
        # Act: GET /execute/{id}/stream
        # Assert: Content-Type is text/event-stream, body contains event: lines
        ...

    async def test_stream_endpoint_invalid_id(self, mock_current_user):
        """Invalid execution_id format returns 400."""
        # Act: GET /execute/invalid-format/stream
        # Assert: response.status_code == 400
        ...

    async def test_stream_endpoint_not_found(self, mock_current_user):
        """Non-existent execution returns 404."""
        # Arrange: no execution record for this ID
        # Act: GET /execute/exec-000000000000/stream
        # Assert: response.status_code == 404
        ...


@pytest.mark.integration
class TestResumeEndpoint:
    """Tests for POST /api/v1/workflows/execute/{id}/resume."""

    async def test_resume_endpoint(self, mock_current_user):
        """Interrupted execution resumes successfully."""
        # Arrange: execution record with status="interrupted"
        # Act: POST /execute/{id}/resume with response body
        # Assert: response.status == "running", resumedAt is set
        ...

    async def test_resume_endpoint_not_interrupted(self, mock_current_user):
        """Returns 409 when execution is not paused."""
        # Arrange: execution record with status="running"
        # Act: POST /execute/{id}/resume
        # Assert: response.status_code == 409
        ...

    async def test_resume_endpoint_not_found(self, mock_current_user):
        """Returns 404 for non-existent execution."""
        # Act: POST /execute/exec-000000000000/resume
        # Assert: response.status_code == 404
        ...


@pytest.mark.integration
class TestDLQEndpoints:
    """Tests for DLQ list and reprocess endpoints."""

    async def test_dlq_list(self, mock_current_user):
        """GET /dlq returns paginated DLQ items for current tenant."""
        # Arrange: insert DLQ items for tenant
        # Act: GET /dlq
        # Assert: items list returned, total count matches
        ...

    async def test_dlq_list_with_filters(self, mock_current_user):
        """GET /dlq with filters applies them correctly."""
        # Arrange: DLQ items with mixed statuses
        # Act: GET /dlq?status=pending
        # Assert: only pending items returned
        ...

    async def test_dlq_reprocess(self, mock_current_user):
        """POST /dlq/{id}/reprocess triggers reprocessing."""
        # Arrange: DLQ item with status="pending"
        # Act: POST /dlq/{id}/reprocess
        # Assert: response.status == "reprocessing", new_execution_id set
        ...

    async def test_dlq_reprocess_not_found(self, mock_current_user):
        """Returns 404 for non-existent DLQ item."""
        # Act: POST /dlq/99999/reprocess
        # Assert: response.status_code == 404
        ...

    async def test_dlq_reprocess_already_processed(self, mock_current_user):
        """Returns 400 for already reprocessed DLQ item."""
        # Arrange: DLQ item with status="reprocessed"
        # Act: POST /dlq/{id}/reprocess
        # Assert: response.status_code == 400
        ...
```

---

## Files Modified/Created

### Python Backend (modified)
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py` -- All endpoint updates, new Pydantic models, new DLQ endpoints

### Node.js tRPC Router (modified)
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/workflow.ts` -- Add `resume`, `listDLQ`, `reprocessDLQ` procedures; update `compile` response handling

### Test File (new)
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_api_workflows.py` -- Integration tests for all updated and new endpoints

### SQLAlchemy Model Files (new, created by Section 13 -- referenced here)
- `/home/dev/projects/SmartSpecPro/python-backend/app/models/workflow_execution.py` -- SQLAlchemy model for `workflow_executions` table
- `/home/dev/projects/SmartSpecPro/python-backend/app/models/workflow_dlq.py` -- SQLAlchemy model for `workflow_dead_letter_queue` table

---

## Dependencies on Other Sections

| Section | What This Section Needs From It |
|---|---|
| **Section 01 (Runtime Core)** | `LangGraphRuntime` class with `execute()`, `resume()`, `reprocess_dlq_item()`, `get_event_buffer()` methods; `WorkflowCompiler` class with `compile()` method; updated `CompilationError` with `errors: list[str]` attribute |
| **Section 02 (Streaming)** | `StreamTranslator` class that translates `astream_events` to SSE format strings; `RingBuffer` for event replay |
| **Section 03 (HITL)** | `LangGraphRuntime.resume(thread_id, response)` implementation using `Command(resume=...)` |
| **Section 07 (Reliability)** | DLQ node executor that writes failed items to `workflow_dead_letter_queue` table; `LangGraphRuntime.reprocess_dlq_item()` method |
| **Section 13 (Database Schema)** | `workflow_executions` table with columns: id, workflow_id, tenant_id, user_id, status, input_data, output_data, started_at, completed_at, error, node_count, credits_used; `workflow_dead_letter_queue` table with columns: id, workflow_id, execution_id, node_id, tenant_id, input_data, error, retry_count, status, created_at |