# Implementation Plan — Feature 057: MCP Security, Context Optimization & MCP Expansion

## Overview

This plan covers three waves of improvements to SmartSpecPro's MCP subsystem and LLM context management. Wave 1 fixes 62 CRITICAL+HIGH security vulnerabilities in existing code. Wave 2 reduces agency context consumption by ~50%. Wave 3 adds full MCP protocol support with centralized server registry, multiple transports, OAuth 2.1, and advanced spec features.

---

## Wave 1: Security Hardening

### Section 1: Python MCP Security Fixes

**Goal:** Fix 6 CRITICAL + 11 HIGH vulnerabilities in Python MCP code.

#### 1.1 SSRF Protection Activation

**Files:** `python-backend/app/services/mcp_client.py`

The `_validate_mcp_url()` function exists (validates scheme, blocks private IPs, blocks metadata endpoints) but is never called before outbound requests. Both `discover_tools()` and `call_tool()` make HTTP requests to user-supplied URLs without validation.

**Fix:** Call `_validate_mcp_url(server_url)` at the top of both `discover_tools()` and `call_tool()`, returning empty results or error on validation failure. Add `tenant_id` parameter to both functions and include it in the cache key `(tenant_id, url, token_hash)` to prevent cross-tenant cache pollution.

#### 1.2 MCP Executor SSRF + Auth

**Files:** `python-backend/app/orchestrator/node_executors/integration_executors/mcp_executor.py`

The workflow MCP executor has zero SSRF protection and no ownership assertion. `server_url` comes directly from workflow node config.

**Fix:**
- Import and call `_validate_mcp_url()` before any HTTP request
- Add ownership assertion: verify `context["user_id"]` owns the workflow before execution
- Remove `server_url` from output metadata (F09)
- Replace raw exception messages with generic "MCP server error" (F10)
- Clamp timeout: `min(float(config.get("timeout", 30)), 120.0)` (F12)
- Switch to structlog (F11)

#### 1.3 OneDrive Injection Fixes

**Files:** `python-backend/app/mcp/onedrive_mcp.py`

OData injection in search query and path injection in worksheet/cell_range URL construction.

**Fix:**
- URL-encode `query` in search: `from urllib.parse import quote; f"search(q='{quote(query)}')"` (F16)
- URL-encode `worksheet` and `cell_range` in Excel URL path (F17)
- Filter response to safe subset: `{id, name, mimeType, size, modifiedTime, webViewLink}` (F18)
- Replace `follow_redirects=True` with manual redirect handling + SSRF validation on Location header (F20)
- Sanitize exception messages in logs: log `type(e).__name__` only (F19)

#### 1.4 Browser Tools Command Injection Fix

**Files:** `python-backend/app/mcp/browser_tools_mcp.py`

Command allowlist checks only `command.split()[0]` — the full command string with all arguments is forwarded to sandbox.

**Fix:**
- Validate full argument list, not just first word: accept only executable name + pre-approved flags (F22)
- Validate `allowed_domains` against SSRF blocklist (`_BLOCKED_HOSTS` + `_BLOCKED_NETWORKS`) before forwarding to browser service (F23)
- Remove `localhost:3000` fallback for `SMARTSPEC_WEB_GATEWAY_URL` — raise `ToolError` if unset (F24)

#### 1.5 Google Drive Query Escaping

**Files:** `python-backend/app/mcp/google_drive_mcp.py`

Query escaping is incomplete — operators like `or`, `and`, `in` are not blocked.

**Fix:**
- Use `fullText contains` predicate only, with whitelist regex `[a-zA-Z0-9 .,_\-@]` on user query (F13)
- Filter response to safe subset (remove `owners[].emailAddress`, `parents`) (F15)

#### 1.6 Internal MCP API Auth Enforcement

**Files:** `python-backend/app/api/internal_mcp.py`

Tool list returned without auth when `user_id` is None. No tenant isolation check.

**Fix:**
- Return `[]` for OAuth-gated tools when `user_id` is None — only return browser tools (F26)
- Verify `body.user_id` belongs to `body.tenant_id` before dispatching (F27)
- Move `_verify_proxy_token` to `Depends()` pattern in route signature (F29)
- Raise `HTTPException(503)` on DB error instead of silent `False` (F28)

### Section 2: Node.js MCP Security Fixes

**Goal:** Fix 4 CRITICAL + 12 HIGH vulnerabilities in Node.js MCP code.

#### 2.1 Auth & Tenant Isolation (mcp.ts)

**Files:** `apps/web/server/_core/mcp.ts`

Auth bypass when `GATEWAY_KEY` is unset (`if (!GATEWAY_KEY) return true`). `.env` in read/write extension allowlists.

**Fix:**
- Change to `if (!GATEWAY_KEY) { res.status(503).json({error: "MCP gateway not configured"}) }` (M16)
- Remove `.env` from both `DEFAULT_READ_EXTS` and `DEFAULT_WRITE_EXTS` (M17/M18)
- Validate `sessionId` against UUID pattern and `key` format before URL construction (M19)
- Add symlink resolution + re-run containment check after `fs.realpathSync()` (M20)

#### 2.2 Tenant Injection Fix (mcpRoutes.ts)

**Files:** `apps/web/server/_core/mcpRoutes.ts`

`tenantId` resolved from `x-tenant-id` header when auth object lacks it. Cross-user tool cache.

**Fix:**
- Resolve tenantId and userId exclusively from verified auth object, never from headers (M01)
- Set `MCP_REQUIRE_WRITE_TOKEN=1` in production — or remove the opt-in flag entirely (M02)
- Change extensionless file guard: `if (!ext || !EXT_ALLOW.has(ext)) throw` (M03)
- Make Python tools cache per-user: key by `(userId, tenantId)` (M04)
- Remove `/mcp/` route aliases or redirect to `/api/mcp/` (M26)

#### 2.3 Public MCP Server Fixes (mcpPublicServer.ts)

**Files:** `apps/web/server/_core/mcpPublicServer.ts`

Session users bypass all scope checks. Missing proxy token. IDOR on agency tools.

**Fix:**
- Add `x-proxy-token: process.env.SMARTSPEC_PROXY_TOKEN` to agency.tools.call proxy headers (M07)
- Enforce scope checks for session users in `requireScopes` — remove the `mode === "session"` skip (M08)
- Add `session.apiKeyId` revocation check on `loadSession` (M09)
- Add `eq(agencies.tenantId, session.tenantId)` check in `agency.tools.call` before Python proxy (M10)
- Replace fallthrough `return {message, args}` with `throw {code: -32601, message: "Tool not implemented"}` (M11)
- Verify `actor_assistant_id` is associated with `session.userId` (M12)

#### 2.4 Agency MCP Service Fixes

**Files:** `apps/web/server/services/agencyMcpService.ts`

SSRF validation uses sync `validateSsrfUrl()` instead of async `assertPublicIp()`. Tool name injection.

**Fix:**
- Replace `validateSsrfUrl()` with async `assertPublicIp()` from `ssrfValidation.ts` (SEC-C2)
- Add `redirect: "error"` to all outbound MCP fetch calls
- Validate tool names: `agencyId` and `toolId` must match `/^[a-zA-Z0-9_-]+$/` (M23)

### Section 3: MCP Spec Compliance

**Goal:** Fix MUST-level compliance gaps in `mcpPublicServer.ts`.

#### 3.1 Batch Request Support

The handler at `req.body` treats input as a single JSON-RPC object. The spec requires MUST support receiving JSON-RPC batch arrays.

**Fix:** Detect if `req.body` is an array. If so, process each element independently via the existing handler, collect responses, return response array.

#### 3.2 Protocol Negotiation

The server responds with `protocolVersion: "2025-03-26"` but does not read the client's requested version from `params.protocolVersion`.

**Fix:** Read `params.protocolVersion`, compare against supported versions list, respond with negotiated version. Accept `notifications/initialized` as a no-op handler.

#### 3.3 Session Termination

No HTTP DELETE handler for explicit session termination. Expired sessions return JSON-RPC error instead of HTTP 404.

**Fix:** Add DELETE handler on `/v1/mcp` that deletes the Redis session key. Return HTTP 404 for expired/invalid `Mcp-Session-Id`.

### Section 4: Infrastructure Fixes

**Goal:** Fix systemd service configuration for subprocess safety.

#### 4.1 systemd Backend Service

**Files:** `docker/systemd/smartspec-backend.service`

`KillMode=mixed` leaves orphaned stdio children on crash/restart.

**Fix:**
- Change `KillMode=mixed` to `KillMode=control-group`
- Increase `TimeoutStopSec=15s` to `TimeoutStopSec=30s`
- Add `LimitNOFILE=65536` and `LimitNPROC=4096`
- Copy to systemd: `sudo cp docker/systemd/smartspec-*.service /etc/systemd/system/`
- Reload: `sudo systemctl daemon-reload`

---

## Wave 2: Context Optimization

### Section 5: Agency Context Summarization

**Goal:** Wire auto-condensation into the agency execution path. Prevent 100K budget exhaustion at iteration 8.

#### 5.1 AgencyContextSummarizer Service

**New file:** `python-backend/app/services/agency_context_summarizer.py`

A service that monitors token usage during ReAct execution and compresses old messages when approaching the budget threshold.

```python
class AgencyContextSummarizer:
    """Auto-condense agency conversation history when approaching token budget."""
    TRIGGER_THRESHOLD: float = 0.70  # 70% of budget
    KEEP_RECENT_TURNS: int = 4  # Always keep last 4 turns uncompressed
```

**Key behaviors:**
- Estimate token count of current message history using character-based estimation (4 chars/token ASCII, 2.5 chars/token CJK — matching existing `context_manager.py` logic)
- When token count exceeds `TRIGGER_THRESHOLD * budget`, split messages into old (to summarize) and recent (to keep)
- Never split AI+ToolMessage pairs across the boundary
- Use dynamic LLM provider selection (existing `llm_gateway` service with priority-based routing) for summarization — not a hardcoded model
- Replace old messages with a single system message containing the summary
- Return the compressed message list

#### 5.2 Wire into ReAct Executor

**Files:** `python-backend/app/services/react_executor.py`

Before each LLM call in the ReAct loop, call `summarizer.maybe_condense(messages, budget, model)`. This replaces old conversation turns with a compressed summary when approaching the budget.

#### 5.3 Wire into Autonomous Executor

**Files:** `python-backend/app/services/autonomous_executor.py`

Call `maybe_condense()` before replan operations, where context accumulates across plan/execute/reflect cycles.

### Section 6: Deferred Tool Loading

**Goal:** Reduce tool schema token overhead from 7,125 to ~800 tokens for 25-tool agencies.

#### 6.1 DeferredToolRegistry

**New file:** `python-backend/app/services/agency_deferred_tools.py`

When an agent has more than a configurable threshold of tools (default: 10), switch to deferred mode:
- Register all tools in a registry with name + description only
- Create a `tool_search` meta-tool that agents call to discover full schemas
- The execution layer (ToolNode) still has all tools registered for actual invocation

```python
class DeferredToolRegistry:
    THRESHOLD: int = 10  # Enable deferred mode when tools > threshold
    MAX_SEARCH_RESULTS: int = 5

    def prepare_tools(self, tools: list[BaseTool]) -> PreparedTools:
        """If tools > threshold, return deferred setup; otherwise pass through."""

    def search(self, query: str) -> list[ToolSchema]:
        """Score and return matching tool schemas."""
```

**Search query formats:**
- `"select:name1,name2"` — exact name match
- `"+keyword rest"` — require keyword in name, rank by rest
- Free text — fuzzy match on name + description

**Execution flow:** When deferred mode is active, the LLM sees only `tool_search` in its bound tools. It calls `tool_search("select:web-search")` → gets full schema for `web-search` → now knows the input schema → calls `web-search(query="...")`. The ToolNode (agency-swarm's execution layer) has ALL tools registered — deferred mode only affects what the LLM sees in `bind_tools()`, not what it can execute. This matches DeerFlow's `DeferredToolFilterMiddleware` pattern.

#### 6.2 Integration with Agency Tools

**Files:** `python-backend/app/services/agency_tools.py`

In `resolve_mcp_tools_for_agent()`, after building the full tool list, pass through `DeferredToolRegistry.prepare_tools()`. If deferred mode is activated, the agent's system prompt includes a `<available-deferred-tools>` block listing tool names, and only the `tool_search` tool schema is bound to the LLM.

### Section 7: Vector-Based Long-Term Memory

**Goal:** Replace SQL-based memory retrieval with semantic search using pgvector. Reduce irrelevant memories in context.

#### 7.1 Schema Migration

**Files:** `apps/web/drizzle/schema.ts`, migration SQL

Add embedding column to `agency_agent_memories` table:
```sql
ALTER TABLE agency_agent_memories ADD COLUMN embedding vector(384);
CREATE INDEX ix_agent_memories_embedding
  ON agency_agent_memories USING hnsw (embedding vector_cosine_ops);
```

Follow Database Safety Protocol: backup table before migration, verify row counts after.

#### 7.2 Memory Embedding on Store

**Files:** `python-backend/app/services/long_term_memory.py`

When storing a new memory via `store_memory()`, generate an embedding using the existing `EmbeddingService` (default: local MiniLM-384D). Store the embedding in the new column.

#### 7.3 Semantic Memory Retrieval

**Files:** `python-backend/app/services/long_term_memory.py`

Replace `get_memories_for_agent()` SQL query with a two-step process:
1. Embed the current task/message using `EmbeddingService`
2. Query pgvector for top-K similar memories with filters (agent_id, user_id, is_active)
3. Fallback to SQL confidence-based query if no vector results (backward compat for pre-embedding memories)

Reduce `limit` from 20 to 10 — semantic relevance means fewer but better memories.

#### 7.4 Backfill Existing Memories

A one-time migration script to embed all existing memories that lack embeddings. Run as a Celery task to avoid blocking startup.

### Section 8: Chat Context Token Counting

**Goal:** Add token counting to chat `buildChatContext()` to prevent model context overflow.

#### 8.1 Token Budget Enforcement

**Files:** `apps/web/server/services/chatService.ts`

In `buildChatContext()`:
1. Look up model context limit from `llmModels.contextLength` column (already exists)
2. Reserve 8,192 tokens for output
3. Estimate tokens for loaded messages using existing `estimateTokens()` from `promptComposer.ts`
4. If over 85% of input budget: summarize oldest messages (keeping last 6 turns), re-check
5. Use existing `memoryService.summarize()` for compression

#### 8.2 Reuse estimateTokens

Extract the `estimateTokens()` function from `promptComposer.ts` into a shared utility (`apps/web/server/utils/tokenEstimator.ts`) so both `chatService.ts` and `promptComposer.ts` can use it.

### Section 9: Few-Shot Relevance Filtering

**Goal:** Reduce few-shot token waste by selecting only relevant examples.

#### 9.1 Embedding-Based Selection

**Files:** `python-backend/app/services/agency_few_shot.py`

When an agent has more than 3 few-shot examples:
1. Embed the current task using `EmbeddingService`
2. Embed each example's user message (cache embeddings for reuse)
3. Score by cosine similarity
4. Return top 3 most relevant examples

For agents with ≤3 examples, pass through unchanged.

### Section 10: RAG Result Deduplication

**Goal:** Remove near-duplicate chunks before injecting RAG results into context.

#### 10.1 Content Hash Deduplication

**Files:** `python-backend/app/orchestrator/rag/hybrid_rag.py`

After the hybrid retrieval + re-ranking pipeline, add a deduplication step:
1. Compute content hash (MD5 of normalized text) for each chunk
2. Remove chunks with duplicate hashes, keeping the highest-scored version
3. Return deduplicated list

---

## Wave 3: MCP Expansion

### Section 11: Database Schema — MCP Server Registry

**Goal:** Centralized MCP server management replacing per-agent JSONB.

#### 11.1 New Table: mcp_servers

```
mcp_servers:
  id: serial PRIMARY KEY
  tenantId: integer NOT NULL (FK → tenants, indexed)
  name: varchar(100) NOT NULL
  slug: varchar(100) NOT NULL (UNIQUE per tenant)
  description: text
  transportType: enum("http", "streamable_http", "stdio")
  enabled: boolean DEFAULT true
  config: jsonb NOT NULL  -- transport-specific config (strict Zod validation)
  oauthClientId: text
  oauthClientSecretEncrypted: text  -- dedicated encrypted column
  oauthAccessTokenEncrypted: text   -- dedicated encrypted column
  oauthRefreshTokenEncrypted: text  -- dedicated encrypted column
  oauthTokenExpiresAt: timestamp
  oauthConfig: jsonb  -- non-secret OAuth metadata (tokenUrl, grantType, scope)
  capabilities: jsonb DEFAULT '{"tools":true}'
  toolNamePrefix: boolean DEFAULT true
  maxToolsExposed: integer DEFAULT 50
  timeoutSeconds: integer DEFAULT 30
  endpointPath: varchar(100) DEFAULT '/rpc'
  riskLevel: enum("low","medium","high") DEFAULT 'high'
  dataClassification: enum("public","internal","confidential") DEFAULT 'internal'
  configHash: varchar(64)  -- SHA-256 for change detection
  approvedAt: timestamp
  approvedBy: integer (FK → users)
  creditPerCall: numeric DEFAULT 1.0
  lastHealthCheck: timestamp
  healthStatus: varchar(20) DEFAULT 'unknown'
  createdAt, updatedAt, createdBy
```

#### 11.2 New Table: mcp_server_assignments

```
mcp_server_assignments:
  id: serial PRIMARY KEY
  mcpServerId: integer NOT NULL (FK → mcp_servers)
  targetType: enum("tenant", "agency", "agent")
  targetId: integer NOT NULL
  enabledToolNames: text[]  -- null = all tools
  disabledToolNames: text[]
  createdAt, updatedAt
```

**Scope precedence:** tenant = allowlist (which servers are available), agency = defaults, agent = selection from allowed set.

#### 11.3 Migration Script

A data migration script to:
1. Extract existing `agencyAgents.mcpServers` JSONB entries → `mcp_servers` rows
2. Decrypt `mcpServerTokensEncrypted` → `oauthAccessTokenEncrypted` column
3. Create `mcp_server_assignments` for each agent reference
4. Keep JSONB columns for backward compat (read fallback during transition)

### Section 12: tRPC Router — MCP Server Management

**Goal:** CRUD endpoints for MCP server management with security controls.

#### 12.1 Router: mcpServers.ts

**New file:** `apps/web/server/routers/mcpServers.ts`

**Endpoints:**
- `list` — tenant-scoped, omit encrypted fields (return `oauthConfigured: boolean`)
- `create` — strict Zod discriminated union validation per transport type, `.strict()` on nested objects
- `update` — same validation, recalculate `configHash`
- `delete` — with OAuth token revocation (RFC 7009 if supported)
- `testConnection` — rate limit 5/min, SSRF oracle protection (return only `{reachable, toolCount, latencyMs}`)
- `listDiscoveredTools` — discover tools from server, namespace as `mcp.{slug}.{toolName}`
- `assignToAgency` / `unassign` — create/delete `mcp_server_assignments`
- `refreshTools` — force re-discovery

**Security:**
- All endpoints require `adminProcedure`
- Tool name validation: `/^[a-zA-Z0-9_-]{1,64}$/`
- Tool description sanitization via `fewShotSanitizer`
- inputSchema depth limit 5, size limit 64KB
- Max 100 tools per server response
- Response size limit: 1MB
- HTTP headers allowlist: block `Host`, `X-Forwarded-*`, `Cookie`

### Section 13: Admin UI — MCP Server Manager

**Goal:** Admin page for managing MCP server configurations.

#### 13.1 McpServerManager Page

**New file:** `apps/web/client/src/pages/McpServerManager.tsx`

**Components:**
- Server table: name, transport type, status indicator, tool count, actions
- Add/Edit modal: transport type selector → conditional config form → OAuth setup section
- Test connection button with tool preview
- Assign to agencies via multi-select dialog

#### 13.2 Agency Builder Integration

**Modified files:** Agent node config panel in `apps/web/client/src/components/agency/`

Add MCP server multi-select picker to agent node configuration:
- Shows available `mcp_servers` for the tenant
- Tool count badge per server
- Data classification warning for external servers

### Section 14: Cross-System Protection Layer

**Goal:** Protect against MCP-related cross-system attacks.

#### 14.1 MCP Response Wrapper

Wrap all MCP tool responses before injecting into agent context:
```
[MCP_TOOL_RESULT: mcp.{server_slug}/{tool_name}]
{response_content}
[/MCP_TOOL_RESULT]
```
System prompt instructs agent to treat content within these tags as raw data, not instructions.

#### 14.2 Per-Tool Invocation Counter

In the tool bridge closure (created by `resolve_mcp_tools_for_agent()`), maintain a counter per tool per turn. After `MAX_MCP_TOOL_CALLS_PER_TURN=10` calls to the same tool, return a terminal error string.

#### 14.3 Per-Run and Per-Tenant Rate Limits

- `MAX_MCP_CALLS_PER_RUN=50` — Redis counter keyed by `run_id`
- Per-tenant rate limit: 200 MCP calls/minute — Redis rolling counter

#### 14.4 Cross-Boundary Loop Detection

Propagate `X-Agency-Run-Chain` header through MCP tool invocations. Track tenant-level agency call graph in Redis with short TTL to detect cross-MCP-boundary cycles.

#### 14.5 Guardrail Integration

- Apply `_SECRET_PATTERNS` scrubbing to MCP tool parameters before outbound call
- Apply output guardrails to MCP tool responses before they enter agent context

#### 14.6 Memory Protection

- Default `memory_extraction_enabled=false` for agents with MCP tools configured
- Harden memory extraction prompt: "Do not preserve specific data values (PII, account numbers, record IDs) — only structural learnings"

#### 14.7 Audit Trail

- New audit event type: `mcp_tool_call` with `serverId`, `toolName`, `tenantId`, `agencyId`, `agentId`, `userId`, `paramKeys[]`, `responseStatus`, `latencyMs`
- Pass `TraceCollector` into `resolve_mcp_tools_for_agent()` for per-call tracing in `agencyRunTraces`
- Admin audit events: `mcp_server_created`, `mcp_server_updated`, `mcp_server_deleted`, `mcp_server_assigned`

#### 14.8 Credit Tracking

- Flat per-call credit charge (configurable per server via `creditPerCall`, default 1.0)
- Record in `providerUsageLog` with synthetic `providerId` for the MCP server
- Incremental credit check at autonomous replan boundaries

#### 14.9 MCP Timeout Error Handling

Define a typed exception `McpToolError` in `mcp_client.py`:
- On `httpx.TimeoutException`: raise `McpToolError("timeout", retryable=False)` instead of returning a success string
- On HTTP 429: raise `McpToolError("rate_limited", retryable=False)` with structured marker
- On HTTP 5xx: raise `McpToolError("server_error", retryable=True)`
- The tool bridge `run_func` in `agency_tools.py` catches `McpToolError` and returns a structured error string that the orchestrator can distinguish from real tool results
- This prevents the LLM from misinterpreting timeout strings as valid tool output

#### 14.10 Health Check Beat Task

A Celery periodic beat task (`mcp_health_check_task`) runs every 5 minutes:
1. Query all enabled `mcp_servers` rows
2. For HTTP servers: send a lightweight `tools/list` request (timeout 10s)
3. For stdio servers: check if OpenSandbox container is provisioned
4. Update `lastHealthCheck` and `healthStatus` columns
5. Admin UI shows green/red/gray status indicator based on `healthStatus`

#### 14.11 Celery Worker MCP Constraint

Celery workers run in separate Docker containers (prefork model). They CANNOT:
- Access stdio subprocesses (different process tree)
- Use async MCP client directly (prefork incompatible with asyncio)

Celery tasks that need MCP tools MUST call the MCP proxy via HTTP API (`POST /api/v1/mcp/tool/call`) — not use the MCP client directly. Document this constraint in code comments and service architecture docs.

### Section 15: Feature Flags

Three separate feature flags for phased rollout:
- `mcpServerRegistry` — Wave 3 Phase 1 gate
- `mcpStdio` — Wave 3 Phase 2 gate (highest risk)
- `mcpOAuth` — Wave 3 Phase 3 gate

Add to `KNOWN_FEATURE_FLAGS` in `tenantFeatureFlagService.ts`.

### Section 16: MCP Client Manager — Multi-Transport

**Goal:** Python MCP client supporting HTTP, Streamable HTTP, and stdio (via OpenSandbox) transports.

#### 16.1 McpClientManager

**New file:** `python-backend/app/services/mcp_client_manager.py`

Manages connections to multiple MCP servers with transport-specific handling:
- `connect(server: McpServerConfig) → McpConnection` — factory method by transport type
- `disconnect(server_id: str)` — graceful teardown
- `health_check(server_id: str) → HealthStatus` — periodic ping

**HTTP transport:** Uses existing `httpx.AsyncClient` with `assertPublicIp()` validation, `redirect: "error"`, response size limit 1MB.

**Streamable HTTP transport:** POST JSON-RPC to MCP endpoint, accept `application/json` or `text/event-stream`. Handle `Mcp-Session-Id` header (validate `/^[a-zA-Z0-9_-]{1,128}$/`). SSE fallback for old servers (try POST first, if 4xx try GET).

**stdio transport (via OpenSandbox):** Instead of spawning subprocesses directly on the host (security risk), route stdio through OpenSandbox containers:
1. Admin registers an MCP server with `transportType: "stdio"` and `config: {command: "npx", args: ["@modelcontextprotocol/server-github"], env: {GITHUB_TOKEN: "$ref:encrypted"}}`
2. On connection, SSP provisions an OpenSandbox container with the configured command
3. Communication flows through the sandbox's stdin/stdout pipes
4. Container has restricted network (no host access), resource limits, and automatic cleanup

Per-tenant limit: 2 concurrent stdio containers.

**Fallback when OpenSandbox unavailable:** If `OPENSANDBOX_ENABLED=false` or OpenSandbox service is down, stdio transport is disabled entirely. The `connect()` method returns a `McpConnectionError("stdio transport requires OpenSandbox")`. The admin UI shows stdio servers as "unavailable" with a tooltip explaining the dependency. HTTP and Streamable HTTP transports are unaffected.

#### 16.2 Connection Lifecycle

- Connection pool per server (max 3 concurrent for HTTP, 1 for stdio)
- Heartbeat/ping every 30s for persistent connections
- Auto-reconnect on disconnect (max 3 retries, exponential backoff)
- Graceful shutdown: close all connections during FastAPI lifespan shutdown event

### Section 17: OAuth 2.1 Support

**Goal:** Authenticate with external MCP servers via OAuth 2.1.

#### 17.1 OAuth Token Manager

**New file:** `python-backend/app/services/mcp_oauth_manager.py`

```python
class McpOAuthManager:
    """Manages OAuth 2.1 tokens for MCP servers."""
    async def get_token(self, server_id: str) -> str
    async def refresh_if_needed(self, server_id: str) -> str
```

**Grant types:** `client_credentials` (machine-to-machine) and `authorization_code` (with PKCE).

**Token storage:** Dedicated encrypted columns on `mcp_servers` table — NOT in JSONB.

#### 17.2 Authorization Code Flow

**New file (route):** Express route at `/auth/mcp/callback`

Flow:
1. Admin clicks "Connect" in MCP Server Manager → generates state + code_verifier
2. Store state + code_verifier in Redis (keyed by state, 10-min TTL)
3. Redirect to OAuth provider authorize URL with PKCE `code_challenge`
4. Provider redirects to `https://smartaihub.app/auth/mcp/callback`
5. Callback validates state, exchanges code for token, encrypts + stores in DB
6. UI shows "Connected" status

**Security:**
- Callback URL hardcoded to `https://smartaihub.app/auth/mcp/callback`
- `code_verifier` via `crypto.randomBytes(32).toString('base64url')`, stored server-side only
- 32-byte random `state` parameter, verified exactly on callback
- Token revocation (RFC 7009) on server delete
- Audit logging for token refresh events

### Section 18: Hot-Reload & Adapters

**Goal:** Auto-detect config changes without service restart. Integrate with langchain-mcp-adapters.

#### 18.1 Config Watcher

**New file:** `python-backend/app/services/mcp_config_watcher.py`

Poll `mcp_servers` table every 60 seconds, compare `configHash` values:
- **Non-executable config changes** (timeout, name, enabled, description): auto-apply
- **Executable config changes** (command, args, env, URL): require service restart + admin re-approval. Log audit event.

#### 18.2 langchain-mcp-adapters Integration

Before adopting, verify:
- Compatibility with pinned LangChain version in `requirements.txt`
- SSRF protection is applied before URLs reach the library's transport layer
- Connection lifecycle model matches our pool architecture

**Scope:** Replace `mcp_client.py` HTTP transport only. Do NOT touch `mcp_adapter.py` — this file is the **internal** workspace tool bridge that calls SSP's own `/api/mcp/call` endpoint for Drive/OneDrive/Browser tools. It is a completely separate system from the **external** MCP client (`mcp_client.py`) that calls third-party MCP servers. Confusing these two is a common mistake.

### Section 19: Nginx & Infrastructure for MCP

**Goal:** Configure nginx for SSE streaming and OAuth callback.

#### 19.1 MCP SSE Location Block

**Files:** `nginx/conf.d/dev-host.conf`

Add dedicated location block before general `/api/` block:
```
location ~ ^/api/v1/mcp/ {
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;
    # ... standard proxy headers
}
```

#### 19.2 Health Check Endpoint

Add `/health/mcp` sub-endpoint reporting MCP subsystem state: registered server count, active connections, stdio process count.

### Section 20: Advanced MCP Spec Features

**Goal:** Bring SSP to full MCP 2025-03-26 compliance.

#### 20.1 Content Types

Return `ImageContent` (base64 + mimeType) for media generation tools, `AudioContent` for voice tools. Update Python `mcp_client.call_tool()` to handle all content types, not just text.

#### 20.2 Tool Annotations

Add `annotations` to tool definitions: `readOnlyHint`, `destructiveHint`, `idempotentHint`. Map from existing `readWrite` property.

#### 20.3 Cancellation

Handle `notifications/cancelled` — abort in-progress tool calls via `AbortController` (Node.js) or `httpx` cancellation (Python).

#### 20.4 Pagination

Add cursor-based pagination to `tools/list`. Page size default 50. Return `nextCursor` when more tools available.

#### 20.5 Monitoring

Prometheus metrics:
- `mcp_tool_call_duration_seconds` (histogram, by server_id, tool_name)
- `mcp_tool_call_errors_total` (counter, by server_id, error_type)
- `mcp_stdio_processes_active` (gauge, by server_id)
- `mcp_oauth_token_refresh_total` (counter, by server_id, result)
- `mcp_connection_state` (gauge, by server_id)

#### 20.6 JSONB Deprecation & Cutover

Define explicit milestone where:
1. `resolve_mcp_tools_for_agent()` switches exclusively to registry
2. `agencyAgents.mcpServers` JSONB column is deprecated in code
3. Column eventually dropped (separate migration after verification period)

#### 20.7 User Documentation

Create `apps/web/docs/help/en/mcp-servers.md` covering:
- How to add an MCP server (each transport type)
- OAuth connection flow
- How tools appear in agent prompts
- Troubleshooting

---

## File Change Summary

### New Files
| File | Section | Purpose |
|------|---------|---------|
| `python-backend/app/services/agency_context_summarizer.py` | 5 | Agency context auto-condensation |
| `python-backend/app/services/agency_deferred_tools.py` | 6 | Deferred tool registry |
| `apps/web/server/utils/tokenEstimator.ts` | 8 | Shared token estimation utility |
| `apps/web/drizzle/XXXX_mcp_servers.sql` | 11 | MCP server registry migration |
| `apps/web/server/routers/mcpServers.ts` | 12 | MCP server CRUD router |
| `apps/web/client/src/pages/McpServerManager.tsx` | 13 | Admin UI page |
| `python-backend/app/services/mcp_client_manager.py` | 16 | Multi-transport MCP client |
| `python-backend/app/services/mcp_oauth_manager.py` | 17 | OAuth 2.1 token management |
| `python-backend/app/services/mcp_config_watcher.py` | 18 | Hot-reload config watcher |

### Modified Files
| File | Section | Changes |
|------|---------|---------|
| `python-backend/app/services/mcp_client.py` | 1.1 | Call SSRF validation, tenant-aware cache |
| `python-backend/app/orchestrator/.../mcp_executor.py` | 1.2 | SSRF + auth + generic errors |
| `python-backend/app/mcp/onedrive_mcp.py` | 1.3 | URL encoding, response filtering |
| `python-backend/app/mcp/browser_tools_mcp.py` | 1.4 | Full command validation |
| `python-backend/app/mcp/google_drive_mcp.py` | 1.5 | Query escaping |
| `python-backend/app/api/internal_mcp.py` | 1.6 | Auth enforcement |
| `apps/web/server/_core/mcp.ts` | 2.1 | Auth bypass fix |
| `apps/web/server/_core/mcpRoutes.ts` | 2.2 | Tenant injection fix |
| `apps/web/server/_core/mcpPublicServer.ts` | 2.3, 3 | Scope enforcement, spec compliance |
| `apps/web/server/services/agencyMcpService.ts` | 2.4 | SSRF + tool name validation |
| `docker/systemd/smartspec-backend.service` | 4 | KillMode + limits |
| `python-backend/app/services/react_executor.py` | 5.2 | Wire summarizer |
| `python-backend/app/services/autonomous_executor.py` | 5.3 | Wire summarizer |
| `python-backend/app/services/agency_tools.py` | 6.2, 14 | Deferred loading, protections |
| `python-backend/app/services/long_term_memory.py` | 7 | Vector-based retrieval |
| `apps/web/server/services/chatService.ts` | 8 | Token counting |
| `python-backend/app/services/agency_few_shot.py` | 9 | Relevance filtering |
| `python-backend/app/orchestrator/rag/hybrid_rag.py` | 10 | Deduplication |
| `apps/web/drizzle/schema.ts` | 11 | New tables |
| `nginx/conf.d/dev-host.conf` | 19 | MCP SSE block |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Security fix breaks existing MCP functionality | HIGH | Comprehensive test coverage before/after each fix |
| Context summarization loses important information | MEDIUM | Keep last 4 turns uncompressed, log all summarizations |
| Migration from JSONB to registry loses data | HIGH | Backup + backward compat period + verification |
| stdio via OpenSandbox adds latency | LOW | Acceptable trade-off for security |
| OAuth callback exposed to internet | MEDIUM | Hardcoded callback URL, PKCE, state validation |
| langchain-mcp-adapters version incompatibility | MEDIUM | Verify before adopting, keep manual fallback |
