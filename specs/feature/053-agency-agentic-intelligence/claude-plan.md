# Implementation Plan: Agency Agentic Intelligence Layer (053)

## 1. Overview

### What We're Building

An intelligence layer for SmartSpecPro's Agency Swarm that enables agents to autonomously plan, execute, reflect, and iterate. Currently, each agent node makes a single LLM call. This plan adds three progressive levels of intelligence:

1. **Level 1 — Agentic Mode:** Prompt-based planning/reflection loop within existing agent execution
2. **Level 2 — ReAct Executor:** Programmatic Thought→Action→Observation loop with direct LLM calls
3. **Level 3 — Autonomous Agent:** Meta-agent that plans sub-tasks, delegates, and self-evaluates

### Why This Architecture

The key architectural decision is that **ReAct executor calls the LLM directly via OpenAI SDK** (not through agency-swarm's `Agency` class). This avoids a "double-loop" problem where agency-swarm's internal tool loop would nest inside ReAct's outer loop, causing uncontrolled cost multiplication. The Node.js gateway at `NODEJS_INTERNAL_URL/v1` handles credit deduction, rate limiting, and audit logging for all LLM calls.

### What Already Exists

| Component | Status | File |
|---|---|---|
| Graph-walking orchestrator | Production | `python-backend/app/services/agency_orchestrator.py` |
| agency-swarm adapter | Production | `python-backend/app/services/agency_swarm_adapter.py` |
| Tool bridge (SSRF-protected) | Production | `python-backend/app/services/agency_tools.py` |
| ExecutionContext | Production | `agency_orchestrator.py` lines 43-87 |
| Direct LLM call pattern | Production | `_llm_classify()`, `_llm_merge()` in orchestrator |
| Event emitter for SSE | Production | `agency_event_emitter.py` |
| Input/output guardrails | Production | `agency_guardrails.py` |
| Credit deduction via gateway | Production | `llmRoutesHandler.ts` |
| Feature flags (Redis + tenant) | Production | `featureFlags.ts` |

### Dependency on Spec 052

Level 1 can start after 052 section-11 (structured output). Level 2 benefits from 052 section-07 (AgencyRunContext) and section-09 (SSE streaming). Level 3 depends on 052's observability (section-13) for trace sub-spans.

---

## 2. Level 1 — Agentic Mode

### 2.1 Planning Strategy Templates

**New file:** `python-backend/app/services/agentic_strategies.py`

Define three planning strategy prompt templates as constants:

- **`basic`** (~200 tokens): Simple "analyze → plan → execute → reflect → finalize" protocol. Instructs the agent to think before acting but keeps overhead minimal.
- **`cot`** (Chain-of-Thought, ~400 tokens): Forces step-by-step reasoning with explicit intermediate conclusions. Each step must show "I need to... Because..."
- **`react`** (~500 tokens): Structured Thought/Action/Observation format for tool-heavy workflows. Each step explicitly labeled.

All templates include the completion instruction: agent must return a JSON block `{"complete": true, "answer": "..."}` when done.

The module exports a `get_planning_prompt(strategy: str, max_cycles: int) -> str` function that returns the static template with the cycle count filled in.

### 2.2 Input Sanitizer

**New file:** `python-backend/app/services/agentic_sanitizer.py`

A shared utility for stripping prompt injection markers from content entering agentic loops:
- Regex-based filter for known injection patterns (`[SYSTEM]`, `Ignore previous`, `<|im_start|>`, etc.)
- Length limiting (configurable, default 10000 chars)
- Non-printable character stripping
- Used by all three levels

### 2.3 Hard Platform Limits

**New file:** `python-backend/app/services/agentic_limits.py`

Env-configurable constants that ALL executors must respect:

```python
MAX_REFLECTION_CYCLES = 10
MAX_REACT_ITERATIONS = 20
MAX_TOKENS_BUDGET = 100000
MAX_TOKENS_PER_ITERATION = 8000
MAX_PLAN_DEPTH = 5
MAX_TOTAL_ITERATIONS = 50
MAX_DELEGATION_DEPTH = 3
MAX_MEMORY_CONTENT_LENGTH = 500
MAX_MEMORIES_PER_AGENT = 100
```

Every user-configurable value is clamped: `min(user_value, PLATFORM_MAX)`.

### 2.4 Orchestrator Modification: Agentic Execution Path

**Modified file:** `python-backend/app/services/agency_orchestrator.py`

Add new method `_execute_agent_node_agentic()` called from `_execute_agent_node()` when `nodeConfig.executionMode == "agentic"`.

**Flow:**
1. Read `executionMode`, `planningStrategy`, `maxReflectionCycles` from node config
2. Clamp `maxReflectionCycles` against `MAX_REFLECTION_CYCLES`
3. Get planning prompt template via `get_planning_prompt(strategy, max_cycles)`
4. For each cycle (up to max):
   a. Augment agent instructions with planning prompt (static system message)
   b. Call `self._run_single_agent(node, ctx)` (existing adapter path)
   c. Parse response for `CompletionSignal` via `_parse_completion()`
   d. If complete: extract answer and return
   e. If not: overwrite `ctx.results[node_id]` with current result, continue
5. After max cycles: return last result

**Completion detection:** Parse JSON block at end of response matching `{"complete": bool, "answer": str}`. Never scan full text for bare string markers (prompt injection risk). Use structured output via `CompletionSignal` Pydantic model.

### 2.5 Frontend: NodePropertyPanel Extension

**Modified file:** `apps/web/client/src/components/agency/NodePropertyPanel.tsx`

Add an "Intelligence" section to agent node config panel:
- **Execution Mode** dropdown: "Standard" | "Agentic"
- When "Agentic" selected, show:
  - **Planning Strategy** dropdown: Basic | Chain-of-Thought | ReAct
  - **Max Reflection Cycles** slider: 1-10 (default 3)
  - **Show Reasoning** checkbox
- Cost warning banner: "Agentic mode may use 2-5x more credits per run"

### 2.6 Zod Validation Extension

**Modified file:** `apps/web/server/routers/agency.ts`

Add validation for new `nodeConfig` fields in `saveBuilder` procedure:
- `executionMode`: enum `["single_shot", "agentic"]`
- `maxReflectionCycles`: integer 1-10
- `planningStrategy`: enum `["basic", "cot", "react"]`
- `showReasoning`: boolean

### 2.7 Feature Flag Registration

**Modified files:**
- `packages/shared/featureFlags.ts` — Add `agencyAgenticModeEnabled` to `TenantFeatureFlags` interface, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` (default: true)

**Python flag check:** The Python backend reads feature flags via the existing system_settings loader pattern used in `agency_service.py`. The flag is queried from the Node.js backend via internal HTTP call to `/api/internal/feature-flags/{flagName}?tenantId={tenantId}`.

### 2.8 Audit Logging

Each reflection cycle emits a sub-span to 052's trace system:
```typescript
{ spanType: "agentic_cycle", cycleNumber: N, tokensUsed: T, status: "complete"|"continue" }
```

---

## 3. Level 2 — ReAct Executor

### 3.1 ReActExecutor Class

**New file:** `python-backend/app/services/react_executor.py`

Core class that implements the Thought→Action→Observation loop:

**Constructor parameters:**
- `gateway_client: AsyncOpenAI` — Required. Points at `NODEJS_INTERNAL_URL/v1` with `user_token` as api_key
- `model_name: str` — Model ID (e.g. "gpt-4o", "claude-sonnet-4-20250514")
- `agent_instructions: str` — System prompt for the agent
- `tools: list[ToolDefinition]` — Available tools with JSON schemas
- `max_iterations: int` — Clamped to `MAX_REACT_ITERATIONS`
- `max_tokens_budget: int` — Clamped to `MAX_TOKENS_BUDGET`
- `max_tokens_per_iteration: int` — Default 8000

**`execute(task, context)` method flow:**
1. Build initial messages: system prompt (static) + user message with `sanitize_llm_input(task)`
2. For each iteration up to `max_iterations`:
   a. Call `gateway_client.chat.completions.create()` with messages + tools as function definitions
   b. Track token usage from response
   c. Check token budget — if exceeded, return partial result
   d. Parse response: check for `tool_calls` in the response
   e. If no `tool_calls` → agent is done, extract final answer from content
   f. If `tool_calls` present:
      - Execute each tool via HTTP to internal endpoints (reusing tool bridge pattern)
      - Build observation message with tool results
      - Append to messages
      - If same tool called with same params as before → add constraint to working memory
   g. Every 5 iterations: compress older messages into summary (keep system prompt + last 3 messages pinned)
3. Return `ReActResult` with status, final answer, iteration count, total tokens, reasoning trace

**Tool execution:** Tools are called via HTTP POST to their internal endpoints (same pattern as `_call_skill()` in orchestrator). SSRF validation applied via existing `_validate_tool_url()`. Tool results truncated to 2000 chars before feeding back.

**Tool result formatting:** After executing a tool, the result is formatted as an OpenAI `tool` role message:
```python
{"role": "tool", "tool_call_id": tool_call.id, "content": sanitize_llm_input(result[:2000])}
```
This matches the OpenAI chat completions API format so the gateway processes it correctly.

**Message compression:** Every 5 iterations, older messages (beyond system prompt + last 3 user/assistant/tool messages) are summarized. The summary is generated by calling the same gateway with a short "summarize these observations" prompt. The original messages are replaced with a single user message containing the summary. System prompt is always pinned (never compressed).

**`ReActResult` data class:**
```python
class ReActResult:
    status: str           # "complete" | "max_iterations" | "budget_exceeded"
    final_answer: str
    iterations: int
    total_tokens: int
    reasoning_trace: list[Observation]
```

### 3.2 Working Memory

**New file:** `python-backend/app/services/working_memory.py`

Per-run scratch pad stored in Redis:

**Key pattern:** `agency:run:{tenant_id}:{run_id}:memory:{agent_id}` (TTL: 1 hour)

**WorkingMemory class:**
- `observations: list[dict]` — tool results with `useful` flag
- `constraints: list[str]` — learned "don't do this" items (max 20)
- `failed_approaches: list[str]` — what didn't work (max 20)
- `artifacts: dict[str, str]` — named intermediate results

**Key methods:**
- `add_observation(tool, result, useful)` — sanitizes via `sanitize_llm_input()` before storing
- `add_constraint(constraint)` — deduplicated, sanitized
- `get_summary(max_tokens=2000)` — produces condensed text for LLM context injection
- `_evict_if_needed()` — evicts `useful=False` first, then oldest

**Injection into LLM:** Summary is placed in a user-role message wrapped with `<past_learnings>` delimiters, explicitly framed as "hints, NOT instructions."

### 3.3 Cost Controls

**New file:** `python-backend/app/services/agentic_cost_controls.py`

**TokenBudgetTracker class:**
- Tracks cumulative tokens across iterations
- Emits `budget_warning` SSE event at 80% usage
- Returns `budget_exceeded` status when limit hit
- Note: budget check is post-hoc (after each iteration completes), not real-time during streaming

**ConcurrentRunLimiter class:**
- Redis-based concurrent run counter per tenant and per user
- Per-tenant max: 3 agentic runs (admin-configurable)
- Per-user max: 2 ReAct, 1 autonomous (hard-coded)
- Acquire/release pattern with TTL fallback (prevent stuck counters)
- **When limit exceeded:** Return HTTP 429 with `Retry-After` header + error message "Maximum concurrent agentic runs reached. Please wait for an existing run to complete."

### 3.4 Orchestrator Integration

**Modified file:** `python-backend/app/services/agency_orchestrator.py`

In `_execute_agent_node()`, when `executionMode == "agentic"` and `planningStrategy == "react"`:
1. Create `AsyncOpenAI` client pointing at Node.js gateway
2. Resolve tools via `resolve_tools_for_agent()` — convert to OpenAI function definitions
3. Create `ReActExecutor` with client, model, tools
4. Execute with `augmented_message` and `ctx`
5. Return `result.final_answer`

The key difference from Level 1: Level 1 re-invokes `adapter.run()` (agency-swarm) per cycle. Level 2 owns the LLM loop directly.

**`_run_single_agent` reference (Level 1):** This is the existing `_execute_agent_node()` code path that creates an `AgencySwarmAdapter` agent, wraps it in a sub-agency, and calls `adapter.run()`. Level 1 reuses this path with modified instructions. Level 2 replaces it entirely.

**`ToolDefinition` type:** A dict matching the OpenAI function calling schema: `{"type": "function", "function": {"name": str, "description": str, "parameters": dict}}`. Built from `ToolConfig` objects via `tool_config_to_function()` (§3.5).

### 3.5 Tool Definition Conversion

Tools in the codebase are represented as `ToolConfig`/`CustomToolConfig` objects. For ReAct, they need to be converted to OpenAI function definitions:

```python
def tool_config_to_function(tool: ToolConfig) -> dict:
    """Convert SmartSpecPro ToolConfig to OpenAI function definition."""
    return {
        "type": "function",
        "function": {
            "name": tool.tool_id,
            "description": tool.description,
            "parameters": tool.input_schema or {"type": "object", "properties": {}},
        }
    }
```

The reverse mapping (from LLM tool_call to tool execution) uses `tool_id` to look up the endpoint URL and risk level.

### 3.6 Feature Flags

Add `agencyReactExecutorEnabled` (default: false) to `TenantFeatureFlags`. The orchestrator checks this flag before entering the ReAct path.

### 3.7 SSE Event Types

New events for Level 2 (coordinate with 052 section-09):
- `react_iteration_complete`: `{iteration, toolUsed, tokensUsed}`
- `budget_warning`: `{usedPct, tokensUsed, budget}`

---

## 4. Level 3 — Autonomous Agent

### 4.1 Autonomous Agent Node Type

**New node type:** `autonomous_agent`

Must be registered in:
- `agencyAgents.nodeType` constraint in Drizzle schema
- Frontend node dispatcher (`BaseAgencyNode.tsx`)
- Orchestrator's `match node_type` block

**nodeConfig schema** adds fields for:
- `maxPlanDepth` (1-5, default 3)
- `maxTotalIterations` (1-50, default 20)
- `delegationMode`: `"self_only"` | `"delegate_to_agents"` | `"auto"`
- `reflectAfterSteps` (1-10, default 3)
- `enableLongTermMemory` (boolean, default false)
- `decompositionStrategy`: `"sequential"` | `"parallel"` | `"adaptive"`
- `qualityThreshold` (0-1, default 0.8)
- `budgetAllocation`: `"equal"` | `"proportional"` | `"dynamic"`

### 4.2 Autonomous Executor

**New file:** `python-backend/app/services/autonomous_executor.py`

Three-phase cycle: Plan → Execute → Reflect → (re-plan if needed)

**AutonomousPlanner:**
- Takes task description + execution context
- Calls LLM with structured output (`TaskPlan` Pydantic model)
- `_validate_plan()`: rejects empty plans, detects dependency cycles, validates agent references
- Returns `TaskPlan` with sub-tasks, dependencies, tool assignments, parallelizability

**AutonomousExecutor:**
- Topologically sorts sub-tasks by dependencies
- For each task group:
  - Parallel tasks: `asyncio.gather()`
  - Sequential tasks: one at a time
- Each sub-task either:
  - Executes locally via `ReActExecutor` (from Level 2)
  - Delegates to another agent in the agency via `_delegate()`
  - Delegates to another agency via `builtin-agency-call` tool (cross-agency)

**AutonomousReflector:**
- Calls LLM with structured output (`ReflectionResult` Pydantic model)
- Evaluates quality_score (0-1), identifies gaps, recommends whether to re-plan
- `suggestions` and `replan_focus` treated as user-role content when fed back (not system-role)

### 4.3 Delegation with Depth Control

**Modified file:** `python-backend/app/services/agency_orchestrator.py`

Add `delegation_depth: int = 0` to `ExecutionContext.__init__()`.

In `_delegate()`:
1. Check `ctx.delegation_depth >= MAX_DELEGATION_DEPTH` → raise hard error
2. Create shallow clone of ExecutionContext for delegation
3. Increment `delegation_depth` on clone
4. For same-agency: call `self._execute_node()` on target agent
5. For cross-agency: call `builtin-agency-call` tool with current depth passed through. The existing `agency_call_tool.py` already tracks `current_depth` — the autonomous executor must pass `ctx.delegation_depth` as the starting depth so the two counters are unified. This uses the same Redis-based loop detection and budget enforcement already in place.

The delegated agent writes to its own result namespace (shallow clone of ExecutionContext). Results copied back to parent context only on success. Failed delegations are recorded in working memory as constraints.

### 4.4 Execution Memory Store

**New file:** `python-backend/app/services/execution_memory_store.py`

Dual-storage for autonomous execution state:
- **Redis:** Full scratch-pad (working memory, current messages, plan state). TTL 1 hour.
- **PostgreSQL:** Durable checkpoint written after each sub-task completion:
  - `completed_subtask_ids: list[str]`
  - `current_plan_version: int`
  - `total_tokens_used: int`
  - Stored in `agency_run_traces.trace` JSONB

**Key pattern:** `agency:autonomous:{tenant_id}:{run_id}` — tenant-namespaced, uuid4 run IDs.

On crash recovery: load checkpoint from Postgres (survives Redis failure), load scratch-pad from Redis (if available), resume from last completed sub-task.

### 4.5 Long-Term Memory

**New Drizzle table:** `agency_agent_memories`

Fields: `id`, `tenant_id` (VARCHAR(36)), `agency_id` (VARCHAR(36)), `user_id` (INTEGER), `agent_node_id`, `memory_type` (constraint/preference/fact/skill), `content` (max 500 chars), `content_hash` (SHA-256), `source_run_id`, `confidence`, `use_count`, `last_used_at`, `created_at`, `updated_at`, `is_active`.

**Indexes:**
- Lookup: `(tenant_id, agency_id, agent_node_id, user_id, is_active)`
- Uniqueness: `(tenant_id, agency_id, agent_node_id, user_id, content_hash) WHERE is_active`

**Memory lifecycle:**
- **Extraction:** After successful run, reflector LLM extracts learnable insights. Safety filter LLM pass before DB write rejects content containing instructions/commands.
- **Injection:** Before planning, relevant memories loaded and injected as user-role message with `<past_learnings>` framing.
- **Decay:** Celery Beat daily job: `confidence *= 0.95^days_since_last_use`. Memories with confidence < 0.1 soft-deleted.
- **Audit:** All write/delete operations logged via `log_agency_event()`.

**Scope:** All queries filter by `tenant_id + agency_id + agent_node_id + user_id`. No cross-user memories.

### 4.6 tRPC Memory CRUD

**Modified file:** `apps/web/server/routers/agency.ts`

Three new procedures:
- `agency.listAgentMemories` — paginated, filterable by `memoryType`
- `agency.deleteAgentMemory` — soft delete, owner or domain_admin
- `agency.resetAgentMemories` — soft delete all for agent+user

Auth: `protectedProcedure` + tenant isolation. Delete operations verify user is memory owner or domain_admin.

### 4.7 Frontend Components

**New files in `apps/web/client/src/components/agency/`:**

- **AutonomousAgentNode.tsx:** Node card for ReactFlow builder. Purple gradient border, brain-circuit icon. Shows name, model, delegation mode.
- **AutonomousConfigPanel.tsx:** Full config panel with all nodeConfig fields from §4.1.
- **ExecutionTimeline.tsx:** Real-time execution view showing Plan → Sub-tasks → Progress → Reflections. Expandable steps with reasoning. Token usage meter.
- **MemoryViewer.tsx:** Admin panel for viewing/deleting agent memories. Filter by type, sort by confidence/use_count.

### 4.8 Feature Flags

- `agencyAutonomousAgentEnabled` (default: false)
- `agencyLongTermMemoryEnabled` (default: false)

### 4.9 SSE Event Types

- `autonomous_plan_created`: `{planVersion, subtaskCount}`
- `autonomous_subtask_complete`: `{subtaskId, status, tokensUsed}`
- `autonomous_reflection`: `{qualityScore, isComplete, replanRequired}`

---

## 5. Cross-Cutting Concerns

### 5.1 Trace Sub-Spans

All three levels integrate with 052's `agency_run_traces` table. Sub-span schema:

```typescript
interface AgenticTraceSpan {
  spanType: "agentic_cycle" | "react_iteration" | "autonomous_plan"
    | "autonomous_subtask" | "autonomous_reflection" | "delegation";
  cycleNumber?: number;
  iterationNumber?: number;
  planVersion?: number;
  subtaskId?: string;
  toolName?: string;
  tokensUsed: number;
  durationMs: number;
  status: "complete" | "failed" | "budget_exceeded" | "depth_limit";
}
```

### 5.2 Error Handling

- **Token budget exceeded:** Return best partial result with `status: "budget_exceeded"`
- **Max iterations reached:** Return last result with `status: "max_iterations"`
- **Delegation depth exceeded:** Hard error (raise), not just log
- **LLM call failure (transient):** Retry up to 3 times with exponential backoff (reuse adapter pattern)
- **LLM call failure (permanent):** Return error message, do not retry
- **Tool execution failure:** Record in working memory as failed approach, continue loop
- **3 consecutive tool failures:** Circuit breaker — stop iteration

### 5.3 Backward Compatibility

- `executionMode` defaults to `"single_shot"` — existing agencies unaffected
- `autonomous_agent` is a new node type — existing agencies don't have it
- All new fields in `nodeConfig` are optional with defaults
- Feature flags gate all new functionality

---

## 6. File Change Summary

### New Files (Python)

| File | Purpose | Level |
|---|---|---|
| `python-backend/app/services/agentic_strategies.py` | Planning prompt templates | 1 |
| `python-backend/app/services/agentic_sanitizer.py` | Prompt injection prevention | 1 |
| `python-backend/app/services/agentic_limits.py` | Platform-wide hard caps | 1 |
| `python-backend/app/services/react_executor.py` | ReAct execution engine | 2 |
| `python-backend/app/services/working_memory.py` | Redis-backed per-run memory | 2 |
| `python-backend/app/services/agentic_cost_controls.py` | Budget + rate limit | 2 |
| `python-backend/app/services/autonomous_executor.py` | Plan/Execute/Reflect engine | 3 |
| `python-backend/app/services/execution_memory_store.py` | Dual Redis+Postgres storage | 3 |
| `python-backend/app/models/agency_agent_memories.py` | SQLAlchemy model | 3 |

### New Files (Frontend)

| File | Level |
|---|---|
| `apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx` | 3 |
| `apps/web/client/src/components/agency/AutonomousConfigPanel.tsx` | 3 |
| `apps/web/client/src/components/agency/ExecutionTimeline.tsx` | 3 |
| `apps/web/client/src/components/agency/MemoryViewer.tsx` | 3 |

### Modified Files

| File | Change | Level |
|---|---|---|
| `python-backend/app/services/agency_orchestrator.py` | Add agentic + ReAct paths, delegation_depth | 1-3 |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add Intelligence section | 1 |
| `apps/web/server/routers/agency.ts` | Zod validation + memory CRUD | 1-3 |
| `apps/web/drizzle/schema.ts` | Add `agency_agent_memories` table | 3 |
| `packages/shared/featureFlags.ts` | 4 new flags | 1-3 |

### New Tests

| File | Level |
|---|---|
| `python-backend/tests/unit/test_agentic_strategies.py` | 1 |
| `python-backend/tests/unit/test_agentic_sanitizer.py` | 1 |
| `python-backend/tests/unit/test_completion_detection.py` | 1 |
| `python-backend/tests/unit/test_react_executor.py` | 2 |
| `python-backend/tests/unit/test_working_memory.py` | 2 |
| `python-backend/tests/unit/test_cost_controls.py` | 2 |
| `python-backend/tests/unit/test_autonomous_executor.py` | 3 |
| `python-backend/tests/unit/test_long_term_memory.py` | 3 |
| `python-backend/tests/integration/test_agentic_integration.py` | 1-3 |
| `apps/web/client/src/components/agency/__tests__/AgenticConfig.test.tsx` | 1 |

---

## 7. Implementation Order

### Phase 1: Level 1 Foundation (sections 01-04)
1. `agentic_limits.py` + `agentic_sanitizer.py` + `agentic_strategies.py` (shared infrastructure)
2. Orchestrator modification (`_execute_agent_node_agentic()`, `_parse_completion()`)
3. Frontend NodePropertyPanel toggle
4. Feature flag registration + Zod validation

### Phase 2: Level 2 ReAct Engine (sections 05-08)
5. `react_executor.py` (core loop + tool execution)
6. `working_memory.py` (Redis scratch-pad)
7. `agentic_cost_controls.py` (budget + rate limits)
8. Orchestrator integration + SSE events

### Phase 3: Level 3 Autonomous Agent (sections 09-13)
9. Database migration (`agency_agent_memories`)
10. `autonomous_executor.py` (planner + executor + reflector)
11. `execution_memory_store.py` (Redis + Postgres dual storage)
12. tRPC memory CRUD + long-term memory service
13. Frontend components (node card, config panel, timeline, memory viewer)
