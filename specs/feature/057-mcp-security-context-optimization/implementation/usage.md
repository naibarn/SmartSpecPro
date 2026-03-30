# Feature 057 — MCP Security & Context Optimization: Usage Guide

## What Was Built

This feature implements comprehensive MCP (Model Context Protocol) security hardening, context optimization, and a full MCP server registry with multi-transport support.

## Components

### Security (Sections 01-04, 15)
- **SSRF protection** in Python MCP client + Node.js routes
- **DNS rebinding prevention** with verify-after-connect approach
- **Auth bypass fixes** in MCP routes (tenant injection, scope bypass, IDOR)
- **Input sanitization** (OData injection, command injection, path traversal)
- **Cross-system protections**: response wrapper, rate limits, loop detection, guardrails

### Spec Compliance (Section 05, 21)
- **MCP 2025-03-26** batch requests, protocol negotiation, session termination
- **Content types**: image/audio content handling in tool responses
- **Tool annotations**: readOnlyHint, destructiveHint, idempotentHint
- **Cursor-based pagination** for tools/list (PAGE_SIZE=50)

### Infrastructure (Section 06)
- systemd KillMode=mixed, TimeoutStopSec, resource limits

### Context Optimization (Sections 07-11)
- **Context summarizer** for auto-condensing long agent conversations
- **Deferred tool registry** for token-efficient tool binding
- **Vector memory** with embedding column + hybrid scoring
- **Chat token counting** with budget enforcement
- **Few-shot RAG** relevance filtering and deduplication

### MCP Server Registry (Sections 12-14, 16)
- **Database schema**: mcp_servers + mcp_server_assignments tables
- **tRPC router**: CRUD with Zod validation and security controls
- **Admin UI**: MCP Server Manager page with health monitoring
- **Feature flags**: MCP_REGISTRY_ENABLED, MCP_STDIO_ENABLED, MCP_OAUTH_ENABLED

### Multi-Transport Client (Sections 17-19)
- **McpClientManager**: HTTP, Streamable HTTP, and stdio transports
- **OAuth 2.1**: client_credentials + authorization_code+PKCE flows
- **Config watcher**: Hot-reload for non-executable changes (60s polling)

### Monitoring (Section 20)
- **Nginx**: proxy_buffering off for MCP SSE in HTTP + HTTPS stanzas
- **/health/mcp** sub-endpoint with server count, connections, stdio processes
- **Prometheus metrics**: mcp_tool_call_duration_seconds, mcp_tool_call_errors_total

### Documentation (Section 21)
- Help pages in EN + TH: `apps/web/docs/help/en/mcp-servers.md`

## Key Files

| Component | File |
|-----------|------|
| MCP Client Manager | `python-backend/app/services/mcp_client_manager.py` |
| OAuth Manager | `python-backend/app/services/mcp_oauth_manager.py` |
| Config Watcher | `python-backend/app/services/mcp_config_watcher.py` |
| MCP Metrics | `python-backend/app/services/mcp_metrics.py` |
| Content Extraction | `python-backend/app/services/mcp_client.py` (`_extract_content`) |
| MCP Public Server | `apps/web/server/_core/mcpPublicServer.ts` |
| tRPC Router | `apps/web/server/routers/mcp.ts` |
| Admin UI | `apps/web/client/src/pages/McpServerManager.tsx` |
| DB Schema | `apps/web/drizzle/schema.ts` (mcpServers, mcpServerAssignments) |
| Nginx | `nginx/conf.d/dev-host.conf` |
| Feature Flags | `apps/web/shared/featureFlags.ts` |

## Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| MCP_REGISTRY_ENABLED | false | Enable MCP server registry |
| MCP_STDIO_ENABLED | false | Enable stdio transport (requires OpenSandbox) |
| MCP_OAUTH_ENABLED | false | Enable OAuth 2.1 flows |

## Testing

```bash
# Run all MCP-related tests
cd python-backend && uv run pytest tests/unit/services/test_mcp_*.py -v

# Individual test suites
uv run pytest tests/unit/services/test_mcp_client_manager.py  # 15 tests
uv run pytest tests/unit/services/test_mcp_oauth_manager.py    # 10 tests
uv run pytest tests/unit/services/test_mcp_config_watcher.py   # 8 tests
uv run pytest tests/unit/services/test_mcp_metrics.py          # 4 tests
uv run pytest tests/unit/services/test_mcp_advanced_features.py # 7 tests
```

## Deferred Items

1. **SSE GET fallback** for Streamable HTTP 4xx responses
2. **Post-connect IP verification** for DNS rebinding (verify-after-connect step 2)
3. **notifications/cancelled** support (requires persistent SSE connection)
4. **JSONB deprecation cutover** (requires separate migration + user approval)
5. **Express OAuth callback route** (/auth/mcp/callback — wired when admin UI integrates)
6. **Redis SCAN for OAuth state lookup** (production optimization)
