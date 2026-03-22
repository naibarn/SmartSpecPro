---
name: audit_invite_code_frontend
description: Security audit of invite code frontend — Signup.tsx, InviteCodeManager.tsx, MyInviteCode.tsx, AdminSettings.tsx, AdminUsers.tsx. Last verified Round 11 (post-commit, 2026-03-21).
type: project
---

Audit of invite code system frontend components on branch codex/feature-044-multimodal-chat-memory.

**Why:** Pre-merge security review dispatched as one of 3 parallel specialists.
**How to apply:** Reference for follow-up fix verification and regression checks.

## Current Status (Round 11 — post-commit, 2026-03-21)

FE01 and FE02 (HIGH) were identified in the prior round and remain UNFIXED in the post-commit code.
FE03 and FE04 (MEDIUM) also remain open.

## Open Findings

| ID   | Severity | File:Line                                              | Anti-Pattern              | Status  |
|------|----------|--------------------------------------------------------|---------------------------|---------|
| FE01 | HIGH     | Signup.tsx:198                                         | Cookie no HttpOnly        | OPEN    |
| FE02 | HIGH     | Signup.tsx:155–168                                     | CSRF — raw fetch() for register mutation | OPEN |
| FE03 | MEDIUM   | Signup.tsx:99–110                                      | URL param / state divergence on re-render | OPEN |
| FE04 | MEDIUM   | Signup.tsx:214                                         | Open redirect via authorization_url | OPEN |

## Confirmed Clean

- XSS via dangerouslySetInnerHTML — not present in any file
- JWT/auth token in localStorage — not present
- User-controlled innerHTML / iframe / dynamic script — not present
- VITE_ secret leakage — VITE_API_URL is a public base URL; no secrets
- Unguarded admin routes — AdminSettings enforces role === "admin" at component and tRPC query level
- InviteCodeManager / InviteCodeDashboard — only reachable inside RequireAdmin-gated AdminSettings
- Clipboard API — copies only sanitized invite code string or share URL
- Error message leakage — toast.error(errorMsg) uses tRPC message field; no stack trace or DB detail expected
