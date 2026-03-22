# Research Findings — 052 Agency Swarm Full Capability Upgrade

Generated: 2026-03-22

---

## 1. Existing SmartSpecPro Agency Architecture

### 1.1 Architecture Overview

SmartSpecPro has a **mature, multi-layer Agency Swarm implementation** (v1.8.0) with:
- **8 node types** (agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval, browser_session)
- **Layered execution**: Frontend ReactFlow → tRPC → Python orchestrator → agency-swarm adapter
- **16+ builtin tools** with risk routing
- **Production SSE streaming** (orchestrator + notifications)
- **Version control** via agencyVersions table

**Key architectural insight**: Agency-swarm is imported ONLY in `agency_swarm_adapter.py` (isolation pattern), making version upgrades low-risk.

### 1.2 Frontend Structure

**Location**: `apps/web/client/src/components/agency/`

**Single Dispatcher Pattern**: All 8 node types register as single ReactFlow type `"agency"`:
```typescript
// BaseAgencyNode.tsx — switch on nodeType
case "supervisor": return <SupervisorNodeCard />;
case "router": return <RouterNodeCard />;
// ... etc
default: return <AgentNodeCard />;
```

**Key components**:
- `AgencyBuilder.tsx` — Main canvas with useReducer, 40-entry undo/redo, keyboard shortcuts
- `NodePropertyPanel.tsx` — Edit selected node config
- `ToolPicker.tsx` — 2-step flow (list → config) with ToolConfigPanel
- `AutoCreateAgencyModal.tsx` — AI Creator 7-phase stepper
- `CommunicationEdge.tsx` — Edge rendering

### 1.3 Database Schema (Current State)

**agencies table** — Core fields: id, tenantId, slug, name, description, systemPrompt, defaultModel, status, visibility, previewSvg, createdBy, etc.
- Missing: sharedInstructions, userContext, conversationStarters, topology, cacheConversationStarters

**agencyAgents table** — id, agencyId, name, instructions, model, modelSettings (JSONB: max_tokens/temperature/top_p), isEntryPoint, nodeType, nodeConfig (JSONB), position
- Missing: outputSchema, examples, mcpServers, mcpServerTokensEncrypted, parallelToolCalls, maxTurns

**agencyAgentTools table** — id, agentId, toolId (varchar 100), toolConfig (JSONB)

**agencyTools table** — id, tenantId, name, description, toolType, config (JSONB), riskLevel, requiresApproval
- Missing: inputSchema, outputSchema, httpMethod, headersEncrypted, retryPolicy, icon, category, version, isExposedAsApi, strictSchema, oneCallAtATime, isEnabled, updatedAt

**agencyCommunicationFlows** — id, agencyId, fromAgentId, toAgentId, flowType ("delegation"|"parallel")
- Missing: flowConfig

**Other tables**: agencyConversations, agencyRunArtifacts, agencyVersions

### 1.4 Python Backend

**agency_swarm_adapter.py** — Isolation layer; the ONLY file importing `from agency_swarm`. Supports:
- create_agent() with model_settings, tools, output_type, guardrails
- create_agency() with communication_flows, shared_tools
- run() with streaming and usage tracking
- cancel_run() with immediate/after_turn modes

**agency_orchestrator.py** (~400 lines) — Graph walker for multi-node agencies:
- ExecutionContext with input, results dict, knowledge list, history, step_attempts
- Node routing: match on node_type → execute handler
- Enabled when any node is NOT agent/supervisor (feature flag: AGENCY_ORCHESTRATOR_ENABLED)

**agency_tools.py** (~400 lines) — Tool resolution:
- 16+ builtin tool IDs mapped to internal HTTP endpoints
- SSRF protection (blocked: localhost, private IPs, metadata endpoints)
- Tool bridging: adapter.create_tool_class(run_fn) wraps HTTP calls as BaseTool

**agency_creator_task.py** — 7-phase Celery pipeline: discover → interview → design → craft → configure → validate → finalize

### 1.5 Existing SSE Patterns

**orchestratorStream.ts**:
- `GET /api/orchestrator/stream/run/:runId` with JWT auth
- Redis pub/sub channel: `orchestrator:run:{runId}`
- Heartbeat 15s, max duration 30min
- Events: step_started, tool_called, decision_made, etc.

**notificationStream.ts**:
- `GET /api/notifications/stream` per-user (max 5 concurrent)
- Heartbeat 30s, SSE frame injection prevention

**Common pattern**: writeHead with text/event-stream, X-Accel-Buffering: no, Redis subscriber, event serialization with id/event/data fields.

### 1.6 MCP Integration

**mcpPublicServer.ts** — Exposes 28+ tools via MCP protocol:
- Skills, Agencies, Media, Chat, Library, Workflows, Personas
- Auth: API key + scope-based

### 1.7 Test Setup

**Vitest** (web app): agency.test.ts, agency-admin.test.ts, agency-templates.test.ts, agencyArchival.test.ts, agencyBridge.test.ts, agencyCommitService.test.ts
**pytest** (Python): tests/agency/ directory

---

## 2. Agency-Swarm Library API (v1.8.0)

### 2.1 Version & Breaking Changes

Latest: **v1.8.0** (Feb 2025), built on **OpenAI Agents SDK**.

| Version | Key Changes |
|---------|------------|
| v1.8.0 | PresentFiles tool, conversation starters caching, Agents SDK 0.9.3 |
| v1.7.0 | Removed deprecated v0.x APIs, shared resource params |
| v1.6.0 | Token/cost tracking, stream cancellation, timestamps at emission |
| v1.5.0 | `ToolFactory.from_mcp()` for MCP tool conversion |

### 2.2 Streaming Events (get_response_stream)

| Event Type | Content |
|------------|---------|
| `meta` | run_id (first event) |
| `data` (response.output_text.delta) | Text chunk |
| `messages` | Full history, usage, cost (final) |
| `end` | [DONE] signal |

### 2.3 Interruptions / Approvals (Human-in-the-Loop)

Built on OpenAI Agents SDK's HITL:
1. Mark tools: `@function_tool(needs_approval=True)`
2. `RunResult.interruptions` → list of `ToolApprovalItem`
3. `state.approve(interruption)` or `state.reject(interruption, message)`
4. Resume: `result = await Runner.run(agent, state)`
5. Serializable: `state.to_json()` for DB persistence

### 2.4 MCP Integration

`run_mcp()` exposes tools as standalone MCP HTTP endpoint. Client-side: `HostedMCPTool` with server URL + bearer token.

### 2.5 ToolConfig

```python
class ToolConfig:
    one_call_at_a_time = True   # Prevent concurrent execution
    strict = False              # OpenAI structured output constraints
```

### 2.6 files_folder + Vector Store

Naming convention `*_vs_<vector_store_id>` auto-associates with OpenAI Vector Store. Auto-adds `FileSearchTool`. SmartSpecPro uses pgvector RAG instead → maps via `builtin-rag-knowledge` tool.

---

## 3. SSE Best Practices (FastAPI)

### 3.1 FastAPI Built-in SSE (v0.135.0+)

```python
from fastapi.sse import EventSourceResponse, ServerSentEvent

@app.post("/stream", response_class=EventSourceResponse)
async def stream(req: Request) -> AsyncIterable[ServerSentEvent]:
    yield ServerSentEvent(data={"key": "val"}, event="update", id="1", retry=5000)
```

Auto-includes: keep-alive ping (15s), Cache-Control: no-cache, X-Accel-Buffering: no.

### 3.2 POST-Based SSE (Recommended for Auth)

POST SSE works natively in FastAPI. Browser EventSource only supports GET, so use `@microsoft/fetch-event-source` on client:

```javascript
import { fetchEventSource } from "@microsoft/fetch-event-source";
await fetchEventSource("/stream", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    onmessage(ev) { /* handle */ },
});
```

### 3.3 Stream Ticket Pattern (for native EventSource)

1. POST `/stream-ticket` (authenticated) → returns `{ ticket: uuid, expiresIn: 60 }`
2. GET `/stream/{ticket}` (unauthenticated) → SSE from asyncio.Queue

Single-use, short TTL, stored in Redis.

### 3.4 Reconnection

- Set `id:` on every SSE event
- Browser sends `Last-Event-ID` header on reconnect
- FastAPI reads via `Header()` dependency
- `retry: 5000` controls reconnect delay (ms)

### 3.5 asyncio.Queue Bridge

Decouple background processing from SSE output:
- `put_nowait()` from background tasks
- `await queue.get()` in SSE generator
- Natural backpressure on client disconnect

### 3.6 Cancellation

- POST `/cancel/{jobId}` → puts cancellation signal in queue
- Generator checks `request.is_disconnected()` with timeout loop

---

## 4. Key Implications for Planning

### 4.1 Adding New Node Types (6 new)

The BaseAgencyNode dispatcher pattern makes this straightforward — add cases to switch statement. Each new node type needs:
- NodeCard component (tsx)
- Property panel fields in NodePropertyPanel
- Python handler in agency_orchestrator.py match statement
- nodeConfig TypeScript interface
- Zod validation in saveBuilder

### 4.2 Custom Tools & Guardrails

Extend agencyTools table (many new columns). The tool bridge pattern in agency_tools.py already supports HTTP calls — custom tools fit naturally. Guardrails are a new table + Python execution layer.

### 4.3 SSE Streaming

SmartSpecPro already has SSE infrastructure (Redis pub/sub, heartbeat, event format). New agency SSE needs:
- POST-based proxy or stream ticket (avoid token in URL)
- New event types (text_delta, tool_start/progress/end, agent_switch, approval_required)
- Python → Redis → Node.js SSE or direct Python SSE

### 4.4 AI Creator v2

Extend 7-phase → 10-phase pipeline. The Celery task structure already supports phased execution with status tracking. New phases (PLAN, REVIEW_PLAN, REVIEW_DESIGN) are LLM calls with loop logic.

### 4.5 Database Migration

All changes are additive (nullable columns, new tables) — LOW-MEDIUM risk. One data migration needed: modelSettings snake_case → camelCase.

### 4.6 Testing Approach

Existing patterns: Vitest for tRPC (mocked DB), pytest for Python services. New features need:
- Unit tests for each guardrail strategy
- Integration tests for SSE streaming
- Unit tests for node type execution in orchestrator
- Security tests for SSRF, cross-tenant isolation, approval flow
