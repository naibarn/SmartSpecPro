# Agency-Swarm Integration — Synthesized Specification

> Synthesized from: spec.md (original), claude-research.md (research), claude-interview.md (interview)
> Date: 2026-02-27
> Status: Ready for implementation planning

---

## 1. Overview

Integrate agency-swarm v1.8.0 into SmartSpecPro as a multi-agent orchestration layer. Users build, configure, and run collaborative AI agent "agencies" — teams of specialized LLM agents that coordinate via structured communication flows, shared tools, and persistent conversation state.

### Core Principles

- SmartSpecPro remains the platform (UI, auth, billing, skills, media)
- agency-swarm is the multi-agent coordination layer inside the Python backend
- Existing systems (LLM Gateway, credit system, skill engine, workflows) are extended, not replaced
- All LLM calls route through Node.js gateway via `OpenAIChatCompletionsModel` with custom `base_url`
- Migration is phased with feature flags and staged rollout

---

## 2. Architectural Decisions (from Interview)

### 2.1 Database Ownership: Hybrid

| Owner | Tables | Migration Tool |
|-------|--------|---------------|
| **Node.js (Drizzle)** | agencies, agency_agents, agency_tools, agency_communication_flows, agency_conversations | Drizzle Kit |
| **Python (SQLAlchemy)** | agency_messages, agency_runs | Alembic |

Rationale: Python owns high-write runtime tables for performance; Node.js owns config/session tables for consistency with existing patterns.

### 2.2 Python Upgrade: In-Place to 3.12

Upgrade the entire Python backend from 3.11 to 3.12. Single container, no service split. Requires regression testing of all 50+ existing routers.

### 2.3 OpenAI SDK Upgrade: Feature Flag Rollback

Upgrade `openai` from 1.50.0 to >=2.2.0 globally. Agency features wrapped in feature flags so the upgrade can be reversed if issues arise in existing code paths. Confirmed breaking change: `ResponseFunctionToolCallOutputItem.output` now `string | Array`.

### 2.4 Pydantic Upgrade: 2.7 → 2.11

Required by agency-swarm. Key change: `instance.model_fields` deprecated — must use `ClassName.model_fields`. Performance improvement: up to 2x faster build time.

### 2.5 Abstraction Level: Creation + Execution Wrapping

`AgencySwarmAdapter` wraps Agency/Agent construction and run methods. Raw streaming event types exposed directly for performance. Not a full abstraction of every agency-swarm class.

### 2.6 Credit Model: Reserve + Reconcile

1. Reserve estimated credits upfront before starting agency run
2. Track actual costs during run (each agent LLM call goes through gateway)
3. At completion, deduct actual cost, refund remaining reserved credits
4. Credit multiplier applied per-agency configuration

### 2.7 Tool Routing: Hybrid by Risk

- **Code execution tools** → Route through OpenSandbox (maximum isolation)
- **Data access tools** (search, fetch, library lookup) → Direct HTTP service calls (lower latency)

### 2.8 Error Handling: Context-Dependent

| Error Type | Action |
|-----------|--------|
| Transient (timeout, 429, 503) | Retry 2-3 times with backoff |
| Permanent (credit exhaustion, auth, validation) | Fail fast |
| Optional agent failure | Skip + continue (only if agent marked `optional`) |
| Credits | Deduct actual usage, refund remaining reserved |

### 2.9 Degraded Runtime Fallback: Context-Dependent

| Context | Behavior |
|---------|----------|
| Interactive chat | Fallback to single-agent mode (if template marked `fallback-safe`) |
| Async/background jobs | Queue + retry when service recovers |
| High-risk / approval-required | Fail closed with clear error |

---

## 3. MVP Scope

### 3.1 Integration Channels (v1)

| Channel | Status | Notes |
|---------|--------|-------|
| **Chat UI** | MVP | Multi-agent chat with split view |
| **Workflow Node** | MVP | Agency as workflow node type |
| **Skill Auto-Trigger** | MVP | Agency invocation from existing chat |
| Scheduled Messages | Deferred | Phase 2+ |
| OpenAI-Compatible API | Deferred | Phase 2+ |
| MCP Server | Deferred | Phase 3+ |
| Webhooks | Deferred | Phase 3+ |
| Desktop App (Tauri) | Deferred | Phase 3+ |

### 3.2 Sharing Model (v1)

**Tenant-level sharing.** Users create and share agencies within their tenant/organization. Full public marketplace deferred to later release.

### 3.3 Starter Templates (v1)

1. **Research Agency** — Web search + summarize (CEO + Researcher + Writer)
2. **Content Writer Agency** — Draft + review + publish (Editor + Writer + Reviewer)
3. **Spec Writer Agency** — Requirements + design (PM + Architect + Writer)
4. **Code Review Agency** — Analyze + suggest + test (Reviewer + Tester + Reporter)

---

## 4. Frontend Architecture

### 4.1 AgencyBuilder — Full Canvas (React Flow)

Purpose-built graph editor using React Flow / XYFlow:
- Node-based agent visualization with property panels
- Edge-based communication flow definition (directional)
- Drag-and-drop agent creation with tool configuration
- Template gallery for quick-start
- Minimap, auto-layout, edge routing

### 4.2 AgencyChat — Split View

Main conversation thread + collapsible agent activity panel:
- **Main thread**: User messages and final agent responses
- **Activity panel**: Agent-to-agent messages, tool calls, handoff events
- Agent name badges and icons for visual identification
- Real-time SSE streaming with per-agent token display

### 4.3 Routes (Wouter + Lazy)

```
/agencies           → AgencyBrowser (list/gallery)
/agencies/:id       → AgencyChat (split view)
/agencies/:id/edit  → AgencyBuilder (React Flow canvas)
/agencies/templates → AgencyTemplates (template gallery)
```

---

## 5. Backend Architecture

### 5.1 Python Service Layer

```
python-backend/app/services/
├── agency_swarm_adapter.py    # Single abstraction for agency-swarm imports
├── agency_service.py          # Agency CRUD + lifecycle management
├── agency_tools.py            # SSPToolBridge + tool resolution
├── agency_credits.py          # Reserve/reconcile credit flows
└── agency_persistence.py      # PersistenceHooks → PostgreSQL
```

**AgencySwarmAdapter** (version isolation):
- Wraps Agency/Agent construction
- Wraps `get_response()` and `get_response_stream()`
- Exposes raw streaming event types
- Single point for version-specific adjustments

### 5.2 Node.js Integration Layer

```
apps/web/server/
├── routers/agency.ts          # tRPC router (CRUD, run, stream)
├── services/agencyBridge.ts   # HTTP bridge to Python agency service
└── _core/agencyStreamProxy.ts # SSE proxy for streaming runs
```

### 5.3 Streaming Pipeline

```
agency-swarm (Python)
  → StreamingRunResponse events
    → FastAPI StreamingResponse (SSE)
      → Node.js Express proxy (passthrough)
        → React fetch + ReadableStream
```

SSE Event Types:
- `run_started` — Run ID, agency name
- `agent_switch` — From/to agent, reason
- `token` — Agent name, delta text, message ID
- `tool_call` — Agent, tool name, arguments
- `tool_result` — Tool output summary
- `run_finished` — Final output, usage stats, credits used
- `run_error` — Error type, message, affected agent

### 5.4 LLM Routing (Option B: Node.js Gateway)

```python
from openai import AsyncOpenAI
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel

client = AsyncOpenAI(
    api_key="internal-service-key",
    base_url=f"{NODEJS_INTERNAL_URL}/api/llm/v2",
)
model = OpenAIChatCompletionsModel(model=user_selected_model, openai_client=client)
agent = Agent(name="MyAgent", model=model)
```

All LLM calls route through Node.js gateway for:
- Credit pre-flight check
- Model → Provider mapping
- Provider health circuit breaker
- Cost calculation and credit deduction

---

## 6. Database Schema

### 6.1 Node.js Tables (Drizzle)

**agencies** — Core agency definitions
- id, tenantId, slug, name, description, systemPrompt
- creditMultiplier, maxAgents, isPublished, isFallbackSafe
- status (draft | published | archived)
- createdBy, createdAt, updatedAt

**agency_agents** — Agent definitions within agencies
- id, agencyId, name, description, instructions, model
- isEntryPoint, isOptional, position (for canvas layout)
- tools (JSON array of tool references)
- modelSettings (JSON: max_tokens, temperature, etc.)

**agency_tools** — Tool registrations
- id, tenantId, name, toolType (builtin | skill | sandbox | custom)
- config (JSON), riskLevel (low | medium | high)
- requiresApproval (boolean)

**agency_communication_flows** — Agent-to-agent flow definitions
- id, agencyId, fromAgentId, toAgentId
- flowType (delegation | handoff)

**agency_conversations** — Chat sessions
- id, agencyId, userId, title
- totalCreditsUsed, messageCount
- createdAt, updatedAt

### 6.2 Python Tables (SQLAlchemy)

**agency_messages** — Individual messages in conversations
- id, conversationId, agentName, role
- content, inputTokens, outputTokens, creditsUsed
- toolCalls (JSON), parentMessageId
- piiRedacted (boolean)
- createdAt

**agency_runs** — Execution tracking
- id, conversationId, userId, agencyId
- status (queued | running | completed | failed | cancelled)
- reservedCredits, actualCredits, refundedCredits
- startedAt, completedAt, durationMs
- errorType, errorMessage
- stepCount, retryCount
- metadata (JSON: agent trace, tool calls, etc.)

---

## 7. Admin Controls

### 7.1 Tenant-Level Controls

- Enable/disable agency feature per tenant
- Per-tenant agency quota (max agencies per tenant)
- Per-tenant concurrent run limit
- Max credit reserve per run
- Kill switch — immediately terminate all runs for a tenant
- Allowed tools whitelist per tenant

### 7.2 Approval Gates

- **Pre-configured whitelist**: Admin sets allowed tools per agency at creation time
- **Runtime approval**: System pauses and asks user/admin before any high-risk action not in whitelist
- **High-risk triggers**: Sandbox code execution, external API calls, credit spend above threshold

---

## 8. Performance Targets

| Metric | Target |
|--------|--------|
| Max concurrent agency runs | 50 |
| Max agents per run | 10 |
| Run timeout | 10 minutes |
| Token streaming latency (p95) | < 500ms |
| Queue backpressure | BullMQ with configurable limits |

---

## 9. Observability & SLOs

| Metric | SLO |
|--------|-----|
| Run success rate | > 95% |
| p95 run latency | < 30s for simple agencies |
| Step failure rate | < 5% per run |
| Credit reconciliation mismatch | < 0.1% |

**Monitoring:**
- Run success/failure rates per agency template
- p95 latency per agent step
- Retry counts and retry success rates
- Credit reservation vs. actual reconciliation
- Alert on credit mismatch > $1

**Audit Logging:**
- Every run: start, steps, tool calls, completions, errors
- Every credit transaction: reserve, deduct, refund
- Every approval gate trigger and resolution

---

## 10. Security & Compliance

### 10.1 PII Redaction

**Before storage** — PII is redacted from all agent-to-agent activity messages before persisting to `agency_messages`. User-facing final responses are stored as-is (user consented to see them).

### 10.2 Tenant Isolation

- All tables have `tenantId` FK
- All queries filter by tenant
- Agency definitions, tools, and conversations are tenant-scoped
- No cross-tenant data access

### 10.3 Data Retention

- **Hot storage**: Last 7 days of conversation history
- **Cold storage/archive**: 8-30 days (queryable but slower)
- **Purge**: After 30 days (configurable per-tenant override)
- Tenant admins can configure retention override

---

## 11. Rollout Strategy

### 11.1 Feature Flags

- `AGENCY_SWARM_ENABLED` — Master toggle
- `AGENCY_BUILDER_ENABLED` — Canvas builder UI
- `AGENCY_TEMPLATES_ENABLED` — Starter templates
- `AGENCY_WORKFLOW_NODE_ENABLED` — Workflow integration
- `AGENCY_SKILL_TRIGGER_ENABLED` — Skill auto-trigger

### 11.2 Staged Rollout

1. **Internal testing** — Dev team only, all flags enabled
2. **Beta tenants** — Selected tenants with monitoring
3. **General availability** — All tenants, progressive enablement

### 11.3 Rollback Path

- Feature flags disable agency features without reverting code
- OpenAI SDK v2 issues: disable agency features, existing code continues on v2 (chat.completions API unchanged)
- Python 3.12 issues: contract tests catch regressions before deployment

---

## 12. Dependencies & Upgrade Plan

| Package | Current | Required | Breaking Changes |
|---------|---------|----------|-----------------|
| Python | 3.11 | >= 3.12 | Minor syntax/stdlib changes |
| openai | 1.50.0 | >= 2.2.0 | `.output` type change, Responses API emphasis |
| pydantic | >= 2.7.4 | >= 2.11 | `instance.model_fields` deprecated |
| agency-swarm | N/A | 1.8.0 | New dependency |
| openai-agents | N/A | 0.9.3 | Transitive via agency-swarm |

### Upgrade Sequence

1. Upgrade Python 3.11 → 3.12 in Dockerfile
2. Upgrade pydantic to >= 2.11, fix deprecation warnings
3. Upgrade openai to >= 2.2.0, fix `.output` type issues
4. Install agency-swarm 1.8.0
5. Run full test suite with contract tests
6. Deploy behind feature flags

---

## 13. Implementation Phases

### Phase 0: Pre-Validation (Week 0)

- Python 3.12 upgrade + regression tests
- openai SDK v2 upgrade + contract tests
- pydantic 2.11 upgrade + deprecation fixes
- Feature flag infrastructure

### Phase 1: Foundation (Weeks 1-2)

- Database schema (Drizzle + SQLAlchemy)
- AgencySwarmAdapter (version isolation)
- Agency service layer (CRUD, persistence hooks)
- Credit reserve/reconcile flow
- tRPC router (basic CRUD)
- Basic agency chat UI (no builder yet)

### Phase 2: Tools & Streaming (Weeks 3-4)

- SSPToolBridge (skill → BaseTool adapter)
- Tool routing (sandbox vs. direct)
- SSE streaming pipeline (Python → Node → React)
- Split-view chat UI with agent activity panel
- Error handling (retry/fail/skip logic)
- PII redaction pipeline

### Phase 3: Visual Builder & Templates (Weeks 5-6)

- React Flow AgencyBuilder canvas
- Communication flow editor (drag edges)
- Agent property panels
- 4 starter templates
- Workflow node integration
- Skill auto-trigger integration

### Phase 4: Admin & Production (Weeks 7-8)

- Admin controls panel (tenant quotas, kill switch, tool whitelist)
- Approval gates (whitelist + runtime)
- Observability dashboards (SLOs, alerts)
- Time-based archival system
- Degraded runtime fallback
- Staged rollout execution (internal → beta → GA)
