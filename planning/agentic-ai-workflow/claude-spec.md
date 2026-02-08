# SmartSpecPro Agentic AI Workflow System - Comprehensive Specification

**Version**: 1.0
**Date**: 2026-02-08
**Status**: Specification Complete - Ready for Planning

---

## Executive Summary

This document specifies the implementation of an Agentic AI workflow system for SmartSpecPro that enables users to accomplish complex multi-step tasks through natural language chat interfaces with human-in-the-loop approval gates. The system includes:

1. **Agentic Workflow Engine** - Multi-step task execution with approval gates using LangGraph
2. **Skill Marketplace** - Extensible skill system with public templates and private customization
3. **Virtual Flow Builder** - Visual workflow editor for creating and chaining skills
4. **AI Secretary** - Proactive calendar, email, and task management capabilities

**Key Decision**: Leverage extensive existing infrastructure (ChromaDB, LangGraph orchestrator, approval gates, multi-provider LLM gateway, Celery queues) rather than building from scratch.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Goals & Scope](#goals--scope)
3. [Architecture](#architecture)
4. [Detailed Requirements](#detailed-requirements)
5. [Technical Stack](#technical-stack)
6. [Implementation Priorities](#implementation-priorities)
7. [Success Criteria](#success-criteria)

---

## 1. System Overview

### 1.1 What is Agentic AI for Office Workflows?

The system is not just "answering questions" but a **work assistant that completes tasks to deliverables** with these characteristics:

- Accepts high-level "goals/briefs" from user in natural language
- Operates through multiple steps (plan → act → observe → revise)
- Calls **tools** (APIs for image/video/document generation, information retrieval, external integrations)
- Has **approval gates** for user review and control at critical decision points
- Maintains **state** and assets throughout execution (supports pause/resume, rerender iterations)
- Delivers final results in files/links with summaries and versions

### 1.2 Why LangGraph?

Given the requirements for multi-step workflows with conditions, loops, approval gates, and state persistence, **LangGraph** (stateful graph/workflow) is ideal. Use **LangChain** as building blocks for prompts, models, and tool parsers.

**Good News**: SmartSpecPro already has a LangGraph orchestrator at `/python-backend/app/orchestrator/orchestrator.py` that supports:
- Workflow execution (state machine)
- Checkpoint system (resume capability)
- Parallel execution
- Validation

---

## 2. Goals & Scope

### 2.1 Primary Goals

1. **Natural Interaction**: Users command tasks from existing Chat interface
2. **Structured Planning**: System generates plans (outline/shot list/storyboard/workflow) and requests approval
3. **Automated Execution**: After approval, system executes tasks automatically through multiple stages
4. **Human Control**: Users can **review** or **approve** at each critical stage
5. **Deliverable Output**: Final artifacts (video, document, scheduled meetings) with supporting materials

### 2.2 MVP Scope - Phase 1

**Use Case 1: Video Ad from Brief**
- User provides brief (brand, product, concept, duration 40-60 seconds)
- **4 Approval Gates**:
  1. Approve Script/Shot list
  2. Approve Storyboard/Prompts
  3. Approve Images (per shot)
  4. Approve Videos + Final Stitch
- Support rerender for individual shots with seed control
- State persistence with 7-day retention for resume capability
- Final deliverable: video file + script + prompts + shot list

**Use Case 2: Virtual Flow Builder (MVP Foundation)**
- Visual flow editor for creating workflows
- Marketplace flows (public read-only templates)
- Personal flows (private, forkable from marketplace)
- Basic node types: Input, LLM Processing, Tool Execution, Approval Gate, Branching, Output
- Execute flows with approval gates at designated points

**Use Case 3: AI Secretary (MVP - Google Only)**
- **Google Calendar Integration**: Schedule meetings, conflict resolution, optimal time finding
- **Gmail Integration**: Email classification (urgent/meeting/newsletter/etc.), auto-drafted responses with approval
- **Proactive Scheduling**: AI suggests meeting times based on calendar patterns
- **Defer to Phase 2**: Microsoft Outlook/Teams integration

### 2.3 Extended Scope - Phase 2 & Beyond

- Additional workflow templates: presentations, infographics, email campaigns, social media content
- RAG from brand guidelines / style guides / FAQs
- Multi-agent roles (planner / reviewer / brand-guardian)
- Voice input / audio output
- A/B variant testing (generate 2-3 versions for user selection)
- Collaborative workflows (team approvals)

---

## 3. Architecture

### 3.1 System Components

**Existing Infrastructure** (from research):

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND: React 19 + Vite 7 + TailwindCSS 4 + Radix UI     │
│    - Chat UI with message types (Job Cards, Approval Panels)│
│    - Virtual Flow Builder (React Flow)                       │
│    - Preview galleries for media assets                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ tRPC (type-safe RPC)
┌────────────────────────┴─────────────────────────────────────┐
│  BACKEND (Node.js): Express + tRPC                           │
│    - 32+ routers (chat, skills, media, approvals)            │
│    - BullMQ for job coordination                             │
│    - Drizzle ORM + PostgreSQL                                │
│    - WebSocket/SSE for streaming                             │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP + Async Tasks
┌────────────────────────┴─────────────────────────────────────┐
│  PYTHON BACKEND: FastAPI + Celery                            │
│    - LangGraph Orchestrator (workflow engine)                │
│    - Multi-Provider LLM Gateway (OpenAI, Anthropic, etc.)    │
│    - ChromaDB + Hybrid RAG (semantic + BM25)                 │
│    - Approval Service (request/respond/check)                │
│    - Celery Workers (3 queues: celery, media, video)         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE                                              │
│    - PostgreSQL: Job state, approvals, users, credits       │
│    - Redis: Caching, BullMQ queues, Celery broker           │
│    - ChromaDB: Vector search for skills/templates (10K-100K) │
│    - S3/R2: Media asset storage                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

**Agentic Workflow Execution**:
```
User Brief → Chat UI → tRPC → Python Backend → LangGraph Orchestrator
    ↓
    State Initialization (PostgreSQL checkpoint)
    ↓
    Execute Node 1 (plan_script) → LLM + Tools
    ↓
    Checkpoint State
    ↓
    Approval Gate (interrupt) → Notification (in-app, push, email, Telegram)
    ↓
    Wait for User Decision
    ↓
    User Approves → Resume from Checkpoint
    ↓
    Execute Node 2 (generate_images) → Celery Tasks (parallel)
    ↓
    [Repeat for each node with approval gates]
    ↓
    Final Node (deliver) → Store artifacts → Notify user
```

### 3.3 Core Components Detail

#### 3.3.1 LangGraph Workflow Engine

**Location**: `/python-backend/app/orchestrator/orchestrator.py`

**Enhancements Needed**:
- Add PostgreSQL checkpointing (currently falls back to memory)
- Extend state model for multi-step workflows
- Implement smart dependency detection for approval invalidation
- Add cost tracking per workflow step

**State Structure** (extended):
```python
class WorkflowState(TypedDict):
    workflow_id: str
    skill_id: str                    # Which skill/template is being executed
    user_id: int
    inputs: dict                     # User-provided inputs
    status: ExecutionStatus          # pending | running | waiting_approval | completed | failed
    current_step: str
    step_results: Dict[str, Any]     # Results from each step
    artifacts: Dict[str, Artifact]   # Generated assets (images, videos, docs)
    approvals: Dict[str, ApprovalGate]  # Approval status for each gate
    dependencies: Dict[str, List[str]]  # Track which steps depend on which
    budget: BudgetInfo               # Cost tracking and limits
    errors: List[ErrorInfo]
    checkpoint_id: str
    created_at: datetime
    updated_at: datetime
```

#### 3.3.2 Approval Gate System

**Existing Infrastructure**:
- Database models at `/python-backend/app/models/approval.py`
- Service at `/python-backend/app/orchestrator/approval_gates/approval_service.py`
- Control plane token-based approval at `/control-plane/src/routes/approvals.ts`

**Enhancements Needed**:
- **Smart Dependency Detection**: When user requests changes at gate N, detect which downstream gates (N+1, N+2, etc.) are affected
- **Approval Types**: Add workflow-specific types (approve_script, approve_storyboard, approve_images, approve_videos, approve_flow_execution)
- **Notification Integration**: Trigger notifications across all channels (in-app, push, email, Telegram) when approval needed

**Approval Flow**:
```python
# Example: User requests changes to images at gate 3
approval_request = {
    "workflow_id": "WF-001",
    "gate_id": "approve_images",
    "action": "request_changes",
    "shot_overrides": {
        "S3": {"notes": "Make background brighter", "rerender": True},
        "S5": {"notes": "Change angle to close-up", "rerender": True}
    }
}

# System response:
1. Mark approve_images as "changes_requested"
2. Detect dependencies: images → videos → final_stitch
3. Invalidate: approve_videos (since videos depend on changed images)
4. Preserve: approve_script, approve_storyboard (not affected)
5. Queue rerender tasks for S3 and S5 only
6. Resume workflow from render_images node
```

#### 3.3.3 Skill Marketplace & Registry

**New Component** (extends existing skills system at `/apps/web/skills/`)

**Skill Manifest Structure** (YAML):
```yaml
id: "video_ad_from_brief_v1"
version: "1.0.0"
name: "Video Ad from Brief"
category: ["video", "marketing"]
description: "Generate video ad from brand brief with multi-stage approval"
author: "SmartSpec Team"
visibility: "marketplace"  # or "private"

entrypoints:
  chat_enabled: true
  studio_enabled: true

ui:
  inputs:
    - key: "brand"
      label: "Brand Name"
      type: "text"
      required: true

    - key: "concept"
      label: "Creative Concept"
      type: "textarea"
      required: true
      placeholder: "Describe the main idea..."

    - key: "duration_sec"
      label: "Duration (seconds)"
      type: "range"
      required: true
      min: 30
      max: 90
      default: [40, 60]

workflow:
  steps:
    - id: "parse_brief"
      label: "Parse Brief"
      kind: "llm"
      tools: []
      outputs: ["parsed_brief"]

    - id: "plan_script"
      label: "Create Script & Shot List"
      kind: "llm"
      tools: []
      outputs: ["script", "shots"]
      gate:
        type: "approval"
        gate_id: "approve_script"
        label: "Approve Script & Shots"
        cost_sensitive: false

    - id: "make_storyboard"
      label: "Generate Storyboard Prompts"
      kind: "llm"
      tools: []
      outputs: ["prompts"]
      gate:
        type: "approval"
        gate_id: "approve_storyboard"
        label: "Approve Storyboard"
        cost_sensitive: false

    - id: "render_images"
      label: "Generate Images"
      kind: "parallel_tools"
      tools: ["generate_image"]
      outputs: ["images"]
      gate:
        type: "approval"
        gate_id: "approve_images"
        label: "Approve Images"
        cost_sensitive: true

    - id: "render_videos"
      label: "Generate Videos"
      kind: "parallel_tools"
      tools: ["generate_video"]
      outputs: ["videos"]
      gate:
        type: "approval"
        gate_id: "approve_videos"
        label: "Approve Videos"
        cost_sensitive: true

    - id: "stitch_final"
      label: "Stitch Final Video"
      kind: "tool"
      tools: ["stitch_videos"]
      outputs: ["final_video"]

    - id: "deliver"
      label: "Deliver"
      kind: "deliver"

artifacts:
  - id: "final_video"
    type: "video"
    title: "Final Video"
    preview: "player"

  - id: "script"
    type: "markdown"
    title: "Script"
    preview: "markdown"

  - id: "images"
    type: "image_gallery"
    title: "Shot Images"
    preview: "grid"

policy:
  approvals_required: ["approve_script", "approve_storyboard", "approve_images", "approve_videos"]
  max_rerender_per_shot: 3
  budget_per_execution: 500  # credits

cost:
  estimate:
    parse_brief: 0
    plan_script: 10
    make_storyboard: 10
    render_images: 80  # 10 credits × 8 shots
    render_videos: 320  # 40 credits × 8 shots
    stitch_final: 20
    total: 440
```

**Skill Publishing Workflow**:
1. Developer applies for verified status (form + admin approval)
2. Developer creates skill (manifest + code + tests)
3. Developer submits to marketplace → enters approval queue
4. Admin reviews (security, quality, documentation)
5. Admin approves → skill appears in marketplace
6. Users can fork to personal collection and customize

#### 3.3.4 Virtual Flow Builder (React Flow)

**New Component** - Visual workflow editor

**Technology**: React Flow (already uses Radix UI + Tailwind, perfect fit!)

**Features**:
- Drag-and-drop node editor
- Node types: Input, LLM, Tool, Approval Gate, Conditional, Loop, Output
- Visual execution with real-time status updates
- Save/load flows from PostgreSQL (JSON format)
- Fork marketplace flows to personal collection

**Flow Persistence** (new DB tables):
```sql
-- Workflow templates (both marketplace and personal)
CREATE TABLE workflow_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    author_id INT REFERENCES users(id),
    visibility VARCHAR(50), -- 'marketplace' or 'private'
    category VARCHAR(100),
    version VARCHAR(20),
    flow_json JSONB NOT NULL,  -- ReactFlow JSON object
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Workflow executions (runtime instances)
CREATE TABLE workflow_executions (
    id SERIAL PRIMARY KEY,
    template_id INT REFERENCES workflow_templates(id),
    user_id INT REFERENCES users(id),
    status VARCHAR(50), -- pending | running | waiting_approval | completed | failed
    state_json JSONB,   -- WorkflowState
    checkpoint_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Track which marketplace flow was source (for updates)
CREATE TABLE workflow_forks (
    id SERIAL PRIMARY KEY,
    source_template_id INT REFERENCES workflow_templates(id),
    forked_template_id INT REFERENCES workflow_templates(id),
    forked_by INT REFERENCES users(id),
    forked_at TIMESTAMP DEFAULT NOW()
);
```

#### 3.3.5 AI Secretary Components

**Calendar Integration** (Google Calendar MVP):

```python
# /python-backend/app/integrations/calendar/google_calendar.py

class GoogleCalendarService:
    async def get_free_busy(self, calendar_ids: List[str],
                           time_min: datetime, time_max: datetime):
        """Query free/busy status for multiple calendars"""

    async def find_optimal_slots(self, attendees: List[Attendee],
                                 duration_minutes: int,
                                 preferences: SchedulingPreferences):
        """AI-powered meeting time finder with scoring"""

    async def create_event(self, calendar_id: str, event: CalendarEvent):
        """Create calendar event with conflict check"""

    async def setup_webhook(self, calendar_id: str, callback_url: str):
        """Setup push notifications for calendar changes"""
```

**Email Integration** (Gmail MVP):

```python
# /python-backend/app/integrations/email/gmail.py

class GmailService:
    async def classify_email(self, email_content: str) -> EmailClassification:
        """AI classification: urgent_action | meeting | newsletter | etc."""

    async def draft_response(self, email_content: str,
                            context: str) -> DraftResponse:
        """Generate auto-response draft (requires approval)"""

    async def process_inbox(self, user_id: int):
        """Process unread emails with classification + actions"""

    async def create_calendar_event_from_email(self, email_id: str):
        """Extract meeting info and create calendar event"""
```

---

## 4. Detailed Requirements

### 4.1 Functional Requirements

#### FR-1: Agentic Workflow Execution

**FR-1.1**: System shall execute multi-step workflows based on skill manifests
- Parse workflow steps from skill manifest
- Execute each step in sequence (or parallel where specified)
- Store state at each checkpoint
- Support resume after interruption

**FR-1.2**: System shall support approval gates with human-in-the-loop
- Pause execution at designated approval points
- Notify user across all enabled channels (in-app, push, email, Telegram)
- Wait for user decision (approve / request changes / cancel)
- Resume or loop based on decision

**FR-1.3**: System shall implement smart dependency detection
- **Decision (from interview)**: Smart detection - only invalidate affected downstream items
- Track dependencies between workflow steps
- When user requests changes at gate N, detect which downstream gates depend on it
- Invalidate only affected gates, preserve others
- Example: Changes to images invalidate videos, but not script/storyboard

**FR-1.4**: System shall enforce budget limits
- **Decision (from interview)**: Hard stop when budget exceeded
- Check budget before any LLM/media generation request
- Block request with clear error message if insufficient credits
- Track cost per workflow step in real-time
- Alert user at 70%, 90%, 100% of budget

#### FR-2: Skill Marketplace

**FR-2.1**: System shall support skill publishing workflow
- **Decision (from interview)**: Verified developers + admin review
- Users apply for verified developer status
- Verified developers can submit skills for review
- Skills enter admin approval queue
- Admins review for security, quality, documentation
- Approved skills appear in marketplace

**FR-2.2**: System shall validate skill manifests
- JSON Schema validation for manifest structure
- Tool calls must be from allowlist
- Required fields: id, version, name, description, workflow.steps, artifacts
- Cost estimates must be reasonable

**FR-2.3**: System shall support skill versioning
- **Decision (from interview)**: Auto-upgrade on resume
- Skills use semantic versioning (MAJOR.MINOR.PATCH)
- Running workflows use pinned version
- Paused workflows upgrade to latest on resume
- Show changelog notification on resume with new version
- Support rollback if upgraded workflow fails

**FR-2.4**: System shall enable forking and customization
- **Decision (from interview)**: Marketplace + personal mix
- Users can fork marketplace skills to personal collection
- Forked skills are private by default
- Users can modify forked skills (inputs, steps, prompts)
- Track source template for update notifications

#### FR-3: Virtual Flow Builder

**FR-3.1**: System shall provide visual workflow editor
- React Flow based editor with drag-and-drop
- Node types: Input, LLM, Tool, Approval Gate, Conditional, Loop, Output
- Visual connection of nodes with edges
- Real-time validation (no circular dependencies, valid connections)

**FR-3.2**: System shall execute visual workflows
- Parse ReactFlow JSON into executable LangGraph
- Execute nodes in topological order
- Support conditional branching (if-then-else)
- Support loops with termination conditions
- Show real-time execution status on nodes

**FR-3.3**: System shall persist workflows
- Save flow JSON to PostgreSQL
- Auto-save during editing (debounced)
- Version history (optional for Phase 2)
- Export/import as JSON files

#### FR-4: AI Secretary

**FR-4.1**: System shall integrate with Google Calendar (MVP)
- OAuth authentication flow
- Free/busy query for optimal time finding
- Create/update/delete events
- Webhook for real-time calendar changes
- Conflict resolution with ETag-based optimistic locking

**FR-4.2**: System shall implement optimal meeting scheduling
- AI-powered slot scoring algorithm
- Factors: working hours, back-to-back meetings, user preferences, workload balance
- Multi-calendar intersection (find times that work for all attendees)
- Proactive suggestions based on email/chat context

**FR-4.3**: System shall integrate with Gmail (MVP)
- OAuth authentication flow
- Email classification using LLM (urgent_action | meeting | newsletter | transactional | low_priority)
- Priority detection and inbox filtering
- Auto-draft responses with approval gate

**FR-4.4**: System shall provide proactive scheduling
- Detect scheduling intent in emails/chat
- Suggest meeting times before user opens calendar
- Automatically schedule after user approval
- Dynamic reprioritization when urgent items appear

### 4.2 Non-Functional Requirements

#### NFR-1: Performance

**NFR-1.1**: LLM response streaming shall start within 2 seconds
- Existing infrastructure supports SSE streaming

**NFR-1.2**: Vector search queries shall complete within 500ms
- **Decision (from interview)**: Medium scale (10K-100K documents)
- ChromaDB suitable for MVP
- Add reranking layer (MixedBread or Cohere) for top-k=25 → top-n=3
- Plan migration to Qdrant if query latency exceeds 500ms

**NFR-1.3**: Approval notifications shall be delivered within 10 seconds
- All channels: in-app (real-time via WebSocket), push, email, Telegram

**NFR-1.4**: Visual workflow editor shall render 100+ node flows smoothly
- Use React.memo for node components
- Implement virtualization if needed

#### NFR-2: Reliability

**NFR-2.1**: System shall retry failed external API calls
- **Decision (from interview)**: Auto-retry with exponential backoff
- 3 attempts: immediate, after 2s, after 8s
- Retry transient errors only (5xx, timeout, rate limit)
- Don't retry 4xx client errors
- Implement circuit breaker for prolonged failures

**NFR-2.2**: System shall persist workflow state
- **Decision (from interview)**: 7 days retention for paused workflows
- PostgreSQL checkpoints after each step
- Resume from last successful checkpoint
- Notify user 24 hours before state expiration

**NFR-2.3**: System shall handle concurrent workflows
- Support multiple users executing different workflows simultaneously
- Unique thread_id per workflow execution
- No race conditions in state updates

#### NFR-3: Security

**NFR-3.1**: System shall encrypt sensitive data
- OAuth tokens encrypted with AES-256-GCM (existing crypto.ts)
- API keys stored in encrypted columns
- Use existing encryption system (Node.js crypto.ts + Python smartspecweb_crypto.py)

**NFR-3.2**: System shall validate skill manifests for security
- Static analysis of tool calls (allowlist only)
- No arbitrary code execution
- Sandbox skill execution environments

**NFR-3.3**: System shall enforce role-based access control
- Personal workflows: owner only
- Marketplace workflows: public read, admin write
- Forked workflows: owner only
- Admin approval required for marketplace publishing

#### NFR-4: Scalability

**NFR-4.1**: System shall support 10K-100K skill/template documents
- Use ChromaDB for MVP
- Monitor query performance
- Migrate to Qdrant when approaching 50K documents or latency >500ms

**NFR-4.2**: System shall handle parallel job execution
- Celery workers auto-scale based on queue depth
- Separate queues for different workload types (celery, media, video)
- Rate limiting per user to prevent abuse

#### NFR-5: Observability

**NFR-5.1**: System shall log all workflow executions
- Workflow ID, user, skill, steps executed, approvals, cost, errors
- Audit trail for debugging and compliance

**NFR-5.2**: System shall track costs per workflow
- Token usage per LLM call
- Media generation costs
- Total cost per workflow execution
- Historical cost trends per user/skill

---

## 5. Technical Stack

### 5.1 Existing Infrastructure (Leverage)

**Backend - Python**:
- ✅ FastAPI (async web framework)
- ✅ LangGraph (workflow orchestration) - **needs PostgreSQL checkpointing**
- ✅ LangChain (LLM building blocks)
- ✅ Celery (task queues with 3 queues configured)
- ✅ ChromaDB + Hybrid RAG (semantic + BM25)
- ✅ Multi-provider LLM Gateway (OpenAI, Anthropic, Google, Groq, etc.)
- ✅ Approval Service (database models + API)
- ✅ SQLAlchemy 2 ORM

**Backend - Node.js**:
- ✅ Express + tRPC (type-safe RPC)
- ✅ Drizzle ORM
- ✅ BullMQ (job coordination)
- ✅ WebSocket/SSE (streaming)
- ✅ 32+ routers (chat, skills, media, approvals, etc.)

**Frontend**:
- ✅ React 19
- ✅ Vite 7
- ✅ TailwindCSS 4
- ✅ Radix UI (headless components)
- ✅ TanStack Query (server state)
- ✅ Wouter (routing)

**Database & Storage**:
- ✅ PostgreSQL 15
- ✅ Redis 7
- ✅ S3/R2 (media assets)

**Infrastructure**:
- ✅ Turborepo (monorepo)
- ✅ Docker Compose
- ✅ Nginx

### 5.2 New Dependencies

**Frontend**:
- **React Flow** (v11+) - Visual workflow editor
- **Zustand** (state management for flows)
- **ELK.js** (automatic layout)

**Backend - Python**:
- **langgraph-checkpoint-postgres** - PostgreSQL checkpointing for LangGraph
- **google-auth-oauthlib** - Google OAuth
- **google-api-python-client** - Google Calendar/Gmail API
- **mxbai-rerank-v2** OR **cohere** - Reranking for vector search

**Testing**:
- ✅ pytest (Python) - already configured
- ✅ Vitest (JS) - already configured
- Coverage maintained at 80% minimum (already enforced)

---

## 6. Implementation Priorities

### 6.1 Phase 1 - Foundation (Weeks 1-2)

**Goal**: Core workflow engine with approval gates

**Tasks**:
1. Configure LangGraph with PostgreSQL checkpointing
2. Extend approval models for workflow-specific types
3. Implement smart dependency detection for approval invalidation
4. Add reranking layer to existing RAG (mxbai-rerank-v2)
5. Create workflow template database schema
6. Extend tRPC routers for workflow management

**Success Criteria**:
- Can execute simple 3-step workflow with 1 approval gate
- State persists across restarts
- Smart invalidation works (change gate 2, invalidates gate 3 but not gate 1)
- Budget limits enforced (hard stop)

### 6.2 Phase 2 - Skill Marketplace (Weeks 3-4)

**Goal**: Extensible skill system with marketplace

**Tasks**:
1. Define skill manifest JSON Schema
2. Create skill loader and validator
3. Build developer verification workflow
4. Implement admin review queue
5. Create marketplace UI (browse, search, fork)
6. Add skill versioning with auto-upgrade on resume
7. Implement universal job card renderer (dynamic based on skill)

**Success Criteria**:
- Can publish skill to marketplace (with admin approval)
- Can fork marketplace skill to personal collection
- Skill manifest drives UI rendering (no hardcoded components)
- Version upgrades work with changelog notification

### 6.3 Phase 3 - Virtual Flow Builder (Weeks 5-6)

**Goal**: Visual workflow editor with execution

**Tasks**:
1. Set up React Flow in frontend
2. Create node components (Input, LLM, Tool, Approval, Conditional, Loop, Output)
3. Implement visual editor UI with toolbar
4. Build flow-to-LangGraph compiler
5. Add execution visualization (real-time node status)
6. Implement flow persistence (save/load from PostgreSQL)
7. Add forking from marketplace

**Success Criteria**:
- Can create 5-node flow visually
- Can execute flow with approval gates
- Visual status updates during execution
- Can save, load, and fork flows

### 6.4 Phase 4 - AI Secretary (Weeks 7-8)

**Goal**: Proactive calendar and email management

**Tasks**:
1. Google Calendar API integration (OAuth + CRUD)
2. Implement optimal meeting time algorithm
3. Set up calendar webhooks for real-time sync
4. Gmail API integration (OAuth + read/send)
5. Build email classification service (using LLM proxy)
6. Implement auto-response drafting with approval
7. Add proactive scheduling suggestions
8. Create AI Secretary UI (calendar view, email inbox)

**Success Criteria**:
- Can schedule meeting with optimal time finding
- Calendar syncs in real-time via webhooks
- Emails classified correctly (>80% accuracy)
- Auto-responses require approval before sending

### 6.5 Phase 5 - Polish & Optimization (Weeks 9-10)

**Goal**: Production readiness

**Tasks**:
1. Comprehensive testing (80% coverage for all new code)
2. Performance optimization (query latency, rendering)
3. Error handling refinement (retry logic, user feedback)
4. Notification system (in-app, push, email, Telegram)
5. Documentation (API docs, user guides, skill authoring guide)
6. Observability (dashboards, alerts, cost tracking)
7. Security audit (penetration testing, code review)

**Success Criteria**:
- 80% test coverage maintained
- All critical paths have integration tests
- Vector search queries <500ms
- Approval notifications <10 seconds
- No security vulnerabilities

---

## 7. Success Criteria

### 7.1 MVP Success Criteria (End of Phase 4)

**Use Case 1: Video Ad Workflow**
- [ ] User can create video ad from brief in chat
- [ ] 4 approval gates work correctly (script, storyboard, images, videos)
- [ ] Smart invalidation: changing images only affects videos
- [ ] Can rerender individual shots with notes
- [ ] Budget hard stop enforced
- [ ] Final deliverable includes video + script + prompts
- [ ] State persists for 7 days (can resume after pause)

**Use Case 2: Virtual Flow Builder**
- [ ] Can create visual workflow with 5+ nodes
- [ ] Can add approval gates at any point
- [ ] Can execute flow end-to-end
- [ ] Visual execution status works
- [ ] Can fork marketplace flow to personal
- [ ] Conditional branching works

**Use Case 3: AI Secretary**
- [ ] Can schedule meeting with 3+ attendees (optimal time)
- [ ] Calendar syncs in real-time
- [ ] Emails classified with >80% accuracy
- [ ] Auto-responses drafted (require approval)
- [ ] Proactive scheduling suggests meetings

**System-Wide**:
- [ ] All workflows checkpoint to PostgreSQL
- [ ] Resume works after 7 days
- [ ] Budget limits enforced (hard stop)
- [ ] Notifications work (in-app, push, email, Telegram)
- [ ] 80% test coverage maintained
- [ ] Vector search <500ms latency
- [ ] No critical security vulnerabilities

### 7.2 Performance Targets

| Metric | Target |
|--------|--------|
| LLM first token latency | <2 seconds |
| Vector search query | <500ms |
| Approval notification delivery | <10 seconds |
| Workflow resume time | <5 seconds |
| Calendar API response | <1 second |
| Email classification | <3 seconds |
| Visual flow render (100 nodes) | <1 second |

### 7.3 Quality Targets

| Metric | Target |
|--------|--------|
| Test coverage | 80% minimum |
| Email classification accuracy | >80% |
| Calendar conflict detection | 100% |
| Budget calculation accuracy | 100% (verified against provider) |
| Approval gate correctness | 100% (no false positives) |
| Skill manifest validation | 100% (reject invalid manifests) |

---

## Appendix A: Key Architectural Decisions

This section documents the key decisions made during the interview process:

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| **Approval Flow** | Smart detection | Only invalidate affected downstream items, preserve user work |
| **Virtual Flow Sharing** | Marketplace + personal mix | Balance discoverability (marketplace) with customization (forking) |
| **AI Secretary MVP** | Google only (defer Outlook) | Most users have Google accounts, limit scope for MVP |
| **Vector DB Scale** | 10K-100K, ChromaDB → Qdrant path | Stay with existing ChromaDB, plan migration if needed |
| **Skill Publishing** | Verified developers + admin review | Balance quality control with community growth |
| **Budget Enforcement** | Hard stop | Prevent unexpected costs, clear to users |
| **State Retention** | 7 days | Good balance of UX (work week) and storage costs |
| **Error Handling** | Auto-retry 3x exponential backoff | Reduce transient error impact, notify only if all fail |
| **Notifications** | In-app + push + email + Telegram | Multi-channel for different user preferences and urgency levels |
| **Skill Versioning** | Auto-upgrade on resume | Users get bug fixes automatically, with changelog notification |

---

## Appendix B: Integration with Existing Systems

### Leverage Existing Infrastructure

**DO NOT REBUILD**:
- ✅ LangGraph orchestrator - extend it
- ✅ Approval service - add workflow types
- ✅ ChromaDB + RAG - add reranking layer
- ✅ LLM Gateway - use for all AI calls
- ✅ Celery queues - use for heavy tasks
- ✅ Encryption system - use for OAuth tokens
- ✅ Testing infrastructure - maintain 80% coverage
- ✅ Telegram notifications - already implemented!

**EXTEND**:
- Approval models: Add workflow-specific approval types
- tRPC routers: Add workflow, marketplace, flow-builder routers
- Database schema: Add workflow templates, executions, forks tables
- UI components: Add visual flow editor, job cards, approval panels

**BUILD NEW**:
- Smart dependency detection algorithm
- Skill manifest loader and validator
- React Flow based visual editor
- Flow-to-LangGraph compiler
- Google Calendar/Gmail integration
- Optimal meeting time algorithm
- Email classification service

---

## Appendix C: Example Workflows

### Example 1: Video Ad from Brief

```
User: "Create a 45-second video ad for our new eco-friendly water bottle, targeting young professionals"

System:
1. parse_brief → Extract: brand=EcoBottle, product=water bottle, audience=young professionals, duration=45s
2. plan_script → Generate 7 shots, total 46s, script with dialogue and on-screen text
   → APPROVAL GATE: approve_script
   → User: "Approve, but make shot 3 more energetic"
   → System: Regenerates shot 3 script
   → User: "Approve"
3. make_storyboard → Generate image/video prompts for each shot
   → APPROVAL GATE: approve_storyboard
   → User: "Approve"
4. render_images → Generate 7 images in parallel (Celery tasks)
   → APPROVAL GATE: approve_images
   → User: "Rerender shot 5, make background brighter"
   → System: Rerenders only shot 5, invalidates videos for shot 5 only
   → User: "Approve"
5. render_videos → Generate 7 videos in parallel
   → APPROVAL GATE: approve_videos
   → User: "Approve"
6. stitch_final → Combine videos with transitions
7. deliver → Upload to S3, send notification with download link
```

### Example 2: AI Secretary Scheduling

```
User: "Schedule a meeting with John, Sarah, and Mike next week for 1 hour to discuss Q1 planning"

System:
1. parse_request → Extract: attendees=[John, Sarah, Mike], duration=60min, topic=Q1 planning, timeframe=next week
2. get_calendars → OAuth to Google Calendar, fetch calendars for all attendees
3. find_free_slots → Query free/busy for next week
4. score_slots → Apply AI scoring (working hours, preferences, avoid back-to-back)
5. suggest_times → Present top 3 options:
   - Tuesday 2-3pm (score: 95)
   - Wednesday 10-11am (score: 92)
   - Thursday 3-4pm (score: 88)
   → APPROVAL GATE
   → User: "Tuesday 2-3pm looks good"
6. create_event → Create calendar event for all attendees
7. send_invites → Send email invites with meeting details
8. setup_reminder → Schedule reminder 1 hour before
9. deliver → Confirm to user "Meeting scheduled for Tuesday Feb 13, 2-3pm"
```

### Example 3: Email Auto-Response

```
System detects new email: "Can you send me the Q4 financial report?"

System:
1. classify_email → urgent_action | requires_response | category=financial
2. extract_intent → User wants Q4 financial report
3. search_drive → Find "Q4_Financial_Report_2025.pdf" in Google Drive
4. draft_response → Generate:
   "Hi [Name],

   Here's the Q4 2025 financial report you requested. Please let me know if you need any clarification on the figures.

   Best regards,
   [User Name]

   Attachment: Q4_Financial_Report_2025.pdf"
   → APPROVAL GATE
   → User: "Approve and send"
5. send_email → Send with attachment
6. mark_original → Mark original email as responded
7. deliver → Confirm to user "Email sent to [recipient]"
```

---

**End of Specification**

This comprehensive specification is ready for detailed implementation planning. All architectural decisions have been validated through research and user interviews. The extensive existing infrastructure provides a strong foundation for rapid development.
