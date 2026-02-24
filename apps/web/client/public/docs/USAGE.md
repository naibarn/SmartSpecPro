# Agentic AI Workflow - Usage Guide / คู่มือการใช้งาน

**Version**: 1.0.0
**Last Updated**: 2026-02-08
**Implemented Features**: Workflow Compilation, Execution, Approval Gates, Budget Enforcement, Dashboard Integration

---

## Table of Contents / สารบัญ

1. [Overview / ภาพรวม](#overview--ภาพรวม)
2. [Backend APIs / API ฝั่งหลังบ้าน](#backend-apis--api-ฝั่งหลังบ้าน)
3. [Frontend Integration / การเชื่อมต่อฝั่งหน้าบ้าน](#frontend-integration--การเชื่อมต่อฝั่งหน้าบ้าน)
4. [Dashboard Widgets / วิดเจ็ตในแดชบอร์ด](#dashboard-widgets--วิดเจ็ตในแดชบอร์ด)
5. [Security & Budget / ความปลอดภัยและงบประมาณ](#security--budget--ความปลอดภัยและงบประมาณ)
6. [Testing / การทดสอบ](#testing--การทดสอบ)

---

## Overview / ภาพรวม

The Agentic AI Workflow system provides a complete LangGraph-based workflow orchestration platform with:

ระบบ Agentic AI Workflow ให้บริการแพลตฟอร์มจัดการเวิร์กโฟลว์แบบ LangGraph ที่สมบูรณ์พร้อม:

- ✅ **ReactFlow → LangGraph compilation** / คอมไพล์จาก ReactFlow เป็น LangGraph
- ✅ **PostgreSQL checkpointing** / จุดตรวจสอบด้วย PostgreSQL
- ✅ **Budget enforcement (two-phase credit protocol)** / บังคับใช้งบประมาณแบบ 2 เฟส
- ✅ **Approval gates with database persistence** / จุดอนุมัติพร้อมเก็บข้อมูลในฐานข้อมูล
- ✅ **Security validation (prompt injection, tool allowlist)** / ตรวจสอบความปลอดภัย (prompt injection, รายการเครื่องมือที่อนุญาต)
- ✅ **Real-time status updates** / อัปเดตสถานะแบบ real-time
- ✅ **Dashboard integration** / เชื่อมต่อกับแดชบอร์ด

**Architecture Flow / โครงสร้างการทำงาน:**

```
React Components (JobCard, Dashboard)
         ↓ tRPC call
Node.js tRPC Router (workflow.ts, approvals.ts)
         ↓ HTTP + JWT forwarding
Python FastAPI Backend
         ↓ SQLAlchemy + LangGraph
PostgreSQL (workflows, approvals, checkpoints)
```

---

## Backend APIs / API ฝั่งหลังบ้าน

### 1. Workflow Compilation API

**Endpoint:** `POST /api/v1/workflows/compile`

**Purpose / วัตถุประสงค์:**
Convert ReactFlow visual editor JSON into a validated LangGraph manifest.
แปลง JSON จาก ReactFlow visual editor เป็น LangGraph manifest ที่ผ่านการตรวจสอบ

**Request Body:**
```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "llm",
      "data": {
        "label": "Generate Text",
        "config": {
          "model": "gpt-4",
          "temperature": 0.7,
          "max_tokens": 500
        }
      }
    },
    {
      "id": "node_2",
      "type": "approval",
      "data": {
        "label": "Human Review",
        "config": {
          "title": "Review generated content",
          "required_approvers": 1
        }
      }
    }
  ],
  "edges": [
    {
      "source": "node_1",
      "target": "node_2"
    }
  ],
  "metadata": {
    "name": "text-review-workflow",
    "version": "1.0.0",
    "description": "Generate text with human approval"
  }
}
```

**Response:**
```json
{
  "manifest": {
    "name": "text-review-workflow",
    "version": "1.0.0",
    "nodes": [...],
    "edges": [...]
  },
  "validation": {
    "is_valid": true,
    "node_count": 2,
    "edge_count": 1
  }
}
```

**Security Validations Performed / การตรวจสอบความปลอดภัย:**
- ✅ Tool allowlist check (only 37 allowed tools)
- ✅ Prompt injection detection (9 patterns blocked)
- ✅ Unsafe expression detection (8 patterns blocked)
- ✅ Resource limits (max 100 nodes, 200 edges, 3 loop nesting)
- ✅ Circular dependency detection
- ✅ Graph structure validation

**Error Codes:**
- `400 BAD_REQUEST` - Invalid flow structure or validation failed
- `401 UNAUTHORIZED` - Missing or invalid JWT token
- `500 INTERNAL_SERVER_ERROR` - Compilation error

---

### 2. Workflow Execution API

**Endpoint:** `POST /api/v1/workflows/execute`

**Purpose / วัตถุประสงค์:**
Execute a compiled workflow with budget enforcement and checkpointing.
เรียกใช้เวิร์กโฟลว์ที่คอมไพล์แล้วพร้อมบังคับใช้งบประมาณและจุดตรวจสอบ

**Request Body:**
```json
{
  "workflow_id": "wf_abc123",
  "inputs": {
    "user_prompt": "Write a blog post about AI safety",
    "target_audience": "technical"
  },
  "config": {
    "max_budget_credits": 1000,
    "timeout_minutes": 30
  }
}
```

**Response:**
```json
{
  "execution_id": "exec_xyz789",
  "status": "running",
  "created_at": "2026-02-08T10:30:00Z",
  "checkpoint_id": "checkpoint_1"
}
```

**Budget Enforcement / การบังคับใช้งบประมาณ:**

The system uses a **two-phase credit protocol** to prevent overspending:

ระบบใช้ **โปรโตคอลเครดิต 2 เฟส** เพื่อป้องกันการใช้เกินงบประมาณ:

1. **Reserve Phase (Before Step)** / เฟสจองเครดิต (ก่อนรันขั้นตอน):
   - Pessimistic lock on `users.credits` column
   - Deduct estimated cost immediately
   - Raises `BudgetExceededError` if insufficient credits

2. **Finalize Phase (After Step)** / เฟสสรุป (หลังรันขั้นตอน):
   - Calculate actual cost from LLM usage
   - Refund difference if `actual_cost < estimated_cost`
   - Deduct extra if `actual_cost > estimated_cost` (max 10x threshold)

**Rollback on Failure / ย้อนกลับเมื่อล้มเหลว:**
- If step fails, reserved credits are refunded automatically
- Idempotency tracker prevents double-rollback in same process

---

### 3. Approval API

**Endpoint:** `GET /api/v1/approvals/pending`

**Purpose / วัตถุประสงค์:**
List all pending approval requests for the current user/tenant.
แสดงรายการคำขออนุมัติที่รอดำเนินการสำหรับผู้ใช้/tenant ปัจจุบัน

**Response:**
```json
{
  "requests": [
    {
      "id": "apr_123",
      "request_type": "CODE_EXECUTION",
      "title": "Execute Python script",
      "description": "Run data analysis script on user data",
      "status": "PENDING",
      "risk_level": "medium",
      "risk_factors": ["file_write", "external_api_call"],
      "execution_id": "exec_xyz789",
      "created_at": "2026-02-08T10:35:00Z",
      "expires_at": "2026-02-08T11:35:00Z",
      "payload": {
        "script_path": "/tmp/analysis.py",
        "input_files": ["data.csv"]
      }
    }
  ],
  "total": 1
}
```

**Endpoint:** `POST /api/v1/approvals/{request_id}/decision`

**Purpose / วัตถุประสงค์:**
Submit approval decision (approved/rejected).
ส่งการตัดสินใจอนุมัติ (อนุมัติ/ปฏิเสธ)

**Request Body:**
```json
{
  "decision": "approved",
  "comment": "Reviewed script - safe to execute"
}
```

**Response:**
```json
{
  "response_id": "resp_456",
  "decision": "approved",
  "approver_id": 42,
  "submitted_at": "2026-02-08T10:40:00Z",
  "request_status": "APPROVED"
}
```

**Tenant Isolation / การแยกข้อมูล tenant:**
- `tenant_id` is MANDATORY for all approval requests
- Users can only see approvals for their tenant
- Cross-tenant access is blocked at database query level

---

## Frontend Integration / การเชื่อมต่อฝั่งหน้าบ้าน

### 1. tRPC Router Usage

**Import the router / นำเข้า router:**

```typescript
import { trpc } from '@/lib/trpc';
```

**Compile a workflow / คอมไพล์เวิร์กโฟลว์:**

```typescript
const compileWorkflow = trpc.workflow.compile.useMutation();

const handleCompile = async () => {
  try {
    const result = await compileWorkflow.mutateAsync({
      nodes: reactFlowNodes,
      edges: reactFlowEdges,
      metadata: {
        name: 'my-workflow',
        version: '1.0.0',
        description: 'My custom workflow'
      }
    });

    console.log('Compiled manifest:', result.manifest);
  } catch (error) {
    console.error('Compilation failed:', error.message);
  }
};
```

**Execute a workflow / เรียกใช้เวิร์กโฟลว์:**

```typescript
const executeWorkflow = trpc.workflow.execute.useMutation();

const handleExecute = async (workflowId: string) => {
  const result = await executeWorkflow.mutateAsync({
    workflow_id: workflowId,
    inputs: {
      prompt: 'Generate a product description',
      tone: 'professional'
    },
    config: {
      max_budget_credits: 500
    }
  });

  return result.execution_id;
};
```

**Poll for status / ตรวจสอบสถานะแบบ polling:**

```typescript
const { data: execution, refetch } = trpc.workflow.getStatus.useQuery(
  { executionId },
  {
    refetchInterval: 2000, // Poll every 2 seconds
    enabled: !!executionId,
  }
);

useEffect(() => {
  if (execution?.status === 'completed' || execution?.status === 'failed') {
    // Stop polling
    refetch.cancel();
  }
}, [execution?.status]);
```

---

### 2. JobCard Component

**Purpose / วัตถุประสงค์:**
Display real-time workflow execution status with approval gate UI.
แสดงสถานะการเรียกใช้เวิร์กโฟลว์แบบ real-time พร้อม UI สำหรับจุดอนุมัติ

**Usage / การใช้งาน:**

```tsx
import { JobCard } from '@/components/chat/JobCard';

function ChatInterface() {
  const [executionId, setExecutionId] = useState<string | null>(null);

  const handleApprove = async (requestId: string, comment: string) => {
    await trpc.approvals.submitDecision.mutate({
      requestId,
      decision: 'approved',
      comment
    });
  };

  const handleReject = async (requestId: string, comment: string) => {
    await trpc.approvals.submitDecision.mutate({
      requestId,
      decision: 'rejected',
      comment
    });
  };

  return (
    <div className="chat-container">
      {executionId && (
        <JobCard
          executionId={executionId}
          workflowName="Text Generation"
          initialStatus="running"
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
```

**Features / ฟีเจอร์:**
- ✅ Auto-refresh every 2s when status is "running"
- ✅ Status badges (pending, running, completed, failed, waiting_approval)
- ✅ Inline approval UI with comment field
- ✅ Dark mode support
- ✅ Accessible (ARIA labels, keyboard navigation)

---

## Dashboard Widgets / วิดเจ็ตในแดชบอร์ด

### 1. Active Workflows Widget

**Location / ตำแหน่ง:**
`apps/web/client/src/pages/Dashboard.tsx` (lines 183-218)

**Purpose / วัตถุประสงค์:**
Show all running workflow executions for the current user.
แสดงการเรียกใช้เวิร์กโฟลว์ที่กำลังทำงานสำหรับผู้ใช้ปัจจุบัน

**Features / ฟีเจอร์:**
- Lists execution ID, workflow name, and status
- Empty state when no active workflows
- Badge counter in section header
- Links to detailed execution view

**Code Example:**

```tsx
const { data: activeWorkflows } = trpc.workflow.list.useQuery({
  status: 'running'
});

return (
  <section>
    <h2 className="flex items-center gap-2">
      Active Workflows
      {activeWorkflows && activeWorkflows.length > 0 && (
        <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 rounded-full">
          {activeWorkflows.length}
        </span>
      )}
    </h2>

    {activeWorkflows?.map((exec) => (
      <JobCard
        key={exec.execution_id}
        executionId={exec.execution_id}
        workflowName={exec.workflow_name}
        initialStatus={exec.status}
      />
    ))}
  </section>
);
```

---

### 2. Pending Approvals Widget

**Location / ตำแหน่ง:**
`apps/web/client/src/pages/Dashboard.tsx` (lines 221-282)

**Purpose / วัตถุประสงค์:**
Show approval requests that need user action.
แสดงคำขออนุมัติที่ต้องการการดำเนินการจากผู้ใช้

**Features / ฟีเจอร์:**
- Risk level indicator (color-coded badges)
- Inline approve/reject buttons
- Comment field for approval decision
- Auto-refresh on decision submission
- Empty state when no pending approvals

**Code Example:**

```tsx
const { data: pendingApprovals, refetch } = trpc.approvals.getPending.useQuery();
const submitDecision = trpc.approvals.submitDecision.useMutation();

const handleApprove = async (requestId: string) => {
  await submitDecision.mutateAsync({
    requestId,
    decision: 'approved',
    comment: commentValue
  });

  refetch(); // Refresh the list
};

return (
  <section>
    <h2 className="flex items-center gap-2">
      Pending Approvals
      {pendingApprovals && pendingApprovals.length > 0 && (
        <span className="px-2 py-1 text-xs bg-orange-100 dark:bg-orange-900 rounded-full">
          {pendingApprovals.length}
        </span>
      )}
    </h2>

    {pendingApprovals?.map((request) => (
      <div key={request.id} className="approval-card">
        <h3>{request.title}</h3>
        <p>{request.description}</p>
        <span className={`risk-badge risk-${request.risk_level}`}>
          {request.risk_level.toUpperCase()}
        </span>

        <textarea
          placeholder="Add a comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <div className="actions">
          <button onClick={() => handleApprove(request.id)}>
            Approve
          </button>
          <button onClick={() => handleReject(request.id)}>
            Reject
          </button>
        </div>
      </div>
    ))}
  </section>
);
```

---

## Security & Budget / ความปลอดภัยและงบประมาณ

### Security Validations / การตรวจสอบความปลอดภัย

**1. Tool Allowlist** (37 allowed, 48 disallowed)

**Allowed tools / เครื่องมือที่อนุญาต:**
```python
ALLOWED_TOOLS = {
    # LLM operations
    "llm_call", "llm_stream",
    # Media generation
    "generate_image", "generate_video", "combine_videos",
    # File operations (sandboxed)
    "read_file", "write_file", "list_files",
    # Communication
    "send_email", "send_telegram",
    # Control flow
    "approval_gate", "conditional", "loop", "parallel",
}
```

**Disallowed tools / เครื่องมือที่ห้ามใช้ (security risks):**
```python
DISALLOWED_TOOLS = {
    # Code execution
    "execute_code", "execute_shell", "eval", "exec", "compile",
    # System commands
    "system", "popen", "subprocess",
    # Built-in access
    "__builtins__", "globals", "locals", "getattr", "setattr",
    # Network (use approved HTTP client instead)
    "socket", "urllib", "requests",
    # Serialization exploits
    "pickle", "marshal", "shelve", "dill",
}
```

**2. Prompt Injection Detection** (9 patterns blocked)

```python
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+previous\s+instructions?",
    r"disregard\s+.*\s+instructions?",
    r"forget\s+everything",
    r"system:\s*",
    r"<\|im_start\|>",
    r"<\|im_end\|>",
    r"\[INST\]",
    r"\[/INST\]",
    r"<<<SYSTEM>>>",
]
```

**3. Resource Limits** (DoS prevention)

```python
MAX_NODES = 100
MAX_EDGES = 200
MAX_LOOP_NESTING = 3
MAX_LOOP_ITERATIONS = 100  # Per loop node
```

**4. Budget Validation**

```python
# Negative cost check
if estimated_cost < 0:
    raise ValueError("Cost cannot be negative")

# 10x threshold check
if actual_cost > estimated_cost * 10:
    raise ValueError("Actual cost exceeds 10x estimate - possible manipulation")
```

---

### Budget Enforcement Flow / ขั้นตอนการบังคับใช้งบประมาณ

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Before Step Execution                                    │
├─────────────────────────────────────────────────────────────┤
│  - SELECT credits FROM users WHERE id = ? FOR UPDATE        │
│  - Check: credits >= estimated_cost                         │
│  - UPDATE users SET credits = credits - estimated_cost      │
│  - COMMIT (reservation complete)                            │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Step Execution                                           │
├─────────────────────────────────────────────────────────────┤
│  - Run LangGraph node                                       │
│  - Record actual tokens used                                │
└─────────────────────────────────────────────────────────────┘
                         ↓
         ┌──────────────┴──────────────┐
         ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│ 3a. On Success   │          │ 3b. On Failure   │
├──────────────────┤          ├──────────────────┤
│ Calculate diff:  │          │ Rollback:        │
│ actual - estimated│          │ credits +=       │
│                  │          │   estimated_cost │
│ If diff < 0:     │          │                  │
│   Refund credits │          │ Check idempotency│
│ If diff > 0:     │          │ tracker to avoid │
│   Deduct extra   │          │ double-rollback  │
└──────────────────┘          └──────────────────┘
```

**Idempotency Protection / การป้องกันการทำซ้ำ:**

```python
_rollback_tracker: dict[int, set[str]] = {}

async def rollback_budget_reservation(
    session: AsyncSession,
    user_id: int,
    execution_id: str,
    reserved_credits: int
):
    # Check if already rolled back
    if user_id not in _rollback_tracker:
        _rollback_tracker[user_id] = set()

    if execution_id in _rollback_tracker[user_id]:
        logger.warning("rollback_already_performed")
        return  # Don't rollback twice

    # Perform rollback
    await session.execute(
        update(User).where(User.id == user_id)
        .values(credits=User.credits + reserved_credits)
    )
    await session.commit()

    # Mark as rolled back
    _rollback_tracker[user_id].add(execution_id)
```

**⚠️ Note:** In-memory tracker prevents double-rollback in same process, but NOT distributed-safe. For multi-worker deployments, consider using Redis or database-backed tracker.

**⚠️ หมายเหตุ:** ตัวติดตามในหน่วยความจำป้องกันการย้อนกลับซ้ำในโปรเซสเดียวกัน แต่ไม่ปลอดภัยในระบบแบบกระจาย สำหรับการใช้งานแบบหลาย worker ให้พิจารณาใช้ Redis หรือฐานข้อมูลสำหรับติดตาม

---

## Testing / การทดสอบ

### Run All Tests / รันการทดสอบทั้งหมด

```bash
cd python-backend
uv run pytest tests/test_budget_enforcement.py \
              tests/test_approval_gates.py \
              tests/test_flow_compiler.py \
              tests/test_skill_manifest.py \
              tests/test_skill_api_validation.py \
              tests/test_workflows_api.py \
              -v
```

**Expected Output:**
```
tests/test_budget_enforcement.py::test_negative_cost_validation PASSED
tests/test_budget_enforcement.py::test_actual_cost_10x_threshold PASSED
tests/test_approval_gates.py::test_approval_service_creation PASSED
tests/test_flow_compiler.py::test_compile_basic_flow PASSED
tests/test_skill_manifest.py::test_prompt_injection_blocking PASSED
tests/test_workflows_api.py::test_compile_endpoint PASSED

======================== 52 passed in 3.42s =========================
```

### Test Coverage / ความครอบคลุมของการทดสอบ

```bash
uv run pytest --cov=app --cov-report=term-missing
```

**Current Coverage:**
- `app/services/budget.py`: 95%
- `app/services/approval_db_service.py`: 88%
- `app/services/manifest_validator.py`: 92%
- `app/orchestrator/flow_compiler.py`: 90%
- `app/api/workflows.py`: 85%
- `app/api/approvals.py`: 87%

---

## API Reference Quick Sheet / เอกสารอ้างอิง API แบบย่อ

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/workflows/compile` | POST | Compile ReactFlow → LangGraph |
| `/api/v1/workflows/execute` | POST | Execute workflow with budget |
| `/api/v1/workflows/{id}/status` | GET | Get execution status |
| `/api/v1/workflows/{id}/cancel` | POST | Cancel running workflow |
| `/api/v1/approvals/pending` | GET | List pending approvals |
| `/api/v1/approvals/{id}` | GET | Get approval details |
| `/api/v1/approvals/{id}/decision` | POST | Submit approval decision |
| `/api/v1/approvals/{id}/cancel` | POST | Cancel approval request |

**tRPC Routers:**
- `trpc.workflow.*` - Proxy to Python workflow API
- `trpc.approvals.*` - Proxy to Python approvals API

---

## Common Issues & Solutions / ปัญหาที่พบบ่อยและวิธีแก้ไข

### Issue 1: "BudgetExceededError"

**Problem / ปัญหา:**
User sees error "Insufficient credits. Step 'llm_call_1' requires 100 credits, but only 50 available."

**Solution / วิธีแก้:**
1. Check user's credit balance: `SELECT credits FROM users WHERE id = ?`
2. Top up credits via admin panel or API
3. Adjust workflow's `max_budget_credits` config to be more realistic

### Issue 2: Approval Request Expired

**Problem / ปัญหา:**
Approval request shows "EXPIRED" status and workflow is stuck.

**Solution / วิธีแก้:**
1. Check `expires_at` timestamp on approval request
2. Default timeout is 1 hour - adjust in workflow config
3. Run cleanup job: `ApprovalDBService.cleanup_expired_requests()`

### Issue 3: Workflow Compilation Failed

**Problem / ปัญหา:**
API returns "Disallowed tools found: execute_shell"

**Solution / วิธีแก้:**
1. Remove disallowed tool from ReactFlow canvas
2. Check `ALLOWED_TOOLS` list in `tool_allowlist.py`
3. Use approved alternatives (e.g., `read_file` instead of `open`)

### Issue 4: Prompt Injection Detected

**Problem / ปัญหา:**
Compilation fails with "Prompt injection patterns detected"

**Solution / วิธีแก้:**
1. Review node config for patterns like "ignore previous instructions"
2. Remove suspicious text from prompts
3. If false positive, report to security team for pattern adjustment

---

## Best Practices / แนวทางปฏิบัติที่ดี

### 1. Budget Planning / การวางแผนงบประมาณ

✅ **DO:**
- Set `max_budget_credits` based on workflow complexity
- Use `estimated_cost` conservatively (overestimate by 20-30%)
- Monitor actual vs estimated costs via audit logs

❌ **DON'T:**
- Set `max_budget_credits` too low (causes mid-execution failures)
- Ignore budget alerts
- Run workflows without testing cost first

### 2. Approval Gates / จุดอนุมัติ

✅ **DO:**
- Place approval gates BEFORE risky operations (code execution, API calls)
- Set meaningful `title` and `description` for context
- Use `risk_level` to prioritize review
- Set `expires_at` to prevent stale requests

❌ **DON'T:**
- Add approval gates after every step (slows workflow)
- Use vague descriptions ("Approve this")
- Leave approvals pending indefinitely

### 3. Security / ความปลอดภัย

✅ **DO:**
- Validate all user inputs in node configs
- Use tool allowlist (never bypass)
- Log all execution events for audit
- Enforce tenant isolation in multi-tenant deployments

❌ **DON'T:**
- Allow `execute_code` or `eval` in workflows
- Trust user-provided prompts without validation
- Share workflows across tenants without review

---

## Support & Resources / การสนับสนุนและแหล่งข้อมูล

**Documentation:**
- Planning doc: `planning/agentic-ai-workflow/PLAN.md`
- Implementation plan: `planning/agentic-ai-workflow/implementation/abstract-drifting-pillow.md`
- Architecture: Python backend (`python-backend/app/`) + Node.js tRPC bridge (`apps/web/server/routers/`)

**Source Code:**
- Backend: `python-backend/app/api/workflows.py`, `python-backend/app/api/approvals.py`
- Frontend: `apps/web/client/src/components/chat/JobCard.tsx`, `apps/web/client/src/pages/Dashboard.tsx`
- Services: `python-backend/app/services/budget.py`, `python-backend/app/services/approval_db_service.py`

**Commits:**
- Security fixes + backend integration: `23000d0`
- Frontend integration: `1de6b82`

**Contact:**
- Report bugs: GitHub Issues
- Feature requests: Create issue with label `feature-request`
- Security issues: security@smartaihub.app (private disclosure)

---

**Last Updated:** 2026-02-08
**Version:** 1.0.0
**Maintained By:** SmartAIHub Development Team
