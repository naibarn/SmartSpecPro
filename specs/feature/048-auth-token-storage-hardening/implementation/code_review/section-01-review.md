# Section 01 Review Report
## authService.test.ts — Phase 1 Tests

**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-19
**Diff:** `specs/feature/048-auth-token-storage-hardening/implementation/code_review/section-01-diff.md`
**Implementation:** `apps/web/client/src/services/authService.ts` (committed c88fd29f)
**Spec reference:** `specs/feature/048-auth-token-storage-hardening/sections/section-03-phase1-tests.md`

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | test:198-222 | `setupAuthInterceptor()` "triggers logout on 401 response for non-auth URLs" test has zero `expect()` calls. The body calls `window.fetch("/api/some-endpoint")` and restores `window.location`, but never asserts that `window.location.href` became `/login` or that localStorage was cleared. This test passes unconditionally regardless of whether the interceptor works. | Define `const mockLocation = { ...originalLocation, href: "/dashboard", pathname: "/dashboard" }` and use `Object.defineProperty` before calling `window.fetch`. After `await window.fetch(...)`, add `expect(mockLocation.href).toBe("/login")`. |
| HIGH | test:339-357 | Tauri `isTokenExpired()` only tests a token 1 hour in the future. The implementation at authService.ts:134 uses `Date.now() / 1000 > (exp - 300)` — it treats tokens as expired 5 minutes early. A token expiring in 4 minutes (within the 300s window) must return `true`, but this boundary is entirely untested. If the `- 300` constant is removed or changed, no test will catch it. | Add a test: `const futureExp = Math.floor(Date.now() / 1000) + 200;` (200s from now, inside the 300s buffer), construct the JWT, and assert `isTokenExpired()` returns `true`. |
| HIGH | test:339-364 | Tauri `isTokenExpired()` has no test for malformed JWTs. authService.ts:136-139 catches decode errors and falls through to `return false` — a token with a corrupted payload or no `exp` field is treated as valid. This silent permissive fallback needs pinning tests. | Add two tests: (1) `tauriInvoke` returns a token whose middle segment is not valid base64 — assert the return value to lock in the specified behaviour; (2) a valid base64 payload of `{}` (no `exp` key) — assert the return value (`false` per the current fall-through at line 139). |
| MEDIUM | test:140-157 | `verifyToken()` test is named "calls logout on 401 response" but only asserts `result === false`. authService.ts:203-206 calls `await logout()` on 401, which clears localStorage and navigates. A future refactor removing the `logout()` call would not be caught by this test. | Using the `mockLocation` already defined in the test, add `expect(mockLocation.href).toBe("/login")` after `await authService.verifyToken()`, or assert all 5 legacy keys are cleared. |
| MEDIUM | test: (missing) | `verifyToken()` has no 403 test. authService.ts:203 calls `logout()` on both 401 and 403. section-01-auth-service-browser-hardening.md line 71 explicitly names the test `"calls logout on 401/403 response"`. Only 401 is covered. | Add a test with `makeResponse(403)` asserting `result === false` and that logout was triggered (navigation or key cleanup). |
| MEDIUM | test: (missing) | `setupAuthInterceptor()` has no 403 test. authService.ts:229 triggers logout on 403 just as it does on 401. | Add a test for a 403 response to a non-auth URL, asserting logout is triggered, mirroring the 401 interceptor test. |
| MEDIUM | test:385-392 | Tauri `logout()` only asserts `clear_all_credentials` was invoked. authService.ts:162-166 always clears all 5 localStorage keys regardless of context. There is no test verifying this cleanup runs in the Tauri path. A change gating those `removeItem` calls behind `!hasTauri()` would silently break Tauri cleanup. | Add a Tauri test that seeds all 5 legacy keys, calls `logout()`, and asserts all 5 are removed — mirroring the browser logout test at test:239-265. |
| MEDIUM | test:198-236 | The two `setupAuthInterceptor()` tests re-import the module inside the test body (lines 211, 229) after `beforeEach` has already imported it. `vi.resetModules()` ran in `beforeEach`, but the import at line 62 re-populates the cache. Whether the in-test `freshModule` import gets a truly fresh instance with its own `__authInterceptorSetup` state depends on Vitest's module registry behaviour for that call. The `vi.stubGlobal("fetch", underlyingFetch)` also happens inside the test after `window.fetch` was already set by `beforeEach`, creating a layered stub that interacts with the interceptor in a non-obvious way. | Move these two tests into a dedicated `describe` block with its own `beforeEach` that calls `vi.resetModules()` but does NOT pre-import `authService`. Import inside each test body only, after `vi.stubGlobal` is called. |
| LOW | test:84-88 | `getAuthTokenSync()` only verifies the return value is `null`. It does not assert that `localStorage.getItem` was not called. The entire security value of this function in the browser path is that it does not read storage. | Add `const getSpy = vi.spyOn(Storage.prototype, "getItem"); authService.getAuthTokenSync(); expect(getSpy).not.toHaveBeenCalled();` |
| LOW | test: (missing) | Tauri `isAuthenticated()` fallback: authService.ts:269-272 wraps `safeInvoke` in `try/catch` and falls through to a browser-path server ping if it throws. A Tauri desktop app with a broken secure store would silently degrade to cookie-based auth. No test covers this path. | Add a test: `tauriInvoke.mockRejectedValueOnce(new Error("store unavailable"))` with `mockFetch` returning 200, and assert either `true` or `false` to pin the intended fallback contract. |
| LOW | test:319-325 | `expect(tauriInvoke).toHaveBeenCalledWith("get_auth_token", undefined)` passes an explicit `undefined` second argument. The implementation calls `safeInvoke('get_auth_token')` with no second argument; `safeInvoke` passes `args` (which is `undefined`) to `mod.invoke`. Vitest's `toHaveBeenCalledWith` may or may not treat a single-argument call as matching a two-argument call where the second is `undefined`. Verify against the `@tauri-apps/api/core` invoke signature; if `undefined` is not a canonical second argument, change to `expect(tauriInvoke).toHaveBeenCalledWith("get_auth_token")`. | Verify the signature and adjust the matcher to its single-argument form if appropriate. |
| LOW | test:46 | The ordering of operations in `beforeEach` — `vi.resetModules()`, then state mutation, then dynamic import — is load-bearing. If the dynamic import at line 62 were moved above `delete (window as any).__TAURI__`, `hasTauri()` would read stale state. This dependency is implicit and could be broken by a future editor. | Add a comment above the import at line 62: `// Must be last: window.__TAURI__ must be set before module import so hasTauri() reads correct state.` |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `hasTauri()` controlled via `window.__TAURI__` flag, not a module spy | PASS | Both suites correctly set/delete the flag in `beforeEach`/`afterEach`. Matches spec section-01 line 116. |
| Module cache isolation via `vi.resetModules()` + dynamic import | PASS | Pattern matches spec section-03 lines 146-157. `cachedToken`/`cachedUser` are reset on each test. |
| `@tauri-apps/api/core` mocked via top-level `vi.mock()` | PASS | Correct placement before any import. `tauriInvoke` reference refreshed in Tauri `beforeEach` after `vi.resetModules()`. |
| `fetch` stubbed via `vi.stubGlobal` with per-test `mockFetch.mockReset()` | PASS | No bleed between tests. |
| `localStorage.clear()` in both `beforeEach` blocks | PASS | Prevents key bleed between tests. |
| Browser `getAuthToken()` returns `null` without touching localStorage | PASS | Seeds localStorage and asserts null return (test:70-74). |
| Browser `setAuthToken()` does not write localStorage | PASS | Key asserted absent after call (test:78-81). |
| Browser `isTokenExpired()` pings `/api/auth/me` with `credentials:'include'` | PASS | Exact call shape asserted at test:94. |
| Browser `verifyToken()` uses `credentials:'include'`, no `Authorization` header | PASS | `call[1]?.headers?.Authorization` explicitly checked at test:129. |
| Tauri `verifyToken()` sends `Authorization: Bearer <token>` | PASS | Full expected call shape asserted at test:376-381. |
| `logout()` clears all 5 legacy keys in browser context | PASS | All 5 keys individually asserted at test:255-259. |
| `logout()` clears all 5 legacy keys in Tauri context | FAIL | Not tested in Tauri suite — see MEDIUM finding. |
| `setupAuthInterceptor()` is idempotent (no double-wrap) | PASS | `window.fetch` reference identity compared before and after second call. |
| `setupAuthInterceptor()` skips logout for `/auth/login` path | PASS | 401 to `/api/auth/login` verified not to redirect; `resp.status` asserted at test:234. |
| `setupAuthInterceptor()` triggers logout on 401 (non-auth URL) | FAIL | No `expect()` in test body — see HIGH finding. |
| `verifyToken()` handles 403 same as 401 | FAIL | 403 case not covered — see MEDIUM finding. |
| `setupAuthInterceptor()` handles 403 | FAIL | 403 case not covered — see MEDIUM finding. |
| Tauri `isTokenExpired()` 300s clock-skew boundary | FAIL | Only 1-hour future tested — see HIGH finding. |
| Tauri `isTokenExpired()` malformed JWT | FAIL | Not tested — see HIGH finding. |
| `verifyToken()` logout call is verified (not just return value) | FAIL | Test only asserts `false`; no side-effect assertion — see MEDIUM finding. |
| `isAuthenticated()` Tauri fallback on invoke failure | FAIL | Not tested — see LOW finding. |

---

### Summary

The mock architecture is correctly structured: `vi.resetModules()` with dynamic imports properly isolates the module-level token cache between tests, `window.__TAURI__` flag control is the right approach for `hasTauri()` branching, and the top-level `vi.mock` for Tauri correctly intercepts `safeInvoke`. The 25 tests that do have assertions cover the primary happy-path contracts for all exported functions in both contexts. Three HIGH findings require fixes before merge: the `setupAuthInterceptor()` 401 interceptor test has no assertions and passes unconditionally, the Tauri `isTokenExpired()` 300-second clock-skew boundary is completely untested despite being the security-critical threshold in the JWT decoder, and the malformed-JWT decoder path has no coverage despite its silent `return false` fallback potentially treating a corrupted token as valid. Five MEDIUM findings cover the missing 403 branches in `verifyToken()` and `setupAuthInterceptor()`, the absent logout-was-called assertion in `verifyToken()`, the missing Tauri localStorage cleanup test, and the fragile in-test re-import pattern for interceptor tests. Resolving the three HIGH findings is required; the five MEDIUM findings are strongly recommended before this section is considered production-grade.
