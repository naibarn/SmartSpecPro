# Section 04: MCP LLM Parity and Auth Normalization

## Ownership

This section owns the decision and implementation path for `smartspec.llm.*` MCP tools, plus the identity normalization rules for `/v1/mcp` sessions.

## Target files and modules

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/middleware/requireScopes.ts`
- `apps/web/server/_core/authz.ts`
- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`

## Scope

- decide whether `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models`:
  - become real proxy handlers
  - or are hidden/removed until real support exists
- normalize session identity for supported auth modes
- ensure MCP session creation does not assume API-key-only identity fields
- keep MCP discovery, runtime behavior, and public positioning aligned

## TDD expectations

- start with tests that fail on placeholder LLM parity behavior
- add identity-normalization tests for API-key, bearer, and internal-token callers if those modes remain supported
- add scope/permission tests so MCP cannot quietly inherit broader access than intended

## Acceptance checks

- MCP discovery is truthful
- supported auth modes create valid tenant-safe sessions
- unsupported parity claims are removed rather than implied

## Risks and coordination notes

- if implementing real MCP LLM handlers would materially delay worker control-plane delivery, prefer hiding placeholder tools in this phase
- keep the chosen auth model simple and documented
