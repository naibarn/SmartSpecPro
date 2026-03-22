I have enough context now. Let me write the section.

# Section 16 — Tool Progress Streaming & Standalone Tool API

## Overview

This section adds two closely related capabilities. First, a `emit_progress` method on the Python ToolBridge base class so that long-running tools can publish incremental progress updates as `tool_progress` SSE events during an agency run. Second, a standalone REST API that exposes custom agency tools as independent HTTP endpoints (for external automation, webhooks, n8n, etc.), including automatic OpenAPI spec generation for those exposed tools.

### Dependencies

| Section | What this section uses |
|---------|----------------------|
| section-01-database-migration | `agencyTools.isExposedAsApi` column (boolean, default false), `agencyTools.inputSchema` (JSONB), `agencyTools.outputSchema` (JSONB) |
| section-02-custom-tools-backend | Custom tool CRUD, `ToolBridge` base class, SSRF validation, tool config/schema structures |
| section-09-sse-streaming-backend | `AgencyEventEmitter` for publishing `tool_progress` events to Redis SSE channel; SSE event type definitions in `apps/web/shared/agencyStreamEvents.ts` |

### Blocks

No other sections depend on this section.

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/agencyToolsApi.ts` | Express route handlers for standalone tool execution and OpenAPI spec generation |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/agencyToolsApi.test.ts` | Vitest tests for the standalone tool API endpoints |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_tool_progress.py` | pytest unit tests for emit_progress in ToolBridge |

## Files to Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` | Add `emit_progress(message, percent)` method to the tool run function closure; wire it to `AgencyEventEmitter` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` | Pass `emitter` and `run_id` into `_make_run_func` so tools can emit progress |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Register the new `agencyToolsApi` routes on the Express app |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/agencyStreamEvents.ts` | Add `tool_progress` event type to the shared event types (if not already present from section-09) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Add `toggleToolExposure` tRPC mutation to flip `isExposedAsApi` on a custom tool |

---

## TDD: Tests to Write First

### Python Tests — Tool Progress

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_tool_progress.py`

Framework: pytest. Use `@pytest.mark.unit` marker.

```
Test: "emit_progress publishes tool_progress SSE event via emitter"
- Create a mock AgencyEventEmitter with a spy on emit()
- Create a ToolBridge run function with the emitter injected
- Call emit_progress("Searching...", percent=25) from within the tool run
- Assert emitter.emit was called with event_type="tool_progress", data containing:
  - toolCallId (string)
  - message: "Searching..."
  - percent: 25
- Assert the Redis channel used matches "agency:stream:{runId}"

Test: "emit_progress with no percent omits percent field"
- Call emit_progress("Working...") without percent arg
- Assert emitted data has message but no percent key

Test: "emit_progress is no-op when emitter is None"
- Create tool run function with emitter=None (non-streaming context)
- Call emit_progress("test")
- Assert no exception raised, no side effects

Test: "builtin-web-search emits progress during execution"
- Mock the HTTP call for builtin-web-search
- Provide a mock emitter
- Execute the tool
- Assert at least one tool_progress event was emitted with message containing "Searching"

Test: "builtin-rag-knowledge emits progress during execution"
- Mock the HTTP call for builtin-rag-knowledge
- Provide a mock emitter
- Execute the tool
- Assert tool_progress event emitted with message containing "Querying"
```

### Vitest Tests — Standalone Tool API

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routes/__tests__/agencyToolsApi.test.ts`

Framework: Vitest. Mock the database, `apiKeyAuth`, and HTTP client.

```
Test: "POST /api/v1/agency-tools/:toolId/execute requires API key with agency:tool:execute scope"
- Send request with no auth header
- Assert 401 response with error.code "invalid_api_key"
- Send request with API key that lacks agency:tool:execute scope
- Assert 403 response with error.code "insufficient_scopes"

Test: "POST /api/v1/agency-tools/:toolId/execute validates tenant isolation"
- Mock API key belonging to tenant A
- Mock tool belonging to tenant B
- Send execute request
- Assert 403 with message "Tool not accessible from this tenant"

Test: "POST /api/v1/agency-tools/:toolId/execute rejects tool not marked isExposedAsApi"
- Mock tool with isExposedAsApi=false
- Send execute request
- Assert 404 with message "Tool not found or not exposed as API"

Test: "POST /api/v1/agency-tools/:toolId/execute validates input against tool inputSchema"
- Mock tool with inputSchema requiring { query: string }
- Send request body { wrong_field: "value" }
- Assert 400 with validation error details

Test: "POST /api/v1/agency-tools/:toolId/execute succeeds with valid input"
- Mock tool with isExposedAsApi=true, correct tenant, valid inputSchema
- Mock the tool execution HTTP call returning { result: "ok" }
- Send valid request body
- Assert 200 with tool execution result

Test: "POST /api/v1/agency-tools/:toolId/execute rate limits at 100 req/min per key"
- Send 101 requests from the same API key
- Assert the 101st returns 429

Test: "GET /api/v1/agency-tools/openapi.json returns valid OpenAPI 3.0 spec"
- Mock 2 tools for the tenant with isExposedAsApi=true
- Send GET request with valid API key
- Assert response contains openapi: "3.0.3"
- Assert paths include /api/v1/agency-tools/{tool1Id}/execute and /api/v1/agency-tools/{tool2Id}/execute
- Assert each path has POST operation with requestBody matching tool's inputSchema
- Assert security schemes match existing public API pattern

Test: "GET /api/v1/agency-tools/openapi.json excludes non-exposed tools"
- Mock 1 exposed tool and 1 non-exposed tool
- Assert only the exposed tool appears in the generated spec

Test: "GET /api/v1/agency-tools/openapi.json returns empty paths for tenant with no exposed tools"
- Mock tenant with no exposed tools
- Assert paths object is empty, no 500 error
```

### Vitest Tests — Toggle Exposure tRPC

These tests should be added to the existing agency router test file or a new dedicated file:

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyToolExposure.test.ts`

```
Test: "toggleToolExposure sets isExposedAsApi to true"
- Call toggleToolExposure with toolId and exposed=true
- Assert tool record updated with isExposedAsApi=true

Test: "toggleToolExposure sets isExposedAsApi to false"
- Call with exposed=false
- Assert tool record updated with isExposedAsApi=false

Test: "toggleToolExposure rejects cross-tenant tool"
- Attempt to toggle a tool belonging to a different tenant
- Assert TRPCError with code FORBIDDEN

Test: "toggleToolExposure requires AGENCY_TOOL_API_ENABLED feature flag"
- Mock feature flag as disabled
- Assert TRPCError with code FORBIDDEN and message mentioning feature flag
```

---

## Implementation Guidance

### Part A: Tool Progress Streaming (Python)

#### 1. Extend `_make_run_func` in `agency_tools.py`

The existing `_make_run_func` closure at `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` creates the function that bridges tool calls to HTTP endpoints. It currently accepts `tool_config` and `whitelist`. Extend its signature to also accept optional `emitter` (AgencyEventEmitter or None) and `run_id` (str or None).

Inside the closure, define a nested `emit_progress(message: str, percent: int | None = None)` function that:
- Returns immediately if `emitter` is None (non-streaming context)
- Builds a `tool_progress` event payload: `{ "toolCallId": tool_config.tool_id, "message": message, "percent": percent }` (omit `percent` key if None)
- Calls `emitter.emit("tool_progress", payload)` to publish to the Redis SSE channel

Make `emit_progress` available within the `run_func` closure scope so tool execution code can call it at key points.

#### 2. Add Progress to Builtin Tools

Within the `run_func` body (or in the HTTP call wrapper), add `emit_progress()` calls before/after the HTTP request for slow builtin tools:

| Builtin Tool ID | Progress Messages |
|-----------------|-------------------|
| `builtin-web-search` | "Searching..." before call, "Processing {N} results..." after |
| `builtin-browser` | "Navigating to {url}..." before call, "Taking screenshot..." mid-flow |
| `builtin-rag-knowledge` | "Querying knowledge base..." before call, "Found {N} documents..." after |
| `builtin-skill-executor` | "Executing skill {name}..." before call, "Generating output..." mid-flow |

The progress messages are informational strings. Use the tool_id to determine which messages to emit inside the existing `run_func` closure (a simple `if tool_config.tool_id == "builtin-web-search":` pattern before and after the HTTP call).

#### 3. Wire Emitter Through Orchestrator

In `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`, when resolving tools for a node execution, pass the `AgencyEventEmitter` instance and `run_id` through to `_make_run_func`. The emitter is already available in the orchestrator context (from section-09). For non-streaming runs (no emitter), pass `None` -- the emit_progress becomes a no-op.

### Part B: Standalone Tool API (Node.js)

#### 1. Express Route File

Create `/home/dev/projects/SmartSpecPro/apps/web/server/routes/agencyToolsApi.ts` with:

- `registerAgencyToolsApiRoutes(app: Express): void` — exported function called from `_core/index.ts`
- Use the existing `apiKeyAuthMiddleware` from `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/apiKeyAuth.ts`
- Use `requireScopes("agency:tool:execute")` from `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/requireScopes.ts`

#### 2. POST `/api/v1/agency-tools/:toolId/execute`

Handler logic:
1. Extract `toolId` from params, request body as input
2. Query `agencyTools` table for the tool where `id = toolId` AND `isExposedAsApi = true` AND `isEnabled = true`
3. If not found, return 404
4. Verify `tool.tenantId === req.auth.tenantId` for tenant isolation. Return 403 if mismatch
5. Check `AGENCY_TOOL_API_ENABLED` feature flag (use `getFeatureFlag` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts`). Return 403 if disabled
6. Validate request body against `tool.inputSchema` using Ajv (already used in the codebase). Return 400 with validation errors if invalid
7. Execute the tool by making an HTTP call to the tool's endpoint (same pattern as Python ToolBridge but from Node.js). Use the tool's `config`, `httpMethod`, and decrypted headers from `headersEncrypted`
8. Return the tool execution result as JSON

Rate limiting: Apply 100 req/min per API key. Use BullMQ rate limiter or a simple sliding-window counter in Redis keyed by `agency-tool-api:{keyHash}` with 60-second TTL.

#### 3. GET `/api/v1/agency-tools/openapi.json`

Handler logic:
1. Authenticate with API key (same middleware)
2. Query all tools where `tenantId = req.auth.tenantId` AND `isExposedAsApi = true` AND `isEnabled = true`
3. Build an OpenAPI 3.0.3 spec dynamically:
   - `info.title`: "SmartSpecPro Agency Tools API"
   - `info.version`: "1.0.0"
   - `servers`: `[{ url: "https://smartaihub.app" }]`
   - `security`: Same schemes as existing public API (bearerAuth + apiKeyHeader)
   - For each exposed tool, create a path entry: `POST /api/v1/agency-tools/{toolId}/execute`
     - `summary`: tool name
     - `description`: tool description
     - `requestBody.content.application/json.schema`: tool's `inputSchema`
     - `responses.200.content.application/json.schema`: tool's `outputSchema` (or generic `{ type: "object" }` if none)
     - `responses.400/401/403/429`: standard error responses (reuse pattern from `publicDocsApi.ts`)
4. Return the spec as JSON with `Content-Type: application/json`

Follow the pattern established in `/home/dev/projects/SmartSpecPro/apps/web/server/routes/publicDocsApi.ts` for response structure, security schemes, and error response components.

#### 4. Register Routes

In `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`, import and call `registerAgencyToolsApiRoutes(app)` alongside the existing route registrations. Place it after the API key auth middleware is applied to `/v1/*` routes.

#### 5. tRPC Toggle Mutation

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`, add a `toggleToolExposure` mutation:
- Input: `{ toolId: z.string().uuid(), exposed: z.boolean() }`
- Auth: require admin role or tool owner
- Check `AGENCY_TOOL_API_ENABLED` feature flag
- Check tool belongs to caller's tenant
- Update `agencyTools` set `isExposedAsApi = exposed` where `id = toolId`
- Return `{ success: true }`

---

## Security Considerations

1. **Tenant isolation is mandatory**: Every tool execution request must verify `tool.tenantId === apiKey.tenantId`. This is the primary security boundary.
2. **SSRF on tool execution**: The standalone API calls the tool's endpoint URL. Reuse the SSRF validation from `agency_tools.py` / section-02. Validate the URL at execution time (not just at tool creation) in case the URL was updated.
3. **Input validation**: Always validate the request body against `tool.inputSchema` before executing. Use Ajv with `allErrors: true` for detailed error messages.
4. **Rate limiting**: 100 req/min per API key, enforced via Redis sliding window. Return 429 with `Retry-After` header.
5. **Header decryption**: Tool headers stored in `headersEncrypted` must be decrypted server-side only. Never return decrypted headers in any API response.
6. **OpenAPI spec does not leak sensitive data**: The generated spec contains only tool names, descriptions, and schemas -- no endpoints, headers, or internal config.
7. **Feature flag guard**: Both the standalone API routes and the tRPC toggle mutation must check `AGENCY_TOOL_API_ENABLED`. If the flag is off, return 403 with a clear message.

---

## Integration Notes

- The `tool_progress` SSE event type is consumed by the frontend `useAgencyStream` hook (section-10). No additional frontend work is needed in this section -- the hook already renders events by type. The `tool_progress` event will appear as an inline status indicator below the tool call in the streaming UI.
- The standalone tool API is independent of the agency streaming system. It provides a synchronous request-response interface to execute individual tools without running an agency.
- The OpenAPI spec at `/api/v1/agency-tools/openapi.json` is separate from the main public API spec at `/v1/openapi.json`. They serve different audiences: the main spec covers the full SmartSpecPro API, while the agency tools spec is tenant-specific (only shows that tenant's exposed tools).