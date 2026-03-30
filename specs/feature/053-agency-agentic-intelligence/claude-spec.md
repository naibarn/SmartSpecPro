# Synthesized Specification: Agency Agentic Intelligence Layer (053)

## 1. Problem Statement

SmartSpecPro's Agency Swarm treats each agent node as a **single-shot LLM call**: user message → one LLM response → done. Modern LLMs (Claude, GPT, Gemini, Kimi) can autonomously plan, execute tools iteratively, reflect on quality, and self-correct. This spec adds an intelligence layer that enables agents to think, plan, act, observe, and self-correct within a single execution run.

**Relationship to Spec 052:** 052 provides infrastructure (node types, tools, streaming, guardrails). 053 adds agent-level intelligence on top. No overlap — 052 is the pipes, 053 makes agents smart.

## 2. Three Levels of Intelligence

### Level 1: Agentic Mode (Quick Win, 2-3 days)

Add an `executionMode: "agentic"` flag to agent node config. When enabled:
- Inject a structured planning/reflection prompt into agent instructions
- Run a reflection loop: agent executes → check if complete → if not, feed result back and re-invoke
- Three planning strategies: `basic`, `cot` (chain-of-thought), `react`
- Completion detection via structured `CompletionSignal` Pydantic model (NOT text markers)
- Max reflection cycles: configurable (default 3, hard cap 10)

**Implementation timing:** Can start after 052 reaches section-11 (structured output).

### Level 2: ReAct Executor (1-2 weeks)

A programmatic Thought → Action → Observation loop that gives the agent explicit control:
- **ReActExecutor** class calls LLM directly via **OpenAI SDK through Node.js gateway** (no agency-swarm `Agency` objects — avoids double-loop)
- Each iteration: LLM returns tool_calls → execute tools → feed results back
- Working memory (Redis, per-run) tracks observations, constraints, failed approaches
- Token budget enforcement with early termination
- Message history compression every 5 iterations

### Level 3: Autonomous Agent (3-4 weeks)

A meta-agent that plans, delegates, and reflects:
- **Planner** decomposes tasks into sub-tasks with dependencies
- **Executor** runs sub-tasks via ReAct or delegates to other agents
- **Reflector** evaluates quality and triggers re-planning if needed
- **Cross-agency delegation** via existing `builtin-agency-call` tool (with depth tracking)
- Long-term memory (PostgreSQL) — **per-user only**, no shared memories
- Crash recovery: Redis scratch-pad + PostgreSQL durable checkpoint

## 3. Architecture Decisions (from Interview + Research)

| Decision | Choice | Rationale |
|---|---|---|
| ReAct LLM calls | OpenAI SDK via Node.js gateway | Supports structured tool calling, streaming, auto credit deduction |
| Implementation order | Level 1 → 2 → 3, grouped by Level | Incremental delivery, natural dependency order |
| Cross-agency delegation | Yes, via builtin-agency-call | Reuses existing depth tracking in `agency_call_tool.py` |
| Long-term memory scope | Per-user only | Privacy safety, no cross-user leak risk |
| Provider optimization | All providers equal | OpenAI-compatible API uniformly, extensible for future per-provider tuning |
| Plan structure | Sections grouped by Level | Each Level independently deliverable |

## 4. Security Requirements (from Review)

**8 CRITICAL issues identified and addressed in spec v1.1:**
1. All user input in `"role": "user"` messages, never in system prompts (CRIT-1)
2. Memory poisoning defense: safety filter + framing as "hints not instructions" (CRIT-2)
3. Per-user memory isolation via `user_id` column (CRIT-3)
4. Hard platform caps on iterations/budgets via `agentic_limits.py` (CRIT-4)
5. Tenant-namespaced Redis keys: `agency:run:{tenant_id}:{run_id}:*` (CRIT-5)
6. Correct FK types: VARCHAR(36) matching existing schema (CRIT-6)
7. ReActExecutor takes `gateway_client: AsyncOpenAI` — never bypasses credit gateway (CRIT-7)
8. ReAct loop is direct SDK calls, not wrapped in agency-swarm (no double-loop) (CRIT-8)

## 5. Technical Constraints (from Research)

### Codebase Patterns to Follow
- LLM direct calls: use `AsyncOpenAI(base_url=NODEJS_URL/v1, api_key=user_token)` pattern from `AgencySwarmAdapter._create_model()`
- Tool execution: use existing tool bridge HTTP endpoints from `agency_tools.py`
- Event emission: use `self.event_emitter.emit()` for streaming UI updates
- Feature flags: register in `TenantFeatureFlags` interface + `FEATURE_FLAG_DEFAULTS`
- Guardrails: integrate with existing input/output guardrail checkpoints
- Tests: pytest with asyncio, mock httpx for gateway

### ExecutionContext Extensions
- Add `delegation_depth: int = 0` for unbounded recursion prevention
- Agentic mode overwrites `ctx.results[node_id]` (not accumulates per cycle)

### Credit/Billing
- Each ReAct iteration goes through Node.js gateway → credits deducted per call automatically
- Per-run billing grouping under single `agency_run_id` via tracing

## 6. New Database Table

```sql
CREATE TABLE agency_agent_memories (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(36) NOT NULL REFERENCES tenants(id),
  agency_id       VARCHAR(36) NOT NULL REFERENCES agencies(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  agent_node_id   TEXT NOT NULL,
  memory_type     TEXT NOT NULL CHECK (memory_type IN ('constraint','preference','fact','skill')),
  content         TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  source_run_id   TEXT,
  confidence      REAL DEFAULT 1.0,
  use_count       INTEGER DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE
);
```

## 7. New Python Modules

| Module | Purpose | Level |
|---|---|---|
| `agentic_strategies.py` | Planning prompt templates (basic/cot/react) | 1 |
| `agentic_sanitizer.py` | Input sanitization for prompt injection prevention | 1 |
| `agentic_limits.py` | Hard platform caps (env-configurable) | 1 |
| `react_executor.py` | ReAct execution engine (Thought→Action→Observation) | 2 |
| `working_memory.py` | Per-run scratch pad (Redis-backed) | 2 |
| `agentic_cost_controls.py` | Budget tracking + rate limiting | 2 |
| `autonomous_executor.py` | Planner + executor + reflector | 3 |
| `execution_memory_store.py` | Redis scratch-pad + Postgres checkpoint | 3 |

## 8. New Frontend Components

| Component | Purpose | Level |
|---|---|---|
| NodePropertyPanel toggle | "Execution Mode" dropdown + sub-options | 1 |
| Budget config UI | Token budget, credit budget sliders | 2 |
| AutonomousAgentNode.tsx | New node card for builder | 3 |
| AutonomousConfigPanel.tsx | Config panel for autonomous node | 3 |
| ExecutionTimeline.tsx | Live execution view (plan → tasks → progress) | 3 |
| MemoryViewer.tsx | Admin memory viewer with CRUD | 3 |

## 9. API Contracts

### tRPC Procedures (Level 3 only)
- `agency.listAgentMemories` — paginated list with type filter
- `agency.deleteAgentMemory` — soft delete single memory
- `agency.resetAgentMemories` — soft delete all for agent+user

### SSE Event Types (coordinate with 052 section-09)
- `budget_warning` — at 80% token budget usage
- `react_iteration_complete` — per ReAct step
- `autonomous_subtask_complete` — per sub-task in Level 3
- `autonomous_plan_created` — when plan is generated
- `autonomous_reflection` — quality score + replan decision

## 10. Feature Flags
- `agencyAgenticModeEnabled` (default: true) — Level 1
- `agencyReactExecutorEnabled` (default: false) — Level 2
- `agencyAutonomousAgentEnabled` (default: false) — Level 3
- `agencyLongTermMemoryEnabled` (default: false) — Level 3 memory

## 11. Success Criteria

| Metric | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| Task completion rate improvement | +10% | +25% | +40% |
| Average tokens per run multiplier | 2-3x | 5-8x | 10-20x |
| Target user adoption | 30% of runs | 15% of runs | 5% of runs |
