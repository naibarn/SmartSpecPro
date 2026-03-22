---
name: AI Agency Creator Complete Flow
description: End-to-end data flow from user description through canvas hydration (7-phase pipeline: DISCOVER → INTERVIEW → DESIGN → VALIDATE → IMPLEMENT → VERIFY → DOCUMENT)
type: reference
---

# AI Agency Creator — Complete Flow

## Overview

The AI Agency Creator is a 7-phase automated system that transforms a user's text requirement into a fully-built multi-agent swarm on the ReactFlow canvas. The flow spans **Node.js frontend → tRPC → Python backend (Celery tasks) → LLM → database → back to canvas**.

**Key constraint**: Celery cannot block-wait for user input. Solution: Split into 2 tasks with Redis status storage (discover + design phases).

---

## Complete Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│ 1. FRONTEND: User Types Requirement & Clicks "Create Agency"   │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 2. FRONTEND: Send to tRPC autoCreate (Node.js)                │
│    - Requirement (max 10,000 chars)                            │
│    - Optional spec file (base64, max 7.5 MB)                   │
│    - Model (default: "gpt-4o")                                 │
│    - skipInterview flag (default: false)                       │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 3. TRPC BRIDGE: autoCreate routes to Python FastAPI endpoint   │
│    /api/v1/agency-creator/start                               │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 4. PYTHON FASTAPI: start_agency_creator                        │
│    - Creates task_id: "agcreate-{12-char-hex}"                │
│    - Enqueues Celery task: create_agency_discover_task         │
│    - Returns task_id to client immediately                     │
│    - Stores initial status in Redis                            │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 5. CELERY TASK 1: create_agency_discover_task (PHASES 1-2)    │
│    → DISCOVER: LLM analyzes requirement, returns intent dict   │
│    → INTERVIEW: LLM decides if clarifying questions needed     │
│                                                                 │
│    If is_clear=true OR skipInterview=true:                    │
│      Immediately enqueue Task 2 (design) in Celery            │
│      Status: "processing", phase: "design"                     │
│                                                                 │
│    Else if questions exist:                                    │
│      Status: "awaiting_answers"                               │
│      Store questions + payload + intent in Redis              │
│      Return to frontend (stop polling Task 2)                 │
│                                                                 │
│    Status stored in Redis:                                     │
│      Key: "agency-creator:{task_id}"                          │
│      TTL: 2 hours                                              │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
         (if no interview needed)    (if interview needed)
                    │                            │
                    ▼                            ▼
          ┌──────────────────┐      ┌──────────────────────┐
          │ SKIP INTERVIEW   │      │ SHOW QUESTIONS       │
          │ Jump to Step 6   │      │ User submits answers │
          └──────────────────┘      │ Call autoCreateAnswer│
                                    └──────────────┬───────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────┐
                                    │ PYTHON FASTAPI:      │
                                    │ /answer endpoint     │
                                    │ - Store answers      │
                                    │ - Enqueue Task 2     │
                                    │ - status→processing  │
                                    └──────────────┬───────┘
                                                   │
                    ┌──────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────┐
│ 6. CELERY TASK 2: create_agency_design_task (PHASES 3-7)      │
│    → DESIGN: LLM creates spec (nodes, edges, tools)           │
│    → VALIDATE: Self-review and fix spec issues               │
│    → IMPLEMENT: Call /api/internal/agency/create              │
│    → VERIFY: Agency created in database                        │
│    → DOCUMENT: Generate usage guide for user                   │
│                                                                 │
│    After each phase, status updated in Redis with phase/msg    │
│                                                                 │
│    On completion:                                              │
│      Status: "completed"                                       │
│      agencyId: returned from internal API                      │
│      previewJson: full spec for preview                        │
│      guide: usage guide text                                   │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 7. FRONTEND POLLING: autoCreateStatus queries every 2.5s       │
│    While taskStatus = "queued" | "processing" | "awaiting"    │
│                                                                 │
│    Poll endpoint: /api/v1/agency-creator/status/{taskId}      │
│    Max poll duration: 5 minutes (graceful timeout)             │
│                                                                 │
│    Frontend renders:                                           │
│    - Phase progress bar (DISCOVER → INTERVIEW → ... → DONE)   │
│    - Status message + elapsed time                             │
│    - Interview form (if awaiting_answers)                      │
│    - Error message (if failed)                                 │
│    - Completion message (if completed)                         │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 8. ON COMPLETION: Frontend navigates to canvas                │
│    → onCreated(agencyId) callback fired                        │
│    → setLocation(`/agencies/{agencyId}/edit`)                 │
│    → Modal closes                                              │
└─────────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│ 9. CANVAS HYDRATION: AgencyBuilder page loads agency           │
│    → trpc.agency.getById query fetches full agency with agents │
│    → Convert agents to ReactFlow nodes                         │
│    → Convert communication flows to edges                      │
│    → Auto-layout nodes if needed (tree layout)                │
│    → Render canvas with all nodes, edges, and tools          │
└────────────────────────────────────────────────────────────────┘
```

---

## Phase Details

### PHASE 1: DISCOVER (LLM Analysis)

**Location**: `python-backend/app/tasks/agency_creator_task.py::_discover_async()`

**LLM Call**:
```
System Prompt: "You are an AI agency architect. Analyse the user's requirement..."

Expected JSON Response:
{
  "is_clear": true/false,
  "domain": "string",  // e.g. "content_creation", "research", "customer_support"
  "estimated_agents": 2,
  "questions": [
    {"id": "q1", "question": "...", "type": "text"}
  ],
  "notes": "..."
}
```

**Status Stored**:
- phase: "discover"
- message: "Understanding your requirement..."

**Decision Point**:
- If `is_clear=true` OR `skipInterview=true` → Skip to Phase 3 (design)
- Else if questions exist → Transition to Phase 2 (interview)
- Else → Skip to Phase 3

---

### PHASE 2: INTERVIEW (Clarification Questions)

**Trigger**: Discover phase returned questions

**Frontend**:
- Renders question form (AutoCreateAgencyModal, lines 383-413)
- User provides answers
- Call autoCreateAnswer mutation

**Python Endpoint**: `/api/v1/agency-creator/answer`
- Validate task_id exists and is in "awaiting_answers" status
- Store answers in Redis: key = `agency-creator:{task_id}:ans`
- Enqueue Task 2 (design) with answers + intent + payload

**Status Stored**:
- phase: "interview"
- questions: array returned from DISCOVER phase

**Transition**: After submission, status changes to "processing" + phase: "design"

---

### PHASE 3: DESIGN (LLM Agency Architecture)

**Location**: `python-backend/app/tasks/agency_creator_task.py::_design_async()`

**LLM Call**:
```
System Prompt: "You are an AI agency architect. Design a multi-agent agency..."

Input: Requirement + Intent (from Phase 1) + Answers (from Phase 2)

Expected JSON Response:
{
  "name": "Agency Name",
  "description": "What this agency does",
  "nodes": [
    {
      "id": "node-1",
      "nodeType": "agent" | "supervisor" | "router" | "aggregator" | "knowledge_base" | "skill_call" | "human_approval",
      "name": "Agent Name",
      "description": "...",
      "instructions": "Detailed instructions",
      "model": "gpt-4o",
      "isEntryPoint": true,  // Only ONE entry point, must be agent or supervisor
      "toolIds": ["builtin-web-search", "builtin-code-interpreter", ...],
      "nodeConfig": {
        // Type-specific config
        // Router example: { routingMode: "llm_classify", routes: [...], defaultTargetNodeId: "node-2" }
      }
    }
  ],
  "edges": [
    {
      "fromNodeId": "node-1",
      "toNodeId": "node-2",
      "flowType": "delegation" | "handoff" | "parallel"
    }
  ],
  "rationale": "Explanation of design decisions"
}
```

**Available Tools** (10 builtin tools):
- `builtin-web-search` — Real-time internet search
- `builtin-code-interpreter` — Python sandbox execution
- `builtin-file-reader` — Read workspace files
- `builtin-file-writer` — Create/modify files
- `builtin-rag-knowledge` — Search knowledge base docs
- `builtin-http-request` — Call external REST APIs
- `builtin-email-notify` — Send emails
- `builtin-webhook` — Send webhooks
- `builtin-slack-message` — Send Slack messages
- `builtin-document-search` — Search document collections

**Tool Assignment Rules**:
- Research/data agents → web-search, http-request
- Communication agents → email-notify, slack-message, webhook
- Analysis/coding agents → code-interpreter, web-search
- Document agents → rag-knowledge, document-search, file-reader
- Content creation → file-writer, web-search
- Always assign at least web-search for real-time data
- Always assign email-notify if requirement mentions notifications

**Status Stored**:
- phase: "design"
- message: "Designing agency architecture..."

---

### PHASE 4: VALIDATE (Self-Review)

**Location**: `python-backend/app/tasks/agency_creator_task.py::_validate_spec()`

**Validations Performed**:
1. **Entry Point**: Ensure exactly ONE entry point, must be agent or supervisor
   - If missing → assign first agent/supervisor
   - If multiple → keep only first
   - If wrong type → reassign to first agent/supervisor

2. **Node References**: Remove edges that reference non-existent nodes

3. **Router Config**: Ensure routers have:
   - `routingMode` (default: "llm_classify")
   - `routes` array
   - `defaultTargetNodeId` (if missing, points to last non-router node)

4. **Tool IDs**: Validate against whitelist, remove invalid IDs

**Status Stored**:
- phase: "validate"
- message: "Validating architecture spec..."

---

### PHASE 5: IMPLEMENT (Database Creation)

**Location**: `python-backend/app/tasks/agency_creator_task.py::_implement_agency()`

**Action**: Call internal Node.js API

**Endpoint**: `POST /api/internal/agency/create`

**Headers**:
- `X-Internal-Token`: Service-to-service auth token
- `X-User-Id`: Requesting user ID
- `Content-Type`: application/json

**Request Body**:
```json
{
  "name": "Agency Name",
  "description": "...",
  "agents": [
    {
      "id": "node-1",
      "name": "Agent Name",
      "description": "...",
      "instructions": "...",
      "model": "gpt-4o",
      "nodeType": "agent",
      "nodeConfig": {},
      "isEntryPoint": true,
      "isOptional": false,
      "position": { "x": 400, "y": 80 },
      "toolIds": ["builtin-web-search"],
      "toolConfigs": {}
    }
  ],
  "communicationFlows": [
    {
      "id": "edge-1",
      "fromAgentId": "node-1",
      "toAgentId": "node-2",
      "flowType": "delegation"
    }
  ],
  "tenantId": "tenant-123"  // Optional
}
```

**Response**:
```json
{
  "id": "agency-uuid",
  "agencyId": "agency-uuid"  // Either key works
}
```

**Status Stored**:
- phase: "implement"
- message: "Creating agency in database..."
- previewJson: Full spec for preview
- agencyId: Returned from API (stored once received)

---

### PHASE 6: VERIFY

**Location**: Agency now exists in database

**Action**: No-op (immediate transition to Phase 7)

**Status Stored**:
- phase: "verify"
- message: "Verifying agency..."
- agencyId: Same as Phase 5

---

### PHASE 7: DOCUMENT (Usage Guide Generation)

**Location**: `python-backend/app/tasks/agency_creator_task.py::_llm_document()`

**LLM Call**:
```
System Prompt: "Write a concise usage guide (max 300 words). Include: purpose, how to start, 3 example prompts."

User Message: "Agency: {name}\nDescription: {description}\nNodes: [list of agent names]"

Response: Plain text guide (max 500 tokens)
```

**Status Stored**:
- phase: "document"
- message: "Writing usage guide..."
- guide: Generated guide text

---

### PHASE 8: DONE (Completion)

**Status Stored**:
```json
{
  "status": "completed",
  "phase": "done",
  "agencyId": "agency-uuid",
  "previewJson": { full spec },
  "guide": "usage guide text",
  "_user_id": user_id,
  "createdAt": "ISO timestamp"
}
```

**Frontend Behavior**:
- Stop polling
- Show success toast
- Call `onCreated(agencyId)` callback
- Navigate to `/agencies/{agencyId}/edit`
- Modal closes

---

## Frontend Implementation Details

### AutoCreateAgencyModal Component
**File**: `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx`

**State Management**:
```typescript
const [requirement, setRequirement] = useState("");          // User input (max 10k)
const [attachedFile, setAttachedFile] = useState(null);     // Optional spec file
const [taskId, setTaskId] = useState(null);                 // Task ID from API
const [taskStatus, setTaskStatus] = useState("idle");       // Polling status
const [currentPhase, setCurrentPhase] = useState("");        // Current phase ID
const [statusMessage, setStatusMessage] = useState("");     // Status message
const [questions, setQuestions] = useState([]);             // Interview questions
const [answers, setAnswers] = useState({});                 // User answers
const [errorMsg, setErrorMsg] = useState("");               // Error message
const [elapsedSeconds, setElapsedSeconds] = useState(0);    // Timer for display
const [guide, setGuide] = useState("");                     // Usage guide text
```

**Modal States** (sequential):
1. **"idle"** → Input form (requirement + optional file)
2. **"queued" / "processing"** → Phase progress bar + timer
3. **"awaiting_answers"** → Interview questions form
4. **"completed"** → Success message + guide preview
5. **"failed"** → Error message + "Try again" button

**Polling Mechanism**:
```typescript
const POLL_INTERVAL_MS = 2500;          // Poll every 2.5 seconds
const MAX_POLL_WAIT_MS = 5 * 60 * 1000; // Max 5 minutes total

// Polling starts after Task 1 enqueued
// Continues while status = "queued" | "processing" | "awaiting_answers"
// Stops on: "completed" | "failed" | timeout
```

**File Upload Validation**:
- Max 7.5 MB
- Allowed types: PDF, DOCX, TXT, MD
- Converts to base64 for transmission

### tRPC Procedures (Node.js Bridge)

**File**: `apps/web/server/routers/agency.ts` (lines 2260-2362)

**1. autoCreate Mutation**
```typescript
.input({
  requirement: string (10-10000),
  specFileBase64?: string (max 10M),
  model?: string (max 100, default "gpt-4o"),
  skipInterview?: boolean (default false)
})
.mutation(async ({ ctx, input }) => {
  // Bridge to Python FastAPI
  POST {pythonBackendUrl}/api/v1/agency-creator/start
  Headers: Authorization: Bearer {userToken}
  Body: requirement, spec_file_base64, model, skip_interview, user_id, tenant_id
  Response: { task_id: "agcreate-{12-hex}" }
})
```

**2. autoCreateStatus Query**
```typescript
.input({
  taskId: string (regex: ^agcreate-[a-f0-9]{12}$)
})
.query(async ({ ctx, input }) => {
  // Bridge to Python FastAPI
  GET {pythonBackendUrl}/api/v1/agency-creator/status/{taskId}
  Headers: Authorization: Bearer {userToken}
  Response: {
    status: "queued" | "processing" | "awaiting_answers" | "completed" | "failed",
    phase?: string,
    message?: string,
    questions?: [{ id, question, type }],
    previewJson?: object,
    agencyId?: string,
    guide?: string,
    error?: string
  }
})
```

**3. autoCreateAnswer Mutation**
```typescript
.input({
  taskId: string (regex: ^agcreate-[a-f0-9]{12}$),
  answers: Record<string, string>
})
.mutation(async ({ ctx, input }) => {
  // Bridge to Python FastAPI
  POST {pythonBackendUrl}/api/v1/agency-creator/answer
  Headers: Authorization: Bearer {userToken}
  Body: { task_id: taskId, answers }
  Response: { ok: true }
})
```

---

## Canvas Hydration (Post-Creation)

### Navigation
**File**: `apps/web/client/src/pages/AgencyBuilder.tsx` (line 814-817)
```typescript
onCreated={(newAgencyId) => {
  setAutoCreateOpen(false);
  setLocation(`/agencies/${newAgencyId}/edit`);
}}
```

### Data Fetching
**File**: `apps/web/client/src/pages/AgencyBuilder.tsx` (lines 247-257)
```typescript
const { data: agencyData, isLoading: agencyLoading } =
  trpc.agency.getById.useQuery(
    { id: agencyId },
    {
      enabled: !!agencyId && !isNew,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
```

### Node Hydration (lines 263-323)
```typescript
// Convert agents to ReactFlow nodes
const agentNodes: Node<AgencyNodeData>[] = rawAgents.map((agent, idx) => ({
  id: agent.id,
  type: "agency",
  position: agent.position ?? { x: 0, y: 0 },  // or auto-layout if all same
  data: {
    nodeType: agent.nodeType,
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    model: agent.model,
    modelSettings: agent.modelSettings,
    isEntryPoint: agent.isEntryPoint,
    isOptional: agent.isOptional,
    nodeConfig: agent.nodeConfig,
    tools: agent.agentToolAssignments.map(t => ({
      toolId: t.toolId,
      toolName: t.toolName,
      toolConfig: t.toolConfig
    }))
  }
}));

// Convert communication flows to edges
const flowEdges: Edge[] = (agencyData.communicationFlows ?? []).map(flow => ({
  id: flow.id,
  source: flow.fromAgentId,
  target: flow.toAgentId,
  type: "communication",
  data: { flowType: flow.flowType }
}));

setNodes(agentNodes);
setEdges(flowEdges);
```

### Auto-Layout Logic (lines 50-134)
If all nodes have identical positions (from creation), ReactFlow applies a tree layout:
- Find root nodes (no incoming edges)
- BFS to assign levels
- Position nodes in grid: `x: -totalWidth/2 + i * (nodeWidth + gap)`, `y: level * (nodeHeight + gap)`

---

## Redis Storage Architecture

### Keys Used:
```
agency-creator:{task_id}        → Task status + metadata (TTL: 2 hours)
agency-creator:{task_id}:ans    → Interview answers (TTL: 2 hours)
```

### Status Object Structure:
```json
{
  "status": "queued|processing|awaiting_answers|completed|failed",
  "phase": "discover|interview|design|validate|implement|verify|document|done",
  "message": "Human-readable status message",
  "_user_id": user_id,
  "_payload": { payload },        // Stored during interview (internal)
  "_intent": { intent },          // Stored during interview (internal)
  "_model": "gpt-4o",             // Stored during interview (internal)
  "questions": [{ id, question, type }],  // During interview phase
  "previewJson": { spec },        // During/after design phase
  "agencyId": "uuid",             // After implement phase
  "guide": "guide text",          // After document phase
  "error": "error message"         // On failure
}
```

### Key Security Notes:
- `_user_id` enforced: Only user who created task can poll status
- `_user_jwt` intentionally omitted: Never store bearer tokens at rest
- All internal fields (prefixed `_`) stripped before returning to client
- TTL ensures data doesn't persist indefinitely

---

## LLM Call Architecture

### Client
All LLM calls go through `LLMGatewayClient` in Python backend:
```python
gateway = LLMGatewayClient()
data = await gateway.chat_completion(
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ],
    model=model,
    user_id=user_id,
    temperature=0.7,
    max_tokens=max_tokens,
    timeout=timeout
)
```

### Error Handling
- Failed LLM calls logged but don't fail task
- Fallback specs returned (minimal single-agent design)
- Task completes even if LLM fails (user can edit manually)

---

## Error Handling & Recovery

### Frontend Timeouts
- Max poll duration: 5 minutes
- On timeout: status = "failed", show error message
- User can click "Try again" to reset form

### Python Backend Errors
- Soft time limits: 300s (discover), 540s (design)
- Hard time limits: 360s (discover), 600s (design)
- Failures logged with full traceback
- Status set to "failed" with error message returned to client

### LLM Call Errors
- Caught and logged (not raised)
- Fallback spec returned
- Task continues

### Database Errors
- If create fails → status = "failed", previewJson preserved for user inspection
- User can use previewJson to debug or retry manually

---

## Rate Limiting

**Procedure**: `autoCreate`
- Namespace: "agency-create"
- Limit: 5 requests
- Window: 60 seconds (1 per 12 seconds max)

This prevents user from spamming agency creations.

---

## Data Transformation Points

### 1. Frontend → tRPC (Input Validation)
- Requirement: 10-10000 chars
- File: base64, max 10 MB
- Model: string, max 100 chars

### 2. tRPC → Python (Header Enrichment)
- Add user_id, tenant_id
- Add Bearer token for auth

### 3. Python → Celery (Serialization)
- All arguments must be JSON-serializable
- Datetime objects converted to ISO strings
- No model instances (only dicts)

### 4. Celery Task → LLM (Prompt Construction)
- Requirement + intent (Phase 1 output) + answers (Phase 2 output)
- System prompts tuned for JSON output

### 5. LLM Response → Spec Validation
- Parse JSON from LLM response (handles markdown code blocks)
- Validate node IDs, edge references
- Ensure exactly one entry point
- Fix router configs

### 6. Spec → Database Creation
- Transform spec nodes to agent rows
- Create agency + agents + tools + edges in single transaction
- Return agencyId

### 7. Database → Frontend (Hydration)
- Load full agency with agents + tools + edges
- Convert to ReactFlow nodes/edges
- Apply auto-layout if needed

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` | Frontend modal, polling logic, UI states |
| `apps/web/server/routers/agency.ts` (lines 2260-2362) | tRPC procedures (autoCreate, autoCreateStatus, autoCreateAnswer) |
| `python-backend/app/api/agency_creator.py` | FastAPI endpoints (/start, /status/{id}, /answer) |
| `python-backend/app/tasks/agency_creator_task.py` | Celery tasks (discover, design) + LLM calls + validation |
| `apps/web/client/src/pages/AgencyBuilder.tsx` | Canvas page, agency hydration, ReactFlow integration |

---

## Testing Scenarios

### Happy Path
1. User enters requirement (no interview needed)
2. Discover → Design (no questions)
3. Agency created in ~30-60s
4. Canvas loads with all nodes + edges

### Interview Path
1. User enters ambiguous requirement
2. Discover returns questions
3. Frontend renders question form
4. User answers → Design task queued
5. Design runs, agency created
6. Canvas loads

### Error Path
1. LLM call fails (network issue)
2. Fallback spec returned (single-agent minimal)
3. Task completes (user can edit)
4. Canvas loads with fallback

### Timeout Path
1. Slow network / overloaded server
2. Poll timeout after 5 minutes
3. User sees error message
4. User clicks "Try again"
5. Form reset to input step

---

## Performance Characteristics

| Phase | Typical Duration | Bottleneck |
|-------|------------------|-----------|
| DISCOVER | 5-10s | LLM analysis time |
| INTERVIEW | N/A | User response time |
| DESIGN | 15-30s | LLM generation + validation |
| VALIDATE | <1s | Spec self-review |
| IMPLEMENT | 2-5s | Database transaction + API latency |
| VERIFY | <1s | DB check |
| DOCUMENT | 5-10s | LLM guide generation |
| **Total** | **30-90s** | Design + Document phases |

**Bottleneck**: LLM call latency (design phase is slowest)

---

## Security Considerations

### Authentication
- All endpoints require `Authorization: Bearer {token}`
- User ID enforced at multiple points
- Tenant isolation via tenantId parameter

### Validation
- Input limits (10k chars requirement, 7.5 MB file, 100 char model)
- Regex validation on task IDs
- Schema validation on all responses

### Data Protection
- Answers stored in Redis (not logged)
- No bearer tokens persisted at rest
- Internal fields (_user_id, _payload) stripped before client response

### File Upload
- Size limit + type whitelist
- Base64 encoding (no arbitrary file execution)
- Optional field (not required)

---

## Future Improvements

1. **Streaming**: SSE instead of polling for real-time updates
2. **Cancellation**: Allow user to cancel in-flight tasks
3. **Preview**: Show spec preview during design phase (before creation)
4. **Validation Feedback**: Show validation errors before design + allow edits
5. **Tool Suggestions**: AI recommends tools based on agent instructions
6. **Multi-language**: Support requirement in non-English languages
7. **Template Library**: Preset templates for common agency types (research team, customer support, content pipeline)
