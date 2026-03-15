# Spec 043 Consolidated Review — ผลตรวจสอบความสมบูรณ์

**Date:** 2026-03-14
**Reviewers:** Security Auditor, Architecture Reviewer, Code Reviewer (3 parallel agents)
**Verdict:** APPROVE_WITH_FIXES — Architecture ถูกต้อง แต่มี 37 จุดที่ต้องเพิ่มเติมก่อน implement

---

## CRITICAL (9 จุด — ต้องแก้ก่อน implement)

### C-01: SHA-256 API Key Hash ถูก Brute-Force ได้ถ้า DB หลุด → ใช้ HMAC-SHA256 + server pepper
**Source:** Security Auditor
**ปัญหา:** Plain SHA-256 ไม่มี pepper — GPU สามารถ compute พันล้าน hash/วินาที ถ้า DB ถูก exfiltrate จะกู้คืน API key ได้
**Fix:** เปลี่ยนเป็น `HMAC-SHA256(API_KEY_HMAC_SECRET, fullKey)` — ใช้ env var `API_KEY_HMAC_SECRET` (random 32 bytes) แยกจาก `LLM_ENCRYPTION_KEY`

### C-02: Timing Attack บน API Key Authentication
**Source:** Security Auditor
**ปัญหา:** DB index lookup return ทันทีสำหรับ miss vs ช้ากว่าเล็กน้อยสำหรับ hit → timing oracle
**Fix:** หลัง DB lookup ต้อง compare hash ด้วย `crypto.timingSafeEqual()` + เพิ่ม constant-time delay สำหรับ auth failure (อ้างอิง pattern ใน `llmRoutes.ts:1225`)

### C-03: Pipeline Template Injection เข้า LLM System Prompts
**Source:** Security Auditor
**ปัญหา:** `{{steps.research.output}}` อาจ carry adversary content จาก external URL เข้า downstream skill's system prompt → prompt injection escalation
**Fix:**
- กำหนด allowlist ของ substitutable fields: `output`, `summary`, `status`, `error.message` เท่านั้น
- Cap 8KB per substitution, strip control chars
- ทุก substituted value ต้องอยู่ใน `HumanMessage` context ห้ามใส่ system prompt
- อ้างอิง CLAUDE.md Rule 3

### C-04: MCP Tool Dispatch ไม่มี SSRF Firewall Layer
**Source:** Security Auditor
**ปัญหา:** `smartspec.browser.execute` รับ URL จาก external agent โดยไม่ validate → อ่าน cloud metadata `http://169.254.169.254` ได้
**Fix:** ก่อน dispatch tool ที่รับ URL arg ต้องเรียก `sanitizeUri()` จาก `shared/types/mediaJobValidation.ts` + DNS rebinding prevention

### C-05: `admin:keys` Scope Allows Unlimited Scope Escalation
**Source:** Security Auditor
**ปัญหา:** Key ที่มี `admin:keys` สามารถสร้าง key ใหม่ที่มี scope ทุกอย่าง รวมถึง `admin:keys` เอง → privilege escalation chain
**Fix:** เพิ่ม scope ceiling rule: `newKeyScopes ⊆ creatingKeyScopes` — key สร้างได้แค่ subset ของ scope ตัวเอง

### C-06: `creditSourceTypeEnum` เป็น PostgreSQL enum — ต้อง ALTER TYPE นอก transaction
**Source:** Code Reviewer + Architect Memory
**ปัญหา:** Drizzle-kit ไม่ handle `ALTER TYPE ... ADD VALUE` อัตโนมัตินอก transaction block
**Fix:** เพิ่ม explicit raw SQL migration:
```sql
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_chat';
-- ...ทั้ง 6 values
```

### C-07: `executeSkill()` + `agencyBridge.executeRun()` ต้องการ `userToken` (JWT)
**Source:** Code Reviewer
**ปัญหา:** ทั้ง `executeSkill(skill, params, userId, userToken, tenantId)` และ `RunParams.userToken` ต้องการ JWT — API key ไม่มี
**Fix:** Spec ต้องกำหนดวิธี: (แนะนำ Option C) Refactor ให้รับ `AuthContext` object ที่มี `userId`, `tenantId`, `mode: "api_key" | "session"` แทน raw token — หรือ mint short-lived service JWT จาก API key context

### C-08: `providerUsageLog.providerId` NOT NULL — non-LLM API calls ไม่มี provider
**Source:** Code Reviewer + Architect Memory
**ปัญหา:** Skill execution, job creation ไม่ผ่าน LLM provider → ไม่มี `providerId` → INSERT จะ fail
**Fix:** เพิ่ม "API Gateway" sentinel row ใน `llmProviders` seed data หรือใช้ `apiAuditEvents` แทนสำหรับ non-LLM tracking

### C-09: `agencyBridge` ต้องการ `conversationId` — External API ไม่มี
**Source:** Code Reviewer
**ปัญหา:** UI สร้าง conversation ก่อน invoke agency แต่ API call จากภายนอกไม่มี
**Fix:** Agency API ต้อง auto-create conversation เมื่อ `conversation_id` เป็น null + cleanup policy (auto-expire 30 days)

---

## HIGH (13 จุด — ควรแก้ก่อน deep-plan)

### H-01: `AuthResult` union เป็น closed type — เพิ่ม `"api_key"` mode จะ break type narrowing
**Source:** Code Reviewer
**Fix:** Widen union + audit ทุก `auth.mode` switch ใน llmRoutes, mcpRoutes, agencyStreamProxy → เพิ่ม `"api_key"` case

### H-02: `parseInt(auth.sub, 10)` ใน mcpRoutes.ts → NaN สำหรับ API key sub
**Source:** Code Reviewer
**ปัญหา:** MCP routes ทำ `parseInt(auth.sub)` เพื่อได้ userId — spec propose `sub: "apikey:{uuid}"` → NaN
**Fix:** ใส่ numeric userId ตรงใน auth result: `sub: String(apiKey.userId)` หรือเพิ่ม `userId` field

### H-03: CORS whitelist blocks external agent origins
**Source:** Code Reviewer
**ปัญหา:** `ALLOWED_SUFFIXES` ใน index.ts permit เฉพาะ `*.smartaihub.app` — Manus AI / OpenClaw origins ถูก block
**Fix:** เพิ่ม dedicated CORS middleware สำหรับ `/v1/*` routes — `Access-Control-Allow-Origin: *` (server-to-server) หรือ configurable per-key

### H-04: `guardWithCredits` เป็น local closure — export ไม่ได้
**Source:** Code Reviewer
**ปัญหา:** Function อยู่ภายใน `registerLLMRoutes()` → public API routes import ไม่ได้
**Fix:** Extract เป็น shared module `server/_core/authGuards.ts`

### H-05: Webhook Secret ไม่มี Rotation Path
**Source:** Security Auditor
**Fix:** เพิ่ม `PATCH /v1/webhooks/:id` with `{ rotate_secret: true }` + 5-min grace period ที่ accept ทั้ง old/new secret

### H-06: Credit Pre-Reservation Race Condition (TOCTOU)
**Source:** Security Auditor
**Fix:** ใช้ optimistic concurrency: `UPDATE SET reserved = reserved + :amount WHERE (balance - reserved) >= :amount` → 0 rows affected = 402

### H-07: Daily Credit Limit Counter ไม่ Atomic กับ Credit Deduction
**Source:** Security Auditor
**Fix:** ใช้ Redis Lua script: `EVAL "local c=redis.call('GET',KEYS[1]) or 0; if tonumber(c)+ARGV[1]>tonumber(ARGV[2]) then return 0 else redis.call('INCRBY',KEYS[1],ARGV[1]); return 1 end"`

### H-08: Cross-Tenant IDOR — job/file read queries ไม่ได้ระบุ WHERE tenantId
**Source:** Security Auditor
**Fix:** ทุก query ต่อ `automation_jobs`, `api_webhook_endpoints`, `api_keys` ต้อง include `WHERE tenantId = ctx.tenantId` + return 404 (ไม่ใช่ 403) สำหรับ cross-tenant miss

### H-09: ไม่มี API Versioning Strategy
**Source:** Architecture Review
**Fix:** เพิ่ม section: URL-based versioning (`/v1/`, `/v2/`), `Sunset` header, 6-month deprecation timeline

### H-10: ไม่มี Idempotency Key สำหรับ POST endpoints
**Source:** Architecture Review
**Fix:** `Idempotency-Key: <uuid>` header, Redis SET NX (TTL 24h)

### H-11: ไม่มี Pagination สำหรับ list endpoints
**Source:** Architecture Review
**Fix:** Cursor-based pagination (OpenAI style): `limit`, `after`, `before`, `has_more`

### H-12: ไม่มี Health Check Endpoint
**Source:** Architecture Review
**Fix:** `GET /v1/health` → `{ "status": "ok", "version": "1.0.0" }` (no auth)

### H-13: Pipeline DAG validation + size limits ไม่ครบ
**Source:** Architecture Review + Security Auditor
**Fix:** Max 10 steps, DAG cycle detection, 8KB per substitution, 1MB per step result

---

## MEDIUM (13 จุด)

| # | Finding | Source |
|---|---------|--------|
| M-01 | `featureFlags.ts` ต้อง update 3 locations (interface + Set + defaults) สำหรับ `publicApi` | Code Reviewer |
| M-02 | CSRF middleware ไม่ cover `/v1/` — ต้อง document explicitly ว่า `/api/llm/*` ≠ public API | Code Reviewer |
| M-03 | `scopesForStaticToken()` — ต้อง guard ไม่ให้ `ENV.mcpServerToken` ขึ้นต้นด้วย `sk-ssp_` | Security + Code Reviewer |
| M-04 | Error responses distinguish key states (expired vs revoked vs invalid) → minor oracle | Security Auditor |
| M-05 | MCP session state: ไม่มี `Mcp-Session-Id` — client skip `initialize` ได้ | Security Auditor |
| M-06 | SSE Event Stream ไม่มี max duration, heartbeat, per-key connection limit | Security Auditor |
| M-07 | Pipeline step output size ไม่มี cap ใน DB storage (JSON column bloat) | Security Auditor |
| M-08 | `userAgent` audit field ไม่ truncate → potential prompt injection via crafted UA | Security Auditor |
| M-09 | `batch_skill` ไม่มี per-batch item cap หรือ full pre-reservation | Security Auditor |
| M-10 | ไม่มี API Key IP Allowlist (optional) | Architecture Review |
| M-11 | ไม่มี Tenant Usage Dashboard (API-specific) | Architecture Review |
| M-12 | MCP `resources` capability ไม่ได้ implement (อย่างน้อย `resources/list`) | Architecture Review |
| M-13 | `automation_jobs.expiresAt` ไม่มี cleanup scheduler job | Architecture Review |

---

## LOW (9 จุด)

| # | Finding | Source |
|---|---------|--------|
| L-01 | SDK examples hardcode API key — ควรใช้ env var | Security Auditor |
| L-02 | `DELETE /v1/jobs/:id` ใช้ `jobs:create` scope — ควรแยกเป็น `jobs:cancel` | Security Auditor |
| L-03 | `/.well-known/mcp.json` + `/v1/docs` ไม่มี note ว่า intentionally unauthenticated | Security Auditor |
| L-04 | Key rotation ไม่มี overlap window guidance (24h recommended) | Security Auditor |
| L-05 | Existing MCP routes (`/api/mcp/*`, `/mcp/*`) ควรระบุ deprecation/coexistence plan | Code Reviewer |
| L-06 | TypeScript `CreditSourceType` union + `VALID_SOURCE_TYPES` set ต้อง update ด้วย | Code Reviewer |
| L-07 | API key name ไม่มี UNIQUE constraint per tenant | Architecture Review |
| L-08 | Webhook delivery ไม่มี auto-disable หลัง 100 consecutive failures | Architecture Review |
| L-09 | SSE Event Stream ไม่มี `Last-Event-ID` support สำหรับ reconnection | Architecture Review |

---

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| **CRITICAL** | 9 | **ต้องแก้ทั้งหมดก่อน implement** |
| **HIGH** | 13 | **ควรแก้ก่อน deep-plan** |
| **MEDIUM** | 13 | เพิ่มใน spec ก่อน implement |
| **LOW** | 9 | เพิ่มได้ภายหลัง |
| **Total** | **44** | |

---

## Confirmed ✅ (สิ่งที่ Spec ถูกต้อง)

| Check | Status |
|-------|--------|
| `creditService.deductCredits()` รับ `sourceType` parameter | ✅ Confirmed |
| Tenant isolation ผ่าน API key → tenantId design | ✅ Confirmed |
| Redis sliding window rate limit pattern | ✅ Matches existing `ratelimit:*` |
| AES-256-GCM encryption สำหรับ webhook secrets | ✅ Correct (ใช้ `crypto.ts`) |
| HMAC replay protection pattern (5-min window) | ✅ Matches `webhookTriggerService.ts` |
| Feature flag architecture | ✅ Straightforward addition |
| Overall integration points (authz, creditService, agencyBridge, mcpRoutes) | ✅ All correctly identified |
