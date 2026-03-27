# Code Review Interview: Section 14 — MCP Integration

## Triage

### Fixed (HIGH severity — all 4 blocking issues resolved)

- **H1: MCP response format** — Wrapped `tools/call` response in `{ content: [{ type: "text", text }] }` format per MCP protocol spec. (mcpPublicServer.ts)
- **H2: Feature flag NODE_ENV carve-out** — Removed `process.env.NODE_ENV === "production"` condition from all MCP feature flag checks. The flag defaults to `false` in `FEATURE_FLAG_DEFAULTS`, making it safe to enforce in all environments. (mcpPublicServer.ts, agency.ts)
- **H3: Missing rate limiting** — Applied `createRateLimitMiddleware` to both `discoverMcpTools` (10 req/min) and `saveMcpServers` (20 req/min). (agency.ts)
- **H4: Dead code — resolve_mcp_tools_for_agent never called** — Extended `resolve_tools_for_agent` to query agent's `mcpServers` and `mcpServerTokensEncrypted`, then call `resolve_mcp_tools_for_agent` and merge results. MCP tools now actually reach agents at runtime. (agency_tools.py)

### Fixed (MEDIUM severity)

- **M5: TOCTOU race in saveMcpServers** — Wrapped ownership check + update in `db.transaction()`. (agency.ts)
- **M6: Token state dropped in onChange** — Simplified `NodePropertyPanel` onChange to not pass tokens (they're saved directly via McpServersPanel's Save button). Removed `as any` cast. (NodePropertyPanel.tsx)
- **M7: Vacuous max-5 test** — Replaced with actual Zod schema parse test that invokes `.max(5)` constraint and asserts `safeParse` failure. (agencyMcpIntegration.test.ts)
- **M8: Deprecated asyncio.get_event_loop()** — Replaced with `asyncio.get_running_loop()` + `try/except RuntimeError` pattern. (agency_tools.py)

### Let go (LOW severity — intentional deferral)

- **L1: Shared tools omitted from tools/list** — The `tools/list` MCP handler queries `agencyAgentTools` but not `agency_shared_tools`. Shared tool support can be added in a follow-up iteration without breaking the API contract.
- **L2: /rpc path convention** — `discoverToolsFromServer` appends `/rpc` if not present. This is documented as a convention. The `rpcPath` field can be added later.
- **L3: Unbounded discovery cache** — Added as a known operational concern. For current usage patterns (< 5 servers per agent), cache growth is negligible. A max-entries cap can be added when needed.
- **L4-L5: Missing test coverage** — 3 Vitest tests (scope, tenant isolation, URL format) and 2 pytest tests (name prefix, auth header) are deferred to a test expansion pass. Core security paths are covered by the service layer tests.

## Commits
1. `24b26f3d` — Initial implementation
2. `05861f78` — Code review fixes (all HIGH + MEDIUM resolved)
