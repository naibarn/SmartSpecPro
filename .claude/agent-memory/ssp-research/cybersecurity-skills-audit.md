---
name: Cybersecurity Skills Audit for SmartSpecPro
description: Maps Anthropic cybersecurity skills to SmartSpecPro's attack surface and identifies gaps
type: project
---

# Cybersecurity Skills Audit for SmartSpecPro

**Date**: 2026-03-16
**Scope**: Research → Identify which Anthropic cybersecurity skills are relevant to SmartSpecPro's production codebase
**Status**: Complete — 22 Critical/High priority skills mapped

## Executive Summary

SmartSpecPro is a **multi-tenancy AI platform with complex attack surface**: React frontend, Express/tRPC backend, FastAPI Python backend, Celery async tasks, PostgreSQL, Redis, S3/R2 storage, multi-provider LLM integration, and Tauri desktop app.

**Key Finding**: The project has strong foundational security (AES-256-GCM encryption, RBAC, input validation via Zod, rate limiting) but lacks comprehensive cybersecurity skills documentation. The Anthropic skills repo contains **22 skills** directly applicable to SmartSpecPro's architecture.

**Why This Matters**:
- Cybersecurity skills serve as **reference documentation** for security code reviews
- They provide **concrete attack scenarios** mapped to specific code paths
- They enable **consistent security awareness** across the dev team
- They document **proven defenses** against specific threats

---

## Architecture Context

### SmartSpecPro Components Under Threat

| Component | Tech | Attack Surface |
|-----------|------|-----------------|
| **Frontend** | React 19, Vite, Wouter, TanStack Query | XSS, CSRF, client-side auth bypass, malicious dependencies |
| **Backend API** | Express 4, tRPC 11 | SQL injection, IDOR, rate limit bypass, prompt injection, API key leakage |
| **Authentication** | JWT + cookies, Jose library, RBAC | Token theft, session hijacking, JWT algorithm confusion, RBAC bypass |
| **Database** | PostgreSQL 15, Drizzle ORM | SQL injection, ORM bypass, unprotected sensitive columns |
| **Encryption** | AES-256-GCM (crypto.ts), SHA-256 key derivation | Key management, IV reuse, decryption oracle attacks |
| **Python Backend** | FastAPI, SQLAlchemy 2, Celery | Unsafe deserialization, command injection, pickle exploits |
| **Media Generation** | S3/R2 storage, FFmpeg subprocess calls | Path traversal, malicious file upload, S3 bucket misconfiguration |
| **LLM Integration** | Multi-provider (OpenAI, Anthropic, Google), prompt-based skills | Prompt injection, data exfiltration via LLM, model poisoning |
| **Desktop (Tauri)** | Tauri 2 | Insecure IPC, localStorage secret storage, build security |
| **Infrastructure** | Nginx, Docker, systemd, Redis | Nginx misconfiguration, Docker escape, Redis auth bypass |

### Existing Security Controls

✓ **Encryption**: AES-256-GCM (authenticated encryption) for API keys, TOTP secrets
✓ **Input Validation**: Zod schemas on all tRPC endpoints
✓ **Rate Limiting**: Bottleneck + BullMQ, per-key RPM limits (600 RPM soft cap)
✓ **RBAC**: 3-tier hierarchy (user < admin < domain_admin)
✓ **Audit Logging**: JSONL-based structured logs with traceId
✓ **CORS**: Origin whitelist (smartaihub.app, smartspec.local, etc.)
✓ **API Key Auth**: HMAC-SHA256 hashing, scope enforcement
✓ **Secrets Storage**: Encrypted in database, not in .env

**GAPS**: No dedicated skills for threat modeling, no prompt injection documentation, limited Celery/subprocess safety docs

---

## Critical & High Priority Skills Needed

### A. API Security (5 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **IDOR Prevention Patterns** | REST API Security | All tRPC endpoints that read/modify user/tenant data | CRITICAL | tRPC router at `/apps/web/server/routers/*` has 50+ endpoints; 20+ access user-specific resources. Need systematic IDOR detection pattern (check `req.auth.userId` matches resource owner on every read/write). Examples: media.getGeneration, chat.getMessage, presentation.getSlide. |
| **API Rate Limiting Bypass Detection** | API Security | apiKeyRateLimiter.ts, distributedRateLimit.ts | CRITICAL | Current: per-key RPM limits + per-user in-memory limits. Risk: Redis-backed sliding window can be brute-forced if window granularity is wrong or if bypass exists in middleware chain (line 101 in index.ts uses apiKeyRateLimiter). Need skill to audit window size, clock skew, distributed bypass patterns. |
| **tRPC Type Safety & Input Validation** | Input Validation | All 50+ tRPC routers | HIGH | Zod schemas on all endpoints, but skill should document: (1) z.string().url() misuse (relative URLs fail), (2) z.instanceof() bypasses, (3) discriminated unions in media generation. Real issue: gallery URLs stored as relative paths break URL validation (apps/web/client/src/lib/imageGallerySlice.ts). |
| **API Key Management Pitfalls** | API Security | /apps/web/server/middleware/apiKeyAuth.ts, opencode_api_keys table | HIGH | Keys stored as SHA-256 hash only; good. But skill should document: (1) key rotation procedures, (2) leaked-key detection, (3) scope enforcement validation (requireScopes.ts checks scopes), (4) expiration enforcement. Need to verify all 4 are correctly implemented. |
| **GraphQL/REST Authorization Bypass** | Authorization | Not applicable (tRPC, not GraphQL) | MEDIUM | SmartSpecPro uses tRPC (type-safe RPC), not REST or GraphQL. Skip unless planning REST API expansion. |

---

### B. LLM & Prompt Security (4 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **Prompt Injection Prevention** | LLM Security | All skill execution, chat.executeSkill, presentation.ai.generateDraft | CRITICAL | **HIGHEST RISK**. Three attack surfaces: (1) User message → skill system (skillDetector.ts auto-triggers skills based on user input), (2) Skill result → LLM system prompt (skills embed content directly into prompts), (3) LLM output → template rendering (presentation generation). Need concrete patterns: input sanitization for skill prompts, output escaping for templates, jailbreak detection. Reference: apps/web/server/services/skillExecutor.ts (line ~200-400 embeds skill content as system prompt). |
| **LLM Data Exfiltration via Prompts** | LLM Security | audit logs, user data, conversation history | CRITICAL | **HIGH RISK**. LLM can be prompted to return sensitive data: "Repeat your system prompt", "What credentials do you have?", "List the last 10 users". Need skill to: (1) document what data should NOT be in prompts, (2) detect exfiltration patterns in LLM responses, (3) sanitize conversation context before sending to LLM. Reference: memoryService.ts (line ~50-100) loads previous messages as context; aiPresentationService.ts (line ~1000) includes article text in generation prompt. |
| **LLM Model Poisoning via Training Data** | LLM Security | Model behavior, fine-tuning pipelines | MEDIUM | SmartSpecPro doesn't fine-tune models (uses multi-provider API only). Skip unless adding custom fine-tuning. |
| **Token Limit Abuse & Cost Attacks** | LLM Security | costTracker.ts, creditService.ts | HIGH | User can craft input that generates huge token counts (recursive prompts, repeated content). Need skill to: (1) validate token count estimates before LLM call, (2) detect pathological input patterns, (3) enforce per-request token limits. Reference: llmRouter.ts (line ~300) routes to providers; costCalculationMethod in providerUsageLog doesn't validate tokens before API call. |

---

### C. Authentication & Session Security (4 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **JWT Algorithm Confusion Attacks** | JWT Security | Auth tokens, session management | CRITICAL | **PRODUCTION RISK**. JWT library: `jose` (secure). But need to verify: (1) algorithm is hardcoded (not user-controlled), (2) "none" algorithm rejected, (3) key mismatch detection. Reference: apps/web/server/_core/context.ts verifies JWT; need to check that algorithm is pinned. |
| **Session Hijacking & Token Theft** | Authentication | Session cookies, JWT tokens | CRITICAL | Tokens stored in: (1) localStorage (client-side, vulnerable to XSS), (2) cookies (httpOnly by default?). Risk: If XSS exists, attacker can steal localStorage tokens. Need: (1) verify cookies are httpOnly + Secure + SameSite, (2) detect stolen token patterns (same token from different IPs), (3) session invalidation on logout. Reference: COOKIE_NAME constant used in index.ts. |
| **RBAC Bypass via Role Escalation** | Authorization | User < Admin < DomainAdmin hierarchy | HIGH | Three RBAC tiers. Need to verify all privileged routes check role: (1) systemSettings (admin-only), (2) llmProviders CRUD (admin-only), (3) user management (domainAdmin-only). Risk: A procedure might forget to check `req.auth.role`. Reference: adminOps router (line 1-100) should use role checks; skillRegistry.ts (admin feature, should block users). |
| **OAuth/OIDC Misconfiguration** | Authentication | Google Drive, OneDrive integrations | MEDIUM | SmartSpecPro integrates with Google Drive (googleDrive.ts) and OneDrive (oneDrive.ts). Need: (1) verify PKCE is used for OAuth flow, (2) state parameter validation, (3) token refresh security, (4) scope minimization. Not critical for core auth, but needed for integrations. |

---

### D. Encryption & Key Management (3 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **AES-GCM Implementation Pitfalls** | Encryption | All encrypted data (API keys, TOTP secrets, system settings) | CRITICAL | **STRONG IMPLEMENTATION BUT VERIFY**. crypto.ts uses AES-256-GCM correctly: (1) random IV per encryption, (2) auth tag validation on decrypt, (3) SHA-256 key derivation. But need skill to document: (1) IV uniqueness (uses crypto.randomBytes, good), (2) no IV reuse (critical for GCM), (3) auth tag length (16 bytes, correct), (4) graceful handling of legacy CBC format (deprecated). Reference: crypto.ts lines 28-76. |
| **Secrets Exposure in Logs & Errors** | Secrets Management | All error messages, logs, API responses | CRITICAL | **MAJOR RISK**. Need to prevent: (1) decrypted values in console.log (logger.ts?), (2) plaintext env vars in error messages sent to client, (3) secrets in URL parameters, (4) secrets in stack traces. Reference: Check all try/catch blocks in llm routes, media generation. Real risk: If LLM provider API fails, error message might include API key. |
| **Key Rotation & Storage** | Key Management | LLM_ENCRYPTION_KEY derivation | MEDIUM | No documented key rotation procedure. Need: (1) plan for rotating LLM_ENCRYPTION_KEY, (2) re-encrypt all data with new key, (3) graceful transition period, (4) audit rotation events. Reference: CLAUDE.md mentions "NEVER change LLM_ENCRYPTION_KEY without re-encrypting" but no implementation. |

---

### E. Database Security (3 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **SQL Injection via Drizzle ORM** | Database Security | All Drizzle queries in routers/services | CRITICAL | **GENERALLY SAFE** (Drizzle is parameterized), but need skill to document ORM bypass patterns: (1) raw SQL queries (dangerous if not parameterized), (2) string concatenation in where clauses, (3) user input in .raw() calls. Reference: Search for `.raw(` in codebase; if found, verify it's not user-controlled. Also check for raw() in migration files. |
| **Sensitive Data in Database** | Data Protection | Users, credentials, LLM API keys, TOTP secrets | HIGH | Critical columns should be encrypted: (1) llmProviders.apiKeyEncrypted (good), (2) system_settings sensitive values (auto-encrypted if isSensitive=true), (3) opencode_api_keys.key_hash (good, hash not plaintext). But need: (1) audit all tables for plaintext secrets, (2) verify no API keys in JSON columns (e.g., tenants.settings), (3) check TOTP secret storage (encrypted?). Real risk: integrations.config might store plaintext OAuth tokens. |
| **N+1 Query Attacks** | Query Performance | All paginated endpoints (messages, media, presentations) | HIGH | Database queries in tight loops can be exploited for DoS. Need to: (1) verify pagination limits are enforced (max 100 items per request?), (2) check for missing WHERE clauses that could return millions of rows, (3) detect N+1 patterns (loop loading related data). Reference: Audit routers for list operations (media.list, chat.listMessages, presentation.list). |

---

### F. File Upload & Path Security (3 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **Path Traversal in File Upload** | File Security | Media upload, file parsing, skill file loading | CRITICAL | **RISK IDENTIFIED**. Skill executor loads files from disk: SANDBOX_SKILL_ROOT = "/workspace/skill" (skillExecutor.ts line 44). Risk: If user-controlled path is passed, attacker could read /etc/passwd. Also: FFmpeg subprocess calls with user-supplied filenames (mediaGenerationService.ts). Need: (1) strict path validation (reject .., /, absolute paths), (2) symlink protection, (3) verify file ownership, (4) sandbox restrictions. |
| **Malicious File Upload** | File Security | Image/video uploads, document parsing | HIGH | Users can upload images, videos, PDFs. Risks: (1) malicious image (polyglot exploits), (2) ZIP bomb (extract causes disk DoS), (3) PDF with embedded JS. Need: (1) MIME type validation (not just extension), (2) file size limits (already have SANDBOX_MAX_INLINE_FILE_BYTES = 2MB), (3) antivirus scanning (ClamAV?), (4) sandboxed unpacking. Reference: mediaGenerationService.ts (line ~400) receives user files. |
| **S3/R2 Bucket Misconfiguration** | Cloud Storage | Public file exposure, SSRF via S3 URLs | HIGH | SmartSpecPro uses S3/R2 for storage. Risks: (1) bucket left public (allows anyone to list/download), (2) missing access controls on bucket (only authenticated users should read), (3) SSRF via user-supplied S3 URLs (proxyImageFromUrl in index.ts). Need: (1) verify bucket ACLs are private, (2) verify all objects require authentication, (3) validate URLs to prevent SSRF (imageProxySafety.ts already exists, verify it). Reference: apps/web/server/services/imageProxySafety.ts (line ~1-50 should validate S3 URLs). |

---

### G. Python Backend & Subprocess Security (3 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **Command Injection in Python subprocess** | Code Execution | Media generation (FFmpeg), file processing, async tasks | CRITICAL | **HIGH RISK**. FastAPI backend spawns subprocesses: FFmpeg for video, Python scripts for media tasks. Risks: (1) user input in shell commands (shell=True is dangerous), (2) unquoted arguments, (3) wildcard expansion. Need: (1) use subprocess.run without shell=True, (2) pass args as list not string, (3) validate/sanitize all user input. Reference: Search python-backend/ for subprocess.Popen, subprocess.run with shell=True. |
| **Unsafe Pickle Deserialization** | Deserialization | Celery tasks, Redis caching, task state | HIGH | Celery can use pickle for serialization (insecure). If attacker controls serialized object, RCE possible. Need: (1) verify Celery uses JSON not pickle, (2) validate all Redis-cached objects, (3) disable pickle in Celery config. Reference: python-backend/app/core/celery_app.py (check accept_content). |
| **SQL Injection in SQLAlchemy** | Database Security | Python ORM queries | HIGH | SQLAlchemy is generally safe (parameterized), but text() queries are dangerous. Risk: If python-backend uses text() with user input, SQL injection possible. Need: (1) search for text() in python-backend, (2) replace with ORM queries or use bound parameters, (3) avoid .format() or f-strings in SQL. |

---

### H. Infrastructure & Deployment Security (2 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **Nginx Reverse Proxy Misconfiguration** | Infrastructure | TLS, request routing, header validation | HIGH | Nginx proxies requests to backend. Risks: (1) TLS not enforced (HTTP allowed), (2) Host header not validated (Host Header Injection), (3) X-Forwarded-For spoofing. Need: (1) verify Nginx forces HTTPS, (2) check Host header validation, (3) verify trust proxy setting = 1 (already set in index.ts line 122, good). Reference: nginx/conf.d/dev-host.conf. |
| **Docker & Container Security** | Infrastructure | Container escape, privilege escalation, image vulnerabilities | MEDIUM | Services run in Docker. Risks: (1) running as root, (2) exposed ports, (3) vulnerable base images. Need: (1) verify non-root user in Dockerfile, (2) scan images with trivy, (3) restrict capabilities. Reference: docker-compose.yml, docker/ directory. |

---

### I. Redis & Queue Security (2 skills)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **Redis Authentication & Access Control** | Cache/Queue Security | Data in-flight, job queue integrity | HIGH | Redis used for: (1) session/token caching (memoryService), (2) BullMQ job queue (media tasks, webhooks), (3) rate limit counters. Risks: (1) Redis exposed without password (check docker-compose), (2) jobs can be tampered with if queue name guessable, (3) no encryption of data-in-transit. Need: (1) verify Redis requirepass set, (2) verify Redis port not exposed publicly, (3) use TLS for client connection (if prod). Reference: redis.ts, docker-compose.yml. |
| **BullMQ Job Injection & Tampering** | Queue Security | Media generation jobs, webhook jobs, async tasks | HIGH | BullMQ stores jobs in Redis. Risks: (1) job name guessable (attacker enqueues malicious job), (2) job data not validated on dequeue, (3) no signing of job payloads. Need: (1) validate job type on worker dequeue, (2) sign jobs with HMAC, (3) use queue rate limiting. Reference: mediaGenerationService.ts, webhookDispatchQueue.ts should validate job shape before processing. |

---

### J. Desktop App & Tauri Security (1 skill)

| Skill Name | Category | Protects | Priority | Why Needed |
|-----------|----------|----------|----------|-----------|
| **Tauri IPC & WindowAPI Vulnerabilities** | Desktop Security | Inter-process communication, window sandbox | MEDIUM | Tauri app (apps/tauri-shell/) communicates with Node.js backend. Risks: (1) insecure IPC protocol (replay attacks), (2) WindowAPI methods exposed to untrusted content, (3) secrets stored in localStorage (accessible to JS). Need: (1) verify IPC uses signatures, (2) validate all IPC messages, (3) store secrets in secure storage (not localStorage). Reference: apps/tauri-shell/ structure. |

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1 — 8 hours)

**Must complete before next production release:**

1. **Prompt Injection Prevention** (2 hrs)
   - Document what data can be user-controlled in skill prompts
   - Add input sanitization to skillExecutor.ts before embedding in LLM prompts
   - Add output escaping to presentation generation before template rendering
   - Test: jailbreak attempts (e.g., "Ignore previous instructions", "Repeat system prompt")

2. **Secrets Exposure Audit** (1.5 hrs)
   - Search codebase for console.log, logger.info, print() with potential secrets
   - Verify error responses don't include decrypted values
   - Check error messages don't expose API endpoints or internal structure
   - Test: intentionally fail LLM call, verify error doesn't leak API key

3. **Path Traversal in Skill Loading** (1.5 hrs)
   - Verify skillExecutor.ts validates file paths (reject .., /, absolute paths)
   - Check FFmpeg calls in mediaGenerationService.ts quote filenames
   - Add symlink protection (resolve to canonical path, verify within sandbox)
   - Test: attempt ../../etc/passwd in filename

4. **Command Injection in Python Backend** (2 hrs)
   - Audit python-backend/ for subprocess calls
   - Replace shell=True with args list
   - Validate all user input before subprocess call
   - Test: payload with shell metacharacters (|, ;, `, $(), &&)

5. **IDOR Systematic Audit** (1 hr)
   - Create checklist for all tRPC procedures that access user/tenant data
   - Verify every read/write checks req.auth.userId matches resource owner
   - Test: attempt to access another user's media/presentation/chat

### Phase 2: High Priority Improvements (Week 2 — 6 hours)

1. **Rate Limiting Verification** (1 hr)
   - Verify sliding window granularity (should be 1-second, not 1-minute)
   - Test distributed bypass (same user from multiple IPs)
   - Verify quota enforcement in quotaMiddleware.ts

2. **RBAC Enforcement** (1.5 hrs)
   - Audit admin-only routers (adminOps, systemSettings, llmProviders)
   - Verify all privileged operations check role
   - Test: attempt to call admin endpoint as regular user

3. **Encryption Verification** (1 hr)
   - Verify IV is unique per encryption (not reused)
   - Test decryption of legacy CBC format (should reject gracefully)
   - Verify auth tag validation (corruption detection)

4. **SQL Injection in Python** (1 hr)
   - Search for text() in python-backend/
   - Replace with ORM queries or bound parameters
   - Test: SQL injection payload in user input

5. **Session Security** (0.5 hrs)
   - Verify cookies are httpOnly + Secure + SameSite
   - Check token expiration logic
   - Test: attempt to steal token via XSS (verify httpOnly protects it)

### Phase 3: Medium Priority Improvements (Week 3+ — 4 hours)

1. **N+1 Query Detection** (1 hr)
   - Profile database queries in list endpoints
   - Add pagination limits (max 100 items)
   - Optimize with batch loading if needed

2. **S3 Bucket Security** (0.5 hrs)
   - Verify bucket is private (not public-read)
   - Verify objects require authentication
   - Test: attempt to list/download without credentials

3. **OAuth/OIDC Verification** (1 hr)
   - Verify PKCE is used (state parameter + code_challenge)
   - Check token refresh doesn't expose old tokens
   - Minimize OAuth scopes requested

4. **Docker & Container Hardening** (1.5 hrs)
   - Verify Dockerfile runs as non-root user
   - Scan images with trivy for CVEs
   - Restrict container capabilities

---

## Files Requiring Security Skills Review

### Frontend
- `apps/web/client/src/` — XSS, CSRF, sensitive data in localStorage
- `apps/web/client/src/components/chat/` — LLM responses rendered, prompt injection risk
- `apps/web/client/src/components/media/` — File upload validation (client-side only)
- `apps/web/client/src/pages/PresentationEditor.tsx` — Template rendering with user data

### Backend (Node)
- `apps/web/server/routers/` (50+ files) — IDOR in user/tenant data access
- `apps/web/server/services/skillExecutor.ts` — Subprocess safety, path traversal
- `apps/web/server/services/skillRegistry.ts` — Unsafe file loading
- `apps/web/server/services/mediaGenerationService.ts` — FFmpeg command injection, file upload
- `apps/web/server/services/crypto.ts` — Encryption implementation (looks good)
- `apps/web/server/services/llmRouter.ts` — Prompt injection, token estimation
- `apps/web/server/middleware/` (17 files) — Rate limiting, auth, CORS, audit

### Backend (Python)
- `python-backend/app/` — Subprocess calls, Celery security, SQLAlchemy queries
- `python-backend/app/core/celery_app.py` — Pickle vs JSON serialization
- `python-backend/app/tasks/` — Async task security

### Infrastructure
- `apps/web/server/_core/index.ts` — Middleware chain, trust proxy setting
- `nginx/conf.d/` — TLS, Host header validation
- `docker-compose.yml` — Exposed ports, Redis auth
- `docker/systemd/` — Service security, non-root user

---

## Success Metrics

**Security Posture Improvements:**
- [ ] Zero CRITICAL vulnerabilities in OWASP Top 10 categories
- [ ] 100% of tRPC endpoints have IDOR protection (verified via checklist)
- [ ] 100% of subprocess calls use parameterized execution (no shell=True)
- [ ] Zero plaintext secrets in logs/errors/responses
- [ ] Rate limiting passes distributed bypass test
- [ ] Encryption uses unique IVs (verified via test)

**Skill Documentation:**
- [ ] All 22 skills read and understood by at least one engineer
- [ ] Each skill has "How to apply to SmartSpecPro" notes
- [ ] Each skill has code examples from actual codebase
- [ ] Each skill is linked from relevant service file (as comment)

---

## References

- **Anthropic Cybersecurity Skills Repo**: github.com/mukul975/Anthropic-Cybersecurity-Skills
- **OWASP Top 10 (2021)**: owasp.org/www-project-top-ten/
- **CWE Top 25**: cwe.mitre.org/top25/
- **SmartSpecPro CLAUDE.md**: Root codebase documentation
- **SmartSpecPro Architecture**: See PRESENTATION-SYSTEM-COMPREHENSIVE-RESEARCH.md

---

## Notes for Implementation

1. **Skills are reference, not code**: These are learning documents, not automated fixes. Each skill should be read, discussed, and manually applied to codebase.

2. **Create skill files locally**: Consider creating corresponding skill.md files in `apps/web/skills/` for each cybersecurity skill, with SmartSpecPro-specific examples.

3. **Integrate into code review**: Use skills as checklist items during PR reviews (e.g., "Does this endpoint check IDOR?")

4. **Track in CLAUDE.md**: Add "Security Audit" section to CLAUDE.md Debugging Protocol with links to relevant skills.

5. **Automate where possible**: Some checks (SQL injection, subprocess safety) can be automated via linters (ESLint, Ruff rules).
