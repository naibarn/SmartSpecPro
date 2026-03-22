Now I have enough context. Let me produce the section content.

# Section 14 — MCP Integration

## Overview

This section implements bidirectional MCP (Model Context Protocol) integration for the agency system. It covers two distinct capabilities:

1. **Expose agency tools as MCP server endpoints** -- external MCP clients can discover and call tools belonging to an agency via the existing `mcpPublicServer.ts` JSON-RPC pattern.
2. **Connect external MCP servers to agents** -- agents can consume tools from remote MCP servers at runtime, using the `mcpServers` and `mcpServerTokensEncrypted` columns added in section-01.

A frontend panel lets builders add/remove MCP server connections per agent and discover available tools before saving.

All MCP functionality is gated behind the `AGENCY_MCP_BRIDGE_ENABLED` feature flag (section-23).

## Dependencies

| Section | What It Provides |
|---------|-----------------|
| section-01-database-migration | `agencyAgents.mcpServers` (JSONB), `agencyAgents.mcpServerTokensEncrypted` (text) columns |
| section-02-custom-tools-backend | Custom tool CRUD patterns, `agencyTools` table extensions, SSRF guard usage |

## Blocked Sections

None. This section does not block any other section.

---

## Files to Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpPublicServer.ts` | Add agency-scoped tool listing and tool execution entries to `TOOL_REGISTRY`, plus handler logic |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Add `saveMcpServers` and `discoverMcpTools` tRPC procedures |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` | Add `resolve_mcp_tools_for_agent()` to discover and bridge external MCP tools at runtime |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add "MCP Servers" tab rendering |

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyMcpIntegration.test.ts` | Vitest tests for MCP server exposure and tRPC procedures |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_agency_mcp_tools.py` | pytest tests for external MCP tool discovery and bridging |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyMcpService.ts` | Service layer for MCP-related operations (tool formatting, token encryption) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/McpServersPanel.tsx` | Frontend panel for managing MCP server connections per agent |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/mcp_client.py` | Async MCP client for tool discovery from external servers |

---

## TDD: Tests to Write First

### Vitest Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyMcpIntegration.test.ts`

```
Test: "MCP endpoint returns agency tools in MCP tool format"
- Mock DB to return an agency with 2 tools (1 builtin, 1 custom)
- Call the MCP JSON-RPC handler with method "tools/list" and params { agency_id: "agency-1" }
- Assert response contains 2 tool definitions each with name, description, inputSchema
- Assert tool names are prefixed: "agency.{agencyId}.{toolName}"

Test: "MCP tool execution routes through existing tool bridge"
- Mock DB to return a valid agency + tool
- Call the MCP JSON-RPC handler with method "tools/call" and params { name: "agency.abc.my_tool", arguments: { query: "test" } }
- Assert the call was forwarded to the Python backend tool execution endpoint
- Assert the result is returned in MCP format { content: [{ type: "text", text: "..." }] }

Test: "MCP endpoint requires agency:tools:mcp scope"
- Attempt MCP tools/list without the "agency:tools:mcp" scope in the API key
- Assert 403 / permission denied error

Test: "MCP endpoint enforces tenant isolation"
- Mock API key for tenant-A, request tools for agency belonging to tenant-B
- Assert 404 or 403 error (agency not found for this tenant)

Test: "saveMcpServers encrypts tokens before storage"
- Call saveMcpServers with mcpServers config containing a token
- Assert agencyAgents.mcpServerTokensEncrypted is set to a non-plaintext value
- Assert decrypt(stored value) matches the original token

Test: "saveMcpServers validates MCP server URLs against SSRF"
- Call saveMcpServers with a URL pointing to 169.254.169.254 (metadata endpoint)
- Assert input validation error (SSRF blocked)
- Call with a URL pointing to 127.0.0.1
- Assert input validation error (SSRF blocked)

Test: "saveMcpServers validates URL format"
- Call with URL missing scheme (no https://)
- Assert validation error
- Call with valid https:// URL
- Assert success

Test: "saveMcpServers enforces max 5 MCP servers per agent"
- Call with 6 MCP server entries
- Assert validation error ("maximum 5 MCP servers per agent")

Test: "discoverMcpTools returns tool list from external MCP server"
- Mock HTTP call to external MCP server returning tools/list response
- Call discoverMcpTools with a valid MCP server URL
- Assert returned tool list contains name + description + inputSchema for each tool

Test: "discoverMcpTools respects 10-second timeout"
- Mock HTTP call that hangs for 15 seconds
- Assert discoverMcpTools returns timeout error
```

### pytest Tests

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/services/test_agency_mcp_tools.py`

```
Test: "resolve_mcp_tools_for_agent returns empty list when agent has no mcpServers"
- Agent config with mcpServers=None
- Assert resolve_mcp_tools_for_agent returns []

Test: "resolve_mcp_tools_for_agent discovers tools from external MCP server"
- Mock httpx POST to MCP server URL returning tools/list with 3 tools
- Call resolve_mcp_tools_for_agent with mcpServers=[{url: "https://mcp.example.com", name: "ext"}]
- Assert 3 tool bridge classes returned, each with correct name prefixed "mcp_ext_{tool_name}"

Test: "resolve_mcp_tools_for_agent decrypts tokens and sends Bearer header"
- Provide encrypted token via mcpServerTokensEncrypted
- Mock httpx to capture request headers
- Assert Authorization: Bearer {decrypted_token} was sent

Test: "resolve_mcp_tools_for_agent skips server on connection error (no crash)"
- Mock httpx to raise ConnectError for one server, succeed for another
- Assert only tools from the successful server are returned
- Assert warning logged for failed server

Test: "resolve_mcp_tools_for_agent validates server URL against SSRF"
- Provide mcpServers with url pointing to 10.0.0.1
- Assert the server is skipped (SSRF blocked) and warning logged

Test: "MCP tool bridge calls external server tools/call on run()"
- Create a tool bridge via resolve_mcp_tools_for_agent
- Call tool.run() with input arguments
- Assert httpx POST was made to the MCP server with method "tools/call" and correct params

Test: "MCP tool bridge handles error response from external server"
- Mock external server returning JSON-RPC error { error: { code: -1, message: "not found" } }
- Assert tool.run() returns descriptive error string (not exception)

Test: "MCP tool bridge enforces per-call timeout of 30 seconds"
- Mock httpx to hang
- Assert tool.run() returns timeout error after 30 seconds

Test: "tool discovery caches results for 60 seconds"
- Call resolve_mcp_tools_for_agent twice with same config within 60s
- Assert httpx tools/list was called only once
```

---

## Implementation Details

### 1. Expose Agency Tools as MCP Server Endpoint

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/_core/mcpPublicServer.ts`

Add two new tools to the `TOOL_REGISTRY` array:

- `smartspec.agency.tools.list` -- Lists all tools available in a given agency (builtin + custom + shared). Required scope: `agency:tools:mcp`. Input: `{ agency_id: string }`. Returns tools formatted as MCP tool definitions (name, description, inputSchema).

- `smartspec.agency.tools.call` -- Executes a specific tool within an agency context. Required scope: `agency:tools:mcp`. Input: `{ agency_id: string, tool_name: string, arguments: object }`. Proxies to the Python backend tool execution endpoint and returns MCP-formatted result `{ content: [{ type: "text", text: "..." }] }`.

The handler logic should:
1. Verify tenant isolation: the agency must belong to the same tenant as the API key.
2. Load agency tools via the existing `agencyAgentTools` + `agencyTools` queries from `agency.ts`.
3. For `tools.call`: proxy to `POST {PYTHON_BACKEND_URL}/api/internal/agency/tool/execute` with the tool ID and arguments, then wrap the response in MCP format.

### 2. Agency MCP Service

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyMcpService.ts`

Service with the following exports:

- `formatToolsAsMcp(tools: AgencyTool[]): McpToolDef[]` -- Converts internal tool records to MCP tool definition format. Each tool gets a namespaced name: `agency.{agencyId}.{toolId}`.

- `encryptMcpTokens(tokens: Record<string, string>): string` -- Uses `encrypt()` from `crypto.ts` to encrypt a JSON-stringified token map. Key format: `{ serverUrl: token }`.

- `decryptMcpTokens(encrypted: string): Record<string, string>` -- Uses `decrypt()` from `crypto.ts` to recover plaintext token map.

- `validateMcpServerUrl(url: string): { valid: boolean; error?: string }` -- Validates URL format (must be `https://` in production, `http://localhost` allowed in dev only) and runs SSRF checks (block private IPs, metadata endpoints, localhost in production). Uses the same patterns as custom tool URL validation from section-02.

### 3. tRPC Procedures

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Add two new procedures:

**`saveMcpServers`** -- Protected mutation.
- Input Zod schema:
  ```
  z.object({
    agentId: z.string().uuid(),
    mcpServers: z.array(z.object({
      url: z.string().url(),
      name: z.string().max(50).optional(),
      transport: z.enum(["http", "sse"]).default("http"),
    })).max(5),
    tokens: z.record(z.string(), z.string()).optional(),  // { serverUrl: bearerToken }
  })
  ```
- Validate each URL via `validateMcpServerUrl()`.
- Encrypt tokens via `encryptMcpTokens()` if provided.
- Update `agencyAgents` row: set `mcpServers` and `mcpServerTokensEncrypted`.
- Verify agent belongs to caller's tenant.

**`discoverMcpTools`** -- Protected query.
- Input: `z.object({ serverUrl: z.string().url(), token: z.string().optional() })`
- Validate URL via `validateMcpServerUrl()`.
- Make JSON-RPC call to `{serverUrl}/rpc` with method `tools/list`.
- Include `Authorization: Bearer {token}` header if token provided.
- Timeout: 10 seconds.
- Return array of `{ name: string, description: string, inputSchema: object }`.

### 4. Python: External MCP Tool Resolution

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/mcp_client.py`

Async MCP client module:

- `async def discover_tools(server_url: str, token: str | None, timeout: float = 10.0) -> list[McpToolInfo]` -- Sends JSON-RPC `tools/list` request to the server. Returns parsed tool definitions. Handles connection errors gracefully (returns empty list + logs warning).

- `McpToolInfo` dataclass: `name: str`, `description: str`, `input_schema: dict`.

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

Add function:

- `async def resolve_mcp_tools_for_agent(agent_config: dict, adapter=None) -> list[type]` -- Reads `mcpServers` from agent config. Decrypts tokens from `mcpServerTokensEncrypted` using `smartspecweb_crypto.decrypt_smartspecweb()`. For each server: validates URL with SSRF guard, discovers tools, creates tool bridge classes via `adapter.create_tool_class()`. Tool names prefixed with `mcp_{server_name}_{tool_name}`. Caches discovered tools per server URL for 60 seconds (in-memory dict with TTL).

Each MCP tool bridge wraps a `run_func` that:
1. Sends JSON-RPC `tools/call` to the external server with `Authorization: Bearer {token}`.
2. Parses the MCP response and returns the text content.
3. Enforces 30-second per-call timeout.
4. Returns descriptive error string on failure (no exception propagation).

This function is called from the existing `resolve_tools_for_agent()` function, which should be extended to also call `resolve_mcp_tools_for_agent()` and merge the results with builtin + custom tools.

### 5. Frontend: MCP Servers Panel

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/McpServersPanel.tsx`

React component rendered as a tab in `NodePropertyPanel.tsx` when the selected node is an agent or supervisor.

UI elements:
- List of configured MCP servers (name, URL, connection status indicator).
- "Add Server" button opening an inline form: URL input, optional name, optional bearer token (password field).
- "Discover Tools" button per server: calls `discoverMcpTools` tRPC query and displays discovered tool names in a collapsible list.
- "Remove" button per server with confirmation.
- Save triggers `saveMcpServers` mutation.
- Max 5 servers displayed; "Add" button disabled at limit.

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx`

Add conditional tab: when `selectedNode.data.nodeType === "agent" || selectedNode.data.nodeType === "supervisor"`, render an "MCP Servers" tab that mounts `<McpServersPanel agentId={selectedNode.id} />`.

### 6. Feature Flag Guard

All MCP-related procedures and UI components must check `AGENCY_MCP_BRIDGE_ENABLED`:

- **Backend**: tRPC procedures `saveMcpServers` and `discoverMcpTools` should check the flag early and throw `TRPCError({ code: "FORBIDDEN" })` if disabled.
- **MCP public server**: The `smartspec.agency.tools.list` and `smartspec.agency.tools.call` handlers should check the flag and return a JSON-RPC error if disabled.
- **Frontend**: `McpServersPanel` should call `useTenantFeatureFlag("AGENCY_MCP_BRIDGE_ENABLED")` and render a disabled state with explanatory text if the flag is off.
- **Python**: `resolve_mcp_tools_for_agent()` should check `os.environ.get("AGENCY_MCP_BRIDGE_ENABLED", "false")` and return empty list if disabled.

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| SSRF via MCP server URLs | Validate all URLs with `validateMcpServerUrl()` -- block private IPs (10.x, 172.16-31.x, 192.168.x), metadata endpoints (169.254.x), localhost (in production) |
| Token exposure | Tokens encrypted at rest via `crypto.ts` AES-256-GCM in `mcpServerTokensEncrypted` column. Never returned in plaintext from API responses -- return `configured: true` instead |
| Tenant isolation | MCP tool listing enforces `agency.tenantId === apiKey.tenantId`. Agent MCP config only editable by agency owner's tenant |
| External server trust | Tool responses from external MCP servers treated as untrusted -- output truncated at 10KB, no code execution, content sanitized before injection into agent context |
| Rate limiting | `discoverMcpTools` rate limited at 10 req/min per user. `tools.call` via MCP public server subject to existing MCP rate limits |
| Prompt injection via tool responses | External MCP tool output injected as tool result (not system prompt). Content length capped. No template variable resolution on MCP tool output |

---

## Data Flow Diagrams

### Exposing Tools (MCP Server Mode)

```
External MCP Client
  │
  ├─ POST /api/v1/mcp (JSON-RPC: tools/list {agency_id})
  │   → mcpPublicServer.ts
  │   → Verify API key scope "agency:tools:mcp"
  │   → Query agencyTools + agencyAgentTools for agency
  │   → Format as MCP tool definitions
  │   → Return JSON-RPC response
  │
  └─ POST /api/v1/mcp (JSON-RPC: tools/call {name, arguments})
      → mcpPublicServer.ts
      → Parse agency ID from tool name prefix
      → Proxy to Python backend tool execution
      → Return MCP-formatted result
```

### Consuming External MCP Tools (Client Mode)

```
Agency Builder UI
  │
  ├─ McpServersPanel: Add server URL + token
  │   → saveMcpServers tRPC mutation
  │   → Validate URL (SSRF) + encrypt token
  │   → Store in agencyAgents.mcpServers / mcpServerTokensEncrypted
  │
  └─ "Discover Tools" button
      → discoverMcpTools tRPC query
      → JSON-RPC tools/list to external server
      → Display tool names in UI

At Runtime (Python orchestrator):
  resolve_tools_for_agent()
    → resolve_mcp_tools_for_agent()
    → For each mcpServer: decrypt token, discover tools, create bridge
    → Bridge.run() → JSON-RPC tools/call to external server
    → Return result to agent
```

---

## Naming Conventions

| Entity | Pattern | Example |
|--------|---------|---------|
| MCP-exposed tool name | `agency.{agencyId}.{toolId}` | `agency.abc123.builtin-web-search` |
| MCP-bridged tool class | `mcp_{serverName}_{toolName}` | `mcp_ext_search_docs` |
| tRPC procedures | `agency.saveMcpServers`, `agency.discoverMcpTools` | -- |
| Feature flag | `AGENCY_MCP_BRIDGE_ENABLED` | -- |
| API key scope | `agency:tools:mcp` | -- |

## Verification Checklist

- [x] All Vitest tests pass for MCP server exposure and tRPC procedures (12 tests)
- [x] All pytest tests pass for external MCP tool discovery and bridging (17 tests)
- [x] MCP public server can list and call agency tools via JSON-RPC
- [x] Tokens are encrypted at rest and never returned in plaintext
- [x] SSRF guard blocks private IPs and metadata endpoints
- [x] Tenant isolation enforced on all MCP operations
- [x] Feature flag correctly gates all MCP functionality (`agencyMcpBridge`)
- [x] Frontend panel allows add/remove/discover with max 5 servers
- [x] TypeScript type check passes (no new errors introduced)
- [ ] Python linting passes (`ruff check`, `mypy`) — deferred to CI

## Implementation Notes

### Deviations from Plan
- Feature flag key: `agencyMcpBridge` (camelCase, TS) / `AGENCY_MCP_BRIDGE_ENABLED` (env var, Python) instead of single `AGENCY_MCP_BRIDGE_ENABLED` throughout. This follows the existing project convention where TypeScript feature flags use camelCase TenantFeatureFlags interface.
- Rate limiting added to `discoverMcpTools` (10 req/min) per code review finding.
- `McpServersPanel` uses `trpc.useUtils().fetch()` instead of direct `trpc.query()` for imperative discovery calls.

### Files Created
- `apps/web/server/services/agencyMcpService.ts` — Service layer (formatToolsAsMcp, encrypt/decrypt tokens, URL validation, discovery client)
- `apps/web/server/services/__tests__/agencyMcpIntegration.test.ts` — 12 Vitest tests
- `apps/web/client/src/components/agency/McpServersPanel.tsx` — Frontend panel
- `python-backend/app/services/mcp_client.py` — Async MCP client (discover + call + cache)
- `python-backend/tests/unit/services/test_agency_mcp_tools.py` — 17 pytest tests

### Files Modified
- `apps/web/server/_core/mcpPublicServer.ts` — Added 2 tool registry entries + dispatch handlers
- `apps/web/server/routers/agency.ts` — Added `saveMcpServers` + `discoverMcpTools` procedures
- `apps/web/client/src/components/agency/NodePropertyPanel.tsx` — Added MCP Servers collapsible section
- `apps/web/client/src/components/agency/nodes/types.ts` — Added `mcpServers` to AgencyNodeData
- `apps/web/shared/featureFlags.ts` — Added `agencyMcpBridge` flag (F30)
- `python-backend/app/services/agency_tools.py` — Added `resolve_mcp_tools_for_agent()` function