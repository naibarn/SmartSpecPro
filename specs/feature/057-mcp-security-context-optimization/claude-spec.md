# Synthesized Specification — Feature 057

## What We're Building

A three-wave improvement to SmartSpecPro's MCP subsystem and LLM context management:

1. **Wave 1 — Security Hardening:** Fix 16 CRITICAL + 46 HIGH vulnerabilities found in existing MCP code across Python and Node.js backends. Fix MCP spec compliance gaps (batch requests MUST requirement).
2. **Wave 2 — Context Optimization:** Reduce agency context consumption by ~50% through summarization, deferred tool loading, vector-based memory retrieval, and chat token counting.
3. **Wave 3 — MCP Expansion:** Add centralized MCP server registry, stdio transport (via OpenSandbox), OAuth 2.1, deferred tool registry, hot-reload, and advanced MCP spec features.

## Why

### Security
Deep audit found **10 CRITICAL vulnerabilities in currently deployed code** — including SSRF validation functions that are defined but never called, command injection via partial allowlist checks, and auth bypasses when environment variables are unset. These must be fixed before any MCP expansion to prevent the new features from amplifying existing attack surfaces.

### Context Optimization
Agency runs hit the 100K token budget at iteration 8, causing premature termination. Tool schemas alone consume 7,125 tokens/turn for 25 tools. Long-term memory retrieves by SQL confidence ranking, not semantic relevance, wasting tokens on irrelevant memories. The existing `auto_condense` mechanism in `context_manager.py` is not wired into the agency execution path.

### MCP Expansion
External MCP server integration is per-agent JSONB with no centralized management, no stdio transport, no OAuth, and no admin UI. DeerFlow's middleware-based approach (summarization, loop detection, deferred tools) provides proven patterns to adopt.

## Design Decisions (from Interview)

1. **Fix scope:** CRITICAL + HIGH only (62 items). MEDIUM/LOW deferred to separate work.
2. **stdio isolation:** OpenSandbox Docker containers — reuse existing infrastructure for maximum security.
3. **Summarization model:** Use existing dynamic LLM provider selection (by priority/health) — not hardcoded to a specific model.
4. **Plan scope:** All 3 waves in one plan, including full MCP expansion (6 phases).

## Constraints

- Multi-tenant SaaS: all changes must maintain tenant isolation
- Encryption: secrets use AES-256-GCM via `LLM_ENCRYPTION_KEY` (shared Node.js + Python)
- Services managed by systemd (not Docker for main apps)
- Nginx reverse proxy required for all external access
- 80% test coverage enforced for Python
- Existing vector DB (pgvector) must be leveraged for memory optimization
- Feature flags required for phased rollout
- Database Safety Protocol must be followed for all schema changes

## Success Criteria

- Zero CRITICAL/HIGH security vulnerabilities in MCP code post-Wave 1
- Agency context size reduced by ~50% (17K → ~8.4K tokens/turn) post-Wave 2
- MCP spec 2025-03-26 compliance for all MUST requirements
- External MCP server support with centralized registry + admin UI post-Wave 3
- stdio, HTTP, and Streamable HTTP transport support
- OAuth 2.1 for authenticated MCP servers
