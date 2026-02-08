# Implementation Plan: Agentic AI Workflow System

**Project**: SmartSpecPro Agentic AI Workflow System
**Version**: 1.0
**Date**: 2026-02-08
**Author**: Claude (Deep Planning Agent)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture](#architecture)
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
4. **AI Secretary** - Proactive calendar, email, and task management

### 1.2 Why This Architecture

The architecture leverages SmartSpecPro's existing infrastructure extensively:

- **LangGraph Orchestrator** - Already exists, needs PostgreSQL checkpointing extension
- **Approval Service** - Database models and API already implemented, needs workflow-specific types
- **ChromaDB + Hybrid RAG** - Fully configured, will add reranking layer for accuracy
- **Multi-Provider LLM Gateway** - Production-ready with cost tracking and fallback chains
- **Celery Task Queues** - Three queues configured (celery, media, video) ready for parallel execution

This "build on existing" approach reduces implementation risk and time-to-market by an estimated 40-50% compared to greenfield development.

### 1.3 Key Design Decisions

These decisions came from stakeholder interviews and research:

1. **Smart Dependency Detection** - When user requests changes at approval gate N, only invalidate downstream gates that depend on changed output (preserve unaffected work)

2. **Hard Budget Stop** - Block LLM requests immediately when budget exceeded (no overages) for cost predictability

3. **Marketplace + Personal Hybrid** - Public skill templates (read-only) + private personal workflows (forkable) balances discoverability with customization

4. **Auto-Retry with Exponential Backoff** - 3 attempts (immediate, 2s, 8s) for transient API failures, only notify user if all fail

5. **Auto-Upgrade on Resume** - Paused workflows use latest skill version when resumed (with changelog notification) to automatically deliver bug fixes

6. **7-Day State Retention** - Balance UX (covers work week) with storage costs

7. **Multi-Channel Notifications** - In-app + browser push + email + Telegram for different urgency levels and user preferences

---

## 2. System Overview

### 2.1 User Journey Example: Video Ad Creation

```
1. User types in chat: "Create a 45-second video ad for EcoBottle targeting young professionals"

2. System (parse_brief node):
   - Extracts: brand, product, audience, duration
   - Stores in workflow state

3. System (plan_script node):
   - Generates 7-shot script with dialogue, actions, CTA
   - Total duration: 46 seconds
   - Creates state.step_results['plan_script'] = {script, shots}

4. Approval Gate (approve_script):
   - PAUSE workflow execution
   - Notify user (in-app, push, email, Telegram)
   - Wait for decision

5. User reviews script in UI:
   - Sees Job Card with script content
   - Notes: "Make shot 3 more energetic"
   - Action: "Request changes"

6. System (plan_script node - resumed):
   - Re-generates shot 3 only
   - Preserves shots 1,2,4,5,6,7
   - Updates state

7. User: "Approve"

8. System (make_storyboard node):
   - Generates image/video prompts for each shot
   - Checkpoint state

9. Approval Gate (approve_storyboard):
   - PAUSE, notify, wait

10. User: "Approve"

11. System (render_images node):
    - Dispatches 7 Celery tasks in parallel
    - Each task: generate_image(prompt, aspect_ratio="16:9")
    - Updates state.artifacts.images[shot_id] as each completes
    - Checkpoint after all complete

12. Approval Gate (approve_images):
    - Show 7 images in grid
    - PAUSE, notify, wait

13. User reviews images:
    - Shot 5: "Make background brighter"
    - Action: "Request changes on shot 5 only"

14. System dependency detection:
    - Shot 5 image changed
    - Downstream: Shot 5 video depends on shot 5 image
    - Invalidate: approve_videos status for shot 5
    - Preserve: approve_storyboard, approve_script (not affected)
    - Preserve: Other images (1,2,3,4,6,7) and their video approvals

15. System (render_images node - resumed):
    - Re-generate shot 5 image only
    - Checkpoint

16. User: "Approve"

17. System (render_videos node):
    - Dispatches 7 video generation tasks
    - Each: generate_video(image_id, motion_prompt, duration)
    - Checkpoint

18. Approval Gate (approve_videos):
    - Show 7 videos in playlist
    - PAUSE, notify, wait

19. User: "Approve"

20. System (stitch_final node):
    - stitch_videos(video_ids=[shot1_video, ...], transitions={...})
    - Upload to S3
    - Checkpoint

21. System (deliver node):
    - Create final Job Card with:
      - Video player (final result)
      - Download link
      - Script (markdown)
      - Prompts (JSON)
    - Notify user: "Your video ad is ready!"
```

### 2.2 Core Concepts

**Workflow**: Sequence of nodes (steps) that transform inputs into deliverables

**Node**: Single operation in workflow - can be:
- LLM call (e.g., "generate script")
- Tool execution (e.g., "generate image")
- Parallel tool batch (e.g., "generate 7 images simultaneously")
- Conditional branch (e.g., "if budget exceeded, use cheaper model")
- Approval gate (pause for human decision)

**State**: All data flowing through workflow - inputs, step results, artifacts, approvals, budget tracking

**Checkpoint**: Persistent snapshot of state + execution position, stored in PostgreSQL, enables resume after hours/days

**Approval Gate**: Special node type that pauses execution, notifies user across multiple channels, waits for decision (approve/request changes/cancel)

**Smart Dependency Detection**: Algorithm that determines which downstream nodes are affected by changes at a given node, enabling selective re-execution

**Skill**: Reusable workflow template defined by manifest (YAML) - specifies inputs, nodes, approval gates, artifacts

**Skill Marketplace**: Public repository of curated skill templates with versioning, ratings, and forking

**Virtual Flow**: User-created visual workflow using drag-and-drop editor (React Flow) - compiled to LangGraph for execution

---

## 3. Architecture

### 3.1 System Layers

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (React 19 + Vite)                       │
│  - Chat UI: Message types (Job Cards, Approval Panels)      │
│  - Virtual Flow Builder: React Flow based visual editor     │
│  - Skill Marketplace: Browse, search, fork templates        │
│  - AI Secretary Dashboard: Calendar view, email inbox       │
└────────────────────────┬─────────────────────────────────────┘
                         │ tRPC (type-safe RPC) + WebSocket
┌────────────────────────┴─────────────────────────────────────┐
│  APPLICATION LAYER (Node.js + Express)                       │
│  - tRPC Routers: workflow, skills, marketplace, approvals   │
│  - BullMQ: Job coordination, retry logic                    │
│  - Drizzle ORM: Type-safe database queries                  │
│  - Streaming: SSE for LLM tokens, WebSocket for events      │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP + Async Tasks
┌────────────────────────┴─────────────────────────────────────┐
│  ORCHESTRATION LAYER (Python + FastAPI)                     │
│  - LangGraph: Workflow execution engine                     │
│  - Approval Service: Request/respond/timeout handling       │
│  - Smart Dependency Detector: Graph analysis algorithm      │
│  - Skill Loader: Manifest validator + workflow compiler     │
│  - Flow Compiler: ReactFlow JSON → LangGraph conversion     │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────────────┐
│  EXECUTION LAYER (Python + Celery)                          │
│  - Worker Queues: celery (default), media (images), video   │
│  - LLM Gateway: Multi-provider with fallback + circuit break│
│  - ChromaDB + RAG: Semantic search + BM25 + reranking       │
│  - Calendar/Email: Google API integration (OAuth + CRUD)    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                  │
│  - PostgreSQL: Jobs, state, users, approvals, marketplace   │
│  - Redis: Caching, queues, pub/sub                          │
│  - ChromaDB: Vector search (10K-100K skills/templates)      │
│  - S3/R2: Media assets (images, videos, documents)          │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow Patterns

**Pattern 1: Agentic Workflow Execution**

```
User Input → Parse → State Init → Checkpoint
    ↓
Node Execution Loop:
    1. Fetch current state from PostgreSQL
    2. Execute current node (LLM/Tool/Approval Gate)
    3. Update state with results
    4. Checkpoint to PostgreSQL
    5. If approval gate: PAUSE, send notifications
    6. If not approval gate: Continue to next node
    7. If end node: Mark complete, deliver artifacts
```

**Pattern 2: Approval Gate Handling**

```
Workflow reaches approval gate:
    1. LangGraph interrupt() called
    2. State saved with status="waiting_approval"
    3. ApprovalRequest created in DB:
        - workflow_id
        - gate_id
        - current_state snapshot
        - required_approvers (usually 1 for personal workflows)
        - expires_at (24 hours default)
    4. Notifications dispatched (parallel):
        - In-app: WebSocket message
        - Push: Web Push API
        - Email: SMTP via existing service
        - Telegram: Bot message (using existing integration)
    5. Wait for ApprovalResponse

User responds:
    1. Frontend sends approval event via tRPC
    2. Backend validates + records ApprovalResponse
    3. If "approve": Resume workflow from checkpoint
    4. If "request_changes":
        a. Extract change notes (overall + per-item if applicable)
        b. Smart dependency detection:
            - Build dependency graph from workflow manifest
            - Find all downstream nodes that depend on current node's output
            - Mark those downstream approvals as "invalidated"
            - Preserve approvals for independent branches
        c. Resume workflow from current node with changes
    5. If "cancel": Mark workflow as cancelled, cleanup resources
```

**Pattern 3: Smart Dependency Detection Algorithm**

```
Given:
    - Workflow manifest (nodes + dependencies)
    - Current node N where changes requested
    - Approval gates A1, A2, ..., Ak

Algorithm:
    1. Build dependency graph:
        nodes = {node_id: {depends_on: [parent_ids], outputs: [output_keys]}}

    2. Find downstream nodes from N:
        affected = []
        queue = [N]
        while queue not empty:
            current = queue.pop()
            for node in nodes:
                if current in node.depends_on:
                    affected.append(node)
                    queue.append(node)

    3. Identify affected approval gates:
        gates_to_invalidate = []
        for gate in approval_gates:
            if gate.node_id in affected:
                gates_to_invalidate.append(gate)

    4. Update approval statuses:
        for gate in gates_to_invalidate:
            state.approvals[gate.id].status = "pending"
            state.approvals[gate.id].notes = "Invalidated due to upstream changes"

    5. Return resume point:
        return N  # Resume from node where changes were requested

Example:
    Nodes: A → B → C → D → E
    Approvals: after B, after D

    User requests changes at B:
        - Affected downstream: C, D, E
        - Invalidate: approval_after_D (because D depends on B via C)
        - Preserve: approval_after_B (that's where we are)
        - Resume from: B
```

### 3.3 State Management

**State Schema** (PostgreSQL):

```python
workflow_executions table:
    id: UUID (primary key)
    template_id: FK to workflow_templates
    user_id: FK to users
    status: ENUM (pending, running, waiting_approval, completed, failed, cancelled)
    state_json: JSONB  # Complete workflow state
    checkpoint_id: VARCHAR  # LangGraph checkpoint ID
    created_at: TIMESTAMP
    updated_at: TIMESTAMP
    completed_at: TIMESTAMP (nullable)
    expires_at: TIMESTAMP  # State retention (7 days from last update)
```

**State JSON Structure**:

```python
{
    "workflow_id": "WF-001",
    "skill_id": "video_ad_from_brief_v1",
    "skill_version": "1.2.0",
    "user_id": 42,
    "inputs": {
        "brand": "EcoBottle",
        "concept": "Young professionals, eco-friendly",
        "duration_sec": [40, 60]
    },
    "current_step": "approve_images",
    "step_results": {
        "parse_brief": {
            "brand": "EcoBottle",
            "product": "Water bottle",
            "audience": "Young professionals"
        },
        "plan_script": {
            "script": {...},
            "shots": [
                {"shot_id": "S1", "sec": 6, "action": "..."},
                ...
            ]
        },
        "make_storyboard": {
            "prompts": {
                "image": {"S1": "...", ...},
                "video": {"S1": "...", ...}
            }
        },
        "render_images": {
            "images": {
                "S1": {"image_id": "img_001", "url": "s3://...", "seed": 42},
                ...
            }
        }
    },
    "artifacts": [
        {"id": "art_001", "type": "image", "shot_id": "S1", "url": "s3://..."},
        ...
    ],
    "approvals": {
        "approve_script": {
            "status": "approved",
            "notes": "",
            "approved_at": "2026-02-08T10:30:00Z",
            "approver_id": 42
        },
        "approve_storyboard": {
            "status": "approved",
            "notes": "",
            "approved_at": "2026-02-08T10:35:00Z",
            "approver_id": 42
        },
        "approve_images": {
            "status": "pending",
            "notes": "",
            "approved_at": null,
            "approver_id": null
        },
        "approve_videos": {
            "status": "pending",
            "notes": "",
            "approved_at": null,
            "approver_id": null
        }
    },
    "dependencies": {
        "plan_script": [],
        "make_storyboard": ["plan_script"],
        "render_images": ["make_storyboard"],
        "render_videos": ["render_images"],
        "stitch_final": ["render_videos"]
    },
    "budget": {
        "max_credits": 500,
        "spent": {
            "parse_brief": 0,
            "plan_script": 8,
            "make_storyboard": 7,
            "render_images": 80,
            "total": 95
        },
        "remaining": 405
    },
    "errors": [],
    "metadata": {
        "started_at": "2026-02-08T10:25:00Z",
        "last_checkpoint_at": "2026-02-08T10:40:00Z"
    }
}
```

### 3.4 Database Schema Extensions

**New Tables**:

```sql
-- Workflow templates (skills from marketplace or personal)
CREATE TABLE workflow_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    author_id INT REFERENCES users(id),
    visibility VARCHAR(50) CHECK (visibility IN ('marketplace', 'private')),
    category VARCHAR(100),
    version VARCHAR(20),  -- Semantic versioning (1.2.3)
    manifest_json JSONB NOT NULL,  -- Complete skill manifest
    flow_json JSONB,  -- ReactFlow JSON (if created visually)
    status VARCHAR(50) CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,

    CONSTRAINT unique_marketplace_skill UNIQUE (name, version, visibility)
);

-- Developer verification (for marketplace publishing)
CREATE TABLE verified_developers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) UNIQUE,
    status VARCHAR(50) CHECK (status IN ('pending', 'approved', 'rejected')),
    application_notes TEXT,
    reviewed_by INT REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Workflow executions (runtime instances)
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id INT REFERENCES workflow_templates(id),
    user_id INT REFERENCES users(id),
    status VARCHAR(50) CHECK (status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
    state_json JSONB NOT NULL,
    checkpoint_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),

    INDEX idx_user_status (user_id, status),
    INDEX idx_template (template_id),
    INDEX idx_expires (expires_at) WHERE status IN ('waiting_approval', 'failed')
);

-- Track skill forks (marketplace → personal)
CREATE TABLE workflow_forks (
    id SERIAL PRIMARY KEY,
    source_template_id INT REFERENCES workflow_templates(id),
    forked_template_id INT REFERENCES workflow_templates(id),
    forked_by INT REFERENCES users(id),
    forked_at TIMESTAMP DEFAULT NOW()
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
```

**Extended Tables** (add columns to existing):

```sql
-- approval_requests (already exists, extend with workflow fields)
ALTER TABLE approval_requests
    ADD COLUMN workflow_execution_id UUID REFERENCES workflow_executions(id),
    ADD COLUMN gate_id VARCHAR(100),  -- e.g., "approve_script"
    ADD COLUMN change_notes JSONB;  -- Per-item notes for rerenders

-- approval_rules (already exists, add workflow approval types)
-- New approval types: WORKFLOW_SCRIPT, WORKFLOW_STORYBOARD, WORKFLOW_IMAGES, WORKFLOW_VIDEOS, WORKFLOW_EXECUTION
```

---

## 4. Implementation Phases

### Phase 1: Foundation - Workflow Engine Core (Weeks 1-2)

**Goal**: LangGraph workflow engine with PostgreSQL checkpointing and smart approval gates

**Tasks**:

1. **Configure PostgreSQL Checkpointing**
   - Install `langgraph-checkpoint-postgres` package
   - Create checkpoint tables (run `saver.setup()`)
   - Update orchestrator.py to use PostgresSaver instead of InMemorySaver
   - Configure connection pool (max_size=10 based on expected concurrency)

2. **Extend State Model**
   - Define WorkflowState TypedDict with all required fields
   - Add skill_id, inputs, step_results, artifacts, approvals, dependencies, budget
   - Implement state serialization/deserialization

3. **Implement Smart Dependency Detection**
   - Create dependency_analyzer.py module
   - Build graph from workflow manifest
   - Implement downstream node finder (breadth-first search)
   - Integrate with approval gate logic

4. **Extend Approval Service**
   - Add workflow-specific approval types to ApprovalType enum
   - Extend ApprovalRequest model with workflow_execution_id, gate_id
   - Add change_notes JSONB field for per-item rerender notes
   - Update approval workflow to trigger smart dependency detection

5. **Implement Budget Enforcement**
   - Add pre-request budget check function
   - Query user's remaining credits from database
   - Block request if insufficient, return clear error
   - Track cost per workflow step in state.budget.spent
   - Implement alert thresholds (70%, 90%, 100%)

6. **Create Simple 3-Step Workflow (Test)**
   - Step 1: LLM call (generate outline)
   - Step 2: Approval gate
   - Step 3: LLM call (expand outline to document)
   - Verify checkpoint/resume works
   - Verify smart invalidation works

**Success Criteria**:
- Can execute 3-step workflow with 1 approval gate end-to-end
- State persists across process restarts (checkpoint works)
- Budget hard stop blocks requests when limit exceeded
- Smart invalidation: changing step 2 invalidates step 3 but not step 1

**Risks & Mitigation**:
- PostgreSQL checkpoint latency: Monitor checkpoint time, optimize if >100ms
- Smart dependency detection bugs: Comprehensive unit tests with complex graphs

---

### Phase 2: Skill Marketplace (Weeks 3-4)

**Goal**: Extensible skill system with marketplace, versioning, and forking

**Tasks**:

1. **Define Skill Manifest JSON Schema**
   - Create manifest_schema.json with JSON Schema specification
   - Required fields: id, version, name, description, workflow.steps, artifacts
   - Define node types: llm, tool, parallel_tools, conditional, approval gate, deliver
   - Define approval gate schema: gate_id, label, cost_sensitive flag

2. **Create Skill Loader & Validator**
   - skill_loader.py module
   - load_skill(manifest_path) → validate against schema → return SkillDefinition
   - Validate tool calls against allowlist (existing tool registry)
   - Validate artifact types (supported: markdown, image, video, image_gallery, pptx, pdf, json)

3. **Build Developer Verification Workflow**
   - tRPC router: developer.applyForVerification(application_notes)
   - Admin UI: Review queue for developer applications
   - tRPC router: admin.approveDeveloper(developer_id) / rejectDeveloper(developer_id)
   - Update verified_developers table

4. **Implement Skill Submission & Review**
   - tRPC router: skills.submitToMarketplace(manifest, code_zip)
   - Validate: user must be verified developer
   - Create workflow_templates record with status="pending_review"
   - Create ApprovalRequest for admin review
   - Admin UI: Skill review queue
   - tRPC router: admin.approveSkill(template_id) / rejectSkill(template_id, reason)
   - On approve: Set status="approved", published_at=NOW(), visibility="marketplace"

5. **Build Marketplace UI**
   - Browse view: Grid of skill cards (thumbnail, name, description, rating, downloads)
   - Filter: By category, sort by popularity/newest/rating
   - Search: Full-text search on name/description
   - Detail view: Complete manifest details, example inputs/outputs, changelog
   - Fork button: Create personal copy

6. **Implement Skill Versioning**
   - When workflow paused: Store skill_version in state
   - On resume: Check if newer version exists
   - If newer: Show modal with changelog, user can proceed or cancel
   - Update state.skill_version to latest
   - Load latest manifest and continue
   - If workflow fails immediately after upgrade: Offer rollback option

7. **Implement Forking**
   - tRPC router: skills.forkToPersonal(marketplace_template_id, custom_name)
   - Create new workflow_templates record:
       - visibility="private"
       - author_id=current_user
       - manifest_json=copy of source manifest (allow editing)
   - Create workflow_forks record to track source
   - User can now edit inputs, prompts, add/remove steps

8. **Build Universal Job Card Renderer**
   - React component that takes skill manifest + state
   - Dynamically render UI based on workflow.steps
   - Show progress: completed steps (green check), current step (spinner), pending (grey)
   - Show approval gates with Approve/Request Changes buttons
   - Show artifacts based on artifact type (video player, image gallery, markdown viewer)

**Success Criteria**:
- Can submit skill to marketplace (as verified developer)
- Admin can approve/reject skills
- Approved skills appear in marketplace browse view
- Can fork marketplace skill to personal collection
- Can edit forked skill (change inputs, prompts)
- Universal job card renders correctly for any skill manifest
- Version upgrade works with changelog notification

**Risks & Mitigation**:
- Security: Malicious skill manifests → Strict validation, tool allowlist, code review by admins
- Manifest schema changes breaking existing skills → Semantic versioning for schema itself

---

### Phase 3: Virtual Flow Builder (Weeks 5-6)

**Goal**: Visual drag-and-drop workflow editor with execution

**Tasks**:

1. **Set Up React Flow**
   - Install react-flow, zustand packages
   - Create FlowBuilderPage component
   - Set up basic canvas with controls (zoom, minimap)
   - Configure Zustand store for nodes/edges state

2. **Create Node Components**
   - Input node: Form fields (text, number, select, file upload)
   - LLM node: Model selection, prompt template editor, temperature slider
   - Tool node: Tool dropdown (generate_image, generate_video, etc.), parameters form
   - Approval Gate node: Label, cost_sensitive checkbox
   - Conditional node: Condition expression editor (JavaScript), true/false paths
   - Loop node: Iteration condition, max iterations
   - Output node: Artifact type selection, label

3. **Implement Node Connection Logic**
   - Validate connections: Can only connect compatible output → input types
   - Example: LLM node outputs "text" → can connect to another LLM node input or Tool node expecting "text"
   - Prevent circular dependencies: Check for cycles before allowing connection
   - Show connection validity indicators (green=valid, red=invalid)

4. **Build Flow-to-LangGraph Compiler**
   - flow_compiler.py module
   - Input: ReactFlow JSON (nodes, edges, viewport)
   - Output: LangGraph StateGraph
   - Algorithm:
       1. Parse nodes into workflow steps
       2. Parse edges into node dependencies
       3. Build StateGraph with add_node() for each node
       4. Add conditional edges for Conditional nodes
       5. Add interrupt() calls for Approval Gate nodes
       6. Return compiled StateGraph

5. **Implement Visual Execution**
   - WebSocket connection from frontend to backend
   - Backend sends execution events:
       - node_started: {node_id, timestamp}
       - node_completed: {node_id, result, timestamp}
       - node_failed: {node_id, error, timestamp}
       - approval_needed: {node_id, gate_id}
   - Frontend updates node visual state:
       - Executing: Blue border, spinner
       - Completed: Green border, checkmark
       - Failed: Red border, error icon
       - Awaiting approval: Yellow border, pause icon

6. **Add Flow Persistence**
   - tRPC router: flows.save(name, description, flow_json)
   - Create workflow_templates record with visibility="private", flow_json
   - tRPC router: flows.load(flow_id) → return flow_json
   - Set ReactFlow state (nodes, edges, viewport) from loaded JSON
   - Implement auto-save with debounce (save every 10 seconds if changes detected)

7. **Enable Marketplace Flow Forking**
   - Extend marketplace UI: Add "Open in Flow Builder" button for visual flows
   - Load marketplace flow_json into editor
   - User can modify: add nodes, change parameters, rearrange
   - Save creates personal copy (workflow_forks record created)

**Success Criteria**:
- Can create 5-node flow visually (drag nodes, connect edges)
- Connections validate correctly (no invalid connections, no cycles)
- Can execute flow end-to-end with visual status updates
- Approval gates pause execution and show in UI
- Can save and load flows from database
- Can fork marketplace flow and modify it

**Risks & Mitigation**:
- Complex flows (100+ nodes) performance → Implement virtualization, lazy rendering
- Compiler bugs (invalid LangGraph generated) → Comprehensive tests with various flow patterns

---

### Phase 4: AI Secretary (Weeks 7-8)

**Goal**: Google Calendar + Gmail integration with proactive scheduling and email intelligence

**Tasks**:

1. **Google OAuth Integration**
   - Implement OAuth 2.0 flow for Google Calendar + Gmail scopes
   - Store encrypted tokens in database (use existing crypto.ts AES-256-GCM)
   - Implement token refresh logic (refresh tokens when access token expires)
   - UI: "Connect Google Account" button → OAuth popup → callback handler

2. **Google Calendar Service**
   - calendar_service.py module
   - get_free_busy(calendar_ids, time_min, time_max) → query multiple calendars
   - find_optimal_slots(attendees, duration_minutes, preferences) → AI scoring algorithm
   - create_event(calendar_id, event) → create with conflict check (ETag-based)
   - update_event(calendar_id, event_id, event, etag) → optimistic locking
   - delete_event(calendar_id, event_id)
   - setup_webhook(calendar_id, callback_url) → receive push notifications

3. **Optimal Meeting Time Algorithm**
   - scoring_algorithm.py module
   - Input: Free/busy data for all attendees, meeting duration, user preferences
   - Score each potential slot:
       - Base score: 100
       - Penalties:
           - Outside working hours: -50
           - Back-to-back meetings: -20
           - Overloaded day (>4 meetings): -5 per meeting
           - Not in preferred time (9-11am, 2-4pm): -10
       - Bonuses:
           - Preferred time slot: +30
           - No conflicts: +10
   - Return top 5 slots sorted by score

4. **Calendar Webhook Handler**
   - Endpoint: POST /api/calendar/webhook
   - Verify webhook signature (Google X-Goog-Channel-Token)
   - Parse notification: calendar_id, event_id, change_type (created/updated/deleted)
   - Sync change to local cache (Redis)
   - Notify user if relevant (their event changed by someone else)

5. **Gmail Service**
   - gmail_service.py module
   - list_messages(user_id, query="is:unread") → get unread emails
   - get_message(user_id, message_id) → full email content
   - classify_email(email_content) → call LLM with classification prompt
   - draft_response(email_content, context) → generate auto-response
   - send_message(user_id, to, subject, body, thread_id) → send email
   - add_label(user_id, message_id, label_id) → apply Gmail label

6. **Email Classification**
   - Classification categories:
       - urgent_action_required: Needs immediate response
       - meeting_scheduling: Meeting invite or scheduling request
       - newsletter: Marketing/newsletter content
       - transactional: Order confirmations, receipts
       - low_priority: Can be read later
   - Extract metadata:
       - Priority: 1-5 (1=highest)
       - Requires response: yes/no
       - Action items: List of tasks
       - Deadline: Date if mentioned
   - Store classification in database for learning

7. **Auto-Response Drafting**
   - draft_email_response_node (LangGraph node)
   - Input: Email content, user context (previous emails, calendar, common responses)
   - Output: Draft email text
   - Approval gate: User reviews and can edit before sending
   - Track: Acceptance rate of auto-drafted responses (improve over time)

8. **Proactive Scheduling**
   - Intent detection: Scan incoming emails/chat for scheduling keywords
   - Example: "Can we meet next week?" → Trigger scheduling workflow
   - Find optimal times automatically
   - Send suggestion to user: "I found Tuesday 2pm works for everyone. Approve to schedule?"
   - On approval: Create calendar event, send invites

9. **AI Secretary Dashboard UI**
   - Calendar view: Monthly/weekly/daily views
   - Upcoming meetings list with join links
   - Email inbox: Classified emails with priority indicators
   - Suggested actions: "Schedule meeting with John" (proactive suggestions)
   - Quick actions: "Find time for..." → triggers optimal time finder

**Success Criteria**:
- Can schedule 3-person meeting with optimal time finding
- Calendar syncs in real-time via webhooks (changes appear within 10 seconds)
- Emails classified with >80% accuracy (measured on test set)
- Auto-responses drafted and require approval before sending
- Proactive scheduling detects intent and suggests times
- Conflict resolution works (ETag prevents double-booking)

**Risks & Mitigation**:
- Google API rate limits → Implement exponential backoff, caching
- OAuth token expiry mid-operation → Automatic token refresh with retry
- Email classification accuracy → Use GPT-4 for better accuracy, collect feedback to improve
- Privacy concerns → Clear disclosure, allow user to disable features

---

### Phase 5: Polish & Production Readiness (Weeks 9-10)

**Goal**: Testing, optimization, security, documentation, deployment

**Tasks**:

1. **Comprehensive Testing**
   - Unit tests: All new modules (>80% coverage enforced by CI)
   - Integration tests:
       - Workflow execution end-to-end
       - Approval gate flow (request → notify → respond → resume)
       - Smart dependency detection (multiple scenarios)
       - Budget enforcement (hard stop works)
       - Skill versioning (upgrade on resume)
   - E2E tests (pytest + Playwright):
       - User creates video ad workflow in chat
       - User approves at each gate
       - User requests changes and rerenders
       - Final deliverable received
   - Load tests:
       - 100 concurrent workflow executions
       - 1000 vector search queries/second
       - 50 calendar API requests/second

2. **Performance Optimization**
   - Profile LangGraph execution: Identify slow nodes
   - Optimize vector search:
       - Add reranking layer (MixedBread mxbai-rerank-v2 or Cohere Rerank 3)
       - Reduce top_k from 100 to 25, rerank to top_n=3
       - Measure: Query latency should be <500ms
   - Optimize React Flow rendering:
       - Implement React.memo for node components
       - Use virtualization for flows >100 nodes
   - Database query optimization:
       - Add indexes on frequently queried columns
       - Use EXPLAIN ANALYZE to identify slow queries

3. **Error Handling Refinement**
   - Implement retry logic with exponential backoff:
       - 3 attempts: immediate, after 2s, after 8s
       - Retry transient errors only (5xx, timeout, rate limit)
       - Don't retry 4xx client errors
   - Circuit breaker pattern:
       - After 5 consecutive failures, enter "open" state
       - Stop retrying for 5-minute cooldown
       - Test periodically if API recovered
       - Resume when successful
   - User-friendly error messages:
       - Replace technical errors with user-understandable messages
       - Include next steps: "Try again" vs "Contact support"

4. **Notification System**
   - Implement multi-channel dispatcher:
       - Input: Event (approval_needed, job_completed, error_occurred)
       - Output: Send to all enabled channels in parallel
   - Channels:
       - In-app: WebSocket message → UI notification panel
       - Push: Web Push API → browser/mobile notification
       - Email: SMTP via existing service → HTML template
       - Telegram: Bot API → message with inline action buttons (using existing integration)
   - User preferences:
       - UI to enable/disable each channel
       - Quiet hours: Don't send push/Telegram during sleep (10pm-7am default)
   - Notification history: Store in database, show in UI

5. **Security Audit**
   - Static analysis: Run bandit (Python) and eslint (JS) with security rules
   - Dependency audit: npm audit, safety check (Python)
   - Code review:
       - Approval gate bypass vulnerabilities
       - Budget calculation correctness
       - OAuth token security (encrypted at rest)
       - SQL injection prevention (use parameterized queries)
       - XSS prevention (sanitize user inputs)
   - Penetration testing:
       - Attempt to execute unauthorized workflows
       - Attempt to access other users' data
       - Attempt prompt injection attacks

6. **Documentation**
   - API documentation: Generate OpenAPI spec from tRPC routers
   - User guide:
       - How to create workflows in chat
       - How to use approval gates
       - How to create visual flows
       - How to fork marketplace skills
       - How to use AI Secretary
   - Skill authoring guide:
       - Manifest structure
       - Tool allowlist
       - Best practices (naming, descriptions)
       - Example skills with annotations
   - Architecture documentation:
       - System diagram
       - Data flow diagrams
       - Database schema
       - Deployment guide

7. **Observability**
   - Metrics dashboard (Grafana or similar):
       - Workflow execution success rate
       - Average execution time per skill
       - Approval gate response times
       - Budget consumption trends
       - Vector search latency
       - API error rates
   - Alerting rules:
       - Workflow failure rate >5%
       - Budget exceeded for >10 users
       - Vector search latency >1s
       - Calendar API error rate >10%
   - Cost tracking dashboard:
       - LLM cost per user/workflow/skill
       - Media generation cost trends
       - Budget utilization heatmap

**Success Criteria**:
- 80% test coverage maintained (enforced by CI)
- All critical paths have integration tests
- Vector search <500ms (99th percentile)
- Approval notifications <10 seconds (95th percentile)
- No high/critical security vulnerabilities
- Documentation complete and reviewed
- Observability dashboard deployed

---

## 5. Critical Patterns

### 5.1 LangGraph Checkpoint Pattern

**Why**: Enables pause/resume for approval gates and recovery from failures

**Implementation**:

```python
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

# Setup (once at application startup)
pool = ConnectionPool(
    conninfo=settings.DATABASE_URL,
    max_size=10  # Match expected concurrency
)

with pool.connection() as conn:
    saver = PostgresSaver(conn)
    saver.setup()  # Creates checkpoint tables

# Usage in workflow execution
graph = StateGraph(WorkflowState)
# ... add nodes, edges ...

compiled_graph = graph.compile(
    checkpointer=saver,
    interrupt_before=["approve_script", "approve_images"]  # Approval gates
)

# Execute with thread_id for independent state
config = {"configurable": {"thread_id": workflow_execution.id}}
result = compiled_graph.invoke(initial_state, config=config)

# Resume after approval
result = compiled_graph.invoke(
    None,  # Resume from checkpoint, don't need state
    config=config,
    input={"approval_decision": "approved"}
)
```

### 5.2 Approval Gate Interrupt Pattern

**Why**: Pauses workflow execution until user provides decision

**Implementation**:

```python
from langgraph.types import interrupt, Command

def approval_gate_node(state: WorkflowState):
    """Pauses execution and waits for user approval"""
    # Create approval request in database
    request = create_approval_request(
        workflow_id=state["workflow_id"],
        gate_id=state["current_gate_id"],
        snapshot=state
    )

    # Send notifications
    notify_all_channels(
        user_id=state["user_id"],
        event_type="approval_needed",
        data={"request_id": request.id, "gate_id": state["current_gate_id"]}
    )

    # Interrupt execution (LangGraph pauses here)
    decision = interrupt("Waiting for user approval")

    # This code runs after resume
    if decision == "approved":
        return {"current_step": get_next_step(state)}
    elif decision == "request_changes":
        # Smart dependency detection
        affected_gates = detect_affected_downstream_gates(
            workflow=state["workflow_manifest"],
            current_gate=state["current_gate_id"]
        )
        # Invalidate affected gates
        for gate_id in affected_gates:
            state["approvals"][gate_id]["status"] = "pending"
        # Return to current step to re-execute with changes
        return {"current_step": state["current_step"]}
    else:  # cancelled
        return {"status": "cancelled"}
```

### 5.3 Smart Dependency Detection Pattern

**Why**: Only invalidate downstream approvals that depend on changed output, preserve independent work

**Implementation**:

```python
def detect_affected_downstream_gates(
    workflow: dict,  # Skill manifest
    current_gate: str
) -> list[str]:
    """Returns list of gate IDs that must be invalidated"""

    # Build dependency graph
    steps = workflow["workflow"]["steps"]
    dependencies = {}
    for step in steps:
        step_id = step["id"]
        depends_on = step.get("depends_on", [])
        dependencies[step_id] = depends_on

    # Find step associated with current gate
    current_step = None
    for step in steps:
        if step.get("gate", {}).get("gate_id") == current_gate:
            current_step = step["id"]
            break

    if not current_step:
        return []

    # Breadth-first search for downstream steps
    affected = []
    queue = [current_step]
    visited = set()

    while queue:
        step_id = queue.pop(0)
        if step_id in visited:
            continue
        visited.add(step_id)

        # Find steps that depend on this one
        for other_step_id, deps in dependencies.items():
            if step_id in deps:
                affected.append(other_step_id)
                queue.append(other_step_id)

    # Find gates associated with affected steps
    affected_gates = []
    for step in steps:
        if step["id"] in affected:
            gate = step.get("gate")
            if gate:
                affected_gates.append(gate["gate_id"])

    return affected_gates
```

### 5.4 Budget Enforcement Pattern

**Why**: Prevent unexpected costs, give users predictability

**Implementation**:

```python
async def check_budget_and_deduct(
    user_id: int,
    estimated_cost: int,
    workflow_id: str
) -> bool:
    """Returns True if budget allows, False if exceeded"""

    async with db.transaction():
        # Get user's current credits (with row lock)
        user = await db.query(
            "SELECT credits FROM users WHERE id = $1 FOR UPDATE",
            user_id
        )

        current_credits = user["credits"]

        if current_credits < estimated_cost:
            # Budget exceeded - block request
            await log_budget_event(
                user_id=user_id,
                workflow_id=workflow_id,
                event="budget_exceeded",
                current_credits=current_credits,
                requested=estimated_cost
            )

            # Send notification
            await notify_user(
                user_id=user_id,
                event_type="budget_exceeded",
                message=f"Insufficient credits. Have {current_credits}, need {estimated_cost}."
            )

            return False

        # Deduct credits immediately (pessimistic)
        await db.execute(
            "UPDATE users SET credits = credits - $1 WHERE id = $2",
            estimated_cost,
            user_id
        )

        # Record transaction
        await db.execute(
            """
            INSERT INTO credit_transactions (user_id, amount, type, metadata)
            VALUES ($1, $2, 'deduction', $3)
            """,
            user_id,
            -estimated_cost,
            {"workflow_id": workflow_id}
        )

        # Check if alert threshold crossed
        remaining = current_credits - estimated_cost
        if remaining <= user.get("budget_alert_threshold", 0):
            await notify_user(
                user_id=user_id,
                event_type="budget_low",
                message=f"Credits running low: {remaining} remaining"
            )

        return True
```

### 5.5 Retry with Exponential Backoff Pattern

**Why**: Transient API failures are common, auto-retry improves reliability without user intervention

**Implementation**:

```python
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)
import logging

logger = logging.getLogger(__name__)

# Retryable exceptions
class TransientAPIError(Exception):
    """Temporary API failure, safe to retry"""
    pass

class PermanentAPIError(Exception):
    """Permanent API failure, don't retry"""
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    retry=retry_if_exception_type(TransientAPIError),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True
)
async def call_external_api(endpoint: str, payload: dict):
    """Calls external API with automatic retry"""
    try:
        response = await http_client.post(endpoint, json=payload)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code >= 500:
            # 5xx server error - retry
            raise TransientAPIError(f"Server error: {e}")
        elif e.response.status_code == 429:
            # Rate limit - retry
            raise TransientAPIError(f"Rate limit: {e}")
        else:
            # 4xx client error - don't retry
            raise PermanentAPIError(f"Client error: {e}")
    except (httpx.TimeoutException, httpx.NetworkError) as e:
        # Network issues - retry
        raise TransientAPIError(f"Network error: {e}")
```

### 5.6 Multi-Channel Notification Pattern

**Why**: Different urgency levels and user preferences require different channels

**Implementation**:

```python
async def notify_all_channels(
    user_id: int,
    event_type: str,  # "approval_needed", "job_completed", "error_occurred"
    data: dict
):
    """Dispatch notification to all enabled channels in parallel"""

    # Get user's notification preferences
    prefs = await db.query(
        "SELECT notification_preferences FROM users WHERE id = $1",
        user_id
    )

    # Prepare notification tasks
    tasks = []

    if prefs.get("in_app_enabled", True):
        tasks.append(send_in_app_notification(user_id, event_type, data))

    if prefs.get("push_enabled", True):
        # Check quiet hours
        if not is_quiet_hours(prefs):
            tasks.append(send_push_notification(user_id, event_type, data))

    if prefs.get("email_enabled", True):
        # Email for high-priority events only
        if event_type in ["approval_needed", "error_occurred"]:
            tasks.append(send_email_notification(user_id, event_type, data))

    if prefs.get("telegram_enabled", False):
        if not is_quiet_hours(prefs):
            tasks.append(send_telegram_notification(user_id, event_type, data))

    # Execute all in parallel
    await asyncio.gather(*tasks, return_exceptions=True)

    # Log notification event
    await db.execute(
        """
        INSERT INTO notification_history (user_id, event_type, channels, data)
        VALUES ($1, $2, $3, $4)
        """,
        user_id,
        event_type,
        [t.__name__ for t in tasks],
        data
    )

def is_quiet_hours(prefs: dict) -> bool:
    """Check if current time is in user's quiet hours"""
    start_hour = prefs.get("quiet_hours_start", 22)  # 10 PM default
    end_hour = prefs.get("quiet_hours_end", 7)  # 7 AM default

    now = datetime.now(timezone.utc)
    current_hour = now.hour

    if start_hour < end_hour:
        return start_hour <= current_hour < end_hour
    else:  # Spans midnight
        return current_hour >= start_hour or current_hour < end_hour
```

---

## 6. Testing Strategy

### 6.1 Test Coverage Requirements

**Maintained throughout**: 80% minimum (already enforced by CI)

**Priority areas** (from interview):
1. Approval gates & HITL workflows
2. Cost calculation & budget limits
3. Virtual flow execution engine
4. Calendar/Email integration

### 6.2 Unit Tests

**Approval Service**:
```
test_create_approval_request()
test_respond_to_approval()
test_approval_timeout()
test_concurrent_approvals()
```

**Smart Dependency Detection**:
```
test_linear_workflow_dependencies()
test_branching_workflow_dependencies()
test_independent_branches_not_affected()
test_complex_graph_with_multiple_affected_gates()
```

**Budget Enforcement**:
```
test_budget_check_sufficient_credits()
test_budget_check_insufficient_credits()
test_budget_deduction_atomic()
test_budget_alert_thresholds()
test_concurrent_requests_race_condition()
```

**Skill Loader**:
```
test_valid_manifest_loads()
test_invalid_manifest_rejected()
test_tool_allowlist_validation()
test_artifact_type_validation()
```

### 6.3 Integration Tests

**Workflow Execution**:
```
test_simple_workflow_end_to_end()
test_workflow_with_approval_gate()
test_workflow_resume_after_approval()
test_workflow_resume_after_restart()
test_smart_invalidation_on_changes()
```

**Calendar Integration**:
```
test_oauth_flow()
test_create_event()
test_optimal_time_finding()
test_webhook_notification()
test_conflict_resolution_with_etag()
```

### 6.4 E2E Tests

**Video Ad Workflow** (using Playwright):
```
1. User logs in
2. Opens chat
3. Types: "Create video ad for EcoBottle"
4. System shows job card with script
5. User clicks "Approve"
6. System generates images (wait for completion)
7. System shows image grid
8. User clicks "Rerender" on shot 3
9. User provides notes: "Make brighter"
10. System regenerates shot 3
11. User clicks "Approve"
12. System generates videos
13. User clicks "Approve"
14. System stitches final video
15. User sees download link
16. Assert: Video file exists, metadata correct
```

**Marketplace Workflow**:
```
1. Developer applies for verification
2. Admin approves developer
3. Developer submits skill
4. Admin reviews and approves
5. Skill appears in marketplace
6. Regular user browses marketplace
7. User forks skill to personal
8. User modifies forked skill
9. User executes modified skill
10. Assert: Personal skill executes correctly
```

### 6.5 Load Tests

Use Locust or k6 for load testing:

**Workflow Execution Load**:
- 100 concurrent users
- Each user starts 1 workflow every 30 seconds
- Measure: p95 latency, error rate, checkpoint latency

**Vector Search Load**:
- 1000 queries/second
- Measure: p99 latency (target: <500ms)

**Calendar API Load**:
- 50 requests/second (create events, query free/busy)
- Measure: success rate, API error rate

---

## 7. Deployment & Rollout

### 7.1 Deployment Strategy

**Infrastructure**: Existing Docker Compose + Nginx

**Deployment Steps**:

1. **Database Migrations**
   - Run Drizzle migrations for new tables (workflow_templates, workflow_executions, etc.)
   - Run Alembic migrations for Python backend changes
   - Verify migrations in staging environment first

2. **Backend Deployment** (Zero-downtime)
   - Deploy Python backend (FastAPI + Celery workers)
   - Start new worker processes (leave old ones running)
   - Verify new workers healthy
   - Drain old workers (finish current jobs)
   - Stop old workers

3. **Frontend Deployment**
   - Build production bundle (Vite)
   - Deploy to Nginx static folder
   - Clear CDN cache if applicable

4. **Smoke Tests**
   - Execute simple 2-step workflow
   - Verify checkpoint/resume works
   - Verify notifications sent
   - Check vector search latency

### 7.2 Feature Flags

Implement feature flags for gradual rollout:

```python
FEATURE_FLAGS = {
    "agentic_workflows": True,  # Main workflow engine
    "skill_marketplace": False,  # Marketplace (enable after Phase 2)
    "virtual_flow_builder": False,  # Flow builder (enable after Phase 3)
    "ai_secretary": False,  # AI Secretary (enable after Phase 4)
}

def is_feature_enabled(feature_name: str, user_id: int = None) -> bool:
    """Check if feature is enabled globally or for specific user"""
    if not FEATURE_FLAGS.get(feature_name, False):
        return False

    # Optional: Enable for beta users only
    if user_id and feature_name in BETA_FEATURES:
        return user_id in BETA_USER_IDS

    return True
```

### 7.3 Rollout Plan

**Week 1-2**: Internal testing (dev team only)
**Week 3-4**: Beta users (10 selected users, all features enabled)
**Week 5**: Public MVP launch (Phase 1-4 features)
**Week 6+**: Monitor, fix bugs, collect feedback

### 7.4 Monitoring & Alerts

**Key Metrics**:
- Workflow execution success rate (target: >95%)
- Approval gate response time (target: <10 seconds)
- Vector search latency (target: <500ms p99)
- Budget calculation accuracy (target: 100%)
- API error rates (target: <5%)

**Alert Rules**:
- Workflow failure rate >10% for 5 minutes → Page on-call engineer
- Budget exceeded for >20 users → Email finance team
- Vector search latency >1s for 5 minutes → Alert DevOps
- Calendar API error rate >20% → Check Google API status

---

## 8. Risk Mitigation

### 8.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| PostgreSQL checkpoint latency >100ms | Workflow execution slowdown | Medium | Monitor, optimize queries, consider read replicas |
| ChromaDB performance degradation at scale | Vector search >500ms | High | Add reranking layer, plan Qdrant migration, monitor query times |
| Google API rate limits | AI Secretary failures | Medium | Implement caching, exponential backoff, show user-friendly errors |
| Smart dependency detection bugs | Incorrect invalidation | Medium | Comprehensive unit tests, E2E tests with complex workflows |
| LangGraph state size limits | Workflow execution failures | Low | Implement state compression, limit artifact sizes |

### 8.2 Security Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Malicious skill manifest | Code execution | Medium | Strict validation, tool allowlist, admin review |
| Approval gate bypass | Unauthorized workflow execution | Low | Server-side validation, audit logs |
| OAuth token theft | Calendar/email access | Medium | Encrypt at rest (AES-256), rotate regularly, secure transmission |
| Budget calculation bugs | Financial loss | Low | Comprehensive tests, provider cost verification, audit trails |
| SQL injection | Data breach | Low | Use parameterized queries, ORM, security audit |

### 8.3 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Skill versioning breaks existing workflows | User frustration | Medium | Changelog notifications, rollback option, semantic versioning |
| State retention cleanup deletes active workflows | Data loss | Low | Grace period, user notifications 24h before expiry |
| Notification system overload | Missing alerts | Low | Rate limiting, queueing, fallback channels |
| Concurrent workflow execution deadlock | System hang | Low | Transaction isolation, row-level locking, deadlock detection |
| Cost explosion from runaway workflows | Financial loss | Medium | Budget hard stop, workflow timeout (max 24 hours), alert on high usage |

### 8.4 User Experience Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Approval gate timeout (user away) | Workflow abandonment | High | 7-day state retention, email reminders, resume capability |
| Complex workflows hard to debug | User frustration | Medium | Execution logs, visual status indicators, error messages with next steps |
| Skill manifest too complex for users | Low adoption | Medium | Curated marketplace, templates, authoring guide, examples |
| Notification fatigue | User disables notifications | High | Configurable preferences, quiet hours, intelligent batching |

---

**End of Implementation Plan**

This plan is a self-contained blueprint ready for implementation. Key next steps:

1. **Phase 1**: Begin with LangGraph PostgreSQL checkpointing and approval gate extensions
2. **Testing**: Maintain 80% coverage throughout (enforced by CI)
3. **Monitoring**: Set up observability dashboard from day 1
4. **Security**: Conduct security audit before Phase 5 completion
5. **Documentation**: Write user guides in parallel with development

The extensive existing infrastructure (LangGraph, approval service, ChromaDB, LLM gateway, Celery queues) significantly de-risks this project. Estimated 10-week timeline assumes 2-3 full-time engineers.
