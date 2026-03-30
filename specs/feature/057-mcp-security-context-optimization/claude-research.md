# Research Findings — Feature 057: MCP Security, Context Optimization & MCP Expansion

## 1. Existing MCP Implementation (Codebase Research)

### 1.1 SSP as MCP Server (Node.js)

**Files:**
- `apps/web/server/_core/mcpPublicServer.ts` (1,031 lines) — 28-tool public API via JSON-RPC 2.0
- `apps/web/server/_core/mcpRoutes.ts` (472 lines) — Workspace + Python tool bridge
- `apps/web/server/_core/mcp.ts` — File I/O utilities, audit logging
- `apps/web/server/services/agencyMcpService.ts` — Tool formatting and URL validation

**Capabilities:**
- Skills tools: list, execute, detect
- Agency tools: list, invoke, status
- Workspace tools: read_file, write_file, list_files
- Orchestrator tools: 4 room action tools
- Session management: 30-min TTL, in-process Map (not Redis-backed)
- Scope-based access: `mcp:read`, `mcp:write`
- Rate limiting via `MCP_RPM` env var

### 1.2 SSP as MCP Client (Python)

**Files:**
- `python-backend/app/services/mcp_client.py` (210 lines) — Async HTTP-only client
- `python-backend/app/tools/mcp_adapter.py` — Bridge agency-swarm ↔ MCP tools
- `python-backend/app/orchestrator/node_executors/integration_executors/mcp_executor.py` — Workflow MCP node

**Capabilities:**
- HTTP-based JSON-RPC client with 60s discovery cache
- SSRF protection defined (`_validate_mcp_url`) but NEVER CALLED (F01/F02)
- Per-agent MCP server config via `agencyAgents.mcpServers` JSONB + `mcpServerTokensEncrypted`

### 1.3 Python MCP Servers

- `python-backend/app/mcp/google_drive_mcp.py` — Google Drive integration
- `python-backend/app/mcp/onedrive_mcp.py` — OneDrive integration
- `python-backend/app/mcp/browser_tools_mcp.py` — Browser automation tools
- `python-backend/app/api/internal_mcp.py` — Internal MCP API endpoint

### 1.4 Database Schema (MCP-related)

```typescript
agencyAgents: {
  mcpServers: jsonb,  // Array<{ url, name, transport }>
  mcpServerTokensEncrypted: text  // AES-GCM encrypted token map
}
```

## 2. Security Audit Findings

### 2.1 Python Backend — 26 Vulnerabilities

**CRITICAL (6):**
| ID | File | Finding |
|----|------|---------|
| F07 | mcp_executor.py:50 | Zero SSRF protection — server_url from config, no validation |
| F08 | mcp_executor.py:26 | No auth check — executor trusts DB config without permission verification |
| F16 | onedrive_mcp.py:103 | OData injection — user query in `search(q='{query}')` |
| F17 | onedrive_mcp.py:271 | Path injection — sheet_name/cell_range in URL path unescaped |
| F22 | browser_tools_mcp.py:150 | Command injection — allowlist checks only `command.split()[0]` |
| F23 | browser_tools_mcp.py:99 | User-controlled `allowed_domains` — no server-side SSRF blocklist |

**HIGH (11):**
| ID | File | Finding |
|----|------|---------|
| F01 | mcp_client.py:78 | `_validate_mcp_url` never called in `discover_tools` |
| F02 | mcp_client.py:147 | `_validate_mcp_url` never called in `call_tool` |
| F03 | mcp_client.py:66 | Cross-tenant cache pollution — global dict, no tenant_id key |
| F09 | mcp_executor.py:183 | Server URL exposed in output metadata |
| F10 | mcp_executor.py:192 | Full exception message (hostname, ports) returned to caller |
| F13 | google_drive_mcp.py:122 | Incomplete Drive query escaping — operators not blocked |
| F15 | google_drive_mcp.py:398 | Raw API response returned including owners email |
| F18 | onedrive_mcp.py:436 | Raw Graph API response with email, parentReference |
| F20 | onedrive_mcp.py:186 | `follow_redirects=True` — SSRF via redirect chaining |
| F24 | browser_tools_mcp.py:93 | Gateway URL defaults to localhost:3000 |
| F26 | internal_mcp.py:61 | Tool list returned without auth when user_id=None |

**MEDIUM (9):** F04, F05, F06, F11, F12, F14, F19, F21, F25, F27, F28, F29

### 2.2 Node.js Backend — 28 Vulnerabilities

**CRITICAL (4):**
| ID | File | Finding |
|----|------|---------|
| M01 | mcpRoutes.ts:252 | Tenant injection — tenantId from x-tenant-id header for session users |
| M07 | mcpPublicServer.ts:684 | Missing x-proxy-token on agency.tools.call proxy |
| M08 | mcpPublicServer.ts:1027 | Session users bypass all scope checks |
| M16 | mcp.ts:89 | Auth bypass when GATEWAY_KEY unset — `if (!GATEWAY_KEY) return true` |

**HIGH (12):**
| ID | File | Finding |
|----|------|---------|
| M02 | mcpRoutes.ts:30 | Write token opt-in — session users write files by default |
| M03 | mcpRoutes.ts:22 | Path traversal — extensionless files bypass allowlist |
| M04 | mcpRoutes.ts:344 | Cross-user tool cache — shared across all users within TTL |
| M09 | mcpPublicServer.ts:563 | Session fixation — revoked API key works for 30 min |
| M10 | mcpPublicServer.ts:671 | IDOR — agency.tools.call lacks tenant ownership check |
| M11 | mcpPublicServer.ts:831 | Fallthrough returns raw args for unimplemented tools |
| M12 | mcpPublicServer.ts:776 | IDOR — orchestrator tools accept unverified actor_assistant_id |
| M17 | mcp.ts:21 | .env in default WRITE extension allowlist |
| M18 | mcp.ts:21 | .env in default READ extension allowlist |
| M19 | mcp.ts:164 | Control Plane URL SSRF — sessionId/key unvalidated |
| M23 | agencyMcpService.ts:41 | Tool name injection via agencyId/toolId |
| M26 | mcpRoutes.ts:468 | Duplicate route registration — /mcp/ aliases |

**MEDIUM (8):** M05, M06, M13, M14, M20, M21, M24, M27, M28

## 3. Cross-System Interaction Risks

### 3.1 MCP ↔ Agency Orchestrator
- **XSY-H1** (HIGH): MCP response prompt injection → soft-loop. External server returns instruction text that drives agent to loop.
- **A-4** (MEDIUM): No per-tool invocation counter — LLM retries failing MCP tool until iteration budget exhausted.
- **A-1** (MEDIUM): Timeout returns success string — orchestrator can't distinguish timeout from real result.

### 3.2 MCP ↔ Autonomous Executor
- **XSY-H2** (HIGH): Reflection loop amplifies MCP costs — no incremental credit check at replan boundaries.
- **B-3** (MEDIUM): MCP calls are credit-free regardless of volume.

### 3.3 MCP ↔ Skills System
- **XSY-H3** (HIGH): MCP → skill-executor double-hop creates uncapped secondary LLM calls.
- **C-2** (MEDIUM): No `tool_chain_depth` counter across MCP→skill→run chains.

### 3.4 MCP ↔ Agency-Call Tool
- **XSY-C2** (CRITICAL): Circular agency call across MCP boundary — loop detection bypassed because MCP creates new `parent_run_id`.
- **XSY-H4** (HIGH): `currentDepth` resets to 0 across MCP boundary.

### 3.5 MCP ↔ Guardrails
- **XSY-H5** (HIGH): MCP tool call parameters bypass input guardrails.
- **XSY-H6** (HIGH): MCP responses enter agent context without output guardrail validation.

### 3.6 MCP ↔ Rate Limiting
- **XSY-H7** (HIGH): No per-run or per-tenant MCP call rate limit — 500+ calls possible in single run.

### 3.7 MCP ↔ Long-term Memory
- **XSY-H8** (HIGH): MCP-sourced confidential data persists in `agency_agent_memories` via memory extraction.
- **XSY-H9** (MEDIUM): MCP response crafted to inject false facts into memory.

### 3.8 MCP ↔ Audit
- **XSY-C1** (CRITICAL): MCP tool calls NOT recorded in `agencyRunTraces` — no audit trail for external data flow.

## 4. MCP Spec 2025-03-26 Compliance

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| 15 | Batch requests (MUST) | NO — handler crashes on array | CRITICAL |
| 1 | Protocol version negotiation | PARTIAL | HIGH |
| 2 | Capability negotiation | PARTIAL | HIGH |
| 11 | Content types (image/audio/resource) | PARTIAL — text only | HIGH |
| 16 | Session management (DELETE, HTTP 404) | PARTIAL | HIGH |
| 3 | Pagination (cursor) | NO | MEDIUM |
| 6 | Cancellation | NO | MEDIUM |
| 12 | Annotations | NO | MEDIUM |
| 17 | Backward compat (SSE fallback) | NO | MEDIUM |

## 5. Context Management Analysis

### 5.1 Current Mechanisms

| System | Mechanism | Limit | Enforced? |
|--------|-----------|-------|-----------|
| ReAct Executor | Token budget | 100K tokens | YES — stops execution |
| Per-iteration | Token limit | 8K tokens | YES |
| Tool response | Truncation | 51.2K chars | YES |
| Node result | Truncation | 50K chars | YES |
| External context | JSON cap | 4K chars | YES |
| Long-term memory | Per-entry cap | 500 chars × 20 | YES |
| Working memory | Observation cap | 50 items, 500 chars | YES |
| Chat promptComposer | Budget profiles | ~16K target | ADVISORY |
| Chat memoryService | Summarization | Buffer 20 msgs | YES |
| Kilo CLI | auto_condense | 80% threshold | YES — CLI only |

### 5.2 Context Bloat Points

1. **Agency ReAct: No summarization** — full message history every iteration. Hits 100K at iteration 8.
2. **Tool schemas: 7,125 tokens** for 25 tools per turn, no deferred loading.
3. **Long-term memory: SQL-based** — retrieves by confidence, not semantic relevance. Wastes tokens on irrelevant memories.
4. **Chat: No token counting** — `buildChatContext()` loads 20 messages without measuring.
5. **Few-shot: No filtering** — all examples injected regardless of task relevance.
6. **RAG: No deduplication** — overlapping chunks enter context.
7. **auto_condense: Not wired** into agency execution path (only Kilo CLI).

### 5.3 Worst-Case Per-Turn Token Budget

| Component | Tokens |
|-----------|--------|
| Agent instructions + shared | 1,325 |
| Tool schemas (25 tools) | 7,125 |
| Few-shot examples (5) | 2,000 |
| Guardrails (5) | 425 |
| Working memory | 1,250 |
| Long-term memory | 625 |
| Knowledge base (5 docs) | 375 |
| Execution context | 1,250 |
| User task | 250 |
| Tool results (mid-loop) | 2,500 |
| **Total** | **~17,000** |

## 6. Vector Database Implementation (Existing)

### 6.1 Storage Providers
- **pgvector** (primary): PostgreSQL extension, HNSW indexing, tenant RLS
- **Cloudflare Vectorize** (secondary): REST API, provider switch mechanism
- **ChromaDB** (legacy): Local persistence, used for episodic memory

### 6.2 Embedding Service
- Local MiniLM (384D) — no API key required
- OpenAI Ada/3-Small/3-Large (1536D/3072D)
- Cohere English/Multilingual (1024D)
- Caching: Redis + LRU

### 6.3 RAG System
- Hybrid: BM25 + Vector + CrossEncoder re-ranking
- Smart chunker: parent-child pattern, 1024/400 token chunks
- Scope engine: user/group/tenant/global access control

### 6.4 Tables
- `library_chunk_vectors` — document chunks with embeddings
- `VectorCollection` — collection metadata
- `VectorDocument` — document metadata with content_hash
- `EmbeddingJob` — batch embedding tracking

## 7. Infrastructure Findings

### 7.1 systemd
- `KillMode=mixed` leaves orphaned stdio children on crash/restart
- No `LimitNOFILE` or `LimitNPROC` set for subprocess safety

### 7.2 Nginx
- No dedicated MCP SSE location block — `proxy_buffering` not off for MCP routes
- OAuth callback route `/auth/mcp/callback` not explicitly configured

### 7.3 Celery
- Workers cannot access stdio subprocesses (separate Docker namespace)
- Prefork model incompatible with async MCP client
- Must call MCP via HTTP proxy, not stdio directly

## 8. DeerFlow Comparison (External Research)

### 8.1 Features SSP Lacks
- Middleware pipeline: 14-layer composable system (summarization, loop detection, dangling tool calls)
- Context summarization: auto-compress at token threshold
- Deferred tool registry: show names only, fetch schema on demand
- MCP via langchain-mcp-adapters: auto-convert MCP tools to LangChain
- stdio transport: subprocess-based local MCP servers
- Loop detection: hash-based sliding window (3 warn / 5 hard-stop)

### 8.2 Features SSP Already Exceeds DeerFlow
- Visual graph builder (15 node types)
- Enterprise features (multi-tenant, credits, guardrails, versioning)
- Autonomous Plan/Execute/Reflect (Level 3)
- Comprehensive sandbox (OpenSandbox, Live Browser)
- 3-level memory system (working + long-term + shared context)

## 9. Testing Infrastructure

- **TypeScript**: Vitest, 80% coverage target
- **Python**: pytest with markers (unit, integration, e2e, auth, credits, llm)
- **Existing MCP tests**: 6 test files covering server, tools, browser, Drive, integration
- **Coverage enforcement**: 80% minimum in Python
