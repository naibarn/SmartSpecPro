---
name: AI Agency Creator Visual Diagrams
description: ASCII diagrams showing data flow, state machine, and architecture
type: reference
---

# AI Agency Creator — Visual Diagrams

## 1. Complete Request → Response Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                            │
│                     AutoCreateAgencyModal.tsx                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  [Input Form]                                                        │
│  ┌─────────────────────────────────────────────┐                    │
│  │ Requirement: [textarea] (10-10k chars)      │                    │
│  │ Spec File:   [attach button]                │                    │
│  │ Submit:      [CREATE AGENCY button]         │                    │
│  └─────────────────────────────────────────────┘                    │
│           │                                                          │
│           │ onClick: handleSubmit()                                 │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────┐                    │
│  │ Call tRPC autoCreate mutation                │                    │
│  │ {                                             │                    │
│  │   requirement: "...",                        │                    │
│  │   specFileBase64?: "...",                    │                    │
│  │   model?: "gpt-4o",                          │                    │
│  │   skipInterview: false                       │                    │
│  │ }                                             │                    │
│  └─────────────────────────────────────────────┘                    │
│           │                                                          │
│           │ HTTP POST to tRPC endpoint                              │
│           ▼                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                      EXPRESS/tRPC (Node.js)                          │
│                  apps/web/server/routers/agency.ts                   │
│                       autoCreate mutation                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Parse & validate input (Zod)                                    │
│  2. Get Python backend URL from ENV                                 │
│  3. Add user_id, tenant_id to payload                               │
│  4. POST to Python: {pythonBackendUrl}/api/v1/agency-creator/start │
│  5. Headers: Authorization: Bearer {ctx.userToken}                  │
│  6. Return: { taskId: "agcreate-xxx" }                              │
│                                                                       │
│           │                                                          │
│           │ HTTP POST to Python backend                             │
│           ▼                                                          │
├─────────────────────────────────────────────────────────────────────┤
│                   PYTHON FASTAPI (Backend)                           │
│                   python-backend/app/api                             │
│                /api/v1/agency-creator/start endpoint                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Validate requirement (10-10k chars)                             │
│  2. Generate task_id: "agcreate-{12-char-hex}"                      │
│  3. Store in Redis: agency-creator:{task_id} = {                   │
│       status: "queued",                                             │
│       phase: "discover",                                            │
│       message: "Waiting in queue...",                               │
│       _user_id: current_user.id                                     │
│     }                                                                │
│  4. Enqueue Celery task: create_agency_discover_task.delay(...)    │
│  5. Return: { task_id: "agcreate-xxx" }                             │
│                                                                       │
│           │                                                          │
│           │ HTTP 200 + JSON response                                │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────┐                    │
│  │ Frontend receives taskId                    │                    │
│  │ Start polling via useEffect:                │                    │
│  │ → setInterval(2.5s) for autoCreateStatus   │                    │
│  │ → Max poll duration: 5 minutes              │                    │
│  │ → Show phase bar: DISCOVER → INTERVIEW...   │                    │
│  │ → Start elapsed timer                       │                    │
│  └─────────────────────────────────────────────┘                    │
│                                                                       │
│  ┌─────────────────────────────────────────────┐                    │
│  │ FRONTEND POLLS EVERY 2.5s                   │                    │
│  │ tRPC autoCreateStatus({ taskId })           │                    │
│  │ → GET {pythonBackendUrl}/status/{taskId}   │                    │
│  │ → Update phase/message based on response    │                    │
│  │                                              │                    │
│  │ Possible responses:                         │                    │
│  │ 1. { status: "processing", phase: "...",    │                    │
│  │      message: "..." } → Keep polling        │                    │
│  │ 2. { status: "awaiting_answers",            │                    │
│  │      questions: [...] } → Stop polling,     │                    │
│  │      show questions form                    │                    │
│  │ 3. { status: "completed", agencyId: "...",  │                    │
│  │      guide: "..." } → Stop polling,         │                    │
│  │      navigate to /agencies/{id}/edit       │                    │
│  │ 4. { status: "failed", error: "..." }       │                    │
│  │      → Stop polling, show error, offer retry│                    │
│  └─────────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Celery Task Execution Timeline

```
Timeline (relative seconds)

0s    Task 1 enqueued ──→ Celery picks up
      │
      ├─ 1-2s: DISCOVER phase starts
      │        LLM call: "analyse requirement"
      │        └─ 5-10s elapsed
      │
      ├─ 10s: DISCOVER phase completes
      │       Decision: is_clear?
      │
      ├─ Split 1: if is_clear OR skipInterview
      │           └─ Task 2 immediately enqueued
      │              Status: "processing", phase: "design"
      │
      └─ Split 2: if NOT clear
                  └─ Status: "awaiting_answers"
                     questions returned to frontend
                     ⏸ WAIT for user answers (variable time)
                     │
                     └─ User submits answers via autoCreateAnswer
                        │
                        └─ Task 2 enqueued by Python API
                           Status: "processing", phase: "design"

30s   Task 2 starts (may be immediate or after user answers)
      │
      ├─ DESIGN phase: 15-30s
      │  LLM call: "create multi-agent spec"
      │  Output: { nodes, edges, toolIds, rationale }
      │
      ├─ VALIDATE phase: <1s
      │  Self-review: entry point, node refs, tool whitelist
      │
      ├─ IMPLEMENT phase: 2-5s
      │  Call /api/internal/agency/create
      │  Create agency + agents + tools + edges in DB
      │
      ├─ VERIFY phase: <1s
      │  DB health check
      │
      ├─ DOCUMENT phase: 5-10s
      │  LLM call: "write usage guide"
      │
      └─ DONE: Status: "completed", agencyId: "...", guide: "..."

90s   Total (typical 30-90s, bottleneck: DESIGN + DOCUMENT LLM calls)

```

---

## 3. State Machine: Frontend

```
                        ┌─────────────┐
                        │   IDLE      │
                        │  (input     │
                        │   form)     │
                        └──────┬──────┘
                               │
                        Click "Create"
                               │
                               ▼
                        ┌──────────────┐
                        │   QUEUED     │  ← Set status + start polling
                        │ (brief, <1s) │
                        └──────┬───────┘
                               │
                    Task 1 starts in Celery
                               │
                               ▼
                        ┌──────────────┐
                   ┌────│ PROCESSING   │◄──────────────────┐
                   │    │  (polling    │                   │
                   │    │   every 2.5s)│                   │
                   │    └──────┬───────┘                   │
                   │           │                           │
                   │   Phase progression:                  │
                   │   DISCOVER → DESIGN →                │
                   │   VALIDATE → IMPLEMENT →             │
                   │   VERIFY → DOCUMENT                  │
                   │           │                           │
                   │    ┌──────┴──────┐                    │
                   │    │             │                    │
        (if questions)  ▼             │ (if no questions)  │
        ┌──────────────────────┐     │                    │
        │  AWAITING_ANSWERS    │     │                    │
        │  (show form)         │     │                    │
        └────────┬─────────────┘     │                    │
                 │                   │                    │
        User submits answers         │                    │
        autoCreateAnswer mutation    │                    │
                 │                   │                    │
                 └───────┬───────────┘                    │
                         │                                │
                  Task 2 enqueued ──────────────────────┘

                         │
                    (5-10 minutes)
                         │
                         ▼
                ┌──────────────────┐
                │   COMPLETED      │
                │ (show success)   │
                └────────┬─────────┘
                         │
                Navigate to canvas
                  /agencies/{id}/edit
                         │
                         ▼
                  ┌─────────────┐
                  │  HYDRATION  │
                  │  (canvas    │
                  │   loads)    │
                  └─────────────┘

Or on error:

        From PROCESSING or AWAITING_ANSWERS
                         │
                         ▼
                ┌──────────────────┐
                │     FAILED       │
                │ (show error)     │
                └────────┬─────────┘
                         │
                 Click "Try again"
                         │
                         ▼
                      IDLE
```

---

## 4. LLM Prompts (Simplified)

### DISCOVER Phase
```
System Prompt:
┌─────────────────────────────────────────────────────────────┐
│ You are an AI agency architect. Analyse the user's          │
│ requirement for building a multi-agent AI agency.           │
│                                                              │
│ Return JSON with:                                           │
│ {                                                           │
│   "is_clear": true/false,                                   │
│   "domain": "content_creation|research|...",                │
│   "estimated_agents": 2-6,                                  │
│   "questions": [{"id": "q1", "question": "?", "type": ...}],
│   "notes": "..."                                            │
│ }                                                           │
│                                                              │
│ Only ask truly necessary clarifying questions.              │
└─────────────────────────────────────────────────────────────┘

Input:
┌─────────────────────────────────────────────────────────────┐
│ Requirement: "Create a research team with 3 agents..."      │
└─────────────────────────────────────────────────────────────┘

Output (Example):
┌─────────────────────────────────────────────────────────────┐
│ {                                                           │
│   "is_clear": true,                                         │
│   "domain": "research",                                     │
│   "estimated_agents": 3,                                    │
│   "questions": [],  ← Already clear, no questions           │
│   "notes": "Requirement clearly describes 3-agent team"     │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### DESIGN Phase
```
System Prompt:
┌─────────────────────────────────────────────────────────────┐
│ You are an AI agency architect. Design a multi-agent agency │
│ based on the requirement.                                   │
│                                                              │
│ Return JSON with exact structure:                           │
│ {                                                           │
│   "name": "Agency Name",                                    │
│   "description": "...",                                     │
│   "nodes": [                                                │
│     {                                                       │
│       "id": "node-1",                                       │
│       "nodeType": "agent|supervisor|router|...",            │
│       "name": "Agent Name",                                 │
│       "description": "...",                                 │
│       "instructions": "Detailed instructions",              │
│       "model": "gpt-4o",                                    │
│       "isEntryPoint": true,  ← Only ONE entry point         │
│       "toolIds": ["builtin-web-search", "..."],             │
│       "nodeConfig": {...}                                   │
│     }                                                       │
│   ],                                                        │
│   "edges": [                                                │
│     {                                                       │
│       "fromNodeId": "node-1",                               │
│       "toNodeId": "node-2",                                 │
│       "flowType": "delegation|handoff|parallel"             │
│     }                                                       │
│   ],                                                        │
│   "rationale": "Design decisions"                           │
│ }                                                           │
│                                                              │
│ AVAILABLE TOOLS:                                            │
│ - builtin-web-search        → Internet search               │
│ - builtin-code-interpreter  → Python sandbox                │
│ - builtin-file-reader       → Read files                    │
│ - builtin-file-writer       → Create/modify files           │
│ - builtin-rag-knowledge     → Search knowledge base         │
│ - builtin-http-request      → Call REST APIs                │
│ - builtin-email-notify      → Send emails                   │
│ - builtin-webhook           → Send webhooks                 │
│ - builtin-slack-message     → Send Slack messages           │
│ - builtin-document-search   → Search documents              │
└─────────────────────────────────────────────────────────────┘

Input:
┌─────────────────────────────────────────────────────────────┐
│ Requirement: "Create a research team..."                    │
│ Domain analysis: {"is_clear": true, "domain": "research"...}│
│ Answers: (empty if no interview)                            │
└─────────────────────────────────────────────────────────────┘

Output (Example):
┌─────────────────────────────────────────────────────────────┐
│ {                                                           │
│   "name": "Research Team",                                  │
│   "description": "A 3-agent team for research tasks",       │
│   "nodes": [                                                │
│     {                                                       │
│       "id": "agent-1",                                      │
│       "nodeType": "agent",                                  │
│       "name": "Researcher",                                 │
│       "description": "Gathers information",                 │
│       "instructions": "Search the web and...",              │
│       "model": "gpt-4o",                                    │
│       "isEntryPoint": true,                                 │
│       "toolIds": ["builtin-web-search"],                    │
│       "nodeConfig": {}                                      │
│     },                                                      │
│     {                                                       │
│       "id": "agent-2",                                      │
│       "nodeType": "agent",                                  │
│       "name": "Analyst",                                    │
│       "description": "Processes information",               │
│       "instructions": "Analyse the data and...",            │
│       "model": "gpt-4o",                                    │
│       "isEntryPoint": false,                                │
│       "toolIds": ["builtin-code-interpreter"],              │
│       "nodeConfig": {}                                      │
│     },                                                      │
│     {                                                       │
│       "id": "agent-3",                                      │
│       "nodeType": "agent",                                  │
│       "name": "Writer",                                     │
│       "description": "Produces final report",               │
│       "instructions": "Write a comprehensive report...",    │
│       "model": "gpt-4o",                                    │
│       "isEntryPoint": false,                                │
│       "toolIds": ["builtin-file-writer"],                   │
│       "nodeConfig": {}                                      │
│     }                                                       │
│   ],                                                        │
│   "edges": [                                                │
│     {                                                       │
│       "fromNodeId": "agent-1",                              │
│       "toNodeId": "agent-2",                                │
│       "flowType": "delegation"                              │
│     },                                                      │
│     {                                                       │
│       "fromNodeId": "agent-2",                              │
│       "toNodeId": "agent-3",                                │
│       "flowType": "delegation"                              │
│     }                                                       │
│   ],                                                        │
│   "rationale": "Researcher gathers, Analyst processes..."   │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### DOCUMENT Phase
```
System Prompt:
┌─────────────────────────────────────────────────────────────┐
│ Write a concise usage guide (max 300 words).                │
│ Include: purpose, how to start, 3 example prompts.          │
└─────────────────────────────────────────────────────────────┘

Input:
┌─────────────────────────────────────────────────────────────┐
│ Agency: "Research Team"                                     │
│ Description: "A 3-agent team for research tasks"            │
│ Nodes: ["Researcher", "Analyst", "Writer"]                  │
└─────────────────────────────────────────────────────────────┘

Output (Example):
┌─────────────────────────────────────────────────────────────┐
│ # Research Team Usage Guide                                │
│                                                              │
│ ## Purpose                                                  │
│ This agency automates research workflows by coordinating    │
│ three specialized agents.                                   │
│                                                              │
│ ## How to Start                                             │
│ 1. Open a conversation with the agency                      │
│ 2. Describe your research topic or question                 │
│ 3. The Researcher will gather information...                │
│                                                              │
│ ## Example Prompts                                          │
│ - "Research the latest trends in AI..."                     │
│ - "Analyze the impact of climate change on..."              │
│ - "Write a comprehensive report on..."                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Database Creation Flow (Phase 5)

```
Spec JSON (from LLM Design phase)
    │
    ├─ Name, Description
    ├─ Agents (nodes[])
    │  ├─ id, nodeType, name, description
    │  ├─ instructions, model
    │  ├─ isEntryPoint, toolIds, nodeConfig
    │  └─ position: { x, y }
    │
    └─ Flows (edges[])
       ├─ id, fromNodeId, toNodeId
       └─ flowType


            │
            ▼ (Transform to DB schema)


POST /api/internal/agency/create
┌─────────────────────────────────────────────────────┐
│ {                                                   │
│   "name": "Research Team",                          │
│   "description": "...",                             │
│   "agents": [                                       │
│     {                                               │
│       "id": "agent-1",                              │
│       "name": "Researcher",                         │
│       "description": "...",                         │
│       "instructions": "...",                        │
│       "model": "gpt-4o",                            │
│       "nodeType": "agent",                          │
│       "nodeConfig": {},                             │
│       "isEntryPoint": true,                         │
│       "isOptional": false,                          │
│       "position": { "x": 400, "y": 80 },            │
│       "toolIds": ["builtin-web-search"],            │
│       "toolConfigs": {}                             │
│     }                                               │
│   ],                                                │
│   "communicationFlows": [                           │
│     {                                               │
│       "id": "edge-1",                               │
│       "fromAgentId": "agent-1",                     │
│       "toAgentId": "agent-2",                       │
│       "flowType": "delegation"                      │
│     }                                               │
│   ],                                                │
│   "tenantId": "tenant-123"                          │
│ }                                                   │
└─────────────────────────────────────────────────────┘
            │
            ▼ (Node.js /api/internal/agency/create)

Database Transactions:
┌─────────────────────────────────────────────────────┐
│ 1. INSERT INTO agencies (name, description, ...)    │
│    → agencyId: "uuid-1234"                          │
│                                                     │
│ 2. INSERT INTO agencyAgents (agencyId, nodeType,   │
│    name, description, instructions, model, ...)    │
│    → agentIds: ["agent-1", "agent-2", ...]         │
│                                                     │
│ 3. INSERT INTO agencyAgentTools (agentId, toolId)  │
│    → tool assignments for each agent               │
│                                                     │
│ 4. INSERT INTO agencyCommunicationFlows (          │
│    fromAgentId, toAgentId, flowType)               │
│    → communication flow definitions                 │
│                                                     │
│ All in single transaction (ACID guarantee)         │
└─────────────────────────────────────────────────────┘
            │
            ▼
Return: { id: "uuid-1234", agencyId: "uuid-1234" }
            │
            └─→ Stored in Redis under agencyId
                agencyId returned to frontend
                Frontend navigates to /agencies/{id}/edit
```

---

## 6. Canvas Hydration (Nodes & Edges)

```
Database agencies table
    │
    ├─ id, name, description, defaultModel, ...
    │
    └─ agents (JOIN agencyAgents)
       ├─ id, nodeType, name, description
       ├─ instructions, model
       ├─ isEntryPoint, position, nodeConfig
       │
       └─ tools (JOIN agencyAgentTools)
          ├─ toolId, toolConfig
          └─ toolName

    └─ flows (JOIN agencyCommunicationFlows)
       ├─ id, fromAgentId, toAgentId
       └─ flowType


            │
            ▼ (in AgencyBuilder.tsx useEffect)


ReactFlow Nodes (agents → nodes)
┌────────────────────────────────────────────────┐
│ Each agent becomes:                            │
│ {                                              │
│   id: "agent-1",                               │
│   type: "agency",  ← Single node type          │
│   position: { x: 400, y: 80 },                 │
│   data: {                                      │
│     nodeType: "agent",                         │
│     name: "Researcher",                        │
│     description: "...",                        │
│     instructions: "...",                       │
│     model: "gpt-4o",                           │
│     modelSettings: {},                         │
│     isEntryPoint: true,                        │
│     isOptional: false,                         │
│     nodeConfig: {},                            │
│     tools: [                                   │
│       {                                        │
│         toolId: "builtin-web-search",          │
│         toolName: "Web Search",                │
│         toolConfig: {}                         │
│       }                                        │
│     ]                                          │
│   }                                            │
│ }                                              │
└────────────────────────────────────────────────┘

ReactFlow Edges (flows → edges)
┌────────────────────────────────────────────────┐
│ Each flow becomes:                             │
│ {                                              │
│   id: "flow-1",                                │
│   source: "agent-1",                           │
│   target: "agent-2",                           │
│   type: "communication",                       │
│   data: {                                      │
│     flowType: "delegation"                     │
│   },                                           │
│   markerEnd: { type: "ArrowClosed" }           │
│ }                                              │
└────────────────────────────────────────────────┘
            │
            ▼ (Auto-layout if needed)

If all nodes have same position (all {0, 0}):
Apply tree layout algorithm:
  1. Find root nodes (no incoming edges)
  2. BFS level assignment
  3. Position: x = -totalWidth/2 + i * (width + gap)
              y = level * (height + gap)
            │
            ▼ (setNodes + setEdges)

ReactFlow Canvas
┌──────────────────────────────────────┐
│      [Researcher]                    │
│           │                          │
│           └──→ [Analyst]             │
│                    │                 │
│                    └──→ [Writer]     │
└──────────────────────────────────────┘
```

---

## 7. Polling Sequence Diagram

```
Time    Frontend              Backend             Redis
  │       (Poll every 2.5s)    (Process)         (Status)
  │
  0s  Create request
  │────────────────────────────────────→
  │                                 Create task_id
  │                                 Store status: "queued"
  │                                       │
  │                                 Enqueue Task 1 ────→
  │────────────────────────────←────────
  │       taskId received
  │       Start polling
  │
  2.5s ├─ Poll autoCreateStatus
  │    │────────────────────────────────→
  │    │                              Get from Redis
  │    │ Get: phase="discover"
  │    │       message="Analyzing..."
  │    │    ←─────────────────────────
  │    │ Update phase bar: DISCOVER ▓▓▓
  │    │
  5s  ├─ Poll again
  │    │────────────────────────────────→
  │    │ Get: phase="discover" (still processing)
  │    │    ←─────────────────────────
  │    │ Update phase bar
  │    │
  10s ├─ Poll again
  │    │────────────────────────────────→
  │    │                              DISCOVER completed
  │    │                              is_clear=true?
  │    │                              YES → enqueue Task 2
  │    │ Get: phase="design"
  │    │       message="Designing..."
  │    │    ←─────────────────────────
  │    │ Update phase bar: DISCOVER ✓ DESIGN ▓▓▓
  │    │
  12.5s ├─ Poll again
  │    │────────────────────────────────→
  │    │ Get: phase="design" (still processing)
  │    │    ←─────────────────────────
  │    │
  ... [many polls during DESIGN, VALIDATE, IMPLEMENT]
  │
  60s ├─ Poll again
  │    │────────────────────────────────→
  │    │                              Task 2 completed
  │    │                              agencyId = "uuid"
  │    │ Get: status="completed"
  │    │       agencyId="uuid"
  │    │       guide="Usage guide..."
  │    │    ←─────────────────────────
  │    │ Stop polling
  │    │ Show success toast
  │    │ Call onCreated("uuid")
  │    │ Navigate to /agencies/uuid/edit
  │    │
  │    └─ AgencyBuilder loads
  │       Fetch agency via tRPC
  │       Hydrate ReactFlow canvas
  │
  65s │ Canvas ready, user can edit

If timeout (5 min):
  │
  300s ├─ Poll again
  │    │────────────────────────────────→
  │    │                              Timeout check
  │    │                              Max wait exceeded
  │    │ Get: error (or 404)
  │    │    ←─────────────────────────
  │    │ Stop polling
  │    │ Show error: "Creation timed out"
  │    │ Offer "Try again" button

If interview needed:
  │
  10s ├─ Poll again
  │    │────────────────────────────────→
  │    │ Get: status="awaiting_answers"
  │    │       questions=[{id, question}]
  │    │    ←─────────────────────────
  │    │ Stop polling
  │    │ Show question form
  │    │ User fills form + Submit
  │    │
  15s │ Call autoCreateAnswer
  │    │────────────────────────────────→
  │    │                              Store answers in Redis
  │    │                              Enqueue Task 2
  │    │    ←─────────────────────────
  │    │ Resume polling
  │    │ phase="design", message="Designing..."
```

