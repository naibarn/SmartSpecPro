# Section 02: Startup Cleanup and tRPC Verify

## Overview

This section covers two tasks within Phase 1 of the auth token storage hardening:

1. **Startup cleanup function** -- A one-time, idempotent function that removes legacy `localStorage` keys when running in a browser context (not Tauri). This ensures that after the Phase 1 authService changes (Section 01), stale tokens do not linger in localStorage.

2. **tRPC client `credentials: 'include'` verification** -- Confirm that the tRPC HTTP link is configured to send httpOnly cookies automatically. Without this, browser auth would silently break after removing the localStorage JWT fallback.

**Depends on:** Section 01 (authService browser hardening) must be completed first, since the cleanup function uses `hasTauri()` from authService and the overall Phase 1 strategy depends on cookie-only auth being in place.

**Blocks:** Section 03 (Phase 1 tests).

---

## Background

### Why Startup Cleanup Is Needed

After Section 01 removes the localStorage JWT fallback from `authService.ts`, existing users may still have stale keys in their browser localStorage from before the update:

- `smartspec_auth_token`
- `smartspec_user_data`
- `smartspec_web_refresh_token`
- `smartspec_web_token_expiry`
- `smartspec_web_user`

These keys are harmless (the code no longer reads them), but leaving expired JWTs in localStorage is a security hygiene issue. A one-time cleanup removes them.

### Why tRPC Verification Matters

The entire Phase 1 security improvement relies on httpOnly cookies being sent with every tRPC request. The tRPC client in `apps/web/client/src/main.tsx` configures an `httpLink` with a custom `fetch` wrapper. That wrapper must include `credentials: "include"` in every request. If this is missing, all authenticated tRPC calls would fail with 401 after Phase 1 removes the Bearer token path.

### Current State of the Codebase

**tRPC client** (`apps/web/client/src/main.tsx`, lines 263-291): Already configured correctly. The `httpLink` custom fetch wrapper merges `credentials: "include"` into the init options on line 280. No change is needed, but this must be verified with a test so future refactors do not accidentally remove it.

**`hasTauri()`** (`apps/web/client/src/services/authService.ts`, line 8): Returns `true` when `window.__TAURI__` is defined. The cleanup function must use this to skip cleanup in Tauri context (Tauri uses its own native secure store, not localStorage).

**App.tsx** (`apps/web/client/src/App.tsx`, line 354): The root `App` component wraps everything in providers. The cleanup should run once on mount, before any auth-dependent rendering.

---

## Tests First

### Test File: `apps/web/client/src/__tests__/legacyAuthCleanup.test.ts`

This is a new file. It tests the cleanup utility function in isolation.

```
Test: cleanup removes smartspec_auth_token from localStorage in browser context
  - Set up localStorage with smartspec_auth_token
  - Mock hasTauri() to return false
  - Call cleanupLegacyAuth()
  - Assert localStorage.getItem('smartspec_auth_token') is null

Test: cleanup removes all 5 legacy keys from localStorage
  - Set all 5 keys: smartspec_auth_token, smartspec_user_data, smartspec_web_refresh_token, smartspec_web_token_expiry, smartspec_web_user
  - Call cleanupLegacyAuth()
  - Assert all 5 keys are null in localStorage

Test: cleanup does NOT run in Tauri context
  - Mock hasTauri() to return true
  - Set smartspec_auth_token in localStorage
  - Call cleanupLegacyAuth()
  - Assert the key is still present (cleanup was skipped)

Test: cleanup is idempotent (safe to call multiple times)
  - Call cleanupLegacyAuth() twice
  - No errors thrown, no side effects on second call

Test: cleanup does not affect other localStorage keys
  - Set localStorage key 'some_unrelated_key' = 'value'
  - Set smartspec_auth_token = 'old-jwt'
  - Call cleanupLegacyAuth()
  - Assert 'some_unrelated_key' is still 'value'
  - Assert smartspec_auth_token is removed
```

**Mock strategy:**
- Mock the `hasTauri` function. Since it is not exported from `authService.ts`, the cleanup module should either import and re-export it, or use a shared detection utility. The simplest approach: the cleanup function accepts an optional `isTauri` boolean parameter (defaulting to the result of checking `window.__TAURI__`), or the test sets/clears `window.__TAURI__` directly.
- Use the jsdom `localStorage` provided by Vitest's test environment.

### Test File: tRPC credentials verification

This can be added as an assertion in the existing test infrastructure, or as a small standalone file at `apps/web/client/src/lib/__tests__/trpcCredentials.test.ts`.

```
Test: tRPC httpLink includes credentials:'include' in fetch calls
  - Import the tRPC client setup from main.tsx (or extract the fetch wrapper for testability)
  - Mock globalThis.fetch
  - Trigger a tRPC call (or call the custom fetch wrapper directly)
  - Assert that globalThis.fetch was called with an init object containing credentials: "include"
```

**Practical approach:** Since the tRPC client is created inline in `main.tsx` and not easily importable, the simplest verification is a static code assertion test: read the source of `main.tsx` (via `fs.readFileSync` in the test) and assert it contains the `credentials: "include"` string in the httpLink section. Alternatively, extract the custom fetch function into a separate module for direct testing.

---

## Implementation Details

### 1. Create the Cleanup Utility

**New file:** `apps/web/client/src/lib/cleanupLegacyAuth.ts`

This module exports a single function `cleanupLegacyAuth()`. Its responsibilities:

- Check whether the current context is Tauri (by inspecting `window.__TAURI__`). If Tauri, return immediately -- Tauri manages its own secure store and localStorage keys are irrelevant there.
- Define the list of legacy keys to remove:
  - `smartspec_auth_token`
  - `smartspec_user_data`
  - `smartspec_web_refresh_token`
  - `smartspec_web_token_expiry`
  - `smartspec_web_user`
- Iterate over the list and call `localStorage.removeItem(key)` for each.
- The function is synchronous (localStorage is synchronous) and idempotent (removing a non-existent key is a no-op).
- No return value needed.

Function signature:

```typescript
/**
 * Remove legacy localStorage auth keys left over from pre-hardening builds.
 * Only runs in browser context (not Tauri). Safe to call multiple times.
 */
export function cleanupLegacyAuth(): void
```

The list of legacy keys should be defined as a module-level constant array for easy maintenance and test verification.

### 2. Wire Cleanup into App Startup

**File to modify:** `apps/web/client/src/App.tsx`

Add a `useEffect` call inside the `App` component (or a small wrapper component rendered within it) that calls `cleanupLegacyAuth()` once on mount. The cleanup should run exactly once, with no dependencies in the effect array.

The placement should be early in the component tree but does not need to block rendering. A `useEffect(() => { cleanupLegacyAuth(); }, [])` at the top of the `App` function body, before the JSX return, is sufficient.

Alternatively, if the team prefers to keep `App.tsx` minimal, create a `<LegacyAuthCleanup />` component that runs the effect and renders `null`, placed inside `App`'s provider tree.

### 3. Verify tRPC Client Configuration

**File to verify:** `apps/web/client/src/main.tsx`

The current code at lines 263-291 already includes `credentials: "include"` in the custom fetch wrapper passed to `httpLink`. Specifically, line 280:

```typescript
credentials: "include",
```

This is merged into the init options via spread (`...(init ?? {})`), then `credentials: "include"` is set explicitly, which means it will override any prior value. This is correct.

**No code change needed.** The verification is captured via the test described above to prevent future regressions.

**Also note:** The `trpc.ts` file at `apps/web/client/src/lib/trpc.ts` only creates the typed tRPC React hooks (`createTRPCReact<AppRouter>()`). The actual client configuration (links, fetch wrapper) is in `main.tsx`. This is the standard pattern for tRPC v11 with React Query.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/client/src/lib/cleanupLegacyAuth.ts` | **Create** | Cleanup utility function |
| `apps/web/client/src/App.tsx` | **Modify** | Add `useEffect` calling `cleanupLegacyAuth()` on mount |
| `apps/web/client/src/main.tsx` | **Verify only** | Confirm `credentials: "include"` is present (no changes) |
| `apps/web/client/src/__tests__/legacyAuthCleanup.test.ts` | **Create** | Tests for the cleanup function |
| `apps/web/client/src/lib/__tests__/trpcCredentials.test.ts` | **Create** | Regression test for tRPC credentials config |

---

## Key Constants

The five legacy localStorage keys to remove (define once in the cleanup module):

```typescript
const LEGACY_AUTH_KEYS = [
  "smartspec_auth_token",
  "smartspec_user_data",
  "smartspec_web_refresh_token",
  "smartspec_web_token_expiry",
  "smartspec_web_user",
] as const;
```

These same keys appear in the existing `logout()` function in `authService.ts` (lines 149-153). After Section 01 is complete, the `logout()` function will continue to clear these keys as a defense-in-depth measure. The startup cleanup handles the case where a user has not logged out but upgrades to the hardened build.

---

## Edge Cases

- **User has no legacy keys:** Cleanup is a no-op. `localStorage.removeItem` on a non-existent key does nothing and does not throw.
- **User has a valid httpOnly cookie AND legacy localStorage token:** Cleanup removes the localStorage token. The httpOnly cookie continues to work. No re-login needed.
- **User has ONLY a legacy localStorage token (cookie expired):** Cleanup removes the token. The normal auth flow in `AuthContext` will detect the user is unauthenticated (the `auth.me` tRPC call will return 401) and redirect to login. This is expected and acceptable.
- **Tauri desktop app:** Cleanup is skipped entirely. Tauri users are unaffected.
- **SSR/Node.js context:** The `typeof window !== "undefined"` check inside `hasTauri()` (and a similar guard in the cleanup function) prevents errors when code is evaluated server-side.