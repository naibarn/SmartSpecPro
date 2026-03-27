# Research: Agency Agentic Intelligence Layer (053)

Date: 2026-03-22
Sources: Codebase exploration + Web research

---

## Part A: Codebase Research

### 1. Full Agent Execution Call Chain

**Entry:** `apps/web/server/routers/agency.ts` → `assertAgencyEnabled()` (feature flag guard)
→ HTTP to Python backend → `agency_service.py` → orchestrator or legacy agency-swarm path

**Orchestrator activation:** Only triggers if agency has non-agent nodes (`has_non_agent_nodes()`)

**Key files:**
| Component | File | Lines |
|---|---|---|
| tRPC Router | `apps/web/server/routers/agency.ts` | Entry point |
| LLM Handler | `apps/web/server/services/llmRoutesHandler.ts` | Credit deduction |
| Python Service | `python-backend/app/services/agency_service.py` | FastAPI entry |
| Orchestrator | `python-backend/app/services/agency_orchestrator.py` | 800+ lines, graph walker |
| SwarmAdapter | `python-backend/app/services/agency_swarm_adapter.py` | agency-swarm isolation |
| Tool Bridge | `python-backend/app/services/agency_tools.py` | SSRF protection + tool exec |
| Run Context | `python-backend/app/services/agency_run_context.py` | Thread-safe shared state |
| Feature Flags | `apps/web/server/services/featureFlags.ts` | Redis-backed flags |
| Credit Service | `apps/web/server/services/creditService.ts` | Billing interface |

### 2. ExecutionContext — Full Definition

```python
class ExecutionContext:
    def __init__(self, input_message, user_token, tenant_id, user_id=0, task_metadata=None):
        self.input = input_message
        self.user_token = user_token
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.results: dict[str, str] = {}          # node_id → result text
        self.knowledge: list[dict] = []            # from knowledge_base nodes
        self.history: list[dict] = []              # conversation history
        self.task_metadata: dict[str, Any] = {}    # planner metadata
        self.step_attempts: list[dict] = []        # billing reconciliation
        self.browser_sessions: list[dict] = []
        self.active_browser_session_id: str | None = None
        self.shared_context: AgencyRunContext | None = None  # thread-safe state
        self.context_snapshot: dict | None = None
```

**New fields needed for spec 053:** `delegation_depth: int = 0`

### 3. Direct LLM Call Pattern (for ReAct Executor)

Two proven patterns exist in the codebase:

**Pattern A — `/api/v1/llm/simple` (Python internal endpoint):**
```python
async with httpx.AsyncClient(timeout=30.0) as client:
    resp = await client.post(
        f"{python_backend}/api/v1/llm/simple",
        json={"message": prompt, "max_tokens": 2000},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    content = resp.json().get("content", "")
```
Used by: `_llm_classify()`, `_llm_merge()`, `_call_skill()`

**Pattern B — OpenAI SDK via Node.js gateway:**
```python
client = AsyncOpenAI(
    api_key=user_token,
    base_url=f"{NODEJS_INTERNAL_URL}/v1",
)
model = OpenAIChatCompletionsModel(model=model_name, openai_client=client)
```
Used by: `AgencySwarmAdapter._create_model()`

**For ReAct executor:** Pattern B is preferred because:
- Supports structured tool calling (function_calling)
- Returns usage stats for budget tracking
- Supports streaming
- Compatible with all OpenAI SDK features

### 4. Tool Execution Outside agency-swarm

Tools are resolved via `resolve_tools_for_agent()` and executed through the tool bridge:
- Builtin tools → HTTP to internal endpoints (`/api/internal/tools/*`)
- Custom tools → HTTP to user-defined endpoints (SSRF validated)
- Risk levels: low (always allowed), medium (whitelist), high (whitelist + sandbox)

**For ReAct:** Tools can be called directly via their HTTP endpoints without agency-swarm, using the same SSRF validation.

### 5. Guardrails Integration

The orchestrator has 3 checkpoints:
1. **Input guardrails** — before agent execution
2. **Output guardrails** — after agent response, with retry loop
3. **Handoff guardrails** — between sequential agent nodes

ReAct executor should integrate with checkpoints 1 and 2.

### 6. Event Emitter for Streaming

```python
if self.event_emitter:
    await self.event_emitter.emit("text_delta", {"agentName": ..., "delta": ...})
    await self.event_emitter.emit("agent_switch", {"from": ..., "to": ...})
    await self.event_emitter.emit("guardrail_trigger", {...})
```

New event types needed: `budget_warning`, `react_iteration_complete`, `autonomous_subtask_complete`

### 7. Redis Key Patterns

- Feature flags: `feature-flag:{flagName}:{tenantId}`
- Chat memory: `chat:{tenantId}:{conversationId}`
- Cancellation: `agency:cancel:{run_id}`

**Pattern for new keys:** `agency:run:{tenant_id}:{run_id}:memory:{agent_id}`

### 8. Existing Test Patterns

Python agency tests in `python-backend/tests/unit/`:
- `test_agency_service.py` — basic service tests
- `test_agency_tools_whitelist.py` — tool whitelisting
- `test_agency_audit.py` — audit logging
- `services/test_agency_guardrails.py` — guardrail execution
- `services/test_agency_event_emitter.py` — event emission

Framework: pytest with asyncio auto mode, markers (unit/integration)

### 9. Credit/Billing for Agency Runs

```typescript
deductCreditsForModel({
    userId, model, provider,
    inputTokens, outputTokens, costUsd,
    sourceType: "agency",
    conversationId,
});
```

For ReAct: each iteration goes through the gateway → credits deducted per call automatically.

---

## Part B: Web Research — Agentic Patterns

### 1. ReAct Implementation Best Practices

**Two approaches:**
- **Text-based parsing** (classic): Agent outputs `Action: tool_name: input`, parsed via regex. Simple but fragile.
- **Structured tool calling** (modern, recommended): Tools bound via JSON schema, model returns structured `tool_calls`. Eliminates parsing failures.

**Recommendation:** Use structured tool calling. All major providers support it natively.

### 2. Exit/Completion Detection

**Three approaches (ordered by reliability):**

| Approach | How | Pros | Cons |
|---|---|---|---|
| No tool_calls = done | Check if last message has zero tool_calls | Zero overhead, universal | Model might stop prematurely |
| Pydantic output model | Agent must call a schema-validated "output tool" | Type-safe, validates completion | Complex schemas may fail |
| Explicit "done" tool | Register a `finish` tool that terminates loop | Clear signal | Model might not call it |

**Recommended:** Pydantic output model (spec already uses `CompletionSignal` model). For ReAct, combine with "no tool_calls" as fallback.

### 3. Token Budget / Context Management

**Strategies (from Anthropic's engineering guide):**

1. **Sliding window + summary** — Keep last N messages, summarize older context
2. **Tool result clearing** — Remove raw tool outputs from deep history
3. **Structured scratchpad** — Persistent notes outside context window, included every turn
4. **Sub-agent delegation** — Sub-agents return condensed summaries
5. **Intra-trajectory compression** — Self-compress every 10-15 tool calls (~70% token savings)

**Key insight from research:** "If you can't explain why a piece of information is still in the prompt after ten turns, it shouldn't be there."

### 4. Cost Control Strategies

1. **Model routing** — Cheap models for easy tasks, capable for hard
2. **Dynamic turn limits** — Estimate P(success) per additional turn (24% cost reduction)
3. **Prompt caching** — 90% input cost reduction, 75% latency reduction
4. **Per-agent dollar budgets** — Hard stop when budget exhausted
5. **Cost observability at action level** — Track per-agent, per-task, per-phase

### 5. agency-swarm `tool_use_behavior`

| Value | Behavior |
|---|---|
| `"run_llm_again"` (default) | Full agentic loop — tools called, results fed back, model continues |
| `False` / `"stop"` | Single-turn — model proposes tool calls but loop stops immediately |

**For spec 053:** ReAct executor bypasses agency-swarm entirely (Option A), so this parameter is irrelevant for Level 2. Level 1 (agentic mode via prompt) uses the default `run_llm_again`.

### 6. Prompt Injection Prevention in Agentic Loops

1. **Use structured tool calling, not text markers** — tool calls are separate from text content
2. **Structured query separation** — separate channels for prompt vs data
3. **Validate completion outputs** — Pydantic validation rejects malformed injection
4. **Never trust text-based completion markers** — use session-unique tokens if text markers needed
5. **Trajectory firewalling** — inspection agent reviews intermediate steps

### 7. Working Memory Patterns

1. **Scratchpad file** — Key findings written to persistent file, loaded each turn
2. **Structured state object** — Typed dict accumulating progress
3. **Session memory with expiration** — Foundational facts persist, situational memory expires
4. **Sub-agent summaries** — Condensed return from sub-agent exploration

---

## Part C: Implementation Recommendations

### For Level 1 (Agentic Mode)

- Use existing `_execute_agent_node()` path
- Inject planning prompt as additional system message
- Completion detection via structured CompletionSignal Pydantic model
- Reflection loop: re-invoke `adapter.run()` with augmented message
- **Simple, low-risk, backward compatible**

### For Level 2 (ReAct Executor)

- Use OpenAI SDK directly via Node.js gateway (Pattern B from §3)
- DO NOT use agency-swarm Agency objects (avoids double-loop)
- Tools called via HTTP endpoints from `agency_tools.py`
- Working memory in Redis with tenant-namespaced keys
- Message compression every 5 iterations
- Budget tracking from gateway response usage stats
- Emit SSE events per iteration

### For Level 3 (Autonomous Agent)

- Build on Level 2's ReAct executor
- Planning via structured output (TaskPlan Pydantic model)
- Delegation via `_execute_node()` on other agents in same graph
- Context isolation: shallow clone of ExecutionContext per delegation
- Long-term memory in PostgreSQL with user_id scoping
- Crash recovery: Redis scratch-pad + Postgres checkpoint

### Testing Framework

- **Python:** pytest with asyncio, mock httpx for gateway calls
- **TypeScript:** Vitest with tRPC context mocking
- **Key fixtures needed:** mock gateway client, mock Redis, mock ExecutionContext
