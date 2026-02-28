# Agency-Swarm Integration — Research Notes

> Generated as part of deep-plan workflow for `specs/feature/027-AgencySwarm/spec.md`

---

## Part 1: Codebase Research

### Executive Summary

SmartSpecPro is a mature, production-grade monorepo with sophisticated multi-provider LLM integration, multi-agent orchestration (via LangGraph), credit system, skill engine, and enterprise admin tooling. The codebase is well-suited for agency-swarm integration, with existing patterns that align naturally with agency-swarm concepts.

---

### 1. Python Backend Architecture

#### 1.1 FastAPI Application Structure

**File:** `python-backend/app/main.py`

- **Entry Point Pattern:** Lifespan context manager (`@asynccontextmanager`) for initialization/cleanup
- **Router Registration:** 50+ routers registered via `app.include_router()` with standardized tag/prefix patterns
- **Initialization Sequence:**
  1. Environment variables loaded
  2. Logging setup (structlog)
  3. Database initialization (`init_db()`)
  4. Redis initialization (`cache_manager.initialize()`)
  5. LLM Proxy initialization (`unified_client.initialize()`)
  6. PostgreSQL checkpointer for LangGraph (`get_postgres_checkpointer()`)

**Key Routers:**
- `/api/v1/orchestrator` — LangGraph workflow orchestration
- `/api/v1/workflows` — Workflow CRUD
- `/api/v1/llm` — LLM proxy
- `/api/v1/media` — Media generation
- `/api/v1/skills` — Skill CRUD & execution
- Custom routers for auth, credits, analytics, sandbox dispatch

**Pattern for Agency Integration:** Create `/api/v1/agencies` router following the same `include_router()` pattern.

#### 1.2 Python Dependencies & Versions

**File:** `python-backend/requirements.txt`

- **Python Version:** 3.11-slim (in Dockerfile) — **agency-swarm requires Python >= 3.12**
- **Key LLM Dependencies:**
  - `openai==1.50.0` (needs upgrade to >=2.2 for agency-swarm)
  - `anthropic==0.8.1`
  - `langgraph>=0.2.0`
  - `langchain>=0.3.0`

- **Async/Database:**
  - `fastapi==0.109.0`
  - `sqlalchemy==2.0.25`
  - `asyncpg==0.29.0`

- **Validation:**
  - `pydantic>=2.7.4` — needs upgrade to >=2.11 for agency-swarm

- **Testing:**
  - `pytest==7.4.4` with `pytest-asyncio==0.23.3`
  - `pytest-cov==4.1.0` for coverage (80% minimum enforced)

**Upgrade Requirements:**
- Python 3.11 → 3.12 in Dockerfile
- `openai==1.50.0` → `openai>=2.2.0`
- `pydantic>=2.7.4` → `pydantic>=2.11.0`

#### 1.3 Node Executor Protocol (Pattern for Agency Tool Adapter)

**File:** `python-backend/app/orchestrator/node_executors/base.py`

```python
@dataclass
class ExecutionContext:
    user_id: int
    tenant_id: str | None
    workflow_id: str
    execution_id: str
    credits_available: int = 0
    extra_data: dict[str, Any] = field(default_factory=dict)

@dataclass
class NodeExecutionData:
    node_id: str
    node_type: str
    config: dict[str, Any]
    inputs: dict[str, Any]
    state: dict[str, Any]

class NodeExecutor(Protocol):
    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Execute and return outputs dict"""
```

**Relevance:** Agency tools (BaseTool subclasses) should follow similar structure: accept context dict with user_id, tenant_id, credits_available; return structured output dict.

#### 1.4 LLM Executor Pattern (Critical for Agency LLM Routing)

**File:** `python-backend/app/orchestrator/node_executors/llm_executor.py`

The LLM executor demonstrates the pattern agencies must follow:

1. **LLM calls go through Node.js gateway**, not direct provider API:
   ```python
   NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")

   response = await client.post(
       f"{NODEJS_INTERNAL_URL}/api/llm/v2/chat",
       json={"model": model, "messages": messages, ...},
       headers={
           "Authorization": f"Bearer {user_token}",
           "Cookie": f"token={user_token}",
       },
   )
   ```

2. **Node.js Gateway Responsibilities:**
   - Credit check (pre-flight)
   - Model → Provider mapping (model_provider_map table)
   - Provider selection with health circuit breaker
   - Actual LLM call with fallback
   - Cost calculation
   - Credit deduction (post-call)

3. **Agency Integration Point:** Agents should use `OpenAIChatCompletionsModel` with custom `base_url` pointing to this gateway URL rather than direct provider APIs.

#### 1.5 Node Registry Pattern

**File:** `python-backend/app/orchestrator/node_registry.py`

```python
@dataclass
class NodeTypeSpec:
    type: str
    display_name: str
    description: str
    icon: str
    color: str
    category: str
    inputs: list[InputSpec]
    outputs: list[OutputSpec]
    executor: str  # Python dotpath

class NodeRegistry:
    _instance = None  # Singleton pattern
```

**Pattern:** Keep agency-swarm tool registration separate from NodeRegistry.

#### 1.6 Testing Configuration

**Files:** `python-backend/pytest.ini`, `python-backend/tests/conftest.py`

- **Test Markers:** unit, integration, e2e, slow, auth, payments, llm, credits, sandbox
- **Coverage Requirement:** 80% minimum (`--cov-fail-under=80`)
- **Database for Tests:** SQLite in-memory with StaticPool

**Agency Test Recommendations:**
- Mark agency tests with `@pytest.mark.llm` and `@pytest.mark.credits`
- Mock agency-swarm runs in unit tests
- Use integration tests for Node.js gateway communication

---

### 2. Node.js Backend Patterns

#### 2.1 tRPC Router Architecture

**File:** `apps/web/server/routers/chat.ts`

```typescript
export const chatRouter = router({
  procedure1: protectedProcedure.input(z.object({...})).query(async ({input, ctx}) => {}),
  procedure2: protectedProcedure.input(z.object({...})).mutation(async ({input, ctx}) => {}),
});
```

**Standard Middleware:**
- `protectedProcedure` — requires JWT authentication via `ctx.user`
- `adminProcedure` — requires admin role
- Input validation via Zod schemas
- Context includes: `user` (with id), `tenantId`, `db` connection

**Rate Limiting Pattern:**
```typescript
const [hourly, daily, burst] = await Promise.all([
  checkRateLimit(`isc_create:${userId}`, 3, 3_600),
  checkRateLimit(`isc_create_daily:${userId}`, 10, 86_400),
  checkRateLimit(`isc_create_burst:${userId}`, 5, 600),
]);
```

#### 2.2 OpenAI-Compatible Gateway Streaming

**File:** `apps/web/server/_core/openaiCompatGateway.ts`

SSE streaming headers and ReadableStream proxy pattern established:
```typescript
res.setHeader("content-type", "text/event-stream");
res.setHeader("cache-control", "no-cache, no-transform");
res.setHeader("connection", "keep-alive");
res.setHeader("x-content-type-options", "nosniff");
```

#### 2.3 LLM Routes Handler (Credit Deduction Flow)

**File:** `apps/web/server/services/llmRoutesHandler.ts`

Streaming with post-call credit deduction:
```typescript
export async function handleStreamWithRouter(params: HandlerParams): Promise<void> {
  const result = await executeWithFallback({model, messages, stream: true, ...});
  const {creditsUsed} = await deductCreditsForModel({...});
  res.write(`event: message_complete\ndata: ${JSON.stringify({creditsUsed})}\n\n`);
  res.write("data: [DONE]\n\n");
}
```

#### 2.4 Credit Service Architecture

**File:** `apps/web/server/services/creditService.ts`

**Key Functions:**
- `getCreditBalance(userId)` — Check balance
- `hasEnoughCredits(userId, amount)` — Pre-flight check
- `deductCredits({userId, amount, sourceType, ...})` — Atomic deduction (`WHERE credits >= amount`)
- `deductCreditsForModel({userId, model, provider, tokens, sourceType})` — LLM-specific deduction
- 1 USD = 1000 credits

**Agency Integration:**
1. Pre-flight: `hasEnoughCredits(userId, estimatedCost)`
2. Post-call: `deductCredits({userId, amount, sourceType: "agency", ...})`
3. Markup: Apply `agency.creditMultiplier` to final cost
4. Tracking: Store `agencyId` in metadata

#### 2.5 Sandbox Router (Credit Reservation Pattern)

**File:** `apps/web/server/routers/sandbox.ts`

Reserve → Dispatch → Deduct pattern for async operations:
```typescript
featureType: z.enum(["chat", "skill", "workflow", "library", "media", "presentation", "connector"])
// Need to add "agency" to this enum
```

---

### 3. Database Schema Patterns

#### 3.1 Drizzle ORM Conventions

**File:** `apps/web/drizzle/schema.ts` (3000+ lines)

- **Tenant Isolation:** `tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" })`
- **Index Pattern:** `uniqueIndex("name_idx").on(t.col1, t.col2)`
- **Enum Pattern:** `pgEnum("name", ["val1", "val2"])`
- **Execution Mode:** `varchar("executionMode", { length: 50 })` (NOT pgEnum — more flexible)

#### 3.2 Existing Conversations/Messages Schema

Already exists for chat — agency conversations follow similar pattern with additional fields (agencyId, agentName, etc.)

#### 3.3 Library Permissions Pattern (for Agency Sharing)

```typescript
export const libraryPermissions = pgTable("library_permissions", {
  subjectType: varchar("subject_type", { length: 32 }).notNull(),  // "user" | "group"
  subjectId: varchar("subject_id", { length: 64 }).notNull(),
  permissionLevel: varchar("permission_level", { length: 32 }).notNull().default("read"),
});
```

#### 3.4 Scheduled Messages (for Async Agency Runs)

BullMQ job tracking pattern with `bullmqJobId`, `cronExpression`, `nextRunAt` fields.

---

### 4. Frontend Patterns

#### 4.1 Routing (Wouter + Lazy Loading)

**File:** `apps/web/client/src/App.tsx`

```typescript
const Dashboard = lazy(() => import("./pages/Dashboard"));
// Add: const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
```

#### 4.2 Menu Structure

**File:** `packages/shared/src/constants/menu.ts`

```typescript
export interface MenuItem {
  id: string; label: string; icon: string; path: string;
  platforms: Platform[]; group?: MenuGroup; sortOrder: number;
}
```

---

### 5. Critical Implementation Notes

| Item | Current | Required | Action |
|------|---------|----------|--------|
| Python version | 3.11-slim | >= 3.12 | Edit Dockerfile |
| openai SDK | 1.50.0 | >= 2.2.0 | Update requirements.txt |
| Pydantic | >= 2.7.4 | >= 2.11 | Update requirements.txt |
| Sandbox featureType | No "agency" | "agency" enum value | Add to sandbox router |
| LLM routing | Via Node.js gateway | Same pattern | Use OpenAIChatCompletionsModel with custom base_url |
| Tenant isolation | varchar(36) FK | Same pattern | All agency tables get tenantId |
| Credit deduction | Atomic UPDATE WHERE | Same pattern | sourceType: "agency" |

---

## Part 2: Web Research

### Topic 1: agency-swarm v1.8.0 API Patterns

#### Current Async API

**Agent constructor:**
```python
from agency_swarm import Agent, ModelSettings

agent = Agent(
    name="CEO",
    description="Handles client communication",
    instructions="./instructions.md",
    tools=[MyCustomTool],
    model="gpt-5.2",
    model_settings=ModelSettings(max_tokens=25000),
    # Also: tools_folder, mcp_servers, output_guardrails, input_guardrails, hooks
)
```

**Agency constructor:**
```python
from agency_swarm import Agency

agency = Agency(
    ceo,
    communication_flows=[ceo > dev, ceo > va, dev > va],
    name="MyAgency",
    shared_instructions="agency_manifesto.md",
    shared_tools=[CommonTool],
    load_threads_callback=my_load_fn,
    save_threads_callback=my_save_fn,
    user_context={"tenant_id": "abc"},
)
```

**Execution methods:**
```python
# Async (primary)
result = await agency.get_response("message")

# Streaming (returns synchronously -- do NOT await)
stream = agency.get_response_stream("message")
async for event in stream:
    pass
final_result = await stream.wait_final_result()
```

#### OpenAIChatCompletionsModel and Custom base_url

Yes, supports custom `base_url` via `openai-agents[litellm]` extra:

```python
from openai import AsyncOpenAI
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel

custom_client = AsyncOpenAI(
    api_key="xxx",
    base_url="http://localhost:4000",
)
model = OpenAIChatCompletionsModel(model="my-model", openai_client=custom_client)
agent = Agent(name="CustomAgent", model=model)
```

**Limitations of non-OpenAI models:**
- Hosted tools (WebSearch, FileSearch, CodeInterpreter) unsupported
- Function calling may be unavailable on some models
- Cross-model handoffs between patched and unpatched agents cause errors

#### PersistenceHooks (Thread Persistence)

v1.x stores **full conversation histories** in callbacks (breaking change from v0.x thread IDs):
- `load_threads_callback`: Retrieve saved conversation history
- `save_threads_callback`: Persist conversation state

#### Communication Flows and the `>` Operator

v0.x `agency_chart` (list-of-lists) **removed in v1.7.0**. Replacement:

```python
communication_flows=[
    ceo > dev,                     # Task delegation (control returns)
    (agent_a, agent_b, Handoff),   # Complete control transfer
]
```

- **Handoff pattern**: Complete control transfer, no return
- **Delegation pattern**: Orchestrator delegates and gets result back

#### StreamingRunResponse Format

Returned **synchronously** from `get_response_stream()` (do NOT `await` — changed in v1.3.0):

```python
stream = agency.get_response_stream("message")  # No await!
async for event in stream:
    # RawResponsesStreamEvent (token deltas)
    # RunItemStreamEvent (tool_call_item, message_output_item)
    # AgentUpdatedStreamEvent (handoffs)
    pass
final_result = await stream.wait_final_result()
```

#### v1.8.0 Specific Changes

- `SendMessageHandoff` → `Handoff` (v1.7.0)
- `get_agency_structure` deprecated → use `get_agency_graph` or `get_metadata`
- `raise_input_guardrail_error` canonical; `throw_input_guardrail_error` deprecated
- OpenAI Agents SDK upgraded to 0.9.3

**Sources:**
- [Agency Swarm GitHub Releases](https://github.com/VRSEN/agency-swarm/releases)
- [Agency Swarm Communication Flows](https://agency-swarm.ai/core-framework/agencies/communication-flows)
- [Agency Swarm Third-Party Models](https://agency-swarm.ai/additional-features/third-party-models)
- [Agency Swarm API Reference](https://agency-swarm.ai/references/api)

---

### Topic 2: OpenAI Python SDK 1.x to 2.x Migration

#### Release Timeline

- **v1.109.1** (2025-09-24): Last v1.x release
- **v2.0.0** (2025-09-30): Major version with breaking changes
- **v2.24.0** (2026-02-24): Latest as of research date

#### Confirmed Breaking Changes in v2.0.0

1. **`ResponseFunctionToolCallOutputItem.output`** changed from `string` to `string | Array<ResponseInputText | ResponseInputImage | ResponseInputFile>`. Code assuming string will break.

2. **Responses API as primary**: SDK v2.x emphasizes Responses API over deprecated Assistants API. `response_format` parameter changed.

3. **Assistants API deprecation**: Sunset August 26, 2026. SDK steers toward Responses API + Conversations API.

4. **OpenAI Agents SDK requires `openai>=2.0.0`** — no longer supports v1.x.

#### Migration Approach

- **Core `chat.completions` API**: Still works (not removed)
- **Type changes**: Audit `.output` on tool call response items (now may be array)
- **No automated migration tool** for v1→v2 (unlike v0.28→v1.0 which had `openai migrate`)

**Sources:**
- [OpenAI Python CHANGELOG](https://github.com/openai/openai-python/blob/main/CHANGELOG.md)
- [OpenAI Assistants Migration Guide](https://developers.openai.com/api/docs/assistants/migration/)

---

### Topic 3: Multi-Agent LLM Orchestration SSE Streaming Patterns

#### Architecture: FastAPI → Node.js → React

```
React (fetch) <-- SSE --> Express/Node.js <-- SSE/HTTP --> FastAPI (Python)
                                                              |
                                                        Agent Orchestrator
                                                        (agency-swarm)
```

**Why SSE over WebSockets**: One-way streaming, simpler, works over HTTP, `EventSource` auto-reconnect.

#### FastAPI SSE Pattern

```python
@app.post("/api/chat/stream")
async def stream_chat(request: ChatRequest):
    async def event_generator():
        yield f"event: run_started\ndata: {json.dumps({'run_id': run_id})}\n\n"

        stream = agency.get_response_stream(request.message)
        async for event in stream:
            if isinstance(event, AgentUpdatedStreamEvent):
                yield f"event: agent_switch\ndata: ...\n\n"
            elif isinstance(event, RawResponsesStreamEvent):
                yield f"event: token\ndata: ...\n\n"

        final = await stream.wait_final_result()
        yield f"event: run_finished\ndata: ...\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

#### SSE Event Types for Multi-Agent Systems

Based on AG-UI protocol:

| Category | Events |
|----------|--------|
| **Lifecycle** | `run_started`, `run_finished`, `run_error` |
| **Text** | `token` (with agent name and delta) |
| **Tool Calls** | `tool_call` (tool name, args) |
| **Agent** | `agent_switch` (from, to, reason) |
| **Credits** | `message_complete` (usage, cost) |

**Practical format:**
```
event: agent_switch
data: {"from": "CEO", "to": "Developer", "timestamp": 1709012345}

event: token
data: {"agent": "Developer", "delta": "I'll implement", "message_id": "msg_123"}

event: run_finished
data: {"output": "Task completed", "usage": {"tokens": 1234, "cost_usd": 0.05}}
```

**Sources:**
- [AG-UI Protocol](https://www.copilotkit.ai/blog/master-the-17-ag-ui-event-types-for-building-agents-the-right-way)
- [OpenAI Agents SDK Streaming Docs](https://openai.github.io/openai-agents-python/streaming/)

---

### Topic 4: Pydantic 2.7 to 2.11 Upgrade

#### Key Changes (2.7 → 2.11)

**1. `model_fields` instance access deprecated (v2.11)** — Most impactful:
```python
# DEPRECATED
instance.model_fields          # DeprecationWarning!

# CORRECT
MyModel.model_fields           # Access from class
type(instance).model_fields    # Or via type()
```

Affects agency-swarm's `BaseTool` and any subclass reading `self.model_fields`.

**2. Python 3.8 dropped** (v2.11) — Not relevant for this project.

**3. `Final` field behavior change** (v2.11) — Deprecation warnings on defaults.

**4. Model validator signature changes** (v2.10) — Verify `@model_validator` decorators.

**5. Stricter union type handling** (v2.10) — Discriminated unions behavior changed.

#### Performance Improvements (v2.11)

- **Build time**: Up to 2x faster (2.77s → 1.52s)
- **Memory**: Up to 4.17x reduction (563MB → 290MB)
- **Mechanism**: Lazy annotation evaluation, cached properties

#### Migration Checklist (2.7 → 2.11)

1. Replace `instance.model_fields` with `type(instance).model_fields`
2. Verify `@model_validator` signatures (v2.10 change)
3. Check `Final` annotated fields
4. Update JSON Schema assertions (additionalProperties changes)
5. Test union type validation
6. Run full test suite

**Sources:**
- [Pydantic v2.11 Release](https://pydantic.dev/articles/pydantic-v2-11-release)
- [Pydantic Changelog](https://docs.pydantic.dev/latest/changelog/)
