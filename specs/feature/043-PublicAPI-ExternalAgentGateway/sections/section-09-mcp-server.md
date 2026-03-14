# Section 09 -- MCP Server (Model Context Protocol)

## Overview

This section implements an MCP Streamable HTTP server at `POST /v1/mcp` following the MCP v2025-03-26 specification. The server exposes SmartSpecPro capabilities as MCP tools that external AI agents (Manus AI, Claude Desktop, Cursor, etc.) can discover and invoke programmatically. A companion discovery endpoint at `GET /.well-known/mcp.json` advertises the server to MCP-compatible clients.

The existing MCP infrastructure at `/api/mcp/*` (file: `apps/web/server/_core/mcpRoutes.ts`) provides workspace and drive tools using a custom REST protocol. The new `/v1/mcp` endpoint follows the official MCP Streamable HTTP transport spec with JSON-RPC 2.0 framing, session management, and a comprehensive tool registry spanning all SmartSpecPro domains.

### Dependencies

- **section-03-auth-extension** -- API key authentication via `authorizeRequest()` must support `sk-ssp_` prefix and return `AuthContext` with `mode: 'api_key'` and scopes. The `requireScopes` middleware must be available.
- The `api_keys` table (section-01) must exist for key validation.
- Redis must be available for session state management (existing `getRedisClient()` from `apps/web/server/services/redis.ts`).

### Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/_core/mcpPublicServer.ts` | MCP Streamable HTTP handler, session management, tool registry |
| `apps/web/server/_core/__tests__/mcpPublicServer.test.ts` | Tests for protocol, sessions, tools, discovery |

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/_core/index.ts` | Mount `POST /v1/mcp` and `GET /.well-known/mcp.json` routes |

---

## Tests

All tests go in `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`. Use Vitest. Tests should mock Redis and service-layer dependencies.

### Protocol Tests

```
Test: POST /v1/mcp with initialize method returns server capabilities
  - Send JSON-RPC request: { jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } }, id: 1 }
  - Expect 200 response with JSON-RPC result containing serverInfo.name, protocolVersion, capabilities.tools, and a session ID in the Mcp-Session-Id response header

Test: POST /v1/mcp with tools/list returns 25+ tools
  - Initialize a session first, then send tools/list request with Mcp-Session-Id header
  - Expect result.tools array with length >= 25
  - Each tool must have name (string), description (string), inputSchema (object)

Test: POST /v1/mcp with tools/call executes tool and returns result
  - Initialize session, then call tools/call with name: "smartspec.skills.list" and arguments: {}
  - Expect result with content array containing at least one item

Test: POST /v1/mcp rejects invalid JSON-RPC format
  - Send body without jsonrpc field
  - Expect JSON-RPC error response with code -32600 (Invalid Request)

Test: POST /v1/mcp requires API key with mcp:read or mcp:write scope
  - Send request without Authorization header
  - Expect 401 response
  - Send request with API key lacking mcp:* scopes
  - Expect 403 response
```

### Session Management Tests

```
Test: initialize creates Redis session with 30-min TTL
  - After successful initialize, verify Redis SET was called with key pattern "mcp:session:{id}" and EX 1800
  - Session value should contain state: "ready", tenantId, userId, createdAt

Test: subsequent requests require Mcp-Session-Id header
  - Send tools/list WITHOUT Mcp-Session-Id header (and without initialize method)
  - Expect JSON-RPC error with message indicating session required

Test: expired session returns error
  - Mock Redis GET to return null (simulating expired key)
  - Send tools/list with a stale Mcp-Session-Id
  - Expect JSON-RPC error with message "Session expired or invalid"

Test: failed initialize transitions to error state
  - Mock an internal error during initialize (e.g., Redis write failure)
  - Expect JSON-RPC error response
  - Verify session is NOT created in Redis
```

### Tool Registry Tests

```
Test: each tool has valid inputSchema
  - Call tools/list after initialize
  - For every tool in the response, verify inputSchema has type: "object" and properties is an object

Test: tool call enforces scope requirement (e.g., skills:execute for smartspec.skills.execute)
  - Initialize with API key that has mcp:read but NOT skills:execute
  - Call tools/call with name: "smartspec.skills.execute"
  - Expect JSON-RPC error indicating insufficient scope

Test: tool call timeout at 60s
  - Mock the underlying service function to hang (never resolve)
  - Call tools/call
  - Expect error result after 60s timeout (or mock timer to fast-forward)

Test: tool result > 100KB is truncated/rejected
  - Mock a tool to return a result exceeding 100KB
  - Expect the response to contain a truncation notice or error
```

### MCP Discovery Tests

```
Test: GET /.well-known/mcp.json returns valid manifest
  - Send GET request to /.well-known/mcp.json
  - Expect 200 with Content-Type application/json
  - Body must contain name, url, auth.type, capabilities.tools

Test: manifest contains correct server URL and auth type
  - Verify url equals "https://smartaihub.app/v1/mcp"
  - Verify auth.type equals "bearer"
  - Verify docs field is present
```

---

## Implementation Details

### 1. MCP Streamable HTTP Handler

Create `apps/web/server/_core/mcpPublicServer.ts`.

The handler receives `POST /v1/mcp` with a JSON-RPC 2.0 body and dispatches based on the `method` field:

**Supported methods:**
- `initialize` -- Creates a new session, returns server capabilities
- `tools/list` -- Returns the full tool registry
- `tools/call` -- Executes a tool by name with provided arguments

**Request format (JSON-RPC 2.0):**
```typescript
interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id: string | number;
}
```

**Response format:**
```typescript
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
```

**Error codes (standard JSON-RPC 2.0):**
- `-32700` Parse error
- `-32600` Invalid Request (missing jsonrpc or method)
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error

**Authentication:** Before dispatching, the handler must call `authorizeRequest(req, { allowBearer: true, allowSession: false })`. API key must have at least `mcp:read` scope. For tool calls that perform mutations (execute, invoke, generate), the handler checks if the tool requires `mcp:write` scope additionally.

**Credit tracking:** Tool calls that consume credits must deduct with source `api_mcp` and set `X-Credits-Used` / `X-Credits-Remaining` headers on the response. Credit deduction is **delegated to the underlying service functions** (e.g., `skillExecutor.executeSkill()` internally calls `creditService.deductCredits()`). The MCP handler overrides the `sourceType` by passing `"api_mcp"` through the call chain. Tools that consume credits:
- `smartspec.skills.execute` — credits deducted per LLM call inside skill executor
- `smartspec.agencies.invoke` — credits deducted per agent step inside agency bridge
- `smartspec.media.generate_image/video/audio` — credits deducted by media generation service
- `smartspec.presentations.create` — credits deducted per LLM call inside draft generator
- `smartspec.video_projects.create` — credits deducted based on duration × quality tier
- `smartspec.llm.chat` — credits deducted per LLM call
- `smartspec.jobs.submit` — credits reserved upfront, refunded on partial use

Read-only tools (`*.list`, `*.status`, `*.detect`, `smartspec.files.*`, `smartspec.drive.*`) do NOT consume credits.

### 2. Session State Machine

Sessions are stored in Redis with key pattern `mcp:session:{sessionId}`.

**Session lifecycle:**
1. Client sends `initialize` -- server generates a UUID session ID, stores session in Redis with 30-minute TTL, returns capabilities and session ID in `Mcp-Session-Id` response header
2. Client sends subsequent requests with `Mcp-Session-Id` header -- server loads session from Redis, refreshes TTL on each request (sliding window), dispatches method
3. Session auto-expires after 30 minutes of inactivity (Redis TTL handles this)

**Session data shape:**
```typescript
interface McpSession {
  state: "ready" | "error";
  tenantId: string;
  userId: number;
  apiKeyId: string;
  scopes: string[];
  createdAt: string; // ISO timestamp
}
```

**State transitions:**
- `initialize` succeeds -> state is `ready`
- `initialize` fails (internal error) -> no session stored, error returned
- Any tool call while `ready` -> stays `ready` (tool errors do not kill the session)
- Redis TTL expires -> session is gone, next request gets "Session expired" error

**The `initialize` method is the only method that does not require an existing session.** All other methods require the `Mcp-Session-Id` header to look up a valid session.

**Implementation note:** Use `getRedisClient()` from `apps/web/server/services/redis.ts`. If Redis is unavailable, return a JSON-RPC internal error rather than crashing.

### 3. Tool Registry

The tool registry is a static array of tool definitions, each mapping to a service-layer function. Define the registry as a constant in `mcpPublicServer.ts`.

**Tool definition shape:**
```typescript
interface McpToolDef {
  name: string;            // Namespaced: "smartspec.skills.list"
  description: string;
  inputSchema: object;     // JSON Schema for parameters
  requiredScope: string;   // Scope the API key must have
}
```

**Full tool list (25+ tools across all namespaces):**

| Tool Name | Description | Required Scope | Delegates To |
|-----------|-------------|----------------|--------------|
| `smartspec.skills.list` | List available skills | `skills:list` | `skillRegistry.getSkills()` |
| `smartspec.skills.execute` | Execute a skill | `skills:execute` | `skillExecutor.executeSkill()` |
| `smartspec.skills.detect` | Detect skill from prompt | `skills:execute` | skill detection logic |
| `smartspec.agencies.list` | List agencies | `agencies:list` | agencies query |
| `smartspec.agencies.invoke` | Invoke an agency | `agencies:invoke` | `agencyBridge.executeRun()` |
| `smartspec.agencies.status` | Check run status | `agencies:invoke` | run status query |
| `smartspec.llm.chat` | Chat completion | `llm:chat` | LLM gateway |
| `smartspec.llm.embed` | Text embedding | `llm:chat` | embedding service |
| `smartspec.llm.models` | List available models | `llm:chat` | model registry |
| `smartspec.media.generate_image` | Generate image | `media:generate` | media generation service |
| `smartspec.media.generate_video` | Generate video | `media:generate` | media generation service |
| `smartspec.media.generate_audio` | Generate audio/TTS | `media:generate` | media generation service |
| `smartspec.media.status` | Check media task status | `media:generate` | task status query |
| `smartspec.presentations.create` | Generate presentation | `presentations:create` | presentation service |
| `smartspec.presentations.list` | List presentations | `presentations:create` | presentation query |
| `smartspec.presentations.export` | Export presentation | `presentations:create` | export service |
| `smartspec.presentations.download` | Download export | `presentations:create` | file download |
| `smartspec.video_projects.create` | Create video project | `video_projects:create` | video project service |
| `smartspec.video_projects.list` | List video projects | `video_projects:create` | video project query |
| `smartspec.video_projects.export` | Export video project | `video_projects:create` | export service |
| `smartspec.jobs.submit` | Submit automation job | `jobs:create` | `jobAutomationService` |
| `smartspec.jobs.status` | Check job status | `jobs:read` | job status query |
| `smartspec.jobs.cancel` | Cancel a job | `jobs:create` | job cancel |
| `smartspec.files.read` | Read workspace file | `mcp:read` | workspace file read (reuse existing `callTool` from mcpRoutes.ts) |
| `smartspec.files.list` | List workspace files | `mcp:read` | workspace directory listing |
| `smartspec.drive.search` | Search drive files | `mcp:read` | Python backend drive tools |
| `smartspec.drive.read` | Read drive file | `mcp:read` | Python backend drive tools |
| `smartspec.browser.execute_actions` | Execute browser actions | `mcp:write` | browser action executor |

**Tool execution flow:**
1. Parse `tools/call` params: extract `name` and `arguments`
2. Look up tool definition in registry by name
3. Validate that the session's scopes include the tool's `requiredScope`
4. Validate `arguments` against the tool's `inputSchema` (use a lightweight JSON Schema validator or Zod)
5. Execute the tool's handler function with a 60-second timeout (use `Promise.race` with a timeout promise)
6. If result size exceeds 100KB (checked via `JSON.stringify(result).length`), return a truncated error response indicating the result was too large
7. Return result in MCP format: `{ content: [{ type: "text", text: "..." }] }`

**Reusing existing infrastructure:** For `smartspec.files.*` and `smartspec.drive.*` tools, delegate to the existing implementations in `apps/web/server/_core/mcpRoutes.ts` (`callTool` function and `forwardToolCallToPython`). Import or refactor these to be callable from the new MCP server.

### 3a. Tool-to-Scope Mapping with inputSchema Summaries

This table provides the authoritative scope requirement and input parameters for each MCP tool. Implementers should use this as the source of truth for the tool registry.

| Tool Name | Required Scope | inputSchema Properties | Read/Write |
|-----------|---------------|----------------------|------------|
| `smartspec.skills.list` | `skills:list` | `{ category?: string, search?: string, page?: int, limit?: int }` | Read |
| `smartspec.skills.execute` | `skills:execute` | `{ skill_id: string, inputs: object, model?: string }` | Write |
| `smartspec.skills.detect` | `skills:execute` | `{ prompt: string }` | Read |
| `smartspec.agencies.list` | `agencies:list` | `{ page?: int, limit?: int }` | Read |
| `smartspec.agencies.invoke` | `agencies:invoke` | `{ agency_id: string, message: string, conversation_id?: string, max_credits?: int }` | Write |
| `smartspec.agencies.status` | `agencies:invoke` | `{ agency_id: string, run_id: string }` | Read |
| `smartspec.llm.chat` | `llm:chat` | `{ messages: array, model?: string, max_tokens?: int, temperature?: number }` | Write |
| `smartspec.llm.embed` | `llm:chat` | `{ text: string, model?: string }` | Read |
| `smartspec.llm.models` | `llm:chat` | `{}` | Read |
| `smartspec.media.generate_image` | `media:generate` | `{ prompt: string, model?: string, width?: int, height?: int, reference_image_urls?: string[] }` | Write |
| `smartspec.media.generate_video` | `media:generate` | `{ prompt: string, model?: string, duration_seconds?: number }` | Write |
| `smartspec.media.generate_audio` | `media:generate` | `{ text: string, voice?: string, model?: string }` | Write |
| `smartspec.media.status` | `media:generate` | `{ task_id: string }` | Read |
| `smartspec.presentations.create` | `presentations:create` | `{ prompt: string, slide_count?: int, style?: string }` | Write |
| `smartspec.presentations.list` | `presentations:create` | `{ page?: int, limit?: int }` | Read |
| `smartspec.presentations.export` | `presentations:create` | `{ deck_id: int, format?: string }` | Write |
| `smartspec.presentations.download` | `presentations:create` | `{ deck_id: int }` | Read |
| `smartspec.video_projects.create` | `video_projects:create` | `{ title: string, duration_minutes: number, quality?: string }` | Write |
| `smartspec.video_projects.list` | `video_projects:create` | `{ page?: int, limit?: int }` | Read |
| `smartspec.video_projects.export` | `video_projects:create` | `{ project_id: string }` | Write |
| `smartspec.jobs.submit` | `jobs:create` | `{ type: string, params: object, max_credits?: int }` | Write |
| `smartspec.jobs.status` | `jobs:read` | `{ job_id: string }` | Read |
| `smartspec.jobs.cancel` | `jobs:create` | `{ job_id: string }` | Write |
| `smartspec.files.read` | `mcp:read` | `{ path: string }` | Read |
| `smartspec.files.list` | `mcp:read` | `{ path?: string }` | Read |
| `smartspec.drive.search` | `mcp:read` | `{ query: string }` | Read |
| `smartspec.drive.read` | `mcp:read` | `{ file_id: string }` | Read |
| `smartspec.browser.execute_actions` | `mcp:write` | `{ actions: array }` | Write |

**Scope enforcement rule:** Read tools require the base scope (e.g., `skills:list`). Write tools additionally require `mcp:write` in the session scopes. The handler checks: `session.scopes.includes(tool.requiredScope) && (tool.readWrite === "Read" || session.scopes.includes("mcp:write"))`.

### 4. MCP Discovery Manifest

Add a `GET /.well-known/mcp.json` route that returns a static JSON document:

```json
{
  "name": "SmartSpecPro",
  "url": "https://smartaihub.app/v1/mcp",
  "auth": { "type": "bearer" },
  "capabilities": { "tools": true },
  "docs": "https://smartaihub.app/v1/docs"
}
```

This is a simple static response with `Content-Type: application/json`. No authentication required.

### 5. Route Mounting

In `apps/web/server/_core/index.ts`, add two route registrations:

1. `app.post("/v1/mcp", mcpPublicHandler)` -- The main MCP endpoint. Apply the API key auth middleware and rate limiter before the handler.
2. `app.get("/.well-known/mcp.json", mcpDiscoveryHandler)` -- The discovery manifest. No auth required.

The `/v1/mcp` route should go through the same middleware stack as other `/v1/*` public API routes (CORS headers, rate limiting, audit logging) that are set up in section-04.

### 6. Security Considerations

- **Scope enforcement per tool:** Every tool call checks the session's scopes against the tool's `requiredScope`. An API key with only `mcp:read` cannot call `smartspec.skills.execute` (which requires `skills:execute`).
- **Tenant isolation:** The session stores `tenantId` from the authenticated API key. All service-layer calls must pass this tenantId to ensure queries are scoped.
- **Timeout protection:** 60-second timeout prevents runaway tool executions from holding connections indefinitely.
- **Result size limit:** 100KB cap prevents accidentally returning massive payloads (e.g., full presentation data with base64 images) that could cause memory issues on the client or network.
- **No session enumeration:** Session IDs are random UUIDs. The endpoint returns the same error for invalid and expired sessions ("Session expired or invalid").
- **Feature flag:** The `publicApi` tenant feature flag is checked during API key authentication (handled by section-03). If the flag is disabled, the API key is rejected before reaching the MCP handler.

### 7. Export Structure

The main export from `mcpPublicServer.ts` should be a function like:

```typescript
export function registerMcpPublicRoutes(app: Express): void
```

This function registers the `POST /v1/mcp` and `GET /.well-known/mcp.json` routes on the Express app. It is called from `index.ts` during server startup.
