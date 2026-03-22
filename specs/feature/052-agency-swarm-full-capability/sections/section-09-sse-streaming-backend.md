Now I have comprehensive context. Let me produce the section content.

# Section 09 — SSE Streaming Backend

## Overview

This section implements the backend SSE streaming infrastructure for agency runs. The architecture follows the established pattern: Python orchestrator emits events to Redis pub/sub, and Node.js proxies those events to the client as Server-Sent Events.

**Key architectural decision (from interview):** Python publishes to Redis, Node.js proxies SSE to the client. This is consistent with the existing `orchestratorStream.ts` and `agencyStreamProxy.ts` patterns and keeps a single authentication layer on the Node.js side.

### Dependencies

| Section | What this section uses |
|---------|----------------------|
| section-01-database-migration | `agency_run_traces` table (for optional event persistence), schema columns |
| section-07-agency-context | `AgencyRunContext` for context-aware events; orchestrator integration points |

### Blocks

| Section | What depends on this |
|---------|---------------------|
| section-10-sse-streaming-frontend | `useAgencyStream` hook consumes the SSE endpoint and event types defined here |
| section-12-topology-human-approval | `approval_required` event type; cancel mechanism |
| section-16-tool-progress-standalone-api | `tool_progress` event type piped through the same SSE channel |

---

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/services/agency_event_emitter.py` | **CREATE** | `AgencyEventEmitter` class: Redis publish + persist to list |
| `python-backend/tests/unit/services/test_agency_event_emitter.py` | **CREATE** | Unit tests for emitter |
| `apps/web/server/routes/agencyStream.ts` | **CREATE** | New SSE route: `POST /api/agency/:agencyId/stream` with Redis pub/sub subscription and replay |
| `apps/web/server/routes/__tests__/agencyStream.test.ts` | **CREATE** | Vitest tests for the SSE route |
| `python-backend/app/services/agency_orchestrator.py` | **MODIFY** | Inject `AgencyEventEmitter`, emit events at each execution point |
| `python-backend/app/services/agency_service.py` | **MODIFY** | Wire emitter into orchestrator runs; enhance `cancel_run` |
| `apps/web/server/_core/index.ts` | **MODIFY** | Mount new `agencyStreamRouter` |
| `apps/web/shared/agencyStreamEvents.ts` | **CREATE** | Shared event type definitions (TypeScript) usable by backend and frontend |

---

## Event Type Definitions

### Shared Types File: `apps/web/shared/agencyStreamEvents.ts`

Define a discriminated union of all agency SSE event types. This file is imported by both the Node.js SSE route (section 09) and the frontend hook (section 10).

```
Event types (discriminated on `event` field):

meta              — { runId: string; agencyId: string }
text_delta        — { agentName: string; delta: string }
tool_start        — { agentName: string; toolName: string; toolCallId: string }
tool_progress     — { toolCallId: string; status: string; message: string }
tool_end          — { toolCallId: string; status: "success" | "error"; result?: string }
agent_switch      — { from: string; to: string; reason?: string }
guardrail_trigger — { type: "input" | "output"; guardrailName: string; action: string }
approval_required — { approvalKey: string; step: string; summary: string; agentName: string }
run_complete      — { runId: string; usage: { tokens: number; cost: number } }
error             — { code: string; message: string }
```

Each event envelope includes: `id` (monotonic integer as string), `event` (type string), `data` (JSON-serialized payload), `ts` (ISO timestamp).

Define a `AgencyStreamEvent` TypeScript type as a discriminated union on the `event` field. Export a `AgencyStreamEventType` string literal union for the event names.

---

## Tests (TDD)

### Vitest: `apps/web/server/routes/__tests__/agencyStream.test.ts`

Write tests FIRST. Each test should describe the expected behavior before implementation.

```
Test: POST /api/agency/:agencyId/stream requires JWT auth
  - Send request without Authorization header
  - Assert: 401 response

Test: SSE route sends heartbeat every 15s
  - Mock Redis subscriber, connect to SSE endpoint
  - Advance timers by 15s (vi.useFakeTimers)
  - Assert: heartbeat comment (": keepalive\n\n") written to response

Test: SSE route subscribes to correct Redis channel
  - Connect with valid auth and agencyId "abc123"
  - Assert: Redis subscriber.subscribe called with "agency:stream:{runId}"
  - Note: runId comes from the request body or is generated server-side

Test: SSE events include id: field for replay
  - Publish an event to the Redis channel
  - Assert: response includes "id: {monotonic_id}\n" line

Test: SSE route handles client disconnect gracefully
  - Connect, then emit "close" on the request
  - Assert: Redis subscriber unsubscribed and quit, heartbeat cleared, no error thrown

Test: SSE backpressure — bounded buffer drops oldest when full
  - Configure MAX_BUFFER_SIZE to a small value (e.g., 5)
  - Publish 10 events rapidly
  - Assert: only last 5 events are in the buffer; oldest dropped
  - Assert: event IDs are preserved (no gaps in id sequence from client perspective)

Test: Cancel endpoint sets cancellation in Redis
  - POST /api/agency/:agencyId/cancel with { runId, mode: "immediate" }
  - Assert: Redis key "agency:cancel:{runId}" set with mode value
  - Assert: 200 response with { cancelled: true }

Test: Feature flag AGENCY_STREAMING_ENABLED gates the endpoint
  - Mock getFeatureFlag to return false for AGENCY_STREAMING_ENABLED
  - Assert: 404 response
```

### pytest: `python-backend/tests/unit/services/test_agency_event_emitter.py`

```
Test: AgencyEventEmitter publishes to Redis channel
  - Create emitter with mock Redis client and runId "run_001"
  - Call emitter.emit("text_delta", {"agentName": "Agent1", "delta": "Hello"})
  - Assert: redis.publish called with channel "agency:stream:run_001"
  - Assert: published message is valid JSON containing event type and data

Test: AgencyEventEmitter persists events to Redis list for replay
  - Call emitter.emit("tool_start", {...})
  - Assert: redis.rpush called with key "agency:stream:run_001:events"
  - Assert: redis.expire called with TTL 1800 (30 min)

Test: AgencyEventEmitter assigns monotonic event IDs
  - Emit 3 events
  - Assert: event IDs are "1", "2", "3" (monotonically increasing)

Test: orchestrator emits text_delta events during agent response
  - Mock emitter, run orchestrator with a simple agent node
  - Assert: emitter.emit called with event_type="text_delta"

Test: orchestrator emits tool_start/tool_end around tool calls
  - Mock emitter, run orchestrator with agent that invokes a tool
  - Assert: emitter.emit called with "tool_start" before tool execution
  - Assert: emitter.emit called with "tool_end" after tool execution

Test: orchestrator emits agent_switch on handoff
  - Run orchestrator with 2-agent agency and handoff
  - Assert: emitter.emit called with "agent_switch" containing from/to names

Test: cancel sets cancellation flag and orchestrator checks between steps
  - Set Redis key "agency:cancel:{runId}" = "immediate"
  - Run orchestrator; between node executions it should check the flag
  - Assert: orchestrator terminates early with status "cancelled"
  - Assert: emitter.emit called with "error" event containing cancellation info
```

---

## Implementation Guidance

### 1. Python: `AgencyEventEmitter` (`python-backend/app/services/agency_event_emitter.py`)

Create a class with this interface (do not include full implementation):

```python
class AgencyEventEmitter:
    """Publishes agency run events to Redis for SSE consumption.

    Events are published to channel `agency:stream:{run_id}` and
    persisted to list `agency:stream:{run_id}:events` for replay.
    """

    def __init__(self, redis_client, run_id: str, agency_id: str): ...

    async def emit(self, event_type: str, data: dict) -> None:
        """Publish event to Redis channel and persist to replay list.

        - Assigns monotonic event ID (int counter, incremented per emit call)
        - Wraps data in envelope: { id, event, data, ts }
        - Publishes JSON to Redis channel
        - RPUSHes to Redis list with 30-min TTL
        """
        ...

    async def emit_meta(self) -> None:
        """Emit the initial 'meta' event with runId and agencyId."""
        ...

    async def emit_complete(self, usage: dict) -> None:
        """Emit 'run_complete' event with token/cost usage."""
        ...

    async def emit_error(self, code: str, message: str) -> None:
        """Emit 'error' event."""
        ...
```

Key details:
- Redis channel name: `agency:stream:{run_id}`
- Replay list key: `agency:stream:{run_id}:events`
- Replay list TTL: 1800 seconds (30 minutes)
- Event ID: monotonic integer counter starting at 1, stored as string in `id` field
- Timestamp: ISO 8601 format via `datetime.utcnow().isoformat() + "Z"`
- Use `await redis_client.publish(channel, json_str)` and `await redis_client.rpush(list_key, json_str)` + `await redis_client.expire(list_key, 1800)`

### 2. Python: Orchestrator Integration (`agency_orchestrator.py` modifications)

Modify the orchestrator to accept an optional `AgencyEventEmitter` parameter. At each execution point, emit the corresponding event:

| Execution Point | Event Type | Data Fields |
|----------------|------------|-------------|
| Run starts | `meta` | runId, agencyId |
| Agent turn begins | `text_delta` | agentName, delta (streamed chunks) |
| Tool call initiated | `tool_start` | agentName, toolName, toolCallId |
| Tool call completes | `tool_end` | toolCallId, status, result (truncated to 1000 chars) |
| Handoff between agents | `agent_switch` | from, to, reason |
| Guardrail fires | `guardrail_trigger` | type, guardrailName, action |
| Run completes | `run_complete` | runId, usage |
| Error occurs | `error` | code, message |

For text streaming: the adapter's `get_response_stream()` yields text deltas. Wrap each delta chunk in a `text_delta` event via the emitter.

**Cancellation check**: Between each node execution step, check Redis key `agency:cancel:{run_id}`. If set to `"immediate"`, terminate immediately. If set to `"after_turn"`, finish the current agent turn then stop.

```python
async def _check_cancelled(self, run_id: str) -> str | None:
    """Check Redis for cancellation signal. Returns mode or None."""
    val = await self.redis.get(f"agency:cancel:{run_id}")
    return val.decode() if val else None
```

### 3. Node.js: SSE Route (`apps/web/server/routes/agencyStream.ts`)

Create a new Express router. Follow the pattern from `orchestratorStream.ts` but adapted for agency runs.

**Route: `POST /api/agency/:agencyId/stream`**

The route flow:
1. Authenticate via JWT (reuse `authenticateSSE` pattern from `orchestratorStream.ts` or `authorizeRequest` from `agencyStreamProxy.ts`)
2. Check feature flag `AGENCY_STREAMING_ENABLED` via `getFeatureFlag`
3. Validate request body: `{ agencyId, message, conversationId?, ... }` using Zod
4. Validate `agencyId` format against `AGENCY_ID_PATTERN` (`/^[a-zA-Z0-9_-]+$/`)
5. Verify agency belongs to user's tenant (DB lookup)
6. Forward the run request to Python backend (like `agencyStreamProxy.ts`)
7. Get `runId` from the initial `meta` event response
8. Write SSE headers
9. Start heartbeat (15s interval)
10. Subscribe to Redis channel `agency:stream:{runId}`
11. On Redis message: parse JSON, write SSE frame (`id:`, `event:`, `data:`)
12. On reconnect (`Last-Event-ID` header): replay from Redis list `agency:stream:{runId}:events`

**Replay logic** (different from `orchestratorStream.ts` which uses DB):
```
- Read Last-Event-ID from header
- LRANGE agency:stream:{runId}:events 0 -1
- Filter events where id > lastEventId
- Write each as SSE frame
- Then subscribe to live channel
```

**Bounded buffer** (backpressure):
- Maintain an in-memory circular buffer of max 1000 events per connection
- If the client is consuming slowly and buffer fills, drop oldest events
- Dropped events are still in Redis list for replay on reconnect

**Max duration**: 30 minutes (setTimeout → send close event → cleanup)

**Cleanup**: On `res.close`, unsubscribe Redis, clear heartbeat, clear max-duration timer.

**Route: `POST /api/agency/:agencyId/cancel`**

1. Authenticate via JWT
2. Validate body: `{ runId: string, mode: "immediate" | "after_turn" }`
3. Verify agency + run ownership (tenant check)
4. Set Redis key `agency:cancel:{runId}` with value = mode, TTL = 300s
5. Also call existing `agencyBridge.cancelRun` for adapter-level cancellation
6. Return `{ cancelled: true }`

### 4. Route Registration (`apps/web/server/_core/index.ts`)

Add the new router import and mount it on the Express app. Place it near the existing `orchestratorStreamRouter` and `registerAgencyStreamRoutes` registration.

```typescript
import agencyStreamRouter from "../routes/agencyStream";
// ... in the setup section:
app.use(agencyStreamRouter);
```

### 5. Shared Event Types (`apps/web/shared/agencyStreamEvents.ts`)

Export TypeScript types for all event envelopes. These will be consumed by:
- `agencyStream.ts` (this section) for type-safe event serialization
- `useAgencyStream.ts` (section-10) for type-safe event parsing

Define the discriminated union, event name literal type, and a helper `parseAgencyStreamEvent(raw: string): AgencyStreamEvent | null` that does safe JSON parsing with type narrowing.

---

## Interaction with Existing `agencyStreamProxy.ts`

The existing file at `apps/web/server/_core/agencyStreamProxy.ts` is a **direct HTTP proxy** that pipes the Python SSE response byte-for-byte to the client. The new `agencyStream.ts` route takes a **different approach**: it subscribes to Redis pub/sub (events emitted by the Python orchestrator) and independently writes SSE frames. This enables:

- **Replay on reconnect** (Redis list persistence)
- **Backpressure control** (bounded buffer)
- **Additional Node.js-side event injection** (e.g., approval events from tRPC)

The two approaches coexist. The existing proxy handles the current direct-stream flow. The new route is gated behind `AGENCY_STREAMING_ENABLED` feature flag and is used when the enhanced orchestrator emitter is active.

---

## Redis Key Conventions

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `agency:stream:{runId}` | Pub/Sub channel | N/A | Live event broadcast |
| `agency:stream:{runId}:events` | List | 1800s (30 min) | Event replay buffer |
| `agency:cancel:{runId}` | String | 300s (5 min) | Cancellation signal |

---

## Security Considerations

- JWT authentication required on both SSE and cancel endpoints
- Tenant isolation: verify `agency.tenantId` matches authenticated user's tenant before subscribing
- `agencyId` format validated against strict pattern to prevent path traversal
- Redis channel names use `runId` (UUID), not user-controlled strings
- Cancel endpoint verifies run ownership (createdBy or admin role)
- Feature flag `AGENCY_STREAMING_ENABLED` gates both endpoints
- Per-user concurrent stream limit (max 3, matching existing `agencyStreamProxy.ts` pattern)

---

## Error Handling

- If Redis is unavailable, the SSE route should still function (skip replay, skip live subscription, rely on heartbeat + upstream proxy fallback)
- If Python backend returns non-200 for the run request, return HTTP error before sending SSE headers
- If upstream connection drops mid-stream, emit `error` SSE event with `{ code: "upstream_lost", message: "..." }` and end the response
- Cancellation is best-effort: if Redis set fails, also attempt direct HTTP cancel to Python backend