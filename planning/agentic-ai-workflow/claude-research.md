# Agentic AI Workflow System - Research Findings

This document combines codebase analysis and industry best practices research to inform the implementation of an Agentic AI system with approval gates, skill marketplace, virtual flow builder, and AI secretary capabilities.

---

## Table of Contents

1. [Codebase Architecture Overview](#codebase-architecture-overview)
2. [ChromaDB & Vector Database Integration](#chromadb--vector-database-integration)
3. [LLM Integration & Multi-Provider Architecture](#llm-integration--multi-provider-architecture)
4. [Workflow & State Management](#workflow--state-management)
5. [Approval Gates & Human-in-the-Loop](#approval-gates--human-in-the-loop)
6. [LangGraph Best Practices (2025-2026)](#langgraph-best-practices-2025-2026)
7. [Virtual Flow Builder with React Flow](#virtual-flow-builder-with-react-flow)
8. [AI Secretary Integrations](#ai-secretary-integrations)
9. [Testing Infrastructure](#testing-infrastructure)
10. [Key Implementation Patterns](#key-implementation-patterns)
11. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)

---

## Codebase Architecture Overview

### System Structure

SmartSpecPro is a **Turborepo monorepo** with three major layers:

```
FRONTEND (React 19 + Vite)
    ↓ (tRPC type-safe RPC)
BACKEND (Node.js + Express + tRPC)
    ↓ (HTTP/async tasks)
PYTHON BACKEND (FastAPI + Celery)
    + LLM Gateway (multi-provider proxy)
    + Media Generation (orchestrated tasks)
    + Workflow Engine (LangGraph-based)
```

**Key Technology Stack:**
- **Frontend**: React 19, Vite 7, TailwindCSS 4, Radix UI, Wouter, TanStack Query
- **Backend (Node)**: Express, tRPC 11, Drizzle ORM, PostgreSQL, Redis, BullMQ
- **Backend (Python)**: FastAPI, SQLAlchemy 2, Celery, LangChain/LangGraph
- **Build**: Turborepo, pnpm workspaces

---

## ChromaDB & Vector Database Integration

### Current Implementation

ChromaDB is **already installed and configured** in the Python backend:

**Location**: `/python-backend/app/core/vectordb.py`

**Storage Modes:**
- **Ephemeral (development)**: In-memory, fast
- **Persistent (production)**: Directory-based at `~/.smartspec/chroma`

**Configuration:**
```python
persist_directory: str           # Default: ~/.smartspec/chroma
anonymized_telemetry: bool      # Default: False
allow_reset: bool               # Default: True
```

### Existing RAG Implementation

Located at `/python-backend/app/orchestrator/rag/`:

- **`hybrid_rag.py`** - Combined semantic + BM25 search
- **`vector_retriever.py`** - Semantic search using embeddings
- **`bm25_retriever.py`** - Full-text search
- **`reranker.py`** - Result ranking/filtering

**Usage Pattern:**
```python
from app.orchestrator.rag.hybrid_rag import HybridRAG

retriever = HybridRAG(client, collection_name="skills")
results = await retriever.retrieve(query, k=5)  # Top-5 semantic matches
```

### Metadata Filtering Best Practices

ChromaDB supports MongoDB-style query syntax:

**Operators Available:**
- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- **Membership**: `$in`, `$nin`
- **Logical**: `$and`, `$or` (with nesting support)

**Example:**
```python
results = collection.query(
    query_embeddings=query_vector,
    n_results=10,
    where={
        "$and": [
            {"category": {"$eq": "scheduling"}},
            {"complexity": {"$lte": 3}},
            {"tags": {"$in": ["approved", "featured"]}}
        ]
    }
)
```

### Vector Database Selection (2025-2026 Guidance)

| Database | Best For | Performance | Cost |
|----------|----------|-------------|------|
| **ChromaDB** | Prototyping, <100K vectors | Good | Free |
| **Pinecone** | Production speed priority | Excellent (<50ms queries) | $200-500/month |
| **Qdrant** | Resource-conscious production | Very good | $50-150/month |
| **Weaviate** | Hybrid semantic + keyword | Good | $100-300/month |

**Recommendation**:
- Keep ChromaDB for MVP/development
- Migrate to **Qdrant** for production (best cost/performance balance for our scale)
- Use **Pinecone** if query latency is critical (<50ms requirement)

### Embedding Models (2025-2026)

| Model | Type | Best For |
|-------|------|----------|
| **E5-Mistral** | Open-source | Multilingual, general-purpose |
| **BGE-M3** | Open-source | Cross-language, scalable |
| **OpenAI text-embedding-3** | API | Production stability |
| **Cohere Embed v3** | API | Long documents (8K tokens) |

**Current Setup**: System already has LLM proxy that handles embeddings via `embeddings.create(text)` API.

### Reranking Strategy

**Why Needed**: Two-stage retrieval improves accuracy by 20-48% according to recent research.

**Architecture:**
1. **Stage 1 (Fast)**: Vector search retrieves many candidates (top_k=25)
2. **Stage 2 (Accurate)**: Reranker scores and keeps only most relevant (top_n=3)

**Recommended Models:**

| Model | Type | Best For |
|-------|------|----------|
| **Cohere Rerank 3** | API | General RAG, 100+ languages |
| **MixedBread mxbai-rerank-v2** | Open-source | Self-hosted, multilingual |
| **bge-reranker** | Open-source | Budget-conscious |

**Implementation Pattern:**
```python
# Step 1: Broad retrieval
candidates = vector_db.query(query_embedding, top_k=25)

# Step 2: Rerank for precision
from cohere import Client
co = Client(api_key="...")

reranked = co.rerank(
    query=query_text,
    documents=[doc.text for doc in candidates],
    top_n=3,
    model="rerank-english-v3.0"
)

# Step 3: Use top results
top_docs = [candidates[r.index] for r in reranked.results]
```

---

## LLM Integration & Multi-Provider Architecture

### Existing Multi-Provider Gateway

**Location**: `/python-backend/app/llm_proxy/`

**Providers Integrated:**
- OpenRouter (primary aggregator)
- OpenAI (native)
- Anthropic (Claude family)
- Google (Gemini)
- Groq (LPU inference)
- Kie.ai (image/video generation)
- Kilocode (custom endpoint)

**Gateway Pattern:**
```
Web App (tRPC) → Python Backend (LLMGateway)
    ↓
    Provider Registry (health check + circuit breaker)
    ↓
    Selected Provider (with fallback chain)
    ↓
    Cost Tracking + Credit Deduction
```

**Key Files:**
- `gateway_unified.py` - Main unified gateway
- `providers/factory.py` - Provider instantiation
- `unified_client.py` - Client wrapper for all providers

### Streaming Implementation

**Chat Completions**: Full streaming via SSE (Server-Sent Events)

```python
async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
    """Stream LLM response tokens"""
    async for token in llm_client.stream_completion(request):
        yield token
```

**Image/Video Generation**: Poll-based for async APIs (Kie.ai, FAL.ai)

---

## Workflow & State Management

### Existing LangGraph Orchestrator

**Location**: `/python-backend/app/orchestrator/orchestrator.py`

**Core Components:**
```python
from langgraph.graph import StateGraph, END

class WorkflowOrchestrator:
    """Uses LangGraph for:
    - Workflow execution (state machine)
    - Checkpoint system (resume capability)
    - Parallel execution
    - Validation
    """
    # Supports PostgreSQL checkpoints (production)
    # Falls back to memory checkpoints (development)
```

### State Structure

```python
class ExecutionState:
    workflow_id: str
    status: ExecutionStatus  # pending | running | completed | failed
    steps: List[WorkflowStep]
    variables: Dict[str, Any]
    checkpoint_id: str
```

### Task Queue Architecture

**Location**: `/python-backend/app/core/celery_app.py`

**Queue Structure:**
- **`celery`** (default) - General-purpose tasks
- **`video`** (CPU-intensive) - FFmpeg video processing
- **`media`** (network-bound) - API-based generation

```python
# Queue routing example
celery_app.conf.task_routes = {
    "app.tasks.media_job_worker.execute_media_job": {"queue": "video"},
    "app.tasks.media_tasks.generate_image_task": {"queue": "media"},
}
```

**Node.js Side**: BullMQ for tRPC router coordination

---

## Approval Gates & Human-in-the-Loop

### Existing Database Models

**Location**: `/python-backend/app/models/approval.py`

```python
class ApprovalRequest:
    id: str                          # UUID
    request_type: ApprovalType       # CODE_EXECUTION | FILE_MOD | DEPLOYMENT | etc.
    status: ApprovalStatus           # PENDING | APPROVED | REJECTED | EXPIRED
    payload: dict                    # What needs approval
    risk_level: str                  # low | medium | high | critical
    required_approvers: int          # Approval chain depth
    current_approvals: int           # Votes collected
    expires_at: datetime             # Timeout handling
    timeout_action: str              # "reject" | "approve" | "escalate"

class ApprovalResponse:
    request_id: str
    approver_id: int
    decision: str                    # "approved" | "rejected"
    comment: str

class ApprovalRule:
    trigger_type: ApprovalType
    conditions: dict                 # Trigger logic
    approver_roles: list[str]        # ["admin", "domain_admin"]
    required_approvals: int
    timeout_minutes: int
    auto_approve_conditions: dict
```

### Approval Service

**Location**: `/python-backend/app/orchestrator/approval_gates/approval_service.py`

```python
class ApprovalService:
    async def request_approval(self, request: ApprovalRequest) -> str:
        """Create approval request, notify approvers"""

    async def respond(self, request_id: str, approver_id: int, decision: str) -> bool:
        """Record approval/rejection vote"""

    async def check_ready(self, request_id: str) -> bool:
        """Check if approval threshold reached"""
```

### Control Plane Integration

**Location**: `/control-plane/src/routes/approvals.ts`

**Token-Based Approval Mechanism:**
```typescript
POST /api/v1/sessions/:sessionId/approvals/apply
  → Issues one-time approval token (TTL: 60–1800 seconds)
  → Returns: { approvalId, token, expiresInSeconds }

POST /api/v1/sessions/:sessionId/approvals/apply/consume
  → Orchestrator consumes token before executing action
  → Prevents replay attacks
```

---

## LangGraph Best Practices (2025-2026)

### LangGraph 1.0 Overview

LangGraph achieved version 1.0 in October 2025, committing to no breaking changes until version 2.0. It's now the standard for building stateful, graph-based AI workflows with reliability and scale.

### Human-in-the-Loop Pattern

**Interrupt Mechanism:**

```python
from langgraph.types import interrupt, Command
from typing import TypedDict

class WorkflowState(TypedDict):
    task: str
    user_decision: str
    status: str

def get_approval(state: WorkflowState):
    """Node that pauses for human decision"""
    decision = interrupt("Please enter 'approve' or 'reject' to continue.")
    return {'user_decision': decision}

def router(state: WorkflowState) -> Command:
    """Routes based on approval decision"""
    if state.get('user_decision', '').lower() == 'approve':
        return Command(goto='complete_task')
    else:
        return Command(goto='cancel_task')
```

**Critical Requirements:**
- Checkpointing is **mandatory** for interrupts to function
- Each execution needs a unique `thread_id` for state isolation
- Resume by passing Command object with user's decision

### Production Checkpointing

**PostgreSQL Saver (Recommended for Production):**

```python
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

DB_URI = "postgresql://user:pass@host:5432/langgraph?sslmode=require"
pool = ConnectionPool(conninfo=DB_URI, max_size=10)

with pool.connection() as conn:
    saver = PostgresSaver(conn)
    saver.setup()
```

**Checkpoint Structure:**

Each checkpoint captures:
- **config**: Configuration metadata
- **values**: Current state channel values
- **next**: Node names queued for execution
- **tasks**: PregelTask objects with execution details
- **metadata**: Timestamp and write source

**Database Backend Options:**

| Implementation | Best For |
|---|---|
| **PostgresSaver** | Production (recommended) |
| **CosmosDBSaver** | Azure deployments |
| **SqliteSaver** | Local workflows |
| **InMemorySaver** | Development/testing only |

### Error Handling & Retry

**Fault Tolerance Through Checkpointing:**
- Failed nodes resume from last successful checkpoint
- Pending writes from completed nodes aren't re-executed
- Time travel debugging allows replay from specific checkpoints

**Best Practices:**
- Implement async architecture for scalability
- Use thread management and namespacing for isolation
- Set connection pool `max_size` to match concurrency

### Cost Control & Budget Management

**Token Management Strategies:**

1. **Usage Tracking**: Track input/output tokens, model, user, estimated/actual cost per request
2. **Budget Definition**: Set limits per API key, user, team, feature, or model type
3. **Alerting**: Threshold notifications at 70%, 90%, 100% of budget
4. **Enforcement**: Block requests, throttle, or route to cheaper models when exceeded

**AI Gateway Pattern:**

Use centralized gateway to:
- Capture token usage and cost metadata
- Send data to logging/observability systems
- Feed budget monitoring mechanisms
- Trigger alerts when thresholds crossed

**Memory Management:**
- Implement buffered memory for multi-turn conversations
- Use intelligent summarization of older parts
- Apply document splitting for large texts

### HITL Design Principles

Production HITL systems follow:
- **Reactive Triggering**: HITL only when system detects missing/ambiguous information
- **Bounded Questioning**: Request only essential missing information
- **Fast & Token Efficient**: Send only what's needed for final decision
- **Validation Logic**: Explicit confirmation prevents downstream errors

---

## Virtual Flow Builder with React Flow

### React Flow: The 2025-2026 Standard

React Flow is the de facto standard for building node-based workflow editors in React applications.

**Core Value**: "Highly customizable library for building interactive node-based UI, workflow editor, flow chart or static diagram."

### Key Features

**Automatic Layout Management:**
- Uses ELKjs layout engine for automatic arrangement
- Developers focus on functionality, not manual positioning

**Interactive Node Management:**
- Drag-and-drop from sidebar components
- Add and organize nodes dynamically
- Custom node types with React components

**Workflow Execution:**
- Execute and monitor nodes sequentially
- Real-time execution state tracking
- Progress visualization

**Customizable UI:**
- Built on Radix UI primitives (already in our stack!)
- Tailwind CSS for styling (already in our stack!)
- Dark mode support
- Minimap and zoom controls

### State Management Architecture

React Flow uses **Zustand** for state handling:

```javascript
import { create } from 'zustand';

const useFlowStore = create((set) => ({
  nodes: [],
  edges: [],
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node]
  })),
  updateNodeData: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
    ),
  })),
}));
```

### Persistence Patterns

**Save and Restore Flow:**

```javascript
import { useReactFlow } from 'reactflow';

const { toObject } = useReactFlow();

const onSave = () => {
  const flow = toObject();
  // Save to localStorage, database, or file system
  localStorage.setItem('workflow', JSON.stringify(flow));
};

const onRestore = () => {
  const flow = JSON.parse(localStorage.getItem('workflow'));
  if (flow) {
    const { x = 0, y = 0, zoom = 1 } = flow.viewport;
    setNodes(flow.nodes || []);
    setEdges(flow.edges || []);
    setViewport({ x, y, zoom });
  }
};
```

**Data Structure:**

The serialized `ReactFlowJsonObject` contains:
- **nodes**: Array of node objects with id, type, data, and position
- **edges**: Array of connection objects linking nodes
- **viewport**: Camera state (x, y, zoom)

**Storage Options:**
- PostgreSQL/MongoDB for server-side storage
- File system (JSON/YAML) for version control
- S3/Azure Blob for distributed systems

### Conditional Branching & Loops

**Implementing Conditional Logic:**

```javascript
const conditionalNode = {
  id: 'condition-1',
  type: 'conditional',
  data: {
    condition: 'status === "approved"',
    onTrue: 'process-node',
    onFalse: 'reject-node',
  },
  position: { x: 250, y: 100 },
};
```

**Loop Implementation:**

```javascript
const loopEdge = {
  id: 'e-loop',
  source: 'iterator-node',
  target: 'start-node',
  type: 'conditional',
  data: {
    condition: 'count < maxIterations',
  },
};
```

### Visual Workflow Execution & Debugging

**Execution Runner Pattern:**

```javascript
const executeWorkflow = async (nodes, edges, startNodeId) => {
  let currentNodeId = startNodeId;
  const executionLog = [];

  while (currentNodeId) {
    const node = nodes.find(n => n.id === currentNodeId);

    // Update node visual state
    updateNodeData(currentNodeId, { status: 'executing' });

    try {
      // Execute node logic
      const result = await executeNode(node);
      executionLog.push({ nodeId: currentNodeId, result, status: 'success' });

      updateNodeData(currentNodeId, {
        status: 'completed',
        result
      });

      // Find next node
      currentNodeId = getNextNode(node, edges, result);
    } catch (error) {
      executionLog.push({ nodeId: currentNodeId, error, status: 'failed' });
      updateNodeData(currentNodeId, { status: 'error', error });
      break;
    }
  }

  return executionLog;
};
```

**Visual Debugging Features:**
- Real-time node highlighting during execution
- Step-by-step execution with pause/resume
- Execution log panel showing inputs/outputs
- Error visualization with stack traces
- Breakpoint support for debugging

### Production Best Practices

**Performance Optimization:**
- Use `memo` for custom node components
- Implement virtualization for >100 nodes
- Debounce position updates during dragging
- Use `onNodesChange` and `onEdgesChange` for controlled updates

**Accessibility:**
- Keyboard navigation support
- ARIA labels for nodes and edges
- Screen reader announcements
- High contrast mode support

---

## AI Secretary Integrations

### Calendar Integration Architecture

#### Google Calendar API

**Core Resource Types:**
1. **Events**: Individual calendar entries (single and recurring)
2. **Calendars**: Collections of events with metadata
3. **Calendar List**: User-specific collections
4. **Settings**: User preferences (timezone, etc.)
5. **ACL**: Access control rules

**Authentication:**

```python
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar']

flow = InstalledAppFlow.from_client_secrets_file(
    'credentials.json', SCOPES)
creds = flow.run_local_server(port=0)

service = build('calendar', 'v3', credentials=creds)
```

### Synchronization Strategies

**Webhooks (Recommended) vs Polling:**

**Webhooks Setup:**
```python
# Setup webhook for real-time updates
watch_request = {
    'id': unique_channel_id,
    'type': 'web_hook',
    'address': 'https://your-domain.com/notifications',
    'expiration': (datetime.now() + timedelta(days=7)).timestamp() * 1000
}

watch_response = service.events().watch(
    calendarId='primary',
    body=watch_request
).execute()
```

**Benefits:**
- Real-time updates
- Lower API quota usage
- Reduced latency

### Conflict Resolution

**ETags for Optimistic Concurrency:**

```python
# Read event with ETag
event = service.events().get(
    calendarId='primary',
    eventId=event_id
).execute()

etag = event['etag']

# Update with ETag check
try:
    updated_event = service.events().update(
        calendarId='primary',
        eventId=event_id,
        body=modified_event,
        headers={'If-Match': etag}
    ).execute()
except HttpError as e:
    if e.resp.status == 412:
        # Handle conflict: fetch latest, merge, retry
        handle_conflict()
```

**Strategies:**
- Last-write-wins with user notification
- User prompt for conflict resolution
- Automatic merge based on priority rules
- Queue conflicts for human review

### Optimal Meeting Time Algorithm

**Core Components:**

1. **Availability Querying**

```python
def get_free_busy(service, calendar_ids, time_min, time_max):
    body = {
        "timeMin": time_min.isoformat() + 'Z',
        "timeMax": time_max.isoformat() + 'Z',
        "items": [{"id": cal_id} for cal_id in calendar_ids]
    }

    response = service.freebusy().query(body=body).execute()
    return response['calendars']
```

2. **Slot Scoring**

```python
def score_time_slot(slot, preferences, context):
    score = 100

    # Penalize outside working hours
    if not is_working_hours(slot, preferences['work_hours']):
        score -= 50

    # Penalize back-to-back meetings
    if has_adjacent_meeting(slot, context['calendar']):
        score -= 20

    # Bonus for preferred times
    if is_preferred_time(slot, preferences['optimal_hours']):
        score += 30

    # Penalize overloaded days
    day_load = get_day_meeting_count(slot.date(), context['calendar'])
    score -= (day_load * 5)

    # Priority factor
    score += context['priority'] * 10

    return score
```

3. **Multi-Calendar Intersection**

```python
def find_optimal_meeting_times(attendees, duration, preferences):
    # Get free/busy for all attendees
    all_busy_times = []
    for attendee in attendees:
        busy = get_free_busy(service, [attendee.calendar_id],
                            start_date, end_date)
        all_busy_times.append(busy)

    # Find intersection of free times
    potential_slots = find_free_slots(all_busy_times, duration)

    # Score and rank slots
    scored_slots = []
    for slot in potential_slots:
        score = 0
        for attendee in attendees:
            score += score_time_slot(slot, attendee.preferences,
                                    attendee.context)
        scored_slots.append((slot, score / len(attendees)))

    # Return top ranked slots
    return sorted(scored_slots, key=lambda x: x[1], reverse=True)[:5]
```

### AI-Powered Scheduling (2025-2026)

Modern AI schedulers analyze:
- User preferences and past behaviors
- Context from email/chat messages
- Real-time changes and reprioritization
- Meeting frequency and burnout risk

**2025-2026 Capabilities:**
- **Intent Recognition**: Recognizes scheduling intent in communications
- **Dynamic Reprioritization**: Continuously optimizes calendar
- **Flexible Holds**: Defends important tasks while staying open for collaboration
- **Burnout Prevention**: Monitors workload and suggests breaks

### Calendar API Comparison

| API | Best For | Strengths |
|-----|----------|-----------|
| **Google Calendar API** | Google-first users | Free, well-documented, webhooks |
| **Microsoft Graph API** | Office 365 | Office integration, robust |
| **Cronofy** | Enterprise multi-provider | Unified API, 99.99% uptime |
| **Nylas** | Developer-friendly multi-provider | Multiple providers, native UI |

**Recommendation for AI Secretary:**

Use **unified calendar APIs (Cronofy or Nylas)** to:
- Support multiple calendar types (Google + Outlook)
- Fast availability querying across calendars
- Reduce maintenance burden

### Email Classification & Priority Detection

**Gmail's AI Evolution (2025-2026):**

Gmail now uses Gemini AI to:
- Automatically summarize emails
- Prioritize messages
- Help draft responses
- Interpret before human review

**Classification Mechanisms:**

Gmail applies ML based on:
- **Sender identity**: Known contacts, domains, interactions
- **Message content type**: Meetings, newsletters, transactional
- **User interaction history**: Opens, replies, deletions
- **NLP**: Distinguishes message types from same domain

### Building AI Email Classification

**Architecture Pattern:**

```python
from openai import OpenAI

client = OpenAI()

def classify_email(email_content):
    prompt = f"""
    Classify this email into one of these categories:
    - urgent_action_required
    - meeting_scheduling
    - newsletter
    - transactional
    - low_priority

    Also extract:
    - Priority (1-5)
    - Requires response (yes/no)
    - Action items
    - Deadline (if any)

    Email: {email_content}

    Return JSON format.
    """

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)
```

**Gmail API Integration:**

```python
def process_inbox():
    service = build('gmail', 'v1', credentials=creds)

    # Get unread messages
    results = service.users().messages().list(
        userId='me',
        q='is:unread'
    ).execute()

    messages = results.get('messages', [])

    for message in messages:
        msg = service.users().messages().get(
            userId='me',
            id=message['id']
        ).execute()

        content = extract_email_content(msg)
        classification = classify_email(content)

        # Apply labels
        if classification['category'] == 'urgent_action_required':
            add_label(service, message['id'], 'IMPORTANT')

        if classification['requires_response'] == 'yes':
            create_task(classification['action_items'])

        if classification['deadline']:
            create_calendar_reminder(classification['deadline'])
```

### Production Best Practices

**Rate Limiting & Quota Management:**
- Implement exponential backoff
- Monitor API usage and optimize
- Use batch requests where possible
- Cache frequently accessed data

**Security:**
- Store OAuth tokens encrypted (AES-256) - **we already have crypto.ts**
- Regularly rotate credentials
- Use least-privilege scopes
- Audit access logs

**User Experience:**
- Display inline availability
- Quick reschedule options
- Timezone clarity
- Safe fallbacks when permissions limited

**Reliability:**
- Idempotent writes with client-generated IDs
- Retries with jitter for transient failures
- Conflict resolution based on ETag
- Local cache for offline functionality

---

## Testing Infrastructure

### JavaScript Testing (Vitest)

**Location**: `/apps/web/server/*.test.ts`

- **Framework**: Vitest + supertest
- **Coverage**: 80% minimum enforced
- **Structure**: Unit + integration tests

**Example Pattern:**
```typescript
describe("Gallery API", () => {
  it("should create gallery item", async () => {
    const response = await request(app)
      .post("/api/gallery")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Test", type: "image" });

    expect(response.status).toBe(201);
  });
});
```

### Python Testing (pytest)

**Location**: `/python-backend/tests/`

- **Framework**: pytest with asyncio
- **Coverage**: 80% minimum enforced
- **Markers**: unit, integration, e2e, auth, credits, llm, payment
- **Async**: Auto-detected with `asyncio_mode = auto`

**Test Structure:**
```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_approval_workflow():
    """Test approval request creation and resolution"""
    request = ApprovalRequest(
        request_type=ApprovalType.CODE_EXECUTION,
        title="Deploy to prod",
        payload={"environment": "production"}
    )
    service = ApprovalService()
    req_id = await service.request_approval(request)
    assert req_id is not None
```

---

## Key Implementation Patterns

### For Agentic Workflow System

1. **State Machine Pattern (LangGraph)**
   - Use StateGraph for workflow nodes
   - Checkpoint after each approval gate
   - Resume capability for interruptions

2. **Approval Gate Pattern**
   - Database-backed requests (models already exist!)
   - Token-based consumption (Control Plane already has this!)
   - Timeout + escalation logic
   - Audit trail via approval_responses

3. **Async Job Pattern (Celery)**
   - Queue routing by task type (already configured!)
   - Status polling via tRPC
   - Result persistence in S3/DB

4. **Rate Limiting**
   - Per-user buckets
   - Per-skill thresholds
   - Backpressure via BullMQ

5. **Encryption Safety**
   - AES-256-GCM for secrets (crypto.ts already exists!)
   - SHA-256 key derivation
   - Python can decrypt Node.js data (smartspecweb_crypto.py exists!)

6. **RAG + Vector Search**
   - ChromaDB persistent collections (already configured!)
   - Hybrid retrieval (semantic + BM25) - **already implemented!**
   - Reranker for top-k refinement (add mxbai-rerank-v2 or Cohere)

7. **Testing Discipline**
   - 80% minimum coverage enforced (already in CI!)
   - Async-first patterns
   - Audit log verification

### Integration Points for New Features

**Skills Marketplace:**
- Extend `skillRepositoriesRouter` (exists at `/apps/web/server/routers/`)
- Extend `skills` table with marketplace fields
- Admin approval for new skills

**Virtual Flow Builder:**
- New orchestrator graph type in Python backend
- React Flow visual editor in frontend (Radix UI + Tailwind already there!)
- New DB tables: `workflow_templates`, `workflow_executions`, `workflow_nodes`
- Approval gates for complex workflows

**Skill Chaining:**
- Output URLs from one skill feed to next
- Registry linking compatible skill outputs
- Example: Image Prompt Engineer → Image Gen → Video Generator

**AI Secretary:**
- Calendar integration via Cronofy/Nylas unified API
- Email classification using existing LLM proxy
- Document management via Drive/OneDrive APIs
- Proactive scheduling with AI scoring algorithm

---

## Common Pitfalls to Avoid

### LangGraph
- ❌ **Don't skip checkpointing** - it's mandatory for HITL and error recovery
- ❌ **Don't use InMemorySaver in production** - data loss on restart
- ❌ **Don't ignore cost tracking** - implement budget limits before deployment
- ❌ **Don't store sensitive data in state without encryption**

### ChromaDB / Vector DBs
- ❌ **Don't use ChromaDB for >100K vectors in production** - performance degrades
- ❌ **Don't use generic embeddings for specialized domains** - 20-40% accuracy loss
- ❌ **Don't skip metadata filtering** - critical for multi-tenant systems
- ❌ **Don't embed documents without chunking** - context loss

### React Flow
- ❌ **Don't skip memoization for custom nodes** - performance issues
- ❌ **Don't store complex objects in node data** - serialization problems
- ❌ **Don't implement custom layout from scratch** - use ELK.js
- ❌ **Don't skip input validation for connections** - workflow corruption

### Calendar/Email Integration
- ❌ **Don't poll APIs constantly** - use webhooks for real-time
- ❌ **Don't store tokens in plaintext** - encrypt with AES-256 (use existing crypto.ts!)
- ❌ **Don't ignore timezone handling** - major source of bugs
- ❌ **Don't skip conflict resolution strategy** - leads to data loss

### Encryption & Security
- ❌ **NEVER change `LLM_ENCRYPTION_KEY` without re-encryption** - unrecoverable data loss
- ❌ **NEVER commit secrets or backups** - use `.env` + `.db-backups/` (git-ignored)
- ❌ **NEVER store secrets in JSON columns** - plaintext vulnerability

### Database Operations
- ❌ **ALWAYS backup before migrations** - follow Database Safety Protocol from CLAUDE.md
- ❌ **ALWAYS run migrations immediately** - un-migrated schemas cause runtime crashes
- ❌ **ALWAYS verify row counts post-migration** - detect data loss early

---

## Summary & Recommendations

### Core Stack for Implementation

**Orchestration & Workflows:**
- LangGraph 1.0+ with PostgreSQL checkpointing (already have Postgres!)
- Celery task queues (already configured!)
- BullMQ for Node.js coordination (already in use!)

**Vector Search & RAG:**
- ChromaDB for development (already installed!)
- Add reranking layer: MixedBread mxbai-rerank-v2 (open-source) or Cohere Rerank 3 (API)
- Keep existing hybrid retriever (semantic + BM25)
- Consider Qdrant migration for production if we exceed 100K vectors

**Virtual Flow Builder:**
- React Flow with Zustand (integrates with existing Radix UI + Tailwind!)
- ELK.js for automatic layout
- Store flows in PostgreSQL as JSON (use existing Drizzle ORM)

**AI Secretary:**
- Unified calendar API: Cronofy or Nylas (multi-provider support)
- Email classification via existing LLM proxy + GPT-4/Claude
- Use existing encryption system (crypto.ts) for OAuth tokens

### Architecture Priorities

1. **Extend existing approval gate system** for workflow approvals
2. **Add reranking layer** to existing RAG for skill matching accuracy
3. **Build React Flow editor** for visual skill chaining
4. **Integrate unified calendar API** for multi-provider support
5. **Leverage existing LangGraph orchestrator** for agentic workflows

### Production Readiness Checklist

Infrastructure (Already Exists):
- ✅ PostgreSQL database with Drizzle ORM
- ✅ LangGraph orchestrator in Python backend
- ✅ ChromaDB with hybrid RAG
- ✅ Approval gate models and service
- ✅ Celery task queues (3 queues configured)
- ✅ Multi-provider LLM gateway
- ✅ tRPC API with streaming support
- ✅ Encryption system (AES-256-GCM bi-directional)
- ✅ Testing frameworks (Vitest + pytest, 80% coverage)
- ✅ AI Orchestra agent architecture (documented)

To Add:
- [ ] LangGraph PostgreSQL checkpointing configuration
- [ ] Budget limits and alerts for LLM costs
- [ ] Reranking layer for skill retrieval
- [ ] React Flow workflow editor UI
- [ ] Calendar webhook integration (Cronofy/Nylas)
- [ ] Email classification service
- [ ] Virtual flow execution engine
- [ ] Workflow templates database tables
- [ ] Rate limiting per workflow
- [ ] Observability dashboard (consider LangSmith)

### Next Steps

**Phase 1 - Foundation (Weeks 1-2):**
1. Configure LangGraph with PostgreSQL checkpointer
2. Add reranking to existing RAG (mxbai-rerank-v2)
3. Extend approval models for workflow-specific approval types
4. Create workflow template database schema

**Phase 2 - Virtual Flow Builder (Weeks 3-4):**
5. Build React Flow editor UI
6. Implement flow persistence layer
7. Create execution engine for visual workflows
8. Add conditional branching and loop support

**Phase 3 - AI Secretary (Weeks 5-6):**
9. Integrate unified calendar API
10. Implement optimal meeting time algorithm
11. Build email classification service
12. Add proactive scheduling features

**Phase 4 - Skills Marketplace (Weeks 7-8):**
13. Extend skills system for marketplace
14. Build skill discovery UI
15. Implement skill versioning
16. Add skill review and rating system

This research provides a solid foundation with extensive existing infrastructure already in place. The implementation can build upon proven patterns and established systems rather than starting from scratch.
