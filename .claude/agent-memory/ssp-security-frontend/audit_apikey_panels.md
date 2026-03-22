---
name: audit_apikey_panels
description: 2026-03-19 security audit of UserAPIKeysPanel and UserLlmKeysPanel — key display, rotation UX, secret exposure, lifecycle gaps
type: project
---

Audit of UserAPIKeysPanel.tsx, UserLlmKeysPanel.tsx, Settings.tsx (API tab).

**Why:** Pre-merge security review for API key management UIs.
**How to apply:** Reference when reviewing key display, rotation UX, or lifecycle management in settings UI.

## Findings Summary

### PASS items
- UserLlmKeysPanel: raw key never returned to client; only keyHint (last 4 chars) shown after save
- UserLlmKeysPanel: input field uses type="password"; cleared on cancel/success
- UserAPIKeysPanel: one-time display dialog with explicit "not shown again" warning
- UserAPIKeysPanel: copy-from-state only (no re-fetch of raw key)
- Both panels: all mutations via tRPC (CSRF protected by SameSite cookie)
- No dangerouslySetInnerHTML or console.log leaks in either panel
- Key name length is capped at maxLength={100} in the create form

### FAIL items
- FE-AK01 HIGH: /settings route uses useEffect redirect (race-window vulnerability) — not wrapped in RequireAdmin/RequireAuth guard component
- FE-AK02 HIGH: Webhook delete fires immediately without confirmation dialog
- FE-AK03 MEDIUM: LLM key delete fires immediately without confirmation dialog
- FE-AK04 MEDIUM: No UI-enforced cap on number of public API keys per user (server may enforce but UI gives no feedback)
- FE-AK05 MEDIUM: key.name rendered via JSX text interpolation in revoke dialog — safe, but server-supplied key.name also rendered unescaped in table cells; React text nodes are XSS-safe so this is informational
- FE-AK06 LOW: No key expiry countdown or near-expiry warning in UserAPIKeysPanel (expiry date shown but no colour/badge for "expiring soon")
- FE-AK07 LOW: tRPC error messages passed directly to toast.error() — could surface internal DB error strings; no sanitization layer
- FE-AK08 CSRF-ADJACENT: TwoFactorSection in same Settings.tsx file uses raw fetch() for 4 mutations (setup2FA, confirm2FA, disable2FA, regenerateRecoveryCodes) — not tRPC mutations, so no automatic CSRF cookie header
