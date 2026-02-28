# Agency-Swarm Integration — Implementation Plan

> Planning directory: `specs/feature/027-AgencySwarm/`
> Date: 2026-02-27

---

## 1. Context and Motivation

SmartSpecPro is an AI-driven platform with multi-provider LLM integration, a skills engine, workflow orchestration (LangGraph), and enterprise admin tooling. Users currently interact with AI through single-agent chat, skills, and workflows.

This plan adds **multi-agent orchestration** via [agency-swarm v1.8.0](https://github.com/VRSEN/agency-swarm), enabling users to create "agencies" — teams of specialized AI agents that communicate directionally, use tools, and persist conversation state. This extends SmartSpecPro's existing single-agent capabilities without replacing them.

### Why agency-swarm?

- Proven multi-agent framework built on OpenAI Agents SDK
- Directional communication flows (`agent_a > agent_b`) map naturally to visual graph editors
- `OpenAIChatCompletionsModel` allows routing all LLM calls through SmartSpecPro's existing gateway
- Callback-based persistence hooks integrate cleanly with PostgreSQL
- Streaming support via `StreamingRunResponse` is SSE-compatible

### What This Plan Covers

- Python 3.12 + dependency upgrades (openai v2, pydantic 2.11)
- 8 new database tables (split between Drizzle and SQLAlchemy)
- Python service layer (adapter, services, tool bridge, credit/persistence hooks)
- Node.js integration (tRPC router, HTTP bridge, SSE proxy)
- React frontend (AgencyChat split-view, AgencyBuilder React Flow canvas, templates)
- Admin controls, tool whitelists, observability
- Feature flags and staged rollout

### Scope Boundary

**In scope (this plan):** Chat UI, Workflow Node, Skill Auto-Trigger channels; tenant-level sharing; 4 starter templates; pre-configured tool whitelists; time-based archival; PII redaction; staged rollout.

**Deferred (not in this plan):** ISC integration, group-scoped permission tables, onboarding tutorials, scheduled messages channel, OpenAI-compatible API, MCP server, webhooks, desktop app, full public marketplace, runtime approval gates with pause/resume.

---

## 2. Pre-Validation Phase (Phase 0)

Before any agency-swarm code is written, the Python environment must be upgraded and validated. This phase de-risks the foundation.

### 2.1 Python 3.12 Upgrade

**Scope:** The entire Python backend (`python-backend/`) upgrades from 3.11 to 3.12. No separate service or container split.

**Changes:**
- `python-backend/Dockerfile`: Change `FROM python:3.11-slim` to `FROM python:3.12-slim` in both build stages
- Verify all 50+ existing routers pass tests on 3.12
- Key Python 3.12 changes to watch: `typing` module updates, `asyncio` improvements, `pathlib` changes

**Validation:** Full `pytest` suite must pass with 80% coverage threshold maintained.

### 2.2 Full Dependency Resolution

**Scope:** Upgrade `openai` from 1.50.0 to >=2.2.0, plus resolve all transitive dependency conflicts.

**Step 1: Dependency conflict resolution.** Before upgrading, run `pip install agency-swarm==1.8.0 openai>=2.2 pydantic>=2.11` in an isolated venv and collect the full dependency resolution output. Document which packages need version bumps. Key conflicts to resolve:
- `langchain-openai>=0.2.0` — may pin an openai version range incompatible with v2
- `anthropic==0.8.1` — extremely old, likely incompatible with pydantic 2.11. Upgrade to latest compatible version.
- `chromadb>=0.5.0` — bundles its own openai dependency
- `sentence-transformers>=2.2.0` — may conflict with upgraded pydantic

**Step 2: OpenAI SDK v2 breaking changes.** Audit and fix:
- `ResponseFunctionToolCallOutputItem.output` changed from `string` to `string | Array`. Any code accessing `.output` must handle both types.
- `openai.OpenAIError` renamed to `openai.APIError` — grep and replace across all Python files (confirmed usage in `python-backend/app/llm_proxy/openrouter_wrapper.py`).
- Core `chat.completions` API is unchanged — existing usage continues to work.

**Mitigation:** Feature flag `AGENCY_SWARM_ENABLED` wraps all new agency code. If existing code breaks, the flag disables agency features while the team fixes SDK issues.

**Files to audit:**
- `python-backend/app/llm_proxy/` — all direct openai client usage, `OpenAIError` imports
- `python-backend/app/orchestrator/node_executors/llm_executor.py` — LLM executor
- Any file importing from `openai` package

### 2.3 Pydantic 2.11 Upgrade

**Scope:** Update `pydantic>=2.7.4` to `pydantic>=2.11.0` in `requirements.txt`.

**Key deprecation:** `instance.model_fields` → use `ClassName.model_fields` or `type(instance).model_fields`. This affects any BaseTool subclasses and model introspection code.

**Performance benefit:** Up to 2x faster build time, 4x memory reduction.

**Files to audit:** Grep for `\.model_fields` and `\.model_computed_fields` across `python-backend/`.

### 2.4 Feature Flag Infrastructure

Create a feature flag system for agency features. The flags control both Python and Node.js behavior.

**Flags:**
- `AGENCY_SWARM_ENABLED` — Master toggle (gates all agency endpoints)
- `AGENCY_BUILDER_ENABLED` — Canvas builder UI
- `AGENCY_TEMPLATES_ENABLED` — Starter templates
- `AGENCY_WORKFLOW_NODE_ENABLED` — Workflow node integration
- `AGENCY_SKILL_TRIGGER_ENABLED` — Skill auto-trigger

**Implementation:** Store flags in the existing `system_settings` table (category: "feature_flags"). Read via the settings service. Cache in Redis for performance.

### 2.5 Contract Tests

Write contract tests validating that existing LLM proxy, credit system, and workflow orchestrator work correctly with the upgraded dependencies. These tests must pass before proceeding to Phase 1.

---

## 3. Database Schema (Phase 1)

### 3.1 Ownership Model

The database is split between two ORMs:

| Owner | Tables | Rationale |
|-------|--------|-----------|
| **Drizzle (Node.js)** | agencies, agency_agents, agency_agent_tools, agency_tools, agency_communication_flows, agency_conversations | Config/session tables — managed alongside existing Drizzle schema |
| **SQLAlchemy (Python)** | agency_messages, agency_runs | High-write runtime tables — Python reads/writes directly for performance |

Both ORMs point at the same PostgreSQL database. Drizzle manages migrations for its tables; SQLAlchemy (via Alembic) manages migrations for its tables.

### 3.2 Drizzle Tables

**agencies**

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID |
| tenantId | varchar(36) FK→tenants | Cascade delete |
| slug | varchar(100) | Unique per tenant |
| name | varchar(255) | Display name |
| description | text | |
| systemPrompt | text | Shared instructions for all agents |
| creditMultiplier | numeric(5,2) | Default 1.00 |
| maxAgents | integer | Default 10 |
| maxRunTimeSeconds | integer | Default 600 (10 min) |
| status | varchar(20) | draft / published / archived |
| isFallbackSafe | boolean | Can fallback to single-agent mode |
| isPublished | boolean | Visible to tenant users |
| createdBy | integer FK→users | |
| createdAt | timestamp with TZ | |
| updatedAt | timestamp with TZ | |

Indexes: `(tenantId, slug)` unique, `(tenantId)`, `(createdBy)`.

**agency_agents**

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID |
| agencyId | varchar(36) FK→agencies | Cascade delete |
| name | varchar(100) | Agent display name |
| description | text | |
| instructions | text | Agent system prompt |
| model | varchar(100) | LLM model identifier |
| modelSettings | json | `{max_tokens, temperature, top_p}` |
| isEntryPoint | boolean | One per agency |
| isOptional | boolean | Can be skipped on failure |
| position | json | `{x, y}` for canvas layout |
| createdAt | timestamp with TZ | |
| updatedAt | timestamp with TZ | |

Indexes: `(agencyId)`, `(agencyId, name)` unique.

**agency_agent_tools** (junction table)

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID |
| agentId | varchar(36) FK→agency_agents | Cascade delete |
| toolId | varchar(36) FK→agency_tools | Cascade delete |
| createdAt | timestamp with TZ | |

Indexes: `(agentId, toolId)` unique, `(toolId)`.

**agency_tools**

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID |
| tenantId | varchar(36) FK→tenants | |
| name | varchar(100) | |
| description | text | |
| toolType | varchar(20) | builtin / skill / sandbox / custom |
| config | json | Tool-specific configuration |
| riskLevel | varchar(10) | low / medium / high |
| requiresApproval | boolean | Triggers approval gate |
| createdAt | timestamp with TZ | |

Indexes: `(tenantId)`, `(tenantId, name)` unique.

**agency_communication_flows**

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | |
| agencyId | varchar(36) FK→agencies | Cascade delete |
| fromAgentId | varchar(36) FK→agency_agents | |
| toAgentId | varchar(36) FK→agency_agents | |
| flowType | varchar(20) | delegation / handoff |
| createdAt | timestamp with TZ | |

Indexes: `(agencyId)`, `(agencyId, fromAgentId, toAgentId)` unique.

**agency_conversations**

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID (consistent with other agency tables) |
| agencyId | varchar(36) FK→agencies | |
| userId | integer FK→users | Cascade delete |
| title | varchar(255) | Default "New Agency Chat" |
| totalCreditsUsed | numeric(12,4) | |
| messageCount | integer | |
| isArchived | boolean | |
| createdAt | timestamp with TZ | |
| updatedAt | timestamp with TZ | |

Indexes: `(agencyId, userId)`, `(userId)`.

### 3.3 SQLAlchemy Tables

**Important:** SQLAlchemy models for these tables do NOT use `ForeignKey()` constraints for references to Drizzle-owned tables. Referential integrity is enforced at the application level. Migration ordering: Drizzle migrations MUST run before Alembic migrations.

**agency_messages**

| Column | Type | Notes |
|--------|------|-------|
| id | BigInteger PK | Auto-increment |
| conversation_id | String(36) | References agency_conversations.id (no DB FK) |
| agent_name | String(100) | Which agent sent this |
| role | String(20) | user / assistant / system / tool |
| content | Text | Message content (PII-redacted for agent-to-agent) |
| input_tokens | Integer | |
| output_tokens | Integer | |
| credits_used | Numeric(10,4) | |
| tool_calls | JSON | Array of tool call records |
| parent_message_id | BigInteger | For threading |
| pii_redacted | Boolean | Whether PII was stripped |
| created_at | DateTime with TZ | |

**agency_runs**

| Column | Type | Notes |
|--------|------|-------|
| id | String(36) PK | UUID |
| conversation_id | String(36) | References agency_conversations.id (no DB FK) |
| user_id | Integer | |
| agency_id | String(36) | |
| tenant_id | String(36) | |
| status | String(20) | queued / running / completed / failed / cancelled |
| total_gateway_cost | Numeric(12,4) | Sum of per-call gateway charges |
| multiplier_markup | Numeric(12,4) | Additional charge from creditMultiplier |
| total_credits_used | Numeric(12,4) | gateway_cost + markup |
| started_at | DateTime with TZ | |
| completed_at | DateTime with TZ | |
| duration_ms | Integer | |
| error_type | String(50) | transient / permanent / optional_skip |
| error_message | Text | |
| step_count | Integer | Total agent steps executed |
| retry_count | Integer | Total retries across all steps |
| metadata | JSON | Agent trace, tool calls, etc. |

---

## 4. Python Service Layer (Phase 1-2)

### 4.1 AgencySwarmAdapter

**File:** `python-backend/app/services/agency_swarm_adapter.py`

Single abstraction point for all agency-swarm imports. Wraps Agency/Agent construction and execution methods. Exposes raw streaming event types (no re-wrapping).

```python
class AgencySwarmAdapter:
    """Version-isolated interface to agency-swarm v1.8.0."""

    def create_agent(self, config: AgentConfig) -> Agent:
        """Construct an Agent with SmartSpecPro's LLM model routing."""

    def create_agency(self, config: AgencyConfig, agents: list[Agent]) -> Agency:
        """Construct an Agency with persistence hooks and user context."""

    async def run(self, agency: Agency, message: str) -> RunResult:
        """Execute agency.get_response() with error handling."""

    def run_stream(self, agency: Agency, message: str) -> StreamingRunResponse:
        """Return streaming response (synchronous — do NOT await)."""
```

The adapter configures each agent's LLM model to route through the Node.js gateway:

```python
def _create_model(self, model_name: str, user_token: str) -> OpenAIChatCompletionsModel:
    """Create LLM model pointing to Node.js gateway."""
    # base_url = NODEJS_INTERNAL_URL/api/llm/v2
    # api_key = user_token (for credit deduction)
```

### 4.2 Agency Service

**File:** `python-backend/app/services/agency_service.py`

Orchestrates agency lifecycle: loading config from DB, constructing agency-swarm objects, executing runs, recording results.

```python
class AgencyService:
    async def load_agency(self, agency_id: str, tenant_id: str) -> AgencyConfig:
        """Load agency definition directly from PostgreSQL via read-only SQLAlchemy models."""

    async def execute_run(self, agency_id: str, message: str, context: RunContext) -> RunResult:
        """Full run lifecycle: load → construct → pre-check credits → execute → apply markup."""

    async def execute_run_stream(self, agency_id: str, message: str, context: RunContext) -> AsyncIterator[SSEEvent]:
        """Streaming variant: yields SSE events."""
```

The service reads agency configuration directly from PostgreSQL using read-only SQLAlchemy models (no FK constraints, no Alembic management for Drizzle-owned tables). This avoids an HTTP round-trip to Node.js per run. Mutations (create/update/delete agencies) still go through Node.js tRPC.

Agency objects are instantiated per-request — never reused across concurrent runs. This prevents thread safety issues with agency-swarm's mutable state.

### 4.3 Agency Persistence Hooks

**File:** `python-backend/app/services/agency_persistence.py`

Implements agency-swarm's `load_threads_callback` and `save_threads_callback` backed by PostgreSQL.

```python
def create_persistence_hooks(conversation_id: int) -> tuple[Callable, Callable]:
    """Create load/save callbacks for a specific conversation."""
    # load: SELECT from agency_messages WHERE conversation_id = ? ORDER BY created_at
    # save: INSERT INTO agency_messages (batch)
```

v1.x stores full conversation histories (not just thread IDs). The save callback also handles PII redaction before writing agent-to-agent messages.

### 4.4 Agency Credits

**File:** `python-backend/app/services/agency_credits.py`

Credit flow follows the established per-call gateway deduction pattern (no reservation system needed):

1. **Per-call deduction:** Each agent's LLM call routes through the Node.js gateway, which deducts credits per-call atomically (same as existing chat). No reservation upfront.
2. **Multiplier markup:** At run completion, calculate `(total_gateway_charges * creditMultiplier) - total_gateway_charges` and deduct the markup as a separate transaction with `sourceType: "agency"`.
3. **Failure handling:** If the run fails mid-way, only the LLM calls that actually completed are charged. No refund needed since there was no reservation.

```python
class AgencyCreditManager:
    async def pre_check(self, user_id: int, estimated_cost: float) -> bool:
        """Check user has enough credits for estimated run cost. Does NOT reserve."""

    async def apply_multiplier_markup(self, user_id: int, agency_id: str, total_gateway_cost: float, multiplier: float) -> None:
        """Deduct agency markup at run completion. Called via Node.js credit endpoint."""

    def estimate_run_cost(self, agent_count: int, avg_tokens_per_agent: int, model: str) -> float:
        """Estimate cost for pre-check. Conservative estimate."""
```

This aligns with the existing gateway credit flow and avoids building a new reservation subsystem.

### 4.5 Agency Tool Bridge

**File:** `python-backend/app/services/agency_tools.py`

Bridges SmartSpecPro tools to agency-swarm's `BaseTool` interface.

```python
class SSPToolBridge(BaseTool):
    """Base class for all SmartSpecPro tool bridges."""

    class ToolConfig(BaseModel):
        """Pydantic model for tool configuration."""
        tool_id: str
        risk_level: str  # low / medium / high
        requires_approval: bool

    def run(self) -> str:
        """Execute the tool. Routes to sandbox or direct service based on risk."""
```

**Tool routing by risk level:**
- `low` (search, fetch, library lookup) → Direct HTTP to Python/Node services
- `medium` (external API calls) → Direct HTTP, blocked if not in agency whitelist
- `high` (code execution, file system) → OpenSandbox dispatch, blocked if not in agency whitelist

**PII safety:** Tool bridge does NOT pass PII-containing parameters to tool inputs. Only validated, schema-conforming inputs from the agent's structured output are forwarded.

### 4.6 PII Redaction

**File:** `python-backend/app/services/agency_pii.py`

Redacts PII from agent-to-agent messages before storage. Applied in the persistence hook's save callback.

```python
def redact_pii(content: str) -> tuple[str, bool]:
    """Redact PII patterns (emails, phones, SSN, etc.) from content.
    Returns (redacted_content, was_redacted)."""
```

User-facing final responses are NOT redacted (the user consented to see them). Only inter-agent communication stored in `agency_messages` is redacted.

### 4.7 FastAPI Router

**File:** `python-backend/app/api/agencies.py`

```python
router = APIRouter(prefix="/api/v1/agencies", tags=["agencies"])

# POST /api/v1/agencies/{agency_id}/run — Non-streaming run
# POST /api/v1/agencies/{agency_id}/stream — Streaming run (SSE)
# GET  /api/v1/agencies/{agency_id}/runs — List runs
# GET  /api/v1/agencies/{agency_id}/runs/{run_id} — Run details
# POST /api/v1/agencies/{agency_id}/runs/{run_id}/cancel — Cancel run
```

All endpoints require `Authorization: Bearer {token}` + `Cookie: token={token}` (same pattern as existing LLM executor).

---

## 5. Node.js Integration Layer (Phase 1-2)

### 5.1 tRPC Router

**File:** `apps/web/server/routers/agency.ts`

```typescript
export const agencyRouter = router({
  // CRUD
  list: protectedProcedure.input(...).query(...)
  getById: protectedProcedure.input(...).query(...)
  create: protectedProcedure.input(...).mutation(...)
  update: protectedProcedure.input(...).mutation(...)
  delete: protectedProcedure.input(...).mutation(...)

  // Conversations
  listConversations: protectedProcedure.input(...).query(...)
  createConversation: protectedProcedure.input(...).mutation(...)

  // Runs (delegates to Python)
  sendMessage: protectedProcedure.input(...).mutation(...)

  // Templates
  listTemplates: protectedProcedure.query(...)
  createFromTemplate: protectedProcedure.input(...).mutation(...)

  // Admin
  adminListAgencies: adminProcedure.input(...).query(...)
  adminToggleTenant: adminProcedure.input(...).mutation(...)
  adminKillRun: adminProcedure.input(...).mutation(...)
})
```

**Rate limits:** Agency creation: 10/day per user. Message sending: 60/minute per user. Template creation: 5/day per user.

### 5.2 Agency Bridge

**File:** `apps/web/server/services/agencyBridge.ts`

HTTP bridge between Node.js and Python agency service:

```typescript
class AgencyBridge {
  async executeRun(params: RunParams): Promise<RunResult>
  createStreamProxy(params: RunParams): ReadableStream
  async cancelRun(runId: string): Promise<void>
  async listRuns(agencyId: string, filters: RunFilters): Promise<RunListResult>
}
```

Uses `httpx`-equivalent (`node-fetch`) to call Python's `/api/v1/agencies/` endpoints.

### 5.3 SSE Stream Proxy

**File:** `apps/web/server/_core/agencyStreamProxy.ts`

Express middleware that proxies SSE from Python to the React frontend:

```typescript
// POST /api/v1/agency/stream
// 1. Check feature flag (AGENCY_SWARM_ENABLED)
// 2. Check credits (hasEnoughCredits)
// 3. Reserve credits
// 4. Proxy SSE from Python → client
// 5. On [DONE]: reconcile credits
```

SSE headers follow existing pattern:
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (prevents Nginx from buffering SSE)

**Heartbeat:** Send `: keepalive\n\n` comment every 15 seconds to prevent proxy/load-balancer timeout.

**Nginx configuration:** Add `proxy_buffering off;` to the Nginx location block for `/api/v1/agency/stream` in `nginx/conf.d/dev-host.conf`.

**Client reconnection:** If the SSE connection drops, the client should query `GET /api/v1/agencies/{id}/runs/{runId}` to get run status and replay missed events from the database.

### 5.4 Sandbox FeatureType Addition

Add `"agency"` to the `featureType` enum in `apps/web/server/routers/sandbox.ts`:

```typescript
featureType: z.enum([
  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
  "agency"  // NEW
])
```

### 5.5 CreditSourceType Addition

Add `"agency"` to the `CreditSourceType` union in `apps/web/server/services/creditService.ts`:

```typescript
export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
  | "scheduler" | "admin" | "agency" | "other";
```

Agency LLM calls pass `sourceType: "agency"` through the gateway request headers so credits are properly attributed in analytics.

### 5.6 Internal Multiplier Markup Endpoint

Add a single internal endpoint for Python to charge the agency multiplier markup at run completion:

```typescript
// POST /api/internal/credits/agency-markup
// { userId, agencyId, totalGatewayCost, multiplier }
```

Protected by internal service authentication (not user JWT).

---

## 6. Frontend Architecture (Phase 2-3)

### 6.1 AgencyChat — Split View

**File:** `apps/web/client/src/pages/AgencyChat.tsx`

Layout: Main conversation thread (left 2/3) + collapsible agent activity panel (right 1/3).

**Main thread:**
- User messages and final agent responses
- Agent name badge on each response
- Streaming token display
- Credit usage indicator

**Activity panel (collapsible):**
- Agent-to-agent message bubbles (labeled)
- Tool call indicators (tool name, status, duration)
- Handoff events (from → to, reason)
- Timeline visualization of agent steps
- Expandable/collapsible per-step detail

**SSE consumption:** Use `fetch()` + `ReadableStream` (not `EventSource`, since we need POST). Parse SSE events: `run_started`, `agent_switch`, `token`, `tool_call`, `tool_result`, `run_finished`, `run_error`.

### 6.2 AgencyBuilder — React Flow Canvas

**File:** `apps/web/client/src/pages/AgencyBuilder.tsx`

React Flow / XYFlow-based visual editor for creating and editing agencies.

**Components:**
- `AgentNode` — Custom React Flow node rendering agent card (name, model, tools, entry/optional badges)
- `CommunicationEdge` — Custom edge with flow type label (delegation/handoff) and direction arrow
- `AgentPropertyPanel` — Side panel for editing selected agent's properties (instructions, model, tools, settings)
- `ToolPicker` — Modal/dropdown for selecting tools from tenant's available tools
- `AgencyToolbar` — Top bar with save, publish, test, template actions

**Features:**
- Drag-and-drop agent creation from palette
- Edge creation by dragging between agent nodes
- Auto-layout via dagre/elkjs
- Minimap for navigation
- Undo/redo via React Flow's built-in history
- Canvas position/zoom saved to agency config

### 6.3 AgencyTemplates

**File:** `apps/web/client/src/pages/AgencyTemplates.tsx`

Gallery of 4 starter templates with preview and "Use Template" action:

1. **Research Agency** — CEO → Researcher → Writer
2. **Content Writer Agency** — Editor → Writer → Reviewer
3. **Spec Writer Agency** — PM → Architect → Writer
4. **Code Review Agency** — Reviewer → Tester → Reporter

Each template is stored as a JSON definition in `apps/web/skills/agency-templates/`. Selecting a template clones the definition into a new agency for the user.

### 6.4 Menu Integration

Add agency menu item to `packages/shared/src/constants/menu.ts`:

```typescript
{
  id: 'agencies',
  label: 'Agencies',
  labelTh: 'เอเจนซี่',
  icon: 'Users',
  path: '/agencies',
  platforms: ['web', 'desktop'],
  group: 'main',
  sortOrder: 3.7,
  requiresFeature: 'AGENCY_SWARM_ENABLED',
}
```

### 6.5 Routing

Add to `apps/web/client/src/App.tsx`:

```typescript
const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
const AgencyChat = lazy(() => import("./pages/AgencyChat"));
const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
const AgencyTemplates = lazy(() => import("./pages/AgencyTemplates"));
```

Routes: `/agencies`, `/agencies/:id`, `/agencies/:id/edit`, `/agencies/templates`.

---

## 7. Error Handling (Phase 2)

### 7.1 Classification

| Error Type | Examples | Action |
|-----------|----------|--------|
| Transient | Timeout, HTTP 429, HTTP 503 | Retry 2-3 times with exponential backoff |
| Permanent | Credit exhaustion, auth failure, validation error | Fail fast, refund reserved credits |
| Optional agent | Non-critical agent fails | Skip agent if marked `isOptional`, continue run |
| Runtime degraded | Python service down, agency-swarm error | Context-dependent fallback (see 7.2) |

### 7.2 Fallback Behavior

| Context | Behavior |
|---------|----------|
| Interactive chat + `isFallbackSafe=true` | Fallback to single-agent chat using entry agent's model/prompt |
| Interactive chat + `isFallbackSafe=false` | Fail closed with error message |
| Async/background job | Queue + retry when service recovers |
| Approval-required/high-risk | Fail closed, never fallback |

### 7.3 Credit Reconciliation on Error

- Transient error (retried and succeeded): Deduct actual cost (includes retry costs)
- Permanent error (run failed): Refund full reserved amount
- Partial completion (optional agent skipped): Deduct actual cost for completed steps, refund remainder

---

## 8. Admin Controls & Approval Gates (Phase 4)

### 8.1 Tenant-Level Controls

Admin panel section in `apps/web/client/src/components/admin/`:

- **Enable/disable** agency feature per tenant (feature flag override)
- **Quotas:** Max agencies per tenant, max concurrent runs, max credit reserve per run
- **Kill switch:** Immediately cancel all running agency runs for a tenant
- **Tool whitelist:** Restrict which tools are available to agencies in this tenant

### 8.2 Tool Whitelists

Pre-configured whitelist system (runtime pause/resume approval deferred to future release):

1. **Pre-configured whitelist** — Admin sets allowed tools per agency at creation time in AgencyBuilder. Tools not in the whitelist are blocked at the tool bridge level before execution.

2. **Tool risk enforcement** — Tools with `riskLevel: "high"` require explicit opt-in in the agency configuration. If an agent tries to call a high-risk tool not whitelisted, the tool bridge returns an error message to the agent (not a run failure — the agent can try an alternative approach).

3. **Credit spend limit** — Each agency has a `maxRunTimeSeconds` and an implicit max credit spend (derived from timeout * model cost). Runs exceeding this are terminated.

**Deferred:** Runtime approval gates with pause/resume semantics require a checkpoint/resume mechanism that agency-swarm does not natively support. This is deferred to a future release where it can be properly architected (similar to LangGraph's `interrupt()` pattern).

---

## 9. Observability (Phase 4)

### 9.1 Metrics

| Metric | Collection | Alert Threshold |
|--------|-----------|----------------|
| Run success rate | Per agency, per template | < 90% over 1 hour |
| Run p95 latency | Per agency, per template | > 60s |
| Step failure rate | Per agent within run | > 10% per hour |
| Retry count | Per run | > 5 retries in single run |
| Credit reconciliation mismatch | Per run | > $1 difference |

### 9.2 Audit Logging

All agency events logged via existing `auditLogger`:
- `agency_created`, `agency_updated`, `agency_deleted`
- `agency_run_started`, `agency_run_completed`, `agency_run_failed`
- `agency_credit_reserved`, `agency_credit_deducted`, `agency_credit_refunded`
- `agency_approval_requested`, `agency_approval_granted`, `agency_approval_denied`
- `agency_tool_called`, `agency_tool_failed`

### 9.3 Data Retention

- **Hot (0-7 days):** Agency messages and runs queryable at full speed
- **Cold (8-30 days):** Archived, queryable but slower
- **Purge (30+ days):** Deleted (configurable per-tenant override)

Archival runs as a scheduled job (BullMQ) that moves old records and cleans up.

---

## 10. Integration Points (Phase 3)

### 10.1 Workflow Node

Register `agency_run` as a new node type in `NodeRegistry`:

```python
NodeTypeSpec(
    type="agency_run",
    display_name="Agency Run",
    description="Execute a multi-agent agency",
    icon="Users",
    color="purple",
    category="ai",
    executor="app.orchestrator.node_executors.agency_executor.AgencyExecutor",
)
```

The `AgencyExecutor` loads agency config, runs the agency with the workflow input, and returns the result as the node output.

### 10.2 Skill Auto-Trigger

Extend skill detection to recognize agency triggers. When a chat message matches an agency's trigger pattern, the system offers to run the agency instead of a single skill.

Detection logic added to `packages/skills/src/detector.ts` — check agency definitions alongside skill definitions.

---

## 11. Impact and Regression Map

### 11.1 Affected Systems

| System | Impact | Risk |
|--------|--------|------|
| Python backend (all routers) | Python 3.12 + pydantic 2.11 upgrade | Medium — covered by existing test suite |
| LLM proxy | openai v2 upgrade | Medium — core chat.completions API unchanged |
| Credit service | New reserve/reconcile endpoints | Low — additive, existing deduction unchanged |
| Sandbox router | New "agency" featureType | Low — additive enum value |
| Menu system | New menu item | Low — conditional on feature flag |
| Frontend routing | New routes | Low — lazy-loaded, no impact on existing |

### 11.2 Regression Prevention

- All dependency upgrades validated by existing test suite before agency code begins
- Feature flags gate all agency features — can be disabled without code revert
- Contract tests added for: Python 3.12 compatibility, openai v2 type changes, pydantic 2.11 deprecations
- Integration tests for credit reserve/reconcile flow
- E2E test for basic agency chat flow

---

## 12. Data Safety and Migration Strategy

### 12.1 Risk Classification

| Operation | Risk | Mitigation |
|-----------|------|-----------|
| Add 5 new Drizzle tables | None (additive) | Standard `drizzle-kit generate && migrate` |
| Add 2 new SQLAlchemy tables | None (additive) | Alembic `revision --autogenerate && upgrade head` |
| Python 3.12 upgrade | Low | No schema changes, only runtime |
| openai v2 upgrade | Low | No data format changes |
| pydantic 2.11 upgrade | Low | Validation behavior changes — test coverage mitigates |

All schema changes are **additive** (new tables only). No existing tables are modified. No columns are renamed, dropped, or type-changed. No data migration is needed.

Backup is not required for this scope since no existing data is at risk. However, standard backup protocol should be followed before running `drizzle-kit migrate` per CLAUDE.md.

### 12.2 Migration Sequence

1. Create Drizzle schema additions in `apps/web/drizzle/schema.ts`
2. Run `drizzle-kit generate` → produces migration SQL
3. Run `drizzle-kit migrate` → creates 5 new tables
4. Create Alembic revision for 2 Python tables
5. Run `alembic upgrade head` → creates 2 more tables
6. Verify all 7 tables exist with correct schema

---

## 13. Backward Compatibility

### 13.1 No Breaking Changes

This feature is entirely additive:
- New database tables (no modifications to existing)
- New API endpoints (no changes to existing)
- New frontend routes (no changes to existing)
- New menu item (hidden by feature flag)

### 13.2 Dependency Upgrades

The Python dependency upgrades (3.12, openai v2, pydantic 2.11) could affect existing code:
- **Python 3.12:** Minor stdlib changes. Tested by existing suite.
- **openai v2:** `chat.completions` API unchanged. Only new `responses` API added.
- **pydantic 2.11:** Instance `.model_fields` deprecated with warning (not removed until v3.0). Existing code continues to work with deprecation warnings.

### 13.3 External Integrations

No existing external URLs, APIs, or integrations are affected. The new agency endpoints are additional, not replacements.

---

## 14. Post-Change Validation

### 14.1 Acceptance Criteria

| Check | Method |
|-------|--------|
| Python 3.12 compatibility | Full pytest suite passes (80% coverage) |
| openai v2 compatibility | Contract tests for LLM proxy |
| pydantic 2.11 compatibility | Grep + fix deprecation warnings, test suite |
| Agency CRUD | tRPC router integration tests |
| Agency run (non-streaming) | Python service integration test |
| Agency run (streaming) | SSE proxy integration test |
| Credit reserve/reconcile | Unit + integration tests |
| AgencyChat UI | Manual test + Playwright E2E |
| AgencyBuilder canvas | Manual test with template creation |
| Feature flags | Toggle flags on/off, verify behavior |

### 14.2 Performance Validation

| Check | Target |
|-------|--------|
| Agency run latency (simple 2-agent) | < 10s |
| SSE streaming first-token latency | < 2s |
| Concurrent run capacity | 50 simultaneous runs |
| AgencyBuilder canvas FPS | > 30fps with 10 agents |

---

## 15. Rollout Plan

### 15.1 Staged Rollout

1. **Internal testing (1 week):** All flags enabled for dev team. Monitor error rates, credit reconciliation, latency.
2. **Beta tenants (1 week):** Enable for 3-5 selected tenants. Collect feedback, monitor SLOs.
3. **General availability:** Enable for all tenants. Progressive enablement via admin panel.

### 15.2 Rollback Path

- **Feature flags:** Disable `AGENCY_SWARM_ENABLED` — all agency features hidden, no code revert needed
- **openai v2 issues:** Agency features disabled via flag. Existing code unaffected (chat.completions unchanged).
- **Python 3.12 issues:** Revert Dockerfile to 3.11, rebuild container. (This is why contract tests run first.)

---

## 16. Directory Structure

```
python-backend/app/
├── api/
│   └── agencies.py                    # FastAPI router
├── services/
│   ├── agency_swarm_adapter.py        # Version-isolated agency-swarm wrapper
│   ├── agency_service.py              # Agency lifecycle management
│   ├── agency_tools.py                # SSPToolBridge + tool resolution
│   ├── agency_credits.py              # Reserve/reconcile credit flows
│   ├── agency_persistence.py          # Thread persistence hooks
│   └── agency_pii.py                  # PII redaction
├── models/
│   └── agency.py                      # SQLAlchemy models (messages, runs)
└── tests/
    ├── unit/
    │   ├── test_agency_adapter.py
    │   ├── test_agency_credits.py
    │   ├── test_agency_pii.py
    │   └── test_agency_tools.py
    └── integration/
        ├── test_agency_service.py
        └── test_agency_streaming.py

apps/web/
├── drizzle/schema.ts                  # 5 new table definitions
├── server/
│   ├── routers/agency.ts              # tRPC router
│   ├── services/agencyBridge.ts       # HTTP bridge to Python
│   └── _core/agencyStreamProxy.ts     # SSE proxy
└── client/src/
    ├── pages/
    │   ├── AgencyBrowser.tsx           # List/gallery
    │   ├── AgencyChat.tsx              # Split-view chat
    │   ├── AgencyBuilder.tsx           # React Flow canvas
    │   └── AgencyTemplates.tsx         # Template gallery
    ├── components/agency/
    │   ├── AgentNode.tsx               # React Flow custom node
    │   ├── CommunicationEdge.tsx       # React Flow custom edge
    │   ├── AgentPropertyPanel.tsx      # Agent config panel
    │   ├── AgencyActivityPanel.tsx     # Agent activity side panel
    │   └── ToolPicker.tsx              # Tool selection UI
    └── hooks/
        ├── useAgencyStream.ts          # SSE stream hook
        └── useAgencyQuery.ts           # tRPC query hooks
```

---

## 17. Testing Strategy

### 17.1 Python Unit Tests

- **Mock agency-swarm classes:** `Agency`, `Agent`, `StreamingRunResponse` are mocked. No real LLM calls.
- **Test adapter:** Verify `AgencySwarmAdapter` correctly constructs agents with gateway-routed models.
- **Test credit manager:** Verify pre-check, multiplier markup calculation, and failure handling.
- **Test PII redactor:** Verify patterns match emails, phones, SSNs. Verify structured data (JSON, URLs) is NOT corrupted.
- **Test tool bridge:** Verify risk-level routing (low→direct, high→sandbox). Verify whitelist enforcement.
- **Markers:** `@pytest.mark.unit`, `@pytest.mark.agency`

### 17.2 Python Integration Tests

- **Mock Node.js gateway:** In-process HTTP server returning canned LLM responses. Test full agency run lifecycle.
- **Test SSE streaming:** Use FastAPI `TestClient` with streaming response. Verify event format and ordering.
- **Test persistence hooks:** SQLite in-memory DB. Verify conversation save/load round-trip.
- **Test credit flow:** Verify per-call gateway deduction + multiplier markup at completion.
- **Markers:** `@pytest.mark.integration`, `@pytest.mark.agency`

### 17.3 Node.js Tests

- **tRPC router:** Vitest with mocked DB. Test CRUD operations, input validation, rate limiting.
- **Agency bridge:** Mock Python HTTP responses. Test stream proxy, error handling.
- **Credit source type:** Verify "agency" sourceType flows through deduction correctly.

### 17.4 Frontend Tests

- **Component tests:** Vitest + React Testing Library for AgencyChat, AgencyBrowser.
- **React Flow canvas:** Test node creation, edge creation, property panel updates.
- **SSE hook:** Mock fetch response with ReadableStream. Test event parsing and state updates.

### 17.5 Thread Safety Validation (Phase 1)

Run 10 concurrent `Agency.get_response()` calls in a test with different agency configs. Verify no state leakage between runs (agent names, tool configs, conversation history must be isolated).
