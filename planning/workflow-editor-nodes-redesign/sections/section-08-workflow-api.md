Now I have all the context. Let me identify section-08-workflow-api in the manifest and extract the relevant information from both the plan and TDD documents.

From the index.md, section-08-workflow-api is:
- **Depends On:** section-07-compiler
- **Blocks:** section-09-sse-stream

From claude-plan.md, section 8 is "Workflow API Implementation" which covers:
- Replace placeholder endpoints with real implementations
- Implement tRPC router procedures for user workflows
- Add cost estimation endpoint

From claude-plan-tdd.md, section 8 tests are specified.

Now I'll generate the complete section content:

---

# Workflow API Implementation

## Overview

This section implements the core workflow API endpoints that replace the current placeholder implementations. This includes:

1. **Python backend endpoints** (`python-backend/app/api/workflow.py`) — Real execution, listing, and reporting
2. **tRPC router procedures** (`apps/web/server/routers/workflow.ts`) — User workflow CRUD
3. **Cost estimation endpoint** — Pre-execution cost analysis

**Dependency:** Requires section-07-compiler (compiled workflow validation)

**Blocks:** section-09-sse-stream (which extends the execution endpoint with SSE streaming)

---

## Background

The workflow API currently has placeholder implementations that return hardcoded responses:
- `GET /api/v1/workflow/list` — Returns dummy data
- `POST /api/v1/workflow/execute` — Doesn't actually execute
- `GET /api/v1/workflow/report/{id}` — Returns hardcoded status

This section connects the API layer to the orchestrator and database, making workflows actually executable.

### Key Architectural Decisions

1. **Separation of concerns:**
   - Python backend handles compilation, execution orchestration, and real-time event emission
   - Node.js tRPC handles user workflow persistence (save/load/list) and proxying to Python for execution
   - Database tracks execution state and results

2. **Cost estimation:**
   - Pre-calculation based on workflow structure (number and type of nodes)
   - Separate from actual execution (execution may differ due to conditional branching)

3. **Execution model:**
   - Synchronous start (returns execution_id immediately)
   - Asynchronous completion (events streamed via SSE in section-09)
   - State stored in execution context throughout

---

## Tests First (TDD)

### Python Backend Tests

```python
# python-backend/tests/test_workflow_api.py

# Test: POST /api/v1/workflow/execute — accepts compiled workflow, starts execution, returns execution_id
# Test: POST /api/v1/workflow/execute — rejects uncompiled workflow
# Test: POST /api/v1/workflow/execute — checks user credits before starting
# Test: GET /api/v1/workflow/list — returns user's workflows scoped to tenant
# Test: GET /api/v1/workflow/report/{id} — returns execution status and node results
# Test: GET /api/v1/workflow/report/{id} — tenant isolation (can't see other tenant's executions)
# Test: POST /api/v1/workflow/estimate-cost — returns estimated credits for LLM + media + skill nodes
# Test: POST /api/v1/workflow/estimate-cost — warns when estimated cost exceeds balance
```

Implement these tests before API code. Tests should verify:
- Workflow execution creates an execution record and returns execution_id
- Uncompiled workflows are rejected with clear error
- User credit balance is checked before execution starts
- Workflows are scoped to the requesting user's tenant
- Cost estimation accounts for all node types
- Execution status can be queried by ID with proper tenant isolation

### Frontend/tRPC Tests

```typescript
// apps/web/server/routers/__tests__/workflow.test.ts

// Test: workflow.save — creates new workflow draft
// Test: workflow.save — updates existing workflow (upsert)
// Test: workflow.load — retrieves workflow by id for current user
// Test: workflow.load — rejects loading another user's workflow
// Test: workflow.list — returns workflows with status filter
// Test: workflow.delete — soft deletes workflow
```

---

## Implementation

### Part 1: Database Persistence

**Requires:** section-01-schema (workflows, workflow_templates tables)

Ensure the `workflows` table exists with:
- `id`, `name`, `description`, `workflowJson` (JSONB), `userId`, `tenantId`, `status` (enum), `lastCompiledAt`, `schemaVersion`, `createdAt`, `updatedAt`

The tRPC router will perform CRUD operations on this table.

### Part 2: Python Backend Workflow API

**File:** `python-backend/app/api/workflow.py`

#### Existing Code Structure

The file already exists with placeholder implementations and imports from the orchestrator:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])

# Existing endpoints that need implementation:
# - list_workflows()
# - execute_workflow()
# - get_workflow_report()
```

#### Endpoints to Implement

**1. `GET /list` — List User Workflows**

Replace the placeholder. Fetch workflows from the database where `userId = current_user.id` and `tenantId = current_tenant.id`.

Input: Optional query params for status filter (draft, compiled, running, completed, failed)

Output: Array of workflow summaries (id, name, description, status, lastCompiledAt, createdAt)

```python
@router.get("/list")
async def list_workflows(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
):
    """List workflows for current user in current tenant."""
    # Query workflows table, filter by user and tenant
    # Optionally filter by status
    # Return list of workflow summaries
```

**2. `POST /execute` — Execute Compiled Workflow**

Replace the placeholder. Validates workflow was compiled, checks credit balance, creates execution record, invokes orchestrator.

Input: 
```json
{
  "workflowId": 123,
  "workflowJson": { "nodes": [...], "edges": [...], "_compiledMetadata": {...} }
}
```

Output:
```json
{
  "executionId": "exec-abc123",
  "status": "running",
  "startedAt": "2026-02-08T10:00:00Z"
}
```

Validation:
- `_compiledMetadata` field must exist (proof of compilation)
- User credit balance >= estimated cost
- Raise `InsufficientCreditsError` if balance too low

Steps:
1. Validate workflow is compiled (check for `_compiledMetadata`)
2. Call `cost_estimator.estimate(workflow_json)` to get cost
3. Check `user.creditBalance >= cost` against credit service
4. Create execution record: `INSERT INTO executions (workflowId, userId, status, ...)`
5. Invoke orchestrator: `await orchestrator.execute(workflow_json, execution_id, user_context)`
6. Return execution_id

```python
@router.post("/execute")
async def execute_workflow(
    request: ExecuteWorkflowRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Execute a compiled workflow and return execution_id."""
    # Validate compiled (check _compiledMetadata)
    # Estimate cost
    # Check credits
    # Create execution record
    # Invoke orchestrator
    # Return execution_id
```

**3. `GET /report/{id}` — Execution Status and Results**

Replace placeholder. Returns execution status and node results.

Output:
```json
{
  "executionId": "exec-abc123",
  "status": "completed",
  "totalDurationMs": 5432,
  "nodeResults": {
    "llm-call-001": {
      "status": "success",
      "output": { "response": "..." },
      "durationMs": 3200
    },
    "rag-query-001": {
      "status": "success",
      "output": { "documents": [...] },
      "durationMs": 1200
    }
  }
}
```

Queries the execution record and returns aggregated results.

```python
@router.get("/report/{execution_id}")
async def get_workflow_report(
    execution_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
):
    """Get execution status and results."""
    # Query executions table, verify ownership
    # Return status and aggregated node results
```

**4. `POST /estimate-cost` — Pre-Execution Cost Estimation**

New endpoint. Analyzes workflow structure without executing.

Input:
```json
{
  "workflowJson": { "nodes": [...], "edges": [...] }
}
```

Output:
```json
{
  "estimatedCredits": 45.5,
  "breakdown": {
    "llm_calls": 25.0,
    "image_generation": 15.0,
    "rag_queries": 5.5
  },
  "userBalance": 100.0,
  "warning": null
}
```

Warning cases:
- `estimatedCredits > userBalance` → `"Insufficient credits"`
- `estimatedCredits > userBalance * 0.8` → `"Estimated cost exceeds 80% of balance"`

Implementation detail: Create a `CostEstimator` class that:
1. Iterates through nodes in workflow
2. For each LLM node: estimate tokens from prompt length
3. For each image node: look up provider cost
4. For each RAG node: use fixed per-query cost
5. For skill nodes: estimate based on skill type
6. Sum all costs and return breakdown

```python
@router.post("/estimate-cost")
async def estimate_cost(
    request: EstimateCostRequest,
    user: User = Depends(get_current_user),
):
    """Estimate execution cost before running."""
    # Use CostEstimator to analyze workflow
    # Check user balance
    # Return estimation with warnings
```

### Part 3: Frontend tRPC Router

**File:** `apps/web/server/routers/workflow.ts`

This router handles user workflow persistence (separate from execution). It proxies to Python for execution-related operations.

#### Procedures to Implement

**1. `save` — Create or Update Workflow Draft**

Save workflow JSON to database. Upsert by id (create if not exists, update if exists).

```typescript
save: protectedProcedure
  .input(z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    workflowJson: z.object({
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
    }),
  }))
  .mutation(async ({ input, ctx }) => {
    // Save/update in workflows table
    // Return { id, status: 'draft' }
  }),
```

**2. `load` — Load Workflow by ID**

Retrieve workflow from database. Verify ownership.

```typescript
load: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input, ctx }) => {
    // Query workflows table
    // Verify userId and tenantId match
    // Return full workflow object
  }),
```

**3. `list` — List User's Workflows**

Return workflows for current user with optional status filter.

```typescript
list: protectedProcedure
  .input(z.object({ status: z.enum(['draft', 'compiled', 'running', 'completed', 'failed']).optional() }))
  .query(async ({ input, ctx }) => {
    // Query workflows table scoped to user
    // Filter by status if provided
    // Return list of summaries
  }),
```

**4. `delete` — Delete Workflow**

Soft delete (set status to 'deleted' or add deletedAt timestamp).

```typescript
delete: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // Soft delete workflow
    // Verify ownership before delete
  }),
```

**5. `compile` — Compile Workflow (proxy to Python)**

Call Python `/api/v1/workflow/compile` endpoint, get back compiled JSON, update status in database.

```typescript
compile: protectedProcedure
  .input(z.object({ 
    id: z.number(),
    workflowJson: z.object({
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
    }),
  }))
  .mutation(async ({ input, ctx }) => {
    // Call Python compile endpoint (or use local FlowCompiler if available)
    // Update status to 'compiled' in DB
    // Return compiled JSON with _compiledMetadata
  }),
```

**6. `execute` — Execute Workflow (proxy to Python)**

Call Python `/api/v1/workflow/execute` endpoint.

```typescript
execute: protectedProcedure
  .input(z.object({
    id: z.number(),
    workflowJson: z.object({
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
    }),
  }))
  .mutation(async ({ input, ctx }) => {
    // Call Python execute endpoint
    // Return { executionId, status }
  }),
```

**7. `getStatus` — Get Execution Status (proxy to Python)**

Call Python `/api/v1/workflow/report/{id}` endpoint.

```typescript
getStatus: protectedProcedure
  .input(z.object({ executionId: z.string() }))
  .query(async ({ input, ctx }) => {
    // Call Python report endpoint
    // Return status and results
  }),
```

---

## Data Model

### Execution Record

The `executions` table (or equivalent in memory during development) tracks workflow runs:

```python
@dataclass
class ExecutionRecord:
    execution_id: str              # Unique UUID
    workflow_id: int               # FK to workflows table
    user_id: int
    tenant_id: int
    status: str                    # 'running', 'completed', 'failed'
    started_at: datetime
    completed_at: Optional[datetime]
    node_results: dict             # { nodeId: { status, output, duration } }
    error: Optional[str]
    total_duration_ms: int
```

### Request/Response Types

**Python side (Pydantic models):**

```python
class ExecuteWorkflowRequest(BaseModel):
    workflowJson: dict             # Full workflow with _compiledMetadata
    
class EstimateCostRequest(BaseModel):
    workflowJson: dict             # Workflow to estimate
    
class WorkflowReport(BaseModel):
    executionId: str
    status: str
    totalDurationMs: int
    nodeResults: dict
```

**TypeScript side (tRPC inputs/outputs):**

Already defined in the tRPC router input validation.

---

## Cost Estimation Logic

Create `python-backend/app/orchestrator/cost_estimator.py`:

```python
class CostEstimator:
    async def estimate(self, workflow_json: dict) -> float:
        """Estimate total credits for workflow execution."""
        # Iterate nodes
        # For LLM nodes: estimate tokens (prompt_length * 2 for response)
        # For image nodes: look up provider cost
        # For RAG nodes: fixed cost per query
        # For skill nodes: estimate from skill type
        # Sum and return
        
    def estimate_llm_cost(self, model: str, prompt_length: int) -> float:
        """Estimate cost of single LLM call."""
        # Use model_provider_map to get per-token pricing
        # Calculate: (prompt_tokens + estimated_response_tokens) * price
        
    def estimate_image_cost(self, provider: str, size: str, quality: str) -> float:
        """Look up image generation cost."""
        # Return provider-specific pricing
        
    def estimate_rag_cost(self) -> float:
        """Fixed cost per RAG query."""
        return 1.0  # Example: 1 credit per query
```

---

## Integration Points

1. **Orchestrator (`python-backend/app/orchestrator/orchestrator.py`):**
   - `await orchestrator.execute(workflow_json, execution_id, context)` — Starts execution
   - Must emit events for SSE (see section-09)

2. **Credit Service:**
   - Check `user.creditBalance` before execution
   - Deduct credits on completion (or per node, depending on design)

3. **Database:**
   - Execute records stored (execution history)
   - Workflow drafts stored (user persistence)

---

## Implementation Checklist

**Python Backend (`python-backend/app/api/workflow.py`):**
- [ ] Implement `GET /list` — Query workflows from DB
- [ ] Implement `POST /execute` — Validate, check credits, start orchestrator
- [ ] Implement `GET /report/{id}` — Return execution status and results
- [ ] Implement `POST /estimate-cost` — Analyze workflow structure
- [ ] Create `CostEstimator` class in `python-backend/app/orchestrator/cost_estimator.py`
- [ ] Add `ExecutionRecord` model/table to tracking execution state
- [ ] Add request/response Pydantic models (ExecuteWorkflowRequest, etc.)
- [ ] Test all endpoints with pytest (see Tests section)

**Frontend (`apps/web/server/routers/workflow.ts`):**
- [ ] Implement `save` procedure — Upsert workflow to DB
- [ ] Implement `load` procedure — Fetch workflow with ownership check
- [ ] Implement `list` procedure — List user's workflows
- [ ] Implement `delete` procedure — Soft delete workflow
- [ ] Implement `compile` procedure — Proxy to Python + update DB status
- [ ] Implement `execute` procedure — Proxy to Python
- [ ] Implement `getStatus` procedure — Proxy to Python
- [ ] Add Zod input validation to all procedures
- [ ] Test all procedures with Vitest (see Tests section)

---

## Security & Validation

1. **Tenant Isolation:** All queries filtered by `tenantId = ctx.user.tenantId`
2. **Ownership Check:** Workflows loaded must have matching `userId`
3. **Compilation Requirement:** Execution requires `_compiledMetadata` in workflowJson
4. **Credit Enforcement:** Check balance before starting execution
5. **Input Validation:** All endpoints validate request schema (Pydantic on Python, Zod on tRPC)

---

## Dependencies

- **Requires:**
  - section-01-schema (workflows, executions tables)
  - section-02-registry (node type metadata for cost estimation)
  - section-03 through section-06 (executors for actual execution)
  - section-07-compiler (FlowCompiler for validation)

- **Blocks:**
  - section-09-sse-stream (extends execute endpoint with event streaming)

---

## Notes

- **Error handling:** All endpoint errors return appropriate HTTP status codes (400 for validation, 401 for auth, 402 for insufficient credits, 404 for not found, 500 for server errors)
- **Async throughout:** All database and orchestrator calls are async
- **No hardcoding:** Cost estimation reads from model_provider_map and other dynamic sources, not hardcoded values
- **Extensibility:** CostEstimator is designed to be extended as new node types are added