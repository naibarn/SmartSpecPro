# Section 16 Review — Tool Progress Streaming & Standalone Tool API

**Date:** 2026-03-22
**Reviewer:** CMD-8 SSP Reviewer Agent
**Diff:** `section-16-diff.md`
**Spec:** `sections/section-16-tool-progress-standalone-api.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agencyToolsApi.ts:477` | `auth.apiKeyId` field does not exist on the auth object — the rate-limit key falls back to `auth.sub` or `"unknown"`, silently breaking per-key rate limiting | Use `auth.keyHash` (confirmed present in `authz.ts:83`). The field is `apiKeyId` on the internal `AuthContext` shape but is exposed as `keyHash` on `req.auth`. Verify the actual property name from `authz.ts` and use it here. |
| HIGH | `agencyToolsApi.ts:507–510` | Tenant isolation check happens **after** the full tool record (including `headersEncrypted`, `config`, `inputSchema`) has already been loaded from the DB. A cross-tenant attacker with a valid API key can enumerate any exposed tool's schema by causing the 403 to differ from a 404 | Move the tenant isolation check to the WHERE clause: add `eq(agencyTools.tenantId, tenantId)` alongside `isExposedAsApi` and `isEnabled`. This closes the information-leak window entirely and eliminates the TOCTOU risk. |
| HIGH | `agencyToolsApi.ts:538–541` | Header decryption failures are silently swallowed with a `// Ignore ... proceed without custom headers` comment. If `headersEncrypted` is corrupt or the key has rotated, the tool executes with no custom auth headers — the downstream endpoint receives an unauthenticated call. This could succeed (returning data the tool should not have returned) or fail with a confusing 401/403 that looks like a tool bug | Return `500 / tool_error` when decryption fails. A tool that cannot be authenticated to its backend should not be executed, not silently downgraded. |
| HIGH | `shared/featureFlags.ts` (not modified) | `AGENCY_TOOL_API_ENABLED` is a freeform string key passed to the global `getFeatureFlag()` — identical to the bug raised in the Section-09 review for `AGENCY_STREAMING_ENABLED`. The flag is not present in `TenantFeatureFlags` (last entry is `agencyMcpBridge` at F30). Both the Express route and the tRPC mutation call the global `getFeatureFlag()` rather than the tenant-scoped `getTenantFeatureFlag()`. Tenants cannot individually control the feature. | Add `agencyToolApi: boolean; // F31` to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`. Replace global `getFeatureFlag("AGENCY_TOOL_API_ENABLED")` calls with `getTenantFeatureFlag(tenantId, "agencyToolApi")`. |
| HIGH | `agencyToolsApi.ts:550` | No SSRF validation is performed on `endpointUrl` before the `fetch()` call. The spec (Security Consideration §2) explicitly requires reusing the SSRF validator from `agency_tools.py` / section-02 at execution time (not just at creation time). A tool whose `endpoint_url` was changed after creation — or that was imported with a malicious URL — will make the server-side fetch without any block. | Import and call the equivalent Node.js SSRF validator (or call the internal endpoint that wraps it) before `fetch(endpointUrl, fetchOptions)`. Reject with 422 if validation fails. |
| MEDIUM | `agency.ts:2487–2529` | `toggleToolExposure` uses `protectedProcedure` which only requires an authenticated session (any user). The spec says "require admin role or tool owner." Any authenticated user can expose any tool in their tenant as a public API endpoint, which is a privilege escalation risk. | Change to a role-checked procedure (`adminProcedure` or inline `ctx.role === "admin"` guard), or add explicit "tool owner" check using `agencyTools.createdByUserId`. |
| MEDIUM | `agency.ts:2487–2529` | `toggleToolExposure` has a two-step SELECT-then-UPDATE without a transaction. A concurrent call between the SELECT that confirms `tenantId` and the UPDATE could theoretically allow a race where ownership changes between the two statements — same class of TOCTOU noted in section-14 MCP review. | Wrap in a transaction, or merge the tenant check into the WHERE clause of the UPDATE and assert `rowCount === 1`. |
| MEDIUM | `agency_tools.py:1005–1014` (`_emit_progress_sync`) | The synchronous `_emit_progress_sync` wrapper calls `loop.create_task(...)` when a running loop is found. `create_task` is fire-and-forget — there is no guarantee the coroutine runs before `run_func` returns. If the event loop is busy or the task is GC'd before the loop gets to it, progress events are silently dropped. More critically, `_aio.run(...)` in the `except RuntimeError` branch creates a *new* event loop and runs the coroutine to completion synchronously. This is correct for purely synchronous contexts, but the comment says it is used "inside sync run_func" — the orchestrator is async, so `get_running_loop()` will always succeed, meaning `create_task` is always used and the drop risk is real. | Switch to `asyncio.ensure_future` (which schedules reliably) or — better — make `run_func` async throughout (matching the async orchestrator) and use `await _emit_progress(...)` directly, removing the sync wrapper entirely. |
| MEDIUM | `agencyToolsApi.ts` (missing) | The spec requires the `toggleToolExposure` tRPC tests to live in a dedicated file `server/routers/__tests__/agencyToolExposure.test.ts`. No such file appears in the diff. The four spec-required tests (set-true, set-false, cross-tenant FORBIDDEN, feature-flag FORBIDDEN) are completely absent. | Create the test file with all four spec-required tests. |
| MEDIUM | `agencyToolsApi.test.ts:119–130` | `requireScopes` is mocked to `() => next()` — it calls `next()` unconditionally regardless of scope. The test "requires authentication" only tests the unauthenticated path (no `req.auth`), but the test "POST ... requires API key with agency:tool:execute scope" from the spec is absent. The insufficient-scopes 403 path is never exercised. | Add a test that provides a valid auth object with empty or mismatched scopes, and asserts the real `requireScopes` middleware returns 403. Alternatively, do not mock `requireScopes` at all in the integration test. |
| MEDIUM | `agencyToolsApi.test.ts:331` | The OpenAPI spec test asserts `db.instance.where` returns the tool list (line 332: `vi.mocked(db.instance.where).mockResolvedValue([...])`). This works only if `where()` is the last method in the query chain. The actual query in `agencyToolsApi.ts:590–599` does not call `.limit()` on the tools list — so the chain ends at `.where()`. However the mock at line 96 chains `where → limit` for `.mockResolvedValue([])`. If the list query ever adds `.limit()` the mock silently returns `[]` again. The mock setup is fragile. | Use `vi.mocked(db.instance.limit).mockResolvedValueOnce([...])` for the execute-path mock, and a dedicated factory (or direct query mock via `vi.spyOn`) that is tied to a specific query shape. |
| LOW | `agencyToolsApi.ts:444–453` | Redis unavailability causes rate limiting to be skipped entirely with `return { allowed: true, remaining: RATE_LIMIT_MAX }`. A Redis outage would disable all rate limiting for the standalone tool API, allowing unbounded calls to external tool endpoints during the outage window. | Log the Redis error at WARN level and consider returning a fail-open with a conservative remaining count (e.g., 1) so callers do not flood downstream. At minimum, log so ops can detect the degradation. The current silent catch produces no signal. |
| LOW | `agencyToolsApi.ts:477` | `keyHash` / `apiKeyId` property used for rate-limiting also falls back to `auth.sub` for `bearer` mode requests. Bearer mode (JWT session) should not be able to call the standalone tool API at all — only `api_key` mode is a valid consumer. The fallback masks a misconfiguration where a session user accidentally reaches this route. | Assert `auth.mode === "api_key"` early in the handler (before rate-limit) and return 401 if not satisfied. |
| LOW | `agencyToolsApi.ts:554–560` | Tool execution error response at line 554 uses `res.status(502).json(...)` with a raw `details: responseText.slice(0, 500)` field. This leaks up to 500 chars of the downstream tool's error body. The downstream system may include stack traces, internal hostnames, or connection strings. | Remove the `details` field from the 502 response, or limit it to a sanitized subset that cannot contain secrets. Log the raw `responseText` server-side only. |
| LOW | `fal_ai_provider.py` | The entire `fal_ai_provider.py` file and its test files (`test_fal_ai_provider.py`, `test_fal_ai_ssrf.py`) are included in this diff but are **outside the scope of section-16**. They belong to spec 054 (fal.ai LTX/Lux models). Their presence in this diff is likely an accidental staging artefact. They should be reviewed separately under spec 054's context; the quality of those files is not assessed here. | Unstage these files from the section-16 commit. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| `emit_progress(message, percent)` method added to `_make_run_func` closure | PASS | Async and sync wrappers both present |
| `emit_progress` is no-op when emitter is None | PASS | Guard at top of `_emit_progress` |
| `percent` field omitted when not provided | PASS | Conditional inclusion via `if percent is not None` |
| `builtin-web-search` emits "Searching..." progress | PASS | Pre-execution dict covers it |
| `builtin-rag-knowledge` emits "Querying..." progress | PASS | Pre-execution dict covers it |
| `builtin-browser` and `builtin-skill-executor` emit progress | PASS | Covered in both before/after dicts |
| Emitter and run_id wired through `resolve_tools_for_agent` → `create_tool_bridge` → `_make_run_func` | PASS | All three call sites updated |
| `tool_progress` event type already present in `agencyStreamEvents.ts` | PASS | Confirmed at line 32 and 129 |
| `agencyStreamEvents.ts` modification noted as conditional in spec | PASS | Correctly skipped — already present |
| POST `/v1/agency-tools/:toolId/execute` route exists | PASS | Registered at `app.use("/v1/agency-tools", ...)` |
| GET `/v1/agency-tools/openapi.json` route exists | PASS | Present |
| Route registered in `_core/index.ts` under the `/v1` auth middleware chain | PASS | Confirmed — `apiKeyAuthMiddleware` applies to all `/v1/*` routes |
| `requireScopes("agency:tool:execute")` applied to all routes | PASS | Applied as router-level middleware |
| Rate limiting at 100 req/min per API key with `Retry-After` header | PASS | Redis INCR/EXPIRE sliding window; `Retry-After` header set |
| Tenant isolation enforced on execute endpoint | PARTIAL FAIL | Isolation check happens after DB load, not in WHERE clause; see HIGH finding |
| SSRF validation on tool endpoint URL at execution time | FAIL | Missing entirely; see HIGH finding |
| Header decryption errors cause safe failure | FAIL | Silently ignored; see HIGH finding |
| `isExposedAsApi = false` returns 404 | PASS | WHERE clause includes `isExposedAsApi = true` |
| Feature flag guard on execute route | PASS | `getFeatureFlag("AGENCY_TOOL_API_ENABLED")` present |
| Feature flag guard on openapi.json route | PASS | Present |
| OpenAPI 3.0.3 spec generated with correct structure | PASS | `openapi: "3.0.3"`, correct paths, security schemes |
| OpenAPI spec excludes non-exposed tools | PASS | WHERE clause filters |
| `toggleToolExposure` tRPC mutation present | PASS | Added to `agencyRouter` |
| `toggleToolExposure` feature flag check | PASS | Present |
| `toggleToolExposure` tenant isolation check | PASS (weak) | SELECT + compare, not atomic; see MEDIUM |
| `toggleToolExposure` role guard (admin or owner) | FAIL | Only requires authenticated session; see MEDIUM |
| `AGENCY_TOOL_API_ENABLED` registered in `TenantFeatureFlags` | FAIL | Not added; see HIGH finding |
| pytest `test_tool_progress.py` — 5 required tests | PASS | All 5 tests present and correct |
| Vitest `agencyToolsApi.test.ts` — 9 required tests | PARTIAL | Rate-limit test (101 requests) absent; scope-rejection test absent |
| Vitest `agencyToolExposure.test.ts` — 4 required tRPC tests | FAIL | File entirely absent from diff |

---

### Summary

The core mechanics of this section are implemented correctly: `emit_progress` is wired cleanly through the Python call chain, the async/no-op guard pattern is solid, the Node.js standalone API route structure follows established patterns, and the OpenAPI spec generation is accurate. However there are five issues that must be resolved before merge. The most critical is the missing SSRF validation on the execute endpoint — the standalone API calls arbitrary `endpoint_url` values server-side with no protection. The tenant isolation check should be moved into the WHERE clause rather than applied after data is loaded. The header decryption failure path silently proceeds with an unauthenticated downstream call. The `AGENCY_TOOL_API_ENABLED` flag must be registered in `TenantFeatureFlags` and scoped per-tenant. The `toggleToolExposure` mutation lacks a role guard, allowing any tenant user to expose tools as public API endpoints.
