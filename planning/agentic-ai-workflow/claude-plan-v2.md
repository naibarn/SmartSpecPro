# Implementation Plan: Agentic AI Workflow System (v2 - Post-Review)

**Project**: SmartSpecPro Agentic AI Workflow System
**Version**: 2.0 (Revised after Opus review)
**Date**: 2026-02-08
**Author**: Claude (Deep Planning Agent)
**Review Status**: Addresses critical issues from external review

---

## Revision History

**v2.0 (2026-02-08)**: Addressed critical issues from Opus plan review:
- ✅ Fixed PostgreSQL checkpointer (implementation, not just configuration)
- ✅ Added approval service database migration task
- ✅ Defined inter-service API contract section
- ✅ Added ORM ownership strategy
- ✅ Added multi-tenancy (tenant_id) to all workflow tables
- ✅ Extended timeline from 10 to 14 weeks (more realistic)
- ✅ Added workflow_execution_logs table for observability
- ✅ Descoped Phase 4 to Google Calendar only (Gmail → Phase 5+)
- ✅ Fixed notification architecture (Python events → Node.js dispatch)
- ✅ Added budget enforcement at step boundaries
- ✅ Switched from WebSocket to SSE for real-time updates

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture](#architecture)
   - 3.1 [Layer Architecture](#31-layer-architecture)
   - 3.2 [Inter-Service Communication](#32-inter-service-communication-new)
   - 3.3 [Database Ownership Strategy](#33-database-ownership-strategy-new)
   - 3.4 [Database Schema](#34-database-schema)
4. [Implementation Phases](#implementation-phases)
5. [Critical Patterns](#critical-patterns)
6. [Testing Strategy](#testing-strategy)
7. [Deployment & Rollout](#deployment--rollout)
8. [Risk Mitigation](#risk-mitigation)

---

## 1. Executive Summary

### 1.1 What We're Building

An agentic AI system that executes complex multi-step workflows with human-in-the-loop approval gates. Users describe their goals in natural language (e.g., "create a video ad from this brief"), and the system autonomously plans, executes, and delivers the result through multiple stages, pausing for user approval at critical decision points.

The system includes four major components:

1. **Agentic Workflow Engine** - Executes multi-step tasks using LangGraph with checkpoint/resume capability
2. **Skill Marketplace** - Extensible library of workflow templates (public + private) with versioning
3. **Virtual Flow Builder** - Visual drag-and-drop editor for creating custom workflows
4. **AI Secretary** - Proactive calendar and scheduling (Phase 4 focused on Google Calendar only)

### 1.2 Why This Architecture

The architecture leverages SmartSpecPro's existing infrastructure extensively:

- **LangGraph Orchestrator** - Core exists, requires PostgreSQL checkpointing implementation
- **Approval Service** - Database models exist, requires migration from in-memory to database-backed storage
- **ChromaDB + Hybrid RAG** - Fully configured, will add reranking layer for accuracy
- **Multi-Provider LLM Gateway** - Production-ready with cost tracking and fallback chains
- **Celery Task Queues** - Three queues configured (celery, media, video) ready for parallel execution
- **Telegram Notifications** - Already implemented, will extend for workflow events

This "build on existing" approach reduces implementation risk and time-to-market by an estimated 40-50% compared to greenfield development.

### 1.3 Key Design Decisions (from stakeholder interview)

1. **Smart Dependency Detection** - Only invalidate downstream gates affected by changes
2. **Hard Budget Stop** - Block at step boundaries when budget exceeded
3. **Marketplace + Personal Hybrid** - Public templates + private forkable workflows
4. **Auto-Retry with Exponential Backoff** - 3 attempts (immediate, 2s, 8s)
5. **Auto-Upgrade on Resume** - Use latest skill version with changelog notification
6. **7-Day State Retention** - Balance UX with storage costs
7. **Multi-Channel Notifications** - In-app + push + email + Telegram
8. **Google Calendar MVP** - Phase 4 focuses on Calendar only; Gmail deferred to Phase 5+

### 1.4 Timeline Adjustment

**Original estimate**: 10 weeks (too aggressive per review)
**Revised estimate**: 14 weeks with 2-3 engineers

- Phase 1: Foundation (Weeks 1-3)
- Phase 2: Skill Marketplace (Weeks 4-6)
- Phase 3: Virtual Flow Builder (Weeks 7-9)
- Phase 4: AI Secretary - Google Calendar (Weeks 10-11)
- Phase 5: Polish & Production Readiness (Weeks 12-14)

---

## 2. System Overview

### 2.1 User Journey Example: Video Ad Creation

```
1. User types: "Create a 45-second video ad for EcoBottle targeting young professionals"

2. System (parse_brief): Extracts brand, product, audience, duration

3. System (plan_script): Generates 7-shot script with dialogue, CTA

4. Approval Gate (approve_script): PAUSE, notify user

5. User reviews in UI, requests "Make shot 3 more energetic"

6. System (plan_script - resumed): Re-generates shot 3 only (smart invalidation)

7. User: Approve → System continues to next step

8. System (create_storyboard): Generates detailed shot descriptions

9. Approval Gate (approve_storyboard): PAUSE

10. User: Approve

11. System (render_images): Parallel Celery tasks generate 7 images

12. Approval Gate (approve_images): PAUSE, show image gallery

13. User: "Regenerate image 4 with brighter lighting"

14. System: Regenerates image 4, preserves others, invalidates videos downstream

15. User: Approve

16. System (render_videos): Parallel Celery tasks generate 7 video clips

17. Approval Gate (approve_videos): PAUSE

18. User: Approve

19. System (combine_final_video): Stitches clips with transitions

20. System: Workflow complete, deliver final video
```

**Cost tracking**: Budget checked at each step boundary (steps 3, 8, 11, 16, 19). If budget exhausted mid-step, allow step completion, block next step.

---

## 3. Architecture

### 3.1 Layer Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Presentation Layer (Node.js + React)                     │
│  - WorkflowBuilder.tsx (React Flow visual editor)         │
│  - WorkflowChat.tsx (natural language interface)          │
│  - SkillMarketplace.tsx (browse/fork templates)           │
│  - JobCard.tsx (approval UI with edit/approve/reject)     │
│  - CalendarDashboard.tsx (AI Secretary UI)                │
└──────────────────┬───────────────────────────────────────┘
                   │ tRPC / HTTP
┌──────────────────▼───────────────────────────────────────┐
│  Application Layer (Node.js + Express + tRPC)             │
│  - workflowRouter.ts (create, list, fork, rate)           │
│  - executionRouter.ts (start, pause, resume, cancel)      │
│  - approvalRouter.ts (list pending, submit decision)      │
│  - notificationService.ts (dispatch multi-channel)        │
│  - creditService.ts (budget enforcement)                  │
└──────────────────┬───────────────────────────────────────┘
                   │ HTTP + Redis Events
┌──────────────────▼───────────────────────────────────────┐
│  Orchestration Layer (Python + FastAPI + LangGraph)       │
│  - orchestrator.py (LangGraph with PostgreSQL checkpoint) │
│  - approval_service.py (database-backed, not in-memory)   │
│  - dependency_analyzer.py (smart invalidation BFS)        │
│  - flow_compiler.py (ReactFlow JSON → StateGraph)         │
│  - calendar_service.py (Google Calendar integration)      │
└──────────────────┬───────────────────────────────────────┘
                   │ Celery Queue + HTTP
┌──────────────────▼───────────────────────────────────────┐
│  Execution Layer (Celery Workers + External APIs)         │
│  - LLM Providers (OpenAI, Anthropic, etc.)                │
│  - Media APIs (Kie.ai, fal.ai for images/videos)          │
│  - Google Calendar API (OAuth + webhook)                  │
│  - ChromaDB (skill retrieval)                             │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Inter-Service Communication (**NEW**)

**Critical section added based on review feedback**

#### 3.2.1 Node.js → Python Communication

**Method**: HTTP requests to Python FastAPI backend

**Authentication**: `SMARTSPEC_WEB_GATEWAY_TOKEN` header (existing mechanism)

**New Python API Endpoints** (to be implemented):

```python
# Workflow lifecycle management
POST   /api/v1/workflows/execute
  Request: { template_id: int, user_id: int, inputs: dict, tenant_id: int }
  Response: { execution_id: str, status: str, checkpoint_id: str }

GET    /api/v1/workflows/executions/{execution_id}/status
  Response: { status: str, current_step: str, progress: float, artifacts: [] }

POST   /api/v1/workflows/executions/{execution_id}/resume
  Request: { approval_decision: dict, gate_id: str }
  Response: { resumed: bool, checkpoint_id: str }

POST   /api/v1/workflows/executions/{execution_id}/cancel
  Response: { cancelled: bool }

# Calendar integration
POST   /api/v1/calendar/connect
  Request: { user_id: int, auth_code: str }
  Response: { connected: bool, calendar_id: str }

POST   /api/v1/calendar/suggest-times
  Request: { user_id: int, meeting_duration_minutes: int, participants: [] }
  Response: { suggested_slots: [] }
```

#### 3.2.2 Python → Node.js Communication

**Method**: Redis Pub/Sub events (asynchronous)

**Channel**: `workflow:events`

**Event Types**:

```typescript
// Published from Python, consumed by Node.js
type WorkflowEvent =
  | { type: "approval_requested", execution_id: string, gate_id: string, user_id: number }
  | { type: "step_completed", execution_id: string, step_id: string, artifacts: [] }
  | { type: "workflow_completed", execution_id: string, result: any }
  | { type: "workflow_failed", execution_id: string, error: string }
  | { type: "budget_warning", execution_id: string, threshold: number, user_id: number }
```

**Implementation**:
- Python publishes events via `redis.publish("workflow:events", json.dumps(event))`
- Node.js subscribes via IORedis `subscriber.subscribe("workflow:events")`
- Node.js handler dispatches notifications via existing `notificationService.ts`

#### 3.2.3 Real-Time Client Updates

**Method**: Server-Sent Events (SSE), not WebSocket

**Rationale**:
- SSE already proven in codebase for LLM streaming
- Unidirectional server→client updates sufficient for workflow status
- Simpler than WebSocket (no bidirectional handshake needed)

**Implementation**:
```typescript
// apps/web/server/routes/workflowRoutes.ts
router.get("/executions/:id/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");

  const listener = (event: WorkflowEvent) => {
    if (event.execution_id === req.params.id) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  redisSubscriber.on("message", listener);
  req.on("close", () => redisSubscriber.off("message", listener));
});
```

### 3.3 Database Ownership Strategy (**NEW**)

**Critical section added based on review feedback**

SmartSpecPro uses two ORMs:
- **Node.js**: Drizzle ORM (`apps/web/drizzle/schema.ts`)
- **Python**: SQLAlchemy 2 (`python-backend/app/models/`)

**Ownership Decision**:

| Table | Owner | Migration Tool | Rationale |
|-------|-------|---------------|-----------|
| `workflow_templates` | Python | Alembic | Written by Python (flow compiler) |
| `workflow_executions` | Python | Alembic | Managed by LangGraph in Python |
| `workflow_execution_logs` | Python | Alembic | Written by orchestrator |
| `workflow_forks` | Python | Alembic | Created during template fork (could be either, choosing Python for consistency) |
| `skill_ratings` | Node.js | Drizzle | User-facing feature in web app |
| `verified_developers` | Node.js | Drizzle | Admin UI feature |
| `approval_requests` (existing) | Python | Alembic | Already owned by Python |

**Cross-ORM Access**:
- **Node.js reads Python-owned tables**: Add read-only Drizzle table definitions (no migrations)
- **Python reads Node.js-owned tables**: Add SQLAlchemy models with `__table_args__ = {'extend_existing': True}`
- **Migration coordination**: Python Alembic runs first, then Node.js Drizzle (Drizzle set to `push: false` for Python-owned tables)

**Example Drizzle read-only definition**:

```typescript
// apps/web/drizzle/schema.ts
// @drizzle-push-ignore - managed by Python Alembic
export const workflowExecutions = pgTable("workflow_executions", {
  id: uuid("id").primaryKey(),
  template_id: integer("template_id"),
  user_id: integer("user_id").references(() => users.id),
  tenant_id: integer("tenant_id").references(() => tenants.id), // Multi-tenancy
  status: varchar("status", { length: 50 }),
  state_json: jsonb("state_json"),
  checkpoint_id: varchar("checkpoint_id", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  // ... rest of columns
});
```

### 3.4 Database Schema

#### 3.4.1 New Tables (Python-owned, Alembic migrations)

```sql
-- Workflow templates (skills from marketplace or personal)
CREATE TABLE workflow_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    author_id INT REFERENCES users(id),
    tenant_id INT REFERENCES tenants(id),  -- NEW: Multi-tenancy support
    visibility VARCHAR(50) CHECK (visibility IN ('marketplace', 'private')),
    category VARCHAR(100),
    version VARCHAR(20),  -- Semantic versioning (1.2.3)
    manifest_json JSONB NOT NULL,
    flow_json JSONB,
    status VARCHAR(50) CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    CONSTRAINT unique_marketplace_skill UNIQUE (name, version, visibility)
);
CREATE INDEX idx_tenant_visibility ON workflow_templates(tenant_id, visibility);

-- Workflow executions (runtime instances)
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id INT REFERENCES workflow_templates(id),
    user_id INT REFERENCES users(id),
    tenant_id INT REFERENCES tenants(id),  -- NEW: Multi-tenancy support
    status VARCHAR(50) CHECK (status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
    state_json JSONB NOT NULL,
    checkpoint_id VARCHAR(255),
    budget_reserved_credits INT DEFAULT 0,  -- NEW: Reserved budget
    budget_spent_credits INT DEFAULT 0,     -- NEW: Actual spend
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);
CREATE INDEX idx_user_status ON workflow_executions(user_id, status);
CREATE INDEX idx_tenant ON workflow_executions(tenant_id);
CREATE INDEX idx_template ON workflow_executions(template_id);
CREATE INDEX idx_expires ON workflow_executions(expires_at) WHERE status IN ('waiting_approval', 'failed');

-- NEW: Workflow execution logs (step-level observability)
CREATE TABLE workflow_execution_logs (
    id SERIAL PRIMARY KEY,
    execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
    step_id VARCHAR(100),
    event_type VARCHAR(50),  -- 'started', 'completed', 'failed', 'approval_requested'
    input_json JSONB,
    output_json JSONB,
    cost_credits INT DEFAULT 0,
    duration_ms INT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_execution_logs ON workflow_execution_logs(execution_id, created_at);
CREATE INDEX idx_event_type ON workflow_execution_logs(event_type);

-- Track skill forks (marketplace → personal)
CREATE TABLE workflow_forks (
    id SERIAL PRIMARY KEY,
    source_template_id INT REFERENCES workflow_templates(id),
    forked_template_id INT REFERENCES workflow_templates(id),
    forked_by INT REFERENCES users(id),
    forked_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_fork UNIQUE (source_template_id, forked_by)  -- NEW: Prevent duplicate forks
);

-- Notification history (referenced by multi-channel pattern)
CREATE TABLE notification_history (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    execution_id UUID REFERENCES workflow_executions(id),
    event_type VARCHAR(100),
    channels VARCHAR(255),  -- 'in_app,push,email,telegram'
    delivered_at TIMESTAMP DEFAULT NOW(),
    delivery_status JSONB  -- Per-channel success/failure
);
CREATE INDEX idx_user_notifications ON notification_history(user_id, delivered_at);
```

#### 3.4.2 New Tables (Node.js-owned, Drizzle migrations)

```sql
-- Developer verification (for marketplace publishing)
CREATE TABLE verified_developers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) UNIQUE,
    status VARCHAR(50) CHECK (status IN ('pending', 'approved', 'rejected')),
    application_notes TEXT,
    github_url VARCHAR(500),
    portfolio_url VARCHAR(500),
    reviewed_by INT REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Skill marketplace ratings
CREATE TABLE skill_ratings (
    id SERIAL PRIMARY KEY,
    template_id INT REFERENCES workflow_templates(id),
    user_id INT REFERENCES users(id),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (template_id, user_id)
);
CREATE INDEX idx_template_ratings ON skill_ratings(template_id, rating);
```

#### 3.4.3 Extended Tables (Python Alembic ALTER)

```sql
-- approval_requests (already exists, extend with workflow fields)
ALTER TABLE approval_requests
    ADD COLUMN workflow_execution_id UUID REFERENCES workflow_executions(id),
    ADD COLUMN gate_id VARCHAR(100),  -- e.g., "approve_script"
    ADD COLUMN change_notes JSONB;  -- Per-item notes for rerenders
```

---

## 4. Implementation Phases

### Phase 1: Foundation - Workflow Engine Core (Weeks 1-3) **EXTENDED**

**Goal**: LangGraph workflow engine with PostgreSQL checkpointing and database-backed approval service

**Tasks**:

1. **Implement PostgreSQL Checkpointing** (**REVISED - was "Configure"**)

   **Problem**: Current `CheckpointerFactory` ignores `use_postgres` parameter and always returns `MemorySaver`

   **Solution**:
   - Resolve `psycopg` vs `psycopg2-binary` driver conflict (remove `psycopg2-binary`, keep `psycopg[binary]`)
   - Uncomment `AsyncPostgresSaver` import in `orchestrator.py`
   - Update `CheckpointerFactory.create()` to actually use PostgreSQL:
     ```python
     @staticmethod
     async def create(use_postgres: bool = True) -> Union[MemorySaver, AsyncPostgresSaver]:
         if use_postgres:
             pool = await asyncpg.create_pool(settings.DATABASE_URL)
             saver = AsyncPostgresSaver(pool)
             await saver.setup()  # Creates checkpoint tables
             return saver
         return MemorySaver()
     ```
   - Test checkpoint persistence across process restarts
   - Monitor checkpoint write latency (target: <100ms p95)

   **Estimated time**: 3-4 days (was underestimated as "configuration")

2. **Migrate Approval Service to Database** (**NEW TASK**)

   **Problem**: `ApprovalService` uses in-memory dictionaries (`self._requests`, `self._rules`), not PostgreSQL

   **Solution**:
   - Refactor `approval_service.py` to use SQLAlchemy models from `app/models/approval.py`
   - Replace dictionary lookups with database queries:
     ```python
     async def create_request(self, request: ApprovalRequest) -> ApprovalRequest:
         db_request = ApprovalRequestModel(**request.dict())
         session.add(db_request)
         await session.commit()
         return request
     ```
   - Add database indexes for common queries (`user_id`, `status`, `created_at`)
   - Migrate existing in-memory data (if any) to database
   - Test multi-process consistency (FastAPI + Celery workers)

   **Estimated time**: 3-5 days

3. **Extend State Model**
   - Define `WorkflowState` TypedDict with all required fields
   - Add: `skill_id`, `inputs`, `step_results`, `artifacts`, `approvals`, `dependencies`, `budget`
   - Implement state serialization/deserialization for JSONB storage

4. **Implement Smart Dependency Detection**
   - Create `dependency_analyzer.py` module
   - Build graph from workflow manifest
   - Implement downstream node finder (BFS)
   - Integrate with approval gate logic

5. **Implement Budget Enforcement at Step Boundaries** (**REVISED**)

   **Change**: Enforce budget at step boundaries, not individual API calls

   ```python
   async def execute_step(state: WorkflowState, step_id: str):
       # Pre-step budget check
       estimated_cost = estimate_step_cost(step_id, state)
       remaining = get_user_credits(state["user_id"])

       if remaining < estimated_cost:
           raise BudgetExceededError(f"Insufficient credits. Need {estimated_cost}, have {remaining}")

       # Reserve budget
       reserve_credits(state["user_id"], state["execution_id"], estimated_cost)

       try:
           # Execute step (allow completion even if actual cost > estimated)
           result = await _execute_step_impl(state, step_id)
           actual_cost = result["cost_credits"]

           # Finalize budget (refund if under, deduct extra if over)
           finalize_credits(state["user_id"], state["execution_id"], estimated_cost, actual_cost)

           return result
       except Exception as e:
           # Rollback reservation on failure
           rollback_credits(state["user_id"], state["execution_id"], estimated_cost)
           raise
   ```

6. **Create Simple 3-Step Workflow (Test)**
   - Step 1: LLM call (generate outline)
   - Step 2: Approval gate
   - Step 3: LLM call (expand outline to document)
   - Verify checkpoint/resume, smart invalidation, budget enforcement

**Success Criteria**:
- PostgreSQL checkpointing works (survives process restart)
- Approval service persists data to database
- Budget hard stop blocks at step boundaries when limit exceeded
- Smart invalidation works (changing step 2 invalidates step 3 but not step 1)

**Risks & Mitigation**:
- PostgreSQL checkpoint latency: Monitor, optimize if >100ms
- Multi-process approval consistency: Integration tests with concurrent workers

**Estimated time**: 3 weeks (was 2 weeks)

---

### Phase 2: Skill Marketplace (Weeks 4-6) **EXTENDED**

**Goal**: Extensible skill system with marketplace, versioning, and forking

**Tasks**:

1. **Define Skill Manifest JSON Schema**
   - Create `/python-backend/app/schemas/manifest_schema.json`
   - Define required fields: name, version, description, author, nodes, edges, inputs, outputs
   - Define tool allowlist: `["llm_call", "generate_image", "generate_video", "combine_video", "send_email"]`
   - Add JSON Schema validation in Python (`jsonschema` library)
   - Version the schema itself (v1.0)

2. **Create Marketplace CRUD APIs** (tRPC in Node.js)
   ```typescript
   // apps/web/server/routers/workflowRouter.ts
   list: publicProcedure.query(({ ctx }) => {
     // List marketplace skills, filtered by category
   }),

   fork: protectedProcedure
     .input(z.object({ templateId: z.number() }))
     .mutation(async ({ ctx, input }) => {
       // Copy marketplace template to user's private templates
       // Record in workflow_forks table
     }),

   rate: protectedProcedure
     .input(z.object({ templateId: z.number(), rating: z.number().min(1).max(5), review: z.string() }))
     .mutation(async ({ ctx, input }) => {
       // Insert into skill_ratings table
     }),
   ```

3. **Implement Developer Verification Workflow**
   - Admin UI for reviewing developer applications
   - Approve/reject with notes
   - Update `verified_developers` table

4. **Implement Skill Submission & Review**
   - Developers upload manifest JSON
   - System validates against JSON Schema
   - Static analysis: check tool calls against allowlist
   - Enters admin review queue (`status = 'pending_review'`)
   - Admin reviews code, docs, tests
   - On approval: `status = 'approved'`, `published_at = NOW()`

5. **Implement Skill Versioning**
   - Semantic versioning (MAJOR.MINOR.PATCH)
   - Store all versions in `workflow_templates` table
   - On fork: copy latest version
   - On resume: upgrade to latest version with changelog notification

6. **Build Marketplace UI** (React)
   - Browse skills by category
   - Search, filter, sort (by rating, downloads, date)
   - Skill detail page (readme, changelog, ratings)
   - Fork button
   - Rating/review submission

**Success Criteria**:
- Users can browse, search, and fork marketplace skills
- Verified developers can submit skills for review
- Admins can approve/reject submissions
- Skill versioning works (v1.0 → v1.1 auto-upgrade)

**Estimated time**: 3 weeks (was 2 weeks)

---

### Phase 3: Virtual Flow Builder (Weeks 7-9)

**Goal**: Visual drag-and-drop workflow editor with ReactFlow

**Tasks**:

1. **Set up ReactFlow Editor**
   - Install `reactflow` package
   - Create `WorkflowBuilder.tsx` component
   - Implement node palette (LLM, Tool, Approval, Conditional, Loop)
   - Implement drag-and-drop from palette to canvas
   - Implement connection rules (type checking between node outputs and inputs)

2. **Implement Node Configuration UI**
   - Each node type has config panel (Radix Dialog)
   - LLM Node: prompt template, model selection, max_tokens
   - Tool Node: tool selection, parameter mapping
   - Approval Node: gate ID, approval type
   - Conditional Node: condition expression editor (limited safe subset, not full JavaScript)
   - Loop Node: iteration variable, max iterations (prevent infinite loops)

3. **Implement Auto-Layout** (ELK.js)
   - Install `elkjs` package
   - Auto-arrange nodes on first load
   - "Auto Layout" button to re-arrange manually edited flows

4. **Implement Flow-to-Manifest Compiler** (**DESCOPED**)

   **Original plan**: Build general compiler for arbitrary flows

   **Revised plan**: Preset node library approach
   - Each node type maps to pre-built Python function
   - User configures parameters, not arbitrary code
   - Compiler validates connections and emits manifest JSON
   - Phase 2+ work: Add user-defined functions (sandboxed)

   ```python
   # flow_compiler.py (simplified)
   def compile_flow(flow_json: dict) -> dict:
       manifest = {"nodes": [], "edges": []}

       for node in flow_json["nodes"]:
           if node["type"] == "llm":
               manifest["nodes"].append({
                   "id": node["id"],
                   "function": "llm_call_node",
                   "params": node["data"]["config"]
               })
           elif node["type"] == "approval":
               manifest["nodes"].append({
                   "id": node["id"],
                   "function": "approval_gate_node",
                   "params": {"gate_id": node["data"]["gate_id"]}
               })
           # ... other node types

       manifest["edges"] = flow_json["edges"]
       return manifest
   ```

5. **Integrate with Workflow Engine**
   - When user saves flow, compile to manifest JSON
   - Store both `flow_json` (ReactFlow format) and `manifest_json` in `workflow_templates` table
   - When executing workflow, use compiled manifest
   - If compilation fails, show validation errors in UI

6. **Add Real-Time Execution Visualization** (SSE, not WebSocket)
   - Subscribe to SSE endpoint `/api/executions/{id}/stream`
   - Highlight currently executing node
   - Show progress indicators
   - Display step results inline

**Success Criteria**:
- Users can create workflows visually
- Auto-layout arranges nodes clearly
- Compiled workflows execute correctly
- Real-time execution visualization works

**Estimated time**: 3 weeks

---

### Phase 4: AI Secretary - Google Calendar (Weeks 10-11) **DESCOPED**

**Goal**: Google Calendar integration with smart scheduling

**Descoped from original plan**: Gmail integration, email classification, auto-response (moved to Phase 5+)

**Tasks**:

1. **Google OAuth Integration**
   - Set up Google Cloud Console project
   - Configure OAuth consent screen
   - Implement OAuth flow (Node.js initiates, stores tokens)
   - Encrypt tokens with `crypto.ts` (AES-256-GCM)
   - Store in `user_settings` table
   - Python reads tokens via `smartspecweb_crypto.py`

2. **Calendar CRUD Operations** (Python service)
   ```python
   # calendar_service.py
   class GoogleCalendarService:
       async def list_events(self, user_id: int, start_date: date, end_date: date):
           # Fetch user's encrypted tokens, decrypt, call Google Calendar API

       async def create_event(self, user_id: int, event: CalendarEvent):
           # Create calendar event with retry logic

       async def update_event(self, user_id: int, event_id: str, updates: dict):
           # Update existing event

       async def delete_event(self, user_id: int, event_id: str):
           # Delete event
   ```

3. **Webhook Handling** (for calendar change notifications)
   - Register webhook URL with Google
   - Handle push notifications from Google
   - Update local cache, emit SSE events to frontend

4. **Smart Scheduling Algorithm**
   - Find optimal meeting times based on:
     - Participant availability (from Google Calendar)
     - User's preferred hours (from preferences)
     - Buffer time between meetings
     - Avoid back-to-back meetings
   - Return top 3 suggested time slots

5. **Calendar Dashboard UI** (React)
   - Week/month view (react-big-calendar)
   - Create/edit/delete events
   - "Suggest meeting times" button
   - Show AI-suggested optimal slots

**Success Criteria**:
- Users can connect Google Calendar
- CRUD operations work reliably
- Smart scheduling suggests good time slots
- UI responsive and intuitive

**Deferred to Phase 5+**:
- Gmail integration
- Email classification
- Auto-response drafting
- Proactive scheduling intelligence

**Estimated time**: 2 weeks (reduced from 2 weeks with descoped requirements)

---

### Phase 5: Polish & Production Readiness (Weeks 12-14) **EXTENDED**

**Goal**: Performance optimization, monitoring, docs, deployment prep

**Tasks**:

1. **Add Reranking Layer to RAG** (ChromaDB)
   - Install `mxbai-rerank-v2` or use Cohere Rerank API
   - Implement two-stage retrieval:
     1. ChromaDB hybrid search (top 20)
     2. Reranker (re-score, return top 5)
   - Benchmark accuracy improvement

2. **Performance Optimization**
   - Profile slow queries, add missing indexes
   - Optimize JSONB queries with GIN indexes
   - Compress old workflow state (gzip JSONB for executions >7 days old)
   - Monitor checkpoint write latency, optimize if needed

3. **Monitoring & Observability**
   - Add Prometheus metrics (workflow execution count, duration, failure rate)
   - Create Grafana dashboard
   - Set up alerts (high failure rate, budget exhaustion, checkpoint latency >100ms)
   - Structured logging (include `execution_id`, `step_id` in all logs)

4. **Security Audit** (use `backend-security-coder` agent)
   - Audit all new endpoints for auth bypass, injection, XSS
   - Validate manifest JSON Schema prevents code injection
   - Ensure OAuth tokens encrypted at rest
   - Rate limit public endpoints (marketplace search)

5. **Documentation**
   - User guide (how to create workflows, use marketplace, fork skills)
   - Developer guide (how to submit skills, manifest schema)
   - API reference (tRPC routers, Python endpoints)
   - Deployment runbook

6. **E2E Testing** (Playwright)
   - Install and configure Playwright
   - Test complete video ad workflow (21 steps from user journey)
   - Test fork → customize → execute flow
   - Test budget exhaustion scenario

7. **Deployment Preparation**
   - Zero-downtime deployment strategy (rolling restart)
   - Feature flags for gradual rollout
   - Database migration scripts (Alembic + Drizzle)
   - Backup/restore procedures

**Success Criteria**:
- 80% test coverage maintained
- Security audit passes (no HIGH/CRITICAL issues)
- Performance targets met (p95 latency <500ms for API calls)
- Production deployment successful
- Monitoring dashboards live

**Estimated time**: 3 weeks (was 2 weeks)

---

## 5. Critical Patterns

### 5.1 LangGraph PostgreSQL Checkpointing Pattern

**Implementation** (Python):

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import StateGraph
import asyncpg

# Setup (run once on startup)
pool = await asyncpg.create_pool(settings.DATABASE_URL)
checkpointer = AsyncPostgresSaver(pool)
await checkpointer.setup()  # Creates tables: checkpoints, writes

# Define state
class WorkflowState(TypedDict):
    execution_id: str
    skill_id: str
    user_id: int
    tenant_id: int  # Multi-tenancy
    inputs: dict
    step_results: dict
    artifacts: list
    approvals: dict
    dependencies: dict
    budget: dict  # { reserved: int, spent: int }

# Build graph
workflow = StateGraph(WorkflowState)
workflow.add_node("parse_brief", parse_brief_node)
workflow.add_node("plan_script", plan_script_node)
workflow.add_node("approve_script", approval_gate_node)  # Interrupt here
workflow.add_node("create_storyboard", create_storyboard_node)
# ... more nodes

workflow.set_entry_point("parse_brief")
workflow.add_edge("parse_brief", "plan_script")
workflow.add_edge("plan_script", "approve_script")
workflow.add_conditional_edges("approve_script", route_after_approval)

# Compile with checkpoint
app = workflow.compile(checkpointer=checkpointer)

# Execute with checkpoint config
config = {
    "configurable": {
        "thread_id": execution_id,  # Unique per workflow instance
        "checkpoint_ns": "workflow"
    }
}

# Start execution
async for event in app.astream(initial_state, config):
    # Process events, log to workflow_execution_logs table
    log_event(execution_id, event)
```

**Key points**:
- Checkpoint automatically saved after each node
- State persists to PostgreSQL (survives process restart)
- Resume by calling `app.astream(state, config)` with same `thread_id`

### 5.2 Approval Gate Interrupt Pattern

**Implementation** (Python):

```python
from langgraph.graph import END
from langgraph.prebuilt import interrupt

async def approval_gate_node(state: WorkflowState) -> WorkflowState:
    gate_id = state["current_gate"]  # e.g., "approve_script"

    # Create approval request in database (not in-memory)
    approval_request = await approval_service.create_request(
        execution_id=state["execution_id"],
        user_id=state["user_id"],
        gate_id=gate_id,
        content=state["step_results"][gate_id]["content"],
        approval_type=ApprovalType.WORKFLOW_SCRIPT
    )

    # Emit event for Node.js notification service
    await redis.publish("workflow:events", json.dumps({
        "type": "approval_requested",
        "execution_id": state["execution_id"],
        "gate_id": gate_id,
        "user_id": state["user_id"],
        "approval_request_id": approval_request.id
    }))

    # INTERRUPT workflow (checkpointed here, waiting for external input)
    decision = interrupt(f"Waiting for approval: {gate_id}")

    # When resumed with decision, update state
    state["approvals"][gate_id] = decision

    if decision["action"] == "approve":
        return state  # Continue to next node
    elif decision["action"] == "request_changes":
        # Smart invalidation: find downstream nodes affected
        affected_nodes = dependency_analyzer.get_affected_downstream(gate_id, decision["change_notes"])

        # Clear affected step results
        for node in affected_nodes:
            state["step_results"].pop(node, None)
            state["approvals"].pop(node, None)

        # Re-execute the changed node
        state["current_node"] = gate_id.replace("approve_", "")  # "approve_script" → "plan_script"
        return state
    elif decision["action"] == "reject":
        state["status"] = "cancelled"
        return state
```

**Resume from Node.js** (when user clicks "Approve"):

```typescript
// apps/web/server/routers/executionRouter.ts
resume: protectedProcedure
  .input(z.object({
    executionId: z.string(),
    gateId: z.string(),
    action: z.enum(["approve", "request_changes", "reject"]),
    changeNotes: z.any().optional()
  }))
  .mutation(async ({ ctx, input }) => {
    // Call Python backend
    const response = await fetch(`${PYTHON_API_URL}/api/v1/workflows/executions/${input.executionId}/resume`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${GATEWAY_TOKEN}` },
      body: JSON.stringify({
        gate_id: input.gateId,
        approval_decision: {
          action: input.action,
          change_notes: input.changeNotes
        }
      })
    });

    return response.json();
  })
```

### 5.3 Smart Dependency Detection (BFS Algorithm)

**Implementation** (Python):

```python
# dependency_analyzer.py
from collections import deque

class DependencyAnalyzer:
    def __init__(self, manifest: dict):
        # Build adjacency list from manifest edges
        self.graph = {}
        for edge in manifest["edges"]:
            source, target = edge["source"], edge["target"]
            if source not in self.graph:
                self.graph[source] = []
            self.graph[source].append(target)

    def get_affected_downstream(self, changed_node: str, change_notes: dict) -> list[str]:
        """
        Find all downstream nodes affected by changes to `changed_node`.
        Uses breadth-first search to traverse dependency graph.

        Args:
            changed_node: ID of the node with changes
            change_notes: Per-item notes (e.g., {"shot_3": "Make more energetic"})

        Returns:
            List of affected downstream node IDs
        """
        affected = []
        queue = deque([changed_node])
        visited = set()

        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)

            # Check if current node uses output from changed_node
            if self._is_affected(current, changed_node, change_notes):
                affected.append(current)

                # Add downstream nodes to queue
                for downstream in self.graph.get(current, []):
                    queue.append(downstream)

        return affected

    def _is_affected(self, node: str, changed_node: str, change_notes: dict) -> bool:
        """
        Determine if `node` is affected by changes to `changed_node`.

        Simple heuristic: If node's input references changed_node's output, it's affected.
        Refinement: If change_notes specify specific items, check if node uses those items.
        """
        # Example: change_notes = {"shot_3": ...}
        # If node is "render_image_shot_3", it's affected
        # If node is "render_image_shot_1", it's NOT affected

        if not change_notes:
            return True  # Assume all downstream affected if no specific notes

        # Check if node ID contains any changed item IDs
        for item_id in change_notes.keys():
            if item_id in node:
                return True

        return False
```

**Example scenario**:

```
Workflow: plan_script → approve_script → create_storyboard → approve_storyboard
                                               ↓
                                          render_images (7 parallel)
                                               ↓
                                         approve_images
                                               ↓
                                          render_videos (7 parallel)

User requests change to image 4 at approve_images gate.

change_notes = {"image_4": "Brighter lighting"}

Affected downstream nodes:
1. render_video_shot_4 (uses image_4 as input)
2. approve_videos (depends on all videos, but only video_4 changed)

NOT affected:
- render_video_shot_1, shot_2, shot_3, shot_5, shot_6, shot_7
- approve_storyboard (upstream)
- plan_script (upstream)
```

### 5.4 Budget Enforcement Pattern (Revised)

**Implementation** (Python):

```python
from sqlalchemy import select, update
from sqlalchemy.orm import Session

async def check_budget_before_step(
    session: Session,
    user_id: int,
    execution_id: str,
    step_id: str,
    estimated_cost_credits: int
) -> bool:
    """
    Check if user has sufficient budget before executing a step.
    Enforces hard stop at step boundaries (not individual API calls).

    Returns:
        True if budget OK, raises BudgetExceededError otherwise
    """
    # Fetch user's current credit balance with lock
    result = await session.execute(
        select(User.credits_available)
        .where(User.id == user_id)
        .with_for_update()  # Pessimistic lock to prevent race conditions
    )
    available_credits = result.scalar_one()

    if available_credits < estimated_cost_credits:
        # Emit budget exceeded event
        await redis.publish("workflow:events", json.dumps({
            "type": "budget_exceeded",
            "execution_id": execution_id,
            "user_id": user_id,
            "required": estimated_cost_credits,
            "available": available_credits
        }))

        raise BudgetExceededError(
            f"Insufficient credits. Step requires {estimated_cost_credits}, "
            f"but only {available_credits} available. "
            f"Please upgrade your plan or wait for monthly reset."
        )

    # Reserve budget (pessimistic deduction)
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(credits_available=User.credits_available - estimated_cost_credits)
    )

    # Record reservation in execution
    await session.execute(
        update(WorkflowExecution)
        .where(WorkflowExecution.id == execution_id)
        .values(budget_reserved_credits=WorkflowExecution.budget_reserved_credits + estimated_cost_credits)
    )

    await session.commit()
    return True

async def finalize_budget_after_step(
    session: Session,
    user_id: int,
    execution_id: str,
    estimated_cost: int,
    actual_cost: int
):
    """
    Finalize budget after step completes.
    Refund if actual < estimated, deduct extra if actual > estimated.
    """
    difference = actual_cost - estimated_cost

    if difference != 0:
        # Adjust user's credit balance
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(credits_available=User.credits_available - difference)
        )

    # Update execution's spent budget
    await session.execute(
        update(WorkflowExecution)
        .where(WorkflowExecution.id == execution_id)
        .values(budget_spent_credits=WorkflowExecution.budget_spent_credits + actual_cost)
    )

    await session.commit()

# Budget alerts (70%, 90%, 100%)
async def check_budget_alerts(user_id: int, credits_used_today: int):
    user = await session.get(User, user_id)
    monthly_limit = user.credits_quota  # From subscription plan

    percentage = (credits_used_today / monthly_limit) * 100

    if percentage >= 100:
        await notify_user(user_id, "budget_hard_stop", {"threshold": 100})
    elif percentage >= 90 and not user.alerted_90:
        await notify_user(user_id, "budget_warning", {"threshold": 90})
        user.alerted_90 = True
    elif percentage >= 70 and not user.alerted_70:
        await notify_user(user_id, "budget_warning", {"threshold": 70})
        user.alerted_70 = True
```

**Key changes from original**:
- Budget checked at **step boundaries**, not per API call
- If step in progress, allow completion (avoid wasting partial work)
- Two-phase protocol: reserve estimated, finalize with actual
- Alerts at 70%, 90%, 100%

### 5.5 Retry with Exponential Backoff Pattern

**Implementation** (Python):

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

class NetworkError(Exception):
    pass

class RateLimitError(Exception):
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    retry=retry_if_exception_type((NetworkError, RateLimitError, httpx.TimeoutException)),
    reraise=True
)
async def call_external_api(url: str, payload: dict) -> dict:
    """
    Call external API with automatic retry.

    Retry attempts:
    - Attempt 1: Immediate
    - Attempt 2: After 2 seconds
    - Attempt 3: After 8 seconds (2^3)

    Total max duration: ~10 seconds
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitError("API rate limit exceeded") from e
            elif 500 <= e.response.status_code < 600:
                raise NetworkError(f"Server error: {e.response.status_code}") from e
            else:
                # Don't retry 4xx errors (bad request, auth failure, etc.)
                raise
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            raise NetworkError("Network timeout or connection error") from e

# Usage in workflow node
async def render_image_node(state: WorkflowState) -> WorkflowState:
    prompt = state["step_results"]["plan_script"]["shots"][0]["description"]

    try:
        result = await call_external_api(
            "https://fal.ai/api/generate-image",
            {"prompt": prompt, "model": "flux-pro"}
        )
        state["artifacts"].append({"type": "image", "url": result["image_url"]})
    except Exception as e:
        # All 3 retries failed
        logger.error(f"Image generation failed after 3 attempts: {e}")

        # Emit failure event for user notification
        await redis.publish("workflow:events", json.dumps({
            "type": "step_failed",
            "execution_id": state["execution_id"],
            "step_id": "render_image_shot_1",
            "error": str(e),
            "retries_exhausted": True
        }))

        raise  # Workflow will enter failed state

    return state
```

### 5.6 Multi-Channel Notification Pattern (Revised)

**Architecture**: Python emits events → Node.js dispatches notifications

**Python** (event emission):

```python
# python-backend/app/services/notification_events.py
import redis.asyncio as redis

async def emit_notification_event(
    event_type: str,
    user_id: int,
    execution_id: str,
    data: dict
):
    """
    Emit notification event to Redis for Node.js to consume and dispatch.
    """
    event = {
        "type": event_type,
        "user_id": user_id,
        "execution_id": execution_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data
    }

    redis_client = await redis.from_url(settings.REDIS_URL)
    await redis_client.publish("workflow:events", json.dumps(event))

    logger.info(f"Emitted notification event: {event_type} for user {user_id}")

# Usage in workflow
async def approval_gate_node(state: WorkflowState):
    # ... create approval request ...

    await emit_notification_event(
        event_type="approval_requested",
        user_id=state["user_id"],
        execution_id=state["execution_id"],
        data={
            "gate_id": state["current_gate"],
            "approval_request_id": approval_request.id,
            "content_preview": state["step_results"][state["current_gate"]]["content"][:200]
        }
    )
```

**Node.js** (event consumption and dispatch):

```typescript
// apps/web/server/services/workflowNotificationService.ts
import { createClient } from "redis";
import { notificationService } from "./notificationService";

const subscriber = createClient({ url: process.env.REDIS_URL });
await subscriber.connect();

await subscriber.subscribe("workflow:events", async (message) => {
  const event = JSON.parse(message);

  switch (event.type) {
    case "approval_requested":
      await handleApprovalRequested(event);
      break;
    case "workflow_completed":
      await handleWorkflowCompleted(event);
      break;
    case "workflow_failed":
      await handleWorkflowFailed(event);
      break;
    case "budget_warning":
      await handleBudgetWarning(event);
      break;
  }
});

async function handleApprovalRequested(event: WorkflowEvent) {
  const { user_id, execution_id, data } = event;

  // Fetch user preferences from database
  const userPrefs = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, user_id)
  });

  // Determine channels based on event type and user preferences
  const channels = getChannelsForEvent("approval_requested", userPrefs);
  // channels = ["in_app", "push", "telegram"]  (example)

  // Dispatch to all channels in parallel
  await Promise.all([
    channels.includes("in_app") && dispatchInApp(user_id, event),
    channels.includes("push") && dispatchBrowserPush(user_id, event),
    channels.includes("email") && dispatchEmail(user_id, event),
    channels.includes("telegram") && dispatchTelegram(user_id, event)
  ]);

  // Log to notification_history table
  await db.insert(notificationHistory).values({
    user_id,
    execution_id,
    event_type: "approval_requested",
    channels: channels.join(","),
    delivered_at: new Date(),
    delivery_status: { /* per-channel success/failure */ }
  });
}

async function dispatchInApp(user_id: number, event: WorkflowEvent) {
  // Insert into user_notifications table (existing functionality)
  await notificationService.create({
    userId: user_id,
    type: "workflow_approval",
    title: "Approval Needed",
    message: `Your workflow needs approval at ${event.data.gate_id}`,
    link: `/workflows/executions/${event.execution_id}`,
    read: false
  });
}

async function dispatchTelegram(user_id: number, event: WorkflowEvent) {
  // Use existing telegramService (already implemented in codebase)
  const telegram_chat_id = await getUserTelegramChatId(user_id);

  if (telegram_chat_id) {
    await telegramService.sendMessage(telegram_chat_id, {
      text: `🔔 *Approval Needed*\n\nWorkflow: ${event.execution_id}\nGate: ${event.data.gate_id}\n\n[View Details](${APP_URL}/workflows/executions/${event.execution_id})`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `approve:${event.execution_id}:${event.data.gate_id}` },
          { text: "✏️ Request Changes", callback_data: `changes:${event.execution_id}:${event.data.gate_id}` }
        ]]
      }
    });
  }
}

function isQuietHours(userPrefs: UserSettings): boolean {
  if (!userPrefs.quiet_hours_enabled) return false;

  // FIX: Use user's timezone, not UTC
  const now = DateTime.now().setZone(userPrefs.timezone || "UTC");
  const currentHour = now.hour;

  const quietStart = userPrefs.quiet_hours_start || 22;  // 10 PM
  const quietEnd = userPrefs.quiet_hours_end || 7;       // 7 AM

  if (quietStart > quietEnd) {
    // Crosses midnight (e.g., 10 PM - 7 AM)
    return currentHour >= quietStart || currentHour < quietEnd;
  } else {
    return currentHour >= quietStart && currentHour < quietEnd;
  }
}

function getChannelsForEvent(eventType: string, userPrefs: UserSettings): string[] {
  const channels: string[] = [];

  // Always include in-app
  channels.push("in_app");

  // Respect quiet hours for push and telegram
  const isQuiet = isQuietHours(userPrefs);

  switch (eventType) {
    case "approval_requested":
      // High priority: all channels (unless quiet hours)
      if (!isQuiet && userPrefs.notifications_push) channels.push("push");
      if (!isQuiet && userPrefs.notifications_telegram) channels.push("telegram");
      if (userPrefs.notifications_email) channels.push("email");
      break;

    case "workflow_completed":
      // Medium priority: in-app + push + telegram
      if (!isQuiet && userPrefs.notifications_push) channels.push("push");
      if (!isQuiet && userPrefs.notifications_telegram) channels.push("telegram");
      break;

    case "workflow_failed":
      // High priority: all channels (ignore quiet hours for failures)
      if (userPrefs.notifications_push) channels.push("push");
      if (userPrefs.notifications_email) channels.push("email");
      if (userPrefs.notifications_telegram) channels.push("telegram");
      break;

    case "budget_warning":
      // Low priority: in-app + email only
      if (userPrefs.notifications_email) channels.push("email");
      break;
  }

  return channels;
}
```

**Key fixes from review**:
- Python emits events, Node.js dispatches (leverages existing services)
- Quiet hours use user's timezone, not UTC
- Telegram inline buttons for quick approve/reject

---

## 6. Testing Strategy

### 6.1 Test Coverage Requirements

Maintain **80% coverage minimum** (already enforced in CI).

**Focus areas** (per stakeholder interview):
1. Approval gates & HITL workflows
2. Cost calculation & budget limits
3. Virtual flow execution engine
4. Calendar integration

### 6.2 Unit Tests

**Python** (`pytest`):

```python
# tests/test_dependency_analyzer.py
def test_smart_invalidation_linear_flow():
    manifest = {
        "edges": [
            {"source": "A", "target": "B"},
            {"source": "B", "target": "C"},
            {"source": "C", "target": "D"}
        ]
    }
    analyzer = DependencyAnalyzer(manifest)

    affected = analyzer.get_affected_downstream("B", {})
    assert set(affected) == {"C", "D"}  # B invalidates C and D, not A

def test_smart_invalidation_parallel_flow():
    # A → B → [C1, C2, C3] → D
    manifest = {
        "edges": [
            {"source": "A", "target": "B"},
            {"source": "B", "target": "C1"},
            {"source": "B", "target": "C2"},
            {"source": "B", "target": "C3"},
            {"source": "C1", "target": "D"},
            {"source": "C2", "target": "D"},
            {"source": "C3", "target": "D"}
        ]
    }
    analyzer = DependencyAnalyzer(manifest)

    affected = analyzer.get_affected_downstream("C2", {})
    assert "C1" not in affected  # C1 not affected by C2
    assert "C3" not in affected  # C3 not affected by C2
    assert "D" in affected       # D depends on C2

def test_budget_enforcement_insufficient_credits():
    with pytest.raises(BudgetExceededError, match="Insufficient credits"):
        await check_budget_before_step(
            session, user_id=1, execution_id="abc",
            step_id="plan_script", estimated_cost_credits=1000
        )
```

**TypeScript** (`vitest`):

```typescript
// apps/web/client/src/components/WorkflowBuilder.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowBuilder } from "./WorkflowBuilder";

test("adds LLM node to canvas on drag", async () => {
  render(<WorkflowBuilder />);

  const llmNode = screen.getByText("LLM Node");
  const canvas = screen.getByTestId("reactflow-canvas");

  // Simulate drag-and-drop
  fireEvent.dragStart(llmNode);
  fireEvent.drop(canvas, { clientX: 100, clientY: 100 });

  // Verify node added
  expect(screen.getByTestId("node-llm-1")).toBeInTheDocument();
});

test("validates connection types", async () => {
  // LLM output (string) cannot connect to Image input (image)
  const { container } = render(<WorkflowBuilder initialNodes={[
    { id: "llm1", type: "llm", data: {} },
    { id: "img1", type: "image", data: {} }
  ]} />);

  // Attempt invalid connection
  const connection = { source: "llm1", target: "img1" };
  const isValid = validateConnection(connection);

  expect(isValid).toBe(false);
});
```

### 6.3 Integration Tests

**Approval workflow** (Python + pytest):

```python
@pytest.mark.integration
async def test_full_approval_workflow():
    # 1. Start workflow
    execution = await orchestrator.start_workflow(
        template_id=1, user_id=1, inputs={"brief": "Test"}
    )

    # 2. Wait for approval gate
    await wait_for_status(execution.id, "waiting_approval")

    # 3. Submit approval decision
    decision = {"action": "approve"}
    await orchestrator.resume_workflow(execution.id, "approve_script", decision)

    # 4. Verify workflow continues
    await wait_for_status(execution.id, "completed")

    # 5. Verify result
    state = await get_workflow_state(execution.id)
    assert "final_result" in state["artifacts"]
```

**Budget enforcement** (Python + pytest):

```python
@pytest.mark.integration
async def test_budget_hard_stop():
    # Set user's credits to 100
    await update_user_credits(user_id=1, credits=100)

    # Start workflow that costs 150 credits
    execution = await orchestrator.start_workflow(
        template_id=2, user_id=1, inputs={}
    )

    # Verify workflow blocked
    await wait_for_status(execution.id, "failed")

    state = await get_workflow_state(execution.id)
    assert "BudgetExceededError" in state["error"]
```

### 6.4 End-to-End Tests (Playwright)

```typescript
// e2e/workflow.spec.ts
import { test, expect } from "@playwright/test";

test("complete video ad workflow", async ({ page }) => {
  // 1. Login
  await page.goto("/login");
  await page.fill('input[name="email"]', "test@example.com");
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');

  // 2. Start workflow from chat
  await page.goto("/chat");
  await page.fill('textarea[name="message"]', "Create a video ad for EcoBottle");
  await page.click('button[aria-label="Send"]');

  // 3. Wait for approval gate
  await expect(page.locator("text=Approval Needed")).toBeVisible({ timeout: 60000 });

  // 4. Review script
  const script = await page.locator('[data-testid="approval-content"]').textContent();
  expect(script).toContain("EcoBottle");

  // 5. Approve
  await page.click('button:has-text("Approve")');

  // 6. Wait for next approval gate (storyboard)
  await expect(page.locator("text=Approve Storyboard")).toBeVisible({ timeout: 60000 });
  await page.click('button:has-text("Approve")');

  // 7. Wait for final result
  await expect(page.locator("text=Workflow Complete")).toBeVisible({ timeout: 300000 });

  // 8. Verify video artifact
  const videoUrl = await page.locator('video[data-testid="final-video"]').getAttribute("src");
  expect(videoUrl).toBeTruthy();
});

test("fork and customize marketplace skill", async ({ page }) => {
  // 1. Browse marketplace
  await page.goto("/marketplace");

  // 2. Select skill
  await page.click('text="Video Ad Creator"');

  // 3. Fork
  await page.click('button:has-text("Fork to My Skills")');
  await expect(page.locator("text=Forked successfully")).toBeVisible();

  // 4. Open in flow builder
  await page.goto("/workflows/my-skills");
  await page.click('text="Video Ad Creator (My Copy)"');
  await page.click('button:has-text("Edit Flow")');

  // 5. Modify flow (add a node)
  await page.dragAndDrop('[data-node-type="llm"]', '[data-testid="reactflow-canvas"]', {
    targetPosition: { x: 400, y: 200 }
  });

  // 6. Save
  await page.click('button:has-text("Save Flow")');
  await expect(page.locator("text=Flow saved")).toBeVisible();

  // 7. Execute modified workflow
  await page.click('button:has-text("Run Workflow")');

  // Verify it uses the modified version
  await expect(page.locator('[data-testid="execution-log"]')).toContainText("custom_llm_node");
});
```

### 6.5 Testing Infrastructure

**CI/CD Pipeline** (GitHub Actions):

```yaml
name: Test All
on: [push, pull_request]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: "3.11"
      - name: Install dependencies
        run: |
          cd python-backend
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-asyncio
      - name: Run tests
        run: |
          cd python-backend
          pytest --cov=app --cov-report=xml --cov-fail-under=80
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - name: Install dependencies
        run: |
          cd apps/web
          pnpm install
      - name: Run tests
        run: |
          cd apps/web
          pnpm test:coverage
      - name: Check coverage
        run: |
          cd apps/web
          pnpm vitest --coverage --reporter=json --coverage.thresholds.lines=80

  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Start services
        run: docker-compose up -d
      - name: Run E2E tests
        run: npx playwright test
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 7. Deployment & Rollout

### 7.1 Zero-Downtime Deployment Strategy

**Rolling restart** for stateless services (Node.js, Python):

```bash
# Deploy script (deploy.sh)
#!/bin/bash

# 1. Build new Docker images
docker build -t smartspec-web:latest ./apps/web
docker build -t smartspec-python:latest ./python-backend

# 2. Database migrations (run BEFORE code deploy)
docker exec smartspec-python alembic upgrade head
docker exec smartspec-web pnpm db:push

# 3. Rolling restart (one instance at a time)
docker-compose up -d --no-deps --scale web=2 --scale python=2

# Wait for health check
sleep 10

# 4. Stop old instances
docker-compose stop web-old python-old
docker-compose rm -f web-old python-old

# 5. Verify services
curl -f http://localhost:3000/health || exit 1
curl -f http://localhost:8000/health || exit 1
```

**Celery workers**: Graceful shutdown with `SIGTERM`

```bash
# Send SIGTERM to allow current tasks to finish
docker-compose stop -t 60 celery-worker-media celery-worker-video

# Start new workers with updated code
docker-compose up -d celery-worker-media celery-worker-video
```

### 7.2 Feature Flags for Gradual Rollout

Use existing feature flag system (if not present, implement simple version):

```typescript
// apps/web/server/services/featureFlagService.ts
export const FEATURE_FLAGS = {
  WORKFLOW_ENGINE: { enabled: false, rollout: 0 },  // 0% of users
  SKILL_MARKETPLACE: { enabled: false, rollout: 0 },
  VIRTUAL_FLOW_BUILDER: { enabled: false, rollout: 0 },
  AI_SECRETARY: { enabled: false, rollout: 0 }
};

export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS, userId: number): boolean {
  const flag = FEATURE_FLAGS[feature];
  if (!flag.enabled) return false;

  // Gradual rollout based on user ID hash
  const hash = userId % 100;
  return hash < flag.rollout;
}
```

**Rollout plan**:

- **Week 1**: Internal testing (rollout: 0%, enabled: true for admin users only)
- **Week 2**: Beta testers (rollout: 5%)
- **Week 3**: Gradual increase (rollout: 25%)
- **Week 4**: Majority (rollout: 75%)
- **Week 5**: Full rollout (rollout: 100%)

### 7.3 Database Migration Safety

**Alembic** (Python):

```bash
# Generate migration
cd python-backend
alembic revision --autogenerate -m "Add workflow tables"

# Review migration SQL
alembic upgrade head --sql

# Backup database before running
./scripts/backup-db.sh

# Run migration
alembic upgrade head

# Verify data integrity
python scripts/verify_migration.py
```

**Drizzle** (Node.js):

```bash
# Generate migration
cd apps/web
pnpm db:generate

# Review migration SQL
cat drizzle/*.sql

# Backup database
./scripts/backup-db.sh

# Run migration
pnpm db:push

# Verify
pnpm db:studio  # Open Drizzle Studio to inspect
```

### 7.4 Monitoring & Alerts

**Prometheus metrics** (Python):

```python
# python-backend/app/core/metrics.py
from prometheus_client import Counter, Histogram, Gauge

workflow_executions_total = Counter(
    "workflow_executions_total",
    "Total workflow executions",
    ["status", "template_id"]
)

workflow_duration_seconds = Histogram(
    "workflow_duration_seconds",
    "Workflow execution duration",
    buckets=[10, 30, 60, 120, 300, 600, 1800, 3600]
)

checkpoint_write_duration_ms = Histogram(
    "checkpoint_write_duration_ms",
    "PostgreSQL checkpoint write latency",
    buckets=[10, 25, 50, 100, 250, 500, 1000]
)

active_workflows = Gauge(
    "active_workflows",
    "Number of currently running workflows"
)

# Usage
workflow_executions_total.labels(status="completed", template_id=1).inc()
workflow_duration_seconds.observe(execution_time)
```

**Grafana Dashboard**:

- Workflow execution rate (per minute)
- Success/failure ratio
- Average execution duration
- Budget consumption rate
- Checkpoint write latency (p50, p95, p99)
- Active workflows count

**Alerts** (via Prometheus Alertmanager):

```yaml
# alerts.yml
groups:
  - name: workflow_alerts
    rules:
      - alert: HighWorkflowFailureRate
        expr: rate(workflow_executions_total{status="failed"}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High workflow failure rate detected"

      - alert: CheckpointLatencyHigh
        expr: histogram_quantile(0.95, checkpoint_write_duration_ms) > 100
        for: 10m
        annotations:
          summary: "Checkpoint write latency p95 > 100ms"

      - alert: BudgetExhaustedUsers
        expr: increase(budget_exceeded_total[1h]) > 10
        annotations:
          summary: "10+ users hit budget limit in past hour"
```

---

## 8. Risk Mitigation

### 8.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **PostgreSQL checkpointer latency >100ms** | High | Medium | Benchmark early, optimize queries, use connection pooling, consider checkpoint batching |
| **JSONB state_json grows too large (>1MB)** | Medium | High | Add compression for old states, normalize artifacts to separate table, monitor state size |
| **LangGraph version incompatibility** | High | Low | Pin exact version, test upgrades in staging, maintain backward compatibility for state format |
| **ChromaDB performance degradation at 50K+ docs** | Medium | Medium | Monitor query latency, add reranking layer, plan Qdrant migration path |
| **Flow compiler bugs (invalid StateGraph)** | High | Medium | Comprehensive unit tests, schema validation, sandbox testing, gradual rollout |
| **OAuth token refresh failures** | Medium | Medium | Implement retry logic, proactive refresh before expiry, clear error messages |

### 8.2 Security Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Malicious skill manifest (prompt injection)** | High | Medium | Manifest validation, tool allowlist, LLM output sanitization, admin review required |
| **OAuth token leakage** | Critical | Low | AES-256-GCM encryption, rotate keys regularly, audit access logs, use secure HTTP-only cookies |
| **Approval bypass (direct API call)** | High | Low | Require signature validation, check workflow state integrity, audit all approval actions |
| **Budget manipulation (race condition)** | Medium | Low | Use `SELECT FOR UPDATE`, pessimistic locking, audit all credit transactions |
| **XSS in user-generated skill descriptions** | Medium | Medium | Sanitize all user input, use DOMPurify, set CSP headers |

### 8.3 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Celery worker crash mid-workflow** | Medium | Medium | Task acknowledgment late, task rejection on worker lost, checkpoint after each step |
| **Redis failure (lost events)** | High | Low | Redis persistence (AOF), backup pub/sub to database fallback, retry failed notifications |
| **Database migration failure** | Critical | Low | Full database backup before migration, test in staging, rollback plan, verify row counts |
| **External API downtime (image/video generation)** | Medium | Medium | Retry with exponential backoff (3 attempts), circuit breaker pattern, clear user messaging |
| **State cleanup job deletes active workflows** | High | Low | Only delete states with `status IN ('cancelled', 'failed')` AND `expires_at < NOW()`, add safety margin |

### 8.4 UX Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Notification fatigue (too many alerts)** | Medium | High | Respect quiet hours, allow per-event-type channel selection, batching similar events |
| **Approval timeout (user forgets)** | Medium | High | Send reminder after 24 hours, show "expires in X days" in UI, allow manual extension |
| **Confusing skill versioning (breaking changes)** | Medium | Medium | Show changelog on upgrade, flag breaking changes, allow rollback to previous version |
| **Flow builder too complex for non-technical users** | Medium | Medium | Preset node library (vs arbitrary code), guided tutorials, example templates |
| **Budget exhaustion mid-workflow (wasted work)** | High | Medium | Budget check at step boundaries (not mid-step), clear "budget low" warnings, allow step completion |

---

## 9. Success Criteria

### 9.1 Functional Requirements Met

- ✅ Users can execute multi-step workflows with approval gates
- ✅ Smart dependency detection preserves unaffected work
- ✅ Budget hard stop prevents overages
- ✅ Skill marketplace with versioning and forking
- ✅ Visual flow builder with ReactFlow
- ✅ Google Calendar integration (read, write, suggest times)
- ✅ Multi-channel notifications (in-app, push, email, Telegram)

### 9.2 Non-Functional Requirements Met

- ✅ 80% test coverage maintained
- ✅ p95 API latency <500ms
- ✅ Checkpoint write latency p95 <100ms
- ✅ Zero-downtime deployments
- ✅ Security audit passes (no HIGH/CRITICAL issues)
- ✅ Handles 100 concurrent workflow executions
- ✅ State retention works (7-day expiration)

### 9.3 User Acceptance Criteria

- ✅ 90% of beta testers successfully complete video ad workflow end-to-end
- ✅ <5% approval timeout rate (users respond within 7 days)
- ✅ <10% budget exhaustion complaints (users understand budget limits)
- ✅ Marketplace has >20 approved skills after 4 weeks
- ✅ Flow builder adoption: 30% of workflows created visually (vs chat)

---

## 10. Appendices

### A. Glossary

- **Approval Gate**: A workflow node that pauses execution and waits for human decision
- **Checkpoint**: Persistent snapshot of workflow state in PostgreSQL
- **LangGraph**: State machine framework for building agentic workflows
- **Manifest**: JSON specification defining a skill's nodes, edges, inputs, outputs
- **Smart Invalidation**: Algorithm that only clears downstream results affected by changes
- **StateGraph**: LangGraph graph compiled from workflow manifest

### B. References

- LangGraph PostgreSQL Checkpointing: https://langchain-ai.github.io/langgraph/reference/checkpoints/
- ChromaDB Documentation: https://docs.trychroma.com/
- ReactFlow Documentation: https://reactflow.dev/
- Google Calendar API: https://developers.google.com/calendar/api
- Tenacity (Python retry library): https://tenacity.readthedocs.io/

### C. Open Questions (to be resolved during implementation)

1. **ChromaDB vs Qdrant migration timing**: At what scale trigger migration? (Monitor: if latency >500ms at 50K docs)
2. **Skill manifest version compatibility**: How to handle state migration between skill v1.0 and v2.0 with different state schema?
3. **Multi-tenant workflow isolation**: Should marketplace skills be truly global, or duplicated per tenant?
4. **Gmail integration scope** (Phase 5+): Email classification only, or full auto-response with approval gates?

---

**End of Implementation Plan v2.0**

**Next Steps**:
1. User review and approval of this plan
2. Apply TDD approach (generate test stubs)
3. Begin Phase 1 implementation (Weeks 1-3)

**Estimated Total Duration**: 14 weeks with 2-3 engineers
**Confidence Level**: High (85%) — leverages extensive existing infrastructure, addresses all critical review feedback
