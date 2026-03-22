## Review Report — Section 02: Custom Tools Backend

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency.ts:283` | **`updateCustomTool` UPDATE clause is missing tenant guard** — the final `db.update().where(eq(agencyTools.id, input.toolId))` only filters by `toolId`, NOT by `tenantId`. The SELECT above fetches with tenant guard, but if there is a TOCTOU gap (concurrent deletes or a future refactor removes the prior check), the UPDATE itself becomes a cross-tenant write. The pattern elsewhere in the router always includes `and(eq(...id), eq(...tenantId))` on the DML statement. | Change `.where(eq(agencyTools.id, input.toolId))` to `.where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)))` |
| HIGH | `agency.ts` (testCustomTool body) | **`decrypt` is dynamically imported inside the mutation** (`await import("../services/crypto")`). `encrypt` is already a static top-level import. The dynamic import is unnecessary, bypasses bundler tree-shaking, and adds async overhead on every test call. More importantly, if the module path ever diverges, the error will be a runtime crash rather than a build-time failure. | Add `decrypt` to the existing static import at the top of the file: `import { encrypt, decrypt } from "../services/crypto";` and remove the dynamic import inside the procedure. |
| HIGH | `agency_tools.py` | **`oneCallAtATime` lock is declared but never used** — `_TOOL_LOCKS: dict[str, _asyncio_mod.Lock] = {}` is created, but `_execute_custom_tool_sync` never acquires it even when `custom_config.one_call_at_a_time` is `True`. The spec (section §3c) and the pytest spec both require the lock to be acquired. | Wrap the HTTP call block: `if custom_config.one_call_at_a_time: lock = _TOOL_LOCKS.setdefault(custom_config.tool_id, _asyncio_mod.Lock()); await lock.acquire()` with a `finally: lock.release()`. Because `_execute_custom_tool_sync` is synchronous, use `asyncio.run_coroutine_threadsafe` or convert to async, or use a `threading.Lock` instead. |
| HIGH | `python-backend/tests/unit/services/test_agency_tool_bridge.py` | **`oneCallAtATime` behavior is entirely untested** — the spec (`§ Tests`) explicitly required a test that verifies `asyncio.Lock` acquisition and release. No such test exists. The lock code also has not been implemented (see finding above), so this is a dual gap: missing implementation AND missing test. | Implement the lock (see HIGH above) then add: `def test_one_call_at_a_time_serializes_calls(...)` that mocks `asyncio.Lock` or uses `threading.Lock` and asserts `acquire` is called before the HTTP call and `release` is called after. |
| MEDIUM | `agency.ts:221` | **`requiresApproval` is hard-coded to `riskLevel === "high"` only at creation time, but `updateCustomTool` never updates `requiresApproval`** when `riskLevel` changes. A tool created as `"low"` (not requiring approval) that is later updated to `"high"` will silently have `requiresApproval = false` in the database. | In `updateCustomTool`, when `input.riskLevel !== undefined`, also set `updates.requiresApproval = input.riskLevel === "high"`. |
| MEDIUM | `ssrfValidator.ts` | **IPv6 check is incomplete and fragile** — the validator strips brackets with `.replace(/^\[|\]$/g, "")` and then checks if the hostname `.includes(":")`. However, `parsed.hostname` from the WHATWG `URL` class for an IPv6 address includes the brackets: `[::1]` → hostname is `[::1]`. After stripping brackets the lower check `lower === "::1"` works, but the fc00::/7 range check (`lower.startsWith("fc")` etc.) is a simple string prefix check that can be defeated by mixed-case addresses like `FC00::1` (which `toLowerCase()` normalizes correctly) but also by abbreviated forms like `::ffff:10.0.0.1` (IPv4-mapped IPv6) which are not checked at all. | Add a check for IPv4-mapped IPv6 addresses (`::ffff:` prefix). Also add `"0.0.0.0"` to the BLOCKED_HOSTS set (already in spec but already present). Consider replacing the fragile prefix checks with explicit full-address checks for `::1` in the BLOCKED_HOSTS set (already done) and use a known-safe library like `ipaddr.js` (already in many Node.js stacks) for the range check. |
| MEDIUM | `agencyCustomTools.test.ts:99-120` | **Out-of-scope test included** — the `"modelSettings migration idempotency"` test block has no relation to custom tools. It tests a standalone `migrateModelSettings` helper function that doesn't even exist in the production codebase (it's an inline function). This is a copy-paste from section-01. The spec for this section has no such requirement. | Remove the `modelSettings migration idempotency` describe block from this file. It does not belong here. |
| MEDIUM | `agencyCustomTools.test.ts` | **Five spec-required test scenarios are missing**: (1) `createCustomTool validates name uniqueness per tenant`, (2) `createCustomTool enforces max 50 tools per tenant`, (3) `createCustomTool rate limits at 10/min per user`, (4) `deleteCustomTool soft-deletes and checks no agents reference it`, (5) `testCustomTool validates input against inputSchema before HTTP call`. The test file covers SSRF and schema shape but skips the router-level procedure behaviors entirely. | Add procedure-level tests using `createCaller` as the spec requires. These tests exercise the actual router logic (count gate, name uniqueness, rate limit middleware, delete precondition, schema validation in test procedure), not just the standalone utilities. |
| MEDIUM | `agencyCustomTools.test.ts:54-59` | **Header encryption test only verifies the mock, not the router logic** — the test calls `encrypt()` directly and asserts the mock's return value. It never calls `createCustomTool` through a router caller to verify that the procedure actually invokes `encrypt()` before the `db.insert`. | Replace with a `createCaller` test that calls `createCustomTool` with headers and asserts `db.insert` was called with `headersEncrypted` matching the encrypted value, not the raw JSON. |
| MEDIUM | `agency.ts` (`listCustomTools`) | **Total count query runs a second full-table scan** with the same conditions as the data query. For large tenants this doubles query load. This is a minor efficiency concern but the spec did not prohibit it — flagged for awareness. | Consider using a windowed count or `COUNT(*) OVER()` in a single query. Acceptable to defer. |
| LOW | `agency_tools.py:731` | **`httpx.Client` (synchronous) used inside what is intended as an async service** — all other tool execution in this file uses `httpx.AsyncClient`. Using the synchronous client blocks the event loop when called from an async context. The spec (§3e) explicitly says "Use `httpx.AsyncClient`". | Replace `httpx.Client` with `httpx.AsyncClient` and make `_execute_custom_tool_sync` an async function, renaming it to `execute_custom_tool`. Update `_make_run_func` branch accordingly. |
| LOW | `agency_tools.py:743` | **`time.sleep()` in retry backoff blocks the event loop** — same async concern as above. If the function becomes async (as it should), the sleep must become `await asyncio.sleep(...)`. | Change to `await asyncio.sleep(backoff_ms / 1000.0 * (2 ** attempt))` once the function is async. |
| LOW | `agency.ts` (`testCustomTool`) | **HTTP errors (4xx, 5xx) from the remote endpoint are caught by the outer `try/catch` and re-raised as `INTERNAL_SERVER_ERROR`** — a 401 from the remote is not a server error; it is expected feedback about the tool configuration. The spec says return `{ status, body, durationMs }` for all HTTP responses, not just 2xx. | Remove the `try/catch` wrapping for the `fetch` response path (keep it only for network/timeout failures). Always return `{ status: resp.status, body: ..., durationMs }` regardless of HTTP status code, so the caller can see the actual upstream status. |
| LOW | `ssrfValidator.ts:597` | **`SMARTSPEC_INTERNAL_URL` bypass uses `url.startsWith(internalUrl)` before parsing** — a crafted URL like `http://127.0.0.1:3000@evil.com/path` would `startsWith("http://127.0.0.1:3000")` but resolve to `evil.com`. Check should be done after WHATWG URL parsing, comparing `parsed.origin` against the configured internal URL's origin. | Parse both URLs, compare `parsed.origin === new URL(internalUrl).origin`, and optionally also check that `parsed.pathname.startsWith(new URL(internalUrl).pathname)`. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| 5 tRPC procedures present (`createCustomTool`, `updateCustomTool`, `deleteCustomTool`, `listCustomTools`, `testCustomTool`) | PASS | All 5 present in `agency.ts` |
| `customToolInputSchema` exported for section-04 reuse | PASS | Exported at module level |
| SSRF validation at creation time | PASS | `validateSsrfUrl()` called in `createCustomTool` before insert |
| SSRF validation at execution time (defense in depth) | PASS | Both `testCustomTool` (Node.js) and `_execute_custom_tool_sync` (Python) re-validate |
| Header encryption before storage | PASS | `encrypt(JSON.stringify(input.headers))` used correctly |
| `headersEncrypted` excluded from API responses | PASS | Replaced with `hasHeaders: boolean` in all return paths |
| Tenant isolation on all procedures | PARTIAL FAIL | `updateCustomTool` DML clause missing `tenantId` guard (HIGH finding) |
| Rate limit: 10/min on `createCustomTool` | PASS | `createRateLimitMiddleware({ namespace: "agency-tool-create", limit: 10, windowMs: 60_000 })` |
| Rate limit: 20/min on `testCustomTool` | PASS | `createRateLimitMiddleware({ namespace: "agency-tool-test", limit: 20, windowMs: 60_000 })` |
| 50 tool per tenant cap | PASS | Count query + `FORBIDDEN` error implemented |
| Name uniqueness per tenant | PASS | SELECT before insert, `CONFLICT` error |
| `deleteCustomTool` soft-delete (not hard delete) | PASS | `isEnabled = false` update |
| `deleteCustomTool` reference check | PASS | `agencyAgentTools` join before soft-delete |
| `testCustomTool` input schema validation | PASS | AJV compile + validate used |
| `testCustomTool` 10s timeout | PASS | `AbortController` + `setTimeout(10_000)` |
| `testCustomTool` body truncation to 10KB | PASS | `bodyText.slice(0, 10_240)` |
| `updateCustomTool` version increment | PASS | `version: existing.version + 1` |
| `updateCustomTool` `requiresApproval` sync on riskLevel change | FAIL | Not updated (MEDIUM finding) |
| Python `CustomToolConfig` Pydantic model | PASS | Present with all required fields |
| Python input schema validation (`jsonschema`) | PASS | `_validate_custom_tool_input` implemented |
| Python `strictSchema` enforcement | PASS | `additionalProperties: false` injected when `strict_schema=True` |
| Python `oneCallAtATime` lock | FAIL | Lock declared but never acquired (HIGH finding) |
| Python SSRF re-validation at execution | PASS | `_validate_tool_url()` called first in `_execute_custom_tool_sync` |
| Python retry policy respected | PASS | `maxRetries` + exponential backoff loop |
| Python response truncation to 50KB | PASS | `resp.text[:51200]` |
| SSRF validator: all 9 test scenarios from spec | PASS | `ssrfValidator.test.ts` covers all 9 cases |
| Vitest: all 10 spec-required procedure tests | FAIL | 5 of 10 missing (MEDIUM finding) |
| pytest: all 5 spec-required ToolBridge tests | PARTIAL FAIL | `oneCallAtATime` lock test missing (HIGH finding) |
| No out-of-scope changes bundled | FAIL | `modelSettings migration idempotency` test block included (MEDIUM finding) |

---

### Summary

The core implementation is structurally correct and covers the most critical security paths: SSRF is validated at both creation and execution time in both layers, headers are encrypted before storage and never returned in responses, the 50-tool cap and name uniqueness guards are in place, and all 5 procedures exist with appropriate rate limits. However, three issues require mandatory fixes before merge: the `updateCustomTool` DML clause is missing its `tenantId` guard (potential cross-tenant write), the `oneCallAtATime` lock is declared but never wired into the execution path, and the `decrypt` function is dynamically imported inside a procedure body where it should be a static import. Additionally, the test file is missing five of the ten spec-required procedure-level scenarios and contains an out-of-scope `modelSettings` test block that belongs to section-01.
