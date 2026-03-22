---
name: audit_feature048_auth_hardening
description: 2026-03-19 frontend security audit of feature-048 auth-token-storage-hardening — UserLlmKeysPanel, authService, Settings route gating
type: project
---

Files audited: UserLlmKeysPanel.tsx, authService.ts, Settings.tsx, App.tsx

## Findings

### HIGH
- FE01: `/settings` route in App.tsx:326 not wrapped in RequireAuth — component mounts and fires tRPC queries before useEffect redirect completes. All admin routes use RequireAdmin wrapper; /settings does not.
- FE02: `setUser()`/`getUser()` in authService.ts write/read `smartspec_user_data` (includes `is_admin` flag) to localStorage in browser context (lines 90, 118). Not a session token, but privilege flag readable by XSS.

### MEDIUM
- FE03: `logout()` clears 5 legacy localStorage token keys (lines 162–166) — confirms prior token storage; migration cleanup is correct but window exists for users who haven't logged out since pre-hardening deploy.
- FE04: `VITE_SMARTSPEC_WEB_URL` at line 24 is a non-secret URL, but the naming pattern may invite future secret leakage via VITE_ prefix. Recommend lint guard.

### LOW
- FE05: console.error/warn calls in auth error paths (lines 137, 210, 238, 244) — no secrets logged but auth state visible in DevTools.

## Passed checks
- No dangerouslySetInnerHTML in UserLlmKeysPanel
- Only keyHint (last 4 chars) displayed, never full key
- apiKeyInput state cleared on all exit paths (success, cancel, escape)
- Input type="password" on line 135
- No sessionStorage API key patterns anywhere in client/src
- Old functions (setApiKey, getApiKey, deleteApiKey, listStoredApiKeys, hasApiKey) fully removed from authService and not imported anywhere
- tRPC mutations used (not raw fetch) — CSRF protection adequate
- setAuthToken() is browser no-op; getAuthToken() returns null in browser context

**Why:** Auth token storage hardening migration is largely complete. Key gaps are: (1) route render-blocking guard missing for /settings, (2) user profile object with is_admin persisted to localStorage.
**How to apply:** When reviewing future auth changes, verify that new user-facing routes use a render-blocking auth guard (not just a useEffect redirect), and that no user object fields with privilege flags are written to localStorage in browser context.
