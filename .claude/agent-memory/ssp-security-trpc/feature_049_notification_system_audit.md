---
name: Feature 049 Notification System Security Audit
description: Security findings from the Enterprise Notification System (Feature 049) tRPC/Express audit — open issues for remediation
type: project
---

Feature 049 — Enterprise Notification System — tRPC/Express security audit completed 2026-03-21.

Full report: `specs/feature/049-enterprise-notification-system/implementation/code_review/security-audit.md`

**Why:** Pre-merge security review dispatched by orchestra as parallel specialist.

**How to apply:** These findings are OPEN (unverified as fixed). Check this file before approving any 049-related PR.

## Open Findings

### HIGH — N01: IDOR on updateWebhook UPDATE
- `apps/web/server/routers/notificationWebhooks.ts:192-198`
- UPDATE uses only `eq(id, input.id)` — no tenantId. TOCTOU between SELECT ownership check and UPDATE.
- Fix: add `eq(notificationWebhooks.tenantId, ctx.tenantId!)` to UPDATE WHERE.

### HIGH — N02: IDOR on deleteWebhook DELETE
- `apps/web/server/routers/notificationWebhooks.ts:238-241`
- DELETE uses only `eq(id, input.id)` — no tenantId.
- Fix: add `eq(notificationWebhooks.tenantId, ctx.tenantId!)` to DELETE WHERE.

### HIGH — N03: SSRF — IPv6 addresses not checked in isPrivateIp
- `apps/web/server/services/notificationWebhookService.ts:49-69`
- `isPrivateIp()` parses IPv4 only. `dns.resolve4()` only fetches A records. `fetch()` may connect over IPv6 via Happy Eyeballs even when A record validation passes. A hostname with a public A record + private AAAA bypasses SSRF protection.
- Fix: add `dns.resolve6()` call + IPv6 private range check (`::1`, `fe80::/10`, `fc00::/7`).

### HIGH — N04: Missing enum validation on admin-broadcast Express endpoint
- `apps/web/server/_core/index.ts:792-834`
- `type`, `priority`, `relatedResourceType`, `actionUrl` from req.body pass through unvalidated. Invalid `priority` value causes Postgres enum cast error, leaking DB error message via `err.message` in 500 response.
- Fix: add Zod schema for full request body; replace `err.message` exposure with generic error.

### MEDIUM — N05: Webhook categories array has no allowlist or per-element constraints
- `apps/web/server/routers/notificationWebhooks.ts:25-26`
- `z.array(z.string())` with no `.max()` or enum. Large strings inflate `findMatchingWebhooks` in-memory load.
- Fix: change to `z.array(z.enum([...10 known categories])).max(10)`.

### MEDIUM — N06: Webhook delivery UPDATEs missing tenantId in WHERE
- `apps/web/server/services/notificationWebhookService.ts:226-234, 253-257, 327-332`
- Three UPDATE paths in `deliverWebhook` use only `eq(id, webhookId)`. `webhook.tenantId` is already loaded.
- Fix: add `eq(notificationWebhooks.tenantId, webhook.tenantId)` to all three UPDATE WHERE clauses.

### MEDIUM — N10: VITE_PUBLIC_URL read in server code
- `apps/web/server/services/notificationEmailService.ts:13`
- `process.env.VITE_PUBLIC_URL` used as fallback. Pattern is a naming-convention violation (VITE_ = client bundle).
- Fix: remove the VITE_PUBLIC_URL fallback line; hardcoded default is sufficient.

### MEDIUM — N11: Escalation escalateToUserId not verified against policy tenant
- `apps/web/server/jobs/escalationJob.ts:95-96`
- When `policy.escalateToUserId` is set, the target user is used directly without checking they belong to `policy.tenantId`. Cross-tenant notification delivery possible via misconfigured policy.
- Fix: add DB query to verify `escalateToUserId` has `currentTenantId` matching `policy.tenantId`.

### MEDIUM — N12: Admin-broadcast rate limiter is per-worker (not global)
- `apps/web/server/services/notificationHealthChecks.ts:100-104` and `apps/web/server/_core/index.ts:746-757`
- In-memory counter. Multi-worker: effective limit = 20 × workerCount RPM.
- Fix: migrate counter to Redis INCR + EXPIRE.

### LOW — N14: Webhook HMAC has no replay protection (no timestamp binding)
- `apps/web/server/services/notificationWebhookService.ts:117-119`
- Signature covers body only. Intercepted payloads can be replayed indefinitely.
- Fix: include `X-Delivery-Timestamp` value in signed material.

### LOW — N15: Stale-read race on webhook failure count increment
- `apps/web/server/services/notificationWebhookService.ts:244-251`
- `(webhook.failureCount ?? 0) + 1` uses value from initial load. Concurrent failures may not trigger auto-disable.
- Fix: use DB-side atomic `sql\`failureCount + 1\`` and read back updated value.

## Clean Areas (confirmed)
- SSE auth, frame injection prevention, per-user connection cap
- HMAC signing algorithm correct
- Webhook secret encryption and stripping in API responses
- SSRF HTTPS enforcement + DNS rebind protection (double-check at delivery)
- markAsRead / dismissNotification userId scoping
- getUnifiedNotifications tenant isolation
- actionUrl sanitization (blocks javascript:, data:, etc.)
- No raw SQL string concatenation found
