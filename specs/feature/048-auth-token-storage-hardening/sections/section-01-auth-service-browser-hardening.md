# Section 01: Auth Service Browser Hardening

## Overview

This section covers **Phase 1, Step 1**: modifying `authService.ts` to remove the localStorage JWT fallback when running in a browser context. The Tauri secure store path is preserved unchanged.

**Problem:** The JWT is currently stored in `localStorage` at key `smartspec_auth_token`. Any XSS vulnerability in the app allows full session theft. The httpOnly cookie (`app_session_id`) already handles authentication for all browser users -- the localStorage path is dead weight that introduces unnecessary risk.

**Why it is safe to remove:** The browser auth flow already works entirely via httpOnly cookies. Login sets a cookie with httpOnly, secure, and sameSite flags. The tRPC client sends `credentials: "include"` on every request (confirmed in `apps/web/client/src/main.tsx` line 280). The `useAuth()` hook calls `trpc.auth.me.useQuery()` which relies on the cookie, not a raw token. No frontend component reads the JWT from localStorage for display or API calls.

**Detection mechanism:** The existing `hasTauri()` function checks `window.__TAURI__`. The branching stays the same -- only the browser (non-Tauri) fallback behavior changes.

---

## Dependencies

- None. This section has no dependencies on other sections.
- Sections 02 and 03 depend on this section.

---

## File to Modify

**`/home/dev/projects/SmartSpecPro/apps/web/client/src/services/authService.ts`**

This is the only file modified in this section. The current file is 320 lines and contains both auth token management and API key management functions.

---

## Tests (Write First)

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/authService.test.ts`

Create this test file with the following test cases. Mock `hasTauri()` to control branching, mock `fetch` for server ping tests, and mock `localStorage`/`safeInvoke` for storage tests.

### Test Stubs

```typescript
// authService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock hasTauri() to return false for browser tests, true for Tauri tests
// Mock safeInvoke for Tauri path verification
// Mock global fetch for server ping tests
// Mock localStorage with getItem/setItem/removeItem spies

describe("authService — browser context (hasTauri=false)", () => {
  describe("getAuthToken()", () => {
    it("returns null instead of reading localStorage");
  });

  describe("setAuthToken()", () => {
    it("is a no-op — does not write to localStorage");
  });

  describe("getAuthTokenSync()", () => {
    it("returns null");
  });

  describe("isTokenExpired()", () => {
    it("makes a server ping to /api/auth/me with credentials:'include'");
    it("returns true when server returns 401");
    it("returns false when server returns 200");
    it("returns true on network error (fetch throws)");
  });

  describe("verifyToken()", () => {
    it("uses credentials:'include' instead of Authorization Bearer header");
    it("returns true on 200 response");
    it("calls logout on 401/403 response");
    it("returns false on network error");
  });

  describe("isAuthenticated()", () => {
    it("makes a server ping instead of checking local token");
  });

  describe("setupAuthInterceptor()", () => {
    it("does not inject Bearer token into requests");
    it("triggers logout on 401 response for non-auth URLs");
    it("skips logout for /auth/login paths");
  });

  describe("logout()", () => {
    it("clears all 5 legacy localStorage keys");
    it("clears cached token and user");
    it("navigates to /login");
  });
});

describe("authService — Tauri context (hasTauri=true)", () => {
  describe("getAuthToken()", () => {
    it("reads from Tauri secure store via safeInvoke");
  });

  describe("setAuthToken()", () => {
    it("writes to Tauri secure store via safeInvoke");
  });

  describe("isTokenExpired()", () => {
    it("decodes JWT from secure store and checks exp claim");
  });

  describe("verifyToken()", () => {
    it("sends Authorization Bearer header");
  });

  describe("logout()", () => {
    it("calls Tauri clear_all_credentials");
  });
});
```

### Mock Strategy

- **`hasTauri()`**: The function is module-scoped. To mock it, either extract it to a separate module that can be vi.mock'd, or use `vi.spyOn` on the window object (`(window as any).__TAURI__`). The simplest approach: set `(window as any).__TAURI__ = undefined` for browser tests and `(window as any).__TAURI__ = {}` for Tauri tests.
- **`fetch`**: Use `vi.fn()` assigned to `globalThis.fetch`. Return mock `Response` objects with appropriate status codes and `ok` values.
- **`localStorage`**: Use `vi.spyOn(Storage.prototype, 'getItem')` etc., or assign a mock storage object.
- **`safeInvoke`**: This dynamically imports `@tauri-apps/api/core`. Mock the module with `vi.mock("@tauri-apps/api/core", ...)`.

---

## Implementation Details

Each function in `authService.ts` needs the following changes. The Tauri paths remain untouched in every case.

### getAuthToken()

**Current behavior (browser):** Falls through to `localStorage.getItem('smartspec_auth_token')`.

**New behavior (browser):** Return `null`. The httpOnly cookie is sent automatically by the browser; client code never needs the raw token string.

```typescript
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  try {
    if (hasTauri()) {
      const token = await safeInvoke<string | null>('get_auth_token');
      cachedToken = token;
      return token;
    }
  } catch { /* fallback */ }

  // Browser: httpOnly cookie handles auth. No client-side token needed.
  return null;
}
```

### setAuthToken(token)

**Current behavior (browser):** Writes token to localStorage.

**New behavior (browser):** No-op. The server sets the httpOnly cookie via `Set-Cookie` header. Remove the `cachedToken = token` assignment for the browser path since there is no token to cache.

```typescript
export async function setAuthToken(token: string): Promise<void> {
  try {
    if (hasTauri()) {
      cachedToken = token;
      await safeInvoke('set_auth_token', { token });
      return;
    }
  } catch { /* fallback */ }

  // Browser: no-op. Server sets httpOnly cookie via Set-Cookie header.
}
```

### getAuthTokenSync()

**Current behavior:** Returns the in-memory `cachedToken`.

**Change:** No code change needed. Since the browser path no longer sets `cachedToken`, this naturally returns `null` for browser users. For Tauri, `cachedToken` is still populated by `getAuthToken()`.

### isTokenExpired()

**Current behavior:** Decodes the JWT payload client-side and checks the `exp` claim.

**New behavior (browser):** The browser cannot access the httpOnly cookie's JWT. Instead, make a lightweight server check. If the server returns 200, the session is valid. If 401 or network error, treat as expired.

```typescript
export async function isTokenExpired(): Promise<boolean> {
  if (hasTauri()) {
    // Tauri path: decode JWT from secure store (unchanged)
    const token = await getAuthToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp;
      if (exp && typeof exp === 'number') {
        return Date.now() / 1000 > (exp - 300);
      }
    } catch (e) {
      console.error('Failed to decode token:', e);
    }
    return false;
  }

  // Browser path: server ping to check session validity
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.status === 401;
  } catch {
    return true; // Network error = treat as expired
  }
}
```

### verifyToken()

**Current behavior:** Reads token from `getAuthToken()`, sends it as `Authorization: Bearer` header.

**New behavior (browser):** Use `credentials: 'include'` so the httpOnly cookie is sent instead. No need to read the token at all.

```typescript
export async function verifyToken(): Promise<boolean> {
  try {
    let response: Response;

    if (hasTauri()) {
      // Tauri path: send Bearer token (unchanged)
      const token = await getAuthToken();
      if (!token) return false;
      response = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } else {
      // Browser path: rely on httpOnly cookie
      response = await fetch('/api/auth/me', { credentials: 'include' });
    }

    if (response.ok) {
      const user = await response.json();
      await setUser(user);
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      await logout();
      return false;
    }

    return false;
  } catch (error) {
    console.error("Failed to verify token:", error);
    return false;
  }
}
```

### setupAuthInterceptor()

**Current behavior:** Wraps `window.fetch`, checks for 401/403, and calls `getAuthToken()` to decide whether to auto-logout.

**New behavior (browser):** Remove the `getAuthToken()` check in the 401 handler for browser context. In browser mode, the user is authenticated if the cookie exists (which the JS cannot check directly). Instead, simply trigger logout on 401/403 for any non-auth URL when not already on the login page.

```typescript
export function setupAuthInterceptor() {
  // ... guard against double-setup (unchanged) ...

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response.status === 401 || response.status === 403) {
      const url = args[0] instanceof Request ? args[0].url : args[0].toString();

      if (!url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/desktop/login')) {
        const onLoginPage = window.location.pathname === '/login';
        if (!onLoginPage) {
          if (hasTauri()) {
            // Tauri: check if token exists before logging out
            const hasToken = !!(await getAuthToken());
            if (hasToken) {
              console.warn('Auth error detected, logging out...');
              await logout();
            }
          } else {
            // Browser: cookie auth — if server says 401, session is invalid
            console.warn('Auth error detected, logging out...');
            await logout();
          }
        }
      }
    }

    return response;
  };
}
```

### isAuthenticated()

**Current behavior (browser):** Checks if `getAuthToken()` returns a truthy value.

**New behavior (browser):** Since `getAuthToken()` now returns `null` for browser, this function needs to make a server ping instead.

```typescript
export async function isAuthenticated(): Promise<boolean> {
  try {
    if (hasTauri()) {
      return await safeInvoke<boolean>('is_authenticated');
    }
  } catch { /* fallback */ }

  // Browser: check session via server ping
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.ok;
  } catch {
    return false;
  }
}
```

### initializeAuth()

**Current behavior:** Calls `getAuthToken()`, checks expiry, verifies token.

**New behavior (browser):** Since `getAuthToken()` returns `null` for browser, the existing flow would return early. Adjust so browser path skips the token check and goes straight to `verifyToken()`.

```typescript
export async function initializeAuth(): Promise<void> {
  setupAuthInterceptor();

  if (hasTauri()) {
    // Tauri path: check local token first (unchanged)
    const token = await getAuthToken();
    if (!token) return;
    if (await isTokenExpired()) {
      await logout();
      return;
    }
  }

  // Both paths: verify with server
  await verifyToken();
}
```

### logout()

**Current behavior:** Already clears all 5 legacy localStorage keys and calls Tauri `clear_all_credentials`.

**Change:** No functional change needed. The existing implementation already clears all legacy keys. Keep it as-is since it correctly handles both Tauri and browser paths. The keys it clears are: `smartspec_auth_token`, `smartspec_user_data`, `smartspec_web_refresh_token`, `smartspec_web_token_expiry`, `smartspec_web_user`.

### getUser() / setUser()

**Current behavior (browser):** Uses localStorage for user data.

**Change for this section:** These can remain using localStorage for now since user data (name, email, admin flag) is not a security-sensitive secret the way the JWT is. The user data is also returned by the `/auth/me` endpoint and populated by `verifyToken()`. If desired, these can be changed in a follow-up, but they are not part of the critical security fix.

---

## Error Handling

- If `isTokenExpired()` server ping fails due to network error: return `true` (treat as expired). This triggers a re-login, which is the safest default.
- If `verifyToken()` fetch throws: return `false`, same as current behavior. The caller handles this by showing the login page.
- If user has a valid httpOnly cookie but `getAuthToken()` returns `null`: this is expected and correct. The user IS authenticated (cookie sent automatically), they just cannot inspect the token client-side.

---

## What NOT to Change

- **Tauri paths**: Every `hasTauri()` branch remains identical to the current implementation.
- **Server-side code**: No server changes are needed. The server already accepts both Bearer tokens and session cookies (`context.ts` lines 27-41).
- **API key functions** (lines 270-319): These are handled by Section 07 (Phase 2). Do not touch them in this section.
- **User data functions** (`getUser`, `setUser`, `getUserSync`): Not a security risk at this level; leave unchanged.

---

## Verification Checklist

After implementation:

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test` -- all new tests pass.
2. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` -- no TypeScript errors.
3. Manually verify: `localStorage` no longer receives `smartspec_auth_token` on login in browser.
4. Manually verify: the app still loads authenticated state correctly via the httpOnly cookie.
5. Manually verify: logout clears all legacy keys from localStorage.