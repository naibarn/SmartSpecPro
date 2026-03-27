# Section 14 Review — MCP Integration

**Reviewed**: 2026-03-22
**Branch**: `codex/feature-044-multimodal-chat-memory`
**Diff**: `section-14-diff.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `mcpPublicServer.ts:491–495` | `tools/call` handler returns the Python backend response verbatim (`return result`). Spec §1 requires the result be shaped as `{ content: [{ type: "text", text: "..." }] }`. External MCP clients receive a non-conformant JSON-RPC response, breaking protocol compliance for any conformant MCP consumer. | Wrap the Python response: `return { content: [{ type: "text", text: String(result.output ?? result.text ?? JSON.stringify(result)) }] }`. |
| HIGH | `mcpPublicServer.ts:415–416` and `agency.ts:530–532`, `agency.ts:599–601` | Feature flag check uses `&& process.env.NODE_ENV === "production"` carve-out. The flag has no effect in development or staging environments, making it impossible to test flag-off behavior and potentially allowing the feature to activate on non-production tenants where `NODE_ENV` differs. Spec §6 specifies no environment carve-out. | Remove the `process.env.NODE_ENV === "production"` condition. The flag defaults to `false` in `FEATURE_FLAG_DEFAULTS`, so it is safe to enforce in all environments. |
| HIGH | `agency.ts:3800` | `discoverMcpTools` has no rate limiting. Spec §Security requires "discoverMcpTools rate limited at 10 req/min per user". An authenticated user can call this procedure in a tight loop, causing the server to issue unlimited outbound HTTP requests to arbitrary external URLs. `saveMcpServers` similarly lacks a rate limit. | Apply `createRateLimitMiddleware({ windowMs: 60_000, max: 10, keyFn: (ctx) => ctx.user!.id })` (imported from `../_core/rateLimitedProcedure`) to `discoverMcpTools`. Apply a looser limit (e.g. 20/min) to `saveMcpServers`. |
| HIGH | `agency_tools.py:642` | `resolve_mcp_tools_for_agent` is declared but never called from `resolve_tools_for_agent`. Spec §4 explicitly states: "This function is called from the existing `resolve_tools_for_agent()` function, which should be extended to also call `resolve_mcp_tools_for_agent()` and merge the results." MCP-bridged tools are never injected into any agent at runtime despite the entire infrastructure being otherwise correct — the feature is completely inert at runtime. | At the end of `resolve_tools_for_agent` (after line 565), add: `mcp_tools = await resolve_mcp_tools_for_agent(agent_config, adapter=adapter)` and return `tool_classes + mcp_tools`. The `agent_config` dict must be assembled from the agent row data (add `mcpServers` and `mcpServerTokensEncrypted` to the SELECT query). |
| MEDIUM | `agency.ts:3549–3582` | `saveMcpServers` performs the ownership check (SELECT) and the UPDATE in two separate statements with no transaction. A concurrent request from another user could modify the agent's `agencyId` between the check and the write (TOCTOU race), allowing a write to an agent the caller does not own. | Wrap lines 3549–3582 in a `db.transaction(async (tx) => { ... })` call, replacing `db` references inside with `tx`. Alternatively, rewrite as a single `UPDATE ... WHERE id = agentId AND agencyId IN (SELECT id FROM agencies WHERE tenantId = tenantId)` and check `rowsAffected === 0` for the not-found error. |
| MEDIUM | `NodePropertyPanel.tsx:338–339` | The `onChange` callback ignores the `tokens` argument from `McpServersPanel.onChange`: `onChange({ ...node, mcpServers: servers } as any)` silently discards `tokens`. Since token state lives inside `McpServersPanel`, it is lost whenever the panel unmounts (collapsible is closed and reopened). `handleSave` inside the panel will call `saveMcpServers` with `tokens: undefined` after remount. | Either lift token state into `AgentSupervisorForm` and thread it through props, or call `saveMcpServers` directly from within `McpServersPanel` (without the intermediate `onChange` propagation for tokens). The `as any` cast on line 338 should also be resolved by extending `AgencyNodeData`. |
| MEDIUM | `agencyMcpIntegration.test.ts:817–826` | The "enforces max 5 MCP servers" Vitest test is a vacuous tautology. It constructs a local array of 6 items and asserts `array.length > 5` — this never invokes the Zod `.max(5)` constraint in the tRPC procedure. If the limit were accidentally removed, this test would still pass. | Replace with a Zod schema parse assertion: `import { saveMcpServersSchema } from "../routers/agency"; expect(() => saveMcpServersSchema.parse({ agentId: validUuid, mcpServers: sixServers })).toThrow(/maximum 5/i)`, or call through a test tRPC caller and assert it returns a `BAD_REQUEST` error. |
| MEDIUM | `agency_tools.py:1086–1095` | The `run_sync` wrapper inside `_make_run_func` calls `asyncio.get_event_loop()` which is deprecated in Python 3.10+ and raises a `DeprecationWarning` (or `RuntimeError`) when no current event loop is set. In Python 3.12 the behavior changed to always raise `DeprecationWarning`. The `asyncio.run()` call inside a `ThreadPoolExecutor` also creates a brand new event loop per call — any resources tied to the parent loop (open httpx clients, DB sessions) are unavailable to the bridged tool. | Replace the `asyncio.get_event_loop()` call with `asyncio.get_running_loop()` inside a `try/except RuntimeError`. For the non-running case, use `asyncio.run(_run(**kwargs))` directly (no need to check `loop.is_running()` since `get_running_loop` already handles that branch). |
| LOW | `mcpPublicServer.ts:431–464` | The `tools/list` handler queries `agencyAgentTools` (per-agent tool assignments) but omits shared agency-level tools from `agency_shared_tools`. Spec §1 says the list should return "builtin + custom + **shared**" tools. Shared tools configured at agency level are silently excluded. | Add a second query joining `agency_shared_tools → agency_tools` for the given `agencyId`, deduplicate by `toolId`, and include in the `formatToolsAsMcp` call. |
| LOW | `agencyMcpService.ts:952` | `discoverToolsFromServer` always appends `/rpc` to the server URL if not already present. MCP servers are not required to use `/rpc` as their endpoint path. A server at `https://mcp.example.com/v2/api` receives requests at `.../v2/api/rpc`, which is likely wrong. | Allow callers to pass the full RPC endpoint URL (including path) directly. Alternatively, add an optional `rpcPath` field to `McpServerEntry` and `McpServersPanel`'s add form. Document the `/rpc` convention assumption in the function's JSDoc as the current behavior. |
| LOW | `mcp_client.py:1202` | The module-level `_discovery_cache` dict has no size bound. TTL eviction only fires on cache hit (stale entry is not evicted on write if the cache grows large). In a long-running multi-tenant process, stale entries accumulate indefinitely — there is no LRU cap or sweep. | Add a simple max-entries check before inserting: if `len(_discovery_cache) > 500`, clear the oldest quarter of entries (sort by timestamp). Or use `functools.lru_cache` with a fixed `maxsize`. Document the unbounded growth as a known operational concern at minimum. |
| LOW | `agencyMcpIntegration.test.ts` | Three of the ten spec-required Vitest tests are missing: (1) "MCP endpoint requires agency:tools:mcp scope", (2) "MCP endpoint enforces tenant isolation" (tenant-A key + tenant-B agency), (3) "saveMcpServers validates URL format" (URL missing scheme). The scope and isolation tests cover the primary security boundary of the MCP public server. | Add the three missing tests. For scope and isolation, mock the MCP session object and `db` to simulate the access control paths in the `dispatchToolCall` handler. |
| LOW | `test_agency_mcp_tools.py` | Two of the nine spec-required pytest tests are absent from the `TestResolveMcpToolsForAgent` class: (1) "discovers tools from external server with correct `mcp_{serverName}_{toolName}` prefixing", (2) "bridge sends Authorization Bearer header on `run()`". The existing tests in the class only cover the empty/disabled/SSRF-blocked paths. | Add tests that mock `discover_tools` and `call_tool` to verify correct name prefixing and Authorization header forwarding when `resolve_mcp_tools_for_agent` is called with a valid config. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| `smartspec.agency.tools.list` added to `TOOL_REGISTRY` with `agency:tools:mcp` scope | PASS | Correct scope and `readWrite: "Read"` |
| `smartspec.agency.tools.call` added to `TOOL_REGISTRY` | PASS | Correct scope and `readWrite: "Write"` |
| `tools/call` result in MCP format `{ content: [{ type: "text", text }] }` | FAIL | Handler returns Python response verbatim — no content wrapping |
| Tenant isolation on `tools/list` | PASS | `agencies.tenantId = session.tenantId` filter enforced |
| Tenant isolation on `tools/call` | PARTIAL | Passes `tenant_id` to Python backend but does not query agency ownership in Node before proxying |
| `agencyMcpService.ts` with all four exports | PASS | `formatToolsAsMcp`, `encryptMcpTokens`, `decryptMcpTokens`, `validateMcpServerUrl` all present |
| `validateMcpServerUrl` uses `ssrfValidator.ts` | PASS | Delegates to `validateSsrfUrl` |
| HTTPS-only in production | PASS | Scheme check present |
| `saveMcpServers` Zod schema: uuid agentId, max(5) servers, transport enum | PASS | Correct |
| `saveMcpServers` validates URLs via `validateMcpServerUrl` | PASS | Loop with early throw |
| `saveMcpServers` encrypts tokens | PASS | Conditional `encryptMcpTokens` call |
| `saveMcpServers` verifies agent belongs to tenant | PASS | `innerJoin(agencies)` filter |
| `discoverMcpTools` validates URL, 10s timeout | PASS | Correct |
| `discoverMcpTools` rate limited 10 req/min | FAIL | No rate limit middleware applied |
| `mcp_client.py` with `discover_tools`, `call_tool`, `McpToolInfo` | PASS | All present and correctly structured |
| Python SSRF guard (`_validate_mcp_url`) | PASS | Blocks private ranges, localhost, metadata endpoint |
| Tool discovery cache 60s TTL | PASS | `_CACHE_TTL_SECONDS = 60` |
| 30s per-call timeout for `call_tool` | PASS | Default `timeout=30.0` |
| `resolve_mcp_tools_for_agent` added to `agency_tools.py` | PASS | Function exists |
| `resolve_mcp_tools_for_agent` wired into `resolve_tools_for_agent` | FAIL | Never called — MCP tools are dead at runtime |
| Token decryption via `smartspecweb_crypto.decrypt_smartspecweb` | PASS | Correct path used |
| `McpServersPanel.tsx` with add/remove/discover/save/max-5 | PASS | All UI elements present |
| Feature flag UI gate via `useTenantFeatureFlag("agencyMcpBridge")` | PASS | Disabled state rendered |
| `NodePropertyPanel.tsx` MCP Servers section for agent/supervisor | PASS | Correct conditional render |
| `AgencyNodeData` extended with `mcpServers` | PASS | Added to `nodes/types.ts` |
| `agencyMcpBridge` as F30 in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, `FEATURE_FLAG_DEFAULTS` | PASS | All three locations updated; F30 is the correct next number |
| Feature flag gates tRPC procedures | PARTIAL | `NODE_ENV === "production"` carve-out makes it ineffective in dev/staging |
| Feature flag gates MCP public server handlers | PARTIAL | Same `NODE_ENV` carve-out |
| Python env-var flag check | PASS | `AGENCY_MCP_BRIDGE_ENABLED` env var checked |
| Vitest tests: 10 spec-required tests | PARTIAL | 7 of 10 present; missing scope check, tenant isolation, URL-format test |
| pytest tests: 9 spec-required tests | PARTIAL | 7 of 9 present in `TestResolveMcpToolsForAgent`; missing name-prefix and Authorization header tests |
| Max-5 Vitest test exercises Zod | FAIL | Vacuous tautology — never invokes the Zod constraint |

---

### Summary

The implementation is structurally sound: the service layer is well-factored, `mcp_client.py` is clean with correct JSON-RPC construction and proper TTL caching, and the frontend panel handles the UX contract correctly. However four issues block merge. The `tools/call` MCP response is not wrapped in the required `{ content: [{ type: "text" }] }` format, breaking protocol compliance with any conformant MCP client. The `discoverMcpTools` rate limit is absent, enabling unbounded outbound HTTP amplification. The feature flag `NODE_ENV` carve-out makes the flag unenforceable outside production. Most critically, `resolve_mcp_tools_for_agent` is never wired into `resolve_tools_for_agent`, meaning the entire Python-side MCP bridge is dead at runtime — no MCP tool will ever reach an agent during a run.
