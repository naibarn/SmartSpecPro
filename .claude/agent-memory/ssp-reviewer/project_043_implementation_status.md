---
name: Spec 043 Implementation Status
description: Completeness review of feature 043 (Public API / External Agent Gateway) on branch codex/feature-043-public-api, 2026-03-15
type: project
---

Feature 043 implementation (Public API & External Agent Gateway) reviewed on 2026-03-15.

**Why:** Spec was finalized at v1.1.0 on 2026-03-14 with 114 findings incorporated. Implementation covers sections 01–04 (schema, API key service, auth extension, rate limiter/audit).

**How to apply:** Use as baseline for future reviews on this branch. The HIGH bugs below must be fixed before merging.

## Critical Bugs Found

1. **`apiKeys.ts` router queries wrong table** — `getUsageStats` queries `apiAuditEvents` (the media/LLM audit log) for `apiKeyId`, `path`, and `creditsUsed` columns that do NOT exist on that table. The public API usage stats should query `publicApiAuditLog` instead. This will crash at runtime.

2. **`apiAuditLogger` / `apiAuditService` is missing** — No service writes records to the `public_api_audit_log` table. None of the /v1/* route handlers call any logging function. The table is created in migration 0073 but nothing populates it.

3. **Rate limiter ignores per-key `rateLimit` from database** — `rateLimitMiddleware()` in `apiKeyRateLimiter.ts:136` hardcodes `60` RPM instead of reading `req.auth.rateLimit` or fetching the key's stored rateLimit. The `api_keys.rateLimit` column exists but is unused.

4. **`automation_jobs.idempotencyKey` unique index is global, not per-tenant** — The migration creates `UNIQUE INDEX automation_jobs_idempotency_idx ON automation_jobs ("idempotencyKey")`. But `listJobs` uses per-tenant isolation. Two different tenants can't reuse the same idempotency key string.

5. **No SSRF validation on `jobs.callback_url`** — `createJob()` accepts a `callbackUrl` parameter and stores it without SSRF validation. When the job completes, this URL could be called against internal services.

## Gaps

- `apiAuditLogger` service missing — no file at `server/services/apiAuditLogger.ts`
- `apiKeyAuth.ts` only has `apiKeyAuthMiddleware` — missing `requireScopes` export (it's in a separate file, which is fine) and missing `publicApiFeatureGuard` export (also in separate file — actually OK, feature guard is in `publicApiFeatureGuard.ts`)
- MCP tool dispatch is entirely stub-based — all 28 tools return placeholder messages. This is by design for initial delivery but must be tracked.
- `executeJob()` in jobAutomationService.ts is also a stub — all job types return placeholder messages
- Per-key `rateLimit` from DB not read in `rateLimitMiddleware`

## Confirmed Working

- All route files exist and are registered in index.ts (lines 431–438)
- `registerPublicDocsRoutes` called at line 441
- `initAutomationJobsQueue`/`closeAutomationJobsQueue` wired in index.ts (line 90 import, needs shutdown check)
- `initWebhookApiDeliveryQueue`/`closeWebhookApiDeliveryQueue` wired in index.ts (line 93 import)
- `apiKeysRouter` registered in routers.ts at line 1792
- `/admin/api-keys` route in App.tsx:168
- `publicApi` feature flag in featureFlags.ts with all 3 required locations
- HMAC-based key hashing with startup assertion
- SSRF validation on reference_image_urls and webhook callback URLs
- Tenant isolation on agencies, webhooks (via tenantId ownership checks)
- `secretEncrypted` never returned in webhook list responses
- Raw API key returned only at creation
- Migration 0073 creates all 5 new tables + existing table columns
