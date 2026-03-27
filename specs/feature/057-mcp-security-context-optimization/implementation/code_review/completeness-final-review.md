# Feature 057 — MCP Security & Context Optimization: Final Completeness Review

**Date:** 2026-03-24
**Reviewer:** SmartSpecPro Reviewer Agent (CMD-8)
**Scope:** All 21 sections — cross-cutting wiring, integration completeness, deferred-item tracking, TDD coverage gaps

---

## Review Report

### Verdict: REQUEST_CHANGES

---

### Findings

| Severity | Area | File | Issue | Recommended Fix |
|---|---|---|---|---|
| HIGH | Wiring | `python-backend/app/main.py` | **`McpClientManager` not started or shut down in FastAPI lifespan.** The module singleton (`get_mcp_client_manager()`) exists and is tested in isolation, but is never imported or referenced in `main.py`. There is no startup call to `connect` any servers, and no shutdown call to `disconnect_all()` on lifespan exit. Open sandbox containers created at runtime will be orphaned on process restart, violating the spec's "orphan prevention" requirement (section-17 §Container Lifecycle). The `mcp_metrics.get_mcp_health()` defers to `get_mcp_client_manager()` to count active connections, but since no connections are ever made from the lifespan, the metric will always report zero. | Add `mcp_client_manager = get_mcp_client_manager()` to the lifespan startup block. On shutdown (after `yield`), call `await mcp_client_manager.disconnect_all()` inside a try/except. |
| HIGH | Wiring | `python-backend/app/main.py` | **`McpConfigWatcher` never started.** `mcp_config_watcher.py` implements `start()` and `stop()` coroutines with a 60-second polling loop. Neither is ever scheduled in the FastAPI lifespan or via Celery beat. The hot-reload feature (section-19) is therefore entirely inert at runtime — config changes to `mcp_servers` are never detected. | In the lifespan startup block, create a `McpConfigWatcher` instance and schedule `asyncio.create_task(watcher.start())`. Store the task reference and call `await watcher.stop()` on shutdown. |
| HIGH | Wiring | `python-backend/app/services/agency_tools.py` | **`DeferredToolRegistry` (section-08) is completely unwired from `resolve_mcp_tools_for_agent`.** The `DeferredToolRegistry` class and `prepare_tools()` method were built and unit-tested, but `agency_tools.py` was never modified. No production code imports `DeferredToolRegistry`. Token savings for agents with >10 tools are therefore not realized. The security requirement NEW-03 (tool scope restriction per agent) is also not enforceable until the wiring exists. This was flagged HIGH in the section-08 review and remains unresolved. | Wire `prepare_tools(all_tools)` inside `resolve_mcp_tools_for_agent()` per the spec §Integration Guidance. |
| HIGH | Wiring | `python-backend/app/services/agency_tools.py` | **`mcp_rate_limiter` (section-15) is not called from `_make_run_func`.** The `wrap_mcp_response`, `truncate_response`, `check_run_rate_limit`, `check_tenant_rate_limit`, `scrub_params`, and `PerTurnCounter` implementations all exist and are unit-tested, but `agency_tools.py:_make_run_func` calls `call_tool()` without invoking any of these protections. All seven spec requirements 14.1–14.5, M13, and 14.7 are unmet at runtime. This was flagged HIGH in the section-15 review and remains unresolved. | Apply the rate-limiter chain in `_make_run_func` per section-15 spec §Integration. |
| HIGH | Security | `python-backend/app/services/mcp_client_manager.py:441` | **Shell injection via `echo '{payload}' | cat` in `_call_rpc_stdio`.** Unsanitized JSON is embedded in a shell string. A single-quote in any param value (e.g., `{"q": "it's"}`) breaks out of the echo argument and the remainder is interpreted as a shell command inside the container. RCE risk within the OpenSandbox container. (Flagged HIGH in section-17 review, unresolved.) | Encode payload as base64 before embedding, or use the sandbox's native file-based stdin approach. |
| HIGH | Security | `python-backend/app/services/mcp_client_manager.py:383` | **`httpx.AsyncClient` created per RPC call — no connection pooling.** A new TLS connection is established for every JSON-RPC call. Module docstring claims pooling but implementation contradicts it. (Flagged HIGH in section-17 review, unresolved.) | Create the `AsyncClient` once per `McpConnection` at connect time and reuse it across calls. |
| HIGH | Security | `python-backend/app/services/mcp_client_manager.py:384` | **Response size limit bypassable via chunked transfer encoding.** `resp.content` buffers the full body before the byte count check; chunked responses bypass the pre-download `Content-Length` guard entirely. (Flagged HIGH in section-17 review, unresolved.) | Stream with `aiter_bytes()` and abort when running counter exceeds `MAX_RESPONSE_BYTES`. |
| HIGH | Security | `apps/web/server/routers/mcpServers.ts:327,355` | **IDOR in `update` and `delete` — WHERE clause uses only `id`, not `tenantId`.** The guard SELECT is scoped correctly but the mutation itself is not. (Flagged HIGH in section-13 review, unresolved.) | Add `and(eq(mcpServers.tenantId, ctx.user.tenantId))` to both the `update` and `delete` WHERE clauses. |
| HIGH | Security | `apps/web/server/routers/mcpServers.ts:558` | **`assignToTarget` allows cross-tenant agency assignment.** `targetId` (agency/agent UUID) is inserted without verifying it belongs to the caller's tenant. Admin of tenant A can attach their MCP server to tenant B's agency. (Flagged HIGH in section-13 review, unresolved.) | For `targetType: "agency"`, query the agencies/agencyAgents table to verify `tenantId = ctx.user.tenantId` before inserting. |
| HIGH | Security | `python-backend/app/services/mcp_rate_limiter.py:100` | **INCR/EXPIRE split creates persistent rate-limit key with no TTL on worker crash.** Tenant can be permanently blocked after a process restart. (Flagged HIGH in section-15 review, unresolved.) | Use a pipeline: `pipe.incr(key); pipe.expire(key, window); await pipe.execute()`. |
| HIGH | Security | `python-backend/app/services/mcp_rate_limiter.py:49` | **Truncation math uses character offset, not byte offset.** CJK content from MCP servers can produce a truncated response that encodes to ~3× the `max_bytes` limit. (Flagged HIGH in section-15 review, unresolved.) | Encode to UTF-8 first, slice bytes, decode back. |
| HIGH | Security | `apps/web/server/_core/mcp.ts:277` | **Trace ID in `mcp.ts` not sanitized before writing to audit log.** `mcpRoutes.ts` applies `sanitizeTraceId` but `mcp.ts` writes the raw `x-trace-id` header into both the JSONL audit file and HTTP response body, enabling newline injection to forge audit records. (Flagged HIGH in section-03 review, unresolved.) | Apply the same `sanitizeTraceId` helper used in `mcpRoutes.ts` at `mcp.ts:277`. |
| HIGH | Security | `apps/web/server/_core/mcpRoutes.ts:51` | **Symlink containment not applied in `safeJoin`.** The symlink re-check added to `mcp.ts::resolveWorkspacePath` was not mirrored in `mcpRoutes.ts::safeJoin`, leaving workspace tools in `mcpRoutes.ts` vulnerable to symlink traversal. (Flagged HIGH in section-03 review, unresolved.) | Add `fs.realpathSync` containment re-check to `safeJoin`, gated on `fs.existsSync`. |
| HIGH | Security | `python-backend/app/services/mcp_rate_limiter.py:115` | **`on_tenant_disabled` scans wrong key pattern.** Run keys are written as `mcp:rate:run:{run_id}` but the cleanup scan uses `mcp:rate:run:{tenant_id}:*`, matching nothing. (Flagged HIGH in section-15 review, unresolved.) | Embed `tenant_id` in the run key at write time, or document TTL-only cleanup and remove the misleading scan. |
| MEDIUM | Spec gap | `apps/web/server/routers/mcpServers.ts` | **`delete` does not revoke OAuth token (RFC 7009).** Spec requires calling the provider's revocation endpoint if `oauthAccessTokenEncrypted` is set before deleting the row. The implementation only relies on FK cascade delete. (Flagged in section-13 review, unresolved.) | Before `db.delete`, check for `oauthAccessTokenEncrypted`; if present, call the revocation endpoint from `McpOAuthManager`. |
| MEDIUM | Spec gap | `apps/web/server/routers/mcpServers.ts:146` | **`z.union` instead of `z.discriminatedUnion` for config validation.** Transport type and config can mismatch without Zod error (e.g., `transportType: "stdio"` with `{url: "..."}` passes validation). (Flagged MEDIUM in section-13 review, unresolved.) | Use `z.discriminatedUnion("_transport", [...])` with literal discriminator fields as specified. |
| MEDIUM | Deferred | `python-backend/app/services/mcp_client_manager.py:400` | **SSE GET fallback for Streamable HTTP 4xx not implemented.** Fallback is logged but `McpConnectionError` is raised immediately. Misleading `mcp_streamable_fallback` log event fires without any GET attempt. Listed as deferred in usage.md but the log event should be removed until implemented. (Flagged MEDIUM in section-17 review.) | Remove the misleading log event and add explicit `# TODO` comment. Implement the GET fallback before enabling Streamable HTTP in production. |
| MEDIUM | Deferred | `python-backend/app/services/mcp_client_manager.py:87` | **Post-connect IP verification absent (DNS rebinding step 2, spec §Security §1 NEW-06).** `validated_ip` is stored but never re-checked against the actual peer address after TCP connect. Listed as deferred in usage.md. | Implement the verify-after-connect step using httpx transport introspection before enabling in production. |
| MEDIUM | Deferred | `python-backend/app/services/long_term_memory.py` | **MCP memory-extraction guard (`agent_has_mcp_tools` check) absent from `extract_and_store_memories`.** An agent with MCP tools can exfiltrate external server data into the persistent memory store. Spec §14.6 requires this guard. (Flagged MEDIUM in section-15 review, unresolved.) | Add the guard at the top of `extract_and_store_memories`: `if agent_has_mcp_tools and not agent_config.get("memory_extraction_enabled", False): return`. |
| MEDIUM | Deferred | `python-backend/app/services/mcp_rate_limiter.py:145` | **`scrub_params` does not recurse into list values.** List elements containing Bearer tokens or secrets are passed through unscrubbed. (Flagged MEDIUM in section-15 review, unresolved.) | Add a `list` branch in `scrub_params` that applies all secret patterns to each string element. |
| MEDIUM | Deferred | `apps/web/server/_core/mcp_client_manager.py` | **SSRF block-lists are triplicated.** `mcp_client.py` has 5 CIDRs, `mcp_client_manager.py` has 8 CIDRs, `agency_tools.py` has its own set. Divergence means a future fix can easily miss a file. (Flagged in section-17 review.) | Extract to a shared `app/core/ssrf_validator.py` module imported by all three. |
| MEDIUM | Test gap | `python-backend/tests/unit/services/test_mcp_client_manager.py:246` | **`test_auto_reconnect_max_3_retries` is a constant assertion, not a behavioral test.** No reconnect loop exists in production code; `reconnect_count`/`max_reconnect_attempts` fields are stored but never read. (Flagged in section-17 review, unresolved.) | Either implement the retry loop and write a behavioral test, or explicitly mark as deferred and rename the test. |
| MEDIUM | Deferred | Sections 14.7, 14.8, 14.10, 14.11 | **Four section-15 spec requirements never implemented.** `mcp_tool_call` audit event integration (14.7), per-call credit charging via `credit_manager.charge_mcp_call` (14.8), health-check Celery task pinging enabled servers every 5 minutes (14.10), and Celery worker constraint documentation (14.11) are all absent from any diff. Not listed in usage.md deferred section. | Track as explicit deferred items in usage.md and create follow-up tickets. |
| MEDIUM | Deferred | `python-backend/app/services/agency_context_summarizer.py:124` | **Off-by-one in `_adjust_split_for_atomic_pairs`** causes the assistant message with `tool_calls` to be moved into the "old" segment while its tool responses stay in "recent". (Flagged HIGH in section-07 review, unresolved.) | After the while-loop, check `messages[split_idx - 1].get("tool_calls")` and include the owning assistant message in `old_messages`. |
| MEDIUM | Deferred | `python-backend/app/services/agency_context_summarizer.py:173` | **`"gpt-4o-mini"` hardcoded as model fallback.** Non-OpenAI deployments will fail. (Flagged HIGH in section-07 review, unresolved.) | Route through the LLM gateway priority system; never hardcode a model name. |
| LOW | Wiring | `apps/web/server/routers/mcpServers.ts` | **`mcpServerRegistry` feature flag not checked inside the tRPC router.** The flag was added to `featureFlags.ts` (section-16) but the router's procedures never call `checkFeatureFlag("mcpServerRegistry", tenantId)`. Any admin can reach the CRUD endpoints regardless of whether the flag is enabled for their tenant. | Add a flag check at the top of each public procedure, or as a router-level middleware, using the existing `tenantFeatureFlagService`. |
| LOW | Wiring | `apps/web/server/routes.ts` | **`/auth/mcp/callback` Express route not registered (section-18 deferred).** The OAuth callback URL `https://smartaihub.app/auth/mcp/callback` is hardcoded in `McpOAuthManager` but the Express endpoint does not exist. OAuth authorization-code flows will always fail at the callback step. Correctly listed as deferred in usage.md and section-18 spec, but the admin UI should not offer the OAuth connect button until this is wired. | Register the callback route before enabling the OAuth connect UI element. Add a guard in the admin UI to hide the button when `mcpOAuth` feature flag is false. |
| LOW | Wiring | `python-backend/app/services/mcp_oauth_manager.py` | **In-memory token cache is not process-safe in multi-worker deployments.** Tokens are cached in a `dict` on the instance; each uvicorn worker has its own process and its own cache. Worker A refreshes a token and stores it in memory; worker B has no knowledge and may call the token endpoint again, causing excessive OAuth refresh calls. Listed as LOW in section-18 review but should be tracked explicitly. | Store the token cache in Redis, or document the single-worker deployment assumption in the service docstring. |
| LOW | Test gap | `python-backend/tests/unit/services/test_mcp_oauth_manager.py` | **`_find_state_data` uses a mock-friendly dict scan, not a Redis SCAN.** In production this needs `SCAN` with pattern `mcp:oauth:state:*:*:{state}`. Listed as acceptable in section-18 review but should have a TODO and an integration test path documented. | Add `# TODO: production-grade Redis SCAN` comment and ensure the production code path is tested before enabling OAuth in a real deployment. |
| LOW | Test gap | `python-backend/tests/unit/services/test_mcp_config_watcher.py` | **`poll_once` uses raw SQL (`text("SELECT ... FROM mcp_servers")`).** No SQLAlchemy ORM model wiring. Config watcher cannot be called by the FastAPI lifespan until a DB session is passed in. The start/stop lifecycle is untested in the context of the lifespan. | Replace the raw SQL with SQLAlchemy ORM query once the `McpServer` model is wired, and add a lifecycle test that verifies `start()` and `stop()` interact correctly with the event loop. |

---

### Cross-Cutting Integration Checklist

| Integration Point | Expected | Actual | Status |
|---|---|---|---|
| `McpClientManager.disconnect_all()` called on FastAPI lifespan shutdown | `main.py` lifespan cleanup block | Not present | FAIL |
| `McpClientManager` singleton initialized at startup | `main.py` lifespan startup | Never imported | FAIL |
| `McpConfigWatcher.start()` scheduled as background task | `main.py` lifespan startup | Never imported | FAIL |
| `McpConfigWatcher.stop()` called on FastAPI lifespan shutdown | `main.py` lifespan cleanup | Never imported | FAIL |
| `mcp_rate_limiter` called from `agency_tools._make_run_func` | `agency_tools.py:~826` | No call present | FAIL |
| `DeferredToolRegistry.prepare_tools()` called from `resolve_mcp_tools_for_agent` | `agency_tools.py:~768` | No import or call present | FAIL |
| `mcpServersRouter` registered in `appRouter` | `routers.ts:1879` | Present | PASS |
| `/health/mcp` endpoint registered under `/health` router | `health.py:204` | Present | PASS |
| `mcp_metrics.py` imported by `health.py` (deferred import) | `health.py:210` | Present (lazy import) | PASS |
| `mcpServerRegistry`, `mcpStdio`, `mcpOAuth` flags in `featureFlags.ts` | `featureFlags.ts:47-50` | Present | PASS |
| Feature flags checked inside `mcpServers.ts` procedures | `mcpServers.ts` | Not called | FAIL |
| `/auth/mcp/callback` Express route registered | `routes.ts` or `index.ts` | Not registered | DEFERRED |
| Nginx `/api/v1/mcp/` location block with `proxy_buffering off` | `nginx/conf.d/dev-host.conf` | Present (section-20) | PASS |
| `mcpServers` + `mcpServerAssignments` tables in Drizzle schema | `drizzle/schema.ts` | Present (section-12) | PASS |
| MCP migrations applied | `drizzle/*.sql` | Present | PASS |

---

### Deferred Items Registry (from usage.md and per-section notes)

The following items are documented as explicitly deferred. They must not be treated as blocking for merge but must be tracked as known gaps with follow-up tickets.

| # | Deferred Item | Section | Risk if Shipped Unresolved |
|---|---|---|---|
| D1 | SSE GET fallback for Streamable HTTP 4xx | 17 | Misleading `mcp_streamable_fallback` log events; functional gap for Streamable HTTP transport |
| D2 | Post-connect IP verification (DNS rebinding step 2) | 17 | DNS rebinding window between validation and first RPC call |
| D3 | `notifications/cancelled` cancellation support | 21 | In-flight tool calls cannot be aborted; wasted credits |
| D4 | JSONB `agencyAgents.mcpServers` deprecation cutover | 21 | Two code paths for MCP tool resolution; JSONB path bypasses the new registry |
| D5 | Express `/auth/mcp/callback` route | 18 | OAuth authorization-code flow broken end-to-end |
| D6 | Redis SCAN for OAuth state lookup | 18 | In-memory dict scan non-functional in Redis-state production code |
| D7 | `mcp_tool_call` audit event integration (spec §14.7) | 15 | No audit trail for MCP tool calls |
| D8 | Per-call credit charging `charge_mcp_call` (spec §14.8) | 15 | MCP tool calls consume unmetered credits |
| D9 | Health-check Celery task — ping enabled servers every 5 min (spec §14.10) | 15 | No automated health monitoring; `healthStatus` column only updated on admin-triggered test |
| D10 | Celery worker constraint documentation (spec §14.11) | 15 | Workers may attempt HTTP proxy or stdio operations outside their allowed scope |
| D11 | `DeferredToolRegistry` wiring in `agency_tools.py` | 08 | Token savings feature dead; NEW-03 scope isolation unenforceable |
| D12 | `mcp_rate_limiter` wiring in `agency_tools._make_run_func` | 15 | Rate limits, response wrapping, secret scrubbing, loop detection all bypassed at runtime |

**Note:** Items D11 and D12 were flagged as HIGH severity in their respective section reviews (not lower-risk deferral). They are listed here for completeness but require resolution before merge, not as tracked deferral.

---

### Contract Compliance Summary (Per Section)

| Section | Review Verdict | Outstanding Blockers | Notes |
|---|---|---|---|
| 01 — Python SSRF/Auth | APPROVE_WITH_FIXES | 3 HIGH (from prior review) | Executor mock guard, httpx constructor, structlog path |
| 02 — Python Injection Fixes | APPROVE_WITH_FIXES | 3 HIGH (from prior review) | F23 empty domains, F17 vacuous test, F27/F28 no tests |
| 03 — Node.js Auth/Tenant | APPROVE_WITH_FIXES | 2 HIGH unresolved | `mcp.ts` trace ID not sanitized; `safeJoin` no symlink check |
| 04 — Node.js Scope/IDOR | (No separate review file found) | — | Assumed PASS per commit hash |
| 05 — Spec Compliance | APPROVE_WITH_FIXES | 2 HIGH (from prior review) | `_mcpSessionExpired` 404 not propagated; UUID missing on delete |
| 06 — Infrastructure | (No review file found) | — | systemd config, assumed PASS |
| 07 — Context Summarizer | APPROVE_WITH_FIXES | 2 HIGH unresolved | Off-by-one in atomic pair split; hardcoded `gpt-4o-mini` fallback |
| 08 — Deferred Tools | REQUEST_CHANGES | 3 HIGH unresolved | Dead code — not wired into `agency_tools.py` |
| 09 — Vector Memory | APPROVE_WITH_FIXES | 2 HIGH (from prior review) | Wrong patch target for embedding service; vacuous SQL fallback test |
| 10 — Chat Token Counting | APPROVE_WITH_FIXES | 2 HIGH (from prior review) | Oversized single-message bypass; dynamic import of static module |
| 11 — Few-Shot RAG | APPROVE_WITH_FIXES | 2 HIGH (from prior review) | Wrong patch target; non-deterministic cache key (`hash()`) |
| 12 — DB Schema | APPROVE | None | Clean |
| 13 — tRPC Router | REQUEST_CHANGES | 3 HIGH unresolved | IDOR update/delete, cross-tenant assignment, missing OAuth revoke |
| 14 — Admin UI | APPROVE_WITH_FIXES | 3 LOW | Input maxLength gaps |
| 15 — Cross-System Protections | REQUEST_CHANGES | 4 HIGH unresolved | Dead code wiring; INCR/EXPIRE race; wrong scan pattern; byte truncation |
| 16 — Feature Flags | PASS | None | Flags present; router does not check them (LOW) |
| 17 — Multi-Transport Client | APPROVE_WITH_FIXES | 3 HIGH unresolved | Shell injection; no connection pooling; chunked size bypass |
| 18 — OAuth Support | PASS | 1 MEDIUM (deferred) | Express route deferred; in-memory token cache |
| 19 — Hot-Reload Adapters | PASS | None | Clean (wiring deferred to lifespan startup) |
| 20 — Nginx/Monitoring | PASS | None | Clean |
| 21 — Advanced Spec Features | PASS (with noted deferral) | 1 MEDIUM (deferred) | Cancellation deferred |

**Sections with unresolved HIGH findings that block merge:** 03, 07, 08, 13, 15, 17 — and two critical wiring gaps (lifespan startup/shutdown, rate-limiter integration) not scoped to a single section.

---

### Summary

All 21 sections have been committed and unit-tested in isolation. The implementation is architecturally sound and covers the full breadth of the spec. However, the codebase is not yet production-ready for the following reasons:

**Critical wiring gaps (introduced between section completion and final integration):** `McpClientManager` and `McpConfigWatcher` are fully implemented and tested but are never started or shut down from the FastAPI lifespan. Similarly, `DeferredToolRegistry` (section-08) and `mcp_rate_limiter` (section-15) are dead code — both were built and unit-tested but their respective integration points in `agency_tools.py` were never modified. Four cross-cutting services work correctly in test isolation but have zero effect on runtime behavior.

**Unresolved HIGH security findings from section reviews:** Thirteen HIGH-severity issues flagged in section reviews (03, 07, 08, 13, 15, 17) remain open. These include a shell injection vulnerability in the stdio RPC path (potential RCE in the sandbox container), IDOR mutations in the MCP server tRPC router, a rate-limiter race condition that can permanently block tenants, response truncation that does not respect byte boundaries for multi-byte content, and missing DNS rebinding verification.

**Twelve tracked deferred items** are documented in usage.md and section notes. Two of these (D11, D12) were rated HIGH in their section reviews and should be resolved before merge, not deferred.
