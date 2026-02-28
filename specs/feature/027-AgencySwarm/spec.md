# SmartSpecPro + Agency-Swarm Integration Specification

Version: 1.0
Date: 2026-02-27
Status: Proposed — Feasibility Validated Against Codebase
Based on: agency-swarm v1.8.0 (Feb 25, 2026)

---

## 1. Executive Summary

This specification defines how to integrate [agency-swarm](https://github.com/VRSEN/agency-swarm) (v1.8.0) into SmartSpecPro as a multi-agent orchestration layer. The integration enables users to build, configure, and run collaborative AI agent "agencies" that coordinate multiple specialized LLM agents with structured communication flows, shared tools, and persistent conversation state.

### Key Principles

- SmartSpecPro remains the platform (UI, auth, billing, skills, media)
- agency-swarm becomes the **multi-agent coordination layer** inside the Python backend
- Existing systems (LLM Gateway, credit system, skill engine, workflows) are **extended, not replaced**
- Agents use SmartSpecPro's LLM providers via `OpenAIChatCompletionsModel` routed through Node.js gateway — no direct OpenAI dependency for end users (see Section 10.1, Decision #6)
- Migration is phased — chat integration first, then workflow nodes, then full UI builder

### Feasibility Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| **Python version** | **DECIDED: Upgrade entire backend to 3.12** | agency-swarm requires Python >= 3.12; upgrade whole backend (not separate service) |
| **Pydantic compatibility** | Requires verification | agency-swarm needs Pydantic >= 2.11; current is >= 2.7.4 |
| **LLM provider routing** | Compatible | `LitellmModel` supports all SmartSpecPro providers (OpenAI, Anthropic, Google, Groq, OpenRouter) |
| **Async support** | Compatible | agency-swarm v1.x is async-first; aligns with FastAPI backend |
| **Multi-tenancy** | Compatible | `user_context` dict + factory pattern supports per-tenant isolation |
| **Credit system** | Needs adapter | agency-swarm has built-in cost tracking (v1.6.0+); needs bridge to SmartSpecPro credits |
| **Persistence** | Compatible | Callback-based thread persistence maps to PostgreSQL |
| **Streaming** | Compatible | `StreamingRunResponse` is SSE-compatible |
| **Existing orchestrator** | Complementary | LangGraph handles workflows; agency-swarm handles multi-agent conversations |
| **OpenSandbox** | Complementary | Agent tools can dispatch sandbox jobs for code execution |

---

## 2. Codebase Alignment Analysis

### 2.1 What Already Exists

| Component | Current State | Files |
|-----------|---------------|-------|
| **Supervisor Agent** | Keyword-based task routing (Kilo/OpenCode) | `python-backend/app/orchestrator/agents/supervisor.py` |
| **Handoff Protocol** | Macro→Micro task delegation with retries | `python-backend/app/orchestrator/agents/handoff_protocol.py` |
| **ISC Multi-Agent** | 7-phase skill creation pipeline | `apps/web/skills/intelligence-skill-creator/isc/orchestrator.py` |
| **LangGraph Runtime** | Workflow execution with checkpointing | `python-backend/app/orchestrator/langgraph_runtime.py` |
| **110+ Node Executors** | LLM, media, data, flow, integration nodes | `python-backend/app/orchestrator/node_executors/` |
| **LLM Gateway** | 8 providers, health circuit breaker, routing | `python-backend/app/llm_proxy/gateway_unified.py` |
| **Provider Registry** | DB-driven, encrypted keys, model mapping | `apps/web/drizzle/schema.ts` (llm_providers, model_provider_map) |
| **Credit System** | Atomic deduction, 1 USD = 1000 credits, audit trail | `apps/web/server/services/creditService.ts` |
| **Skill Engine** | 40+ skills, pattern detection, chaining | `packages/skills/src/detector.ts`, `skillExecutor.ts` |
| **Python Skill Executor** | **MOCKED / TODO** — returns mock data, no real integration | `python-backend/app/orchestrator/node_executors/skill_executor.py` |
| **Sandbox System** | OpenSandbox dispatch, policy enforcement | `docker-compose.opensandbox.yml`, sandbox tables |
| **Conversation Store** | PostgreSQL conversations + messages tables | `apps/web/drizzle/schema.ts` (conversations, messages) |
| **Entity Memory** | Persistent entity extraction across conversations | `apps/web/drizzle/schema.ts` (entityMemories) |

### 2.2 Architecture Gap Analysis

| What agency-swarm Provides | What SmartSpecPro Has | Gap |
|---------------------------|----------------------|-----|
| Multi-agent collaboration (Agency) | Single-agent supervisor pattern | **Major** — need full agency orchestration |
| Directional communication flows | Keyword-based routing only | **Major** — need structured agent-to-agent messaging |
| Tool framework (BaseTool, Pydantic) | Node executors (protocol-based) | **Medium** — need adapter layer |
| Thread persistence (callbacks) | PostgreSQL conversations table | **Small** — implement callbacks → DB |
| MasterContext (shared state) | workflow_state (LangGraph-only) | **Medium** — need cross-agent shared state |
| Guardrails (input/output) | No guardrails on agent output | **Medium** — leverage agency-swarm's guardrails |
| `get_agency_graph()` (ReactFlow JSON) | ReactFlow workflow editor exists | **Small** — reuse existing editor components |
| Built-in FastAPI integration | Existing FastAPI routers | **Small** — add routers, not use built-in server |
| LiteLLM model support | 8 direct providers + OpenRouter | **Small** — configure LiteLLM to use existing keys |
| Cost tracking (v1.6.0+) | Credit system with audit trail | **Medium** — bridge cost events → credit deductions |

### 2.3 What the Original Concept Gets Wrong (Corrections)

| Assumption | Reality | Adaptation |
|-----------|---------|------------|
| agency-swarm uses OpenAI Assistants API | v1.x uses OpenAI Agents SDK + Responses API | Use v1.8.0 patterns only (v0.x docs are outdated) |
| Requires OpenAI API key for all agents | `LitellmModel` allows any provider | Route through SmartSpecPro's existing provider config |
| Agency definitions are static | Agencies can be created dynamically at runtime | Store definitions in DB, instantiate per-request |
| Thread state is file-based | v1.x uses callback-based persistence | Implement PostgreSQL callbacks |
| agency-swarm replaces existing orchestrator | It complements LangGraph for different use cases | Workflows = LangGraph; Multi-agent chat = agency-swarm |
| Single Python version sufficient | Requires Python >= 3.12 | May need Python version upgrade or isolated service |

---

## 3. Design Goals

1. Enable users to create multi-agent agencies via UI (visual builder or form-based)
2. Route agency conversations through SmartSpecPro's LLM Gateway for unified billing
3. Persist agency conversations in PostgreSQL with full audit trail
4. Support multi-tenancy — each tenant's agencies are isolated
5. Allow agents to use SmartSpecPro skills as tools (bridge skill → BaseTool)
6. Allow agents to dispatch sandbox jobs for code execution
7. Integrate with existing credit system — deduct credits per agent LLM call
8. Support streaming responses for real-time chat UX
9. Provide agency visualization (ReactFlow graph)
10. Enable agency templates for common patterns (customer support, content creation, research)

## 4. Non-Goals

1. Replacing the existing LangGraph workflow engine (they serve different purposes)
2. Running agency-swarm's built-in `run_fastapi()` as a separate server
3. Implementing agency-swarm's CLI tools in production
4. Supporting agency-swarm's file upload/vector store features (use SmartSpecPro's library system instead)
5. Building a custom fork of agency-swarm (maintain upstream compatibility)
6. Exposing raw OpenAI API to end users
7. Supporting agency-swarm v0.x patterns (list-of-lists `agency_chart` removed in v1.7.0)

---

## 5. Target Architecture

### 5.1 System Integration Map

```
SmartSpecPro Platform
├── React Frontend (apps/web/client/)
│   ├── AgencyBuilder.tsx          [NEW] — Visual agency configuration
│   ├── AgencyChat.tsx             [NEW] — Multi-agent chat interface
│   └── AgencyTemplates.tsx        [NEW] — Template gallery
│
├── Node.js Backend (apps/web/server/)
│   ├── routers/agency.ts          [NEW] — tRPC procedures for agency CRUD
│   ├── services/agencyBridge.ts   [NEW] — Node→Python agency dispatch
│   └── services/creditService.ts  [EXTEND] — agency cost → credit deduction
│
├── Python Backend (python-backend/app/)
│   ├── services/agency_swarm_adapter.py [NEW] — SOLE agency-swarm interface (Section 15B)
│   ├── services/agency_service.py [NEW] — Agency lifecycle management
│   ├── services/agency_tools.py   [NEW] — SmartSpecPro tools as BaseTool
│   ├── services/agency_credits.py [NEW] — Cost tracking adapter
│   ├── api/agencies.py            [NEW] — FastAPI endpoints
│   └── models/agency.py           [NEW] — SQLAlchemy models
│
├── Database (Drizzle + Alembic)
│   ├── agencies                   [NEW TABLE]
│   ├── agency_agents              [NEW TABLE]
│   ├── agency_tools               [NEW TABLE]
│   ├── agency_communication_flows [NEW TABLE]
│   ├── agency_conversations       [NEW TABLE]
│   ├── agency_messages            [NEW TABLE]
│   └── agency_runs                [NEW TABLE] — run-level analytics
│
└── agency-swarm (pip dependency)
    └── Used as library, not standalone service
```

### 5.2 Data Flow

```
User Message (React Chat UI)
  ↓
tRPC: agency.sendMessage({ agencyId, message })
  ↓
Node.js agencyBridge.ts
  ├─ Verify user has minimum credits (read-only check, NO reservation)
  └─ POST /api/internal/agency/run → Python Backend
       ↓
Python agency_service.py
  ├─ Load agency definition from DB
  ├─ Instantiate Agency(
  │     agents=[...],
  │     communication_flows=[...],
  │     load_threads_callback=lambda: load_from_pg(conv_id),
  │     save_threads_callback=lambda msgs: save_to_pg(msgs, conv_id),
  │     user_context={"tenant_id": ..., "user_id": ..., "credits_available": ...},
  │  )
  ├─ result = await agency.get_response(message)
  │     ↓
  │   agent-1 (CEO) processes message
  │     ├─ Uses SmartSpecPro tools (image gen, web search, skill invoke)
  │     ├─ Hands off to agent-2 (Developer) via Handoff tool
  │     │   └─ agent-2 uses code execution tool (→ OpenSandbox)
  │     └─ Returns final response
  │     ↓
  ├─ Base LLM credits: already deducted per-call by Node.js gateway (post-hoc)
  ├─ Apply agency markup if creditMultiplier > 1.0 (agency_credits.py)
  ├─ Save conversation to agency_messages
  └─ Return response + cost breakdown
       ↓
Node.js receives response
  ├─ Log agency run to audit trail
  └─ Return to frontend via tRPC
       ↓
React AgencyChat.tsx renders response
```

### 5.3 Streaming Flow

```
User Message
  ↓
tRPC subscription: agency.streamMessage({ agencyId, message })
  ↓
Node.js opens SSE connection to Python
  ↓
Python: stream = agency.get_response_stream(message)
  async for event in stream:
    yield SSE event → Node.js → React
  ↓
React renders tokens in real-time
  (shows which agent is currently processing)
```

---

## 6. Database Schema

### 6.1 New Tables (Drizzle — apps/web/drizzle/schema.ts)

```typescript
// Agency execution mode enum
export const agencyExecutionModeEnum = pgEnum("agency_execution_mode", [
  "sync",        // Blocking response
  "streaming",   // SSE streaming
  "async",       // Celery background task
]);

/**
 * Agencies — Top-level multi-agent configurations.
 * Each agency is a named collection of agents with communication rules.
 */
export const agencies = pgTable("agencies", {
  id: varchar("id", { length: 36 }).primaryKey(),  // UUID
  tenantId: varchar("tenantId", { length: 36 }).notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdBy: integer("createdBy").notNull()
    .references(() => users.id),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }).default("users"),

  // Configuration
  sharedInstructions: text("sharedInstructions"),  // Markdown manifesto
  executionMode: agencyExecutionModeEnum("executionMode").default("streaming").notNull(),
  maxTurnsPerMessage: integer("maxTurnsPerMessage").default(25).notNull(),
  maxTokensPerTurn: integer("maxTokensPerTurn").default(4096),
  defaultModel: varchar("defaultModel", { length: 128 }),
  defaultTemperature: numeric("defaultTemperature", { precision: 3, scale: 2 }).default("0.3"),

  // Billing
  creditMultiplier: numeric("creditMultiplier", { precision: 5, scale: 2 }).default("1.0"),
  estimatedCostPerMessage: numeric("estimatedCostPerMessage", { precision: 10, scale: 4 }),

  // Template
  templateSlug: varchar("templateSlug", { length: 100 }),  // If created from template

  // Status
  isEnabled: boolean("isEnabled").default(true).notNull(),
  isPublic: boolean("isPublic").default(false).notNull(),  // Marketplace visibility

  // Metadata
  configJson: jsonb("configJson").$type<{
    userContextDefaults?: Record<string, unknown>;
    guardrailConfig?: Record<string, unknown>;
    [key: string]: unknown;
  }>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agencies_tenant_slug_idx").on(t.tenantId, t.slug),
  index("agencies_tenant_idx").on(t.tenantId),
  index("agencies_created_by_idx").on(t.createdBy),
]);

/**
 * Agency Agents — Individual agents within an agency.
 * Maps to agency-swarm Agent() constructor parameters.
 */
export const agencyAgents = pgTable("agency_agents", {
  id: serial("id").primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),
  role: varchar("role", { length: 100 }),  // e.g., "CEO", "Developer", "Researcher"

  // LLM Configuration
  model: varchar("model", { length: 128 }),  // Overrides agency default
  temperature: numeric("temperature", { precision: 3, scale: 2 }),
  maxCompletionTokens: integer("maxCompletionTokens"),

  // Instructions
  instructions: text("instructions"),  // System prompt (markdown)

  // Entry point
  isEntryPoint: boolean("isEntryPoint").default(false).notNull(),

  // Guardrails (JSON arrays of guardrail configs)
  inputGuardrailsJson: jsonb("inputGuardrailsJson").$type<Array<{
    type: string;
    statement?: string;
    config?: Record<string, unknown>;
  }>>(),
  outputGuardrailsJson: jsonb("outputGuardrailsJson").$type<Array<{
    type: string;
    statement?: string;
    config?: Record<string, unknown>;
  }>>(),

  // Structured output
  outputTypeJson: jsonb("outputTypeJson").$type<Record<string, unknown>>(),

  // Conversation starters
  conversationStarters: json("conversationStarters").$type<string[]>(),

  // Display
  avatar: varchar("avatar", { length: 512 }),  // URL or icon identifier
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agency_agents_agency_slug_idx").on(t.agencyId, t.slug),
  index("agency_agents_agency_idx").on(t.agencyId),
]);

/**
 * Agency Tools — Tools available to specific agents.
 * Maps to agency-swarm BaseTool or function_tool definitions.
 */
export const agencyTools = pgTable("agency_tools", {
  id: serial("id").primaryKey(),
  agentId: integer("agentId").notNull()
    .references(() => agencyAgents.id, { onDelete: "cascade" }),

  // Tool identity
  name: varchar("name", { length: 255 }).notNull(),
  toolType: varchar("toolType", { length: 50 }).notNull(),
  // Types: "builtin" (agency-swarm), "skill" (SmartSpecPro skill),
  //        "sandbox" (OpenSandbox), "http" (API call), "custom" (user-defined)

  // For skill-based tools: reference to skills table
  skillId: integer("skillId").references(() => skills.id),

  // For sandbox-based tools: reference to sandbox profile
  sandboxProfileSlug: varchar("sandboxProfileSlug", { length: 64 }),

  // Tool configuration (JSON Schema for inputs)
  configJson: jsonb("configJson").$type<{
    inputSchema?: Record<string, unknown>;
    description?: string;
    strict?: boolean;
    oneCallAtATime?: boolean;
    [key: string]: unknown;
  }>(),

  isEnabled: boolean("isEnabled").default(true).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Agency Communication Flows — Defines which agents can talk to each other.
 * Maps to agency-swarm's `>` operator communication_flows.
 */
export const agencyCommunicationFlows = pgTable("agency_communication_flows", {
  id: serial("id").primaryKey(),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),

  // Source agent (initiator)
  fromAgentId: integer("fromAgentId").notNull()
    .references(() => agencyAgents.id, { onDelete: "cascade" }),

  // Target agent (receiver)
  toAgentId: integer("toAgentId").notNull()
    .references(() => agencyAgents.id, { onDelete: "cascade" }),

  // Optional: custom handoff tool class name
  handoffToolClass: varchar("handoffToolClass", { length: 255 }),

  // Message validation rules (optional)
  validationRulesJson: jsonb("validationRulesJson").$type<{
    statement?: string;  // LLM validator statement
    maxLength?: number;
    requiredFields?: string[];
  }>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("agency_flows_unique_idx").on(t.agencyId, t.fromAgentId, t.toAgentId),
  index("agency_flows_agency_idx").on(t.agencyId),
]);

/**
 * Agency Conversations — Conversation sessions for agency interactions.
 * Links agency execution to SmartSpecPro's conversation system.
 */
export const agencyConversations = pgTable("agency_conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),  // UUID
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull()
    .references(() => users.id),
  tenantId: varchar("tenantId", { length: 36 }).notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  // Link to main conversations table (optional, for unified history)
  conversationId: integer("conversationId")
    .references(() => conversations.id),

  // Thread state (agency-swarm thread data, serialized)
  threadStateJson: jsonb("threadStateJson").$type<Record<string, unknown>>(),

  // Current active agent (for UI display)
  activeAgentSlug: varchar("activeAgentSlug", { length: 100 }),

  // Accumulated cost
  totalCostUsd: numeric("totalCostUsd", { precision: 12, scale: 6 }).default("0"),
  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 2 }).default("0"),
  messageCount: integer("messageCount").default(0).notNull(),

  // Status
  status: varchar("status", { length: 20 }).default("active").notNull(),
  // active, paused, completed, error

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_conv_agency_idx").on(t.agencyId),
  index("agency_conv_user_idx").on(t.userId),
  index("agency_conv_tenant_idx").on(t.tenantId),
]);

/**
 * Agency Messages — Individual messages in agency conversations.
 * Tracks which agent sent/received each message for multi-agent visibility.
 */
export const agencyMessages = pgTable("agency_messages", {
  id: serial("id").primaryKey(),
  conversationId: varchar("conversationId", { length: 36 }).notNull()
    .references(() => agencyConversations.id, { onDelete: "cascade" }),

  // Who sent this message
  role: varchar("role", { length: 20 }).notNull(),
  // "user", "agent", "system", "tool_call", "tool_result", "handoff"

  // Which agent (null for user messages)
  agentSlug: varchar("agentSlug", { length: 100 }),

  // Content
  content: text("content").notNull(),

  // For tool calls
  toolName: varchar("toolName", { length: 255 }),
  toolInputJson: jsonb("toolInputJson").$type<Record<string, unknown>>(),
  toolOutputJson: jsonb("toolOutputJson").$type<Record<string, unknown>>(),

  // For handoffs
  handoffFromAgent: varchar("handoffFromAgent", { length: 100 }),
  handoffToAgent: varchar("handoffToAgent", { length: 100 }),

  // Cost tracking
  tokenUsage: jsonb("tokenUsage").$type<{
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model?: string;
    costUsd?: number;
  }>(),

  // Metadata
  metadataJson: jsonb("metadataJson").$type<Record<string, unknown>>(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_msg_conv_idx").on(t.conversationId),
  index("agency_msg_agent_idx").on(t.agentSlug),
  index("agency_msg_created_idx").on(t.createdAt),
]);

/**
 * Agency Runs — Individual execution runs within a conversation.
 * Each user message → agency response cycle is one "run".
 * Provides run-level analytics separate from per-message data.
 */
export const agencyRuns = pgTable("agency_runs", {
  id: varchar("id", { length: 36 }).primaryKey(),  // UUID
  conversationId: varchar("conversationId", { length: 36 }).notNull()
    .references(() => agencyConversations.id, { onDelete: "cascade" }),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull()
    .references(() => users.id),

  // Input
  inputMessage: text("inputMessage").notNull(),

  // Output
  responseText: text("responseText"),
  finalAgentSlug: varchar("finalAgentSlug", { length: 100 }),
  agentsInvolved: json("agentsInvolved").$type<string[]>(),
  handoffCount: integer("handoffCount").default(0).notNull(),

  // Cost tracking (aggregated across all turns in this run)
  totalInputTokens: integer("totalInputTokens").default(0),
  totalOutputTokens: integer("totalOutputTokens").default(0),
  totalTokens: integer("totalTokens").default(0),
  baseCostUsd: numeric("baseCostUsd", { precision: 12, scale: 6 }).default("0"),
  markupCostUsd: numeric("markupCostUsd", { precision: 12, scale: 6 }).default("0"),
  totalCostUsd: numeric("totalCostUsd", { precision: 12, scale: 6 }).default("0"),
  totalCreditsUsed: numeric("totalCreditsUsed", { precision: 12, scale: 2 }).default("0"),

  // Tool usage summary
  toolCallCount: integer("toolCallCount").default(0),
  toolCostCredits: numeric("toolCostCredits", { precision: 12, scale: 2 }).default("0"),

  // Timing
  startedAt: timestamp("startedAt", { withTimezone: true }).notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  durationMs: integer("durationMs"),

  // Status
  status: varchar("status", { length: 20 }).default("running").notNull(),
  // running, completed, error, cancelled
  errorMessage: text("errorMessage"),

  // Source channel (which integration triggered this run)
  sourceChannel: varchar("sourceChannel", { length: 30 }),
  // chat_ui, workflow, skill_trigger, scheduled, openai_api, mcp, webhook, tauri

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agency_runs_conv_idx").on(t.conversationId),
  index("agency_runs_agency_idx").on(t.agencyId),
  index("agency_runs_user_idx").on(t.userId),
  index("agency_runs_status_idx").on(t.status),
  index("agency_runs_created_idx").on(t.createdAt),
]);
```

### 6.2 Python Models (Alembic — python-backend/app/models/)

Corresponding SQLAlchemy 2.0 models that mirror the Drizzle schema for the Python backend to read/write agency data directly.

```python
# python-backend/app/models/agency.py

from sqlalchemy import (
    Column, String, Integer, Text, Boolean, Numeric,
    ForeignKey, DateTime, Index, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Agency(Base):
    __tablename__ = "agencies"

    id = Column(String(36), primary_key=True)
    tenant_id = Column("tenantId", String(36), nullable=False, index=True)
    created_by = Column("createdBy", Integer, nullable=False)

    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False)
    description = Column(Text)
    icon = Column(String(50), default="users")

    shared_instructions = Column("sharedInstructions", Text)
    execution_mode = Column("executionMode", String(20), default="streaming", nullable=False)
    max_turns_per_message = Column("maxTurnsPerMessage", Integer, default=25, nullable=False)
    max_tokens_per_turn = Column("maxTokensPerTurn", Integer, default=4096)
    default_model = Column("defaultModel", String(128))
    default_temperature = Column("defaultTemperature", Numeric(3, 2), default="0.3")

    credit_multiplier = Column("creditMultiplier", Numeric(5, 2), default="1.0")
    estimated_cost_per_message = Column("estimatedCostPerMessage", Numeric(10, 4))

    template_slug = Column("templateSlug", String(100))
    is_enabled = Column("isEnabled", Boolean, default=True, nullable=False)
    is_public = Column("isPublic", Boolean, default=False, nullable=False)
    config_json = Column("configJson", JSONB)

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), server_default=func.now(), nullable=False)

    agents = relationship("AgencyAgent", back_populates="agency", cascade="all, delete-orphan")
    communication_flows = relationship("AgencyCommunicationFlow", back_populates="agency", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("tenantId", "slug", name="agencies_tenant_slug_idx"),
    )


class AgencyAgent(Base):
    __tablename__ = "agency_agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column("agencyId", String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False)
    description = Column(Text)
    role = Column(String(100))

    model = Column(String(128))
    temperature = Column(Numeric(3, 2))
    max_completion_tokens = Column("maxCompletionTokens", Integer)
    instructions = Column(Text)
    is_entry_point = Column("isEntryPoint", Boolean, default=False, nullable=False)

    input_guardrails_json = Column("inputGuardrailsJson", JSONB)
    output_guardrails_json = Column("outputGuardrailsJson", JSONB)
    output_type_json = Column("outputTypeJson", JSONB)
    conversation_starters = Column("conversationStarters", JSONB)

    avatar = Column(String(512))
    sort_order = Column("sortOrder", Integer, default=0, nullable=False)

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), server_default=func.now(), nullable=False)

    agency = relationship("Agency", back_populates="agents")
    tools = relationship("AgencyTool", back_populates="agent", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("agencyId", "slug", name="agency_agents_agency_slug_idx"),
        Index("agency_agents_agency_idx", "agencyId"),
    )


class AgencyTool(Base):
    __tablename__ = "agency_tools"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column("agentId", Integer, ForeignKey("agency_agents.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(255), nullable=False)
    tool_type = Column("toolType", String(50), nullable=False)
    skill_id = Column("skillId", Integer)
    sandbox_profile_slug = Column("sandboxProfileSlug", String(64))
    config_json = Column("configJson", JSONB)
    is_enabled = Column("isEnabled", Boolean, default=True, nullable=False)

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)

    agent = relationship("AgencyAgent", back_populates="tools")


class AgencyCommunicationFlow(Base):
    __tablename__ = "agency_communication_flows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column("agencyId", String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False)
    from_agent_id = Column("fromAgentId", Integer, ForeignKey("agency_agents.id", ondelete="CASCADE"), nullable=False)
    to_agent_id = Column("toAgentId", Integer, ForeignKey("agency_agents.id", ondelete="CASCADE"), nullable=False)
    handoff_tool_class = Column("handoffToolClass", String(255))
    validation_rules_json = Column("validationRulesJson", JSONB)

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)

    agency = relationship("Agency", back_populates="communication_flows")

    __table_args__ = (
        UniqueConstraint("agencyId", "fromAgentId", "toAgentId", name="agency_flows_unique_idx"),
        Index("agency_flows_agency_idx", "agencyId"),
    )


class AgencyConversation(Base):
    __tablename__ = "agency_conversations"

    id = Column(String(36), primary_key=True)
    agency_id = Column("agencyId", String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", Integer, nullable=False)
    tenant_id = Column("tenantId", String(36), nullable=False)
    conversation_id = Column("conversationId", Integer)

    thread_state_json = Column("threadStateJson", JSONB)
    active_agent_slug = Column("activeAgentSlug", String(100))

    total_cost_usd = Column("totalCostUsd", Numeric(12, 6), default=0)
    total_credits_used = Column("totalCreditsUsed", Numeric(12, 2), default=0)
    message_count = Column("messageCount", Integer, default=0, nullable=False)
    status = Column(String(20), default="active", nullable=False)

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), server_default=func.now(), nullable=False)

    messages = relationship("AgencyMessage", back_populates="conversation", cascade="all, delete-orphan")


class AgencyMessage(Base):
    __tablename__ = "agency_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column("conversationId", String(36), ForeignKey("agency_conversations.id", ondelete="CASCADE"), nullable=False)

    role = Column(String(20), nullable=False)
    agent_slug = Column("agentSlug", String(100))
    content = Column(Text, nullable=False)

    tool_name = Column("toolName", String(255))
    tool_input_json = Column("toolInputJson", JSONB)
    tool_output_json = Column("toolOutputJson", JSONB)

    handoff_from_agent = Column("handoffFromAgent", String(100))
    handoff_to_agent = Column("handoffToAgent", String(100))

    token_usage = Column("tokenUsage", JSONB)
    metadata_json = Column("metadataJson", JSONB)

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation = relationship("AgencyConversation", back_populates="messages")


class AgencyRun(Base):
    __tablename__ = "agency_runs"

    id = Column(String(36), primary_key=True)
    conversation_id = Column("conversationId", String(36), ForeignKey("agency_conversations.id", ondelete="CASCADE"), nullable=False)
    agency_id = Column("agencyId", String(36), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", Integer, nullable=False)

    input_message = Column("inputMessage", Text, nullable=False)
    response_text = Column("responseText", Text)
    final_agent_slug = Column("finalAgentSlug", String(100))
    agents_involved = Column("agentsInvolved", JSONB)
    handoff_count = Column("handoffCount", Integer, default=0, nullable=False)

    total_input_tokens = Column("totalInputTokens", Integer, default=0)
    total_output_tokens = Column("totalOutputTokens", Integer, default=0)
    total_tokens = Column("totalTokens", Integer, default=0)
    base_cost_usd = Column("baseCostUsd", Numeric(12, 6), default=0)
    markup_cost_usd = Column("markupCostUsd", Numeric(12, 6), default=0)
    total_cost_usd = Column("totalCostUsd", Numeric(12, 6), default=0)
    total_credits_used = Column("totalCreditsUsed", Numeric(12, 2), default=0)

    tool_call_count = Column("toolCallCount", Integer, default=0)
    tool_cost_credits = Column("toolCostCredits", Numeric(12, 2), default=0)

    started_at = Column("startedAt", DateTime(timezone=True), nullable=False)
    completed_at = Column("completedAt", DateTime(timezone=True))
    duration_ms = Column("durationMs", Integer)

    status = Column(String(20), default="running", nullable=False)
    error_message = Column("errorMessage", Text)
    source_channel = Column("sourceChannel", String(30))

    created_at = Column("createdAt", DateTime(timezone=True), server_default=func.now(), nullable=False)
```

---

## 7. Python Service Layer

### 7.1 Agency Service (`python-backend/app/services/agency_service.py`)

Core service that bridges SmartSpecPro's database-driven agency definitions to agency-swarm runtime objects.

```python
from dataclasses import dataclass, field

@dataclass
class AgencyRunResult:
    """Result of a single agency run (one user message → final response)."""
    response_text: str
    final_agent_name: str
    agents_involved: list[str] = field(default_factory=list)
    handoff_count: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_credits: float = 0.0
    conversation_id: str | None = None
    error: str | None = None

@dataclass
class AgencyStreamEvent:
    """SSE event emitted during streaming agency execution."""
    event_type: str  # "token", "agent_change", "tool_call", "tool_result", "handoff", "done", "error"
    agent_name: str | None = None
    content: str = ""
    metadata: dict = field(default_factory=dict)

# Pseudocode for key methods
class AgencyService:
    async def create_agency_runtime(
        self, agency_id: str, conversation_id: str, user_context: dict
    ) -> Agency:
        """Load agency definition from DB and instantiate agency-swarm Agency."""

    async def run_message(
        self,
        agency_id: str,
        conversation_id: str,
        message: str,
        user_id: int,
        user_context: dict | None = None,
        max_turns_override: int | None = None,
    ) -> AgencyRunResult:
        """Execute a message through an agency, apply markup, save state."""

    async def stream_message(
        self,
        agency_id: str,
        conversation_id: str,
        message: str,
        user_id: int,
        user_context: dict | None = None,
    ) -> AsyncIterator[AgencyStreamEvent]:
        """Stream a message through an agency via SSE."""
```

### 7.2 Tool Bridge (`python-backend/app/services/agency_tools.py`)

Adapts SmartSpecPro's existing capabilities as agency-swarm BaseTool subclasses:

| SmartSpecPro Capability | agency-swarm Tool | Description |
|------------------------|-------------------|-------------|
| Skill execution | `SkillInvokeTool` | Invoke any SmartSpecPro skill by slug |
| Image generation | `ImageGenerationTool` | Generate images via media providers |
| Video generation | `VideoGenerationTool` | Generate videos via media providers |
| OpenSandbox code exec | `SandboxCodeTool` | Execute code in isolated sandbox |
| Library search | `LibrarySearchTool` | Search user's document library (RAG) |
| Web search | `WebSearchTool` | Search the web (built-in) |
| HTTP request | `HttpRequestTool` | Make HTTP API calls |
| File management | `FileManageTool` | Read/write files in user's storage |

### 7.3 Credit Bridge (`python-backend/app/services/agency_credits.py`)

> **Corrected design**: Base LLM credits are deducted automatically by the Node.js gateway
> (see Section 10.1.1). The credit bridge only handles agency-specific **markup** and **tracking**.

```python
class AgencyCreditBridge:
    """
    Handles agency-specific credit operations.

    Base LLM credits: Deducted automatically by Node.js gateway (post-hoc, per-call)
    Tool credits: Deducted by respective Node.js endpoints (skill, media, sandbox)
    Agency markup: Deducted here IF agency.creditMultiplier > 1.0
    """

    async def apply_markup(
        self, agency_id: str, user_id: int, base_credits_used: float
    ) -> float:
        """Apply agency creditMultiplier as additional charge (ADDITIVE, not multiplicative)."""
        agency = await self._get_agency(agency_id)
        multiplier = float(agency.credit_multiplier or "1.0")

        if multiplier <= 1.0:
            return 0.0  # No markup needed

        markup_credits = base_credits_used * (multiplier - 1.0)

        # Deduct markup via internal HTTP endpoint (Decision #9)
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "http://localhost:3000/api/internal/credits/deduct",
                json={
                    "userId": user_id,
                    "amount": markup_credits,
                    "description": f"Agency markup ({multiplier}x) for {agency.name}",
                    "sourceType": "agency_markup",
                    "sourceId": agency_id,
                },
                headers={
                    "Authorization": f"Bearer {self._internal_service_token}",
                    "X-Source": "agency-swarm",
                },
            )
            response.raise_for_status()
        return markup_credits

    async def track_run_cost(
        self, run_result: RunResult, agency_id: str, conversation_id: str, run_id: str
    ) -> dict:
        """Track total run cost in agency_runs table."""
        # Read cost data from agency-swarm's RunResult.usage
        # Write to agency_runs table (run-level analytics)
        # Update agency_conversations.totalCostUsd and totalCreditsUsed (conversation-level rollup)
```

### 7.4 Skill Bridge — Corrected Architecture (CRITICAL)

> **Key Finding**: All skill execution lives in Node.js (`skillExecutor.ts` + `chat.ts` router).
> The Python `skill_executor.py` in the workflow engine is **entirely mocked/TODO** — it returns
> hardcoded data and has no integration with the real skill system. Therefore, agency-swarm tool
> bridges MUST call Node.js endpoints via HTTP, following the same pattern as `LLMExecutor`
> (which calls `http://localhost:3000/api/llm/v2/chat`).

#### 7.4.1 Why Direct Python Invocation Won't Work

The existing skill execution pipeline is tightly coupled to Node.js:

```
Skill Detection (Node.js regex) → Execution Mode Routing (Node.js) → Provider Resolution (Node.js)
     ↓                                    ↓                               ↓
detectSkill()                    executeSkill()                   getProviderForModel()
(skillDetector.ts)               (skillExecutor.ts)               (providerRegistry.ts)
```

Each execution mode has Node.js-specific dependencies:

| Execution Mode | Node.js Dependency | Why Python Can't Do It Directly |
|---------------|-------------------|-------------------------------|
| `llm-only` | `getProviderForModel()` → provider API call | Provider keys stored encrypted in Node.js DB; resolved per-tenant |
| `core-text` | Returns text for Node.js LLM processing | Requires Node.js chat pipeline context |
| `enhance-prompt` | Returns enhanced prompt for Node.js LLM | Requires Node.js prompt enhancement service |
| `python` | `spawn()` subprocess from Node.js | Requires `skills/{id}/python/skill.py` in Node.js filesystem |
| `sandbox-*` | `sandboxDispatch()` → OpenSandbox HTTP | Node.js manages sandbox job lifecycle + credit reservation |
| `image-generation` | `mediaGenerationService.generateImage()` | Python backend Celery tasks, but triggered via Node.js |
| `video-generation` | `mediaGenerationService.generateVideoAsync()` | Async task, client polls via Node.js tRPC |

#### 7.4.2 Corrected Tool Bridge Design

Agency-swarm tools MUST call Node.js via internal HTTP endpoints:

```python
# python-backend/app/services/agency_tools.py

import httpx
from agency_swarm.tools import BaseTool
from pydantic import Field

# Base class for all SmartSpecPro tool bridges
class SSPToolBridge(BaseTool):
    """Base class that routes tool execution through Node.js."""

    _nodejs_base_url: str = "http://localhost:3000"
    _user_token: str = ""  # Set from user_context at instantiation

    async def _call_nodejs(self, endpoint: str, payload: dict) -> dict:
        """HTTP call to Node.js backend (same pattern as LLMExecutor)."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self._nodejs_base_url}{endpoint}",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self._user_token}",
                    "Cookie": f"token={self._user_token}",
                    "Content-Type": "application/json",
                    "X-Source": "agency-swarm",
                },
            )
            response.raise_for_status()
            return response.json()
```

#### 7.4.3 Tool Bridges — Per Execution Mode

**SkillInvokeTool** (for `llm-only`, `core-text`, `enhance-prompt` skills):

```python
class SkillInvokeTool(SSPToolBridge):
    """Invoke a SmartSpecPro skill by slug via Node.js tRPC."""

    skill_slug: str = Field(..., description="Skill slug to invoke")
    prompt: str = Field(..., description="Input prompt for the skill")
    extra_params: dict = Field(default_factory=dict, description="Optional parameters")

    async def run(self) -> str:
        # Calls the tRPC executeSkill procedure via HTTP
        result = await self._call_nodejs(
            "/api/trpc/chat.executeSkill",
            {
                "json": {
                    "skillId": self.skill_slug,
                    "prompt": self.prompt,
                    "extraParams": self.extra_params,
                }
            }
        )
        data = result.get("result", {}).get("data", {})
        if data.get("success"):
            return data.get("message") or data.get("resultUrl") or str(data)
        return f"Skill execution failed: {data.get('error', 'Unknown error')}"
```

**ImageGenerationTool** (for `image-generation` mode):

```python
class ImageGenerationTool(SSPToolBridge):
    """Generate images via Node.js skill executor → media generation service."""

    prompt: str = Field(..., description="Image generation prompt")
    aspect_ratio: str = Field(default="1:1", description="Image aspect ratio")
    quality: str = Field(default="medium", description="Image quality: low, medium, high")
    num_images: int = Field(default=1, description="Number of images (1-4)")

    async def run(self) -> str:
        result = await self._call_nodejs(
            "/api/trpc/chat.executeSkill",
            {
                "json": {
                    "skillId": "image-creator",  # Default image skill slug
                    "prompt": self.prompt,
                    "aspectRatio": self.aspect_ratio,
                    "quality": self.quality,
                    "numImages": self.num_images,
                }
            }
        )
        data = result.get("result", {}).get("data", {})
        if data.get("success"):
            urls = data.get("resultUrls", [data.get("resultUrl")])
            return f"Generated {len(urls)} image(s): {', '.join(urls)}"
        return f"Image generation failed: {data.get('error', 'Unknown error')}"
```

**VideoGenerationTool** (for `video-generation` mode — async):

```python
class VideoGenerationTool(SSPToolBridge):
    """Generate videos — returns task ID for async polling."""

    prompt: str = Field(..., description="Video generation prompt")
    duration: int = Field(default=5, description="Video duration in seconds (1-60)")

    async def run(self) -> str:
        result = await self._call_nodejs(
            "/api/trpc/chat.executeSkill",
            {
                "json": {
                    "skillId": "video-creator",
                    "prompt": self.prompt,
                    "duration": self.duration,
                }
            }
        )
        data = result.get("result", {}).get("data", {})
        if data.get("isAsync") and data.get("taskId"):
            return f"Video generation started. Task ID: {data['taskId']}. Use the task status tool to check progress."
        if data.get("success"):
            return f"Video generated: {data.get('resultUrl')}"
        return f"Video generation failed: {data.get('error', 'Unknown error')}"
```

**SandboxCodeTool** (for `sandbox-*` mode):

> **IMPORTANT**: The sandbox system uses **tRPC** (`sandbox.createJob`) with a **pre-reserve + refund**
> credit model — NOT a REST endpoint. The featureType enum must include `"agency"` (requires schema
> migration to add it to `z.enum(["chat","skill","workflow","library","media","presentation","connector","agency"])`
> in `apps/web/server/routers/sandbox.ts`).

```python
class SandboxCodeTool(SSPToolBridge):
    """Execute code in OpenSandbox via Node.js tRPC sandbox.createJob.

    Credit model: pre-reserve → execute → refund on failure.
    This differs from LLM post-hoc deduction.
    """

    code: str = Field(..., description="Code to execute")
    language: str = Field(default="python", description="Language: python, node, bash")
    execution_mode: str = Field(default="sandbox-code", description="sandbox-code|sandbox-command|sandbox-browser")

    async def run(self) -> str:
        # Step 1: Create sandbox job via tRPC (this pre-reserves credits)
        result = await self._call_nodejs(
            "/api/trpc/sandbox.createJob",
            {
                "json": {
                    "featureType": "agency",
                    "executionMode": self.execution_mode,
                    "inputFiles": [],
                }
            }
        )
        data = result.get("result", {}).get("data", {})
        job_id = data.get("jobId")
        if not job_id:
            return f"Sandbox dispatch failed: {result.get('error', 'Unknown error')}"

        # Step 2: Poll for completion via tRPC sandbox.getJobStatus
        return await self._poll_sandbox_job(job_id)

    async def _poll_sandbox_job(self, job_id: str, max_wait_s: int = 300) -> str:
        """Poll sandbox.getJobStatus until terminal state or timeout."""
        import asyncio
        import time

        deadline = time.monotonic() + max_wait_s
        poll_interval = 2.0  # seconds

        while time.monotonic() < deadline:
            status_result = await self._call_nodejs(
                "/api/trpc/sandbox.getJobStatus",
                {"json": {"jobId": job_id}},
                method="GET",
            )
            data = status_result.get("result", {}).get("data", {})
            is_terminal = data.get("isTerminal", False)

            if is_terminal:
                status = data.get("status", "unknown")
                if status == "completed":
                    artifacts = data.get("artifacts", [])
                    if artifacts:
                        urls = [a.get("url", a.get("key", "")) for a in artifacts]
                        return f"Sandbox job completed. Artifacts:\n" + "\n".join(urls)
                    return "Sandbox job completed (no artifacts)."
                elif status == "failed":
                    return f"Sandbox job failed: {data.get('label', 'Unknown error')}"
                elif status == "cancelled":
                    return "Sandbox job was cancelled."
                else:
                    return f"Sandbox job ended with status: {status}"

            await asyncio.sleep(poll_interval)
            # Exponential backoff: 2s → 4s → 8s → cap at 15s
            poll_interval = min(poll_interval * 2, 15.0)

        return f"Sandbox job {job_id} timed out after {max_wait_s}s. Check status manually."
```

**Required schema migration** — add `"agency"` to sandbox featureType enum:

```typescript
// apps/web/server/routers/sandbox.ts — line 29
featureType: z.enum([
  "chat", "skill", "workflow", "library", "media", "presentation", "connector",
  "agency",  // ← NEW — enables agency tools to dispatch sandbox jobs
]),
```

**Credit flow for sandbox tools** (differs from LLM post-hoc):

```
1. SandboxCodeTool calls sandbox.createJob via tRPC
2. Node.js tRPC handler calls reserveCredits() → pre-reserves estimated cost
3. Node.js dispatches to Python sandbox backend
4. On success: reserved credits are finalized (no refund)
5. On failure: refundReservedCredits() returns credits to user
6. Agency markup (if creditMultiplier > 1.0) applied separately by agency_credits.py
```

**LibrarySearchTool** (RAG — search user's document library):

```python
class LibrarySearchTool(SSPToolBridge):
    """Search user's document library for relevant content (RAG)."""

    query: str = Field(..., description="Search query")
    max_results: int = Field(default=5, description="Max documents to return")

    async def run(self) -> str:
        result = await self._call_nodejs(
            "/api/trpc/library.search",
            {"json": {"query": self.query, "limit": self.max_results}}
        )
        data = result.get("result", {}).get("data", {})
        docs = data.get("documents", [])
        if not docs:
            return "No relevant documents found."
        return "\n\n---\n\n".join(
            f"**{d['title']}** (score: {d.get('score', 'N/A')})\n{d['content'][:500]}"
            for d in docs
        )
```

> **Note**: `WebSearchTool`, `HttpRequestTool`, and `FileManageTool` (listed in Section 7.2) use
> agency-swarm's built-in tools (`ToolFactory.from_name("WebSearchTool")`, etc.) rather than
> `SSPToolBridge` — they don't need Node.js routing. They are assigned as `toolType: "builtin"`
> in the `agency_tools` table and resolved via `ToolFactory` (see 7.4.4 below).

#### 7.4.4 Tool Resolution at Agency Instantiation

When building an agency at runtime, tools are resolved from DB `agency_tools` records:

```python
def resolve_tools(agent_db_record, user_token: str) -> list[BaseTool]:
    """Convert DB tool records to agency-swarm BaseTool instances."""
    tools = []
    for tool_record in agent_db_record.tools:
        match tool_record.tool_type:
            case "skill":
                tool = SkillInvokeTool(
                    skill_slug=tool_record.skill.slug,
                    prompt="",  # Set per invocation by the agent
                )
                tool._user_token = user_token
                tools.append(tool)
            case "sandbox":
                tool = SandboxCodeTool(code="", language="python")
                tool._user_token = user_token
                tools.append(tool)
            case "image":
                tool = ImageGenerationTool(prompt="")
                tool._user_token = user_token
                tools.append(tool)
            case "video":
                tool = VideoGenerationTool(prompt="")
                tool._user_token = user_token
                tools.append(tool)
            case "library":
                tool = LibrarySearchTool(query="")
                tool._user_token = user_token
                tools.append(tool)
            case "builtin":
                # Built-in agency-swarm tools (WebSearch, FileSearch, etc.)
                tools.append(ToolFactory.from_name(tool_record.name))
    return tools
```

#### 7.4.5 Credit Flow for Tool Execution

Since tools call Node.js endpoints, credits are deducted at the Node.js layer (existing flow).
The agency credit bridge tracks **additional** LLM costs from agent reasoning, not tool costs:

```
Agent LLM call (reasoning) → credits deducted by Node.js gateway automatically (post-hoc)
Agent tool call → credits deducted by Node.js skill/media executor (existing)
Agency markup → additional credits deducted by agency_credits.py IF creditMultiplier > 1.0

Total agency cost = gateway LLM credits + tool execution credits + agency markup
```

**Important**: No double-charging. Tool bridges do NOT deduct credits (Node.js does).
Agent LLM calls go through `OpenAIChatCompletionsModel` → Node.js gateway → automatic deduction.
The `agency_credits.py` only applies the optional **markup** surcharge (Section 7.3).

### 7.5 Virtual Workflow Integration — Agency Node Design

> **Context**: The LangGraph workflow engine uses `NodeAdapter.make_langgraph_node()` to wrap
> `NodeExecutor` protocol implementations into LangGraph node functions. Adding an "Agency Node"
> requires implementing this protocol and registering in `NodeRegistry`.

#### 7.5.1 Existing Workflow Architecture (Reference)

```
ReactFlow JSON (frontend)
    ↓
WorkflowCompiler.compile()
    ↓ validates DAG, checks cycles (DFS), resolves triggers
    ↓ _build_state_graph() → creates LangGraph StateGraph
    ↓ _instantiate_executor(node_type) → importlib.import_module(executor_path)
    ↓ make_langgraph_node(executor) → wraps in async function
    ↓
StateGraph with nodes + conditional edges
    ↓
LangGraphRuntime.execute() or execute_stream()
    ↓ PostgreSQL checkpointing via AsyncPostgresSaver
    ↓ async semaphore (10 concurrent workflows)
    ↓
Node-by-node execution:
    NodeAdapter._resolve_inputs() → resolves {{nodeId.field}} expressions
    executor.execute(data, context) → returns dict
    State updated with node_outputs[node_id] = result
```

Key protocol types:

```python
# python-backend/app/orchestrator/node_executors/base.py

@dataclass
class ExecutionContext:
    user_id: int
    tenant_id: str
    workflow_id: str
    execution_id: str
    credits_available: float
    extra_data: dict[str, Any] = field(default_factory=dict)

@dataclass
class NodeExecutionData:
    node_id: str
    node_type: str
    config: dict[str, Any]
    inputs: dict[str, Any]     # Resolved from upstream via {{nodeId.field}}
    state: dict[str, Any]      # Full workflow state (node_outputs from all prior nodes)

class NodeExecutor(Protocol):
    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]: ...
```

#### 7.5.2 AgencyExecutor Implementation

```python
# python-backend/app/orchestrator/node_executors/agency_executor.py

from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
import uuid
import structlog

logger = structlog.get_logger()


class AgencyExecutor:
    """
    Execute a multi-agent agency task within a LangGraph workflow node.

    This executor bridges the agency-swarm runtime into the workflow engine,
    allowing visual workflows to include multi-agent reasoning steps.

    The agency runs synchronously within the workflow node. For long-running
    agencies, use the async execution pattern with Celery (see 7.5.5).
    """

    def __init__(self):
        self._agency_service = None  # Lazy init

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """
        Execute an agency run as a workflow node.

        Required inputs:
            task: str — Task description for the agency (accepts {{upstream.field}})
            agency_id: str — Agency definition ID from agencies table

        Optional inputs:
            mode: str — "full" (multi-turn) or "single" (one response). Default: "single"
            max_turns: int — Override max turns per message. Default: from agency config
            context_data: dict — Additional context passed to agents via user_context

        Outputs:
            response: str — Final response text from the agency
            agent_used: str — Name of the agent that produced the final response
            agents_involved: list[str] — All agents that participated
            handoff_count: int — Number of agent-to-agent handoffs
            tokens_used: int — Total tokens consumed by all agents
            cost_usd: float — Total cost in USD
            cost_credits: float — Total cost in SmartSpecPro credits
            conversation_id: str — Agency conversation ID (for follow-up)
        """
        task = data.inputs.get("task", "")
        agency_id = data.inputs.get("agency_id") or data.config.get("agency_id")
        mode = data.inputs.get("mode", "single")
        max_turns = data.inputs.get("max_turns")
        context_data = data.inputs.get("context_data", {})

        if not task or not task.strip():
            return self._error("Agency node requires a non-empty 'task' input")

        if not agency_id:
            return self._error("Agency node requires 'agency_id' (input or config)")

        # Lazy init agency service
        if self._agency_service is None:
            from app.services.agency_service import AgencyService
            self._agency_service = AgencyService()

        # Generate conversation ID for this workflow execution
        conversation_id = f"wf_{context.execution_id}_{data.node_id}_{uuid.uuid4().hex[:8]}"

        try:
            # Build user context from workflow execution context
            user_context = {
                "user_id": context.user_id,
                "tenant_id": context.tenant_id,
                "workflow_id": context.workflow_id,
                "execution_id": context.execution_id,
                "node_id": data.node_id,
                "credits_available": context.credits_available,
                "upstream_outputs": data.state.get("node_outputs", {}),
                **context_data,
            }

            # Run the agency
            result = await self._agency_service.run_message(
                agency_id=agency_id,
                conversation_id=conversation_id,
                message=task,
                user_id=context.user_id,
                user_context=user_context,
                max_turns_override=max_turns,
            )

            return {
                "response": result.response_text,
                "agent_used": result.final_agent_name,
                "agents_involved": result.agents_involved,
                "handoff_count": result.handoff_count,
                "tokens_used": result.total_tokens,
                "cost_usd": result.total_cost_usd,
                "cost_credits": result.total_credits,
                "conversation_id": conversation_id,
            }

        except Exception as e:
            logger.error(
                "agency_executor_error",
                node_id=data.node_id,
                agency_id=agency_id,
                error=str(e),
            )
            return self._error(str(e))

    def _error(self, message: str) -> dict[str, Any]:
        return {
            "response": None,
            "agent_used": "error",
            "agents_involved": [],
            "handoff_count": 0,
            "tokens_used": 0,
            "cost_usd": 0.0,
            "cost_credits": 0.0,
            "conversation_id": None,
            "error": message,
        }
```

#### 7.5.3 NodeRegistry Registration

Add to `_register_core_nodes()` in `python-backend/app/orchestrator/node_registry.py`:

```python
from app.orchestrator.node_registry import NodeTypeSpec, InputSpec, OutputSpec

NodeTypeSpec(
    type="agency",
    display_name="AI Agency",
    description="Run a multi-agent agency to collaboratively solve a task",
    icon="brain-circuit",
    color="purple",
    category="ai",
    inputs=[
        InputSpec(
            name="task",
            display_name="Task Description",
            data_type="text",
            ui_type="textarea",
            required=True,
            accepts_connection=True,
            placeholder="Describe the task for the agency...",
        ),
        InputSpec(
            name="agency_id",
            display_name="Agency",
            data_type="text",
            ui_type="select",  # Populated from agencies table
            required=True,
            accepts_connection=False,
        ),
        InputSpec(
            name="mode",
            display_name="Execution Mode",
            data_type="text",
            ui_type="select",
            required=False,
            default="single",
            options=[
                {"label": "Single Response", "value": "single"},
                {"label": "Multi-Turn (Full)", "value": "full"},
            ],
        ),
        InputSpec(
            name="max_turns",
            display_name="Max Agent Turns",
            data_type="number",
            ui_type="number",
            required=False,
            validation={"min": 1, "max": 50},
        ),
        InputSpec(
            name="context_data",
            display_name="Additional Context",
            data_type="json",
            ui_type="json_editor",
            required=False,
            accepts_connection=True,
        ),
    ],
    outputs=[
        OutputSpec(name="response", display_name="Agency Response", data_type="text"),
        OutputSpec(name="agent_used", display_name="Final Agent", data_type="text"),
        OutputSpec(name="agents_involved", display_name="Agents Involved", data_type="json"),
        OutputSpec(name="handoff_count", display_name="Handoff Count", data_type="number"),
        OutputSpec(name="tokens_used", display_name="Tokens Used", data_type="number"),
        OutputSpec(name="cost_credits", display_name="Credits Used", data_type="number"),
        OutputSpec(name="conversation_id", display_name="Conversation ID", data_type="text"),
    ],
    executor="app.orchestrator.node_executors.agency_executor.AgencyExecutor",
)
```

#### 7.5.4 State Flow in Workflow Context

The agency node integrates with the workflow state system:

```
Prior Workflow Nodes                     Agency Node                      Downstream Nodes
─────────────────                        ───────────                      ────────────────
llm_node.response ──→ {{llm_node.response}} ──→ task input
                                               │
data_node.analysis ──→ {{data_node.analysis}} ─┘ context_data input
                                               │
                                         AgencyExecutor.execute()
                                               │
                                               ├─→ agency.response ──→ {{agency.response}}
                                               ├─→ agency.agent_used ──→ condition routing
                                               └─→ agency.cost_credits ──→ {{agency.cost_credits}}
```

**Expression Resolution**: The `NodeAdapter._resolve_inputs()` function resolves `{{nodeId.field}}`
patterns from `state["node_outputs"]`. Agency node outputs are stored under `node_outputs[agency_node_id]`
and accessible to all downstream nodes via the standard expression syntax.

**Conditional Routing**: Downstream edges can route based on agency outputs:
- `{{agency.agent_used}} == "Developer"` → route to code review path
- `{{agency.handoff_count}} > 3` → route to human review
- `{{agency.error}} != null` → route to error handling

#### 7.5.5 Known Limitations & Workarounds

1. **Synchronous Execution**: The agency node runs synchronously within the workflow.
   For agencies that may take >60 seconds, consider the async pattern:
   - Agency node dispatches to Celery task, returns `task_id`
   - Add a "Poll" node (timer + HTTP check) downstream
   - Or use HITL interrupt: agency node emits checkpoint, workflow pauses

2. **Sequential Parallel Executor**: The workflow engine's `ParallelExecutor` currently runs
   branches **sequentially** (not true parallel). If an agency node is placed inside a parallel
   branch, it will still run sequentially. This is a known TODO in the workflow engine.

3. **Credit Pre-reservation**: The agency node does not pre-reserve credits before running.
   Credits are deducted as the agency executes. If the user runs out of credits mid-agency,
   the agency will fail with an error. **Mitigation**: Check `context.credits_available`
   against `agency.estimatedCostPerMessage` before executing.

4. **State Size**: Agency outputs (full response text) are stored in `node_outputs`, which
   accumulates in workflow state. For long agency responses, this may contribute to state
   size growth. Outputs >1MB are currently truncated by `NodeAdapter` with a warning.

5. **No Streaming in Workflow**: Workflow nodes execute non-interactively. Agency streaming
   is NOT available within workflow context — only the final buffered result is returned.

---

## 8. Node.js Integration Layer

### 8.1 tRPC Router (`apps/web/server/routers/agency.ts`)

```typescript
// Key procedures
export const agencyRouter = router({
  // CRUD
  list: protectedProcedure.query(/* list user's agencies */),
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(/* ... */),
  create: protectedProcedure.input(createAgencySchema).mutation(/* ... */),
  update: protectedProcedure.input(updateAgencySchema).mutation(/* ... */),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(/* ... */),

  // Agent management
  addAgent: protectedProcedure.input(addAgentSchema).mutation(/* ... */),
  updateAgent: protectedProcedure.input(updateAgentSchema).mutation(/* ... */),
  removeAgent: protectedProcedure.input(z.object({ agentId: z.number() })).mutation(/* ... */),

  // Communication flows
  setFlows: protectedProcedure.input(setFlowsSchema).mutation(/* ... */),

  // Execution
  sendMessage: protectedProcedure.input(z.object({
    agencyId: z.string(),
    conversationId: z.string().optional(),
    message: z.string(),
  })).mutation(/* dispatch to Python backend */),

  streamMessage: protectedProcedure.input(z.object({
    agencyId: z.string(),
    conversationId: z.string().optional(),
    message: z.string(),
  })).subscription(/* SSE stream from Python backend */),

  // Conversations
  listConversations: protectedProcedure.input(z.object({ agencyId: z.string() })).query(/* ... */),
  getConversation: protectedProcedure.input(z.object({ conversationId: z.string() })).query(/* ... */),

  // Templates
  listTemplates: publicProcedure.query(/* list agency templates */),
  createFromTemplate: protectedProcedure.input(z.object({
    templateSlug: z.string(),
    name: z.string(),
  })).mutation(/* ... */),

  // Visualization
  getGraph: protectedProcedure.input(z.object({ agencyId: z.string() })).query(/* ... */),
});
```

### 8.2 Agency Bridge (`apps/web/server/services/agencyBridge.ts`)

Handles communication between Node.js and Python backend for agency operations.

```typescript
// Dispatches agency operations to Python backend via internal HTTP
async function dispatchAgencyRun(params: {
  agencyId: string;
  conversationId: string;
  message: string;
  userId: number;
  tenantId: string;
}): Promise<AgencyRunResult> {
  // POST to python-backend /api/internal/agency/run
}

async function* streamAgencyRun(params: {
  agencyId: string;
  conversationId: string;
  message: string;
  userId: number;
  tenantId: string;
}): AsyncGenerator<AgencyStreamEvent> {
  // SSE connection to python-backend /api/internal/agency/stream
}
```

### 8.3 Internal Credit Deduction Endpoint (Decision #9)

New internal-only endpoint for Python backend to deduct credits (agency markup, etc.).
Protected by internal service token — NOT accessible from public internet.

```typescript
// apps/web/server/_core/internalRoutes.ts — add to internal API router

import { deductCredits } from "../services/creditService";

app.post("/api/internal/credits/deduct", async (req, res) => {
  // 1. Validate internal service token
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== process.env.INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }

  // 2. Validate payload
  const { userId, amount, description, sourceType, sourceId } = req.body;
  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  // 3. Deduct credits using existing atomic function
  try {
    const result = await deductCredits({
      userId,
      amount,
      description: description || `Internal deduction: ${sourceType}`,
      type: sourceType || "agency_markup",
      referenceId: sourceId,
    });

    res.json({
      success: true,
      creditsDeducted: amount,
      creditsRemaining: result.remainingCredits,
    });
  } catch (err: any) {
    if (err.message?.includes("insufficient")) {
      return res.status(402).json({ error: "insufficient_credits" });
    }
    res.status(500).json({ error: err.message });
  }
});
```

**Security**:
- Uses `INTERNAL_SERVICE_TOKEN` env var (shared secret between Node.js and Python)
- NOT exposed through Nginx — only accessible on `localhost:3000`
- Rate limited: max 100 deductions per minute per userId
- Logged to audit trail via existing `deductCredits()` function

---

## 9. Frontend Components

### 9.1 Agency Builder

Visual configuration interface for creating and editing agencies.

#### 9.1.1 Relationship to Existing Workflow Editor — IMPORTANT

**Agency Builder is a NEW page — NOT a modification of Workflow Editor.**

The two editors serve fundamentally different purposes:

| | Workflow Editor (existing) | Agency Builder (new) |
|--|--------------------------|---------------------|
| **Models** | Data pipeline (DAG of operations) | Agent team (communication graph) |
| **Node = ?** | Operation (LLM call, RAG, condition) | Agent (CEO, Developer, Researcher) |
| **Edge = ?** | Data flow: output A → input B | Communication: A can hand off to B |
| **Routing** | Edges + condition nodes (deterministic) | LLM decides via Handoff tool (emergent) |
| **Execution** | Sequential/parallel per graph topology | Conversational — agents chat until done |
| **User interaction** | Run → wait → result (or approval node) | Chat back-and-forth during execution |
| **File** | `pages/WorkflowEditor.tsx` (2,329 lines) | `pages/AgencyBuilder.tsx` [NEW] |

**Rules**:
- `WorkflowEditor.tsx` is NOT modified — agency logic NEVER goes into this file
- `components/workflow/` directory is NOT modified
- Agency components live in `components/agency/` (separate directory)

#### 9.1.2 Component Architecture

```
apps/web/client/src/
├── pages/
│   ├── WorkflowEditor.tsx              ← NO CHANGES
│   ├── AgencyBuilder.tsx               ← NEW — main agency config page
│   └── AgencyChat.tsx                  ← NEW — multi-agent chat page
│
├── components/
│   ├── workflow/                        ← NO CHANGES (23 existing files)
│   │
│   └── agency/                          ← NEW directory
│       ├── nodes/
│       │   └── AgentNode.tsx            ← ReactFlow node for agents
│       ├── edges/
│       │   └── CommunicationEdge.tsx    ← Arrow showing "A can talk to B"
│       ├── config/
│       │   ├── AgentConfigPanel.tsx     ← Instructions, model, temperature
│       │   ├── ToolPicker.tsx           ← Assign skills/tools to agent
│       │   └── GuardrailEditor.tsx      ← Input/output guardrail config
│       ├── AgencyTestPanel.tsx          ← Live chat testing inside builder
│       ├── AgencyTemplateGallery.tsx    ← Browse/import agency templates
│       └── AgencyCostPreview.tsx        ← Estimated cost per message
```

#### 9.1.3 Reuse Strategy — What Is Shared

| Existing Component | Reuse How |
|-------------------|-----------|
| `ReactFlow` (npm package) | Same package, same canvas — different node/edge types |
| `BaseNode.tsx` pattern | `AgentNode.tsx` follows same structure: header + body + handles |
| `DynamicNodeConfig.tsx` pattern | `AgentConfigPanel.tsx` follows same sidebar config pattern |
| `TemplateBrowser.tsx` pattern | `AgencyTemplateGallery.tsx` follows same browse/preview/import flow |
| `CostEstimation.tsx` pattern | `AgencyCostPreview.tsx` follows same credit estimation display |
| `WorkflowVersionHistory.tsx` pattern | Agency versioning uses same snapshot/rollback pattern |
| `useNodeRegistry` hook | NOT reused — agencies use `trpc.agency.list` instead |
| `isValidConnection` logic | Replaced with agency-specific rules (no self-loops, entry point check) |

#### 9.1.4 Features

- **Agent cards**: Add/remove agents with name, role, model, instructions
- **Communication flow editor**: Drag arrows between agents to define flows
- **Tool picker**: Assign SmartSpecPro skills and built-in tools to agents
- **Guardrail config**: Input/output validation rules per agent
- **Template gallery**: Start from pre-built agency patterns
- **Test panel**: Send test messages and see agent interactions in real-time

#### 9.1.5 Connection to Workflow Editor (Phase 4)

When `AgencyExecutor` is registered in Phase 4, the **existing Workflow Editor** automatically
gains an "AI Agency" node in category `"ai"` — no code changes needed in `WorkflowEditor.tsx`
because it's registry-driven:

```
Workflow Editor (unchanged)     AgencyBuilder (new)
      │                               │
      │ Adds node type="agency"        │ Creates/edits agency definitions
      │ config: { agency_id: "..." }   │ stored in agencies table
      │                                │
      └──────── agency_id ─────────────┘
                    │
              AgencyExecutor.execute()
              (sees agency_id, loads definition, runs agents)
```

No coupling between the two UIs — they share only a UUID reference.

### 9.2 Agency Chat

Multi-agent chat interface:

- **Agent indicators**: Show which agent is currently processing
- **Handoff visualization**: Display when one agent hands off to another
- **Tool call display**: Show tool invocations and results inline
- **Cost tracker**: Real-time credit usage display
- **Agent switcher**: Manual override to direct messages to specific agents

### 9.3 Agency Templates

Pre-built agency patterns for common use cases:

| Template | Agents | Use Case |
|----------|--------|----------|
| **Content Creator** | Writer, Editor, SEO Specialist | Blog/social media content pipeline |
| **Research Team** | Researcher, Analyst, Summarizer | Deep research with source validation |
| **Code Assistant** | Architect, Developer, Reviewer | Multi-stage code generation |
| **Customer Support** | Triage, Technical, Billing | Specialized support routing |
| **Spec Writer** | Requirements Analyst, Spec Author, Reviewer | SmartSpecPro's own use case |
| **Media Production** | Script Writer, Image Director, Video Producer | Multi-modal content creation |

### 9.4 Additional Integration Channels

Beyond the primary chat UI and workflow node, agencies can be triggered through
6 additional channels that already exist in SmartSpecPro's codebase.

#### 9.4.1 Skill Auto-Trigger — Agency as a Skill (Phase 2)

> **Existing system**: `skillDetector.ts` matches user messages against regex patterns,
> `skillExecutor.ts` routes by `executionMode`. Adding `executionMode: "agency"` enables
> agencies to be triggered automatically when a user types a matching pattern.

**How it works:**

```
User types: "research quantum computing advances"
  ↓
skillDetector.ts matches trigger pattern: /^research\s+/
  ↓
Detected skill: { slug: "research-team-agency", executionMode: "agency", agencyId: "abc-123" }
  ↓
skillExecutor.ts sees executionMode === "agency"
  ↓
agencyBridge.dispatchAgencyRun({ agencyId, message: suggestedPrompt, userId })
  ↓
Agency runs (Research Team: Researcher → Analyst → Summarizer)
  ↓
Response returned to chat
```

**Implementation changes:**

1. **Add `executionMode: "agency"` to skills table enum** — new execution mode alongside
   `llm-only`, `python`, `sandbox-*`, `image-generation`, `video-generation`

2. **Add `agencyId` column to skills table** — links skill to an agency definition

3. **Extend `skillExecutor.ts`** — add case for `"agency"` mode:

```typescript
// apps/web/server/services/skillExecutor.ts — new case in executeSkill()
case "agency": {
  if (!skill.agencyId) {
    return { success: false, error: "Skill missing agencyId", skillId: skill.slug, type: "text" };
  }
  const result = await dispatchAgencyRun({
    agencyId: skill.agencyId,
    message: params.prompt,
    userId,
    tenantId: getTenantId(userToken),
  });
  return {
    success: true,
    skillId: skill.slug,
    type: "text",
    message: result.responseText,
    creditsUsed: result.totalCredits,
  };
}
```

4. **Skill registration example** (`skills/research-team-agency/skill.md`):

```yaml
---
name: "Research Team"
description: "Multi-agent research with fact-checking and analysis"
category: "research"
executionMode: "agency"
agencyId: "research-team-001"
priority: 60
trigger_patterns:
  - pattern: "^research\\s+"
    label: "Research Topic"
  - pattern: "^(investigate|analyze|deep.?dive)\\s+"
    label: "Investigation"
isAutoTrigger: true
creditMultiplier: 2.0
---
# Research Team Agency
Dispatches to a multi-agent research team...
```

**Credit flow (ADDITIVE — Decision #11)**: Skill and agency multipliers are additive, not multiplicative.
```
Total = base LLM credits × (1.0 + (agency_multiplier - 1.0) + (skill_multiplier - 1.0))

Example: base=100, agency=2.0x, skill=1.5x
  → 100 × (1.0 + 1.0 + 0.5) = 100 × 2.5 = 250 credits
  (NOT multiplicative: 100 × 2.0 × 1.5 = 300)
```

---

#### 9.4.2 Scheduled Messages — Recurring Agency Tasks (Phase 3)

> **Existing system**: `scheduler.ts` delivers messages via Cloud Tasks. Supports
> simple reminders (0 credits) and LLM-powered messages. Adding agency support
> enables recurring multi-agent workflows (e.g., weekly report generation).

**How it works:**

```
Admin creates schedule:
  { type: "agency", agencyId: "report-writer-001", prompt: "Generate weekly sales report",
    schedule: "0 9 * * MON", conversationId: 42 }
  ↓
Cloud Tasks fires at 9:00 AM every Monday
  ↓
scheduler.ts → deliverScheduledMessage(scheduleId)
  ↓
Detects type === "agency"
  ↓
agencyBridge.dispatchAgencyRun({ agencyId, message: prompt, userId: schedule.userId })
  ↓
Agency runs (Report Writer: Data Collector → Analyst → Writer)
  ↓
Result saved to conversation + notification sent
```

**Implementation changes:**

1. **Add `agencyId` column to `scheduledMessages` table**:

```typescript
// apps/web/drizzle/schema.ts — extend scheduledMessages
agencyId: varchar("agencyId", { length: 36 })
  .references(() => agencies.id, { onDelete: "set null" }),
```

2. **Extend `scheduler.ts` delivery logic**:

```typescript
// apps/web/server/services/scheduler.ts — in deliverScheduledMessage()
if (schedule.agencyId) {
  // Agency-powered scheduled message
  const result = await dispatchAgencyRun({
    agencyId: schedule.agencyId,
    message: schedule.content || schedule.prompt,
    userId: schedule.userId,
    tenantId: schedule.tenantId,
    conversationId: schedule.conversationId?.toString(),
  });

  // Save agency response as assistant message
  await saveMessage({
    conversationId: schedule.conversationId,
    role: "assistant",
    content: result.responseText,
    metadata: {
      source: "scheduled_agency",
      agencyId: schedule.agencyId,
      agentsInvolved: result.agentsInvolved,
      creditsUsed: result.totalCredits,
    },
  });

  // Send notification
  await createNotification({
    userId: schedule.userId,
    title: `Agency "${agencyName}" completed scheduled task`,
    body: truncate(result.responseText, 200),
    type: "agency_scheduled",
  });
}
```

3. **UI**: Add agency picker to `SchedulePanel.tsx` — when user creates a scheduled message,
   they can optionally select an agency instead of (or alongside) a skill.

**Use cases:**
- Weekly/daily report generation
- Automated content pipeline (draft → review → publish)
- Periodic data analysis and alerting
- Scheduled code review or spec writing

---

#### 9.4.3 OpenAI-Compatible API — External System Integration (Phase 4)

> **Existing system**: `openaiCompatGateway.ts` exposes `/api/v1/llm/openai/chat/completions`
> for external tools. Currently incomplete (stub). Extending it to route to agencies enables
> any OpenAI-compatible client (Cursor, Continue, custom apps) to use SmartSpecPro agencies.

**How it works:**

```
External App (e.g., Cursor, VS Code extension, custom script)
  ↓
POST /api/v1/llm/openai/chat/completions
  Headers: x-gateway-key: <api_key>
  Body: { model: "agency:research-team-001", messages: [...] }
  ↓
openaiCompatGateway.ts detects "agency:" prefix
  ↓
agencyBridge.dispatchAgencyRun({ agencyId: "research-team-001", ... })
  ↓
Agency runs, returns result
  ↓
Response formatted as OpenAI-compatible:
  { choices: [{ message: { role: "assistant", content: "..." } }], usage: { ... } }
```

**Implementation changes:**

1. **Extend gateway routing** in `openaiCompatGateway.ts`:

```typescript
// apps/web/server/_core/openaiCompatGateway.ts
app.post("/api/v1/llm/openai/chat/completions", async (req, res) => {
  const { model, messages, stream } = req.body;

  // Detect agency model prefix
  if (model?.startsWith("agency:")) {
    const agencyId = model.replace("agency:", "");
    const lastMessage = messages[messages.length - 1]?.content || "";

    if (stream) {
      // SSE streaming
      res.setHeader("Content-Type", "text/event-stream");
      for await (const event of streamAgencyRun({ agencyId, message: lastMessage, ... })) {
        res.write(`data: ${JSON.stringify(formatAsOpenAIDelta(event))}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Sync response
      const result = await dispatchAgencyRun({ agencyId, message: lastMessage, ... });
      res.json(formatAsOpenAIResponse(result));
    }
    return;
  }

  // Normal LLM routing...
});
```

2. **Model naming convention**: `agency:<agency-slug>` or `agency:<agency-id>`

3. **Authentication**: Uses existing `x-gateway-key` header → resolves to user + tenant

**Use cases:**
- IDE plugins (Cursor, VS Code) use agencies for code generation
- Custom scripts/automations call agencies via standard OpenAI SDK
- Third-party integrations without SmartSpecPro-specific client library
- Mobile apps using existing OpenAI SDKs

---

#### 9.4.4 MCP Server — AI-to-AI Integration (Phase 4)

> **Existing system**: `mcpRoutes.ts` + `internal_mcp.py` expose MCP tools for
> workspace file access and cloud storage. Adding agency tools to MCP enables
> Claude Desktop, other AI systems, or chained agents to invoke SmartSpecPro agencies.

**How it works:**

```
Claude Desktop (or any MCP client)
  ↓
MCP tool call: { name: "run_agency", arguments: { agency_id: "...", task: "..." } }
  ↓
POST /_internal/mcp/tools/call
  Headers: Authorization: Bearer <token>
  Body: { name: "run_agency", arguments: { agency_id, task } }
  ↓
mcpRoutes.ts dispatches to agencyBridge
  ↓
Agency runs, returns result
  ↓
MCP tool result: { content: [{ type: "text", text: "..." }] }
```

**Implementation changes:**

1. **Register agency MCP tools** in `mcp.ts`:

```typescript
// apps/web/server/_core/mcp.ts — add to tool registry

// List available agencies
{
  name: "list_agencies",
  description: "List available AI agencies in SmartSpecPro",
  inputSchema: { type: "object", properties: {} },
  handler: async (args, context) => {
    const agencies = await db.select().from(agencies)
      .where(and(
        eq(agencies.tenantId, context.tenantId),
        eq(agencies.isEnabled, true),
      ));
    return { content: [{ type: "text", text: JSON.stringify(agencies.map(a => ({
      id: a.id, name: a.name, description: a.description, agents: a.agentCount
    })))}]};
  },
},

// Run an agency
{
  name: "run_agency",
  description: "Run a multi-agent agency to collaboratively solve a task",
  inputSchema: {
    type: "object",
    properties: {
      agency_id: { type: "string", description: "Agency ID or slug" },
      task: { type: "string", description: "Task description for the agency" },
      max_turns: { type: "number", description: "Max agent turns (default: from agency config)" },
    },
    required: ["agency_id", "task"],
  },
  handler: async (args, context) => {
    const result = await dispatchAgencyRun({
      agencyId: args.agency_id,
      message: args.task,
      userId: context.userId,
      tenantId: context.tenantId,
    });
    return { content: [{
      type: "text",
      text: JSON.stringify({
        response: result.responseText,
        agents_involved: result.agentsInvolved,
        credits_used: result.totalCredits,
      }),
    }]};
  },
},
```

2. **Scope requirement**: `mcp:write` scope needed (agency execution has side effects)

**Use cases:**
- Claude Desktop uses SmartSpecPro agencies as tools
- Chained AI systems: one LLM orchestrates multiple SmartSpecPro agencies
- Agency-to-agency delegation via MCP (agency A invokes agency B)
- Research automation: external AI reads library + runs agency + writes results

---

#### 9.4.5 Webhooks — Event-Driven Agency Triggers (Phase 4)

> **Existing system**: `webhooks.ts` receives callbacks from Google Drive, etc.
> Extending with agency-specific webhooks enables external events to trigger
> agency workflows (e.g., "new file uploaded" → agency processes it).

**How it works:**

```
External Service (e.g., GitHub, Slack, Google Drive, Stripe)
  ↓
POST /api/webhooks/agency/<agency-slug>
  Headers: X-Webhook-Secret: <configured_secret>
  Body: { event: "file.uploaded", data: { filename: "report.pdf", url: "..." } }
  ↓
webhooks.ts validates secret, resolves agency
  ↓
Formats event as agency task: "Process uploaded file: report.pdf (URL: ...)"
  ↓
agencyBridge.dispatchAgencyRun({ agencyId, message: formattedTask, userId: owner })
  ↓
Agency runs asynchronously (Celery task)
  ↓
Result saved to agency_conversations + notification sent
  ↓
Optional: POST callback URL with result
```

**Implementation changes:**

1. **Add webhook configuration to agencies table**:

```typescript
// In agencies table (extend configJson)
configJson: jsonb("configJson").$type<{
  webhook?: {
    enabled: boolean;
    secret: string;           // HMAC secret for validation
    allowedSources?: string[]; // IP or domain whitelist
    callbackUrl?: string;      // POST result back to this URL
    eventTemplate?: string;    // Template: "Process {{event}}: {{data.filename}}"
  };
  // ... existing fields
}>(),
```

2. **New webhook endpoint**:

```typescript
// apps/web/server/routes/webhooks.ts — add agency webhook
app.post("/api/webhooks/agency/:agencySlug", async (req, res) => {
  const { agencySlug } = req.params;
  const webhookSecret = req.headers["x-webhook-secret"] as string;

  // 1. Resolve agency by slug
  const agency = await getAgencyBySlug(agencySlug);
  if (!agency?.configJson?.webhook?.enabled) {
    return res.status(404).json({ error: "Webhook not configured" });
  }

  // 2. Validate secret (HMAC)
  if (!validateWebhookSecret(webhookSecret, agency.configJson.webhook.secret)) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  // 3. Format event into task message
  const taskMessage = formatWebhookAsTask(req.body, agency.configJson.webhook.eventTemplate);

  // 4. Dispatch asynchronously (return 202 immediately)
  const jobId = await enqueueAgencyRun({
    agencyId: agency.id,
    message: taskMessage,
    userId: agency.createdBy,
    tenantId: agency.tenantId,
    metadata: { source: "webhook", event: req.body },
  });

  res.status(202).json({ accepted: true, jobId });
});
```

3. **Webhook secret management**: Encrypted in DB using existing `crypto.ts`

**Use cases:**
- GitHub push → agency reviews code and generates spec updates
- Google Drive file upload → agency processes document and generates summary
- Slack message → agency researches topic and posts answer
- Stripe payment event → agency generates invoice and sends notification
- Form submission → agency processes and routes to appropriate team

---

#### 9.4.6 Desktop App (Tauri) — Local-First Agency Access (Phase 4)

> **Existing system**: Tauri shell provides IPC commands for Docker, Git, file system,
> terminal, and video editing. Adding agency commands enables the desktop app to
> trigger agencies with access to local resources.

**How it works:**

```
Desktop App (Tauri)
  ↓
User selects agency from UI or keyboard shortcut
  ↓
Tauri IPC: invoke("run_agency", { agencyId, task, localFiles: [...] })
  ↓
Tauri Rust command:
  1. Reads local files if needed
  2. Authenticates via stored refresh token (device auth flow)
  3. POST /api/internal/agency/run (via smartaihub.app or localhost)
  ↓
Agency runs on server
  ↓
Result returned to desktop UI
  ↓
Optional: Tauri writes result to local filesystem
```

**Implementation changes:**

1. **New Tauri IPC commands** (`apps/tauri-shell/src-tauri/src/agency.rs`):

```rust
#[tauri::command]
async fn run_agency(
    agency_id: String,
    task: String,
    local_context: Option<serde_json::Value>,
    auth_token: String,
    state: tauri::State<'_, AppState>,
) -> Result<AgencyResult, String> {
    let client = reqwest::Client::new();
    let base_url = state.api_base_url.clone();

    let response = client.post(format!("{}/api/internal/agency/run", base_url))
        .bearer_auth(&auth_token)
        .json(&serde_json::json!({
            "agencyId": agency_id,
            "message": task,
            "context": local_context,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let result: AgencyResult = response.json().await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
async fn list_agencies(auth_token: String, state: tauri::State<'_, AppState>) -> Result<Vec<AgencySummary>, String> {
    // GET /api/trpc/agency.list
}
```

2. **Desktop-specific features**:
   - **Local file context**: Desktop agent can read local files and pass content to agency
   - **Git integration**: Agency can receive git diff/status as context
   - **Docker integration**: Agency can inspect/manage containers
   - **Offline queue**: If network unavailable, queue agency requests for later dispatch

3. **Authentication**: Uses device auth flow (RFC 8628) — already implemented in
   `deviceAuthRoutes.ts`. Desktop stores refresh token securely in OS keychain.

**Use cases:**
- Developer selects code → "Research best practices for this pattern" → agency runs
- Designer right-clicks image → "Generate 3 variations" → agency dispatches image generation
- DevOps sees Docker logs → "Diagnose this error" → agency analyzes with full container context
- Writer selects text → "Edit and improve" → agency runs editorial pipeline

---

### 9.5 Integration Channel Summary

```
                    ┌──────────────────────────────────┐
                    │       Agency Runtime (Python)     │
                    │     agency-swarm + LangGraph      │
                    └───────────┬───────────────────────┘
                                │
     ┌──────────┬───────────┬───┼───┬───────────┬──────────┐
     │          │           │   │   │           │          │
  ┌──▼──┐  ┌───▼───┐  ┌───▼───▼───▼──┐  ┌────▼────┐  ┌──▼───┐
  │Chat │  │Workflow│  │  Node.js     │  │External │  │Tauri │
  │ UI  │  │ Node  │  │  Gateway     │  │Triggers │  │ IPC  │
  └──┬──┘  └───┬───┘  └──┬───┬───┬──┘  └──┬──┬──┘  └──┬───┘
     │         │         │   │   │        │  │        │
  tRPC    LangGraph   ┌──┘   │   └──┐   ┌┘  └┐    Rust
  API     Executor    │      │      │   │    │    IPC
     │         │      │      │      │   │    │      │
  ┌──▼──┐  ┌──▼──┐ ┌─▼──┐ ┌▼───┐ ┌▼─┐ │  ┌─▼─┐ ┌─▼──┐
  │React│  │Work-│ │Skil│ │Sch-│ │OAI│ │  │Web│ │Desk│
  │Chat │  │flow │ │l   │ │edu-│ │Com│ │  │hoo│ │top │
  │Page │  │Edit-│ │Auto│ │ler │ │pat│ │  │ks │ │App │
  │     │  │or   │ │Trig│ │    │ │API│ │  │   │ │    │
  └─────┘  └─────┘ └────┘ └────┘ └───┘ │  └───┘ └────┘
                                     ┌──▼──┐
                                     │ MCP │
                                     │Serv-│
                                     │er   │
                                     └─────┘
```

| # | Channel | Entry Point | Auth | Phase | Use Case |
|---|---------|------------|------|-------|----------|
| 1 | Chat UI | `agency.sendMessage` tRPC | JWT session | 1 | Interactive multi-agent chat |
| 2 | Workflow Node | `AgencyExecutor` in LangGraph | Workflow context | 4 | Automated pipeline step |
| 3 | Skill Auto-Trigger | `skillExecutor.ts` → `"agency"` mode | JWT session | 2 | Pattern-matched activation |
| 4 | Scheduled Messages | `scheduler.ts` → Cloud Tasks | System token | 3 | Recurring tasks |
| 5 | OpenAI-Compatible API | `/api/v1/llm/openai/chat/completions` | Gateway key | 4 | External app integration |
| 6 | MCP Server | `/_internal/mcp/tools/call` | Bearer + scope | 4 | AI-to-AI integration |
| 7 | Webhooks | `/api/webhooks/agency/:slug` | HMAC secret | 4 | Event-driven triggers |
| 8 | Desktop App (Tauri) | Tauri IPC `run_agency` | Device auth JWT | 4 | Local-first interaction |

---

### 9.6 UI Integration with Existing Pages

Agency features integrate into existing SmartSpecPro pages through the shared menu system,
dashboard widgets, settings panels, and admin tooling. This section specifies every touchpoint.

#### 9.6.1 Navigation — Menu Items & Routes

**Menu configuration** in `packages/shared/src/constants/menu.ts` — add 3 items:

```typescript
// --- Main group (user-visible) ---
{
  id: "agencies",
  label: "Agencies",
  labelTh: "เอเจนซี่ AI",
  icon: "Users",          // lucide-react Users icon (multi-agent metaphor)
  path: "/agencies",
  platforms: ["web", "desktop"],
  group: "main",
  sortOrder: 3.6,         // After Workflows (3.5), before Media History (4.0)
},

// --- Admin group ---
{
  id: "admin-agencies",
  label: "Agencies",
  labelTh: "จัดการเอเจนซี่",
  icon: "Users",
  path: "/admin/agencies",
  platforms: ["web"],
  roles: ["admin"],
  group: "admin",
  sortOrder: 29.5,        // After Skill Repos (29), before Gallery Admin (31)
},

// --- Domain admin group ---
{
  id: "domain-agencies",
  label: "Manage Agencies",
  labelTh: "จัดการเอเจนซี่",
  icon: "Users",
  path: "/domain-admin/agencies",
  platforms: ["web"],
  roles: ["domain_admin", "admin"],
  group: "domain-admin",
  sortOrder: 43.5,        // After Manage Blog (43), before Tenant Settings (44)
},
```

**Icon mapping** — `Users` is already in `useMenuItems.ts` iconMap (line 53). No changes needed.

**Routes** in `apps/web/client/src/App.tsx`:

```typescript
// Add lazy page imports
const Agencies = lazy(() => import("./pages/Agencies"));
const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
const AgencyChat = lazy(() => import("./pages/AgencyChat"));
const AdminAgencies = lazy(() => import("./pages/AdminAgencies"));
const DomainAdminAgencies = lazy(() => import("./pages/DomainAdminAgencies"));

// Add routes (between /workflows and /dashboard)
<Route path="/agencies" component={Agencies} />
<Route path="/agencies/builder" component={AgencyBuilder} />
<Route path="/agencies/builder/:id" component={AgencyBuilder} />
<Route path="/agencies/chat/:id" component={AgencyChat} />
<Route path="/admin/agencies" component={AdminAgencies} />
<Route path="/domain-admin/agencies" component={DomainAdminAgencies} />
```

#### 9.6.2 Dashboard Integration

The Dashboard (`pages/Dashboard.tsx`) uses `getResolvedMenuItems` from `hooks/useMenuItems.ts`.
Agency items appear automatically via the menu system. Additionally, add **agency status widgets**:

**Widget: Recent Agency Runs** (on user dashboard)

```typescript
// components/dashboard/RecentAgencyRuns.tsx
// Shows last 5 agency runs with: agency name, status, agents involved, credits used, time ago
// Data source: trpc.agency.recentRuns.useQuery({ limit: 5 })
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Users className="h-4 w-4" />
      Recent Agency Runs
    </CardTitle>
  </CardHeader>
  <CardContent>
    {runs.map(run => (
      <div key={run.id} className="flex items-center justify-between py-2">
        <div>
          <span className="font-medium">{run.agencyName}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {run.agentsInvolved.length} agents • {run.handoffCount} handoffs
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={run.status === "completed" ? "default" : "destructive"}>
            {run.status}
          </Badge>
          <span className="text-xs">{run.totalCreditsUsed} credits</span>
        </div>
      </div>
    ))}
  </CardContent>
</Card>
```

**Widget: Agency Quick Actions** (on dashboard)

```
[+ Create Agency]  [Browse Templates]  [View All Runs]
```

#### 9.6.3 Chat Page Integration

The Chat page (`pages/Chat.tsx`) is the primary interaction point. Agency integration:

1. **Agency Selector in Chat Header**: When user has agencies, show a dropdown to switch between
   normal chat and agency-powered chat. Uses `trpc.agency.list.useQuery()`.

```
┌─ Chat ─────────────────────────────────────────────────────┐
│ [Normal Chat ▼]  ←→  [Research Team ▼]  [Settings ⚙]      │
│                                                             │
│  When agency selected:                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔵 CEO Agent is processing...                        │  │
│  │                                                       │  │
│  │ User: Research quantum computing advances             │  │
│  │                                                       │  │
│  │ 🟢 Researcher → searching web...                     │  │
│  │ 🔵 Analyst → analyzing findings...                   │  │
│  │ 🟢 Summarizer:                                       │  │
│  │   Here is the analysis of quantum computing...       │  │
│  │                                                       │  │
│  │ Credits used: 45.2 (base: 30, markup: 15.2)          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│ [Type message... ]                          [Send]          │
└─────────────────────────────────────────────────────────────┘
```

2. **Agent Activity Indicators**: During agency execution, show which agent is active,
   handoff transitions (animated arrow), and tool invocations inline.

3. **Skill Detection Override**: When `skillDetector.ts` matches an agency-backed skill,
   the chat UI shows a confirmation: "This will run the Research Team agency (est. ~50 credits). Proceed?"

4. **Implementation**: Extend `ChatView.tsx` with an `AgencyChatMode` component that wraps
   the existing message list but adds:
   - `useAgencySSE(conversationId)` hook for streaming agency events
   - Agent attribution badges on messages (`metadata.agentName`)
   - Handoff visualization between messages
   - Real-time cost accumulator in footer

#### 9.6.4 Settings Page Integration

The Settings page (`pages/Settings.tsx`) gains a new tab:

```
[Profile] [Appearance] [Skills] [Agencies] [Notifications] [API Keys]
                                   ↑ NEW
```

**Agencies Settings Tab** contents:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Agency enabled | Toggle | On | Master switch for agency features |
| Default agency model | Select | gpt-4o | Default LLM model for new agents |
| Max agency turns | Slider (5-50) | 25 | Maximum turns before force-stop |
| Cost alert threshold | Input (credits) | 100 | Alert when a single run exceeds this |
| Auto-confirm agency skill triggers | Toggle | Off | Skip confirmation for skill-triggered agencies |
| Default credit multiplier | Slider (1.0-5.0) | 1.5 | Default markup for new agencies |

**Implementation**: Add `AgencySettingsTab.tsx` in `components/settings/`, uses
`trpc.settings.get/set` with category `"agency"`.

#### 9.6.5 Admin Pages

**AdminAgencies page** (`pages/AdminAgencies.tsx`):

Platform-wide agency management for admins:

| Feature | Description |
|---------|-------------|
| Agency List | All agencies across tenants — name, owner, agent count, run count, total cost |
| Agency Detail | View definition, agents, tools, communication flows, recent runs |
| Usage Metrics | Total runs, avg cost, avg duration, error rate per agency |
| Kill Switch | Disable a specific agency (sets `isActive: false`) |
| Cost Limits | Set per-agency max credits per day / per run |
| Template Management | Create/edit/publish agency templates |
| Audit Log | Filter audit events by agency — `agency_*` event types |

**Layout**: Follows existing `AdminSkills.tsx` pattern — table with filters + detail panel.

**DomainAdminAgencies page** (`pages/DomainAdminAgencies.tsx`):

Tenant-scoped agency management for domain admins:

| Feature | Description |
|---------|-------------|
| Tenant Agency List | Agencies owned by this tenant only |
| Enable/Disable | Control which agencies are active for tenant users |
| Template Install | Install from global template gallery |
| Cost Overview | Total agency spend for this tenant this billing period |

#### 9.6.6 Agencies List Page

**Agencies page** (`pages/Agencies.tsx`) — the main user-facing page:

```
┌─ My Agencies ─────────────────────────────────────────────────────┐
│                                                                     │
│ [+ Create Agency]  [Browse Templates]        [Search... 🔍]       │
│                                                                     │
│ ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────┐   │
│ │ 📊 Research Team    │  │ ✍️ Content Creator  │  │ + New     │   │
│ │ 3 agents            │  │ 3 agents            │  │           │   │
│ │ 142 runs            │  │ 89 runs             │  │           │   │
│ │ Last: 2h ago        │  │ Last: 1d ago        │  │           │   │
│ │                     │  │                     │  │           │   │
│ │ [Chat] [Edit] [...]│  │ [Chat] [Edit] [...]│  │           │   │
│ └─────────────────────┘  └─────────────────────┘  └───────────┘   │
│                                                                     │
│ ── Recent Runs ──────────────────────────────────────────────────  │
│ │ Research Team    │ completed │ 3 agents │ 45 credits │ 2h ago │  │
│ │ Content Creator  │ failed    │ 2 agents │ 12 credits │ 1d ago │  │
│ └─────────────────────────────────────────────────────────────────  │
└─────────────────────────────────────────────────────────────────────┘
```

Each agency card shows: name, agent count, total runs, last activity, quick actions (Chat, Edit, More).
The "More" dropdown offers: Duplicate, Export, View Runs, Delete.

Data fetching: `trpc.agency.list.useQuery()` + `trpc.agency.recentRuns.useQuery()`.

---

### 9.7 UX Flow Design

#### 9.7.1 User Journey: First Agency Creation

```
Step 1: Discovery
  User sees "Agencies" in sidebar → clicks → lands on empty state page

Step 2: Empty State
  ┌──────────────────────────────────────────────────┐
  │                                                    │
  │  🤖  Create Your First AI Agency                  │
  │                                                    │
  │  An agency is a team of AI agents that collaborate │
  │  to solve complex tasks. Each agent has a role,    │
  │  model, and set of tools.                          │
  │                                                    │
  │  [Start from Template (Recommended)]               │
  │  [Create from Scratch]                             │
  │                                                    │
  │  ── Popular Templates ─────────────────────        │
  │  [Research Team]  [Content Creator]  [Code Review] │
  └──────────────────────────────────────────────────┘

Step 3a: Template Path
  → User clicks "Research Team" template
  → AgencyBuilder opens with pre-filled agents + flows
  → User can customize (rename agents, change models, add tools)
  → Click "Save & Test"

Step 3b: Scratch Path
  → AgencyBuilder opens empty
  → Guided: "Add your first agent" prompt
  → User adds agents one by one
  → Draws communication flows between agents
  → Assigns tools from tool picker

Step 4: Test
  → Test panel opens on right side of builder
  → User sends test message
  → Sees agents collaborating in real-time
  → Adjusts if needed

Step 5: Deploy
  → Click "Activate" → agency becomes available in Chat, Skills, Scheduling
  → Success toast: "Research Team is now active! You can use it in Chat."
```

#### 9.7.2 User Journey: Running an Agency

```
Path A: Direct Chat
  Chat page → select agency from dropdown → type message → watch agents collaborate

Path B: Skill Auto-Trigger
  Chat page → type "research quantum computing" → skill detector matches →
  → Confirmation dialog: "Run Research Team? (~50 credits)" → [Yes] → agency runs

Path C: Scheduled
  Settings > Schedules → New schedule → select "Research Team" agency →
  → Set cron (weekly) → set prompt → Save

Path D: From Dashboard
  Dashboard → "Recent Agency Runs" widget → click agency name → opens agency chat
```

#### 9.7.3 Loading States

| State | UI Treatment |
|-------|-------------|
| Agency list loading | Skeleton cards (3 cards, pulse animation) |
| Agency builder loading | Skeleton canvas with placeholder nodes |
| Agency run starting | "Starting agency..." + spinner on send button |
| Agent processing | Animated dot indicator next to agent name + "thinking..." |
| Handoff in progress | Animated arrow from Agent A → Agent B with "Handing off..." |
| Tool execution | Inline card: "🔧 Running [Tool Name]..." with expand for details |
| Streaming response | Token-by-token text appearance (reuse existing chat streaming) |
| Long-running (>30s) | Progress indicator: "Agent [Name] is still working... (45s)" |

#### 9.7.4 Error States

| Error | UI Treatment | Recovery |
|-------|-------------|----------|
| Agency not found | "This agency was deleted or you don't have access." | [Go to Agencies] |
| Insufficient credits | "Not enough credits. This agency costs ~50 credits." | [Buy Credits] [Settings] |
| Agent LLM error | "Agent [Name] encountered an error: [message]" | [Retry] [Switch Model] |
| Max turns reached | "Agency reached maximum turns (25). The conversation was stopped." | [Continue (add 25 turns)] [End] |
| Tool execution failed | Inline error in tool card: "Failed: [error]" + agent auto-retries or skips | Automatic |
| Network timeout | "Connection lost. Reconnecting..." → auto-retry SSE | Automatic reconnect |
| Sandbox job failed | "Code execution failed: [error]" | Agent sees error, may retry |
| Credit multiplier surprise | Pre-run estimate shown: "Est. cost: 50-150 credits (2.0x multiplier)" | User confirms before run |

#### 9.7.5 Empty States

| Page | Empty State |
|------|-------------|
| Agencies list | "Create your first AI agency" + template gallery preview |
| Agency runs | "No runs yet. Send a message to start." + [Open Chat] button |
| Agency builder (no agents) | "Add your first agent" + guided tooltip |
| Admin agencies | "No agencies created yet across the platform." |
| Template gallery | "No templates available." (shouldn't happen — always has built-in templates) |

#### 9.7.6 Onboarding Flow (First-Time User)

When a user first accesses `/agencies` and has no agencies:

1. **Welcome Modal** (dismissable, shown once via localStorage flag):
   ```
   Welcome to AI Agencies! 🤖

   Agencies let you create teams of AI agents that work together.
   Each agent has a specialty — like a researcher, writer, or analyst.

   [Watch 60s Demo]  [Skip, Create Agency]
   ```

2. **Guided Builder Tour** (optional, triggered by "Create from Scratch"):
   - Step 1: Tooltip on "Add Agent" button: "Click to add your first agent"
   - Step 2: Tooltip on agent config: "Give your agent a role and instructions"
   - Step 3: Tooltip on communication flow: "Draw arrows to define who talks to whom"
   - Step 4: Tooltip on test panel: "Test your agency before activating"

   Implementation: Use `react-joyride` or simple spotlight overlay with localStorage progress tracking.

---

### 9.8 ISC (Intelligence Skill Creator) Integration with AgencySwarm

The existing ISC system (`skills/intelligence-skill-creator/`) is a 7-phase single-LLM pipeline that
creates skills from a text description. With AgencySwarm, ISC can be upgraded to a **multi-agent
skill creation team** — each phase handled by a specialized agent, with collaborative review and
iterative improvement driven by agent-to-agent communication rather than rigid sequential phases.

#### 9.8.1 Current ISC Architecture (v0.4.0)

```
User prompt: "Create a skill that converts Thai dates"
  ↓
python/skill.py → respond() → _detect_mode()
  ↓
CREATE mode → isc/creator.py → SkillCreator.create()
  Phase 1: _phase_plan()         → LLM (single call)
  Phase 2: _phase_schemas()      → LLM × 3 (input, output, ui)
  Phase 3: _phase_skill_md()     → LLM
  Phase 4: _phase_code()         → LLM
  Phase 5: _phase_critic()       → LLM (reviews Phase 4 output)
  Phase 6: _phase_tests()        → LLM
  Phase 7: _phase_write()        → writes files to disk
  ↓
IMPROVE mode → isc/runner.py → iterate_improve()
  Loop: evaluate → research (DuckDuckGo) → LLM patch → validate → apply → repeat
```

**Limitations of current design:**
- Single LLM does everything — no specialization
- Linear pipeline — critic (Phase 5) can only review code, not schemas or tests
- Research (DuckDuckGo) only happens in improve mode, not during creation
- No cross-phase feedback — if tests fail, must restart improve loop from scratch
- Orchestrator (`isc/orchestrator.py`) uses monolithic prompt, not structured agent communication

#### 9.8.2 Enhanced ISC with AgencySwarm — "Skill Factory Agency"

A pre-built agency template that replaces ISC's linear pipeline with collaborative agents:

```
Agency: "Skill Factory" (agency template, pre-installed)
  ↓
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Architect  │────→│   Developer  │────→│   Critic    │
│  (CEO)      │←────│              │←────│             │
│             │     │              │     │             │
│ Plans skill │     │ Writes code  │     │ Reviews all │
│ architecture│     │ + schemas    │     │ artifacts   │
│ + researches│     │ + tests      │     │             │
└──────┬──────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                     │
       │            ┌──────┴───────┐             │
       └───────────→│  Tester      │←────────────┘
                    │              │
                    │ Runs tests   │
                    │ Reports back │
                    └──────────────┘
```

**Agent definitions:**

| Agent | Role | Model | Tools | Instructions Summary |
|-------|------|-------|-------|---------------------|
| **Architect** (CEO) | Plans skill architecture, researches APIs/libraries | gpt-4o | WebSearchTool, LibrarySearchTool | "You are an expert skill architect. Given a user description, research best practices and design the skill's architecture: inputs, outputs, algorithms, language choice. Output a SkillPlan JSON." |
| **Developer** | Writes code, schemas, manifest, tests | gpt-4o | SandboxCodeTool | "You are an expert developer. Given a SkillPlan, write all skill artifacts: input.schema.json, output.schema.json, ui.schema.json, skill.md, python/skill.py (or js/skill.js), tests/tests.json. Follow SmartAIHub conventions exactly." |
| **Critic** | Reviews all artifacts for correctness, security, edge cases | claude-sonnet-4-20250514 | — (LLM-only) | "You are a senior code reviewer. Check generated skill for: correct respond() signature, stdlib-only imports, schema completeness, test coverage, security issues, Thai language support. Return issues list or LGTM." |
| **Tester** | Executes tests, reports pass/fail | gpt-4o-mini | SandboxCodeTool | "You are a QA engineer. Run the generated tests against the skill code in a sandbox. Report pass/fail with details. If tests fail, describe what went wrong clearly." |

**Communication flows:**

```
Architect → Developer  (handoff: "Here is the architecture plan, build it")
Developer → Critic     (handoff: "Review these artifacts")
Critic → Developer     (handoff: "Fix these issues: [...]" — if issues found)
Critic → Tester        (handoff: "Artifacts look good, run tests" — if LGTM)
Tester → Critic        (handoff: "Tests failed: [details]" — if failures)
Tester → Architect     (handoff: "All tests passed!" — on success)
```

**Key improvement: Iterative feedback loops** — unlike the linear pipeline, agents can
go back and forth. If Critic finds a schema issue, Developer fixes it. If Tester finds
test failures, Critic analyzes and Developer patches. Max 5 revision cycles before stopping.

#### 9.8.3 ISC Modes — Backward Compatibility

The existing ISC skill (`python/skill.py`) gains a new mode alongside `create` and `improve`:

```python
# intelligence-skill-creator/python/skill.py — updated respond()

def respond(input_text: str, context=None) -> str:
    params = _normalise(input_text, context)
    mode = _detect_mode(params)

    match mode:
        case "create":
            # Existing: single-LLM pipeline (SkillCreator.create())
            return _create_skill(params)
        case "improve":
            # Existing: evaluate → research → patch loop
            return _improve_skill(params)
        case "agency-create":
            # NEW: Multi-agent skill creation via AgencySwarm
            return _agency_create_skill(params)
        case "agency-improve":
            # NEW: Multi-agent skill improvement via AgencySwarm
            return _agency_improve_skill(params)
        case "create-agency":
            # NEW: Create an agency definition from natural language prompt
            return _create_agency_from_prompt(params)
```

**Mode detection logic:**

```python
def _detect_mode(params: dict) -> str:
    mode = params.get("mode", "auto")
    use_agency = params.get("use_agency", False)

    # Explicit create-agency mode
    if mode == "create-agency":
        return "create-agency"

    if mode == "create" and use_agency:
        return "agency-create"
    if mode == "improve" and use_agency:
        return "agency-improve"
    if mode in ("create", "improve"):
        return mode

    # "auto" mode detection
    description = params.get("description", "").lower()
    agency_keywords = ["agency", "เอเจนซี่", "ทีม ai", "multi-agent", "หลายตัว", "หลาย agent"]
    if any(kw in description for kw in agency_keywords):
        return "create-agency"

    if use_agency:
        return "agency-create" if not params.get("skill_name") else "agency-improve"
    return "create" if not params.get("skill_name") else "improve"
```

**Input schema update** (`schemas/input.schema.json`):

```json
{
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["auto", "create", "improve", "agency-create", "agency-improve", "create-agency"],
      "default": "auto",
      "description": "Operation mode. 'create-agency' creates an agency definition from prompt."
    },
    "use_agency": {
      "type": "boolean",
      "default": false,
      "description": "Use multi-agent team (AgencySwarm) for higher-quality skill creation. Costs more credits but produces better results with research and iterative review."
    },
    "agency_config": {
      "type": "object",
      "description": "Configuration overrides for create-agency mode",
      "properties": {
        "agent_count": { "type": "integer", "minimum": 2, "maximum": 8, "description": "Number of agents to create" },
        "default_model": { "type": "string", "description": "Default LLM model for agents" },
        "max_turns": { "type": "integer", "minimum": 5, "maximum": 50, "default": 25 },
        "credit_multiplier": { "type": "number", "minimum": 1.0, "maximum": 5.0, "default": 1.5 },
        "include_tools": { "type": "array", "items": { "type": "string" }, "description": "Tool types to consider: web_search, library_search, sandbox, image, video" },
        "activate_immediately": { "type": "boolean", "default": false, "description": "Activate agency right after creation" }
      }
    }
  }
}
```

**UI schema update** (`schemas/ui.schema.json`):

```json
{
  "fields": [
    {
      "key": "use_agency",
      "type": "toggle",
      "label": "🤖 Use AI Team (Agency)",
      "labelTh": "🤖 ใช้ทีม AI (เอเจนซี่)",
      "description": "Multi-agent collaboration for better results. Uses ~3-5x more credits.",
      "descriptionTh": "ทีม AI หลายตัวร่วมมือสร้าง skill คุณภาพสูง ใช้เครดิตมากขึ้น ~3-5 เท่า",
      "default": false,
      "group": "advanced",
      "showWhen": { "mode": ["create", "improve", "auto"] }
    },
    {
      "key": "mode",
      "type": "select",
      "label": "Mode",
      "labelTh": "โหมด",
      "options": [
        { "value": "auto", "label": "Auto-detect", "labelTh": "อัตโนมัติ" },
        { "value": "create", "label": "Create Skill", "labelTh": "สร้าง Skill" },
        { "value": "improve", "label": "Improve Skill", "labelTh": "ปรับปรุง Skill" },
        { "value": "create-agency", "label": "Create Agency", "labelTh": "สร้างเอเจนซี่ AI" }
      ],
      "default": "auto"
    },
    {
      "key": "agency_config.agent_count",
      "type": "slider",
      "label": "Number of Agents",
      "labelTh": "จำนวน Agent",
      "min": 2, "max": 8, "step": 1, "default": 3,
      "showWhen": { "mode": ["create-agency"] },
      "group": "agency"
    },
    {
      "key": "agency_config.activate_immediately",
      "type": "toggle",
      "label": "Activate Immediately",
      "labelTh": "เปิดใช้งานทันที",
      "description": "Make the agency available in Chat right after creation",
      "descriptionTh": "เปิดใช้เอเจนซี่ในแชทได้ทันทีหลังสร้างเสร็จ",
      "default": false,
      "showWhen": { "mode": ["create-agency"] },
      "group": "agency"
    }
  ]
}
```

#### 9.8.4 Agency-Powered Skill Creation Flow

```
User: "Create a skill that converts Thai dates. Use agency mode."
  ↓
ISC skill detect → python/skill.py → _agency_create_skill()
  ↓
Dispatch to Skill Factory Agency via agencyBridge:
  message = "Create a SmartAIHub skill: converts Thai dates between
             Buddhist Era (BE) and Common Era (CE). Support formats
             like '15/04/2567', '15 เมษายน 2567', 'ISO 2024-04-15'.
             Language: python. Complexity: moderate."
  ↓
Agent collaboration:
  [Architect] researches Thai date formats, BE/CE conversion rules
              → plans architecture with inputs/outputs/algorithms
  [Developer] generates all artifacts (schemas, code, manifest, tests)
  [Critic] reviews: "input.schema.json missing 'format' enum, skill.py
            has incorrect BE offset (should be 543, not 544)"
  [Developer] fixes both issues
  [Critic] LGTM → hands off to Tester
  [Tester] runs tests in sandbox → 5/6 pass, 1 edge case fails
  [Critic] analyzes failure → "edge case: Feb 29 in BE year"
  [Developer] patches skill.py leap year check
  [Tester] re-runs → 6/6 pass
  [Architect] "All tests pass! Skill is ready."
  ↓
ISC writes artifacts to apps/web/skills/thai-date-converter/
  ↓
Response: "✅ Skill `thai-date-converter` created by AI Team!
  📁 Files: schemas/, skill.md, python/skill.py, tests/tests.json
  🔄 2 revision cycles (schema fix + leap year edge case)
  🤖 Agents: Architect, Developer, Critic, Tester
  💰 Credits: 180 (base: 120, markup: 60 at 1.5x)"
```

#### 9.8.5 Agency-Powered Skill Improvement Flow

Replaces `isc/runner.py`'s `iterate_improve()` with agency-based improvement:

```
User: "Improve skill_math_tutor using agency"
  ↓
ISC → _agency_improve_skill()
  ↓
Skill Factory Agency receives:
  message = "Improve existing skill 'skill_math_tutor'.
             Current test results: 4/6 pass (66.7%).
             Failing tests: [test_4: missing '≈', test_6: wrong format]
             Current code: [attached]"
  ↓
Agent collaboration:
  [Architect] researches math formatting best practices
  [Developer] reads current code, proposes fixes
  [Critic] reviews fix for side effects
  [Tester] runs full test suite → validates no regressions
  ↓ (up to 5 revision cycles)
  ↓
ISC applies final patch, reports results
```

**Improvement over existing `iterate_improve()`:**
- Architect does **targeted research** (not just DuckDuckGo keyword search)
- Critic does **cross-artifact validation** (not just code review)
- Tester runs **in sandbox** (not just string matching from `evaluator.py`)
- Developer gets **structured feedback** (not just "make tests pass")

#### 9.8.6 Skill Factory Agency Template

Pre-installed agency template in `agency_templates` table:

```json
{
  "name": "Skill Factory",
  "slug": "skill-factory",
  "description": "Multi-agent team for creating and improving SmartAIHub skills",
  "isSystem": true,
  "agents": [
    {
      "name": "Architect",
      "slug": "architect",
      "role": "CEO",
      "model": "gpt-4o",
      "instructions": "You are an expert SmartAIHub skill architect...",
      "tools": ["WebSearchTool", "LibrarySearchTool"]
    },
    {
      "name": "Developer",
      "slug": "developer",
      "model": "gpt-4o",
      "instructions": "You are an expert developer who writes SmartAIHub skills...",
      "tools": ["SandboxCodeTool"]
    },
    {
      "name": "Critic",
      "slug": "critic",
      "model": "claude-sonnet-4-20250514",
      "instructions": "You are a senior code reviewer specializing in skill quality...",
      "tools": []
    },
    {
      "name": "Tester",
      "slug": "tester",
      "model": "gpt-4o-mini",
      "instructions": "You are a QA engineer who validates skills by running tests...",
      "tools": ["SandboxCodeTool"]
    }
  ],
  "communicationFlows": [
    { "from": "Architect", "to": "Developer" },
    { "from": "Developer", "to": "Critic" },
    { "from": "Critic", "to": "Developer" },
    { "from": "Critic", "to": "Tester" },
    { "from": "Tester", "to": "Critic" },
    { "from": "Tester", "to": "Architect" }
  ],
  "maxTurns": 30,
  "creditMultiplier": 1.5
}
```

#### 9.8.7 Implementation Phase

ISC integration falls into **Phase 2** (Tools & Skills Bridge) and **Phase 3** (Templates):

| Step | Phase | Description |
|------|-------|-------------|
| Create Skill Factory agency template | Phase 3 | Define agents, flows, instructions |
| Add `use_agency` to ISC input/UI schemas | Phase 2 | Schema update only |
| Add `_agency_create_skill()` to ISC skill.py | Phase 2 | Dispatch to agency via bridge |
| Add `_agency_improve_skill()` to ISC skill.py | Phase 3 | Dispatch improve mode |
| Test: create skill with agency vs without | Phase 3 | Quality comparison |
| Update ISC skill.md with agency mode docs | Phase 3 | User documentation |

**Backward compatibility**: Existing `create` and `improve` modes work exactly as before.
The `use_agency` flag is `false` by default. Users can opt-in when they want higher quality
and have sufficient credits.

#### 9.8.8 Cost Comparison

| Mode | Credits (typical) | Quality | Speed |
|------|------------------|---------|-------|
| `create` (current) | ~30-50 | Good | ~30s |
| `agency-create` (new) | ~120-200 | Higher (research + review + testing) | ~2-3 min |
| `improve` (current) | ~20-40 per round | Moderate | ~20s/round |
| `agency-improve` (new) | ~80-150 per round | Higher (structured feedback) | ~1-2 min/round |
| `create-agency` (new) | ~60-150 | Agency definition ready to use | ~1-2 min |

The agency mode costs more but produces **better results through**:
1. Research-backed architecture (Architect agent does web search + library search)
2. Cross-artifact review (Critic checks schemas + code + tests together)
3. Sandbox-based testing (Tester runs real tests, not just string matching)
4. Iterative refinement (agents go back and forth until all issues resolved)

---

#### 9.8.9 Create-Agency Mode — Generate Agency from Natural Language

This mode enables users to describe a multi-agent team in natural language and have ISC
automatically create a fully functional agency definition — agents, tools, communication flows,
instructions — all persisted to the database and ready to use.

##### 9.8.9.1 User Experience

```
User: "สร้างเอเจนซี่ทีมซัพพอร์ตลูกค้า มี 3 คน คนแรกคัดกรองปัญหา คนที่สองแก้ปัญหาเทคนิค คนที่สามดูแลเรื่องบิลลิ่ง"

ISC detects: mode = "create-agency" (keyword "เอเจนซี่" matched)

Response:
  ✅ Agency "Customer Support Team" created!

  📋 Agents (3):
    1. Triage Agent (CEO) — คัดกรองปัญหาลูกค้า routes to correct specialist
       Model: gpt-4o-mini | Tools: LibrarySearchTool
    2. Technical Support — แก้ปัญหาเทคนิคซอฟต์แวร์
       Model: gpt-4o | Tools: WebSearchTool, LibrarySearchTool
    3. Billing Support — ดูแลเรื่องบิลลิ่ง การชำระเงิน
       Model: gpt-4o-mini | Tools: none

  🔗 Communication Flows:
    Triage → Technical Support
    Triage → Billing Support
    Technical Support → Triage (escalation)
    Billing Support → Triage (escalation)

  ⚙️ Settings:
    Max turns: 15 | Credit multiplier: 1.0x | Mode: streaming

  🚀 Status: Ready (inactive — open Agency Builder to review and activate)

  [Open in Builder] [Activate Now] [Try in Chat]
```

##### 9.8.9.2 Implementation — `_create_agency_from_prompt()`

```python
# intelligence-skill-creator/python/skill.py

async def _create_agency_from_prompt(params: dict) -> str:
    """Create an agency definition from natural language description."""
    description = params["description"]
    agency_config = params.get("agency_config", {})
    user_id = params["context"]["userId"]
    tenant_id = params["context"]["tenantId"]
    user_token = params["context"]["userToken"]

    # Phase 1: LLM plans the agency architecture
    plan = await _plan_agency(description, agency_config)

    # Phase 2: Validate the plan (agent count, model availability, tool compatibility)
    validation = _validate_agency_plan(plan)
    if not validation.ok:
        return f"❌ Agency plan validation failed:\n" + "\n".join(validation.errors)

    # Phase 3: Create agency records via tRPC
    result = await _persist_agency(plan, user_id, tenant_id, user_token, agency_config)

    # Phase 4: Optionally activate
    if agency_config.get("activate_immediately", False):
        await _activate_agency(result["agencyId"], user_token)

    return _format_agency_creation_response(result, plan, agency_config)
```

##### 9.8.9.3 Phase 1 — LLM Agency Planning

The LLM receives the user's description and outputs a structured agency plan:

```python
async def _plan_agency(description: str, config: dict) -> AgencyPlan:
    """Use LLM to design an agency from natural language."""

    system_prompt = """You are an expert AI agency architect for SmartAIHub.

Given a description, design a multi-agent agency. Output JSON with this exact structure:

{
  "name": "Human-readable name",
  "slug": "kebab-case-slug",
  "description": "What this agency does (English)",
  "descriptionTh": "คำอธิบาย (ภาษาไทย)",
  "sharedInstructions": "Instructions shared across all agents (markdown)",
  "maxTurns": 25,
  "creditMultiplier": 1.5,
  "agents": [
    {
      "name": "Agent Name",
      "slug": "agent-slug",
      "role": "CEO|specialist",
      "description": "What this agent does",
      "model": "gpt-4o|gpt-4o-mini|claude-sonnet-4-20250514",
      "temperature": 0.3,
      "instructions": "Detailed system prompt for this agent (markdown, 200+ words)",
      "isEntryPoint": true|false,
      "tools": ["WebSearchTool", "LibrarySearchTool", "SandboxCodeTool", "ImageGenerationTool"],
      "conversationStarters": ["Example prompt 1", "Example prompt 2"]
    }
  ],
  "communicationFlows": [
    { "from": "agent-slug-1", "to": "agent-slug-2" }
  ]
}

Rules:
- EXACTLY ONE agent must have isEntryPoint: true (usually the CEO/coordinator)
- Entry point agent must have flows TO all other agents
- Use gpt-4o-mini for simple routing/triage, gpt-4o for complex reasoning, claude-sonnet for review
- Only assign tools that match the agent's role (don't give everyone all tools)
- Write instructions in the context of SmartAIHub — agents know they're part of a platform
- Communication flows must form a connected graph from the entry point
- Include Thai language support in descriptions when the user writes in Thai
- Agent count: minimum 2, maximum 8
"""

    user_prompt = f"""Create an agency from this description:

"{description}"

Configuration overrides:
- Preferred agent count: {config.get('agent_count', 'auto (decide based on description)')}
- Default model: {config.get('default_model', 'auto')}
- Max turns: {config.get('max_turns', 25)}
- Credit multiplier: {config.get('credit_multiplier', 1.5)}
- Available tools: {config.get('include_tools', ['web_search', 'library_search', 'sandbox'])}

Output JSON ONLY. No markdown code blocks."""

    result = llm.chat([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])
    return AgencyPlan.from_json(result)
```

**AgencyPlan dataclass:**

```python
@dataclass
class AgencyPlan:
    name: str
    slug: str
    description: str
    description_th: str
    shared_instructions: str
    max_turns: int
    credit_multiplier: float
    agents: list[AgentPlan]
    communication_flows: list[FlowPlan]

    @classmethod
    def from_json(cls, raw: str) -> "AgencyPlan":
        data = json.loads(raw.strip().removeprefix("```json").removesuffix("```"))
        return cls(
            name=data["name"],
            slug=data["slug"],
            description=data["description"],
            description_th=data.get("descriptionTh", ""),
            shared_instructions=data.get("sharedInstructions", ""),
            max_turns=data.get("maxTurns", 25),
            credit_multiplier=data.get("creditMultiplier", 1.5),
            agents=[AgentPlan(**a) for a in data["agents"]],
            communication_flows=[FlowPlan(**f) for f in data["communicationFlows"]],
        )

@dataclass
class AgentPlan:
    name: str
    slug: str
    role: str
    description: str
    model: str
    temperature: float
    instructions: str
    isEntryPoint: bool
    tools: list[str]
    conversationStarters: list[str] = field(default_factory=list)

@dataclass
class FlowPlan:
    from_slug: str  # mapped from "from" key
    to_slug: str    # mapped from "to" key
```

##### 9.8.9.4 Phase 2 — Validation

```python
@dataclass
class ValidationResult:
    ok: bool
    errors: list[str]
    warnings: list[str]

def _validate_agency_plan(plan: AgencyPlan) -> ValidationResult:
    errors = []
    warnings = []

    # 1. Exactly one entry point
    entry_points = [a for a in plan.agents if a.isEntryPoint]
    if len(entry_points) == 0:
        errors.append("No entry point agent defined. One agent must have isEntryPoint: true.")
    elif len(entry_points) > 1:
        errors.append(f"Multiple entry points: {[a.name for a in entry_points]}. Only one allowed.")

    # 2. Agent count bounds
    if len(plan.agents) < 2:
        errors.append("Agency must have at least 2 agents.")
    if len(plan.agents) > 8:
        errors.append("Agency cannot have more than 8 agents (performance limit).")

    # 3. Slug uniqueness
    slugs = [a.slug for a in plan.agents]
    if len(slugs) != len(set(slugs)):
        errors.append("Duplicate agent slugs detected.")

    # 4. Communication flows reference valid agents
    valid_slugs = set(slugs)
    for flow in plan.communication_flows:
        if flow.from_slug not in valid_slugs:
            errors.append(f"Flow references unknown agent: '{flow.from_slug}'")
        if flow.to_slug not in valid_slugs:
            errors.append(f"Flow references unknown agent: '{flow.to_slug}'")
        if flow.from_slug == flow.to_slug:
            errors.append(f"Self-loop flow: '{flow.from_slug}' → '{flow.to_slug}'")

    # 5. Entry point has outgoing flows
    if entry_points:
        ep_slug = entry_points[0].slug
        outgoing = [f for f in plan.communication_flows if f.from_slug == ep_slug]
        if not outgoing:
            errors.append(f"Entry point '{ep_slug}' has no outgoing communication flows.")

    # 6. All agents reachable from entry point (BFS)
    if entry_points and not errors:
        reachable = _bfs_reachable(entry_points[0].slug, plan.communication_flows)
        unreachable = valid_slugs - reachable
        if unreachable:
            warnings.append(f"Agents not reachable from entry point: {unreachable}")

    # 7. Valid tool names
    valid_tools = {"WebSearchTool", "LibrarySearchTool", "SandboxCodeTool",
                   "ImageGenerationTool", "VideoGenerationTool"}
    for agent in plan.agents:
        invalid = set(agent.tools) - valid_tools
        if invalid:
            warnings.append(f"Agent '{agent.name}' has unknown tools: {invalid}. They will be skipped.")

    # 8. Model validity (warn only — gateway will reject invalid models)
    known_models = {"gpt-4o", "gpt-4o-mini", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001",
                    "gemini-2.0-flash", "gpt-4-turbo"}
    for agent in plan.agents:
        if agent.model not in known_models:
            warnings.append(f"Agent '{agent.name}' uses model '{agent.model}' — verify it exists in provider config.")

    # 9. Credit multiplier bounds
    if plan.credit_multiplier < 1.0 or plan.credit_multiplier > 5.0:
        errors.append(f"Credit multiplier {plan.credit_multiplier} out of range [1.0, 5.0].")

    return ValidationResult(ok=len(errors) == 0, errors=errors, warnings=warnings)
```

##### 9.8.9.5 Phase 3 — Persist to Database

The agency definition is created via tRPC calls from Python → Node.js:

```python
async def _persist_agency(
    plan: AgencyPlan, user_id: int, tenant_id: str,
    user_token: str, config: dict,
) -> dict:
    """Create agency + agents + tools + flows via tRPC."""

    # Step 1: Create agency
    agency_result = await _call_nodejs(
        "/api/trpc/agency.create",
        {"json": {
            "name": plan.name,
            "slug": plan.slug,
            "description": plan.description,
            "sharedInstructions": plan.shared_instructions,
            "maxTurnsPerMessage": plan.max_turns,
            "creditMultiplier": plan.credit_multiplier,
            "defaultModel": config.get("default_model", "gpt-4o"),
            "templateSlug": "isc-generated",  # Mark as ISC-created
            "isEnabled": False,  # Inactive until explicitly activated
        }},
        user_token=user_token,
    )
    agency_id = agency_result["result"]["data"]["id"]

    # Step 2: Create agents
    agent_id_map = {}  # slug → DB id
    for agent in plan.agents:
        agent_result = await _call_nodejs(
            "/api/trpc/agency.createAgent",
            {"json": {
                "agencyId": agency_id,
                "name": agent.name,
                "slug": agent.slug,
                "role": agent.role,
                "description": agent.description,
                "model": agent.model,
                "temperature": agent.temperature,
                "instructions": agent.instructions,
                "isEntryPoint": agent.isEntryPoint,
                "conversationStarters": agent.conversationStarters,
            }},
            user_token=user_token,
        )
        agent_id_map[agent.slug] = agent_result["result"]["data"]["id"]

    # Step 3: Assign tools to agents
    tool_type_map = {
        "WebSearchTool": ("builtin", "WebSearchTool"),
        "LibrarySearchTool": ("library", "LibrarySearchTool"),
        "SandboxCodeTool": ("sandbox", "SandboxCodeTool"),
        "ImageGenerationTool": ("image", "ImageGenerationTool"),
        "VideoGenerationTool": ("video", "VideoGenerationTool"),
    }
    for agent in plan.agents:
        for tool_name in agent.tools:
            if tool_name in tool_type_map:
                tool_type, name = tool_type_map[tool_name]
                await _call_nodejs(
                    "/api/trpc/agency.addTool",
                    {"json": {
                        "agentId": agent_id_map[agent.slug],
                        "name": name,
                        "toolType": tool_type,
                    }},
                    user_token=user_token,
                )

    # Step 4: Create communication flows
    for flow in plan.communication_flows:
        await _call_nodejs(
            "/api/trpc/agency.createFlow",
            {"json": {
                "agencyId": agency_id,
                "fromAgentId": agent_id_map[flow.from_slug],
                "toAgentId": agent_id_map[flow.to_slug],
            }},
            user_token=user_token,
        )

    return {
        "agencyId": agency_id,
        "agentCount": len(plan.agents),
        "flowCount": len(plan.communication_flows),
        "toolCount": sum(len(a.tools) for a in plan.agents),
    }
```

##### 9.8.9.6 Phase 4 — Activation (Optional)

```python
async def _activate_agency(agency_id: str, user_token: str):
    """Enable the agency so it's available in Chat, Skills, etc."""
    await _call_nodejs(
        "/api/trpc/agency.update",
        {"json": {"id": agency_id, "isEnabled": True}},
        user_token=user_token,
    )
```

##### 9.8.9.7 Response Formatting

```python
def _format_agency_creation_response(result: dict, plan: AgencyPlan, config: dict) -> str:
    lines = [f"✅ Agency \"{plan.name}\" created!\n"]

    lines.append(f"📋 Agents ({len(plan.agents)}):")
    for i, agent in enumerate(plan.agents, 1):
        ep = " (CEO)" if agent.isEntryPoint else ""
        tools_str = ", ".join(agent.tools) if agent.tools else "none"
        lines.append(f"  {i}. {agent.name}{ep} — {agent.description}")
        lines.append(f"     Model: {agent.model} | Tools: {tools_str}")

    lines.append(f"\n🔗 Communication Flows:")
    for flow in plan.communication_flows:
        from_name = next(a.name for a in plan.agents if a.slug == flow.from_slug)
        to_name = next(a.name for a in plan.agents if a.slug == flow.to_slug)
        lines.append(f"  {from_name} → {to_name}")

    lines.append(f"\n⚙️ Settings:")
    lines.append(f"  Max turns: {plan.max_turns} | Credit multiplier: {plan.credit_multiplier}x | Mode: streaming")

    if config.get("activate_immediately"):
        lines.append(f"\n🚀 Status: Active — ready to use in Chat!")
    else:
        lines.append(f"\n🚀 Status: Created (inactive) — open Agency Builder to review and activate")

    return "\n".join(lines)
```

##### 9.8.9.8 Auto-Detection from Natural Language

When a user doesn't explicitly set `mode: "create-agency"`, ISC auto-detects agency creation
intent via keyword matching (see `_detect_mode()` above) and trigger patterns:

**Trigger patterns** (added to `skill.md`):

```yaml
triggerPatterns:
  # ... existing patterns ...
  - "create agency|build agency|สร้าง agency|สร้างเอเจนซี่|ทำเอเจนซี่"
  - "create (a |an )?team of (ai |AI )?agents"
  - "สร้างทีม (ai |AI )?agent|ออกแบบ agency"
  - "multi.?agent team|หลาย agent ทำงานร่วมกัน"
```

**Examples that trigger `create-agency` mode:**

| User Input | Detected? |
|------------|-----------|
| "สร้างเอเจนซี่ทีมวิจัย" | ✅ keyword "เอเจนซี่" |
| "Create a team of AI agents for customer support" | ✅ pattern "team of ai agents" |
| "Build an agency with 3 agents: researcher, analyst, writer" | ✅ keyword "agency" + "agents" |
| "สร้าง skill แปลงวันที่ไทย" | ❌ → normal `create` mode |
| "I need multiple agents working together on research" | ✅ keyword "หลาย agent" / "multiple agents" |

##### 9.8.9.9 Error Handling & Retry

| Error | Handling |
|-------|---------|
| LLM returns invalid JSON | Strip markdown, retry once with "Return JSON ONLY" |
| Validation fails (missing entry point) | Re-prompt LLM with specific error: "Fix: add isEntryPoint to one agent" |
| tRPC call fails (slug conflict) | Append timestamp to slug, retry: `research-team-20260227` |
| tRPC call fails (auth) | Return error: "Session expired. Please try again." |
| LLM returns >8 agents | Truncate to first 8, warn user |
| LLM returns <2 agents | Re-prompt: "Agency needs at least 2 agents. Add more." |

**Max retries**: 2 (same as existing ISC `validate_patch` retry). After 2 failures, return
partial result with error details.

##### 9.8.9.10 Implementation Phase

| Step | Phase | Description |
|------|-------|-------------|
| Add `create-agency` to ISC mode detection | Phase 3 | Update `_detect_mode()` |
| Implement `_plan_agency()` LLM call | Phase 3 | System prompt + JSON parsing |
| Implement `_validate_agency_plan()` | Phase 3 | Validation rules |
| Add `agency.create`, `agency.createAgent`, etc. tRPC mutations | Phase 1 | Part of base agency CRUD |
| Implement `_persist_agency()` | Phase 3 | Python → tRPC bridge |
| Update ISC trigger patterns | Phase 3 | skill.md patterns |
| Update ISC input.schema.json + ui.schema.json | Phase 3 | Schema changes |
| E2E test: prompt → agency → chat with it | Phase 3 | Full pipeline test |

---

### 9.9 Automated Scheduling & Trigger Signals

Agencies can be triggered automatically through multiple signal sources. This section specifies
how existing SmartSpecPro scheduling, alerts, and event systems are extended to support agency execution.

#### 9.9.1 Trigger Signal Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Agency Trigger Signal Sources                      │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  Scheduled   │  │ Event-Driven │  │ User-Action  │  │ External │ │
│  │  (Recurring) │  │  (Reactive)  │  │  (Manual)    │  │ (Webhook)│ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│         │                │                  │               │        │
│  · Cron schedule  · Alert threshold  · Chat message   · HTTP POST   │
│  · One-time date  · Skill detection  · Builder test   · Google Drive│
│  · Cloud Tasks    · Queue event      · Dashboard btn  · Stripe      │
│  · Fallback sweep · Telegram cmd     · CLI / Kilo     · Custom      │
│         │                │                  │               │        │
│         └────────────────┴──────────────────┴───────────────┘        │
│                                    │                                  │
│                            agencyBridge.ts                           │
│                           dispatchAgencyRun()                        │
│                                    │                                  │
│                        ┌───────────┴──────────┐                      │
│                        │  Agency Runtime (Py)  │                      │
│                        └──────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 9.9.2 Scheduled Triggers — Extending Existing Scheduler

**What exists**: `scheduler.ts` uses Google Cloud Tasks (production) + fallback sweep for
one-time and cron-based message delivery. Currently supports: LLM-powered messages, skill execution,
simple reminders.

**What changes**: Add `agencyId` to `scheduledMessages` table + agency dispatch path in
`deliverScheduledMessage()`. This was already specified in Section 9.4.2 — here we detail
the full scheduling UI and available configurations.

**Agency scheduling configurations:**

| Schedule Type | Cron Example | Use Case |
|--------------|-------------|----------|
| Daily morning brief | `0 8 * * *` | "Research Team: summarize today's tech news" |
| Weekly report | `0 9 * * MON` | "Content Creator: draft weekly social media plan" |
| Every 2 hours monitoring | `0 */2 * * *` | "Code Assistant: review latest commits for issues" |
| Monthly audit | `0 10 1 * *` | "Research Team: analyze monthly usage data" |
| One-time deadline | `2026-03-15T09:00:00Z` | "Spec Writer: finalize spec by deadline" |

**SchedulePanel UI extension** (`components/chat/SchedulePanel.tsx`):

Add agency picker alongside existing skill/LLM selection:

```
┌─ Create Schedule ────────────────────────────────────┐
│                                                        │
│ Type: ○ LLM Message  ○ Skill  ● Agency               │
│                                                        │
│ Agency: [Research Team  ▼]                             │
│                                                        │
│ Prompt: [Summarize today's AI news and trends    ]     │
│                                                        │
│ Schedule: ○ One-time  ● Recurring                      │
│ Cron:     [0 8 * * *]  (Every day at 8:00 AM)         │
│ Timezone: [Asia/Bangkok ▼]                             │
│                                                        │
│ Priority: ○ Low  ● Normal  ○ High  ○ Critical         │
│                                                        │
│ Notifications:                                         │
│   ☑ In-app notification when completed                │
│   ☐ Email notification                                │
│   ☐ Telegram notification                             │
│                                                        │
│ Max credits per run: [200]  (safety cap)               │
│                                                        │
│ [Cancel]                          [Create Schedule]    │
└────────────────────────────────────────────────────────┘
```

**Natural language scheduling** — The existing `chat-alert` skill (`triggerPatterns: "every day|remind me"`)
can be extended to detect agency scheduling intent:

```
User: "Every morning at 8, have the Research Team check AI news"
  ↓
chat-alert skill detects scheduling pattern
  ↓
LLM parses intent:
  { cronExpression: "0 8 * * *",
    agencyId: "research-team-001",  ← NEW: detected agency reference
    prompt: "Check AI news" }
  ↓
Schedule created with agency dispatch
```

**Implementation**: Extend `chat-alert/skill.md` system prompt to recognize agency names in the user's
request and populate `agencyId` in the parsed result.

#### 9.9.3 Event-Driven Triggers — Reactive Agency Execution

Beyond scheduled execution, agencies can react to **events** in the system:

**Trigger Type A: Alert-Based Triggers**

Extend `notificationService.ts` to support agency execution as a notification action:

```typescript
// apps/web/server/services/notificationService.ts — extended

interface NotificationAction {
  type: "link" | "dismiss" | "agency";  // ← NEW: "agency" action
  label: string;
  agencyId?: string;       // ← agency to execute
  agencyPrompt?: string;   // ← message to send to agency
}

// Example: when credit balance drops below threshold
await createNotification({
  userId,
  title: "Low credit balance",
  content: `Your credits are below ${threshold}. Automated reports may fail.`,
  type: "alert",
  priority: "high",
  actions: [
    { type: "link", label: "Buy Credits", url: "/credits" },
    { type: "agency", label: "Analyze Usage", agencyId: "usage-analyst-001",
      agencyPrompt: "Analyze my credit usage and suggest optimizations" },
  ],
});
```

**Trigger Type B: Queue Event Triggers**

When a BullMQ job completes (media generation, video rendering), optionally trigger an agency:

```typescript
// Example: after video renders, trigger content agency
worker.on("completed", async (job) => {
  if (job.data.agencyFollowUp) {
    await dispatchAgencyRun({
      agencyId: job.data.agencyFollowUp.agencyId,
      message: `Video "${job.data.title}" just finished rendering. ${job.data.agencyFollowUp.prompt}`,
      userId: job.data.userId,
      tenantId: job.data.tenantId,
    });
  }
});
```

**Trigger Type C: Webhook-Based Triggers**

External systems (Stripe, GitHub, custom) POST to webhook endpoint → agency executes:

```
POST /api/webhooks/agency/research-team
Headers: X-Webhook-Signature: sha256=abc123...
Body: { "event": "new_data_available", "source": "analytics", "data": {...} }
  ↓
Webhook handler validates HMAC signature
  ↓
Maps to agency + constructs prompt from webhook payload
  ↓
dispatchAgencyRun({ agencyId, message: constructedPrompt })
```

**Trigger Type D: Telegram Command Trigger**

Extend existing Telegram bot integration to support agency commands:

```
User in Telegram: /agency research-team "What's new in quantum computing?"
  ↓
telegramService.ts parses command
  ↓
Dispatches to Research Team agency
  ↓
Response sent back to Telegram chat
```

#### 9.9.4 Trigger Configuration — Database Schema

Store trigger configurations alongside agency definition:

```typescript
// Extend agencies.configJson with trigger configuration
interface AgencyTriggerConfig {
  triggers: AgencyTrigger[];
}

type AgencyTrigger =
  | { type: "schedule"; cronExpression: string; prompt: string; timezone: string;
      maxCreditsPerRun: number; notifyChannels: ("app" | "email" | "telegram")[]; }
  | { type: "event"; eventType: string; sourceFilter?: string;
      promptTemplate: string; /* uses {{event.data}} placeholders */ }
  | { type: "webhook"; slug: string; hmacSecret: string;
      promptTemplate: string; allowedIPs?: string[]; }
  | { type: "telegram"; command: string; description: string; }
  | { type: "queue"; queueName: string; jobStatus: "completed" | "failed";
      promptTemplate: string; };
```

**Trigger configuration UI** — added as a tab in AgencyBuilder:

```
[Agents] [Communication Flows] [Tools] [Triggers] [Settings]
                                          ↑ NEW
```

The Triggers tab shows:

```
┌─ Agency Triggers ────────────────────────────────────────────┐
│                                                                │
│ Active Triggers:                                               │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ ⏰ Schedule: "0 8 * * *" (Every day at 8 AM)            │  │
│ │    Prompt: "Summarize today's tech news"                  │  │
│ │    Max: 200 credits/run  |  Notify: App + Email           │  │
│ │    [Edit] [Pause] [Delete]                                │  │
│ └──────────────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ 🔗 Webhook: /api/webhooks/agency/research-team           │  │
│ │    Prompt template: "New event: {{event.type}} — {{data}}"│  │
│ │    HMAC: ****a1b2                                         │  │
│ │    [Edit] [Regenerate Secret] [Delete]                    │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ [+ Add Schedule Trigger]  [+ Add Webhook]  [+ Add Event]     │
└────────────────────────────────────────────────────────────────┘
```

#### 9.9.5 Safety Guards for Automated Triggers

| Guard | Rule | Implementation |
|-------|------|----------------|
| Max credits per run | Configurable per trigger (default: 200) | Check before dispatch, skip if insufficient |
| Min interval (cron) | 15 minutes minimum | Validated on creation (existing scheduler rule) |
| Max schedules per user | 50 total (existing limit) | Count includes agency schedules |
| Rate limit (webhooks) | 10 triggers per minute per agency | Redis counter with 60s TTL |
| Circuit breaker | If 3 consecutive runs fail, auto-pause trigger | Record failures in `scheduledMessageLogs` |
| Cost alert | If daily spend from triggers > threshold, notify user | Checked post-run |
| Dead letter | Failed trigger attempts logged, retried up to 3× | Cloud Tasks retry policy |

#### 9.9.6 Implementation Phase Mapping

| Feature | Phase | Dependencies |
|---------|-------|-------------|
| `agencyId` on `scheduledMessages` + `deliverScheduledMessage()` | Phase 3 | Section 9.4.2 |
| SchedulePanel agency picker UI | Phase 3 | Agency list tRPC |
| Webhook trigger endpoint | Phase 4 | Section 9.4.5 |
| Event-driven triggers (notification actions) | Phase 4 | Notification service |
| Telegram command trigger | Phase 4 | Telegram service |
| Trigger configuration UI in AgencyBuilder | Phase 4 | Builder UI |
| Natural language agency scheduling (chat-alert extension) | Phase 3 | chat-alert skill update |

---

### 9.10 Templates, Use Cases & Onboarding Examples

To ensure users can start immediately without learning from scratch, the system ships with
**pre-built agency templates**, **guided use cases**, and **interactive examples**.

#### 9.10.1 Pre-Installed Agency Templates

These templates are seeded into the database on first deployment and available to all users
in the Template Gallery (`components/agency/AgencyTemplateGallery.tsx`).

**Template 1: Research Team** (Phase 1 — ships with MVP)

```yaml
name: "Research Team"
slug: "research-team"
description: "Multi-agent research with web search, source validation, and structured analysis"
descriptionTh: "ทีมวิจัย AI ค้นหาข้อมูลจากเว็บ ตรวจสอบแหล่งข้อมูล และวิเคราะห์ผลลัพธ์อย่างเป็นระบบ"
category: "research"
difficulty: "beginner"
estimatedCostPerRun: "30-80 credits"
agents:
  - name: CEO
    role: "Coordinates research and delegates to specialists"
    model: gpt-4o
    tools: []
  - name: Researcher
    role: "Searches the web and finds relevant sources"
    model: gpt-4o
    tools: [WebSearchTool, LibrarySearchTool]
  - name: Analyst
    role: "Analyzes research findings and identifies key patterns"
    model: gpt-4o
    tools: []
  - name: Summarizer
    role: "Creates clear, structured summaries with citations"
    model: gpt-4o-mini
    tools: []
flows:
  - CEO → Researcher
  - CEO → Analyst
  - Researcher → Analyst
  - Analyst → Summarizer
  - Summarizer → CEO
maxTurns: 20
creditMultiplier: 1.5
examplePrompts:
  - "Research the latest advances in quantum computing"
  - "Compare React, Vue, and Svelte for enterprise applications"
  - "วิจัยเทรนด์ AI ในปี 2026 ที่น่าสนใจ"
```

**Template 2: Content Creator** (Phase 3)

```yaml
name: "Content Creator"
slug: "content-creator"
description: "Create blog posts, social media content, and marketing copy with SEO optimization"
descriptionTh: "สร้างบทความ โพสต์โซเชียล และเนื้อหาการตลาด พร้อม SEO อัตโนมัติ"
category: "content"
difficulty: "beginner"
estimatedCostPerRun: "40-120 credits"
agents:
  - name: ContentManager
    role: "Plans content strategy and assigns writing tasks"
    model: gpt-4o
    tools: [WebSearchTool]
  - name: Writer
    role: "Writes engaging content based on the strategy"
    model: gpt-4o
    tools: []
  - name: SEOSpecialist
    role: "Optimizes content for search engines"
    model: gpt-4o-mini
    tools: [WebSearchTool]
  - name: Editor
    role: "Reviews, polishes, and finalizes content"
    model: claude-sonnet-4-20250514
    tools: []
flows:
  - ContentManager → Writer
  - Writer → SEOSpecialist
  - SEOSpecialist → Editor
  - Editor → Writer  # revision loop
  - Editor → ContentManager  # final approval
maxTurns: 25
creditMultiplier: 1.5
examplePrompts:
  - "Write a blog post about remote work best practices"
  - "Create a Twitter thread about AI trends in 2026"
  - "เขียนบทความเกี่ยวกับการทำ Startup ในประเทศไทย"
```

**Template 3: Code Assistant** (Phase 3)

```yaml
name: "Code Assistant"
slug: "code-assistant"
description: "Multi-stage code generation with architecture review and testing"
descriptionTh: "ระบบเขียนโค้ดหลายขั้นตอน มีการออกแบบสถาปัตยกรรม รีวิว และทดสอบ"
category: "development"
difficulty: "intermediate"
estimatedCostPerRun: "50-200 credits"
agents:
  - name: Architect
    role: "Designs code architecture and chooses patterns"
    model: gpt-4o
    tools: [WebSearchTool, LibrarySearchTool]
  - name: Developer
    role: "Writes implementation code"
    model: gpt-4o
    tools: [SandboxCodeTool]
  - name: Reviewer
    role: "Reviews code for correctness, security, and best practices"
    model: claude-sonnet-4-20250514
    tools: []
  - name: QATester
    role: "Writes and runs tests"
    model: gpt-4o-mini
    tools: [SandboxCodeTool]
flows:
  - Architect → Developer
  - Developer → Reviewer
  - Reviewer → Developer  # revision loop
  - Reviewer → QATester
  - QATester → Reviewer  # if tests fail
  - QATester → Architect  # all pass → done
maxTurns: 30
creditMultiplier: 2.0
examplePrompts:
  - "Write a Python REST API for a todo list with SQLite"
  - "Refactor this function to use async/await: [paste code]"
  - "เขียน API สำหรับระบบจัดการสินค้าคลังด้วย FastAPI"
```

**Template 4: Customer Support** (Phase 3)

```yaml
name: "Customer Support"
slug: "customer-support"
description: "Specialized support routing with triage, technical, and billing agents"
descriptionTh: "ระบบซัพพอร์ตลูกค้าอัจฉริยะ มีการคัดกรอง แก้ปัญหาเทคนิค และเรื่องบิลลิ่ง"
category: "support"
difficulty: "beginner"
estimatedCostPerRun: "20-60 credits"
agents:
  - name: Triage
    role: "Classifies customer issue and routes to specialist"
    model: gpt-4o-mini
    tools: [LibrarySearchTool]
  - name: TechnicalSupport
    role: "Handles technical issues and troubleshooting"
    model: gpt-4o
    tools: [WebSearchTool, LibrarySearchTool]
  - name: BillingSupport
    role: "Handles billing, refund, and account issues"
    model: gpt-4o-mini
    tools: []
flows:
  - Triage → TechnicalSupport
  - Triage → BillingSupport
  - TechnicalSupport → Triage  # escalation
  - BillingSupport → Triage  # escalation
maxTurns: 15
creditMultiplier: 1.0
examplePrompts:
  - "I can't login to my account"
  - "I was charged twice for my subscription"
  - "ใช้งานฟีเจอร์ X ไม่ได้ ขึ้น error"
```

**Template 5: Skill Factory** (Phase 3 — ISC integration, see Section 9.8.6)

**Template 6: Data Analyst** (Phase 4)

```yaml
name: "Data Analyst"
slug: "data-analyst"
description: "Analyze data, create visualizations, and generate insights"
descriptionTh: "วิเคราะห์ข้อมูล สร้างกราฟ และสรุปข้อมูลเชิงลึก"
category: "analytics"
difficulty: "intermediate"
estimatedCostPerRun: "60-200 credits"
agents:
  - name: DataEngineer
    role: "Processes and cleans data, writes analysis code"
    model: gpt-4o
    tools: [SandboxCodeTool]
  - name: Analyst
    role: "Interprets results and identifies trends"
    model: gpt-4o
    tools: []
  - name: Visualizer
    role: "Creates charts and visual representations"
    model: gpt-4o
    tools: [SandboxCodeTool, ImageGenerationTool]
flows:
  - DataEngineer → Analyst
  - Analyst → Visualizer
  - Analyst → DataEngineer  # need more data processing
  - Visualizer → Analyst  # visualization review
maxTurns: 25
creditMultiplier: 2.0
examplePrompts:
  - "Analyze this CSV data and find trends: [paste data]"
  - "Create a dashboard summarizing our sales data"
  - "วิเคราะห์ข้อมูลยอดขาย Q1 และสรุปเทรนด์"
```

#### 9.10.2 Template Gallery UI

```
┌─ Agency Templates ─────────────────────────────────────────────────┐
│                                                                     │
│  [All]  [Research]  [Content]  [Development]  [Support]  [Analytics]│
│                                                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────────┐ │
│  │ 🔬 Research Team    │  │ ✍️ Content Creator  │  │ 💻 Code    │ │
│  │ ────────────────    │  │ ────────────────    │  │  Assistant │ │
│  │ 4 agents            │  │ 4 agents            │  │ ────────── │ │
│  │ ~30-80 credits/run  │  │ ~40-120 credits/run │  │ 4 agents   │ │
│  │ ⭐ Beginner         │  │ ⭐ Beginner         │  │ ~50-200    │ │
│  │                     │  │                     │  │ ⭐⭐ Inter  │ │
│  │ "Research any topic │  │ "Blog posts, social │  │            │ │
│  │  with web search    │  │  media, marketing   │  │ "Code gen  │ │
│  │  and analysis"      │  │  copy with SEO"     │  │  + review" │ │
│  │                     │  │                     │  │            │ │
│  │ [Use Template]      │  │ [Use Template]      │  │ [Use ...]  │ │
│  └─────────────────────┘  └─────────────────────┘  └────────────┘ │
│                                                                     │
│  ── Try It Now ──────────────────────────────────────────────────  │
│  Each template has example prompts you can try immediately:        │
│  "Research quantum computing advances" → [Try with Research Team]  │
│  "Write a blog about remote work"      → [Try with Content Creator]│
└─────────────────────────────────────────────────────────────────────┘
```

**"Use Template" flow**:
1. Click "Use Template" → creates a copy of the template under user's agencies
2. AgencyBuilder opens with pre-filled configuration
3. User can customize (rename, change models, add tools) or use as-is
4. Click "Activate" → agency is live

**"Try It Now" flow** (zero-setup):
1. Click "Try with Research Team" → opens temporary agency chat
2. Sends the example prompt to the template agency directly
3. User sees agents collaborating in real-time
4. After the run, prompt: "Save this agency to your account? [Yes] [No thanks]"

#### 9.10.3 Guided Use Cases

Each template includes detailed use case documentation accessible from the template card:

**Use Case Card** (expandable section on template):

```
┌─ Research Team — Use Cases ──────────────────────────────┐
│                                                            │
│ 📚 Academic Research                                       │
│ "Research the effectiveness of spaced repetition for       │
│  language learning. Include recent studies from 2024-2026."│
│ → Researcher searches academic databases                   │
│ → Analyst evaluates study quality                          │
│ → Summarizer creates structured literature review          │
│                                                            │
│ 📊 Market Research                                         │
│ "Analyze the Thai food delivery market. Compare top        │
│  platforms, pricing, and growth trends."                    │
│ → Researcher gathers market data                           │
│ → Analyst identifies competitive landscape                 │
│ → Summarizer creates executive brief                       │
│                                                            │
│ 🔧 Technical Research                                      │
│ "Compare PostgreSQL vs CockroachDB for our distributed     │
│  transaction workload. We need ACID compliance."            │
│ → Researcher checks documentation + benchmarks             │
│ → Analyst evaluates trade-offs for our use case            │
│ → Summarizer creates decision matrix                       │
│                                                            │
│ [Try This Example]  [Copy Prompt]                          │
└────────────────────────────────────────────────────────────┘
```

#### 9.10.4 Template Seed Data

Templates are seeded via migration script:

```typescript
// apps/web/drizzle/seed/agency-templates.ts

export const AGENCY_TEMPLATES = [
  {
    name: "Research Team",
    slug: "research-team",
    isSystem: true,      // Cannot be deleted by users
    isPublic: true,      // Visible to all tenants
    category: "research",
    difficulty: "beginner",
    // ... full template definition (see 9.10.1)
  },
  // ... other templates
];

export async function seedAgencyTemplates(db: DrizzleDB) {
  for (const template of AGENCY_TEMPLATES) {
    const existing = await db.query.agencyTemplates.findFirst({
      where: eq(agencyTemplates.slug, template.slug),
    });
    if (!existing) {
      await db.insert(agencyTemplates).values(template);
    }
  }
}
```

**Migration integration**: Called from `db:push` or initial startup.

#### 9.10.5 Domain Admin Template Management

Domain admins can control which templates are available to their tenant's users:

```
Domain Admin > Manage Agencies > Templates tab

┌─ Available Templates ──────────────────────────────────┐
│                                                          │
│ ☑ Research Team          (system)   [Can't remove]      │
│ ☑ Content Creator        (system)   [Disable for tenant]│
│ ☑ Code Assistant         (system)   [Disable for tenant]│
│ ☐ Customer Support       (disabled) [Enable for tenant] │
│ ☑ My Custom Agency       (custom)   [Edit] [Delete]     │
│                                                          │
│ [+ Create Tenant Template]  [Import from Marketplace]    │
└──────────────────────────────────────────────────────────┘
```

#### 9.10.6 Interactive Onboarding Tutorial

For first-time agency users, a step-by-step interactive tutorial:

```
Step 1/5: "What is an Agency?"
  → Brief explanation with animated diagram showing agents collaborating
  → "An agency is a team of AI agents, each with a role. They talk to each
     other to solve complex tasks that a single AI can't handle well."

Step 2/5: "Try a Pre-Built Agency"
  → Auto-selects Research Team template
  → Shows example prompt: "Research the benefits of remote work"
  → User clicks [Run] → watches agents work in real-time

Step 3/5: "Understanding the Result"
  → Highlights agent badges, handoff indicators, tool calls
  → Shows credit breakdown: "This run used 45 credits"
  → "Each agent used a different amount based on their model and task"

Step 4/5: "Customize Your Agency"
  → Opens AgencyBuilder with Research Team template
  → Guided: "Try changing the Summarizer's instructions to focus on Thai language output"
  → User makes a change → saves

Step 5/5: "What's Next?"
  → "Schedule your agency to run automatically"
  → "Create a custom agency from scratch"
  → "Browse more templates in the gallery"
  → [Finish Tutorial]
```

Implementation: `components/agency/AgencyOnboardingTutorial.tsx` — uses `react-joyride`
spotlight overlays with localStorage flag `agency-onboarding-completed`.

---

## 10. LLM Provider Integration

### 10.1 Model Routing Strategy

> **CRITICAL DESIGN DECISION**: There are two approaches to routing LLM calls from agency-swarm.
> Each has significant tradeoffs. The recommended approach is **Option B (Node.js Gateway Proxy)**.

#### Option A: Direct LitellmModel (NOT Recommended)

Using `LitellmModel` directly bypasses SmartSpecPro's existing LLM gateway:

```python
# ⚠️ NOT RECOMMENDED — Bypasses circuit breaker, audit logging, rate limiting
from agency_swarm import Agent, LitellmModel

model = LitellmModel(
    model="anthropic/claude-sonnet-4-20250514",
    api_key=decrypt(provider_config["apiKeyEncrypted"]),
)
```

**What gets bypassed**:
- Circuit breaker health tracking (`BaseLLMProvider` in gateway)
- `model_provider_map` DB-driven routing (per-tenant model→provider mapping)
- Credit deduction at gateway level (existing `deduct_credits()` in Node.js)
- Audit logging to `provider_usage_log` table + JSONL audit trail
- Rate limiting via Bottleneck + BullMQ
- Fallback logic (retry on different provider if primary fails)

#### Option B: OpenAIChatCompletionsModel via Node.js Gateway (Recommended)

Route agency-swarm LLM calls through the existing Node.js LLM gateway, following
the same pattern as the workflow engine's `LLMExecutor`:

```python
from agency_swarm import Agent, OpenAIChatCompletionsModel

def build_agent_with_ssp_gateway(agent_config: dict, user_token: str) -> Agent:
    """Create an agency-swarm Agent routed through SmartSpecPro's LLM Gateway."""

    # Point to Node.js gateway (same as LLMExecutor in workflow engine)
    model = OpenAIChatCompletionsModel(
        model=agent_config["model"],  # e.g., "gpt-4o" or "claude-sonnet-4-20250514"
        openai_client=AsyncOpenAI(
            base_url="http://localhost:3000/api/llm/v2",
            api_key=user_token,  # Node.js validates JWT
        ),
    )

    return Agent(
        name=agent_config["name"],
        model=model,
        instructions=agent_config["instructions"],
        tools=resolve_tools(agent_config["tools"], user_token),
    )
```

**Benefits**:
- All existing infrastructure (circuit breaker, audit, credits, rate limits) works unchanged
- Per-tenant model routing via `model_provider_map` table
- Credit deduction happens automatically at the gateway level
- Unified audit trail — agency LLM calls appear in same `provider_usage_log`
- No need to decrypt provider API keys in Python (keys stay in Node.js)

**Tradeoffs**:
- Extra HTTP hop (Python → Node.js → provider) adds ~5-10ms latency per LLM call
- agency-swarm's built-in cost tracking won't capture real costs (gateway handles billing)
- Node.js gateway must handle the Agents SDK's tool-calling protocol (may need adapter)

#### Option C: Hybrid (Future Optimization)

For high-throughput scenarios, use direct LitellmModel but replicate critical
gateway features in Python:

- Implement Python-side circuit breaker
- Log to `provider_usage_log` from Python via direct DB write
- Deduct credits via `CreditService` in Python
- This is Phase 4 optimization only, NOT for initial implementation

### 10.1.1 Credit Deduction Verification (CONFIRMED)

> **Verified against codebase**: When agency-swarm calls `OpenAIChatCompletionsModel` pointing
> at `localhost:3000/api/llm/v2/chat`, credits ARE automatically deducted by the existing
> gateway. No additional credit logic is needed in the agency layer for LLM calls.

**Exact flow for each agency-swarm LLM call through Node.js gateway:**

```
agency-swarm Agent → OpenAIChatCompletionsModel.create()
  → POST http://localhost:3000/api/llm/v2/chat
    Headers: Authorization: Bearer <user_token>, Cookie: token=<user_token>
    Body: { model, messages, temperature, ... }
  ↓
Node.js Gateway:
  1. guardWithCredits(req) → check auth + verify user has >= 1 credit (READ ONLY, no deduction)
  2. executeWithFallback() → resolve provider from model_provider_map → call LLM API
  3. On SUCCESS: deductCreditsForModel() → ATOMIC deduction:
     a. Calculate credits from response token usage (costUsd × 1000 × markup)
     b. UPDATE users SET credits = credits - amount WHERE credits >= amount (atomic SQL)
     c. INSERT INTO credit_transactions (audit trail)
     d. INSERT INTO provider_usage_log (analytics)
  4. On ERROR: return error, NO credits deducted (post-hoc design)
  ↓
Response: { choices, usage, _credits: { used, remaining } }
```

**What this means for agency-swarm integration:**

| Concern | Status | Details |
|---------|--------|---------|
| Per-agent-turn credit deduction | **Automatic** | Each Agent LLM call = 1 HTTP request to gateway = 1 credit deduction |
| Multi-turn conversations | **Automatic** | N turns = N HTTP requests = N credit deductions |
| Tool-calling token costs | **Automatic** | Tool call tokens included in LLM response usage |
| Cost tracking accuracy | **Automatic** | Gateway uses provider-reported cost when available |
| Insufficient credits mid-agency | **Handled** | Gateway returns 402, agency-swarm receives error |
| Free models | **Handled** | 0 credits deducted, transaction logged for audit |
| Audit trail | **Automatic** | All calls appear in `credit_transactions` + `provider_usage_log` |

**Credits NOT handled by the gateway** (agency layer must handle):
- Tool execution costs (image/video/sandbox) — these go through separate Node.js endpoints that have their own credit deduction
- Agency overhead/markup (`creditMultiplier`) — must be applied separately in `agency_credits.py`

### 10.2 Provider Mapping

| SmartSpecPro Provider | LiteLLM Model Prefix | Example |
|----------------------|---------------------|---------|
| OpenAI | `openai/` or none | `gpt-4o` |
| Anthropic | `anthropic/` | `anthropic/claude-sonnet-4-20250514` |
| Google | `gemini/` | `gemini/gemini-2.0-flash` |
| Groq | `groq/` | `groq/llama-3.3-70b` |
| OpenRouter | `openrouter/` | `openrouter/meta-llama/llama-3.1-405b` |
| Ollama (local) | `ollama/` | `ollama/llama3` |

### 10.3 Cost Calculation (Corrected for Gateway Routing + Additive Multipliers)

Since all LLM calls go through the Node.js gateway, the **base credit deduction happens automatically**.
The agency layer only handles the **agency-specific markup** (creditMultiplier).

**Multiplier stacking is ADDITIVE (Decision #11)** — not multiplicative:

```
Per LLM call:
  Base credits    = deducted automatically by Node.js gateway (post-hoc, from response.usage)

Per agency run (after all turns complete):
  Total base cost = sum of all gateway-deducted credits (read from _credits.used in each response)
  Agency markup   = Total base cost × (agency.creditMultiplier - 1.0)
  → If creditMultiplier > 1.0: deduct additional markup via POST /api/internal/credits/deduct
  → If creditMultiplier == 1.0: no additional deduction needed

When triggered via Skill Auto-Trigger (Section 9.4.1):
  Combined multiplier = 1.0 + (agency_multiplier - 1.0) + (skill_multiplier - 1.0)
  → ADDITIVE, not multiplicative
  → Example: agency=2.0x, skill=1.5x → combined = 1.0 + 1.0 + 0.5 = 2.5x (NOT 3.0x)

Tool execution credits:
  Handled separately by each tool's Node.js endpoint (not double-counted)
```

**Run-level cost tracking** is persisted in the `agency_runs` table (Decision #10):
- `baseCostUsd` — sum of all gateway-reported costs
- `markupCostUsd` — agency multiplier surcharge
- `toolCostCredits` — sum of all tool execution credits
- `totalCreditsUsed` — grand total for display and analytics

**agency-swarm's built-in `RunResult.usage`** is still useful for:
- Cross-checking against gateway-reported costs (smoke test)
- Client-side display (show cost breakdown per agent)
- Populating `agency_runs.totalTokens`

---

## 11. Security Considerations

### 11.1 Tenant Isolation & Cross-Tenant Sharing

**Isolation (default)**: Agency runtime data is strictly scoped by `tenantId`:
- `user_context` carries tenant metadata to all agent tools
- Tool execution respects existing SmartSpecPro permission model
- Sandbox tools use tenant's sandbox policy (concurrency limits, network rules)

**Intra-tenant sharing (groups)**: Agency owners can share agencies with groups in the same tenant (see Section 11.7). This is a live reference — group members use the original agency, credits from runner's account. No admin approval needed.

**Cross-tenant sharing (marketplace)**: Agency **definitions** may be shared via templates:

| Shareable | NOT Shareable (Ever) |
|-----------|---------------------|
| Agency definition (name, description, config) | Memory (entity memories, episodic memory) |
| Prompt structure (agent instructions) | Thread/conversation data |
| Role graph (communication flows) | Logs and audit trail |
| Tool manifest (which tools are assigned) | Artifacts (generated media, files) |
| Policy presets (guardrails, limits) | Secrets (API keys, tokens) |
| | Usage/billing data |
| | Live configuration overrides |

When a tenant imports a shared agency template, a **full copy** is created under their `tenantId`.
The template and the copy have no runtime relationship — changes to one do not affect the other.

### 11.2 Tool Security

- Custom tools (user-defined) MUST run in OpenSandbox — never in core process
- Built-in tools (web search, image gen) use existing SmartSpecPro rate limits
- Skill-based tools inherit skill's permission model (skill_permissions table)
- HTTP tools require explicit URL whitelist per tenant

### 11.3 Prompt Injection Defense

- Agent instructions are stored as plaintext in DB (`instructions` text column) — this is acceptable because they are tenant-owned configuration, not secrets. However, `shared_instructions` containing sensitive business logic SHOULD use `encrypt()` from `crypto.ts` if the tenant requires confidentiality
- Input guardrails validate user messages before processing
- Output guardrails validate agent responses before returning to user
- `shared_instructions` include tenant-specific safety rules
- Tool outputs are sanitized before being passed back to agents (strip internal URLs, tokens, stack traces)

### 11.4 Resource Limits

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Max agents per agency | 10 | DB constraint |
| Max concurrent agency sessions per tenant | 5 | Redis counter |
| Max turns per message | 25 (configurable) | agency-swarm config |
| Max tokens per turn | 4096 (configurable) | ModelSettings |
| Max conversation length | 100 messages | Application logic |
| Max tool executions per turn | 10 | Application logic |
| Max sandbox jobs per agency run | 3 | Policy check |
| Agency creation per tenant per day | 20 | Rate limit |

### 11.5 Agency Marketplace — Sharing with Admin Approval

Users can publish their agencies to a marketplace for other users/tenants to use. **All shared
agencies require admin approval** before becoming visible to others. The creator can always use
their own agency immediately.

#### 11.5.1 Marketplace Lifecycle

```
Creator creates agency → uses it immediately (own tenant)
   ↓
Creator clicks "Publish to Marketplace"
   ↓
Agency enters "pending_review" state
   ↓
Admin sees in Admin Panel > Agencies > Marketplace Queue
   ↓
Admin reviews: instructions, tools, guardrails, communication flows
   ↓
  ├─ APPROVE → status = "published" → visible to all tenants
  ├─ REJECT  → status = "rejected"  → creator notified with reason
  └─ REQUEST_CHANGES → status = "changes_requested" → creator edits & resubmits
```

#### 11.5.2 Database Schema — Marketplace Fields

Extend `agencies` table (already has `isPublic` boolean):

```typescript
// apps/web/drizzle/schema.ts — extend agencies table

// Replace simple isPublic boolean with marketplace status
marketplaceStatus: varchar("marketplaceStatus", { length: 30 })
  .default("private").notNull(),
  // "private"           — only creator's tenant can use
  // "pending_review"    — submitted for marketplace, awaiting admin
  // "changes_requested" — admin wants modifications before approval
  // "published"         — visible to all tenants in marketplace
  // "rejected"          — admin rejected (reason stored in marketplaceReviewNotes)
  // "suspended"         — admin suspended a previously published agency

marketplaceReviewNotes: text("marketplaceReviewNotes"),  // Admin's feedback
marketplaceReviewedBy: integer("marketplaceReviewedBy")
  .references(() => users.id),
marketplaceReviewedAt: timestamp("marketplaceReviewedAt", { withTimezone: true }),
marketplaceSubmittedAt: timestamp("marketplaceSubmittedAt", { withTimezone: true }),

// Marketplace metadata
marketplaceCategory: varchar("marketplaceCategory", { length: 50 }),
  // "research", "content", "development", "support", "analytics", "custom"
marketplaceRating: numeric("marketplaceRating", { precision: 3, scale: 2 }),  // Avg user rating
marketplaceInstalls: integer("marketplaceInstalls").default(0),
marketplaceFeatured: boolean("marketplaceFeatured").default(false),
```

#### 11.5.3 Admin Review Panel

New section in `AdminAgencies.tsx` — "Marketplace Queue" tab:

```
┌─ Marketplace Queue ─────────────────────────────────────────────────┐
│                                                                       │
│ Pending Review (3)                                                    │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ 📊 SEO Analyzer Team          by user42 (TenantA)    2h ago      │ │
│ │ 4 agents | Tools: WebSearch, LibrarySearch                        │ │
│ │ Category: content                                                  │ │
│ │                                                                    │ │
│ │ [Review Details]   [Approve ✅]  [Request Changes ⚠️]  [Reject ❌] │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ Review Detail (expanded):                                             │
│ ┌───────────────────────────────────────────────────────────────────┐ │
│ │ Agents:                                                            │ │
│ │   1. Coordinator (CEO) — gpt-4o — "Route SEO tasks..."           │ │
│ │   2. Keyword Researcher — gpt-4o — "Research keywords..."        │ │
│ │   3. Content Auditor — claude-sonnet — "Audit page content..."   │ │
│ │   4. Report Writer — gpt-4o-mini — "Generate SEO report..."      │ │
│ │                                                                    │ │
│ │ Communication Flows:                                               │ │
│ │   Coordinator → Keyword Researcher                                │ │
│ │   Coordinator → Content Auditor                                   │ │
│ │   Keyword Researcher → Report Writer                              │ │
│ │   Content Auditor → Report Writer                                 │ │
│ │   Report Writer → Coordinator                                     │ │
│ │                                                                    │ │
│ │ ⚠️ Security Checklist:                                             │ │
│ │   ☑ No hardcoded API keys in instructions                        │ │
│ │   ☑ No instructions to bypass safety rules                       │ │
│ │   ☑ Tools are standard (no custom HTTP endpoints)                 │ │
│ │   ☑ Credit multiplier reasonable (1.5x)                           │ │
│ │   ☐ Guardrails configured (WARNING: no input guardrails)         │ │
│ │                                                                    │ │
│ │ Admin Notes: [                                          ]          │ │
│ │ [Approve ✅]  [Request Changes ⚠️]  [Reject ❌]                    │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

#### 11.5.4 Automated Safety Checks (Pre-Review)

Before an agency enters the admin review queue, automated checks run:

| Check | Severity | Auto-Action |
|-------|----------|-------------|
| Instructions contain API keys/tokens | BLOCK | Reject immediately, notify creator |
| Instructions contain `ignore previous`, `system prompt`, jailbreak patterns | WARN | Flag for admin, highlight in review |
| Credit multiplier > 3.0x | WARN | Flag for admin review |
| No input guardrails on entry point agent | WARN | Recommend adding guardrails |
| Uses custom HTTP tools (not standard toolset) | BLOCK | Require admin whitelist of URLs |
| Agent count > 6 | INFO | Suggest optimization |
| Sandbox tool without guardrails | WARN | Flag potential code injection risk |
| Instructions reference specific users/tenants | BLOCK | Cross-tenant data leak risk |

```typescript
// apps/web/server/services/agencyMarketplaceReview.ts

interface AutoReviewResult {
  canProceedToReview: boolean;  // false = auto-blocked
  findings: Finding[];
}

interface Finding {
  severity: "block" | "warn" | "info";
  check: string;
  message: string;
  agentName?: string;
  lineReference?: string;
}

async function autoReviewAgency(agencyId: string): Promise<AutoReviewResult> {
  const agency = await loadAgencyWithRelations(agencyId);
  const findings: Finding[] = [];

  // Check all agent instructions for dangerous patterns
  for (const agent of agency.agents) {
    // API key detection
    if (/(?:sk-|pk_|api[_-]?key|token|secret)[a-zA-Z0-9_-]{10,}/i.test(agent.instructions)) {
      findings.push({
        severity: "block",
        check: "secret_in_instructions",
        message: `Agent "${agent.name}" instructions may contain an API key or secret`,
        agentName: agent.name,
      });
    }

    // Jailbreak pattern detection
    const jailbreakPatterns = [
      /ignore (all )?previous/i,
      /reveal (your |the )?system prompt/i,
      /you are now/i,
      /DAN mode/i,
      /bypass (safety|filter|content)/i,
    ];
    for (const pattern of jailbreakPatterns) {
      if (pattern.test(agent.instructions)) {
        findings.push({
          severity: "warn",
          check: "jailbreak_pattern",
          message: `Agent "${agent.name}" instructions contain suspicious pattern: ${pattern}`,
          agentName: agent.name,
        });
      }
    }

    // Cross-tenant reference detection
    if (/tenant[_-]?id|specific (user|tenant)|user\s+\d+/i.test(agent.instructions)) {
      findings.push({
        severity: "block",
        check: "cross_tenant_reference",
        message: `Agent "${agent.name}" instructions reference specific tenants/users`,
        agentName: agent.name,
      });
    }
  }

  // Check tools
  for (const agent of agency.agents) {
    for (const tool of agent.tools) {
      if (tool.toolType === "http" && !tool.configJson?.urlWhitelist) {
        findings.push({
          severity: "block",
          check: "unwhitelisted_http_tool",
          message: `Agent "${agent.name}" uses HTTP tool without URL whitelist`,
          agentName: agent.name,
        });
      }
    }
  }

  const hasBlockers = findings.some(f => f.severity === "block");
  return { canProceedToReview: !hasBlockers, findings };
}
```

#### 11.5.5 Marketplace Install Flow

When a user installs a marketplace agency:

```
User browses Marketplace → clicks "Install" on "SEO Analyzer Team"
  ↓
System creates a FULL COPY under user's tenant:
  - New agencies record (new id, user's tenantId, user's userId as createdBy)
  - New agency_agents records (copied instructions, models, tools)
  - New agency_communication_flows records
  - New agency_tools records
  - templateSlug = original agency's slug (tracks origin)
  ↓
Copy is INDEPENDENT — user can customize:
  - Change agent instructions
  - Swap models
  - Add/remove tools
  - Modify communication flows
  ↓
Changes to the marketplace original do NOT propagate to installed copies
(no "update available" system — each installation is fully independent)
```

**Key rule**: The installed copy has **no runtime link** to the original. No shared memory,
no shared conversations, no shared configuration. This is critical for tenant isolation.

#### 11.5.6 Marketplace tRPC Endpoints

```typescript
// apps/web/server/routers/agency.ts — marketplace procedures

// Submit for marketplace review
submitToMarketplace: protectedProcedure
  .input(z.object({
    agencyId: z.string(),
    category: z.enum(["research", "content", "development", "support", "analytics", "custom"]),
  }))
  .mutation(async ({ input, ctx }) => {
    // Verify ownership
    // Run autoReviewAgency()
    // If no blockers: set marketplaceStatus = "pending_review"
    // If blockers: return { blocked: true, findings }
  }),

// Admin: review marketplace submission
reviewMarketplaceSubmission: adminProcedure
  .input(z.object({
    agencyId: z.string(),
    decision: z.enum(["approve", "reject", "request_changes"]),
    notes: z.string().optional(),
  }))
  .mutation(/* ... */),

// Browse marketplace (public agencies)
browseMarketplace: protectedProcedure
  .input(z.object({
    category: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.enum(["installs", "rating", "newest"]).default("installs"),
    limit: z.number().default(20),
    offset: z.number().default(0),
  }))
  .query(/* ... */),

// Install marketplace agency (creates copy under user's tenant)
installFromMarketplace: protectedProcedure
  .input(z.object({ agencyId: z.string() }))
  .mutation(/* ... */),

// Rate a marketplace agency
rateMarketplaceAgency: protectedProcedure
  .input(z.object({
    agencyId: z.string(),
    rating: z.number().min(1).max(5),
  }))
  .mutation(/* ... */),
```

### 11.6 Agency Execution Sandbox Safety

All agency code execution runs in an isolated, controlled environment. This section specifies
the safety boundaries that ensure agencies cannot harm the platform or leak data.

#### 11.6.1 Execution Isolation Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    SmartSpecPro Platform                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Agency Runtime (Python Backend)                 │ │
│  │                                                               │ │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │ │
│  │  │  Agent LLM   │   │  Agent LLM   │   │  Agent LLM   │    │ │
│  │  │  Calls       │   │  Calls       │   │  Calls       │    │ │
│  │  │ (via gateway) │   │ (via gateway) │   │ (via gateway) │    │ │
│  │  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘    │ │
│  │         │                  │                   │             │ │
│  │         └─────── All go through ──────────────┘             │ │
│  │                    │                                          │ │
│  │            Node.js LLM Gateway                               │ │
│  │            (auth, credits, rate limit, audit)                │ │
│  └──────────────────────┬──────────────────────────────────────┘ │
│                          │                                        │
│  ┌───────── Tool Execution Boundaries ─────────────────────────┐ │
│  │                                                               │ │
│  │  SAFE (in-process):          SANDBOXED (isolated):           │ │
│  │  ├── WebSearchTool           ├── SandboxCodeTool             │ │
│  │  │   (read-only web)         │   (OpenSandbox container)     │ │
│  │  ├── LibrarySearchTool       │   - No network (default)      │ │
│  │  │   (read-only DB query)    │   - CPU/memory limits         │ │
│  │  └── ImageGenerationTool     │   - Timeout enforcement       │ │
│  │      (API call via gateway)  │   - File system isolation     │ │
│  │                              └── Custom tools (HTTP)          │ │
│  │                                  (URL whitelist enforced)     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

#### 11.6.2 Safety Rules by Tool Type

| Tool Type | Execution Environment | Network | Filesystem | Credential Access |
|-----------|----------------------|---------|------------|-------------------|
| LLM calls | Node.js gateway | Internet (provider APIs only) | None | Gateway manages keys |
| WebSearchTool | In-process (agency-swarm built-in) | Internet (search engines) | None | None |
| LibrarySearchTool | Node.js tRPC | Internal only | None | User's JWT (read-only) |
| ImageGenerationTool | Node.js tRPC → media provider | Internet (provider API) | Temp output | Gateway manages keys |
| VideoGenerationTool | Node.js tRPC → Celery → provider | Internet (provider API) | Temp output | Gateway manages keys |
| SandboxCodeTool | **OpenSandbox container** | **Disabled by default** | **Isolated volume** | **None** |
| Custom HTTP tools | **Blocked unless whitelisted** | **Whitelist only** | None | **None** |

#### 11.6.3 Sandbox Code Execution — Safety Guarantees

When agents use `SandboxCodeTool`, code runs in OpenSandbox with these enforced limits:

```typescript
// Sandbox profile for agency code execution
const agencyProfile: SandboxProfile = {
  name: "agency-code",
  cpuLimit: "1.0",           // 1 CPU core max
  memoryLimitMb: 512,        // 512 MB RAM max
  timeoutSeconds: 60,        // 60 second max execution
  networkEnabled: false,      // NO network access (default)
  filesystemReadOnly: true,   // Read-only root filesystem
  writablePaths: ["/tmp"],    // Only /tmp writable (cleaned after execution)
  maxOutputBytes: 1_048_576,  // 1 MB max output
  maxProcesses: 10,           // Max 10 child processes
};
```

**Why this matters for marketplace agencies**: When a user installs an agency from the
marketplace, any SandboxCodeTool calls made by that agency's agents are contained. Even if
the marketplace agency's instructions contain malicious code execution attempts:

- Code cannot access the host filesystem
- Code cannot make network calls (no exfiltration)
- Code is time-limited (no crypto mining)
- Code runs under a non-root user
- Output is size-limited (no disk bombs)

#### 11.6.4 Marketplace Agency Risk Classification

Agencies in the marketplace are classified by risk level based on their tool usage:

| Risk Level | Tools Used | Admin Review Required? | Additional Restrictions |
|------------|-----------|----------------------|------------------------|
| **Low** | LLM-only (no tools) | Yes (standard review) | None |
| **Low** | WebSearchTool, LibrarySearchTool only | Yes (standard review) | None |
| **Medium** | ImageGenerationTool, VideoGenerationTool | Yes (standard review) | Credit warning to installer |
| **High** | SandboxCodeTool | Yes + **security deep review** | Must have input guardrails |
| **Critical** | Custom HTTP tools | Yes + **security deep review** + URL whitelist | Admin must approve each URL |

Admin dashboard shows risk level badge on each marketplace submission:

```
🟢 Low Risk — LLM + search only
🟡 Medium Risk — uses media generation
🟠 High Risk — uses sandbox code execution
🔴 Critical Risk — uses custom HTTP endpoints
```

#### 11.6.5 Runtime Safety Monitoring

When a marketplace-installed agency runs, additional safety checks apply:

```typescript
// apps/web/server/services/agencyBridge.ts — enhanced for marketplace agencies

async function dispatchAgencyRun(params: AgencyRunParams) {
  const agency = await loadAgency(params.agencyId);

  // Extra checks for marketplace-installed agencies (templateSlug !== null)
  if (agency.templateSlug && agency.templateSlug !== "isc-generated") {
    // 1. Enforce sandbox-only code execution (no escape)
    params.forceSandbox = true;

    // 2. Apply stricter resource limits
    params.maxTurns = Math.min(params.maxTurns || 25, 20);  // Cap at 20
    params.maxCredits = Math.min(params.maxCredits || 500, 200);  // Cap at 200

    // 3. Log with marketplace flag for audit
    params.auditMetadata = {
      ...params.auditMetadata,
      isMarketplaceInstall: true,
      originalAgencySlug: agency.templateSlug,
    };
  }

  // Standard dispatch...
}
```

#### 11.6.6 Implementation Phase

| Step | Phase | Description |
|------|-------|-------------|
| Add `marketplaceStatus` + review fields to schema | Phase 3 | DB migration |
| Implement `autoReviewAgency()` safety checks | Phase 4 | Pre-review automation |
| Admin marketplace review panel | Phase 4 | UI in AdminAgencies |
| `submitToMarketplace` + `reviewMarketplaceSubmission` tRPC | Phase 4 | API |
| `browseMarketplace` + `installFromMarketplace` tRPC | Phase 4 | API |
| Marketplace browse UI (user-facing) | Phase 4 | Template gallery extension |
| Sandbox profile for agency code execution | Phase 2 | Sandbox config |
| Runtime safety monitoring for marketplace agencies | Phase 4 | Agency bridge enhancement |
| Rating system | Phase 4 | Simple 1-5 star |

### 11.7 Group-Scoped Agency Sharing — User-Controlled

Unlike the marketplace (Section 11.5) which requires admin approval, group-scoped sharing gives **agency owners** full control over who can use their agencies. Since groups are created and managed by the user themselves, no admin approval is needed for group sharing.

**Sharing hierarchy:**

```
┌─────────────────────────────────────────────────────┐
│ Agency Visibility Levels                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Private (default)                               │
│     └─ Only the creator can use                     │
│                                                     │
│  2. Group-shared (NEW — no admin approval)          │
│     └─ Creator shares with selected groups          │
│     └─ Group members can USE but not MODIFY         │
│     └─ Creator can revoke at any time               │
│                                                     │
│  3. Marketplace (admin approval required)           │
│     └─ Published to all tenants                     │
│     └─ Full copy on install (no runtime link)       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 11.7.1 Design Principles

1. **User autonomy**: The agency owner (creator) decides which groups get access — no admin involved
2. **Group ownership**: Only group owners/admins can accept shared agencies into their group (prevents spam sharing)
3. **Use-only access**: Group members can run the shared agency but cannot edit, duplicate, or re-share it
4. **Instant revocation**: Creator can remove group access immediately; ongoing runs complete but new runs are blocked
5. **Same-tenant only**: Group sharing is limited to groups within the same tenant (cross-tenant sharing goes through marketplace)
6. **Credits from runner**: When a group member runs a shared agency, credits are deducted from the runner's account, not the creator's

#### 11.7.2 Database Schema — Agency Permissions Table

Following the established `libraryPermissions` pattern (see `apps/web/drizzle/schema.ts:1704`):

```typescript
// apps/web/drizzle/schema.ts — NEW table

export const agencyPermissions = pgTable("agency_permissions", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  agencyId: varchar("agencyId", { length: 36 }).notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),

  // Who has access — mirrors libraryPermissions pattern
  subjectType: varchar("subjectType", { length: 32 }).notNull(),
    // "group"  — shared with a group (subjectId = group.id)
    // "user"   — shared with individual user (subjectId = users.id)
    //             (future: direct user sharing without group)
  subjectId: varchar("subjectId", { length: 64 }).notNull(),
    // group.id (integer as string) when subjectType = "group"
    // users.id (integer as string) when subjectType = "user"

  // Permission level
  permissionLevel: varchar("permissionLevel", { length: 32 }).notNull().default("use"),
    // "use"    — can run the agency (default)
    // "manage" — can run + view config (not edit)
    //             (future: "edit" level for co-editors)

  // Tracking
  grantedByUserId: integer("grantedByUserId").notNull()
    .references(() => users.id),
  expiresAt: timestamp("expiresAt", { withTimezone: true }),  // Optional TTL
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Each subject can only have one permission entry per agency
  uniqueIndex("agency_permissions_subject_unique")
    .on(t.agencyId, t.subjectType, t.subjectId),

  // Fast lookup: "which agencies can this group access?"
  index("agency_permissions_subject_idx")
    .on(t.tenantId, t.subjectType, t.subjectId),

  // Optimize group permission lookups
  index("agency_permissions_group_idx")
    .on(t.subjectId, t.subjectType)
    .where(sql`"subjectType" = 'group'`),
]);

export type AgencyPermission = typeof agencyPermissions.$inferSelect;
export type InsertAgencyPermission = typeof agencyPermissions.$inferInsert;
```

#### 11.7.3 Access Resolution Logic

When listing available agencies for a user, the system resolves access through multiple paths:

```typescript
// apps/web/server/services/agencyAccessService.ts

/**
 * Get all agencies accessible by a user, combining:
 * 1. Agencies the user created (direct ownership)
 * 2. Agencies shared with groups the user belongs to
 * 3. Marketplace-installed agencies in the user's tenant
 */
async function getAccessibleAgencies(
  userId: number,
  tenantId: string
): Promise<AgencyWithAccess[]> {
  // 1. User's own agencies
  const ownAgencies = await db.select()
    .from(agencies)
    .where(and(
      eq(agencies.tenantId, tenantId),
      eq(agencies.createdBy, userId),
      eq(agencies.isEnabled, true),
    ));

  // 2. Group-shared agencies
  //    Step a: Get user's active group memberships
  const userGroups = await db.select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(
      eq(groupMembers.userId, userId),
      eq(groupMembers.status, "active"),
    ));

  const groupIds = userGroups.map(g => String(g.groupId));

  //    Step b: Find agencies shared with those groups
  const groupSharedAgencies = groupIds.length > 0
    ? await db.select({
        agency: agencies,
        permission: agencyPermissions,
      })
      .from(agencyPermissions)
      .innerJoin(agencies, eq(agencyPermissions.agencyId, agencies.id))
      .where(and(
        eq(agencyPermissions.tenantId, tenantId),
        eq(agencyPermissions.subjectType, "group"),
        inArray(agencyPermissions.subjectId, groupIds),
        eq(agencies.isEnabled, true),
        // Check TTL
        or(
          isNull(agencyPermissions.expiresAt),
          gt(agencyPermissions.expiresAt, new Date()),
        ),
      ))
    : [];

  // 3. Marketplace-installed agencies (belong to tenant, not created by user)
  const marketplaceAgencies = await db.select()
    .from(agencies)
    .where(and(
      eq(agencies.tenantId, tenantId),
      ne(agencies.createdBy, userId),
      eq(agencies.isEnabled, true),
      eq(agencies.marketplaceStatus, "installed"),
    ));

  // Deduplicate (user might own + be in a group that has access)
  const seen = new Set<string>();
  const result: AgencyWithAccess[] = [];

  for (const a of ownAgencies) {
    seen.add(a.id);
    result.push({ ...a, accessType: "owner" });
  }
  for (const { agency, permission } of groupSharedAgencies) {
    if (!seen.has(agency.id)) {
      seen.add(agency.id);
      result.push({
        ...agency,
        accessType: "group",
        groupId: permission.subjectId,
        permissionLevel: permission.permissionLevel,
      });
    }
  }
  for (const a of marketplaceAgencies) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      result.push({ ...a, accessType: "marketplace" });
    }
  }

  return result;
}
```

**Access type badge in UI:**

| `accessType` | Badge | Color | Tooltip |
|-------------|-------|-------|---------|
| `"owner"` | "My Agency" | Blue | "You created this agency" |
| `"group"` | "Shared" | Green | "Shared by {creatorName} via {groupName}" |
| `"marketplace"` | "Marketplace" | Purple | "Installed from marketplace" |

#### 11.7.4 Authorization Enforcement

```typescript
// apps/web/server/services/agencyAuthService.ts

/**
 * Check if a user can perform an action on an agency.
 * Called by tRPC middleware before any agency operation.
 */
async function checkAgencyAccess(
  userId: number,
  tenantId: string,
  agencyId: string,
  action: "use" | "edit" | "delete" | "share" | "manage"
): Promise<{ allowed: boolean; reason?: string }> {

  const agency = await db.select().from(agencies)
    .where(eq(agencies.id, agencyId)).limit(1).then(r => r[0]);

  if (!agency) return { allowed: false, reason: "Agency not found" };
  if (agency.tenantId !== tenantId) return { allowed: false, reason: "Tenant mismatch" };

  // Owner can do everything
  if (agency.createdBy === userId) return { allowed: true };

  // Non-owners: check action-specific rules
  switch (action) {
    case "use": {
      // Check group permissions
      const hasGroupAccess = await _checkGroupAccess(userId, agencyId, tenantId);
      if (hasGroupAccess) return { allowed: true };
      // Check marketplace install
      if (agency.marketplaceStatus === "installed") return { allowed: true };
      return { allowed: false, reason: "No access to this agency" };
    }
    case "manage": {
      const perm = await _getPermission(userId, agencyId, tenantId);
      return perm?.permissionLevel === "manage"
        ? { allowed: true }
        : { allowed: false, reason: "Manage access required" };
    }
    case "edit":
    case "delete":
    case "share":
      return { allowed: false, reason: "Only the agency owner can " + action };
  }
}

async function _checkGroupAccess(
  userId: number, agencyId: string, tenantId: string
): Promise<boolean> {
  // Single query: join agencyPermissions → group_members
  const result = await db.select({ id: agencyPermissions.id })
    .from(agencyPermissions)
    .innerJoin(groupMembers,
      and(
        eq(groupMembers.groupId, sql`CAST(${agencyPermissions.subjectId} AS INTEGER)`),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      )
    )
    .where(and(
      eq(agencyPermissions.agencyId, agencyId),
      eq(agencyPermissions.tenantId, tenantId),
      eq(agencyPermissions.subjectType, "group"),
      or(
        isNull(agencyPermissions.expiresAt),
        gt(agencyPermissions.expiresAt, new Date()),
      ),
    ))
    .limit(1);

  return result.length > 0;
}
```

**Caching**: Group access checks use Redis with 60s TTL (matching existing group cache pattern):

```typescript
const cacheKey = `agency_access:${userId}:${agencyId}`;
const cached = await redis.get(cacheKey);
if (cached !== null) return cached === "1";

const hasAccess = await _checkGroupAccess(userId, agencyId, tenantId);
await redis.set(cacheKey, hasAccess ? "1" : "0", "EX", 60);

// Invalidate on permission change
async function invalidateAgencyAccessCache(agencyId: string): Promise<void> {
  const keys = await redis.keys(`agency_access:*:${agencyId}`);
  if (keys.length > 0) await redis.del(...keys);
}
```

#### 11.7.5 tRPC Endpoints — Group Sharing

```typescript
// apps/web/server/routers/agency.ts — extend agency router

// Share an agency with a group
shareWithGroup: protectedProcedure
  .input(z.object({
    agencyId: z.string().uuid(),
    groupId: z.number().int().positive(),
    permissionLevel: z.enum(["use", "manage"]).default("use"),
    expiresAt: z.string().datetime().optional(),  // ISO timestamp, optional TTL
  }))
  .mutation(async ({ input, ctx }) => {
    // 1. Verify caller owns the agency
    const agency = await db.select().from(agencies)
      .where(and(
        eq(agencies.id, input.agencyId),
        eq(agencies.createdBy, ctx.user.id),
        eq(agencies.tenantId, ctx.user.tenantId),
      )).limit(1).then(r => r[0]);
    if (!agency) throw new TRPCError({ code: "NOT_FOUND" });

    // 2. Verify group exists and is in same tenant
    const group = await db.select().from(userGroups)
      .where(and(
        eq(userGroups.id, input.groupId),
        eq(userGroups.tenantId, ctx.user.tenantId),
      )).limit(1).then(r => r[0]);
    if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });

    // 3. Verify caller is group owner or admin (prevent sharing to unrelated groups)
    const callerMembership = await db.select().from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, ctx.user.id),
        eq(groupMembers.status, "active"),
        inArray(groupMembers.role, ["admin"]),
      )).limit(1).then(r => r[0]);
    const isGroupOwner = group.ownerId === ctx.user.id;
    if (!isGroupOwner && !callerMembership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You must be the group owner or admin to share agencies with this group",
      });
    }

    // 4. Upsert permission
    await db.insert(agencyPermissions).values({
      tenantId: ctx.user.tenantId,
      agencyId: input.agencyId,
      subjectType: "group",
      subjectId: String(input.groupId),
      permissionLevel: input.permissionLevel,
      grantedByUserId: ctx.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).onConflictDoUpdate({
      target: [agencyPermissions.agencyId, agencyPermissions.subjectType, agencyPermissions.subjectId],
      set: {
        permissionLevel: input.permissionLevel,
        grantedByUserId: ctx.user.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        updatedAt: new Date(),
      },
    });

    // 5. Invalidate cache
    await invalidateAgencyAccessCache(input.agencyId);

    return { success: true };
  }),

// Revoke group sharing
revokeGroupSharing: protectedProcedure
  .input(z.object({
    agencyId: z.string().uuid(),
    groupId: z.number().int().positive(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Verify caller owns the agency
    const agency = await db.select().from(agencies)
      .where(and(
        eq(agencies.id, input.agencyId),
        eq(agencies.createdBy, ctx.user.id),
      )).limit(1).then(r => r[0]);
    if (!agency) throw new TRPCError({ code: "NOT_FOUND" });

    await db.delete(agencyPermissions).where(and(
      eq(agencyPermissions.agencyId, input.agencyId),
      eq(agencyPermissions.subjectType, "group"),
      eq(agencyPermissions.subjectId, String(input.groupId)),
    ));

    await invalidateAgencyAccessCache(input.agencyId);

    return { success: true };
  }),

// List groups an agency is shared with (for the owner's sharing management UI)
getAgencySharedGroups: protectedProcedure
  .input(z.object({ agencyId: z.string().uuid() }))
  .query(async ({ input, ctx }) => {
    // Verify caller owns the agency
    const agency = await db.select().from(agencies)
      .where(and(
        eq(agencies.id, input.agencyId),
        eq(agencies.createdBy, ctx.user.id),
      )).limit(1).then(r => r[0]);
    if (!agency) throw new TRPCError({ code: "NOT_FOUND" });

    const shared = await db.select({
      permissionId: agencyPermissions.id,
      groupId: sql<number>`CAST(${agencyPermissions.subjectId} AS INTEGER)`,
      groupName: userGroups.name,
      memberCount: userGroups.memberCount,
      permissionLevel: agencyPermissions.permissionLevel,
      expiresAt: agencyPermissions.expiresAt,
      grantedAt: agencyPermissions.createdAt,
    })
    .from(agencyPermissions)
    .innerJoin(userGroups,
      eq(userGroups.id, sql`CAST(${agencyPermissions.subjectId} AS INTEGER)`)
    )
    .where(and(
      eq(agencyPermissions.agencyId, input.agencyId),
      eq(agencyPermissions.subjectType, "group"),
    ));

    return shared;
  }),

// List agencies shared with a specific group (for group page)
getGroupAgencies: protectedProcedure
  .input(z.object({ groupId: z.number().int().positive() }))
  .query(async ({ input, ctx }) => {
    // Verify caller is group member
    const membership = await db.select().from(groupMembers)
      .where(and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, ctx.user.id),
        eq(groupMembers.status, "active"),
      )).limit(1).then(r => r[0]);
    if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

    return db.select({
      agencyId: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      description: agencies.description,
      icon: agencies.icon,
      permissionLevel: agencyPermissions.permissionLevel,
      sharedBy: users.name,
      sharedAt: agencyPermissions.createdAt,
      expiresAt: agencyPermissions.expiresAt,
    })
    .from(agencyPermissions)
    .innerJoin(agencies, eq(agencies.id, agencyPermissions.agencyId))
    .innerJoin(users, eq(users.id, agencyPermissions.grantedByUserId))
    .where(and(
      eq(agencyPermissions.subjectType, "group"),
      eq(agencyPermissions.subjectId, String(input.groupId)),
      eq(agencies.isEnabled, true),
      or(
        isNull(agencyPermissions.expiresAt),
        gt(agencyPermissions.expiresAt, new Date()),
      ),
    ));
  }),
```

#### 11.7.6 UI — Sharing Management

**Agency Detail / Edit Page — "Sharing" Tab:**

```
┌─────────────────────────────────────────────────────────────┐
│ My Research Team Agency                        [Edit] [Run] │
├───────┬───────────┬──────────┬─────────┐                    │
│ Config│ Agents    │ Flows    │ Sharing  │  ← New tab        │
├───────┴───────────┴──────────┴─────────┘                    │
│                                                             │
│  Share with Groups                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔍 Search your groups...            [+ Share]       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Currently shared with:                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 📋 Marketing Team        12 members    [Use only]   │    │
│  │    Shared 3 days ago                   [Revoke]     │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │ 📋 Data Science Group    5 members     [Can manage] │    │
│  │    Shared 1 week ago · Expires Mar 15  [Revoke]     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ℹ️ Group members can run this agency using their own       │
│     credits. They cannot edit or re-share it.               │
│                                                             │
│  ── Marketplace ─────────────────────────────────────────   │
│  Status: Private                                            │
│  [Submit to Marketplace →]  (requires admin approval)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Share Dialog (opened by [+ Share]):**

```
┌─────────────────────────────────────────┐
│ Share "Research Team" with a Group       │
│                                         │
│ Select group:                           │
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Type to search...               │ │
│ │  ┌───────────────────────────────┐  │ │
│ │  │ ✅ Marketing Team (12 members)│  │ │
│ │  │    Data Science (5 members)   │  │ │
│ │  │    Engineering (8 members)    │  │ │
│ │  └───────────────────────────────┘  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Permission:                             │
│ ○ Can use (run the agency)  ← default   │
│ ○ Can manage (run + view configuration) │
│                                         │
│ Expiration: (optional)                  │
│ ┌──────────────────────┐                │
│ │ No expiration      ▼ │                │
│ │  ──────────────────   │                │
│ │  1 week               │                │
│ │  1 month              │                │
│ │  Custom date...       │                │
│ └──────────────────────┘                │
│                                         │
│        [Cancel]  [Share with Group]      │
└─────────────────────────────────────────┘
```

**Only shows groups where the user is owner or admin** — the dropdown is filtered by the user's group memberships with sufficient role.

**Group Page — "Shared Agencies" Section:**

Within the existing group detail page, add an "Agencies" tab showing all agencies shared with that group:

```
┌─────────────────────────────────────────────────────────────┐
│ Marketing Team                                              │
├─────────┬──────────┬───────────┬───────────┐                │
│ Members │ Library  │ Chat      │ Agencies  │  ← New tab     │
├─────────┴──────────┴───────────┴───────────┘                │
│                                                             │
│  Agencies shared with this group:                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🤖 Research Team           Shared by John · 3d ago  │   │
│  │    "4-agent research team"          [Run Agency →]   │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ 🤖 Content Creator         Shared by Jane · 1w ago  │   │
│  │    "Content generation pipeline"    [Run Agency →]   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ℹ️ Credits are deducted from your own account when you run │
│     a shared agency.                                        │
└─────────────────────────────────────────────────────────────┘
```

#### 11.7.7 Security Considerations for Group Sharing

| Concern | Mitigation |
|---------|-----------|
| User shares agency with group in different tenant | Blocked: `tenantId` must match on both agency and group |
| Non-owner tries to share an agency | Blocked: `checkAgencyAccess()` requires `createdBy === userId` for "share" action |
| Group member tries to edit shared agency | Blocked: "use" permission only allows `sendMessage` — all edit/delete endpoints check ownership |
| Shared agency accesses creator's data | Blocked: Runtime uses the **runner's** `user_context` and credentials, not the creator's |
| Spam sharing to many groups | Limited: Maximum 20 group shares per agency (application limit) |
| Expired permission still works | Blocked: `expiresAt` checked in both access resolution query and tRPC middleware |
| Creator deletes their account | Cascade: `agencies.createdBy` FK → `agencyPermissions.agencyId` FK → all permissions deleted |
| Creator deletes the agency | Cascade: `agencies.id` FK `onDelete: "cascade"` → `agencyPermissions` rows deleted automatically |
| Group member runs expensive agency | Protected: Credits deducted from runner's account; per-message cost alert still applies |

#### 11.7.8 Comparison: Group Sharing vs Marketplace

| Aspect | Group Sharing | Marketplace |
|--------|-------------|-------------|
| **Admin approval** | Not required | Required |
| **Who decides** | Agency owner | Admin (after owner submits) |
| **Scope** | Specific groups in same tenant | All tenants |
| **Access model** | Live reference (permission-based) | Full copy (independent) |
| **Creator edits agency** | Group members see changes immediately | No effect on installed copies |
| **Revenue** | No (same tenant) | Future: revenue sharing possible |
| **Safety review** | No automated review (same-tenant trust) | `autoReviewAgency()` + manual review |
| **Revocation** | Instant by creator | Admin can suspend |
| **Credits** | Runner pays | Runner pays |

#### 11.7.9 Implementation Phase

| Step | Phase | Description |
|------|-------|-------------|
| Create `agencyPermissions` table | Phase 1 | DB migration (follows `libraryPermissions` pattern) |
| `shareWithGroup` + `revokeGroupSharing` tRPC | Phase 3 | API for agency owners |
| `getAccessibleAgencies()` access resolution | Phase 1 | Core query used by all agency listing endpoints |
| `checkAgencyAccess()` authorization middleware | Phase 1 | Enforced in tRPC middleware |
| Redis cache for group access checks | Phase 2 | Performance optimization |
| "Sharing" tab in agency detail/edit page | Phase 3 | UI for managing group shares |
| "Agencies" tab in group detail page | Phase 3 | UI for group members |
| `getGroupAgencies` + `getAgencySharedGroups` tRPC | Phase 3 | Query endpoints |
| Access type badges ("My Agency" / "Shared" / "Marketplace") | Phase 3 | UI differentiation |
| Expiration TTL support | Phase 4 | Optional, nice-to-have |

---

## 12. Implementation Phases

### Phase 0: Pre-Implementation Validation (Week 0 — 2-3 days)

**Goal**: Verify all dependency upgrades are safe before touching production code.

0a. **Audit `openai` 1.x → 2.x migration**: Grep all Python files for `openai` imports, catalog breaking changes (see Appendix C.2.1)
0b. **Test dependency compatibility**: Create isolated venv with `agency-swarm==1.8.0`, `pydantic>=2.11`, `openai>=2.2` — run existing test suite
0c. **Update all 3 Dockerfiles** to `python:3.12-slim` (python-backend, python-orchestrator, video-job-runner)
0d. **Implement internal credit deduction endpoint** `POST /api/internal/credits/deduct` (Decision #9, see Section 8.3)
0e. **Define Zod schemas** for agency CRUD API contract
0f. **Add `INTERNAL_SERVICE_TOKEN`** to `.env` for Python→Node.js internal auth

**Deliverables**: Dependency upgrade plan with zero regressions confirmed.

### Phase 1: Foundation (Week 1-2)

**Goal**: Agency-swarm running in Python backend with basic chat.

1. Upgrade Python to 3.12 + upgrade `openai`, `pydantic` (per Phase 0 findings)
2. `pip install agency-swarm` — add to requirements.txt (verify if `[litellm]` extra is needed for Option B)
3. Create database tables (Drizzle schema + migration)
4. Implement `agency_service.py` — load definition → instantiate Agency → run message
5. Implement thread persistence callbacks → PostgreSQL
6. Implement basic credit bridge (cost → credits deduction)
7. Create FastAPI endpoints: `/api/internal/agency/run`, `/api/internal/agency/stream`
8. Create tRPC router with `sendMessage` and basic CRUD
9. Basic chat UI (reuse existing ChatView patterns)

**Deliverables**: User can create a simple 2-agent agency and chat with it.

### Phase 2: Tools & Skills Bridge (Week 3-4)

**Goal**: Agents can use SmartSpecPro's existing capabilities.

> **Critical constraint**: ALL tool bridges must route through Node.js HTTP endpoints.
> The Python `skill_executor.py` is mocked — do NOT attempt direct Python skill invocation.
> See Section 7.4 for the corrected architecture.

1. Implement `SSPToolBridge` base class with Node.js HTTP dispatch (see 7.4.2)
2. Implement `SkillInvokeTool` — calls `chat.executeSkill` tRPC via HTTP for `llm-only`/`core-text`/`enhance-prompt` skills
3. Implement `ImageGenerationTool` — calls `chat.executeSkill` for `image-generation` mode
4. Implement `VideoGenerationTool` — calls `chat.executeSkill` for `video-generation` mode (async with task polling)
5. Implement `SandboxCodeTool` — calls sandbox dispatch endpoint for `sandbox-*` mode
6. Implement `LibrarySearchTool` — calls library search tRPC endpoint (RAG)
7. Tool picker UI in agency builder (assign tools to agents)
8. Per-agent tool assignment in DB (`agency_tools` table)
9. Streaming response support (SSE from Python → Node.js → React)
10. Verify credit flow: tool credits deducted at Node.js layer, agent LLM credits deducted at agency layer — no double-charging

**Deliverables**: Agents can invoke skills, generate media, execute code, and search library. Credits tracked correctly across both layers.

11. **Skill Auto-Trigger channel** (see Section 9.4.1):
    a. Add `executionMode: "agency"` to skills enum
    b. Add `agencyId` column to `skills` table
    c. Extend `skillExecutor.ts` with `"agency"` case → `dispatchAgencyRun()`
    d. Create example skill.md with agency trigger patterns

**Additional deliverable**: Users can trigger agencies automatically by typing matching patterns in chat.

### Phase 3: Visual Builder & Templates (Week 5-6)

**Goal**: Full UI for agency configuration and template system.

1. Agency builder UI (agent cards + flow editor)
2. Communication flow visualization (ReactFlow graph — reuse `get_agency_graph()`)
3. Guardrail configuration UI
4. Agency template system (DB-backed, pre-built templates)
5. Template gallery page with "Try It Now" flow (see Section 9.10.2)
6. Agency marketplace (shared agencies across tenants)
7. Multi-agent chat UI (agent indicators, handoff visualization)
8. **Scheduled Messages channel** (see Section 9.4.2):
   a. Add `agencyId` column to `scheduledMessages` table
   b. Extend `scheduler.ts` delivery logic for agency dispatch
   c. Add agency picker to `SchedulePanel.tsx`
   d. Extend `chat-alert` skill to detect agency scheduling intent (see Section 9.9.2)
   e. Test: recurring agency task (e.g., weekly report)
9. **Seed pre-installed templates** (see Section 9.10.1):
   a. Research Team, Content Creator, Code Assistant, Customer Support
   b. Skill Factory (ISC integration — see Section 9.8.6)
   c. Seed migration script (see Section 9.10.4)
10. **ISC Agency Integration** (see Section 9.8):
    a. Add `use_agency` + `create-agency` mode to ISC input/UI schemas
    b. Implement `_agency_create_skill()` in ISC skill.py
    c. Implement `_agency_improve_skill()` in ISC skill.py
    d. Implement `_create_agency_from_prompt()` — LLM plans agency → validates → persists via tRPC (see Section 9.8.9)
    e. Update ISC trigger patterns for agency creation keywords
    f. E2E test: user prompt → agency created → chat works
11. **Onboarding tutorial** (see Section 9.7.6 + Section 9.10.6):
    a. Interactive 5-step tutorial for first-time users
    b. Template use case documentation
    c. "Try It Now" zero-setup flow
12. **UI Integration** (see Section 9.6):
    a. Add menu items (main + admin + domain-admin) to `packages/shared/src/constants/menu.ts`
    b. Add routes to `App.tsx`
    c. Agency dashboard widgets (recent runs, quick actions)
    d. Chat page agency selector
    e. Settings page agency tab
    f. Admin agencies page + domain admin page

13. **Group-Scoped Agency Sharing** (see Section 11.7):
    a. Create `agencyPermissions` table (DB migration — follows `libraryPermissions` pattern)
    b. `shareWithGroup` + `revokeGroupSharing` tRPC endpoints
    c. `getAgencySharedGroups` + `getGroupAgencies` tRPC endpoints
    d. "Sharing" tab in agency detail/edit page
    e. "Agencies" tab in group detail page
    f. Access type badges ("My Agency" / "Shared" / "Marketplace") in agency list
    g. `getAccessibleAgencies()` resolution logic (ownership + group + marketplace)
    h. `checkAgencyAccess()` authorization middleware

**Deliverables**: Complete visual builder, template gallery with 6 pre-built templates, production-ready chat, scheduled agency tasks, ISC agency mode, user onboarding, group-scoped agency sharing.

### Phase 4: Advanced Features (Week 7-8)

**Goal**: Production hardening, monitoring, and advanced capabilities.

1. Agent memory integration (3-tier: per-conversation default, per-agency shared, global read-only)
2. MCP server support (agency-swarm v1.5.0+ `ToolFactory.from_mcp`)
3. Workflow integration — "Agency Node" in LangGraph visual editor:
   a. Implement `AgencyExecutor` following `NodeExecutor` protocol (see Section 7.5.2)
   b. Register `NodeTypeSpec` in `NodeRegistry._register_core_nodes()` (see Section 7.5.3)
   c. Frontend: Add "AI Agency" node to workflow editor palette
   d. Backend: No changes needed to `NodeAdapter`, `WorkflowCompiler`, or `LangGraphRuntime`
   e. Test: Verify state flow (`{{agency.response}}`), conditional routing, credit tracking
4. **Admin monitoring dashboard** (see Section 14.3):
   a. Admin agencies page with 6 tabs: Overview, Runs, Agents, Tools, Cost, Errors
   b. Real-time run inspector with conversation timeline
   c. Alerting rules (high error rate, runaway cost, stuck runs)
   d. Debugging tools (log query shortcuts, SQL queries)
5. **User-facing analytics** (see Section 14.4):
   a. Agency tab in UsageAnalytics page
   b. Per-agency cost breakdown
6. Cost analytics per agency/agent
7. Agency versioning (snapshot + rollback)
8. Bulk import/export of agency definitions
9. Performance optimization (agency caching, connection pooling)
10. **Agency Marketplace with Admin Approval** (see Section 11.5):
    a. Add `marketplaceStatus`, review fields to schema + migration
    b. Implement `autoReviewAgency()` automated safety checks (secret detection, jailbreak patterns)
    c. Admin marketplace review panel (queue + security checklist + approve/reject/request changes)
    d. `submitToMarketplace`, `reviewMarketplaceSubmission`, `browseMarketplace`, `installFromMarketplace` tRPC
    e. Marketplace browse UI for users (category filter, search, sort by installs/rating)
    f. Rating system (1-5 stars)
    g. Risk classification badges (Low/Medium/High/Critical based on tool usage)
11. **Agency Execution Safety** (see Section 11.6):
    a. Sandbox profile for agency code execution (CPU/memory/network limits)
    b. Runtime safety monitoring for marketplace-installed agencies (stricter limits)
    c. Marketplace agency risk classification enforcement
12. **Event-driven triggers** (see Section 9.9.3):
    a. Alert-based triggers (notification actions)
    b. Queue event triggers (post-job agency dispatch)
    c. Trigger configuration UI in AgencyBuilder
12. **OpenAI-Compatible API channel** (see Section 9.4.3):
    a. Extend `openaiCompatGateway.ts` to detect `agency:` model prefix
    b. Route to `dispatchAgencyRun()` with streaming support
    c. Format responses as OpenAI-compatible JSON
13. **MCP Server channel** (see Section 9.4.4):
    a. Register `list_agencies` + `run_agency` MCP tools in `mcp.ts`
    b. Require `mcp:write` scope for agency execution
    c. Test: Claude Desktop invokes SmartSpecPro agency via MCP
14. **Webhook channel** (see Section 9.4.5 + Section 9.9.3):
    a. Add webhook config to `agencies.configJson`
    b. Create `/api/webhooks/agency/:slug` endpoint with HMAC validation
    c. Async dispatch via Celery + callback URL support
    d. Safety: rate limit 10 triggers/min/agency, HMAC validation
15. **Desktop App (Tauri) channel** (see Section 9.4.6):
    a. Add `run_agency` + `list_agencies` Tauri IPC commands
    b. Integrate with device auth flow for token management
    c. Support local file context passing to agencies
16. **Telegram command trigger** (see Section 9.9.3):
    a. `/agency <slug> <prompt>` command in Telegram bot
    b. Response sent back to Telegram chat
17. **Group sharing enhancements** (see Section 11.7):
    a. Expiration TTL support with auto-revocation sweep
    b. Bulk share/revoke for multiple groups
    c. Share analytics (who ran which shared agency, how many times)

**Deliverables**: Enterprise-ready agency platform with 8 integration channels, full monitoring dashboard, event-driven triggers, user analytics, group sharing enhancements.

---

## 13. Testing Strategy

### 13.1 Unit Tests

| Component | Test File | Coverage Target |
|-----------|-----------|-----------------|
| Agency service | `tests/unit/services/test_agency_service.py` | 90% |
| Tool bridge | `tests/unit/services/test_agency_tools.py` | 85% |
| Credit bridge | `tests/unit/services/test_agency_credits.py` | 95% |
| DB models | `tests/unit/models/test_agency.py` | 90% |
| tRPC router | `apps/web/server/routers/__tests__/agency.test.ts` | 80% |

### 13.2 Integration Tests

| Scenario | Test File |
|----------|-----------|
| Agency creation → message → response | `tests/integration/test_agency_e2e.py` |
| Multi-agent handoff | `tests/integration/test_agency_handoff.py` |
| Tool execution (skill, sandbox) | `tests/integration/test_agency_tools.py` |
| Credit deduction accuracy | `tests/integration/test_agency_billing.py` |
| Thread persistence (save/load) | `tests/integration/test_agency_persistence.py` |
| Streaming response | `tests/integration/test_agency_streaming.py` |

### 13.3 Mock Strategy

- Mock agency-swarm's `Agency.get_response()` for unit tests
- Mock LLM providers (no real API calls in CI)
- Use test database for integration tests
- Mock sandbox dispatch for tool tests

---

## 14. Monitoring & Observability

### 14.1 Audit Events

All agency operations logged to existing JSONL audit system (`apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`)
and `provider_usage_log` table. Uses the same audit infrastructure as existing LLM/media/skill events.

| Event Type | Data | JSONL? | DB? |
|------------|------|--------|-----|
| `agency_created` | agency_id, tenant_id, agent_count, template_used | ✅ | ❌ |
| `agency_updated` | agency_id, changed_fields | ✅ | ❌ |
| `agency_deleted` | agency_id, tenant_id | ✅ | ❌ |
| `agency_run_started` | run_id, agency_id, conversation_id, user_id, input_message | ✅ | ✅ agency_runs |
| `agency_agent_response` | run_id, agent_name, model, tokens_in, tokens_out, cost_usd, duration_ms | ✅ | ✅ provider_usage_log |
| `agency_handoff` | run_id, from_agent, to_agent, reason, turn_number | ✅ | ❌ |
| `agency_tool_call` | run_id, agent_name, tool_name, tool_type, input_summary, output_summary, duration_ms | ✅ | ❌ |
| `agency_tool_error` | run_id, agent_name, tool_name, error_type, error_message | ✅ | ❌ |
| `agency_run_completed` | run_id, status, total_tokens, total_cost_usd, total_credits, duration_ms, agents_involved, handoff_count | ✅ | ✅ agency_runs |
| `agency_run_failed` | run_id, error_type, error_message, last_agent, turn_number | ✅ | ✅ agency_runs |
| `agency_credits_markup` | run_id, user_id, base_credits, markup_credits, multiplier | ✅ | ✅ credit_transactions |
| `agency_max_turns_hit` | run_id, max_turns, last_agent | ✅ | ❌ |

**Trace correlation**: Every agency run generates a `traceId` (UUID) that links all sub-events.
Query example:

```bash
grep '"traceId":"abc123"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .
```

### 14.2 Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agency_runs_total` | Counter | status, agency_id, channel | Total agency runs (completed/failed/timeout) |
| `agency_run_duration_seconds` | Histogram | agency_id | End-to-end run time (buckets: 1s, 5s, 15s, 30s, 60s, 120s, 300s) |
| `agency_messages_total` | Counter | direction (in/out) | Total messages sent to/from agencies |
| `agency_handoffs_total` | Counter | agency_id | Agent-to-agent handoffs |
| `agency_turns_per_run` | Histogram | agency_id | Turns taken per run (measures complexity) |
| `agency_tool_calls_total` | Counter | tool_name, tool_type | Tool invocations by name and type |
| `agency_tool_errors_total` | Counter | tool_name, error_type | Tool failures by tool and error |
| `agency_tool_duration_seconds` | Histogram | tool_name | Tool execution latency |
| `agency_errors_total` | Counter | error_type, agency_id | All errors by type |
| `agency_cost_usd_total` | Counter | agency_id | Total LLM cost (USD) |
| `agency_credits_total` | Counter | agency_id, type (base/markup) | Credits consumed (base + markup separately) |
| `agency_active_sessions` | Gauge | — | Concurrent agency sessions |
| `agency_gateway_calls_total` | Counter | model, agency_id | LLM calls through Node.js gateway |
| `agency_sandbox_jobs_total` | Counter | status | Sandbox jobs dispatched by agencies |

**Export**: Metrics exposed via Prometheus `/metrics` endpoint (existing Python backend pattern).

### 14.3 Admin Monitoring Dashboard

New admin page at `/admin/agencies` with a monitoring tab. Follows the existing
`AdminOpsDashboard.tsx` tabbed panel pattern.

#### 14.3.1 Dashboard Tabs

```
[Overview] [Runs] [Agents] [Tools] [Cost] [Errors]
```

**Tab: Overview** — Real-time agency health (auto-refresh 5s, toggleable)

```
┌─ Stats Cards ─────────────────────────────────────────────────┐
│  Active Runs    Total Today    Avg Duration    Error Rate      │
│     3            142            23.4s           2.1%           │
│  🟢              📈 +12%       ⏱ -5.2s         ⚠️ +0.3%       │
└───────────────────────────────────────────────────────────────┘

┌─ Active Agency Runs ──────────────────────────────────────────┐
│ Run ID     │ Agency        │ User    │ Agent    │ Duration     │
│ abc-123    │ Research Team │ user42  │ Analyst  │ 15s (turn 3) │
│ def-456    │ Code Review   │ user7   │ Reviewer │ 8s (turn 2)  │
│ ghi-789    │ Content Crew  │ user15  │ Writer   │ 42s (turn 5) │
└───────────────────────────────────────────────────────────────┘

┌─ Alerts ──────────────────────────────────────────────────────┐
│ ⚠️ Agency "Data Pipeline" has 15% error rate (last 1h)        │
│ 🔴 User user42 hit max turns 3 times today                   │
│ ℹ️ 2 agencies using deprecated model "gpt-4-turbo"            │
└───────────────────────────────────────────────────────────────┘
```

**Tab: Runs** — Run history with filters

| Filter | Options |
|--------|---------|
| Status | All / Completed / Failed / Running / Timeout |
| Agency | Dropdown of all agencies |
| User | User search |
| Date range | DateRangeSelector (7d / 30d / 90d) |
| Channel | Chat / Skill / Schedule / API / MCP / Webhook / Desktop |
| Cost range | Min-Max credits |

**Table columns**: Run ID, Agency, User, Status, Agents Involved, Turns, Duration, Credits, Channel, Time.
**Click row** → detail dialog (similar to `TransactionDetailDialog`) showing:
- Full message exchange between agents
- Tool invocations with inputs/outputs
- Credit breakdown (base + markup)
- Handoff chain visualization
- Error details (if failed)

**Tab: Agents** — Per-agent performance

| Column | Description |
|--------|-------------|
| Agent Name | Agent slug |
| Agency | Parent agency |
| Model | LLM model used |
| Avg Response Time | Median response latency |
| Avg Tokens | Median tokens per response |
| Tool Calls | Total tool invocations |
| Handoffs In/Out | How often this agent receives/initiates handoffs |
| Error Rate | % of turns that resulted in error |

**Tab: Tools** — Tool usage analytics

| Column | Description |
|--------|-------------|
| Tool Name | Tool slug |
| Type | skill / sandbox / image / video / library / builtin |
| Invocations | Total calls |
| Avg Duration | Median execution time |
| Error Rate | % failures |
| Top Agencies | Which agencies use this tool most |
| Credits Consumed | Total credits from tool executions |

**Tab: Cost** — Cost analytics

- **Time series chart**: Daily agency cost (stacked by agency)
- **Breakdown table**: Cost per agency, per user, per model
- **Top spenders**: Users with highest agency credit usage
- **Multiplier impact**: How much additional cost from creditMultiplier markups
- **Comparison**: Agency cost vs. regular chat cost (side by side)

**Tab: Errors** — Error analysis

- **Error type breakdown**: Pie chart (LLM error / tool error / timeout / credit insufficient / max turns)
- **Error timeline**: Bar chart of errors over time
- **Recent errors table**: Time, Agency, Agent, Error Type, Message, Run ID
- **Click row** → links to full run detail

#### 14.3.2 Real-Time Run Inspector

Deep-dive tool for watching/debugging a specific agency run. Available from:
- Admin dashboard → click active run
- Agency chat → admin gets "Inspect" button
- Audit log → click trace ID

```
┌─ Run Inspector: abc-123 ──────────────────────────────────────┐
│                                                                 │
│ Agency: Research Team    User: user42    Status: 🟢 Running     │
│ Duration: 23s            Turns: 3/25     Credits: 34.5          │
│                                                                 │
│ ── Conversation Timeline ─────────────────────────────────────  │
│                                                                 │
│ [T0]  👤 User: "Research quantum computing advances"            │
│ [T1]  🤖 CEO → Researcher  (handoff: "research task")          │
│ [T2]  🤖 Researcher:                                           │
│        🔧 WebSearchTool("quantum computing 2026")               │
│           → 5 results found                                     │
│        🔧 LibrarySearchTool("quantum computing")                │
│           → 2 relevant documents                                │
│        Response: "Found 7 sources on quantum..."                │
│        tokens: 1,234 in / 567 out | cost: $0.012 | 12 credits  │
│ [T3]  🤖 Researcher → Analyst  (handoff: "analyze findings")   │
│ [T4]  🤖 Analyst:                                              │
│        Response: "Key trends: 1) Error correction..."           │
│        tokens: 2,100 in / 890 out | cost: $0.019 | 19 credits  │
│ [T5]  🤖 Analyst → Summarizer  (waiting...)                    │
│                                                                 │
│ ── Cost Breakdown ────────────────────────────────────────────  │
│ Base LLM: 31 credits | Markup (2.0x): 31 credits | Total: 62   │
│                                                                 │
│ [Stop Run] [View Raw Audit Log] [Export]                        │
└─────────────────────────────────────────────────────────────────┘
```

#### 14.3.3 Alerting Rules

Alerts are evaluated by the existing `AdminOpsDashboard` alerting mechanism. New agency-specific rules:

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| High error rate | Agency error rate > 10% in 1h window | Warning | Admin notification |
| Runaway cost | Single run exceeds 500 credits | Critical | Auto-stop run + admin alert |
| Max turns saturation | >50% of runs hitting max turns | Warning | Suggest increasing max turns |
| Stuck run | Run active > 5 minutes with no events | Warning | Admin can inspect/kill |
| Model failure spike | >5 LLM errors from same model in 10min | Critical | Circuit breaker at gateway level |
| Sandbox abuse | >10 sandbox jobs from single agency in 1h | Warning | Temporary sandbox disable for agency |
| Credit multiplier anomaly | Markup exceeds 5x base cost | Warning | Admin review |

#### 14.3.4 Debugging Tools

**Log Query Shortcuts** (available in admin dashboard):

```bash
# All events for a specific run
grep '"runId":"RUN_ID"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# All handoffs for an agency today
grep '"eventType":"agency_handoff"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | \
  jq 'select(.agencyId == "AGENCY_ID")'

# Slow runs (>60s)
grep '"eventType":"agency_run_completed"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | \
  jq 'select(.durationMs > 60000)'

# Failed tool calls
grep '"eventType":"agency_tool_error"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# Cost analysis for a user
grep '"eventType":"agency_run_completed"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | \
  jq 'select(.userId == 42) | {runId, totalCredits: .totalCreditsUsed, duration: .durationMs}'
```

**SQL Queries** for agency analytics:

```sql
-- Top agencies by cost (last 7 days)
SELECT a."name", COUNT(r.id) as runs, SUM(r."totalCreditsUsed"::numeric) as total_credits,
       AVG(r."durationMs") as avg_duration_ms
FROM agency_runs r
JOIN agencies a ON a.id = r."agencyId"
WHERE r."createdAt" > NOW() - INTERVAL '7 days'
GROUP BY a."name"
ORDER BY total_credits DESC;

-- Error rate by agency
SELECT a."name",
       COUNT(*) FILTER (WHERE r.status = 'completed') as completed,
       COUNT(*) FILTER (WHERE r.status = 'failed') as failed,
       ROUND(COUNT(*) FILTER (WHERE r.status = 'failed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as error_pct
FROM agency_runs r
JOIN agencies a ON a.id = r."agencyId"
WHERE r."createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY a."name"
ORDER BY error_pct DESC;

-- Handoff patterns (which agents hand off to whom most)
SELECT r."agencyId",
       jsonb_array_elements_text(r."agentsInvolved"::jsonb) as agent,
       COUNT(*) as appearances
FROM agency_runs r
WHERE r.status = 'completed'
GROUP BY r."agencyId", agent
ORDER BY appearances DESC;
```

### 14.4 User-Facing Analytics

Available at `/usage` (existing UsageAnalytics page) — add agency tab:

| Metric | Display |
|--------|---------|
| Agency runs this period | Counter card |
| Agency credits consumed | Counter card with breakdown (base + markup) |
| Most used agency | Bar chart |
| Cost per agency | Breakdown table |
| Run history | Filterable table with status, duration, credits |
| Agent performance | Which agents in your agencies respond fastest/cheapest |

---

## 15. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Python 3.12 upgrade breaks existing code | Medium | Low | Test thoroughly; Python 3.11→3.12 is minor |
| Pydantic version conflict | Medium | Medium | Pin versions carefully; test agency-swarm in isolation first |
| agency-swarm breaking changes (rapid releases) | High | Medium | Pin to v1.8.0; monitor changelogs; test before upgrading |
| OpenAI Agents SDK dependency (`==0.9.3` pinned) | Medium | Low | Pinned version is stable; only affects agency-swarm internals |
| High cost from multi-agent loops | High | Medium | Max turns limit; cost estimation before execution; budget alerts |
| Prompt injection through agent handoffs | High | Low | Input/output guardrails; sanitize handoff messages |
| Memory leak from long conversations | Medium | Medium | Max conversation length; cleanup old sessions |
| Thread persistence callback performance | Medium | Low | Batch writes; index conversation_id |
| LiteLLM compatibility with all SmartSpecPro providers | Low | Low | Test each provider; fallback to `OpenAIChatCompletionsModel` |
| `openai` 1.x → 2.x breaking changes in existing code | **High** | **High** | Audit all imports in Phase 0; run test suite against 2.x before merge |
| JWT token expiry during long-running agencies | **High** | **Medium** | Implement token refresh in `SSPToolBridge` (see Appendix C.2.2) |
| Node.js gateway overload from high-frequency agent LLM calls | Medium | Medium | Rate-limit per-user concurrent agency sessions (Redis counter); Bottleneck already handles per-provider limits |
| No credit deduction HTTP endpoint for Python markup | Medium | ~~High~~ **Resolved** | **RESOLVED**: Internal endpoint `POST /api/internal/credits/deduct` with `INTERNAL_SERVICE_TOKEN` auth (Decision #9, Section 8.3) |

---

## 15B. agency-swarm Version Management & Abstraction Strategy

### 15B.1 The Risk

agency-swarm is a fast-moving library. History shows **major breaking changes** between versions:
- v0.x → v1.0: `agency_chart` (list-of-lists) replaced entirely; Assistants API → Agents SDK
- v1.5.0: Added MCP support, changed tool factory API
- v1.6.0: Added cost tracking, changed `RunResult` type
- v1.7.0: Removed `agency_chart` parameter completely
- v1.8.0: Updated to OpenAI Agents SDK 0.9.3, new `Handoff` class

If we call agency-swarm APIs directly throughout the codebase, **every upstream update forces changes in multiple files**.

### 15B.2 Abstraction Layer Design

All SmartSpecPro code interacts with agency-swarm through **one abstraction layer** — never directly.

```
SmartSpecPro code (stable)          Abstraction layer           agency-swarm (unstable)
─────────────────────               ──────────────────          ──────────────────────
AgencyService                  →    AgencySwarmAdapter     →    agency_swarm.Agency
AgencyExecutor                 →    AgencySwarmAdapter     →    agency_swarm.Agent
SSPToolBridge                  →    (BaseTool is stable)   →    agency_swarm.tools.BaseTool
AgencyCreditBridge             →    CostTrackingAdapter    →    agency_swarm RunResult.usage
Thread persistence callbacks   →    PersistenceAdapter     →    agency_swarm PersistenceHooks
```

**Key file**: `python-backend/app/services/agency_swarm_adapter.py`

```python
# python-backend/app/services/agency_swarm_adapter.py
"""
Single point of contact with agency-swarm library.
ALL agency-swarm imports are isolated in this file.
If agency-swarm changes an API, ONLY this file needs to change.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import AsyncIterator, Any

# === agency-swarm imports — ONLY place in the codebase ===
from agency_swarm import Agency, Agent, Handoff
from agency_swarm import OpenAIChatCompletionsModel
from agency_swarm.tools import BaseTool, ToolFactory
from agency_swarm.agency.responses import RunResult, StreamingRunResponse
from agency_swarm.context import MasterContext
from agency_swarm.hooks import PersistenceHooks
# === end agency-swarm imports ===


@dataclass
class AgentSpec:
    """SmartSpecPro's agent definition — decoupled from agency-swarm."""
    name: str
    slug: str
    role: str
    instructions: str
    model: str
    temperature: float
    tools: list[BaseTool]
    is_entry_point: bool
    input_guardrails: list[dict] | None = None
    output_guardrails: list[dict] | None = None


@dataclass
class AgencySpec:
    """SmartSpecPro's agency definition — decoupled from agency-swarm."""
    agents: list[AgentSpec]
    communication_flows: list[tuple[str, str]]  # (from_slug, to_slug)
    shared_instructions: str | None = None
    max_turns: int = 25
    user_context: dict[str, Any] | None = None


class AgencySwarmAdapter:
    """
    Adapter between SmartSpecPro and agency-swarm.
    Encapsulates all agency-swarm API calls.

    If agency-swarm releases a breaking update, ONLY this class changes.
    """

    def build_agency(
        self,
        spec: AgencySpec,
        user_token: str,
        persistence_hooks: PersistenceHooks | None = None,
    ) -> Agency:
        """Convert SmartSpecPro AgencySpec → agency-swarm Agency object."""

        # Build agents
        agents_by_slug: dict[str, Agent] = {}
        for agent_spec in spec.agents:
            model = OpenAIChatCompletionsModel(
                model=agent_spec.model,
                openai_client=self._create_gateway_client(user_token),
            )
            agent = Agent(
                name=agent_spec.name,
                model=model,
                instructions=agent_spec.instructions,
                tools=agent_spec.tools,
            )
            agents_by_slug[agent_spec.slug] = agent

        # Build communication flows using > operator
        for from_slug, to_slug in spec.communication_flows:
            from_agent = agents_by_slug[from_slug]
            to_agent = agents_by_slug[to_slug]
            # agency-swarm's > operator registers handoff
            from_agent > to_agent

        # Find entry point
        entry_agents = [
            agents_by_slug[s.slug] for s in spec.agents if s.is_entry_point
        ]

        agency = Agency(
            agents=entry_agents,
            shared_instructions=spec.shared_instructions or "",
            max_turns=spec.max_turns,
            user_context=spec.user_context,
        )

        if persistence_hooks:
            agency.persistence_hooks = persistence_hooks

        return agency

    async def run(self, agency: Agency, message: str) -> RunResult:
        """Execute a message — wraps agency-swarm's get_response()."""
        return await agency.get_response(message)

    async def stream(self, agency: Agency, message: str) -> AsyncIterator:
        """Stream a message — wraps agency-swarm's get_response_stream()."""
        async for event in agency.get_response_stream(message):
            yield event

    def extract_cost(self, result: RunResult) -> dict:
        """Extract cost data from RunResult (adapts to agency-swarm's cost tracking format)."""
        usage = result.usage if hasattr(result, "usage") else {}
        return {
            "total_tokens": getattr(usage, "total_tokens", 0),
            "input_tokens": getattr(usage, "input_tokens", 0),
            "output_tokens": getattr(usage, "output_tokens", 0),
            "cost_usd": getattr(usage, "cost_usd", 0.0),
        }

    def _create_gateway_client(self, user_token: str):
        """Create OpenAI client pointing at Node.js gateway."""
        from openai import AsyncOpenAI
        return AsyncOpenAI(
            base_url="http://localhost:3000/api/llm/v2",
            api_key=user_token,
        )
```

### 15B.3 Import Rules (MANDATORY)

| Rule | Why |
|------|-----|
| **NEVER** import `agency_swarm` outside of `agency_swarm_adapter.py` | Single file to update on breaking changes |
| **NEVER** import `agency_swarm` in Node.js/frontend code | Python-only dependency |
| **OK** to import `BaseTool` in `agency_tools.py` | `BaseTool` is the tool interface — unlikely to break, and tools must subclass it |
| **OK** to import types (`RunResult`, `StreamingRunResponse`) in type hints | Type-only imports for signatures |
| **NEVER** use agency-swarm internal/private APIs (`_internal`, `__`) | No stability guarantee |

**Allowed import locations:**

```
python-backend/app/services/
├── agency_swarm_adapter.py    ← Main adapter (ALL core agency-swarm imports)
├── agency_tools.py            ← BaseTool subclasses (import BaseTool, Field only)
└── agency_service.py          ← Uses adapter, NEVER imports agency-swarm directly
```

### 15B.4 Upgrade Procedure

When a new agency-swarm version is released:

```
Step 1: ASSESS (do NOT install yet)
  ├─ Read changelog: https://github.com/VRSEN/agency-swarm/releases
  ├─ Identify breaking changes (API changes, removed features, new requirements)
  ├─ Check transitive dependency changes (openai, pydantic, openai-agents versions)
  └─ Decision: skip / patch-only / minor upgrade / major upgrade

Step 2: TEST in isolation
  ├─ Create branch: git checkout -b chore/agency-swarm-X.Y.Z
  ├─ Create isolated venv: python -m venv .venv-test
  ├─ Install: pip install agency-swarm==X.Y.Z
  ├─ Run: pytest tests/unit/services/test_agency_*.py
  ├─ Run: pytest tests/integration/test_agency_*.py
  └─ If tests fail → identify which adapter methods need updating

Step 3: UPDATE adapter only
  ├─ Modify ONLY agency_swarm_adapter.py (and agency_tools.py if BaseTool changed)
  ├─ Update version pin in requirements.txt
  ├─ Run full test suite: pytest
  └─ If SmartSpecPro tests pass → the rest of the codebase is unaffected

Step 4: DEPLOY
  ├─ Update Dockerfile (if Python version requirement changed)
  ├─ Deploy to staging → smoke test agency chat + workflow node + tool execution
  ├─ Deploy to production
  └─ Monitor: agency_errors_total metric for 24 hours
```

### 15B.5 Rollback Plan

If an upgrade causes production issues:

```bash
# 1. Revert to previous version immediately
pip install agency-swarm==1.8.0  # pinned known-good version

# 2. Revert adapter changes
git revert <upgrade-commit>

# 3. Restart
sudo systemctl restart smartspec-backend.service

# 4. Verify
pytest tests/unit/services/test_agency_*.py
```

**Version pinning strategy:**
- `requirements.txt`: Always pin **exact version** — `agency-swarm==1.8.0` (not `>=`)
- Keep `requirements-agency-swarm-previous.txt` with last known-good version
- Dockerfile: Pin Python version exactly — `python:3.12.x-slim`

### 15B.6 Exit Strategy — If agency-swarm Becomes Unmaintained

If the library stops being maintained or introduces unacceptable changes:

1. **Short-term**: Stay on pinned version indefinitely (agency-swarm is pure Python, no server dependency)
2. **Medium-term**: Fork to `smartspecpro/agency-swarm` and maintain critical patches only
3. **Long-term**: Replace `AgencySwarmAdapter` internals with custom implementation using
   OpenAI Agents SDK directly (agency-swarm is a thin wrapper around it)

**Impact of replacement**: Because of the adapter pattern, only `agency_swarm_adapter.py` and
`agency_tools.py` need to change. All other SmartSpecPro code (`agency_service.py`,
`agency_executor.py`, tRPC router, frontend) remains **unchanged**.

---

## 16. Open Questions & Decisions

### Resolved

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | **Python version**: Upgrade entire backend to 3.12 or separate service? | **Upgrade entire backend to 3.12** | Single runtime simplifies deployment; 3.11→3.12 is minor; test thoroughly before deploy |
| 4 | **Agency sharing model**: Shareable across tenants? | **Yes, with strict boundary** — Share: agency definition, prompt structure, role graph, tool manifest, policy preset. **Never share**: memory, threads, logs, artifacts, secrets, usage data, live config | Marketplace value without data leakage |
| 5 | **Agent memory scope**: Per-agency, per-conversation, or global? | **3-tier hierarchy**: (1) per-conversation (default, most isolated), (2) per-agency (shared within agency across conversations), (3) global/read-only (tenant-wide entity memories). Default = per-conversation within tenant + agency scope | Granular isolation while allowing useful memory sharing |
| 6 | **LLM routing**: Direct LiteLLM or through Node.js gateway? | **Node.js gateway only** (Option B in Section 10.1) | MUST route through existing gateway to ensure credit deduction works correctly. Direct calls bypass billing entirely. See Section 10.1 for details |
| 9 | **Credit deduction from Python**: HTTP endpoint, direct DB, or return-to-Node? | **Internal HTTP endpoint** (`POST /api/internal/credits/deduct`) protected by `INTERNAL_SERVICE_TOKEN` | Reuses existing atomic `deductCredits()` function; no DB access duplication; clear audit trail. See Section 8.3 |
| 10 | **agency_runs table**: Separate table or run-summary in messages? | **Separate `agency_runs` table** | Clean separation of run-level analytics from per-message data; enables cost dashboards, duration tracking, source channel attribution. See Section 6.1 |
| 11 | **Credit multiplier stacking**: Multiplicative or additive? | **Additive** — `combined = 1.0 + (agency_mult - 1.0) + (skill_mult - 1.0)` | Multiplicative compounds unexpectedly (2x × 2x = 4x). Additive is more predictable for users. See Section 10.3 |

### Proposed Resolutions (Audit Recommendations — Pending User Approval)

| # | Question | Proposed Resolution | Rationale |
|---|----------|-------------------|-----------|
| 2 | Agency persistence granularity | **Persist all intermediate messages** | Needed for debugging, handoff visibility, and audit trail. Storage is cheap; losing debuggability is expensive |
| 3 | Sandbox tool latency UX | **Show per-tool progress indicator** via streaming `tool_call` events → frontend spinner with tool name + elapsed time | Already supported by SSE streaming architecture |
| 7 | Cost estimation accuracy | **Use `estimatedCostPerMessage` as soft warning only** — display "Estimated: ~X credits" before execution, don't block | Multi-turn estimation is inherently imprecise; post-hoc deduction is accurate |
| 8 | Admin controls | **Yes** — implement in Phase 3 via `agencies.configJson.adminOverrides` with `allowedModels[]` and `allowedToolTypes[]` | Domain admins need cost and security control |

---

## 17. Dependencies

### 17.1 New Python Dependencies

```
agency-swarm[litellm]==1.8.0
# Transitive:
# - openai>=2.2,<3
# - openai-agents==0.9.3
# - litellm
# - pydantic>=2.11,<3
# - fastmcp>=2.13.1
# - mcp>=1.13.1,<2.0.0
# - datamodel-code-generator>=0.33.0,<0.34.0
```

### 17.2 Existing Dependencies Impacted

| Dependency | Current | Required by agency-swarm | Action |
|-----------|---------|------------------------|--------|
| Python | 3.11+ | >= 3.12 | Upgrade |
| pydantic | >= 2.7.4 | >= 2.11 | Upgrade |
| openai | >= 1.50.0 | >= 2.2, < 3 | Upgrade (major version!) |

### 17.3 No New Frontend Dependencies

All UI components use existing React, Radix UI, and TanStack Query patterns.

---

## 18. Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agency creation → first message | < 3 seconds | E2E timing |
| Streaming first token latency | < 1 second | SSE timing |
| Multi-agent handoff reliability | > 99% | Success rate |
| Credit tracking accuracy | 100% (no leaks) | Audit comparison |
| Thread persistence reliability | 100% (no data loss) | Load/save validation |
| Concurrent agencies per server | >= 20 | Load testing |
| User adoption (30 days post-launch) | 10% of active users | Analytics |
| Agency template usage | 60% of new agencies from templates | Analytics |

---

## Appendix A: agency-swarm v1.8.0 API Reference (Key Types)

```python
# Core classes
from agency_swarm import Agency, Agent
from agency_swarm import LitellmModel, OpenAIChatCompletionsModel
from agency_swarm import Handoff, SDKHandoff
from agency_swarm.tools import BaseTool, ToolFactory
from agency_swarm import function_tool

# Response types
from agency_swarm.agency.responses import RunResult, StreamingRunResponse

# Context
from agency_swarm.context import MasterContext

# Hooks
from agency_swarm.hooks import RunHooks, PersistenceHooks, AgentHooks
```

## Appendix B: Comparison with Existing Patterns

| Feature | Current (Supervisor) | agency-swarm | Benefit |
|---------|---------------------|-------------|---------|
| Agent count | 2 (Kilo + OpenCode) | N agents (configurable) | Flexible team composition |
| Routing | Keyword-based | LLM-driven handoff tool | Smarter delegation |
| Communication | Unidirectional | Bidirectional with constraints | Richer collaboration |
| Tools | Fixed executor set | Dynamic BaseTool registration | User-extensible |
| State | In-memory dict | MasterContext + DB persistence | Resumable sessions |
| Guardrails | None | Input/output validators | Quality control |
| Streaming | Not supported | SSE-compatible | Real-time UX |
| Cost tracking | Per-call deduction | Multi-agent aggregate | Accurate billing |
| UI | None | Builder + graph + chat | Complete UX |

## Appendix C: Completeness Audit (2026-02-27)

Full audit of the spec cross-referenced against the SmartSpecPro codebase.
Issues are categorized by severity: **CRITICAL** (blocks implementation), **HIGH** (causes bugs if not addressed), **MEDIUM** (should fix before implementation), **LOW** (nice-to-have improvement).

### C.1 Internal Inconsistencies (Fixed)

These were found and **already corrected** in-place during this audit:

| # | Section | Issue | Fix Applied |
|---|---------|-------|-------------|
| 1 | 1 (Key Principles) | Referenced `LitellmModel` despite Decision #6 (gateway-only) | Updated to `OpenAIChatCompletionsModel` only |
| 2 | 5.2 (Data Flow) | "Reserve estimated credits" — credits are post-hoc, no reservation | Changed to "read-only check, NO reservation" |
| 3 | 5.2 (Data Flow) | "Finalize credit deduction (reserve → actual)" | Changed to reflect gateway auto-deduction |
| 4 | 6.2 (Python Models) | Stub with no code | Added full SQLAlchemy 2.0 model definitions |
| 5 | 7.1 (AgencyService) | `run_message()` signature missing `user_context`, `max_turns_override` params used by AgencyExecutor (7.5.2 line 944) | Added missing params + defined `AgencyRunResult` and `AgencyStreamEvent` types |
| 6 | 7.4.5 (Credit Flow) | Said "credits deducted by agency_credits.py" for LLM calls — contradicts 10.1.1 (gateway auto-deducts) | Corrected: gateway deducts LLM, agency_credits.py only handles markup |
| 7 | 11.3 (Prompt Injection) | Claimed "instructions stored encrypted" but schema shows plaintext `text` column | Corrected: plaintext is acceptable for tenant config; added note about optional encryption |
| 8 | 7.2 → 7.4.3 | `LibrarySearchTool` listed in table but had no implementation code | Added implementation + clarified WebSearch/HTTP/FileManage are builtin tools |

### C.2 Remaining Gaps — CRITICAL / HIGH

#### C.2.1 `openai` Major Version Upgrade (CRITICAL)

**Current**: `openai>=1.50.0` in `requirements.txt`
**Required by agency-swarm**: `openai>=2.2,<3`

This is a **major version bump** (1.x → 2.x). The OpenAI Python SDK v2 has breaking changes:
- `openai.ChatCompletion.create()` → `openai.chat.completions.create()` (already done in v1.x but other APIs changed)
- `openai.Audio`, `openai.Image`, `openai.Embedding` APIs restructured
- Type changes in response objects

**Impact**: All existing code in `python-backend/` that imports `openai` must be audited.
Affected files (minimum):
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/orchestrator/node_executors/llm_executor.py`
- Any file importing `from openai import ...`

**Action required**: Add Phase 0 pre-implementation step to audit openai 1.x → 2.x migration.

#### C.2.2 Token Expiry During Long-Running Agencies (HIGH)

The `SSPToolBridge` (Section 7.4.2) stores `_user_token` (JWT) at agency instantiation.
JWTs have a finite TTL. Long-running agencies (multi-turn, many tool calls, sandbox waits)
may exceed the JWT expiry window.

**Impact**: Tool calls will fail with 401 mid-agency, causing partial execution with credits already consumed.

**Recommended fix**: Add to `SSPToolBridge`:
```python
class SSPToolBridge(BaseTool):
    _token_refresh_url: str = "http://localhost:3000/api/auth/refresh"
    _token_expiry: float = 0  # Unix timestamp
    _refresh_token: str = ""

    async def _ensure_valid_token(self):
        """Refresh JWT if close to expiry (within 60 seconds)."""
        if time.time() > (self._token_expiry - 60):
            async with httpx.AsyncClient() as client:
                resp = await client.post(self._token_refresh_url, json={"refreshToken": self._refresh_token})
                data = resp.json()
                self._user_token = data["token"]
                self._token_expiry = data["expiresAt"]

    async def _call_nodejs(self, endpoint: str, payload: dict) -> dict:
        await self._ensure_valid_token()
        # ... existing HTTP call logic
```

**Alternative**: Use internal service-to-service tokens (not user JWTs) for agency tool calls,
with a dedicated scope that doesn't expire during execution.

#### C.2.3 HTTP Error Handling in Tool Bridge (HIGH)

`SSPToolBridge._call_nodejs()` only does `response.raise_for_status()`. No handling for:
- **402 Payment Required** — user ran out of credits mid-tool-call
- **429 Too Many Requests** — rate limited by Bottleneck/BullMQ
- **503 Service Unavailable** — Node.js restarting
- **Timeouts** — httpx default timeout may not be enough for media generation

**Recommended fix**:
```python
async def _call_nodejs(self, endpoint: str, payload: dict, timeout: float = 120.0) -> dict:
    """HTTP call with retry logic for transient failures."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(...)
                if response.status_code == 402:
                    raise InsufficientCreditsError("User credits exhausted during agency run")
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", "5"))
                    await asyncio.sleep(retry_after)
                    continue
                if response.status_code >= 500 and attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            if attempt < max_retries - 1:
                continue
            raise
    raise ToolBridgeError(f"Failed after {max_retries} retries: {endpoint}")
```

#### C.2.4 Missing FastAPI Router Code (HIGH)

Section 5.1 lists `api/agencies.py` as [NEW] and Section 8.2 references `POST /api/internal/agency/run`
and `/api/internal/agency/stream`, but no FastAPI router code is shown anywhere in the spec.

**Required**: Add Section 7.6 with FastAPI router:

```python
# python-backend/app/api/agencies.py

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from app.services.agency_service import AgencyService, AgencyRunResult

router = APIRouter(prefix="/api/internal/agency", tags=["agency"])

@router.post("/run")
async def run_agency(request: Request) -> dict:
    """Synchronous agency execution — returns full result."""
    body = await request.json()
    service = AgencyService()
    result = await service.run_message(
        agency_id=body["agencyId"],
        conversation_id=body.get("conversationId"),
        message=body["message"],
        user_id=body["userId"],
        user_context=body.get("context"),
    )
    return result.__dict__

@router.post("/stream")
async def stream_agency(request: Request) -> StreamingResponse:
    """SSE streaming agency execution."""
    body = await request.json()
    service = AgencyService()

    async def event_generator():
        async for event in service.stream_message(
            agency_id=body["agencyId"],
            conversation_id=body.get("conversationId"),
            message=body["message"],
            user_id=body["userId"],
        ):
            yield f"data: {json.dumps(event.__dict__)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

#### C.2.5 ~~Missing `agency_runs` Table~~ — RESOLVED (Decision #10)

**Decision**: Separate `agency_runs` table added to Section 6.1 (Drizzle) and 6.2 (SQLAlchemy).
Tracks run-level metadata: duration, total tokens, cost breakdown (base + markup + tools),
agents involved, source channel, error state.

### C.3 Remaining Gaps — MEDIUM

#### C.3.1 Dockerfile Python Version (MEDIUM)

All Dockerfiles currently use `python:3.11-slim`:
- `python-backend/Dockerfile` (line 5, 24)
- `docker/Dockerfile.python-orchestrator` (line 6, 28)
- `docker/Dockerfile.video-job-runner` (line 6, 27)

Phase 1 must update ALL three to `python:3.12-slim`. Add to Phase 1 checklist.

#### C.3.2 `skills.executionMode` is a varchar, NOT an enum (MEDIUM)

The spec (Section 9.4.1) says "Add `executionMode: 'agency'` to skills table enum" — but the
actual codebase uses `varchar("executionMode", { length: 50 })`, not a pgEnum. This means:
- No migration needed to add a new value (just insert the string)
- But also no DB-level validation of allowed values

**Action**: Document that validation of `executionMode` values must happen at the application level
(Zod schema in tRPC router), not at the DB level.

#### C.3.3 `scheduledMessages` Missing `tenantId` (MEDIUM)

Section 9.4.2 code references `schedule.tenantId` but the actual `scheduledMessages` table
(schema.ts:2676-2742) has NO `tenantId` column. It only has `userId`.

**Impact**: The agency bridge dispatch code needs to resolve tenantId from userId.
**Fix**: Either add `tenantId` to `scheduledMessages`, or resolve it from `users.tenantId`
at dispatch time.

#### C.3.4 Zod Schemas Not Defined (MEDIUM)

Section 8.1 references 5 Zod schemas (`createAgencySchema`, `updateAgencySchema`, `addAgentSchema`,
`updateAgentSchema`, `setFlowsSchema`) that are never defined. These should be specified in the
spec since they define the API contract.

#### C.3.5 MasterContext Integration Missing (MEDIUM)

Section 2.2 identifies `MasterContext` as a gap (SmartSpecPro has per-workflow state, but not
cross-agent shared state). However, no section describes how `user_context` is mapped to
agency-swarm's `MasterContext`, or how agents read/write shared state during a run.

#### C.3.6 Guardrail Instantiation Logic Missing (MEDIUM)

Section 6.1 stores guardrails as JSON (`inputGuardrailsJson`, `outputGuardrailsJson`) and
Section 9.1 mentions guardrail configuration UI, but no code shows how JSON config is
converted to actual agency-swarm guardrail objects at runtime.

#### C.3.7 ~~Credit Deduction Endpoint for Python~~ — RESOLVED (Decision #9)

**Decision**: Internal HTTP endpoint `POST /api/internal/credits/deduct` added to Section 8.3.
Protected by `INTERNAL_SERVICE_TOKEN`, uses existing atomic `deductCredits()` function.

### C.4 Remaining Gaps — LOW

#### C.4.1 Section 10.2 Provider Mapping Table Relevance

The provider mapping table shows LiteLLM model prefixes, but with Option B (gateway routing),
the model names sent to `OpenAIChatCompletionsModel` are whatever SmartSpecPro's gateway accepts
(e.g., just `"gpt-4o"`, not `"openai/gpt-4o"`). Mark table as "reference only" or update to
show gateway-accepted model names.

#### C.4.2 Phase 1 Item 2: `[litellm]` Extra

Phase 1 says `pip install agency-swarm[litellm]` but with Option B (gateway-only), LiteLLM is
not directly used. The base `agency-swarm` package may be sufficient. Verify whether
`OpenAIChatCompletionsModel` requires the `[litellm]` extra or ships with the base package.

#### C.4.3 Concurrency Model Not Specified

How many agencies can run simultaneously per Python worker? FastAPI + uvicorn handles this via
async, but agency-swarm's `Agency` object may not be thread-safe. Specify:
- Max concurrent agency runs per worker
- Whether `Agency` instances can be reused or must be created per-request
- Connection pool sizing for the internal httpx client

#### C.4.4 ~~Credit Multiplier Stacking~~ — RESOLVED (Decision #11)

**Decision**: Additive stacking. `combined = 1.0 + (agency_mult - 1.0) + (skill_mult - 1.0)`.
Section 9.4.1 and 10.3 updated to reflect this formula.

#### C.4.5 Still Open Questions Review

Questions #2, #3, #7, #8 have proposed resolutions in Section 16 (pending user approval).
Questions #9, #10, #11 are now **RESOLVED** with user-confirmed decisions.

**All 11 questions status:**
- **Resolved by user**: #1, #4, #5, #6, #9, #10, #11 (7 of 11)
- **Proposed, pending approval**: #2, #3, #7, #8 (4 of 11)
- **Still open**: None

### C.5 Codebase Cross-Reference Summary

| Spec Claim | Codebase Reality | Match? |
|------------|------------------|--------|
| Python 3.11 currently | Dockerfile: `python:3.11-slim` ✓ | ✅ |
| openai >= 1.50.0 | requirements.txt: `openai>=1.50.0` ✓ | ✅ |
| pydantic >= 2.7.4 | requirements.txt: `pydantic>=2.7.4` ✓ | ✅ |
| skills.executionMode is varchar | schema.ts:2262 `varchar("executionMode")` ✓ | ✅ |
| scheduledMessages exists | schema.ts:2676 ✓ | ✅ |
| scheduledMessages has tenantId | **NO** — only has userId | ❌ |
| skills table has agencyId | **NO** — not yet | ❌ (new column needed) |
| encrypt() in crypto.ts | `server/services/crypto.ts:28` ✓ | ✅ |
| openaiCompatGateway is stub | Throws errors: "Forge API not configured" | ✅ (confirmed stub) |
| Credit deduction is internal only | No HTTP endpoint — only TS function | ✅ (needs endpoint or alternative) |

### C.6 Recommended Pre-Implementation Actions

1. **Phase 0 (Pre-Implementation)**:
   - Audit `openai` 1.x → 2.x migration impact across all Python files
   - Test `agency-swarm==1.8.0` install in isolated venv with current dependencies
   - Verify Pydantic 2.7.4 → 2.11 upgrade doesn't break existing models
   - ~~Decide credit deduction strategy~~ **RESOLVED**: Internal HTTP endpoint (Decision #9)

2. **Before Phase 1**:
   - Update all 3 Dockerfiles to `python:3.12-slim`
   - Implement `POST /api/internal/credits/deduct` endpoint (Section 8.3)
   - Add `INTERNAL_SERVICE_TOKEN` to `.env` files
   - Define Zod schemas for agency CRUD (API contract)
   - ~~Decide agency_runs table~~ **RESOLVED**: Separate table (Decision #10)
   - Create Drizzle migration for all 7 agency tables
