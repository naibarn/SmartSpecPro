---
name: audit_final_auth_apikey_ui
description: 2026-03-19 enterprise-grade final audit of authService, UserLlmKeysPanel, UserAPIKeysPanel, App.tsx routes, Settings.tsx 2FA section
type: project
---

# Final Auth & API Key UI Security Audit — 2026-03-19

## Overall Rating: CONDITIONAL PASS

All previously identified CRITICAL issues (JWT localStorage, unguarded /settings) are now resolved.
Remaining issues are MEDIUM or lower. Two new items identified: raw fetch() for 4 x 2FA mutations in
Settings.tsx (CSRF-adjacent, MEDIUM), and 5 authenticated-only pages lack RequireAuth guards.

## New Findings

### PASS items resolved since last audit
- authService: no localStorage token writes in browser path (PASS)
- authService: no is_admin in localStorage (PASS — in-memory only)
- authService: legacy key cleanup in logout() covers all 5 legacy keys (PASS)
- /settings, /settings/personas, /settings/skills: all wrapped in RequireAuth (PASS)
- /admin/* routes: all 25+ paths wrapped in RequireAdmin (PASS)
- RequireAuth/RequireAdmin render null while loading (PASS)
- UserLlmKeysPanel: type="password" on key input (PASS)
- UserLlmKeysPanel: only keyHint displayed, no raw key (PASS)
- UserLlmKeysPanel: AlertDialog confirmation before delete (PASS)
- UserLlmKeysPanel: state cleared on save/cancel/escape (PASS)
- UserAPIKeysPanel: raw key shown once in one-time Dialog, not stored after close (PASS)
- UserAPIKeysPanel: AlertDialog confirmation before revoke (PASS)
- UserAPIKeysPanel: AlertDialog confirmation before webhook delete (PASS)
- UserAPIKeysPanel: expiry badge for keys expiring within 30 days (PASS)
- No dangerouslySetInnerHTML or innerHTML assignments in settings panels (PASS)
- All mutations via tRPC in key panels (PASS)
- Error toasts use generic messages, no internal errors exposed (PASS)
- No VITE_ vars containing server secrets (VITE_FRONTEND_FORGE_API_KEY is proxy/public key — reviewed 2026-03-16, acceptable)

### Remaining / New Issues
- Settings.tsx:91,110,130,151 — 4 x raw fetch() to /trpc/auth.{setup2FA,confirm2FA,disable2FA,regenerateRecoveryCodes}
  - credentials:'include' present, so session cookie is sent; but tRPC client should be used for consistency and type safety
  - MEDIUM (not bare HTTP endpoint, /trpc path still uses tRPC protocol)

- App.tsx:313,316,317,318,321,322,323,328,331,332 — /chat, /teams, /teams/:teamId, /agencies, /agencies/:id/edit,
  /agencies/:id, /workflows, /dashboard, /media-studio, /credits all lack RequireAuth guards
  - These pages rely on server-side 401 rejection and component-level auth checks
  - HIGH for data-bearing pages (/dashboard, /media-studio, /credits) — flash of content visible before redirect

- AuthContext.tsx:60 — checkAuth() uses raw fetch('/trpc/auth.me') instead of tRPC client
  - Low risk (credentials:'include' present), but inconsistent pattern

**Why:** Recorded to track outstanding items for future hardening pass.
**How to apply:** Flag if any of the above routes are modified — the missing RequireAuth guards are the most important remaining gap.
