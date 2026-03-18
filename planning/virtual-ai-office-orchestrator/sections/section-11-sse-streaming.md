Good -- the schema tables from section-02 do not exist yet (they are part of earlier sections). Now I have all the context needed. Let me produce the section content.

# Section 11 -- SSE Streaming Endpoints

## Overview

This section implements real-time Server-Sent Events (SSE) streaming for the Virtual AI Office Orchestrator. Three Express routes expose live event streams to the frontend: per-run, per-team, and user-wide active monitoring. A Redis pub/sub fan-out layer decouples event producers (run engine, monitoring service) from SSE consumers (browser tabs). The implementation includes reconnection support via `Last-Event-ID`, visibility filtering, and heartbeat keep-alive.

SSE is used instead of tRPC because tRPC does not support streaming responses. This follows the established pattern used by `agencyStreamProxy.ts` and `liveBrowserStreamProxy.ts`.

## Dependencies

| Section | What it provides | How this section uses it |
|---------|-----------------|------------------------|
| section-05-room-run-engine | `team_runs` table, run lifecycle events, `runEngine.ts` | Events originate from run engine; SSE streams subscribe by `runId` |
| section-07-monitoring-notifications | `agent_activity_events` table, `monitoringService.ts` | Replay missed events on reconnection; monitoring events feed SSE |
| section-10-trpc-routers | tRPC routers for `teamRun`, `monitoring` | SSE complements tRPC with real-time push; tRPC provides initial state fetch |

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `apps/web/server/services/orchestratorEventBus.ts` | Redis pub/sub wrapper for publishing and subscribing to orchestrator events |
| `apps/web/server/routes/orchestratorStream.ts` | Express SSE routes for run, team, and user-wide streams |
| `apps/web/client/src/hooks/useRunStream.ts` | React hook for consuming orchestrator SSE streams with auto-reconnect (named `useRunStream`) |
| `apps/web/server/services/__tests__/orchestratorEventBus.test.ts` | Unit tests for event bus |
| `apps/web/server/routes/__tests__/orchestratorStream.test.ts` | Unit tests for SSE routes |
| `apps/web/client/src/hooks/__tests__/useRunStream.test.ts` | Unit tests for client hook |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Register `registerOrchestratorStreamRoutes(app)` alongside other Express route registrations |

---

## Tests (Write First)

### 1. Event Bus Tests

**File:** `apps/web/server/services/__tests__/orchestratorEventBus.test.ts`

These tests verify the Redis pub/sub abstraction layer. Because the real Redis pub/sub requires a running Redis instance, mock `ioredis` for unit tests.

**Test: publishEvent sends JSON-serialized event to correct Redis channel keyed by runId**

- Create an `OrchestratorEventBus` instance with a mocked Redis client.
- Call `publishEvent({ ...event, runId: "run_abc", teamId: "team_xyz" })`.
- Assert that `redis.publish` was called with channel `orchestrator:run:run_abc` and the JSON-serialized event.
- Also assert a second publish to `orchestrator:team:team_xyz` (fan-out to team channel).

**Test: publishEvent also publishes to user channel when userId is present in the event envelope**

- Call `publishEvent({ ...event, runId: "run_abc", userId: 42 })`.
- Assert publishes to `orchestrator:run:run_abc`, `orchestrator:team:<teamId>`, and `orchestrator:user:42`.

**Test: subscribeToRun creates Redis subscriber on correct channel pattern**

- Call `subscribeToRun("run_abc", callback)`.
- Assert subscriber called `subscribe("orchestrator:run:run_abc")`.
- Simulate a message on that channel; assert the callback receives the parsed event object.

**Test: subscribeToTeam subscribes to orchestrator:team:<teamId> channel**

- Call `subscribeToTeam("team_xyz", callback)`.
- Assert subscriber called `subscribe("orchestrator:team:team_xyz")`.

**Test: unsubscribe cleans up Redis subscription**

- Subscribe, then call the returned unsubscribe function.
- Assert `redis.unsubscribe` was called and the subscriber connection is released.

**Test: event envelope validation rejects events missing required fields**

- Call `publishEvent` with an event missing `eventId` or `eventType`.
- Assert it throws or returns an error (does not publish to Redis).

### 2. SSE Route Tests

**File:** `apps/web/server/routes/__tests__/orchestratorStream.test.ts`

Use supertest or a lightweight mock of Express `Request`/`Response` objects. Mock `authorizeRequest` and `OrchestratorEventBus`.

**Test: GET /api/runs/:runId/stream returns SSE content-type header**

- Mock `authorizeRequest` to return `{ ok: true, sub: "1", mode: "session" }`.
- Make a GET request to `/api/runs/run_abc/stream`.
- Assert response headers include `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, and `X-Accel-Buffering: no`.

**Test: SSE events are filtered by visibility before sending to client**

- Set up a stream connection for a user.
- Publish two events via the event bus: one with `visibility: "transparent"` and one with `visibility: "private_internal"`.
- Assert that only the `transparent` event is written to the SSE response. The `private_internal` event must be suppressed.

**Test: SSE reconnection with Last-Event-ID replays missed events**

- Make a GET request with the `Last-Event-ID` header set to an event ID corresponding to a known timestamp.
- Mock a database query on `agent_activity_events` that returns events after that timestamp.
- Assert the response includes the replayed events before subscribing to live events.

**Test: SSE heartbeat sent every 15 seconds**

- Connect to the stream endpoint.
- Advance time by 15 seconds (use `vi.useFakeTimers`).
- Assert that `: heartbeat\n\n` was written to the response.

**Test: GET /api/runs/:runId/stream returns 401 for unauthenticated request**

- Mock `authorizeRequest` to return `{ ok: false }`.
- Assert response status is 401.

**Test: GET /api/runs/:runId/stream validates runId format**

- Send a request with `runId` containing path traversal characters (e.g., `../etc/passwd`).
- Assert response status is 400.

**Test: GET /api/teams/:teamId/stream subscribes to team-level events**

- Mock auth, connect to `/api/teams/team_xyz/stream`.
- Publish an event to `orchestrator:team:team_xyz`.
- Assert the event is written to the SSE response.

**Test: GET /api/monitoring/active-stream subscribes to user-level events across all active runs**

- Mock auth with `sub: "42"`.
- Connect to `/api/monitoring/active-stream`.
- Publish events to `orchestrator:user:42`.
- Assert events are written to the SSE response.

**Test: client disconnect triggers cleanup (unsubscribe from Redis, release stream slot)**

- Connect to the stream, then simulate `req.on("close")`.
- Assert the Redis subscription is cleaned up and the per-user stream counter is decremented.

**Test: per-user concurrent stream limit rejects when exceeded**

- Set `MAX_STREAMS_PER_USER` to 3.
- Connect 3 streams for the same user.
- Attempt a 4th connection; assert 429 status.

### 3. Client Hook Tests

**File:** `apps/web/client/src/hooks/__tests__/useRunStream.test.ts`

Use `renderHook` from `@testing-library/react`. Mock `EventSource` or the `fetch`-based SSE reader.

**Test: useRunStream connects to correct URL for runId**

- Call `renderHook(() => useRunStream({ runId: "run_abc" }))`.
- Assert that a fetch/EventSource connection was made to `/api/runs/run_abc/stream`.

**Test: useRunStream passes Last-Event-ID header on reconnection**

- Simulate a disconnect and reconnect.
- Assert the reconnection request includes the `Last-Event-ID` header with the last received event ID.

**Test: useRunStream applies exponential backoff on reconnection (1s, 2s, 4s, max 30s)**

- Simulate repeated connection failures.
- Assert the delay between reconnection attempts follows the pattern: 1000ms, 2000ms, 4000ms, 8000ms, ... capped at 30000ms.

**Test: useRunStream detects connection loss after 30s without data or heartbeat**

- Connect successfully, then stop sending any data.
- Advance time by 30 seconds.
- Assert the hook transitions to a `disconnected` or `reconnecting` state.

**Test: useOrchestratorStream calls onEvent callback for each parsed event**

- Connect, simulate receiving an SSE event.
- Assert the `onEvent` callback was invoked with the parsed event object.

**Test: useOrchestratorStream cleanup on unmount disconnects the stream**

- Render the hook, then unmount.
- Assert the fetch abort controller was called or the EventSource was closed.

---

## Implementation Details

### 1. Event Envelope Type

Define a TypeScript type for the standard event envelope used by all orchestrator events. This is referenced by both the event bus and the SSE routes.

**File:** `apps/web/shared/orchestrator/eventEnvelope.ts` (or co-located in the event bus file if preferred)

The envelope shape:

```typescript
interface OrchestratorEvent {
  eventId: string;           // UUID, used as SSE id field
  eventType: string;         // e.g. "assistant_message_final", "run_paused"
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string | null;
  ts: string;                // ISO 8601 timestamp
  actorType: "user" | "assistant" | "system";
  actorId: string;
  visibility: "transparent" | "milestone" | "summary_only" | "private_internal";
  audience: string[];        // user IDs or "all"
  data: Record<string, unknown>;
}
```

The full event taxonomy (room_created, run_started, assistant_message_final, handoff_requested, run_completed, agent_status_changed, etc.) is defined in Section 7 of the plan. The SSE layer does not need to know every event type -- it treats them as opaque envelopes and filters only on `visibility`.

### 2. Orchestrator Event Bus (`orchestratorEventBus.ts`)

**File:** `apps/web/server/services/orchestratorEventBus.ts`

This service wraps Redis pub/sub for orchestrator events. It uses the existing `getRedisClient()` from `apps/web/server/services/redis.ts` for the publisher connection. For subscribers, it creates a **dedicated Redis connection** per SSE client (required by ioredis -- a subscribed connection cannot issue regular commands).

Key design decisions:

- **Channel naming**: `orchestrator:run:<runId>`, `orchestrator:team:<teamId>`, `orchestrator:user:<userId>`. Each event is published to all applicable channels (fan-out at publish time).
- **Publisher**: Uses the shared Redis client. The `publishEvent(event: OrchestratorEvent)` method serializes the event to JSON and publishes to 2-3 channels depending on whether `runId`, `teamId`, and `userId` fields are present.
- **Subscriber**: Creates a new ioredis instance (using the same connection URL) in subscriber mode. Provides `subscribeToRun(runId, callback)`, `subscribeToTeam(teamId, callback)`, and `subscribeToUser(userId, callback)`. Each returns an `unsubscribe()` function that cleans up the dedicated connection.
- **Event validation**: Before publishing, validate that `eventId`, `eventType`, `tenantId`, and `ts` are present. Reject malformed events with a thrown error.

The event bus does NOT store events. Persistence is handled by the monitoring service writing to `agent_activity_events`. The event bus is purely for real-time fan-out.

### 3. SSE Express Routes (`orchestratorStream.ts`)

**File:** `apps/web/server/routes/orchestratorStream.ts`

Export a `registerOrchestratorStreamRoutes(app: Express)` function following the pattern of `registerAgencyStreamRoutes` and `registerLiveBrowserStreamRoutes`.

Three GET endpoints:

#### `GET /api/runs/:runId/stream`

1. **Authenticate** via `authorizeRequest(req, { allowBearer: true, allowSession: true })`. Return 401 if not authenticated.
2. **Validate** `runId` format using a strict regex pattern (UUID format: `/^[0-9a-f-]{36}$/i`). Return 400 if invalid.
3. **Authorize** the user has access to this run (query `team_runs` joined to `assistant_teams` to verify the run belongs to the user's tenant and the user is the orchestrator). Return 403 if unauthorized.
4. **Acquire stream slot** using a per-user counter (same pattern as `agencyStreamProxy.ts`). Max 5 concurrent SSE streams per user. Return 429 if exceeded.
5. **Replay missed events** if `Last-Event-ID` header is present:
   - Parse the header value as an event ID.
   - Look up its `createdAt` timestamp from `agent_activity_events`.
   - Query all events for this `runId` with `createdAt > lastEventTimestamp` and `createdAt > NOW() - 5 minutes` (replay window cap).
   - Filter by visibility (exclude `private_internal`).
   - Write each as an SSE event before starting live subscription.
6. **Write SSE headers** (Content-Type, Cache-Control, Connection, X-Accel-Buffering).
7. **Start heartbeat** interval: write `: heartbeat\n\n` every 15 seconds.
8. **Subscribe** to `orchestrator:run:<runId>` via the event bus.
9. **On each event**: check `visibility` -- if `private_internal`, skip. Otherwise, write as SSE:
   ```
   id: <eventId>
   event: <eventType>
   data: <JSON-serialized event>

   ```
10. **On client disconnect** (`req.on("close")`): unsubscribe from Redis, clear heartbeat interval, release stream slot.

#### `GET /api/teams/:teamId/stream`

Same pattern as above but:
- Validates `teamId` format.
- Authorizes user owns the team (query `assistant_teams`).
- Subscribes to `orchestrator:team:<teamId>`.
- Replay queries `agent_activity_events` filtered by `teamId` instead of `runId`.

#### `GET /api/monitoring/active-stream`

Same pattern but:
- No resource ID validation (streams all events for the authenticated user).
- Subscribes to `orchestrator:user:<userId>`.
- Replay queries events for all active runs belonging to this user.

#### Shared SSE Helper Functions

Extract reusable functions (following the pattern already established in the codebase):

- `writeSSEHeaders(res: Response)` -- identical to existing implementations in `agencyStreamProxy.ts`.
- `writeSSEEvent(res: Response, event: OrchestratorEvent)` -- formats and writes a single SSE event.
- `acquireStream(userId: number): boolean` / `releaseStream(userId: number)` -- per-user concurrency tracking.

### 4. Visibility Filtering

Events have a `visibility` field with four possible values:

| Value | Meaning | Sent to client SSE? |
|-------|---------|---------------------|
| `transparent` | Full detail, always visible | Yes |
| `milestone` | Important checkpoints | Yes |
| `summary_only` | Condensed summaries | Yes |
| `private_internal` | Agent-to-agent internal comms | **No** |

The filtering logic is a simple check: `if (event.visibility === "private_internal") return;` before writing to the SSE response. This ensures internal agent communication never leaks to the browser.

### 5. Reconnection Strategy

The reconnection protocol has two parts:

**Server-side (replay):**
- Each SSE event includes an `id:` field set to the event's `eventId` (UUID).
- When the client reconnects with `Last-Event-ID`, the server queries `agent_activity_events` for events newer than the referenced event's timestamp.
- Replay window is capped at 5 minutes. If the client has been disconnected longer, it must do a full state fetch via `monitoring.getRunStatus` (tRPC).
- The `Last-Event-ID` header is the standard HTTP mechanism; it is automatically sent by `EventSource` in browsers. For the fetch-based approach used in the client hook, it must be sent manually.

**Client-side (exponential backoff):**
- On connection loss (no data or heartbeat for 30 seconds), the client hook attempts to reconnect.
- Backoff schedule: 1s, 2s, 4s, 8s, 16s, capped at 30s.
- On successful reconnect, backoff resets to 1s.
- The hook sends `Last-Event-ID` with the ID of the last successfully received event.

### 6. Client Hook (`useRunStream.ts`)

**File:** `apps/web/client/src/hooks/useRunStream.ts`

A React hook that manages the SSE connection lifecycle. Uses the `fetch` API with `ReadableStream` reader (not native `EventSource`) to allow sending custom headers (`Last-Event-ID`) and credentials. This follows the same pattern as the existing `useAgencyStream.ts` hook.

The hook is named `useRunStream` (not `useOrchestratorStream`) for clarity at the call site.

Hook signature:

```typescript
interface UseRunStreamOptions {
  runId?: string;
  teamId?: string;
  userWide?: boolean;         // for /api/monitoring/active-stream
  // Typed callbacks — the hook dispatches by eventType internally
  onAssistantMessageFinal?: (event: OrchestratorEvent) => void;
  onAgentStatusChanged?: (event: OrchestratorEvent) => void;
  onRunCompleted?: (event: OrchestratorEvent) => void;
  onBudgetThreshold?: (event: OrchestratorEvent) => void;
  onEvent?: (event: OrchestratorEvent) => void; // generic fallback for all other event types
  onError?: (error: string) => void;
  onReconnect?: () => void;
  enabled?: boolean;          // default true; set false to disable
}

interface UseRunStreamReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  lastEventId: string | null;
  error: string | null;
  disconnect: () => void;
}
```

When an event arrives, the hook dispatches to the matching typed callback first (`onAssistantMessageFinal`, `onAgentStatusChanged`, `onRunCompleted`, `onBudgetThreshold`), then falls back to the generic `onEvent` callback for any event types not explicitly handled. This allows callers to subscribe only to the events they care about without a manual `switch` statement.

The hook determines the URL from the options: if `runId` is provided, use `/api/runs/<runId>/stream`; if `teamId`, use `/api/teams/<teamId>/stream`; if `userWide`, use `/api/monitoring/active-stream`.

Internal state management:
- `lastEventIdRef` -- tracks the most recent event ID for reconnection.
- `abortControllerRef` -- for cancelling the fetch on unmount or disconnect.
- `reconnectTimeoutRef` -- for the backoff timer.
- `lastDataTimestampRef` -- for detecting connection staleness (no data for 30s).

The SSE parsing logic should be extracted from or shared with the existing `parseSSEEvents` function in `useAgencyStream.ts` to avoid duplication. Consider moving the parser to a shared utility like `apps/web/client/src/lib/sseParser.ts`.

### 7. Registration in Server Entry Point

**File:** `apps/web/server/_core/index.ts`

Add the import and registration call alongside the other stream registrations:

```typescript
import { registerOrchestratorStreamRoutes } from "../routes/orchestratorStream";
// ... in the route registration section:
registerOrchestratorStreamRoutes(app);
```

This follows the exact same pattern as `registerAgencyStreamRoutes(app)` and `registerLiveBrowserStreamRoutes(app)` already present on lines 21-22.

### 8. Redis Connection Considerations

The event bus creates a new ioredis connection for each SSE subscriber. This is required because ioredis (like most Redis clients) does not allow a connection in subscriber mode to issue regular commands.

To prevent connection exhaustion:
- The per-user stream limit (max 5) bounds total subscriber connections.
- Each subscriber connection is closed immediately when the SSE client disconnects.
- Use the same `REDIS_URL` and connection options from `apps/web/server/services/redis.ts`.
- Log connection creation/destruction at debug level for operational visibility.

### 9. Security Considerations

- All three endpoints require authentication via `authorizeRequest`.
- `runId` and `teamId` parameters are validated with strict regex to prevent SSRF or injection.
- Authorization checks verify the user owns or has access to the target resource (tenant isolation).
- `private_internal` events are never sent to the client, preventing leakage of agent-to-agent internals.
- Per-user stream limits prevent resource exhaustion from a single user opening many tabs.

---

## Integration Points

### How the Run Engine Publishes Events

The run engine (section-05) and monitoring service (section-07) call `orchestratorEventBus.publishEvent(event)` whenever a significant action occurs. For example:

- `runEngine.startRun()` publishes a `run_started` event.
- `runEngine.executeTurn()` publishes `assistant_activated`, `assistant_message_delta`, `assistant_message_final` events.
- `monitoringService.recordEvent()` publishes monitoring events like `agent_status_changed`.

These services import the event bus and call publish as a side effect. The SSE routes never call the run engine directly -- they only subscribe to Redis channels.

### How the Frontend Consumes Events

The `useOrchestratorStream` hook (this section) is consumed by the Live Run Monitor component (section-14). The monitor component passes `onEvent` to dispatch events into its local state (agent roster updates, timeline entries, budget changes). Initial state is fetched via tRPC `monitoring.getRunStatus`, then kept up-to-date via SSE.