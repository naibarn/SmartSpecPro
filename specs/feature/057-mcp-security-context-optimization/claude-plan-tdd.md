# TDD Plan — Feature 057

Testing frameworks: **Vitest** (TypeScript), **pytest** (Python, 80% coverage enforced).
Test conventions: pytest markers (unit, integration, e2e, auth, credits), Vitest with msw mocking.

---

## Wave 1: Security Hardening

### Section 1: Python MCP Security Fixes

```python
# Test: discover_tools rejects private IP URLs (10.x, 172.16.x, 192.168.x, 169.254.x)
# Test: discover_tools rejects non-http/https schemes
# Test: call_tool rejects private IP URLs
# Test: call_tool rejects metadata endpoints (169.254.169.254)
# Test: discovery cache is keyed by (tenant_id, url, token_hash) — tenant A cache miss on tenant B
# Test: discover_tools with tenant_id=None raises ValueError

# Test: mcp_executor validates server_url before HTTP request
# Test: mcp_executor rejects private IP in server_url
# Test: mcp_executor checks user ownership of workflow
# Test: mcp_executor output does not contain server_url
# Test: mcp_executor exception messages are generic (no hostname/port)
# Test: mcp_executor timeout clamped to max 120s

# Test: onedrive search query is URL-encoded (single quotes, operators escaped)
# Test: onedrive worksheet name is URL-encoded in path
# Test: onedrive cell_range is URL-encoded in path
# Test: onedrive file info response filtered (no email, no parentReference)
# Test: onedrive download does not follow redirects to private IPs

# Test: browser command allowlist validates full command+args, not just first word
# Test: browser rejects command with -e/--eval/-c flags
# Test: browser validates allowed_domains against SSRF blocklist
# Test: browser rejects localhost in allowed_domains
# Test: browser raises error when gateway URL is not configured

# Test: google_drive query rejects operator injection (or, and, in)
# Test: google_drive file info filtered (no owners email)

# Test: internal_mcp returns empty tools when user_id is None for OAuth tools
# Test: internal_mcp verifies user.tenant_id matches body.tenant_id
# Test: internal_mcp returns 503 on database error (not empty list)
```

### Section 2: Node.js MCP Security Fixes

```typescript
// Test: mcp.ts denies all access when GATEWAY_KEY is unset
// Test: mcp.ts rejects .env file reads
// Test: mcp.ts rejects .env file writes
// Test: mcp.ts validates sessionId as UUID format
// Test: mcp.ts resolves symlinks and re-checks containment

// Test: mcpRoutes resolves tenantId from auth object, not x-tenant-id header
// Test: mcpRoutes denies file write when REQUIRE_WRITE_TOKEN=1 and no token
// Test: mcpRoutes denies extensionless file reads
// Test: mcpRoutes Python tools cache is per-user per-tenant
// Test: mcpRoutes /mcp/ alias routes are removed or redirect to /api/mcp/

// Test: mcpPublicServer includes x-proxy-token on agency.tools.call proxy
// Test: mcpPublicServer enforces scope checks for session users
// Test: mcpPublicServer rejects revoked API key on loadSession
// Test: mcpPublicServer verifies agency tenantId in tools.call
// Test: mcpPublicServer returns error (not args) for unimplemented tools
// Test: mcpPublicServer verifies actor_assistant_id belongs to session userId

// Test: agencyMcpService uses assertPublicIp (async DNS resolution)
// Test: agencyMcpService rejects redirect-following fetch
// Test: agencyMcpService validates agencyId format [a-zA-Z0-9_-]+
// Test: agencyMcpService validates toolId format [a-zA-Z0-9_-]+
```

### Section 3: MCP Spec Compliance

```typescript
// Test: mcpPublicServer processes JSON-RPC batch array (multiple requests)
// Test: mcpPublicServer returns batch array response
// Test: mcpPublicServer reads client protocolVersion from initialize params
// Test: mcpPublicServer accepts notifications/initialized as no-op
// Test: mcpPublicServer handles DELETE request for session termination
// Test: mcpPublicServer returns HTTP 404 for expired Mcp-Session-Id
```

### Section 4: Infrastructure Fixes

```bash
# Test: smartspec-backend.service has KillMode=control-group
# Test: smartspec-backend.service has TimeoutStopSec >= 30
# Test: smartspec-backend.service has LimitNOFILE >= 65536
# Validation: ./scripts/validate-all-configs.sh passes
```

---

## Wave 2: Context Optimization

### Section 5: Agency Context Summarization

```python
# Test: summarizer returns messages unchanged when below threshold (70%)
# Test: summarizer compresses old messages when above threshold
# Test: summarizer keeps last 4 turns uncompressed
# Test: summarizer does not split AI+ToolMessage pairs
# Test: summarizer uses dynamic LLM provider selection (not hardcoded model)
# Test: summarizer output is a valid message list with summary as system message
# Test: react_executor calls maybe_condense before each LLM call
# Test: autonomous_executor calls maybe_condense before replan
```

### Section 6: Deferred Tool Loading

```python
# Test: prepare_tools passes through when tools <= threshold (10)
# Test: prepare_tools returns deferred setup when tools > threshold
# Test: deferred mode includes tool_search meta-tool
# Test: tool_search returns matching schemas for "select:name" query
# Test: tool_search returns top-5 by relevance for free-text query
# Test: tool_search returns empty for no-match query
# Test: ToolNode has all tools registered even in deferred mode
# Test: agency_tools integrates deferred loading in resolve_mcp_tools_for_agent
```

### Section 7: Vector-Based Long-Term Memory

```python
# Test: store_memory generates and saves embedding alongside content
# Test: get_memories_for_agent uses vector similarity search with current task
# Test: get_memories_for_agent falls back to SQL when no vector results
# Test: get_memories_for_agent returns max 10 results (not 20)
# Test: memories without embeddings are still retrievable via SQL fallback
# Test: backfill task embeds all existing memories without embeddings
# Test: vector search filters by agent_id, user_id, is_active
```

### Section 8: Chat Context Token Counting

```typescript
// Test: buildChatContext estimates tokens for loaded messages
// Test: buildChatContext summarizes oldest messages when over 85% budget
// Test: buildChatContext keeps last 6 turns uncompressed
// Test: buildChatContext uses model-specific context limit from llmModels table
// Test: estimateTokens handles mixed ASCII/CJK text
// Test: shared tokenEstimator produces consistent results across callers
```

### Section 9: Few-Shot Relevance Filtering

```python
# Test: get_relevant_examples passes through when examples <= 3
# Test: get_relevant_examples selects top-3 by cosine similarity when > 3
# Test: get_relevant_examples caches example embeddings for reuse
# Test: get_relevant_examples handles empty task string gracefully
```

### Section 10: RAG Result Deduplication

```python
# Test: deduplicate_chunks removes exact duplicate content
# Test: deduplicate_chunks keeps highest-scored version of duplicates
# Test: deduplicate_chunks preserves order of unique chunks
# Test: deduplicate_chunks handles empty input
```

---

## Wave 3: MCP Expansion

### Section 11: Database Schema

```python
# Test: mcp_servers table created with all columns
# Test: mcp_servers.tenantId is NOT NULL
# Test: mcp_servers.riskLevel defaults to 'high'
# Test: mcp_server_assignments FK constraint to mcp_servers
# Test: migration script extracts JSONB entries into mcp_servers rows
# Test: migration script preserves encrypted tokens
# Test: migration script creates assignments for each agent reference
# Test: row counts match pre/post migration
```

### Section 12: tRPC Router

```typescript
// Test: mcpServers.list returns only tenant-scoped servers
// Test: mcpServers.list omits encrypted fields (returns oauthConfigured: boolean)
// Test: mcpServers.create validates transport-specific config via Zod discriminated union
// Test: mcpServers.create rejects unknown keys (.strict())
// Test: mcpServers.delete revokes OAuth token if configured
// Test: mcpServers.testConnection rate limited to 5/min
// Test: mcpServers.testConnection returns only {reachable, toolCount, latencyMs}
// Test: mcpServers.listDiscoveredTools namespaces as mcp.{slug}.{toolName}
// Test: mcpServers.listDiscoveredTools validates tool name format
// Test: mcpServers.listDiscoveredTools rejects inputSchema > 64KB
// Test: mcpServers.listDiscoveredTools limits to 100 tools per server
```

### Section 13: Admin UI

```typescript
// Test: McpServerManager page renders server table
// Test: McpServerManager add modal shows transport-specific fields
// Test: McpServerManager test connection button shows tool count
// Test: Agency builder agent config shows MCP server picker
// Test: Data classification warning shown for external servers
```

### Section 14: Cross-System Protections

```python
# Test: MCP response wrapped with [MCP_TOOL_RESULT] tags
# Test: per-tool invocation counter stops at MAX_MCP_TOOL_CALLS_PER_TURN
# Test: per-run MCP call counter stops at MAX_MCP_CALLS_PER_RUN
# Test: per-tenant rate limit enforced at 200 calls/minute
# Test: X-Agency-Run-Chain header propagated through MCP calls
# Test: cross-boundary cycle detected via tenant-level call graph
# Test: guardrails applied to MCP tool parameters before outbound
# Test: guardrails applied to MCP response before entering agent context
# Test: memory_extraction_enabled defaults to false with MCP tools
# Test: mcp_tool_call audit event recorded with correct fields
# Test: TraceCollector records MCP tool calls in agencyRunTraces
# Test: McpToolError raised on timeout (not success string)
# Test: McpToolError raised on HTTP 429 with retryable=False
# Test: health check task updates lastHealthCheck and healthStatus
# Test: credit charged per MCP tool call (creditPerCall)
```

### Section 15: Feature Flags

```typescript
// Test: mcpServerRegistry flag controls registry UI visibility
// Test: mcpStdio flag controls stdio transport availability
// Test: mcpOAuth flag controls OAuth configuration UI
// Test: flags are independent (enabling one doesn't enable others)
```

### Section 16: Multi-Transport Client

```python
# Test: McpClientManager connects via HTTP transport
# Test: McpClientManager connects via Streamable HTTP transport
# Test: McpClientManager connects via stdio (OpenSandbox container)
# Test: McpClientManager rejects stdio when OpenSandbox unavailable
# Test: McpClientManager enforces per-tenant stdio limit (2 containers)
# Test: McpClientManager validates Mcp-Session-Id format
# Test: McpClientManager does not follow HTTP redirects
# Test: McpClientManager enforces response size limit (1MB)
# Test: McpClientManager auto-reconnects with exponential backoff (max 3)
# Test: McpClientManager gracefully shuts down on FastAPI lifespan close
```

### Section 17: OAuth 2.1

```typescript
// Test: OAuth callback validates state parameter against Redis
// Test: OAuth callback exchanges code for token with PKCE code_verifier
// Test: OAuth callback encrypts token before DB storage
// Test: OAuth callback rejects expired state (>10 min)
// Test: OAuth callback URL is hardcoded to smartaihub.app domain
// Test: McpOAuthManager refreshes token before expiry
// Test: McpOAuthManager handles refresh failure gracefully
// Test: OAuth token revoked on MCP server delete
```

### Section 18: Hot-Reload & Adapters

```python
# Test: config watcher detects non-executable config changes
# Test: config watcher auto-applies timeout/name/enabled changes
# Test: config watcher does NOT auto-apply command/args/env changes
# Test: config watcher logs audit event for all changes
# Test: config watcher rate limits to 1 check per 60s per server
```

### Section 19: Nginx & Infrastructure

```bash
# Test: nginx config has /api/v1/mcp/ location with proxy_buffering off
# Test: nginx config has proxy_read_timeout >= 1800s for MCP routes
# Test: /health/mcp endpoint returns server count and connection state
```

### Section 20: Advanced MCP Spec Features

```typescript
// Test: media generation tools return ImageContent (base64 + mimeType)
// Test: voice tools return AudioContent
// Test: Python client handles image/audio/resource content types
// Test: tool definitions include annotations (readOnlyHint, destructiveHint)
// Test: notifications/cancelled aborts in-progress tool call
// Test: tools/list supports cursor-based pagination
// Test: Prometheus mcp_tool_call_duration histogram recorded
// Test: Prometheus mcp_connection_state gauge updated
```
