---
name: Agency Swarm Execution Architecture Research Brief
description: Comprehensive research on how Agency Swarm system executes agents, node types, tools, and orchestration for multi-step agentic capabilities assessment
type: project
---

# Research Brief: Agency Swarm Execution Architecture

**Date**: 2026-03-22
**Status**: COMPLETE
**Scope**: Full execution model, node types, tool system, LLM integration, and multi-step capabilities

## Findings

### 1. Execution Model: Single-Shot with Limited Multi-Step Support

**Current architecture:**
- **Entry point**: Single `agent` or `supervisor` node (marked `isEntryPoint: true`)
- **Execution**: `AgencySwarmAdapter.run()` → `agency.get_response(message)` → **ONE round-trip to LLM**, returns final response
- **Tool handling**: Agent can call tools during its turn; tools execute synchronously, results fed back to agent
- **Per-turn cost**: Fixed timeout (600s max), fixed LLM call count (depends on tool use)
- **Result flow**: Final output returned as string; no intermediate step artifacts stored

**Limitations for multi-step work:**
1. Agent has no explicit "planning" phase — planning happens implicitly in LLM context
2. No step checkpoints or resumption — if the agent fails midway, the whole run fails
3. No native support for executing independent subtasks in parallel (orchestrator does parallel edges, but agents don't)
4. Agent cannot "pause and ask human" then "resume with context" — human approval blocks execution
5. No way to decompose a complex task into sub-tasks with different models/budgets per sub-task

**Existing multi-step capability (Orchestrator only):**
- `AgencyOrchestrator` (Python backend, `/python-backend/app/services/agency_orchestrator.py`) walks a graph of **non-agent nodes** and delegates agent/supervisor nodes to `AgencySwarmAdapter.run()`
- Supports sequential + parallel edges (lines 214-240)
- Accumulates results in `ExecutionContext.results` dict (line 56)
- Context is **mutable** — each node can read prior results and knowledge (lines 67-81)

---

### 2. Node Types: 8 Existing, 10 Critical Gaps (Documented in Memory)

**8 Existing Node Types:**

| Type | Behavior | Execution | Multi-Step Role |
|------|----------|-----------|-----------------|
| `agent` | LLM with tools | Via `AgencySwarmAdapter.run()` | Entry point or sub-step |
| `supervisor` | LLM coordinator (placeholder) | Via `AgencySwarmAdapter.run()` | Should coordinate agents; semantic only |
| `router` | Route based on input | LLM classify / keyword / regex | Binary decision making |
| `aggregator` | Merge upstream results | LLM merge / concat / majority vote | Combine parallel outputs |
| `knowledge_base` | RAG search (populated async) | Hybrid RAG with scope enforcement | Knowledge injection |
| `skill_call` | Execute SmartSpecPro skill | HTTP to `/api/v1/skills/execute` | Skill integration (static input mapping) |
| `human_approval` | Pause for approval | HTTP to `/api/v1/approvals/create` | Blocking gate (24h timeout) |
| `browser_session` | Browser automation | Via `AgencyBrowserSessionExecutor` | RPA tasks |

**Critical Gaps Identified:**

1. **Conditional Branch** — No if/else splitting (partially supported via router, but binary only)
2. **Parallel Fan-Out** — No "split into N independent subtasks" (orchestrator edges exist but not node type)
3. **Loop/Retry** — No "re-execute node until condition met"
4. **Data Transform** — No JSONPath / template-based result transformation
5. **Timer/Delay** — No "wait N seconds before proceeding"
6. **Memory/State** — No persistent state across node executions (ExecutionContext is ephemeral)
7. **Webhook Trigger** — No "wait for external HTTP callback"
8. **Code Execution** — No "run Python/JavaScript snippet"
9. **HTTP API Call** — No "call arbitrary REST endpoint" (only internal HTTP bridges)
10. **Error Handler** — No "catch upstream node failure and handle gracefully"

---

### 3. Tool Execution Model: Hybrid HTTP + Native Dispatch

**Architecture:**
- Tools are **pre-assigned per agent** via `agency_agent_tools` table (LEFT JOIN with `agency_tools`)
- Tool config merged from base (in `agency_tools.config`) + instance override (in `agency_agent_tools.toolConfig`)
- 16 builtin tools: 10 exposed in frontend + 6 backend-only
- 1 tool missing (should be 17 total per code count)

**Execution routing by risk level:**

| Risk Level | Routing | Whitelist Check | Execution |
|------------|---------|-----------------|-----------|
| **low** (9 tools) | Always allowed | No | Direct HTTP to internal endpoint |
| **medium** (6 tools) | Whitelisted check | YES (required) | Direct HTTP (30s timeout) |
| **high** (1 tool: browser) | Whitelisted check | YES (required) | OpenSandbox dispatch (60s timeout) |
| **special**: agency-call | Whitelisted check | YES (required) | Native async via `asyncio.run()` (sub-agency recursion) |
| **special**: present-files | Whitelisted check | No | Native agency-swarm `PresentFiles` class (v1.8) |

**Builtin Tools (16 total):**
```
"builtin-rag-knowledge"        → /api/internal/tools/rag-knowledge (low)
"builtin-skill-executor"       → /api/internal/tools/skill-executor (medium)
"builtin-web-search"           → /api/internal/tools/web-search (medium)
"builtin-http-request"         → /api/internal/tools/http-request (medium)
"builtin-email-notify"         → /api/internal/tools/email-notify (low)
"builtin-webhook"              → /api/internal/tools/webhook (medium)
"builtin-slack-message"        → /api/internal/tools/slack-message (low)
"builtin-document-search"      → /api/internal/tools/document-search (low)
"builtin-voice"                → /api/internal/tools/voice (medium)
"builtin-browser"              → (sandbox) (high)
"builtin-agency-call"          → (native async) (high) [cross-agency calls]
"builtin-auto-draft"           → /api/internal/tools/auto-draft (medium)
"builtin-model-suggest"        → /api/internal/tools/model-suggest (low)
"builtin-file-parse"           → /api/internal/tools/file-parse (medium)
"builtin-schedule-draft"        → (sandbox) (high)
"builtin-skill-discovery"      → /api/internal/tools/skill-discovery (low)
"builtin-present-files"        → (native PresentFiles class v1.8) (low)
```

**Tool input mapping gap:**
- `skill_call` node has `nodeConfig.skillSlug + nodeConfig.inputMapping`
- But `inputMapping` is **never used** — full context passed to skill executor
- Skill input schema (`input.schema.json`) is ignored
- All skills receive: full user input + full ExecutionContext

**Custom tools:**
- Supported in DB (`agency_tools` table with custom UUID IDs)
- No creation UI — must insert directly
- Validation: input schema + strict mode enforcement
- oneCallAtATime serialization per tool_id
- Retry policy support (exponential backoff)

---

### 4. LLM Integration Points

**LLM calls happen at these locations:**

1. **Agent nodes** (`_execute_agent_node`, line 244-333)
   - Via `AgencySwarmAdapter.run()`
   - Calls `agency.get_response(augmented_message)`
   - Augmented message includes: user input + accumulated knowledge + prior node results
   - Agent's instructions can be augmented with agent-level knowledge base context (lines 253-265)
   - **Single LLM turn** (agent can call tools, but within one `get_response()` call)
   - Returns `RunResult` with: response text + token usage + step count + per-model breakdown

2. **Router nodes** (`_llm_classify`, line 369-392)
   - HTTP POST to `/api/v1/llm/simple` on Node.js gateway (line 380)
   - Prompt: "Classify input into one of these routes: [routes] → which targetNodeId?"
   - Returns target node ID
   - **Standalone LLM call** (not part of agent conversation)

3. **Aggregator nodes** (`_llm_merge`, line 420-438)
   - HTTP POST to `/api/v1/llm/simple` on Node.js gateway
   - Prompt: "Merge these responses: [responses] → merged output"
   - **Standalone LLM call**

4. **Skill nodes** (`_call_skill`, line 576-603)
   - HTTP POST to `/api/v1/skills/execute` on Python backend
   - Skill execution is **independent** of the main agent
   - Skill may call its own LLMs (depending on skill type)
   - Input: skill_slug + user input + full context

**LLM gateway routing:**
- Agent LLMs route through `AgencySwarmAdapter._create_model()` (line 161-179)
- OpenAI SDK client with `base_url = NODEJS_INTERNAL_URL/v1` (Node.js gateway)
- `api_key = user_token` (JWT for credit attribution)
- Node.js gateway routes to enabled LLM providers, deducts credits
- **Centralized credit deduction at gateway** (not at Python orchestrator)

**No explicit "planning" LLM call:**
- Agent receives augmented context but no explicit plan generation
- Planning happens implicitly in agent's internal reasoning
- Task planner (Node.js side) generates `TaskExecutionPlan` at request start (separate from agency execution)

---

### 5. Data Flow & Context Passing

**ExecutionContext (Python, line 41-82):**
```python
class ExecutionContext:
  input: str                              # Original user message
  user_token: str                         # JWT for credit attribution
  tenant_id: str                          # Tenant isolation
  user_id: int
  results: dict[str, str]                 # node_id → result text
  knowledge: list[dict]                   # RAG results (title, content, score)
  history: list[dict]                     # Conversation history (unused)
  task_metadata: dict                     # From Node.js planner
  step_attempts: list[dict]               # Step snapshots for billing
  browser_sessions: list[dict]            # Open browser sessions
  active_browser_session_id: str | None   # Current session
```

**Context passing:**
- Each node reads: `ctx.input` + `ctx.knowledge` + `ctx.results` (all prior node outputs)
- Nodes populate: `ctx.results[node_id] = output`
- Knowledge nodes: populate `ctx.knowledge` (not results)
- Router nodes: return next node ID (don't populate results)
- Result chaining: "Last result in chain is final answer" (line 238)

**No branching state isolation:**
- If node A and node B both run (parallel edges), both write to same `ctx.results`
- No "local variables" per branch
- No "context cleanup" between branches

---

### 6. Existing Multi-Step Architecture: Task Planner

**Node.js side planning (`taskPlannerMiddleware.ts`):**
- Runs BEFORE agency execution
- Classifies task type: `"chat" | "skill" | "media" | "responses" | "agency"`
- Builds `TaskExecutionPlan`: immutable plan with task type + complexity + requirements + strategy
- Creates `task_runs` DB record (stores plan as JSON)
- Creates `taskRunId` (numeric) for billing reconciliation
- Resolves model from plan (capability-aware)
- **Zero overhead when disabled** (feature flag check only)

**Per-step tracking:**
- `taskStepAttempts` table captures: model + provider + input/output tokens + credits
- Created during task execution via `recordStepAttempt()`
- Used for billing audit trail + cost reconciliation
- **NOT used for resumption** — steps are logged after-the-fact, not before

**Billing metadata contract:**
```typescript
{
  taskRunId: number                 // From task planner
  strategy: "cheapest" | "fastest" | "best"
  effectiveModel: string            // Resolved model ID
  provider: string                  // openai, anthropic, etc.
  attemptIndex: number              // Retry attempt count
  sourceType: string                // chat, skill, media, agency, etc.
  taskType: string                  // From classification
}
```

**Does NOT support:**
- Explicit planning step (plan is generated, but no explicit "think about this first" phase)
- Multi-step resumption (steps are tracked, but plan is immutable)
- Step-level checkpointing (no way to "save state at step 3 and retry from step 4")
- Sub-task decomposition (planner generates one plan for entire task)

---

### 7. Skill Integration in Agencies: Partial

**Current skill_call node:**
- Config: `skillSlug` + optional `skillId` + `inputMapping` + `passInputThrough`
- Execution: POST to `/api/v1/skills/execute` with skill_slug + full input + full context
- **inputMapping is never used** (code reads config.get("inputMapping") but never applies it)
- Skill receives: raw user input + full ExecutionContext

**Skill system (separate, not integrated):**
- Skill detection: `skillDetector.ts` matches intent via triggers + confidence threshold
- Skill execution: `skillExecutor.ts` calls skill endpoint with formatted input
- Skill chaining: Supported at skill level (result of skill A feeds into skill B)
- **No dynamic skill selection within agency** (skills are pre-assigned to agents, not dynamically chosen)

**Gap:** Agency doesn't route to skills dynamically based on message content; users must explicitly add skill_call nodes.

---

### 8. Current Limitations for Multi-Step Agentic Work

**Single-agent limitation:**
- Agent sees all tools + context at once
- No explicit planning phase (implicit in agent's reasoning)
- Agent must solve the entire problem in one turn (with tool calls within that turn)
- No way to say "agent A does step 1, agent B does step 2, agent C does final validation"
- **Supervisor node exists but is semantic only** — no delegation strategy implemented

**No explicit checkpointing:**
- If an agent run fails halfway through, entire run fails
- No way to "resume from step N with context"
- Retry happens at the agency level, not at the node level

**No dynamic routing:**
- Routes are pre-defined in router node config (not learned or adaptive)
- Routers don't use agent reasoning — just LLM classify + keyword/regex matching

**Tool limitations:**
- Skill inputs not mapped (raw input passed)
- Custom tools must be created via DB insert (no UI)
- No tool chaining (tools can't call other tools)
- No tool result transformation (result returned as-is)

**Parallel execution limitations:**
- Parallel edges exist but no "fan-out N independent tasks" abstraction
- No waiting for all to complete then merging (aggregator exists but is manual)
- Results stored flat in `ctx.results`, no branch isolation

---

## Current Architecture

### Files & Line Numbers

**Frontend (React + tRPC):**
- `/apps/web/client/src/components/agency/` — Node UI components (7 card types)
  - `AgencySidebar.tsx` lines 18-107: Node type picker
  - `NodePropertyPanel.tsx`: Node config UI
  - `ToolPicker.tsx`: 2-step tool assignment
- `/apps/web/server/routers/agency.ts` lines 1-900+: CRUD + run procedures
  - `executeRun` (calls `agencyBridge.executeRun`)
  - `saveBuilder` with validation
  - `autoCreate` + `autoCreateStatus` + `autoCreateAnswer`
- `/apps/web/server/services/agencyBridge.ts` lines 1-200+: HTTP client to Python
  - `executeRun()` POSTs to `/api/v1/agencies/{agencyId}/run`

**Backend (Python FastAPI):**
- `/python-backend/app/services/agency_orchestrator.py` lines 1-661: Graph walker
  - `AgencyOrchestrator.run()` entry point
  - `_execute_node()` line 164: dispatch match statement
  - `ExecutionContext` class line 41-82
  - Node executors: `_execute_agent_node` / `_route` / `_aggregate` / `_search_knowledge` / `_call_skill` / `_await_approval` / browser_session
- `/python-backend/app/services/agency_tools.py` lines 1-560: Tool bridging
  - `resolve_tools_for_agent()` line 459: LEFT JOIN merge
  - `_make_run_func()` line 263: Closure that routes by risk level
  - `_execute_http()` line 352: Direct HTTP call
  - `_execute_sandbox()` line 381: Sandbox dispatch
- `/python-backend/app/services/agency_swarm_adapter.py` lines 1-700+: agency-swarm isolation layer
  - `AgencySwarmAdapter.run()` line 488: Calls `agency.get_response()`
  - `AgencySwarmAdapter._extract_usage()` line 367: Token extraction
  - Model creation line 161-179: Routes through Node.js gateway

**Database (Drizzle):**
- `/apps/web/drizzle/schema.ts` lines 4650-4900+: Agency schema
  - `agencyAgents` line 4655: nodeType + nodeConfig
  - `agencyAgentTools` line ~4850: Tool assignment + toolConfig instance override
  - `agencyTools` line ~4800: Custom tool definitions
  - `taskRuns` line 5620: Execution plans
  - `taskStepAttempts` line 5655: Step tracking

**Task Planning (Node.js):**
- `/apps/web/server/services/taskPlannerMiddleware.ts` lines 1-250+
  - `runPlanner()` line 65: Feature-flagged planning
  - `recordStepAttempt()` line 148: Billing snapshot
- `/apps/web/server/services/taskExecutionPlanner.ts` lines 1-250+
  - `buildExecutionPlan()` line 135
  - Task type classification
  - Plan is immutable (frozen)

---

## Risks for Adding Multi-Step Agentic Capabilities

### High-Risk Areas

1. **Backward compatibility**
   - Adding new node types must not break existing agencies
   - Orchestrator match statement (line 172) needs extensibility pattern
   - Risk: Silent failures if new node type not handled in some code path

2. **ExecutionContext mutability**
   - Context is shared across all nodes (no branching isolation)
   - Parallel edges could have race conditions (though asyncio.gather is used)
   - Risk: Subtle bugs if nodes interfere with shared state

3. **LLM call explosion**
   - Adding planning step + intermediate classifications + data transforms could 5x LLM calls
   - Each LLM call is a cost + latency hit
   - Risk: Ballooning user costs if multi-step jobs aren't rate-limited

4. **Tool input mapping**
   - Currently ignored in skill_call nodes
   - Enabling it requires coordination with skill system (separate)
   - Risk: Breaking change if enabled without migrating existing agencies

5. **State persistence**
   - No "save state at step N" for resumption
   - Adding this requires new DB table + async coordination
   - Risk: Operational complexity (zombie runs, cleanup logic)

### Medium-Risk Areas

6. **Supervisor node semantics**
   - Documented as delegator but no actual delegation strategy
   - Existing agencies using supervisor may have wrong mental model
   - Risk: User confusion if we implement "real" supervisor behavior

7. **Knowledge base timing**
   - Currently runs async (populates ctx.knowledge) but doesn't block
   - Adding data transform nodes would require explicit sequencing
   - Risk: Data loss if transform node runs before KB completes

8. **Parallel timeout handling**
   - Parallel edges use `asyncio.gather(..., return_exceptions=True)` (line 228)
   - But orchestrator has no timeout per branch (only global timeout)
   - Risk: Slow branch blocking fast branch if we add time budgets

---

## Options

### Option 1: Incremental Shallow Extensions (6-8 weeks)

**Scope:** Add 5 new node types without changing orchestrator fundamentals

1. **Conditional Branch node** — if/else routing (12-16 hours)
   - Like router but with 3+ branches
   - LLM classify mode or rule-based evaluation
   - Add to orchestrator match statement

2. **Data Transform node** — JSONPath / template results (6-8 hours)
   - Apply transformation to `ctx.results[upstream_node_id]`
   - Store in new output contextKey
   - No new LLM calls

3. **Skill Mapping fix** — Enable inputMapping in skill_call (4-6 hours)
   - Actually apply `nodeConfig.inputMapping` to user input
   - Validate against skill's `input.schema.json`
   - Coordinate with skill system

4. **Parallel Fan-Out node** — Explicit N-way split (8-10 hours)
   - Spawn N subtasks concurrently
   - Wait for all or majority to complete
   - Merge results via LLM or concat

5. **Loop/Retry node** — Re-execute until condition met (10-14 hours)
   - Feedback template (score, check, try again)
   - Exit condition: max iterations, rule-based, or LLM evaluate
   - Track iteration count in context

**Pros:**
- Ships quickly
- Works within existing orchestrator
- No DB schema changes needed

**Cons:**
- Doesn't enable explicit planning phase
- Can't do true multi-step decomposition (agent still sees all tools)
- No state checkpointing for resumption

---

### Option 2: Planning-First Architecture (12-16 weeks)

**Scope:** Add explicit planning step + step-level checkpointing + sub-agent dispatch

1. **Planning Node** — LLM generates explicit task breakdown (8-10 hours)
   - Agent receives: user input + context
   - Agent explicitly says "I need to: 1) X, 2) Y, 3) Z"
   - Parser extracts steps into `ctx.plan_steps` list
   - Orchestrator iterates through steps

2. **Step Executor** — Run each plan step as sub-agency (6-8 hours)
   - Create ephemeral sub-agency for each step
   - Step may use different model + tools + agent
   - Result stored in `ctx.step_results[step_index]`

3. **State Checkpoint** — Save state between steps (10-14 hours)
   - DB table: `agency_run_checkpoints` (run_id, step_index, context_json)
   - Enables resumption if step fails (user fixes and "retry from step N")
   - Garbage collection after run completes or 7 days

4. **Reflection/Critique** — Agent reviews each step output (8-10 hours)
   - After step N: "Is the output correct? [YES/NO/REVISE]"
   - If REVISE: feedback fed into next step
   - Loops until step passes or max attempts reached

**Pros:**
- Enables true multi-step decomposition
- Step-level resumption (better UX for long-running tasks)
- Reflection reduces hallucination (cost: extra LLM calls)
- Explicit planning shows user what the agent is trying to do

**Cons:**
- Significant DB schema changes needed
- 2-3x LLM calls per task (planning + per step + reflection)
- New operational concerns (state cleanup, zombie runs)
- Requires coordination with task planner (currently separate)

---

### Option 3: Hybrid Lightweight Planner (10-12 weeks)

**Scope:** Add planning phase without checkpointing; reuse task planner as execution plan generator

1. **Reuse Task Planner** — Extend task planner for agencies (0-2 hours)
   - Planner already generates `TaskExecutionPlan` for all task types
   - Mark agency runs in planner: `taskType: "agency"`
   - Classify agency complexity from node count + edge count

2. **Planning Agent** — Dedicated agent that generates step breakdown (6-8 hours)
   - Entry point: planning agent (separate from main agent)
   - Output: structured JSON list of steps
   - Steps are NOT executed yet, just planned

3. **Step Template Assignment** — Map steps to nodes/tools (4-6 hours)
   - Planning agent's steps → matched to existing agency nodes
   - If no matching node, create temp skill_call or agent node
   - Store step-to-node mapping in `ctx.step_plan`

4. **Sequential Step Execution** — Execute plan steps in order (4-6 hours)
   - Loop through `ctx.step_plan`
   - Execute each step's node
   - Accumulate results in `ctx.step_results[step_id]`

5. **Single-Pass Execution** — No checkpointing, no resumption (saves time)
   - If step fails, entire plan fails (can re-run entire agency)
   - Simpler than Option 2, but less resilient

**Pros:**
- Reuses task planner infrastructure
- Simpler than full planning + checkpointing
- Shows user the plan before execution
- LLM calls: 1x planning + normal agent execution

**Cons:**
- No step-level resumption (full re-run only)
- Planning agent may diverge from execution nodes
- Still requires new DB column to store plan

---

## Recommendation

**Phase 1 (Validate demand):** Option 1 (Incremental Shallow Extensions)
- **Effort:** 22-30 hours total
- **Timeline:** 2-3 weeks (parallel work possible)
- **Deliverables:** Conditional Branch + Data Transform + Skill Mapping + Parallel Fan-Out + Loop/Retry
- **Launch:** MVP with 5 new node types; gather user feedback on what's actually useful
- **Cost impact:** Minimal (few extra LLM calls per agency run, only if user explicitly uses new nodes)

**Rationale:**
1. Lowest risk (works within existing orchestrator)
2. Fastest to market (2 weeks vs 12-16 weeks)
3. Unblocks common patterns (conditional routing, result transformation)
4. Determines demand before investing in planning + checkpointing infrastructure
5. Can always add planning layer later (Option 3) if demand is high

**Phase 2 (If demand validated):** Option 3 (Hybrid Planning) or full Option 2
- Decide based on user feedback from Phase 1
- If users want resumption: Option 2 (full planning + checkpointing)
- If users just want better decomposition: Option 3 (lightweight planner)

---

## Open Questions

1. **Supervisor node semantics:** Should "supervisor" delegate to sub-agents or just coordinate a round-robin? Current code treats it like a normal agent.

2. **Skill input mapping:** Is the ignored `inputMapping` field intentional (backward compat) or a bug? Should we enable it?

3. **Error handling:** How should orchestrator behave if a node times out? Currently hard-fails the entire agency.

4. **Knowledge base async:** If a knowledge_base node is followed immediately by a skill_call node that needs the knowledge, is the timing deterministic?

5. **Custom tools UI:** Should we build a tool creation UI in the agency builder, or keep it as admin-only DB inserts?

6. **Tool result transformation:** Should tools return structured data (JSON) or strings? Currently treated as strings (truncated to 50KB).

7. **Sub-agency call limits:** `builtin-agency-call` allows cross-agency execution. Should we add depth limits / cycle detection to prevent infinite recursion?

8. **Operator visibility:** Which agency execution details should go into audit logs vs operational dashboards? Currently logging is via structlog (not queryable).
