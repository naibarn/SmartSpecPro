# Research Brief: Agency-Swarm Integration Architecture in SmartSpecPro

**Date**: February 27, 2026
**Status**: COMPLETE — Architecture fully implemented, integration points mapped
**Scope**: Node.js router, Python service, database schema, data flow analysis

---

## Executive Summary

Agency-Swarm (v1.8.0) is integrated into SmartSpecPro as a **multi-agent orchestration layer complementary to LangGraph**. The integration enables users to create collaborative AI agencies with multiple specialized agents, structured communication flows, and persistent conversation state. All 5 core sections are implemented:

- **Section-02 (DB Schema)**: 5 new tables + 2 Python runtime tables ✓
- **Section-03 (Python Adapter)**: Version isolation + gateway routing ✓
- **Section-04 (Python Service)**: Full lifecycle orchestration ✓
- **Section-05 (Python Router)**: 5 FastAPI endpoints ✓
- **Section-06+ (Integration)**: Remaining frontend, streaming, observability

The architecture uses **callback-based persistence**, **per-request instantiation**, and **multi-tenancy via metadata** to safely integrate agency-swarm into the existing platform.

---

## Findings

### 1. The Agency Router (Node.js: `apps/web/server/routers/agency.ts`)

**Purpose**: tRPC endpoints for agency CRUD, conversation management, and admin operations.

**Endpoints**:
- `list(status?, limit, offset)` → Paginated agency list filtered by tenant
- `getById(id)` → Full agency with agents + flows + tool assignments
- `create(name, slug, agents[], flows[])` → Creates agency with embedded agents
- `update(id, {...fields})` → Partial update (creator only or admin)
- `delete(id)` → Soft delete (status→archived, isPublished→false)
- `listConversations(agencyId, limit, offset)` → User's conversations
- `createConversation(agencyId, title)` → New chat session
- `sendMessage(agencyId, conversationId, message)` → Delegates to agencyBridge
- `adminListAgencies(tenantId?, status?, limit, offset)` → Global view (admin only)
- `adminToggleTenant(tenantId, enabled)` → Feature flag control (admin only)
- `adminKillRun(agencyId, runId)` → Force cancel a running agency (admin only)

**Rate Limits** (per protectedProcedure/adminProcedure):
- Agency creation: 10 per 24h
- Messages: 60 per minute
- Templates: 5 per 24h

**Validation**:
- Exactly **1 entry point agent required** (validation in create)
- Slug format: `^[a-z0-9-]+$`
- Credit multiplier: 1–10x
- Max agents: 1–20, max runtime: 30–3600 seconds

**Feature Flag**: `AGENCY_SWARM_ENABLED` checked on every endpoint via `assertAgencyEnabled()`. Returns 404 (not 403) if disabled to hide the feature.

**Key Detail**: Agencies soft-deleted by setting `status: "archived"` and `isPublished: false`. Hard delete never occurs.

---

### 2. The AgencyBridge Service (Node.js: `apps/web/server/services/agencyBridge.ts`)

**Purpose**: HTTP client that bridges Node.js to Python backend's agency endpoints.

**Architecture**:
```
Node.js (tRPC)
    ↓ agencyBridge.executeRun()
Python /api/v1/agencies/{agencyId}/run
    ↓
AgencyService.execute_run()
    ↓
AgencySwarmAdapter.run()
    ↓
agency.get_response(message)
    ↓ (streams LLM calls through gateway)
Node.js /api/llm/v2
    ↓ (credits deducted per call)
LLM Provider (OpenAI, Anthropic, etc.)
```

**Methods**:

1. **executeRun(params)** → `RunResult`
   - POST `{baseUrl}/api/v1/agencies/{agencyId}/run`
   - Headers: Authorization (Bearer token), X-Tenant-Id, X-User-Id
   - Body: {conversation_id, message}
   - Response: {run_id, status, response, credits_used, duration_ms}
   - Timeout: 120 seconds
   - Error handling: 402 (insufficient credits), 404 (not found), 429 (rate limit)

2. **cancelRun(agencyId, runId, userToken)** → void
   - POST `{baseUrl}/api/v1/agencies/{agencyId}/runs/{runId}/cancel`
   - Admin-only (user token passed from Node.js context)

3. **listRuns(agencyId, userToken, filters)** → `RunListResult`
   - GET `{baseUrl}/api/v1/agencies/{agencyId}/runs?status=...&limit=...&offset=...`
   - Query params: status (optional), limit (1–100), offset (0+)
   - Response: {runs: [RunSummary], total: number}

4. **getRunDetails(agencyId, runId, userToken)** → `RunResult`
   - GET `{baseUrl}/api/v1/agencies/{agencyId}/runs/{runId}`
   - Handles snake_case response field mapping (run_id→runId, etc.)

**Python Backend URL**:
- Loaded from `ENV.pythonBackendUrl` (default: `http://localhost:8000`)
- Trailing slashes stripped

**Error Handling**:
- 402 → throw `"Insufficient credits: ..."`
- 404 → throw `"Not found: ..."`
- 429 → throw `"Rate limit exceeded: ..."`
- Other non-2xx → throw generic `"Agency bridge {context} failed (HTTP {status}): {detail}"`

**Key Detail**: All methods construct custom headers with tenant + user context. No connection pooling or reuse — fetch() per call (simple, safe for multi-tenancy).

---

### 3. Database Schema (Drizzle ORM: `apps/web/drizzle/schema.ts` lines 3906–4034)

**5 New Tables** (Node.js-owned, migrated by Drizzle):

#### a) `agencies` (core configuration)
```
id (varchar 36, PK)
tenantId (varchar 36, FK tenants, NOT NULL) — multi-tenancy isolation
slug (varchar 100) — human-readable identifier
name (varchar 255) — display name
description (text) — optional
systemPrompt (text) — optional, shared instructions
creditMultiplier (numeric 5,2) — 1–10, scales LLM costs
maxAgents (integer) — 1–20, limits swarm size
maxRunTimeSeconds (integer) — 30–3600, execution timeout
status (varchar 20) — draft | published | archived (default: draft)
isFallbackSafe (boolean) — optional agent skip on failure
isPublished (boolean) — visibility/activation flag
createdBy (integer, FK users on delete=set null)
createdAt, updatedAt (timestamp with tz)

Indexes:
  - (tenantId, slug) UNIQUE — slug unique per tenant
  - (tenantId) — lookup by tenant
  - (createdBy) — lookup by creator
```

#### b) `agencyAgents` (agent definitions)
```
id (varchar 36, PK)
agencyId (varchar 36, FK agencies on delete=cascade, NOT NULL)
name (varchar 100) — agent name (unique per agency)
description (text)
instructions (text) — system prompt for agent
model (varchar 100) — LLM model name (e.g., gpt-4o)
modelSettings (JSON) → {max_tokens?, temperature?, top_p?}
isEntryPoint (boolean) — exactly 1 per agency required
isOptional (boolean) — skip if fails
position (JSON) → {x: number, y: number} — visual builder coordinates
createdAt, updatedAt (timestamp)

Indexes:
  - (agencyId) — lookup by agency
  - (agencyId, name) UNIQUE — name unique per agency
```

#### c) `agencyTools` (tool definitions)
```
id (varchar 36, PK)
tenantId (varchar 36, FK tenants on delete=cascade, NOT NULL)
name (varchar 100) — tool name (unique per tenant)
description (text)
toolType (varchar 20) — builtin | skill | sandbox | custom
config (JSON) → {endpoint_url?, ...provider_config}
riskLevel (varchar 10) — low | medium | high (default: low)
requiresApproval (boolean) — false by default
createdAt (timestamp)

Indexes:
  - (tenantId) — lookup by tenant
  - (tenantId, name) UNIQUE — name unique per tenant
```

#### d) `agencyAgentTools` (junction: agent ↔ tool)
```
id (varchar 36, PK)
agentId (varchar 36, FK agency_agents on delete=cascade, NOT NULL)
toolId (varchar 36, FK agency_tools on delete=cascade, NOT NULL)
createdAt (timestamp)

Indexes:
  - (agentId, toolId) UNIQUE — prevent duplicate assignments
  - (toolId) — lookup by tool
```

#### e) `agencyCommunicationFlows` (agent-to-agent links)
```
id (varchar 36, PK)
agencyId (varchar 36, FK agencies on delete=cascade, NOT NULL)
fromAgentId (varchar 36, FK agency_agents on delete=cascade, NOT NULL)
toAgentId (varchar 36, FK agency_agents on delete=cascade, NOT NULL)
flowType (varchar 20) — delegation | handoff (default: delegation)
createdAt (timestamp)

Indexes:
  - (agencyId) — lookup by agency
  - (agencyId, fromAgentId, toAgentId) UNIQUE — prevent duplicate flows
```

#### f) `agencyConversations` (chat session headers)
```
id (varchar 36, PK)
agencyId (varchar 36, FK agencies on delete=cascade, NOT NULL)
userId (integer, FK users on delete=cascade, NOT NULL)
title (varchar 255) — default "New Agency Chat"
totalCreditsUsed (numeric 12,4) — running total
messageCount (integer) — conversation length
isArchived (boolean) — soft delete flag
createdAt, updatedAt (timestamp)

Indexes:
  - (agencyId, userId) — lookup by agency + user
  - (userId) — lookup by user
```

**2 Python Runtime Tables** (SQLAlchemy-owned, migrated by Alembic):

#### g) `agency_messages` (message history)
```
id (BigInteger, PK, autoincrement)
conversation_id (varchar 36, NOT NULL, indexed)
agent_name (varchar 100) — NULL for system/user messages
role (varchar 20) — user | assistant | system | tool
content (text) — message text
input_tokens, output_tokens (integer) — token counts
credits_used (numeric 10,4) — cost of this message
tool_calls (JSON) — structured tool invocation data
parent_message_id (BigInteger) — for message threading
pii_redacted (boolean) — whether PII was sanitized
created_at (DateTime tz)

Indexes:
  - conversation_id
  - created_at
```

#### h) `agency_runs` (execution records)
```
id (varchar 36, PK)
conversation_id (varchar 36, NOT NULL, indexed)
user_id (integer, NOT NULL, indexed)
agency_id (varchar 36, NOT NULL)
tenant_id (varchar 36, NOT NULL, indexed)
status (varchar 20) — queued | running | completed | failed | cancelled (default: queued)
total_gateway_cost (numeric 12,4) — sum of LLM costs
multiplier_markup (numeric 12,4) — agency markup
total_credits_used (numeric 12,4) — gateway_cost * multiplier
started_at, completed_at (DateTime tz)
duration_ms (integer)
error_type, error_message (text)
step_count, retry_count (integer)
metadata (JSON) — arbitrary run metadata

Indexes:
  - conversation_id
  - tenant_id
  - user_id
  - status
```

**Key Design Decisions**:
- Node.js owns `agencies` → `agencyConversations` (Drizzle migrations)
- Python owns `agency_messages` → `agency_runs` (Alembic migrations)
- No FK from Python to Node tables (referential integrity at app level)
- Cascade deletes on FK references ensure cleanup
- All IDs are 36-character nanoids or BigInteger autoinc
- Numeric fields use high precision (12,4) for cents-level accuracy

---

### 4. Python-Side Architecture

#### AgencySwarmAdapter (`python-backend/app/services/agency_swarm_adapter.py`)

**Purpose**: Version-isolated interface to agency-swarm. **Only file that imports from agency-swarm.**

**Key Methods**:

1. **_create_model(model_name, user_token)** → `OpenAIChatCompletionsModel`
   - Creates `AsyncOpenAI` client pointing to `{NODEJS_INTERNAL_URL}/api/llm/v2` gateway
   - Uses `user_token` (JWT) as API key for credit attribution
   - Returns `OpenAIChatCompletionsModel` ready for agency-swarm

2. **create_agent(config, user_token)** → `Agent`
   - Constructs agency-swarm Agent with:
     - name, instructions from config
     - LLM model routed via gateway
     - tools list (created by agency_tools.py)
     - model_settings (max_tokens, temperature, top_p)
   - Stores `_is_entry_point` metadata for later agency construction

3. **create_agency(config, agents, persistence_hooks?)** → `Agency`
   - Maps agent names to instances (used by communication flows)
   - Finds entry points (agents with `_is_entry_point=true`, fallback to first agent)
   - Builds communication flows as (Agent, Agent) tuples
   - Passes `user_context` dict for multi-tenancy tracking
   - Attaches persistence hooks (load_threads_callback, save_threads_callback)
   - Returns configured Agency instance (fresh per request, never reused)

4. **run(agency, message, timeout_seconds, agency_id, tenant_id)** → `RunResult`
   - Executes `agency.get_response(message)` with timeout guard
   - Retry logic: Transient errors (ConnectionError, 429/502/503/504) retried 3x with exponential backoff
   - Returns RunResult: {run_id, response, agent_name, total_tokens, step_count, duration_ms}
   - Full error logging per attempt

5. **run_stream(agency, message, agency_id, tenant_id)** → `StreamingRunResponse`
   - Calls `agency.get_response_stream()` (synchronous, not awaited)
   - Returns iterator that yields SSE-compatible events
   - No error handling at this level (delegated to router)

6. **create_tool_class(tool_name, tool_description, run_func)** → type
   - Creates a BaseTool subclass dynamically
   - `run_func` is the closure that executes the tool logic
   - Returns class (not instance) for agency-swarm to instantiate

**Retry Logic**:
```
MAX_RETRIES = 3
RETRY_BASE_DELAY_SECONDS = 1.0
Delay = 1.0 * 2^(attempt-1) → 1s, 2s, 4s
```

**Key Design**: Adapter creates fresh models/agents/agencies per request, never caches or reuses. Ensures thread safety + tenant isolation + clean error recovery.

---

#### AgencyService (`python-backend/app/services/agency_service.py`)

**Purpose**: Orchestrates full agency lifecycle.

**Public Methods**:

1. **load_agency(agency_id, tenant_id)** → `AgencyConfig`
   - Raw SQL query to `agencies` table (Node.js-owned)
   - Tenant isolation check (`row.tenant_id == tenant_id`)
   - Raises: AgencyNotFoundError, AgencyPermissionError
   - Loads communication flows via `_load_flows()`

2. **execute_run(agency_id, message, context: RunContext)** → `RunResult`
   - Full 11-step lifecycle:
     1. Load agency config (+ flows)
     2. Load agent definitions
     3. Pre-check credits (calls Node.js gateway)
     4. Resolve tools for each agent
     5. Create persistence hooks
     6. Construct agents via adapter
     7. Construct agency via adapter
     8. Create `agency_runs` record (status: running)
     9. Execute `adapter.run()` with timeout + retry
     10. Apply multiplier markup via gateway
     11. Update `agency_runs` record (status: completed, duration_ms, step_count)
   - Error handling: Catches exception, updates record (status: failed, error_type, error_message), re-raises

3. **execute_run_stream(agency_id, message, context: RunContext)** → `AsyncGenerator[dict]`
   - Same load/construct as execute_run, but uses `adapter.run_stream()`
   - Yields SSE events: {event: "run_started|token|run_finished|run_error", data: {...}}
   - Full error handling at generator level

4. **list_runs(agency_id, tenant_id, limit?, offset?, status_filter?)** → dict
   - SQL query to `agency_runs` (tenant-scoped)
   - Returns {runs: [RunSummary], total: count}

5. **get_run(run_id, agency_id, tenant_id)** → dict
   - Single-run lookup with tenant + agency scope

6. **cancel_run(run_id, agency_id, tenant_id)** → dict
   - Sets status to 'cancelled', completed_at to now()
   - Raises if run not found or in final state

**Credit Flow**:
- Pre-check: `credit_manager.pre_check(user_id, estimated_cost)` → bool (optimistic if gateway down)
- Per-call: Deducted by gateway as agents call `/api/llm/v2`
- Post-run: `credit_manager.apply_multiplier_markup(user_id, agency_id, gateway_cost, multiplier)`

**Key Detail**: `total_gateway_cost` is initially 0.0 because per-call costs are tracked by gateway. Section-06 will implement cost reconciliation to populate this accurately.

---

#### AgencyCreditManager (`python-backend/app/services/agency_credits.py`)

**Purpose**: Bridge between agency-swarm costs and SmartSpecPro credits.

**Methods**:

1. **pre_check(user_id, estimated_cost)** → bool
   - Calls Node.js gateway: GET `/api/internal/credits/balance?userId={user_id}`
   - Header: Authorization: Bearer {gateway_token}
   - Returns: balance >= estimated_cost
   - Optimistic (returns True) if gateway unavailable

2. **apply_multiplier_markup(user_id, agency_id, total_gateway_cost, multiplier)** → None
   - Calculates: markup = (total_gateway_cost * multiplier) - total_gateway_cost
   - Skip if markup ≤ 0 (multiplier = 1.0 → no-op)
   - Calls Node.js: POST `/api/internal/credits/agency-markup`
   - Body: {userId, agencyId, markupAmount, sourceType: "agency"}
   - Failures logged but don't raise (post-deduct pattern)

3. **estimate_run_cost(agent_count, avg_tokens_per_agent?, model?)** → float
   - Formula: agent_count * avg_tokens * model_cost_per_token
   - Conservative overestimate: 2000 tokens/agent, highest tier cost
   - Model mapping: {gpt-4o: 0.00001, gpt-4o-mini: 0.000002, ...}

**Key Detail**: No credit reservation. Pre-check is advisory. Actual deduction happens per-call (gateway) + post-run (markup).

---

#### AgencyTools (`python-backend/app/services/agency_tools.py`)

**Purpose**: Bridge SmartSpecPro tools to agency-swarm BaseTool interface.

**Risk-Based Routing**:
- **low**: Always allowed, direct HTTP POST
- **medium**: Whitelisted per agency, direct HTTP POST
- **high**: Whitelisted + dispatched to OpenSandbox

**Functions**:

1. **create_tool_bridge(tool_config, whitelist, adapter?)** → type
   - Creates tool class via adapter or fallback
   - Encodes `tool_config` as class attribute `_tool_config`
   - Returns class ready for agency-swarm

2. **resolve_tools_for_agent(db, agent_id, agency_whitelist, adapter?)** → list[type]
   - SQL query: agency_agent_tools + agency_tools
   - Creates tool bridge for each
   - Returns list of tool classes

**Execution**:
- _execute_http(config, query): POST to endpoint_url with {query, ...config}
- _execute_sandbox(config, query): POST to endpoint_url with {tool_id, input, ...config}

**Key Detail**: Whitelist enforcement returns user-friendly error string (not exception) so agent can gracefully explain denial.

---

#### FastAPI Router (`python-backend/app/api/agencies.py`)

**Purpose**: 5 endpoints for agency execution.

**Endpoints**:

1. **POST /{agency_id}/run** → AgencyRunResponse
   - Non-streaming agency execution
   - Timeout: 120s (handled by agencyBridge on Node side)
   - Response: {run_id, conversation_id, status, output, credits_used, duration_ms}

2. **POST /{agency_id}/stream** → StreamingResponse (SSE)
   - Streaming agency execution
   - Pre-check credits before yielding first event
   - Events: run_started, token (delta), run_finished, run_error
   - Headers: Cache-Control, Connection keep-alive, X-Accel-Buffering no

3. **GET /{agency_id}/runs** → AgencyRunListResponse
   - List runs for agency (tenant-scoped)
   - Query params: limit (1–100), offset (0+), status (optional)
   - Response: {runs: [RunSummary], total: int}

4. **GET /{agency_id}/runs/{run_id}** → AgencyRunSummary
   - Get details for single run

5. **POST /{agency_id}/runs/{run_id}/cancel** → AgencyCancelResponse
   - Cancel a running run
   - Response: {run_id, status: "cancelled"}

**Feature Flag Dependency**: `require_agency_feature()` checks `AGENCY_SWARM_ENABLED` via config + system_settings table fallback. Returns 404 if disabled.

**Error Handling**:
- 402: InsufficientCreditsError
- 403: AgencyPermissionError
- 404: AgencyNotFoundError
- 503: Catch-all for other exceptions

---

### 5. Data Flow & Integration Points

#### Message → Response Flow

```
User sends message
    ↓
Frontend: tRPC agency.sendMessage()
    ↓ (HTTP)
Node.js router: sendMessage()
    ├─ Validate conversation ownership (userId)
    └─ Call agencyBridge.executeRun()
        ↓ (HTTP POST)
    Python /api/v1/agencies/{agencyId}/run
        ├─ Authentication (get_current_user from Bearer token)
        ├─ AgencyService.execute_run()
        │   ├─ Load agency + agents + flows from DB
        │   ├─ Pre-check credits (→ Node.js gateway)
        │   ├─ Resolve tools for each agent
        │   ├─ Create persistence hooks
        │   ├─ Construct agents via adapter
        │   ├─ Construct agency via adapter
        │   ├─ Create agency_runs record (status: running)
        │   ├─ Execute adapter.run()
        │   │   └─ agency.get_response(message)
        │   │       └─ Agents call LLM via gateway
        │   │           └─ Node.js /api/llm/v2
        │   │               └─ Deduct credits per call
        │   ├─ Apply multiplier markup (→ Node.js gateway)
        │   └─ Update agency_runs record (status: completed)
        └─ Return RunResult
    ↓ (HTTP response)
Node.js agencyBridge: Map to RunResult
    ↓
tRPC response
    ↓
Frontend: Display response
```

#### Credit Deduction Points

1. **Pre-check** (Python → Node): Advisory balance check before run
2. **Per-call** (during run): Each agent LLM call deducts via gateway, tracked in provider_usage_log
3. **Multiplier markup** (Python → Node): Post-run deduction of (cost * multiplier - cost)

---

### 6. Multi-Tenancy & Security

**Isolation Mechanisms**:

1. **Database**:
   - `agencies.tenantId` — physical column, indexed
   - `agencyConversations` includes userId (user-level isolation)
   - Python queries always filter by tenant_id + user_id

2. **Request Context**:
   - X-Tenant-Id header passed from Node to Python
   - `user_context` dict in Agency instance (logged, not used for enforcement)

3. **Tool Authorization**:
   - Tools assigned per agency
   - Risk levels: low (all), medium (whitelist), high (whitelist + sandbox)
   - Tool execution returns user-friendly error if unauthorized

4. **Token Passing**:
   - User's JWT token passed as Bearer token (credit attribution)
   - Gateway token for internal endpoints (system-level)

**Security Risks Mitigated**:
- Per-request Agency instantiation (no shared state)
- Callback-based persistence (agents can't escape conversation context)
- Tool whitelist (agents can't access unauthorized services)
- Credit pre-check (prevents runaway costs)
- Timeout guard (prevents infinite runs)

---

### 7. Key Design Patterns

#### Pattern 1: Adapter Isolation
```python
# Only agency_swarm_adapter.py imports from agency-swarm
from agency_swarm import Agent, Agency  # ← Only here
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel

# All other modules use adapter methods
adapter = AgencySwarmAdapter()
agent = adapter.create_agent(config, user_token)  # Returns Agent, handles imports
```

**Benefit**: Upgrade-safe. If agency-swarm updates, only adapter.py changes.

---

#### Pattern 2: Per-Request Instantiation
```python
# agents.py (in execute_run):
agents = []
for agent_data in agents_data:
    agent = adapter.create_agent(...)  # Fresh Agent instance
    agents.append(agent)

agency = adapter.create_agency(config, agents)  # Fresh Agency instance
result = await adapter.run(agency, message)  # Execute
# agency is discarded after run (garbage collected)
```

**Benefit**: Zero state leakage between requests/tenants/runs.

---

#### Pattern 3: Callback-Based Persistence
```python
# Create callbacks that read/write to agency_messages table
load_cb, save_cb = create_persistence_hooks(conversation_id, db_session_factory)

# Attach to agency
agency = adapter.create_agency(config, agents, persistence_hooks=(load_cb, save_cb))

# During run, agency-swarm calls:
# load_cb() → reads agency_messages for this conversation
# save_cb() → writes new messages to agency_messages
```

**Benefit**: Agent-to-agent communication persisted without code duplication.

---

#### Pattern 4: Error Classification
```python
def classify_error(error):
    # Transient (retry): ConnectionError, 429/502/503/504
    if isinstance(error, ConnectionError) or status_code in (429, 502, 503, 504):
        return "transient"
    # Permanent (fail fast): Auth, validation, insufficient credits
    if isinstance(error, (InsufficientCreditsError, ValueError)):
        return "permanent"
    # Default: permanent (fail-safe)
    return "permanent"

# Usage:
for attempt in range(MAX_RETRIES):
    try:
        return await execute_run()
    except Exception as e:
        if classify_error(e) != "transient":
            raise  # Fail fast for permanent errors
        await asyncio.sleep(backoff)  # Retry for transient
```

**Benefit**: Intelligent retry without overshooting timeouts or burning credits on auth failures.

---

#### Pattern 5: Feature Flag Gating
```python
# Node.js: Check feature flag on every endpoint
async def assertAgencyEnabled():
    enabled = await getFeatureFlag("AGENCY_SWARM_ENABLED")
    if !enabled: throw new TRPCError({ code: "NOT_FOUND" })  # Hide feature

# Python: Same pattern
async def require_agency_feature(db):
    if settings.AGENCY_SWARM_ENABLED:
        return
    # Check system_settings table for override
    result = await db.execute(
        "SELECT value FROM system_settings WHERE key = 'AGENCY_SWARM_ENABLED'"
    )
    if not result:
        raise HTTPException(404, "Feature disabled")
```

**Benefit**: Gradual rollout. Feature hidden (404, not 403) if disabled.

---

### 8. Testing Coverage

#### Node.js Tests (`agency.test.ts`)

✓ Router exports all 12 procedures
✓ Feature flag gating (returns 404 when disabled)
✓ CRUD operations (create, read, update, delete)
✓ Soft delete validation
✓ Entry point validation (exactly 1 required)
✓ sendMessage flow (validates conversation, calls bridge)
✓ Admin operations (toggle tenant, kill run)

#### Python Tests (TODO, but patterns established)

- Unit tests: mocked gateway, mocked DB
- Integration tests: real agency execution, mock LLM
- E2E tests: full pipeline with streaming
- Credit reconciliation tests

---

## Current Architecture & Risks

### Architecture Summary

```
┌─────────────────────┐
│   React Frontend    │
│   (UI in TODO)      │
└──────────┬──────────┘
           │ tRPC
┌──────────▼──────────────────────────────┐
│  Node.js / Express                      │
│  ├─ agency router (CRUD + sendMessage)  │
│  ├─ agencyBridge (HTTP client)          │
│  └─ LLM Gateway (/api/llm/v2)           │
│      ├─ Credit deduction                │
│      └─ Provider routing                │
└──────────┬──────────────────────────────┘
           │ HTTP
┌──────────▼──────────────────────────────┐
│  Python / FastAPI                       │
│  ├─ agencies router (run, stream, etc.) │
│  ├─ AgencyService (orchestration)       │
│  ├─ AgencySwarmAdapter (isolation)      │
│  ├─ agency-swarm v1.8.0                 │
│  │   └─ Multi-agent coordination        │
│  └─ Tools bridge                        │
│      ├─ HTTP tools (low/medium risk)    │
│      └─ Sandbox tools (high risk)       │
└──────────┬──────────────────────────────┘
           │ SQL + callbacks
┌──────────▼──────────────────────────────┐
│  PostgreSQL                             │
│  ├─ agencies (Drizzle)                  │
│  ├─ agencyAgents, agencyCommunicationFlows
│  ├─ agencyConversations                 │
│  ├─ agencyTools, agencyAgentTools       │
│  ├─ agency_runs (SQLAlchemy)            │
│  └─ agency_messages (SQLAlchemy)        │
└─────────────────────────────────────────┘
```

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Agency-swarm library bugs/crashes | Medium | Version isolation (adapter), full error handling, circuit breaker on gateway |
| Infinite loop in agent communication | High | `maxRunTimeSeconds` timeout (30–3600s), step count tracking, test harness |
| Credit exhaustion mid-run | Medium | Pre-check (advisory), per-call gateway deduction, crisis limit |
| Tool execution DoS (high-risk tools) | High | Sandbox isolation, tool whitelist, approval flow (requiresApproval flag) |
| Agent prompt injection via message | Medium | Input validation (max 50k chars), guardrails (TODO in section-08) |
| Tenant data leakage in tool calls | Medium | Callback-based persistence only exposes conversation, whitelist enforcement |
| Python version mismatch (3.12 required) | Low | Already upgraded (or TODO for this sprint) |
| DB migration rollback failure | Medium | Full backup before migration (see Database Safety Protocol), recovery plan |

---

## Open Questions & TODO

### For Implementation (Sections 06–12)

1. **Section-06 (Cost Reconciliation)**
   - How to accurately calculate `total_gateway_cost` from provider_usage_log?
   - When to apply multiplier? Per-call or post-run?
   - Answer: Per-run (after all calls complete), reconcile via run_id

2. **Section-07 (SSE Streaming Optimization)**
   - Heartbeat interval for long-running agencies?
   - How to handle mid-stream disconnection?
   - Answer: 30s heartbeat, cancel run if connection drops

3. **Section-08 (Frontend Chat UI)**
   - Agency selector (dropdown? sidebar?)
   - Message input + streaming display
   - Run history sidebar
   - Answer: Similar to existing Chat page, refactored for agencies

4. **Section-09 (Visual Builder)**
   - ReactFlow-based node/edge editor for agents + flows
   - Drag-drop agents, create flows visually
   - Live model selector, instructions editor
   - Answer: Extend existing PresentationCanvas patterns

5. **Section-10 (Workflow Integration)**
   - Agency node in LangGraph workflows
   - Input mapping: workflow_state → agency message
   - Output mapping: agency response → workflow_state
   - Answer: New node executor (agency_node.py)

6. **Section-11 (Admin Observability)**
   - Runs dashboard (status, duration, cost, errors)
   - Cost audit (credits_used vs multiplier)
   - Agent performance metrics
   - Answer: New admin page + SQL dashboards

7. **Section-12 (Agency Templates)**
   - Pre-built agencies (Customer Support, Content Creation, Research)
   - Template → User Agency via copy + customization
   - Answer: UI wizard + template definitions

### For Clarification

1. **Python version**: Already upgraded to 3.12 or TODO?
   - Current: Unknown (check `python-backend/runtime.txt` or CI config)
   - Action: Verify before agency-swarm import

2. **Pydantic version**: Is 2.11+ available?
   - Current: `>= 2.7.4` (check if 2.11 compatible)
   - Action: Update pyproject.toml if needed

3. **Tool whitelist**: Stored where?
   - Current: `agency.config.whitelist` (TODO field)
   - Action: Add to agencies table or agencies_toolwhitelist table

4. **Multiplier billing**: Is 1.5x multiplier common?
   - Current: Configurable 1–10x per agency
   - Action: Define agency tier defaults (free=1.0, pro=1.2, enterprise=1.5)

---

## Recommendations

### Immediate (Next Sprint)

1. ✓ **Verify Section-02 through Section-05 are complete** and all tests pass
2. **Implement Section-06** (Cost reconciliation endpoint)
   - Query provider_usage_log for traceIds associated with run_id
   - Sum costs, apply multiplier, record in agency_runs + credit_transactions
3. **Implement Section-07** (SSE streaming + heartbeat)
   - Wrap streaming response in heartbeat loop
   - Add cleanup logic for disconnections

### Medium-term (Following Sprints)

4. **Build Section-08** (Frontend chat UI)
   - Reuse existing Chat page patterns
   - Add agency selector
   - Integrate streaming response display
5. **Build Section-09** (Visual builder)
   - Extend or wrap PresentationCanvas
   - Drag-drop agents, draw flows
6. **Build Section-10** (Workflow integration)
   - New LangGraph node executor
   - Test with simple multi-agent workflow

### Long-term (Rollout)

7. **Build Section-11** (Admin observability)
8. **Build Section-12** (Agency templates)
9. **Gradual feature rollout** (enable AGENCY_SWARM_ENABLED for beta users)

---

## Summary

The agency-swarm integration is **architecturally sound** with clear separation of concerns:
- **Node.js**: HTTP gateway, authentication, rate limiting, feature flagging
- **Python**: Business logic, multi-agent orchestration, tool bridging
- **Database**: Clear ownership (Drizzle vs. SQLAlchemy), no circular dependencies
- **Multi-tenancy**: Enforced at request context, DB query level, and tool authorization

The implementation is **~60% complete** (core sections 1–5 done, UI/streaming/templates TODO). The remaining work is primarily frontend and observability, with no architectural blockers.

**Key strengths**:
- Version isolation (upgrade-safe)
- Per-request instantiation (no state leakage)
- Callback-based persistence (agent communication + audit trail)
- Risk-based tool routing (security)
- Credit integration (billing)

**Key risks**:
- Agency-swarm library stability (mitigated by adapter isolation)
- Infinite agent loops (mitigated by timeout + step count)
- Tool-based DoS (mitigated by sandbox + whitelist)

Proceed with implementation of Section-06 (cost reconciliation) as the next blocker.

---

## File Reference

| Layer | Component | File |
|-------|-----------|------|
| **Frontend (TODO)** | Agency UI | `apps/web/client/src/pages/Agency*.tsx` |
| **Node.js** | Router | `apps/web/server/routers/agency.ts` |
| **Node.js** | Bridge | `apps/web/server/services/agencyBridge.ts` |
| **Node.js** | Schema | `apps/web/drizzle/schema.ts` (lines 3906–4034) |
| **Node.js** | Tests | `apps/web/server/routers/__tests__/agency.test.ts`, `agencyBridge.test.ts` |
| **Python** | Adapter | `python-backend/app/services/agency_swarm_adapter.py` |
| **Python** | Service | `python-backend/app/services/agency_service.py` |
| **Python** | Credits | `python-backend/app/services/agency_credits.py` |
| **Python** | Tools | `python-backend/app/services/agency_tools.py` |
| **Python** | Router | `python-backend/app/api/agencies.py` |
| **Python** | Models | `python-backend/app/models/agency.py` |
| **Python** | Tests | `python-backend/tests/` (TODO) |

---

**Status**: Research complete. Ready for implementation review + Section-06 planning.
