# Agency-Swarm Integration Architecture

## Overview
Agency-Swarm (v1.8.0) is integrated into SmartSpecPro as a multi-agent orchestration layer that works **alongside** the existing LangGraph orchestrator. It's not a replacement — it's for multi-agent conversations, while LangGraph handles workflows.

## Key Components

### 1. Node.js/Express Layer (apps/web/server/)

#### Agency Router (`routers/agency.ts`)
- **Procedures**: list, getById, create, update, delete
- **Conversations**: listConversations, createConversation, sendMessage
- **Admin**: adminListAgencies, adminToggleTenant, adminKillRun
- **Rate Limits**:
  - Agency creation: 10/day
  - Messages: 60/minute
  - Templates: 5/day
- **Feature Flag**: AGENCY_SWARM_ENABLED guarded all endpoints
- **Soft Delete**: Agencies are never hard-deleted, status set to "archived"

#### AgencyBridge Service (`services/agencyBridge.ts`)
- HTTP client for Python `/api/v1/agencies/*` endpoints
- Timeout: 120 seconds (2 minutes for multi-agent runs)
- Methods:
  - `executeRun()` → POST /{agencyId}/run
  - `cancelRun()` → POST /{agencyId}/runs/{runId}/cancel
  - `listRuns()` → GET /{agencyId}/runs with filters
  - `getRunDetails()` → GET /{agencyId}/runs/{runId}
- Headers: Authorization (Bearer), X-Tenant-Id, X-User-Id (for multi-tenancy)
- Error handling: 402 (insufficient credits), 404 (not found), 429 (rate limit)

### 2. Python FastAPI Layer (python-backend/app/)

#### Models (`models/agency.py`)
- **AgencyMessage**: Individual messages within conversations
  - Tracks: role, content, token counts, tool calls, PII redaction
  - Indexed by: conversation_id, created_at

- **AgencyRun**: Execution record for each agency invocation
  - Tracks: status (queued→running→completed/failed/cancelled)
  - Tracks: total_gateway_cost, multiplier_markup, total_credits_used
  - Duration: duration_ms, step_count, retry_count, error details

#### Services
- **agency_swarm_adapter.py** (isolation layer)
  - Only place that imports from agency-swarm library
  - Creates agents: `create_agent(config) → Agent`
  - Creates agencies: `create_agency(config, agents) → Agency`
  - Runs agency: `run(agency, message) → RunResult` with retry logic
  - Streams: `run_stream(agency, message)` for SSE responses
  - Tool creation: `create_tool_class()` for agent tools

- **agency_service.py** (orchestration)
  - `execute_run()`: Load config → construct → pre-check credits → execute → markup
  - `execute_run_stream()`: Async generator yielding SSE events
  - `list_runs()`, `get_run()`, `cancel_run()`
  - Loads agency config from Node.js-owned `agencies` table (no FK constraint)

- **agency_credits.py** (billing)
  - `pre_check()`: Calls Node.js gateway `/api/internal/credits/balance` before run
  - `apply_multiplier_markup()`: Calls `/api/internal/credits/agency-markup` after run
  - Conservative cost estimates (overestimate to prevent mid-run exhaustion)
  - 3 credit tiers: gpt-4o (highest), gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo

- **agency_tools.py** (tool bridging)
  - Resolves tools assigned to agents: `resolve_tools_for_agent(agent_id)`
  - Creates tool bridges via adapter isolation
  - Risk levels: low (always), medium (whitelisted), high (sandbox)
  - Tools routed by risk: low/medium → HTTP, high → OpenSandbox

#### Router (`api/agencies.py`)
- **POST /{agency_id}/run** → AgencyRunResponse
- **POST /{agency_id}/stream** → StreamingResponse (SSE)
- **GET /{agency_id}/runs** → AgencyRunListResponse
- **GET /{agency_id}/runs/{run_id}** → AgencyRunSummary
- **POST /{agency_id}/runs/{run_id}/cancel** → AgencyCancelResponse
- Feature flag: `require_agency_feature` dependency
- Error classification: transient (retry), permanent (fail fast), optional_skip

### 3. Database Schema (Drizzle ORM)

#### Core Tables
- **agencies**
  - id, tenantId, slug (unique per tenant), name, description, systemPrompt
  - creditMultiplier (1-10x), maxAgents, maxRunTimeSeconds, status (draft/published/archived)
  - Indexes: tenant+slug (unique), tenant, createdBy

- **agencyAgents**
  - id, agencyId, name (unique per agency), instructions, model
  - modelSettings (JSON): max_tokens, temperature, top_p
  - isEntryPoint (exactly 1 required), isOptional, position (x,y for visual builder)
  - Indexes: agencyId, (agencyId+name)

- **agencyTools**
  - id, tenantId, name (unique per tenant), description
  - toolType (builtin/skill/sandbox/custom), config (JSON)
  - riskLevel (low/medium/high), requiresApproval (boolean)
  - Indexes: tenantId, (tenantId+name)

- **agencyAgentTools**
  - Junction table: agentId → toolId (many-to-many)
  - Unique constraint: (agentId, toolId)

- **agencyCommunicationFlows**
  - id, agencyId, fromAgentId, toAgentId, flowType (delegation/handoff)
  - Unique constraint: (agencyId, fromAgentId, toAgentId)

- **agencyConversations**
  - id, agencyId, userId, title, totalCreditsUsed
  - messageCount, isArchived, createdAt, updatedAt
  - Indexes: (agencyId+userId), userId

#### Python-Owned Runtime Tables (SQLAlchemy)
- **agency_messages**: Message history (BigInteger PK for auto-increment)
- **agency_runs**: Execution records with status tracking
- Both indexed by conversation_id, tenant_id, user_id, status

## Data Flow: User sends message to agency

1. **Frontend** → tRPC `agency.sendMessage()` with (agencyId, conversationId, message)
2. **Node.js** → `agencyRouter.sendMessage()`
   - Validates conversation ownership (userId)
   - Calls `agencyBridge.executeRun()` with userToken
3. **Node.js → Python** → POST `/api/v1/agencies/{agencyId}/run`
   - Headers: Authorization (Bearer userToken), X-Tenant-Id, X-User-Id
   - Body: {conversation_id, message}
4. **Python `AgencyService`**
   1. Load agency config from `agencies` table (Node.js-owned)
   2. Load agent definitions + communication flows
   3. Pre-check credits via `/api/internal/credits/balance` (call to Node.js gateway)
   4. Resolve tools for each agent from `agency_agent_tools` + `agency_tools`
   5. Create persistence hooks for PostgreSQL
   6. Construct agents via `AgencySwarmAdapter.create_agent()`
   7. Construct agency via `AgencySwarmAdapter.create_agency()`
   8. Create `agency_runs` record (status: running)
   9. Execute `agency.get_response(message)` via adapter with retry logic
   10. Apply multiplier markup via `/api/internal/credits/agency-markup`
   11. Update `agency_runs` (status: completed, duration_ms, step_count)
5. **Python → Node.js** → Return `AgencyRunResponse` {run_id, status, output, credits_used, duration_ms}
6. **Node.js → Frontend** → Return response to client

## Key Design Decisions

### 1. Version Isolation (adapter pattern)
Only `agency_swarm_adapter.py` imports from agency-swarm. All other modules interact through it. Upgrade-safe.

### 2. Gateway Routing for Credits
Agents don't call OpenAI directly. Instead:
- Adapter creates `OpenAIChatCompletionsModel` with `base_url={NODEJS_INTERNAL_URL}/api/llm/v2`
- Agent LLM calls routed through Node.js gateway
- Gateway deducts credits per call, records cost in `provider_usage_log`
- After run, Python applies multiplier markup via internal endpoint

### 3. Per-Request Agency Instantiation
Agency objects **never reused** across requests. Fresh instance per run ensures:
- Clean state
- No cross-tenant contamination
- Safe concurrent runs

### 4. Callback-Based Persistence
Agency-swarm threads saved via callbacks:
```python
load_cb, save_cb = create_persistence_hooks(conversation_id, db_session_factory)
agency = adapter.create_agency(config, agents, persistence_hooks=(load_cb, save_cb))
```
Callbacks read/write to `agency_messages` table, preserving agent-to-agent communication.

### 5. Feature Flag Control
`AGENCY_SWARM_ENABLED` checked via:
1. `settings.AGENCY_SWARM_ENABLED` (env var, fast path)
2. Fallback to `system_settings` table (DB override)
- Gated at: Node.js router, Python router, admin endpoints
- Returns 404 if disabled (not 403, to hide feature)

### 6. Risk-Based Tool Authorization
Tools classified by risk:
- **Low**: Always allowed (e.g., Web search, Calculator)
- **Medium**: Whitelisted per agency (e.g., Database query)
- **High**: Sandbox-dispatched (e.g., Code execution, File system)
- Enforcement: `agency_tools.riskLevel` + agent's tool assignments

### 7. Multi-Tenancy via Metadata
Isolation at runtime (not schema-level):
```python
user_context = {
    "tenant_id": tenant_id,
    "user_id": user_id,
    "conversation_id": conversation_id,
    "agency_id": agency_id,
}
```
Used by adapter for logging, tool execution, credit deduction.

### 8. Error Classification
Retry strategy based on error type:
- **Transient**: ConnectionError, HTTP 429/502/503/504 → Retry with exponential backoff (max 3 attempts)
- **Permanent**: Auth failure, validation error, insufficient credits → Fail fast
- **Optional Skip**: Agent marked optional → Graceful degradation

## Testing Patterns

### Node.js Tests (`apps/web/server/routers/__tests__/agency.test.ts`)
- Mock tRPC procedures to extract handlers
- Mock agencyBridge methods
- Mock database layer (Drizzle)
- Coverage: CRUD, feature flag gating, sendMessage flow, admin operations

### Python Tests (`python-backend/tests/`) — To be implemented
- Unit tests for services (mocked HTTP calls)
- Integration tests for agency execution
- E2E tests for multi-agent scenarios
- Credit reconciliation tests

## Integration Points

### With LLM Gateway
- Agents use `OpenAIChatCompletionsModel` pointing to `/api/llm/v2`
- Per-call cost tracked in `provider_usage_log` with traceId
- Credit deduction happens in real-time (not post-deduct)

### With Skills System
- Skills can be wrapped as agent tools via `agency_tools` table
- Skill executor dispatched as tool (low risk by default)

### With Workflow (LangGraph)
- Agencies: Multi-agent conversation, real-time streaming
- Workflows: Sequential task execution, file persistence
- Non-overlapping use cases

### With OpenSandbox
- High-risk tools dispatched to sandbox via `agency_tools.config.endpoint_url`
- Sandbox response returned to agent as tool result

## Current Status (Feb 27, 2026)

**Implemented**:
- Database schema (all 5 tables)
- Node.js router (CRUD + conversations)
- AgencyBridge (HTTP client)
- Python adapter (isolation layer)
- Python service (full orchestration)
- FastAPI router (all 5 endpoints)
- Credits integration (pre-check + markup)
- Tool resolution + bridging

**TODO**:
- Section-06: Cost reconciliation endpoint (accurate markup calculation)
- Section-07: SSE streaming optimization + heartbeat
- Section-08: Frontend chat UI (agency selection, message input, streaming)
- Section-09: Visual builder for agencies (ReactFlow graph)
- Section-10: Workflow integration (agency nodes in LangGraph)
- Section-11: Admin observability (runs dashboard, cost audit)
- Section-12: Agency templates (rollout)

## File Paths Summary

| Component | Files |
|-----------|-------|
| **Node.js Router** | `apps/web/server/routers/agency.ts` |
| **Node.js Bridge** | `apps/web/server/services/agencyBridge.ts` |
| **Tests** | `apps/web/server/routers/__tests__/agency.test.ts`, `apps/web/server/services/__tests__/agencyBridge.test.ts` |
| **Python Adapter** | `python-backend/app/services/agency_swarm_adapter.py` |
| **Python Service** | `python-backend/app/services/agency_service.py` |
| **Python Credits** | `python-backend/app/services/agency_credits.py` |
| **Python Tools** | `python-backend/app/services/agency_tools.py` |
| **Python Router** | `python-backend/app/api/agencies.py` |
| **Python Models** | `python-backend/app/models/agency.py` |
| **Database Schema** | `apps/web/drizzle/schema.ts` (lines 3906-4034) |
