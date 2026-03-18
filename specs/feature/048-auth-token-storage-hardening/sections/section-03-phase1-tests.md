# Section 03: Phase 1 Tests

## Overview

This section covers writing Vitest tests for all Phase 1 changes introduced in sections 01 and 02. The tests validate that `authService.ts` correctly removes the localStorage JWT fallback for browser context, preserves the Tauri secure store path, that the startup cleanup function removes legacy localStorage keys, and that the tRPC client sends credentials with requests.

**Dependencies:** Section 01 (authService browser hardening) and Section 02 (startup cleanup and tRPC verify) must be implemented before these tests will pass. However, tests should be written first (TDD) so they initially fail and then pass once the implementation is complete.

## Test Files to Create

Three test files cover Phase 1:

1. `apps/web/client/src/services/__tests__/authService.test.ts` -- authService browser vs Tauri paths
2. `apps/web/client/src/__tests__/legacyAuthCleanup.test.ts` -- startup cleanup function
3. A verification assertion for tRPC `credentials: 'include'` (can live in either of the above or as a standalone file)

## Test Environment Notes

- Tests under `client/src/**/*.test.ts` run in the **node** environment by default (per `vitest.config.ts`). Since `authService.ts` references `window`, `localStorage`, and `fetch`, these must be mocked.
- Tests under `client/src/**/*.test.tsx` get **jsdom** automatically. For `.ts` tests, you need to either use the `// @vitest-environment jsdom` directive at the top of the file, or mock `window`/`localStorage`/`fetch` manually.
- The project uses `vi.mock()` and `vi.fn()` from Vitest. Existing tests in `apps/web/client/src/services/__tests__/` follow this pattern.
- Path alias `@/` maps to `client/src/`.

## Legacy Keys Reference

The five legacy localStorage keys that must be cleaned up:

```
smartspec_auth_token
smartspec_user_data
smartspec_web_refresh_token
smartspec_web_token_expiry
smartspec_web_user
```

## Test File 1: authService.test.ts

**File path:** `apps/web/client/src/services/__tests__/authService.test.ts`

### Mock Strategy

- **`hasTauri()`**: The function checks `window.__TAURI__`. Mock this by setting/clearing `(window as any).__TAURI__` before each test, or mock the module-internal `hasTauri` function. Since `hasTauri` is not exported and is used inline, the cleanest approach is to control `window.__TAURI__` directly in the test environment.
- **`fetch`**: Use `vi.fn()` to mock `globalThis.fetch` for server ping tests (`isTokenExpired`, `verifyToken`).
- **`localStorage`**: Use `vi.spyOn` on `Storage.prototype` methods (or provide a mock `window.localStorage` if using jsdom).
- **`safeInvoke`**: Mock the dynamic `import("@tauri-apps/api/core")` to control Tauri secure store behavior. Use `vi.mock("@tauri-apps/api/core", ...)`.

### Test Descriptions and Intent

Each test below is listed with its intent. The implementer should write the test body as a stub (`it("description", () => { ... })`) following TDD -- tests fail first, then section 01 implementation makes them pass.

**Browser context tests (hasTauri() returns false):**

```
describe("authService - browser context", () => {
  // Setup: ensure window.__TAURI__ is undefined/null before each test
  // Setup: mock localStorage, mock fetch

  it("getAuthToken() returns null in browser context (no Tauri)")
    // Call getAuthToken(). Expect it to return null.
    // Verify localStorage.getItem is NOT called (the new behavior).

  it("setAuthToken() is no-op in browser context")
    // Call setAuthToken("some-token"). Expect no error.
    // Verify localStorage.setItem is NOT called.

  it("getAuthTokenSync() returns null in browser context")
    // Call getAuthTokenSync(). Expect null.
    // This tests that the in-memory cache is not populated by browser path.

  it("isTokenExpired() makes server ping in browser context")
    // Mock fetch to return { ok: true, status: 200 }.
    // Call isTokenExpired(). Expect it to call fetch with /api/auth/me or /auth/me.
    // Expect return value false (server says valid).

  it("isTokenExpired() returns true when server returns 401")
    // Mock fetch to return { ok: false, status: 401 }.
    // Expect isTokenExpired() to return true.

  it("isTokenExpired() returns false when server returns 200")
    // Mock fetch to return { ok: true, status: 200 }.
    // Expect isTokenExpired() to return false.

  it("isTokenExpired() returns true on network error")
    // Mock fetch to throw an Error.
    // Expect isTokenExpired() to return true (treat network failure as expired).

  it("verifyToken() uses credentials:'include' in browser context")
    // Mock fetch. Call verifyToken().
    // Assert fetch was called with an options object containing credentials: 'include'.
    // Assert NO Authorization header is set (browser relies on httpOnly cookie).

  it("setupAuthInterceptor() does not inject Bearer token in browser")
    // After calling setupAuthInterceptor(), make a fetch call.
    // Verify the intercepted fetch does NOT add an Authorization header.

  it("setupAuthInterceptor() triggers logout on 401 response")
    // Setup interceptor, mock fetch to return 401 for a non-auth URL.
    // Verify logout behavior is triggered (e.g., navigation to /login or cache cleared).

  it("setupAuthInterceptor() skips logout for /auth/login paths")
    // Setup interceptor, mock fetch returning 401 for /auth/login URL.
    // Verify logout is NOT triggered.

  it("logout() clears all legacy localStorage keys")
    // Seed localStorage with all 5 legacy keys.
    // Call logout().
    // Verify all 5 keys are removed from localStorage.
    // Verify cachedToken and cachedUser are nulled.
})
```

**Tauri context tests (hasTauri() returns true):**

```
describe("authService - Tauri context", () => {
  // Setup: set window.__TAURI__ = {} before each test
  // Setup: mock @tauri-apps/api/core invoke function

  it("getAuthToken() reads from Tauri secure store when hasTauri() is true")
    // Mock safeInvoke('get_auth_token') to return "tauri-jwt-token".
    // Call getAuthToken(). Expect "tauri-jwt-token".

  it("setAuthToken() writes to Tauri secure store when hasTauri() is true")
    // Call setAuthToken("new-token").
    // Verify safeInvoke was called with ('set_auth_token', { token: "new-token" }).

  it("verifyToken() uses Bearer header in Tauri context")
    // Mock getAuthToken to return a token.
    // Mock fetch. Call verifyToken().
    // Assert fetch was called with Authorization: Bearer <token> header.

  it("logout() calls Tauri clear_all_credentials when available")
    // Call logout().
    // Verify safeInvoke('clear_all_credentials') was called.
})
```

### Important Implementation Details for Tests

The module caches tokens in module-level variables (`cachedToken`, `cachedUser`). Between tests, these caches must be reset. Options:

1. Re-import the module fresh each test using `vi.resetModules()` and dynamic `import()`.
2. Call `logout()` in `afterEach` to reset caches (but this triggers navigation -- mock `window.location` or the navigate callback).
3. Export a test-only `resetCache()` function (less ideal for production code).

Option 1 (module reset) is the cleanest for isolation. The pattern:

```typescript
beforeEach(() => {
  vi.resetModules();
});

it("test name", async () => {
  const { getAuthToken } = await import("../../services/authService");
  // ...
});
```

## Test File 2: legacyAuthCleanup.test.ts

**File path:** `apps/web/client/src/__tests__/legacyAuthCleanup.test.ts`

This tests the startup cleanup function created in section 02. The function is expected to live in a dedicated file (e.g., `apps/web/client/src/lib/cleanupLegacyAuth.ts` or similar) and be called from `App.tsx` on startup.

### Mock Strategy

- Mock `localStorage` with spies on `getItem`, `setItem`, `removeItem`.
- Control `window.__TAURI__` to test browser vs Tauri branching.

### Test Descriptions and Intent

```
describe("legacyAuthCleanup", () => {
  // Setup: provide a mock localStorage, clear __TAURI__

  it("cleanup removes smartspec_auth_token from localStorage in browser")
    // Seed localStorage with smartspec_auth_token.
    // Call the cleanup function.
    // Verify localStorage.removeItem was called with 'smartspec_auth_token'.

  it("cleanup removes all 5 legacy keys from localStorage")
    // Seed localStorage with all 5 keys.
    // Call cleanup.
    // Verify all 5 removeItem calls were made.

  it("cleanup does NOT run in Tauri context")
    // Set window.__TAURI__ = {}.
    // Seed localStorage with legacy keys.
    // Call cleanup.
    // Verify localStorage.removeItem was NOT called.

  it("cleanup is idempotent (safe to call multiple times)")
    // Seed localStorage with keys.
    // Call cleanup twice.
    // No errors thrown. Keys are removed on first call, second call is a no-op.

  it("cleanup does not affect other localStorage keys")
    // Seed localStorage with legacy keys AND a custom key "my_app_data".
    // Call cleanup.
    // Verify "my_app_data" still exists.
    // Verify legacy keys are removed.
})
```

## Test File 3: tRPC Client Credentials Verification

**File path:** This can be a small test in `apps/web/client/src/__tests__/trpcCredentials.test.ts` or added to an existing tRPC test file.

### Test Description

```
describe("tRPC client configuration", () => {
  it("tRPC httpLink includes credentials:'include'")
    // This test verifies the static configuration of the tRPC client.
    // Approach 1: Import the tRPC client setup module and inspect the httpLink config.
    // Approach 2: Read the source file and assert the string 'credentials' appears
    //   in the httpLink configuration (static analysis test).
    // Approach 3: Mock createTRPCReact and capture the link configuration passed to it.
    //
    // The simplest reliable approach is to import the module that creates the
    // httpLink and verify the fetch options include credentials: 'include'.
    // The tRPC client is defined in apps/web/client/src/lib/trpc.ts.
    // Since the current file only exports `createTRPCReact<AppRouter>()` and the
    // actual httpLink configuration lives in a provider component, the test may
    // need to inspect the provider or the QueryClientProvider setup.
})
```

Note: The tRPC client file at `apps/web/client/src/lib/trpc.ts` currently only exports the `createTRPCReact` call. The actual `httpLink` with `credentials: 'include'` is configured where the tRPC provider is instantiated (likely in `App.tsx` or a dedicated provider component). Section 02 will verify and add this if missing. The test should target wherever that configuration lives.

## Relevant Source File Paths

- **File being tested (authService):** `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/authService.ts`
- **File being tested (tRPC client):** `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/trpc.ts`
- **App entry (cleanup wiring):** `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx`
- **Vitest config:** `/home/dev/projects/SmartSpecPro/apps/web/vitest.config.ts`
- **Existing test examples:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/mediaJobClient.test.ts`
- **Test setup file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/test-setup.ts`

## Run Command

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test
```

To run only Phase 1 tests:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run client/src/services/__tests__/authService.test.ts client/src/__tests__/legacyAuthCleanup.test.ts
```

## Checklist

1. ~~Create `apps/web/client/src/services/__tests__/authService.test.ts` with all 15 test stubs~~ **DONE** — Created with 34 tests (expanded beyond original 15): 22 browser context + 12 Tauri context
2. ~~Create `apps/web/client/src/__tests__/legacyAuthCleanup.test.ts` with 5 test stubs~~ **DONE** — 5 tests
3. ~~Create or add tRPC credentials verification test~~ **DONE** — `apps/web/client/src/lib/__tests__/trpcCredentials.test.ts` with 2 tests (static source analysis)
4. ~~Verify all tests fail initially~~ **DONE** — Tests were written as part of sections 01-02 TDD cycle
5. ~~After sections 01 and 02 are implemented, verify all 41 tests pass~~ **DONE** — All 41 tests pass
6. ~~Run full test suite to confirm no regressions~~ **DONE**

## Implementation Notes

- Tests were implemented alongside sections 01-02 (commits f52ccc9f, b9ddb81e) rather than as a separate step, following TDD methodology
- Total test count expanded from planned 21 to 41 tests for more comprehensive coverage
- authService tests use `vi.resetModules()` + dynamic `import()` pattern for module-level cache isolation
- tRPC credentials test uses static source file analysis (reads main.tsx) rather than runtime inspection
- All tests use `// @vitest-environment jsdom` directive for browser API availability