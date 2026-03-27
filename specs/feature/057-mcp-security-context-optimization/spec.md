# Feature 057: MCP Security Hardening, Context Optimization & MCP Expansion

## Overview

Comprehensive security hardening of existing MCP code (10 CRITICAL + 46 HIGH vulnerabilities found in audit), context window optimization leveraging vector database for 50% token reduction, and full MCP protocol expansion to match DeerFlow capabilities.

## Problem Statement

### Security (Wave 1)
Deep audit of existing MCP code found **16 CRITICAL vulnerabilities** across Python and Node.js:
- `mcp_executor.py`: Zero SSRF protection + no auth (F07/F08)
- `mcp_client.py`: SSRF validation defined but never called (F01/F02)
- `browser_tools_mcp.py`: Command injection via partial allowlist (F22)
- `onedrive_mcp.py`: OData/path injection (F16/F17)
- `mcp.ts`: Auth bypass when GATEWAY_KEY unset (M16)
- `mcpRoutes.ts`: Tenant injection via x-tenant-id header (M01)
- `mcpPublicServer.ts`: Session users bypass all scope checks (M08)
- `mcpPublicServer.ts`: Missing proxy auth on agency.tools.call (M07)

### Context Optimization (Wave 2)
- Agency ReAct executor has NO context summarization — hits 100K budget at iteration 8
- Tool schemas consume 7,125 tokens/turn (25 tools) with no deferred loading
- Long-term memory uses SQL ORDER BY confidence, not semantic relevance
- Chat buildChatContext() loads 20 messages without token counting
- Few-shot examples injected without relevance filtering
- RAG results have no deduplication

### MCP Expansion (Wave 3)
- No centralized MCP server registry (per-agent JSONB only)
- No stdio transport support
- No OAuth 2.1 for MCP servers
- No deferred tool registry for token savings
- MCP spec 2025-03-26 compliance gaps (batch requests, session management)

## Architecture

### Wave 1: Security Hotfixes
- Fix 26 Python vulnerabilities (F01-F29)
- Fix 16 Node.js vulnerabilities (M01-M28)
- MCP spec MUST compliance (batch requests, protocol negotiation)
- Infrastructure fixes (systemd KillMode, TimeoutStopSec)

### Wave 2: Context Optimization
- Agency context summarizer (auto-condense at 70% budget)
- Deferred tool registry (show names only, load schema on demand)
- Vector-based long-term memory retrieval (pgvector semantic search)
- Chat token counting + budget enforcement
- Few-shot relevance filtering via embeddings
- RAG result deduplication

### Wave 3: MCP Expansion (6 phases)
- Phase 1: Centralized MCP server registry + Admin UI + Builder UI
- Phase 2: stdio + Streamable HTTP transport
- Phase 3: OAuth 2.1 support
- Phase 4: Deferred tool registry (production)
- Phase 5: Hot-reload + langchain-mcp-adapters
- Phase 6: Content types + monitoring + advanced spec

## Affected Systems

### Python Backend
- `app/services/mcp_client.py` — SSRF fix + tenant cache
- `app/services/agency_tools.py` — tool dispatch + deferred loading
- `app/services/agency_orchestrator.py` — context summarization integration
- `app/services/long_term_memory.py` — vector-based retrieval
- `app/services/agency_few_shot.py` — relevance filtering
- `app/services/working_memory.py` — memory injection optimization
- `app/orchestrator/node_executors/integration_executors/mcp_executor.py` — SSRF + auth
- `app/mcp/onedrive_mcp.py` — injection fixes
- `app/mcp/browser_tools_mcp.py` — command injection fix
- `app/mcp/google_drive_mcp.py` — query escaping
- `app/api/internal_mcp.py` — auth enforcement
- `app/kilo/context_manager.py` — wire into agency path

### Node.js Backend
- `server/_core/mcp.ts` — auth bypass + .env allowlist
- `server/_core/mcpPublicServer.ts` — scope enforcement + IDOR fixes
- `server/_core/mcpRoutes.ts` — tenant injection + cache + write token
- `server/services/agencyMcpService.ts` — assertPublicIp + tool name validation
- `server/services/chatService.ts` — token counting + summarization
- `server/services/promptComposer.ts` — budget enforcement
- `server/services/memoryService.ts` — summarization improvements

### Database
- `agency_agent_memories` — ADD embedding vector(384) column
- `mcp_servers` — NEW table (Phase 1)
- `mcp_server_assignments` — NEW table (Phase 1)

### Infrastructure
- `docker/systemd/smartspec-backend.service` — KillMode + TimeoutStopSec
- `nginx/conf.d/dev-host.conf` — MCP SSE proxy block

## Security Considerations

- 16 CRITICAL vulnerabilities must be fixed before any MCP expansion
- SSRF protection must use async DNS-resolving `assertPublicIp()` everywhere
- Tenant isolation: `tenantId NOT NULL` on all MCP tables
- OAuth tokens in dedicated encrypted columns (not JSONB)
- stdio subprocess isolation: seccomp + RLIMIT + isolated UID
- Cross-boundary loop detection via X-Agency-Run-Chain header
- Guardrail enforcement on MCP tool params and responses
- MCP tool calls must have audit trail in agencyRunTraces

## Success Metrics

- Zero CRITICAL/HIGH security vulnerabilities in MCP code
- Agency context size reduced by 50% (17K → 8.4K tokens/turn)
- Agency runs extend from 8 to 15+ iterations within same budget
- MCP spec 2025-03-26 compliance for all MUST requirements
- External MCP server support with centralized registry

## Effort Estimate

| Wave | Scope | Effort |
|------|-------|--------|
| Wave 1 | Security hotfixes | 2.5 weeks |
| Wave 2 | Context optimization | 2 weeks |
| Wave 3 | MCP expansion (6 phases) | 14-15 weeks |
| **Total** | | **~19-20 weeks** |
