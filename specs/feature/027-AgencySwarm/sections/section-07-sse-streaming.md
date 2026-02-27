# Section 07: SSE Stream Proxy

## Implementation Status: COMPLETE

## Overview

This section implements the Server-Sent Events (SSE) streaming pipeline that carries agency run events from the Python backend through the Node.js Express layer to the React frontend. It includes an Express middleware that proxies SSE from Python, a heartbeat mechanism to prevent proxy timeouts, Nginx location block configuration for buffering-free SSE delivery, and a client reconnection endpoint for missed-event recovery.

### Deviations from Original Plan
- **Deferred writeHead**: SSE headers are sent AFTER upstream confirms 200, not before. This allows proper HTTP error codes (403, 502) for upstream failures.
- **agencyId validation**: Added strict regex validation + encodeURIComponent to prevent SSRF/path traversal (security fix from code review).
- **Per-user rate limiting**: Added MAX_STREAMS_PER_USER=3 concurrent stream limit with in-memory tracking (code review finding I3).
- **userId NaN guard**: Added Number.isFinite check to prevent NaN from bearer "static" tokens reaching creditService.

**Dependencies:**
- Section 05 (Python router) must be complete -- provides the `POST /api/v1/agencies/{agency_id}/stream` Python endpoint that emits SSE events
- Section 06 (Node.js integration) must be complete -- provides `agencyBridge.ts` (HTTP bridge to Python), the tRPC agency router, feature flag checks, and the credit pre-check infrastructure

**Blocks:** Section 08 (frontend chat) depends on this section for the SSE endpoint the `useAgencyStream` hook connects to.

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.ts` | Express middleware: SSE stream proxy from Python to client |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.test.ts` | Vitest tests for the SSE proxy |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Register `registerAgencyStreamRoutes(app)` alongside existing SSE routes |
| `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf` | Add SSE-specific location block for `/api/v1/agency/stream` |

---

## Tests (Write First)

Tests go in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.test.ts`. They use Vitest with mocked dependencies following the patterns established in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.test.ts`.

### Test 1: Sets correct SSE headers

Verify that when the proxy handler is invoked, the response includes all required SSE headers:
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (prevents Nginx from buffering SSE)

Mock the upstream Python fetch to return a simple SSE stream. Assert all four headers are set on the Express response.

### Test 2: Proxies SSE events from Python to client

Mock `fetch()` to return a `ReadableStream` body containing two SSE events:
```
event: token\ndata: {"content":"hello"}\n\n
event: run_finished\ndata: {"run_id":"abc"}\n\n
```

Assert the Express response receives both events written via `res.write()` in the same format, preserving event type and data payload exactly.

### Test 3: Checks feature flag before proxying

Mock `getFeatureFlag("AGENCY_SWARM_ENABLED")` to return `false`. Call the proxy handler. Assert the response is `404` with a JSON body `{ error: "Agency feature not enabled" }` and that no upstream fetch to Python is attempted.

### Test 4: Checks credits before proxying

Mock `getFeatureFlag` to return `true` but `hasEnoughCredits` to return `false` for the authenticated user. Assert the response is `402` with JSON body `{ error: "Insufficient credits" }`. Assert no upstream fetch to Python occurs.

### Test 5: Handles Python connection drop gracefully

Mock `fetch()` to return a stream that emits one event then errors (simulate stream abort). Assert:
- The proxy writes an SSE error event to the client: `event: error\ndata: {"message":"Upstream connection lost"}\n\n`
- The response is properly ended (no dangling connection)
- The heartbeat interval is cleared

### Test 6: Heartbeat is sent on interval

Use Vitest fake timers. Start a proxy connection with a mock upstream that stays open. Advance time by 15 seconds. Assert that a keepalive comment `": keepalive\n\n"` was written to the response. Advance another 15 seconds; assert a second keepalive was written.

### Test 7: Auth required

Call the stream endpoint without any auth headers or session cookie. Assert `401 Unauthorized` response. Assert no upstream fetch.

### Test stubs

```typescript
// /home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before imports
vi.mock("../services/featureFlags", () => ({
  getFeatureFlag: vi.fn(),
}));
vi.mock("../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
}));

describe("agencyStreamProxy", () => {
  // ... setup mock req/res objects following Express test patterns

  it("sets correct SSE headers (Content-Type, Cache-Control, X-Accel-Buffering)", async () => {
    /** Mock feature flag enabled, credits sufficient, upstream returns valid SSE stream.
     *  Assert res headers include all four required SSE headers. */
  });

  it("proxies SSE events from Python to client unchanged", async () => {
    /** Mock upstream returning two SSE events (token + run_finished).
     *  Assert res.write() called with exact same SSE text. */
  });

  it("checks feature flag before proxying — returns 404 when disabled", async () => {
    /** Mock getFeatureFlag returning false.
     *  Assert 404 response, no fetch call. */
  });

  it("checks credits before proxying — returns 402 when insufficient", async () => {
    /** Mock hasEnoughCredits returning false.
     *  Assert 402 response, no fetch call. */
  });

  it("handles Python connection drop gracefully", async () => {
    /** Mock stream that errors after first event.
     *  Assert error SSE event written, response ended, heartbeat cleared. */
  });

  it("sends heartbeat keepalive every 15 seconds", async () => {
    /** Use vi.useFakeTimers(). Advance 15s, assert keepalive comment written.
     *  Advance another 15s, assert second keepalive. */
  });

  it("returns 401 when no auth provided", async () => {
    /** No auth headers on request.
     *  Assert 401, no upstream fetch. */
  });
});
```

---

## Implementation Details

### 1. SSE Stream Proxy Middleware

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.ts`

This module exports a `registerAgencyStreamRoutes(app: Express)` function that registers one POST endpoint. The function follows the same registration pattern used by `registerMediaJobRoutes` and `registerLLMRoutes` in the existing codebase.

**Endpoint:** `POST /api/v1/agency/stream`

Note: This endpoint is registered on the Express app directly (not via tRPC) because tRPC does not natively support SSE streaming responses. This follows the same pattern as the LLM streaming endpoint in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts` and the media job SSE endpoint in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts`.

**Important routing consideration:** The existing `/api/v1/*` catch-all proxy at line 514 of `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` forwards all `/api/v1/` requests to the Python backend. The agency stream proxy must be registered BEFORE this catch-all so it intercepts the stream request on the Node.js side. This is necessary because the Node.js layer must perform feature flag checks, credit pre-checks, and heartbeat injection before proxying to Python.

#### Request Flow

```
Client (fetch POST) → Nginx → Node.js Express → Python FastAPI
                                    ↓
                              1. authorizeRequest()
                              2. getFeatureFlag("AGENCY_SWARM_ENABLED")
                              3. hasEnoughCredits(userId, estimatedCost)
                              4. fetch(PYTHON_URL/api/v1/agencies/{id}/stream)
                              5. Pipe SSE bytes: Python → res.write() → client
                              6. Heartbeat: ": keepalive\n\n" every 15s
                              7. On [DONE] or error: cleanup + res.end()
```

#### Handler Pseudocode

```typescript
export function registerAgencyStreamRoutes(app: Express): void {
  app.post("/api/v1/agency/stream", async (req: Request, res: Response) => {
    // Step 1: Authenticate (same pattern as media jobs SSE endpoint)
    // Use authorizeRequest() from ./authz.ts with allowBearer + allowSession

    // Step 2: Check feature flag
    // const enabled = await getFeatureFlag("AGENCY_SWARM_ENABLED");
    // if (!enabled) return res.status(404).json({ error: "Agency feature not enabled" });

    // Step 3: Extract request body: { agencyId, conversationId, message }
    // Validate with lightweight checks (full Zod validation happens in Python)

    // Step 4: Credit pre-check
    // const estimatedCost = estimate based on body or use a conservative default
    // if (!await hasEnoughCredits(userId, estimatedCost)) return 402

    // Step 5: Build upstream URL
    // const pythonUrl = `${PY_BACKEND}/api/v1/agencies/${agencyId}/stream`

    // Step 6: Set SSE response headers (BEFORE fetching upstream)
    // This ensures the client sees event-stream content type immediately
    // Headers: Content-Type, Cache-Control, Connection, X-Accel-Buffering

    // Step 7: Start heartbeat interval (15 seconds)
    // const heartbeatInterval = setInterval(() => res.write(": keepalive\n\n"), 15_000);

    // Step 8: Fetch upstream (Python) with AbortController
    // Forward auth headers (generate short-lived JWT from session, same as /api/v1/* proxy)
    // Forward x-request-id for tracing

    // Step 9: Pipe upstream body to response
    // Read from upstream ReadableStream, write chunks to res
    // On upstream end: clear heartbeat, write final event, res.end()

    // Step 10: Error handling
    // On upstream fetch error: write SSE error event, clear heartbeat, res.end()
    // On client disconnect (req "close" event): abort upstream, clear heartbeat
  });
}
```

#### SSE Headers

Follow the exact header pattern from the existing media jobs SSE endpoint in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaJobs.ts` (lines 757-762) plus the `X-Accel-Buffering: no` header:

```typescript
res.writeHead(200, {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
});
res.flushHeaders();
```

The `X-Accel-Buffering: no` header is critical for Nginx -- it instructs Nginx to disable response buffering for this request, allowing SSE events to flow through immediately. Without it, Nginx buffers the response and the client sees large batches of events instead of real-time delivery.

#### Heartbeat Mechanism

The heartbeat prevents proxy/load-balancer timeouts by sending a comment line every 15 seconds. SSE comments (lines starting with `:`) are ignored by conforming clients but keep the TCP connection alive.

```typescript
const HEARTBEAT_INTERVAL_MS = 15_000;

const heartbeatInterval = setInterval(() => {
  if (!res.writableEnded) {
    res.write(": keepalive\n\n");
  }
}, HEARTBEAT_INTERVAL_MS);
```

The heartbeat must be cleared in ALL exit paths:
- Upstream stream ends normally
- Upstream stream errors
- Client disconnects (`req.on("close", ...)`)
- Feature flag / credit check fails (heartbeat not started yet in these paths)

#### Upstream Connection and Piping

The proxy connects to the Python FastAPI streaming endpoint using `fetch()` (Node.js built-in). The response body is a `ReadableStream` whose chunks are raw SSE text bytes. The proxy reads these chunks and writes them directly to the Express response without parsing or transformation.

```typescript
const PY_BACKEND = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

const controller = new AbortController();
req.on("close", () => controller.abort());

const upstream = await fetch(`${PY_BACKEND}/api/v1/agencies/${agencyId}/stream`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "Accept": "text/event-stream",
    "x-request-id": req.requestId || "",
  },
  body: JSON.stringify({ message, conversation_id: conversationId }),
  signal: controller.signal,
});
```

For piping the response body, use the `ReadableStream` reader pattern. Each chunk of bytes from Python is written directly to `res.write()`. When the stream ends (reader returns `done: true`), clear the heartbeat and end the response.

#### Error Handling

If the upstream fetch fails or the stream errors mid-flight:

```
event: error
data: {"message":"Upstream connection lost"}

```

This follows the same best-effort SSE error pattern used in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts` (lines 1429-1436). The error is sent as an SSE event so the client-side `useAgencyStream` hook (section 08) can handle it gracefully.

#### Auth Token Generation

The proxy authenticates the incoming request using `authorizeRequest()` from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/authz.ts`. If the request uses a session cookie (no Bearer header), the proxy generates a short-lived JWT for the upstream Python call using `signBearerToken()` from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/tokens.ts`. This follows the exact same pattern as the existing `/api/v1/*` catch-all proxy at line 527-543 of `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`.

### 2. Express App Registration

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add the import and registration call. The agency stream route must be registered BEFORE the `/api/v1/*` catch-all proxy to prevent the catch-all from intercepting it.

At the import section (near line 19 where `registerMediaJobRoutes` is imported):

```typescript
import { registerAgencyStreamRoutes } from "./agencyStreamProxy";
```

At the route registration section (near line 339, BEFORE the `/api/v1/*` catch-all at line 514):

```typescript
// REST/SSE endpoints
registerLLMRoutes(app);
registerMCPRoutes(app);
registerMediaJobRoutes(app);
registerAgencyStreamRoutes(app);  // NEW — must be before /api/v1/* catch-all
```

### 3. Nginx Configuration

**File:** `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf`

Add a dedicated location block for the agency stream endpoint in BOTH the HTTP (port 80) and HTTPS (port 443) server blocks. This block must appear BEFORE the general `/api/` location block (which proxies to the Python backend) because Nginx evaluates location blocks in order of specificity and the agency stream goes to the Node.js web host, not directly to Python.

The location block follows the exact same pattern as the existing media jobs SSE location block (lines 38-56 for HTTP, lines 218-235 for HTTPS):

```nginx
# Agency Stream SSE events (must come BEFORE /api/)
location = /api/v1/agency/stream {
    proxy_pass http://web_host;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    # Critical for SSE
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;

    proxy_connect_timeout 120s;
    proxy_send_timeout 700s;
    proxy_read_timeout 700s;
}
```

Key differences from the general `/api/` block:
- **`proxy_pass http://web_host`** (not `backend_host`) -- the stream is proxied through Node.js, not directly to Python
- **`proxy_buffering off`** -- disables Nginx response buffering so SSE events flow immediately
- **`proxy_cache off`** -- prevents any caching of the SSE stream
- **`chunked_transfer_encoding off`** -- required for clean SSE delivery over HTTP/1.1
- **`proxy_read_timeout 700s`** -- longer than the agency's max run time (default 600s) to ensure Nginx does not cut the connection before the agency finishes
- **`location = /api/v1/agency/stream`** -- exact match (`=`) ensures this location is selected over the prefix-match `/api/` block

This location block must be added in both the port-80 HTTP server block and the port-443 HTTPS server block.

### 4. Client Reconnection Endpoint

If the SSE connection drops mid-run, the client needs to recover. Rather than adding a separate Express endpoint, the existing tRPC agency router (from section 06) provides `getRunStatus` and `listMessages` procedures. The client reconnection flow is:

1. Client detects SSE stream disconnect (fetch error or `event: error`)
2. Client queries `trpc.agency.getRunStatus({ runId })` to check if the run is still active
3. If run is still active, client reconnects to `POST /api/v1/agency/stream` with the same `conversationId` -- Python will resume streaming from the current agent's output
4. If run completed while disconnected, client queries `trpc.agency.listMessages({ conversationId })` to fetch all messages and displays the final result

This approach avoids building a separate "replay" endpoint. The Python streaming endpoint is stateless from the proxy's perspective -- it simply streams whatever the agency is currently producing.

### 5. SSE Event Format

The Python backend (section 05) emits these SSE event types. The proxy passes them through unchanged:

| Event Type | Data Shape | Description |
|-----------|------------|-------------|
| `run_started` | `{ run_id, agency_id, conversation_id }` | Run has begun |
| `agent_switch` | `{ agent_name, agent_id, reason }` | Active agent changed |
| `token` | `{ content, agent_name }` | Streaming token delta |
| `tool_call` | `{ tool_name, agent_name, input }` | Agent invoked a tool |
| `tool_result` | `{ tool_name, agent_name, output, duration_ms }` | Tool returned result |
| `run_finished` | `{ run_id, total_credits, duration_ms }` | Run completed |
| `run_error` | `{ run_id, error_type, message }` | Run failed |

The proxy does NOT parse or transform these events. It pipes raw bytes from Python to the client. The only additions the proxy makes to the stream are:
- `: keepalive\n\n` comments (heartbeat)
- `event: error\ndata: {...}\n\n` if the upstream connection itself fails

### 6. Credit Estimation for Pre-Check

The pre-check uses a conservative estimate. The proxy does not need exact cost prediction -- it just needs to ensure the user is not at zero credits before starting an expensive multi-agent run. A reasonable default estimate:

```typescript
// Conservative: assume 3 agents, ~2000 tokens each, at the cost of the most expensive common model
const AGENCY_RUN_ESTIMATED_CREDITS = 5.0; // credits (not USD)
```

This constant can be refined later. The actual per-call charges happen at the LLM gateway level (section 06), and the multiplier markup happens at run completion (section 06). The pre-check is a guardrail, not a reservation.

---

## Verification Checklist

After implementation, verify:

1. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/_core/agencyStreamProxy.test.ts` -- all 7 tests pass
2. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- no TypeScript errors
3. Nginx config syntax: `docker exec smartspec-nginx-dev nginx -t` -- passes
4. Manually verify: the agency stream location block appears BEFORE the `/api/` block in both HTTP and HTTPS server sections of `dev-host.conf`
5. Verify `registerAgencyStreamRoutes(app)` is called BEFORE the `/api/v1/*` catch-all proxy in `index.ts`