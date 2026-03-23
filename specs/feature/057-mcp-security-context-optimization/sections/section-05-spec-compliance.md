# Section 05 — MCP Spec 2025-03-26 MUST Compliance

## Section ID
`section-05-spec-compliance`

## Dependencies
- None (Wave 1 — parallel)

## Overview

Fixes 1 CRITICAL + 4 HIGH spec compliance gaps in `mcpPublicServer.ts`: JSON-RPC batch request support (MUST per spec), protocol version negotiation, `notifications/initialized` handler, session termination via HTTP DELETE, and HTTP 404 for expired sessions.

## Files Modified

| File | Path | Changes |
|------|------|---------|
| mcpPublicServer.ts | `apps/web/server/_core/mcpPublicServer.ts` | Refactored into `processSingleRequest` + batch handler; added batch, ping, notifications/initialized, DELETE, HTTP 404, version negotiation, UUID validation |
| mcpPublicServer.test.ts | `apps/web/server/_core/__tests__/mcpPublicServer.test.ts` | Fixed auth setup in `makeApp()`, added `del` to Redis mock, added 15 new test cases (33 total) |

---

## TDD Specification

```
# Test: batch request — array of 3 JSON-RPC requests returns array of 3 responses
  - POST body: [{id:1, method:"tools/list"}, {id:2, method:"tools/list"}, {id:3, method:"ping"}]
  - Assert response is array of 3 JSON-RPC responses with matching ids

# Test: batch request — single request (non-array) still works
  - POST body: {id:1, method:"tools/list"}
  - Assert single JSON-RPC response (not wrapped in array)

# Test: batch with mixed valid/invalid — each processed independently
  - POST body: [{id:1, method:"tools/list"}, {id:2, method:"invalid_method"}]
  - Assert response[0] is success, response[1] is error -32601

# Test: protocol version negotiation — client sends supported version
  - Initialize with protocolVersion: "2025-03-26"
  - Assert server responds with protocolVersion: "2025-03-26"

# Test: protocol version negotiation — client sends unsupported version
  - Initialize with protocolVersion: "2020-01-01"
  - Assert server responds with its latest supported version "2025-03-26"

# Test: notifications/initialized accepted as no-op
  - Send {method: "notifications/initialized"} (no id — it's a notification)
  - Assert no JSON-RPC error returned, request accepted silently

# Test: DELETE /v1/mcp with valid Mcp-Session-Id terminates session
  - Initialize to get session ID
  - DELETE /v1/mcp with Mcp-Session-Id header
  - Assert 200 or 204 returned
  - Subsequent request with same session ID returns error

# Test: expired session returns HTTP 404, not JSON-RPC error in 200
  - Use a fake/expired Mcp-Session-Id
  - Assert HTTP status 404 (not 200 with JSON-RPC error)
```

---

## Implementation Guidance

### Batch Request Support

At the handler entry point (where `req.body` is processed):

```typescript
async function handleMcpRequest(req: Request, res: Response) {
  const body = req.body;
  if (Array.isArray(body)) {
    // Batch: process each independently
    const results = await Promise.all(
      body.map(item => processSingleRequest(item, req, res))
    );
    // Filter out notifications (no id = no response)
    const responses = results.filter(r => r !== null);
    return res.json(responses);
  }
  // Single request
  const result = await processSingleRequest(body, req, res);
  if (result === null) return res.status(202).end(); // notification
  return res.json(result);
}
```

### Protocol Version Negotiation

In `handleInitialize`:
```typescript
const SUPPORTED_VERSIONS = ["2025-03-26"];
const clientVersion = params?.protocolVersion;
const negotiatedVersion = SUPPORTED_VERSIONS.includes(clientVersion)
  ? clientVersion
  : SUPPORTED_VERSIONS[0]; // latest
// Return negotiatedVersion in response
```

### notifications/initialized Handler

Add to the method dispatch:
```typescript
case "notifications/initialized":
  return null; // No-op, no response for notifications
```

### Session Termination (DELETE)

```typescript
app.delete("/v1/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (sessionId) {
    await redis.del(`mcp:session:${sessionId}`);
  }
  res.status(204).end();
});
```

### HTTP 404 for Expired Sessions

In `loadSession`, when session not found:
```typescript
if (!session) {
  res.status(404).json({ error: "Session expired or invalid" });
  return null;
}
```

### Security Considerations

1. **Batch amplification**: A batch of 1000 requests could DoS the server. Apply the existing rate limiter to the total number of items in the batch, not just the HTTP request count.
2. **Notification without id**: JSON-RPC notifications have no `id` field and require no response. The handler must not attempt to send a response for these.

---

## Implementation Notes (Post-Build)

### Deviations from Plan
- **Refactored to `processSingleRequest`**: Extracted single-request processing from `mcpHandler` into a standalone function. The batch handler maps over items with `Promise.all`, the single handler calls it directly. This was necessary for batch support.
- **Added `ping` method handler**: Not in original plan but required by MCP spec. Returns `{}`.
- **Removed unused `apiKeyAuthMiddleware` import**: Cleanup from prior section (04) changes.

### Code Review Fixes Applied
- **UUID validation on DELETE**: `mcpDeleteHandler` now validates session ID format with `/^[0-9a-f]{8}-.../i` before calling `redis.del`. Prevents IDOR on Redis keyspace.
- **Multiple initialize rejection in batch**: Batches with >1 `initialize` method are rejected with `-32600`.
- **HTTP 404 in batch mode**: `_mcpSessionExpired` flag is checked after batch processing; returns 404 if session expired.
- **Dead code removal**: Removed unused `isNotification` variable.

### Test Summary
- 33 tests in `mcpPublicServer.test.ts` (was 17, added 16)
- 7 tests in `mcpPublicServerSecurity.test.ts` (unchanged)
- All 40 pass
