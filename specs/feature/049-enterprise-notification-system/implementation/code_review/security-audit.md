# Security Audit — Feature 049: Enterprise Notification System

**Auditor:** CMD-6 tRPC Security Auditor (automated)
**Date:** 2026-03-21
**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** All server-side code for the notification subsystem (tRPC routers, Express endpoints, services, jobs)

---

## Finding Summary Table

| ID   | Severity | File:Line                                                                       | Anti-Pattern              | Description                                                                                       | Recommended Fix                                                                                                       |
|------|----------|---------------------------------------------------------------------------------|---------------------------|---------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| N01  | HIGH     | apps/web/server/routers/notificationWebhooks.ts:192-198                         | IDOR — UPDATE missing tenantId | `updateWebhook` UPDATE WHERE clause uses only `id` after a SELECT-then-check pattern. A TOCTOU race or a bug where the RBAC SELECT finds the correct owner but the UPDATE targets any row by id.  | Add `eq(notificationWebhooks.tenantId, ctx.tenantId)` to the UPDATE WHERE clause.                                    |
| N02  | HIGH     | apps/web/server/routers/notificationWebhooks.ts:238-241                         | IDOR — DELETE missing tenantId | `deleteWebhook` DELETE WHERE clause uses only `id`. Same root cause as N01.                       | Add `eq(notificationWebhooks.tenantId, ctx.tenantId)` to the DELETE WHERE clause.                                    |
| N03  | HIGH     | apps/web/server/services/notificationWebhookService.ts:49-69                   | SSRF — IPv6 not checked   | `isPrivateIp()` only parses IPv4 octets. `dns.resolve4()` only queries A records. An attacker who controls a hostname with only AAAA records (IPv6) causes `dns.resolve4` to throw → caught → "DNS resolution failed" error prevents delivery, but an IPv6-only internal host (e.g., `::1`) pointed to by a dual-stack hostname's A record falling through to AAAA fallback is not covered. More critically, `resolve4` returning success does not prevent `fetch()` from connecting over IPv6 if the OS prefers it (Happy Eyeballs). | Use `dns.resolve` (all record types) or `dns.lookup`, check all returned addresses with an IPv6 private-range check as well (loopback `::1`, ULA `fc00::/7`, link-local `fe80::/10`). |
| N04  | HIGH     | apps/web/server/_core/index.ts:792-834                                          | Missing input enum validation on admin-broadcast | `type` and `priority` fields from `req.body` are passed directly to `createNotification` with no allowlist validation. A malformed `type` (e.g., `"__proto__"` or a value outside the NotificationType union) or `priority` outside the four allowed values (`low`, `normal`, `high`, `critical`) is only constrained by the slice operations but reaches the database insert, which may throw a Postgres enum cast error rather than returning a clean 400. `actionUrl` and `relatedResourceType` are similarly unvalidated. | Wrap `type`, `priority`, `relatedResourceType`, and `actionUrl` in a Zod schema (`.enum([...])`) at the Express endpoint level, mirroring the `metadataSchema` already applied to `metadata`. |
| N05  | MEDIUM   | apps/web/server/routers/notificationWebhooks.ts:25-26                          | Missing category allowlist | `categories: z.array(z.string())` accepts any string, allowing arbitrary category values to be stored and later used in `findMatchingWebhooks` in-memory filtering. No per-string `max()` or regex constraint. A user could store categories with thousands of characters or inject values that cause unexpected filter behaviour. | Change to `z.array(z.enum(["system_health","media_jobs","workflow","skill","feedback","agency","security","follow","scheduled","business"])).max(10)`. |
| N06  | MEDIUM   | apps/web/server/services/notificationWebhookService.ts:183-186, 226-232        | Webhook UPDATE/DELETE missing tenantId in WHERE | Inside `deliverWebhook`, the UPDATE on `notificationWebhooks` (success path line ~228, failure path line ~254, timeout path line ~328) uses only `eq(notificationWebhooks.id, webhookId)`. An attacker who can enqueue a BullMQ job with an arbitrary `webhookId` (e.g., via a Redis compromise) can trigger failureCount increments or auto-disable for any webhook regardless of tenant. | Add `eq(notificationWebhooks.tenantId, webhook.tenantId)` to every UPDATE inside `deliverWebhook`. The `webhook.tenantId` is already loaded at line 191. |
| N07  | MEDIUM   | apps/web/server/services/notificationWebhookService.ts:281-291                 | Admin user lookup uses raw SQL cast with no parameterized type check | `sql\`${users.currentTenantId}::text = ${webhook.tenantId}\`` inside `deliverWebhook` mixes Drizzle parameterized interpolation (`${webhook.tenantId}`) with a raw SQL cast (`::text`). Drizzle correctly parameterizes the right-hand side, but the pattern is fragile and mirrors previous audit findings on the `resolveTenantIdVarchar` calling convention. It is safe as written but the pattern should be audited. | Use `eq(users.currentTenantId, parseInt(webhook.tenantId, 10))` with proper integer cast, or validate `webhook.tenantId` is a pure numeric string before use. |
| N08  | MEDIUM   | apps/web/server/routes/notificationStream.ts:79-88                             | SSE injection via JSON.stringify does not strip newlines from `data:` line | The code parses and re-serializes the Redis message to prevent injection — this is correct for embedded newlines in field values. However, `JSON.stringify` of a valid object will never produce literal `\n` or `\r` characters outside string values (they would be `\\n`). The comment is accurate. One residual risk: if `res.write` is called with a `data:` payload containing `\n\n` (which cannot arise from `JSON.stringify` of a typical object), the SSE frame would be prematurely closed. The implementation is safe as-is, but does not add a Content-Security-Policy response header that would mitigate browser-side event injection if the SSE content is ever rendered as HTML. | INFO-level: document that `JSON.stringify` is the injection guard. Add `X-Content-Type-Options: nosniff` to the SSE response headers. |
| N09  | MEDIUM   | apps/web/server/routers/monitoring.ts:98-105                                   | `notificationHealth` exposes operational metrics to any admin, including SSE connection count and error rates | The health probe response includes `sseConnections.count` (total connections across all users) and `adminBroadcast.errorRate`. These expose internal load information to any admin-role user, including domain admins of one tenant seeing platform-wide SSE counts. | Restrict `notificationHealth` to `domain_admin` role check or super-admin only, and scope SSE counts to the caller's tenant if possible. Or document as accepted risk. |
| N10  | MEDIUM   | apps/web/server/services/notificationEmailService.ts:11-14                     | VITE_ env var in server code | `process.env.VITE_PUBLIC_URL` is read as a fallback at line 13. `VITE_*` variables are bundled into the client JavaScript by Vite — referencing them in server code both pollutes the naming convention and suggests the value may be expected in a client bundle context where it would be exposed. | Replace with a non-prefixed env var such as `PUBLIC_URL` or `APP_PUBLIC_URL`. The fallback `"https://smartaihub.app"` is sufficient; remove the `VITE_PUBLIC_URL` fallback entirely. |
| N11  | MEDIUM   | apps/web/server/jobs/escalationJob.ts:95-115                                   | `escalateToUserId` not validated against policy's tenant | When `policy.escalateToUserId` is set, the escalation job sends notifications to that user without verifying the user belongs to the same tenant as the policy. A misconfigured or tampered policy could target a user in a different tenant. | Add a query to verify `escalateToUserId` has `currentTenantId` matching `policy.tenantId` before including in `targetUserIds`. |
| N12  | MEDIUM   | apps/web/server/services/notificationHealthChecks.ts:100-104                  | In-memory rate counter is per-worker, not global | The `broadcastCounter` is module-level, resetting independently per Node.js worker process. In a multi-worker deployment (cluster, PM2), the 20 RPM rate limit is effectively multiplied by the worker count. Under 4 workers the actual rate limit is 80 RPM. | Migrate the counter to Redis (`INCR` with `EXPIRE`), or document the per-worker limitation prominently and set the in-code limit to `MAX_RPM / workerCount`. |
| N13  | LOW      | apps/web/server/routers/notificationWebhooks.ts:58, 96, 164, 230              | `system_agent` role accepted for admin operations | `listWebhooks`, `createWebhook`, `updateWebhook`, and `deleteWebhook` all accept `ctx.user.role === "system_agent"` as equivalent to `admin`. As documented in prior audit findings (Feature 046), the `system_agent` JWT uses the same `ENV.cookieSecret` as user JWTs with no aud/iss/expiry differentiation. This is a systemic issue — accepting `system_agent` here inherits that risk. | Flag as part of the broader `system_agent` JWT hardening effort (Feature 046 finding in memory). No isolated fix here; track under the existing CRITICAL finding. |
| N14  | LOW      | apps/web/server/services/notificationWebhookService.ts:117-119                | HMAC signature does not include timestamp — no replay prevention | `computeSignature(body, secret)` signs only the body. An attacker who intercepts a webhook delivery can replay the same payload and signature to the receiver's endpoint indefinitely. There is no nonce or timestamp binding in the signature. | Include the `X-Delivery-Timestamp` header value in the signed string: `crypto.createHmac("sha256", secret).update(timestamp + "." + body).digest("hex")`, and document that receivers should reject requests with timestamps older than 5 minutes. |
| N15  | LOW      | apps/web/server/services/notificationWebhookService.ts:244-250                | Failure count incremented from stale `webhook.failureCount`, not DB-side | `newFailureCount = (webhook.failureCount ?? 0) + 1` uses the value loaded at line 191. If two concurrent delivery attempts fail simultaneously, both read the same `failureCount`, both compute `newFailureCount = N+1`, and only one increment is recorded. The auto-disable threshold of 3 failures may not trigger as expected. | Use a DB-side atomic increment: `set({ failureCount: sql\`${notificationWebhooks.failureCount} + 1\` })` and read back the result to determine if the threshold is crossed. |
| N16  | LOW      | apps/web/server/routes/notificationStream.ts:52-58                            | Per-user SSE cap closes oldest connection with no client notification | When the 5th connection is opened, the oldest is `disconnect()`ed silently. The evicted client receives no `event: close` or `event: error` frame before the connection ends — the TCP RST may take seconds to surface in the browser, causing confusion. This is a UX/DoS hardening gap rather than a security flaw. | Send `res.write('event: evicted\ndata: {"reason":"connection_limit"}\n\n')` before `oldest.disconnect()`. |
| N17  | LOW      | apps/web/server/jobs/escalationJob.ts:166-174                                  | Escalation metadata written with COALESCE + raw JSON cast | `sql\`COALESCE(${userNotifications.metadata}, '{}'::jsonb) || ${escalationMeta}::jsonb\`` merges caller-controlled JSON. The `escalationMeta` is constructed in-code with `new Date().toISOString()` and `targetUserIds.join(",")` — the only injected data. `targetUserIds` is an array of integers from DB, so injection is not possible. This is safe but fragile. | Use a Drizzle `sql` expression with proper parameterized JSONB construction or consider a dedicated `escalationMetadata` column to avoid raw SQL merging. |
| N18  | INFO     | apps/web/server/routers/monitoring.ts:61-62                                    | `markNotificationRead` has no tenantId guard in the service | `markAsRead(input.notificationId, ctx.user!.id)` in `orchestratorNotificationService.ts` correctly scopes to `userId` in the WHERE clause (line 91-94). A user cannot mark another user's notification as read. Tenant isolation is enforced through userId ownership. CLEAN — documented here for traceability. | No action required. |
| N19  | INFO     | apps/web/server/services/notificationWebhookService.ts:75-110                 | DNS TOCTOU (Time-of-Check-Time-of-Use) | `validateWebhookUrl` at registration time and at delivery time are both performed, which is the correct defense-in-depth pattern against DNS rebinding. The 10-second delivery timeout (line 208) limits the TOCTOU window further. CLEAN — documented here as the pattern is correct. | No action required. |
| N20  | INFO     | apps/web/server/services/notificationService.ts:53-58                          | Escalation flag stripping in `sanitizeMetadata` | `sanitizeMetadata` correctly removes `isEscalated`, `escalatedAt`, and `escalatedTo` before storage. The escalation job reads `metadata?.isEscalated` before sanitization (line 302) and passes the raw flag through only from trusted internal callers. Pattern is correct. | No action required. |

---

## Detailed Findings

### N01 — HIGH: IDOR on `updateWebhook` — UPDATE WHERE clause missing tenantId

**File:** `apps/web/server/routers/notificationWebhooks.ts` lines 192–198

The ownership check at lines 154–170 performs a SELECT to verify the caller owns the webhook or has admin role. The subsequent UPDATE at lines 192–196 uses only:

```typescript
.where(eq(notificationWebhooks.id, input.id))
```

This is a TOCTOU pattern: the authorization decision is made on the SELECT result, but the UPDATE is scoped only by primary key. If the ownership check passes (e.g., the user is admin), the UPDATE can modify any webhook in any tenant by `id`. A compromised admin account in Tenant A could update a webhook belonging to Tenant B by knowing its numeric ID.

**Fix:** Add tenant isolation to the UPDATE:

```typescript
.where(
  and(
    eq(notificationWebhooks.id, input.id),
    eq(notificationWebhooks.tenantId, ctx.tenantId!)
  )
)
```

---

### N02 — HIGH: IDOR on `deleteWebhook` — DELETE WHERE clause missing tenantId

**File:** `apps/web/server/routers/notificationWebhooks.ts` lines 238–241

Same pattern as N01. The DELETE at line 239 uses only `eq(notificationWebhooks.id, input.id)`. An admin-role user in any tenant with knowledge of another tenant's webhook ID can delete it.

**Fix:** Mirror the N01 fix. Add `eq(notificationWebhooks.tenantId, ctx.tenantId!)` to the DELETE WHERE.

---

### N03 — HIGH: SSRF — IPv6 addresses not checked in `isPrivateIp`

**File:** `apps/web/server/services/notificationWebhookService.ts` lines 49–69 and 93–96

`isPrivateIp()` parses only IPv4 dotted-quad notation. `dns.resolve4()` is used to fetch A records only. There are two gaps:

1. If a hostname has no A records but has AAAA records, `dns.resolve4` throws, which is caught and surfaced as "DNS resolution failed" — this prevents delivery but also prevents registration of a legitimate IPv6-only public endpoint.
2. More critically, `fetch()` in Node.js uses the OS resolver (Happy Eyeballs / RFC 8305). Even if `resolve4` returns a valid public IPv4, the OS may prefer an AAAA address and connect over IPv6. A hostname that resolves to both a public IPv4 (to pass the check) and a private IPv6 address (e.g., `::1`, `fc00::1`) would bypass SSRF protection.

**Fix:**

```typescript
import dns from "node:dns/promises";

function isPrivateIpv6(ip: string): boolean {
  if (ip === "::1") return true; // loopback
  if (/^fe80:/i.test(ip)) return true; // link-local
  if (/^fc/i.test(ip) || /^fd/i.test(ip)) return true; // ULA fc00::/7
  return false;
}

// In validateWebhookUrl:
const [ipv4Addrs, ipv6Addrs] = await Promise.allSettled([
  dns.resolve4(hostname),
  dns.resolve6(hostname),
]);

const allIps: string[] = [];
if (ipv4Addrs.status === "fulfilled") allIps.push(...ipv4Addrs.value);
if (ipv6Addrs.status === "fulfilled") allIps.push(...ipv6Addrs.value);

if (allIps.length === 0) throw new Error(`DNS resolution returned no addresses for ${hostname}`);

for (const ip of allIps) {
  if (ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIp(ip)) {
    throw new Error(`URL resolves to private/reserved IP address (${ip}).`);
  }
}
```

---

### N04 — HIGH: Missing enum validation on `admin-broadcast` Express endpoint

**File:** `apps/web/server/_core/index.ts` lines 792–834

The endpoint validates `metadata` via a Zod schema (`metadataSchema`) but `type`, `priority`, `relatedResourceType`, `actionUrl`, and `actionLabel` are destructured from `req.body` without schema validation. The only guard for `title` is the `typeof title !== "string"` check at line 796. All other fields pass through with only:

- `title.slice(0, 255)` — truncates but does not validate type
- `(content || "").slice(0, 2000)` — accepts anything
- `priority || "normal"` — no allowlist; an invalid value reaches `createNotification` and the DB enum cast

An attacker with the bearer token (e.g., a compromised Python backend) can send `priority: "INVALID"` causing a Postgres `invalid input value for enum` error (500 response leaking database error message via `err.message` on line 849).

**Fix:** Add a Zod schema for the entire request body:

```typescript
const broadcastBodySchema = z.object({
  type: z.enum(["scheduled_message","follow_request","alert","system","direct_message","urgent_message"]).optional().default("alert"),
  title: z.string().min(1).max(255),
  content: z.string().max(2000).optional().default(""),
  priority: z.enum(["low","normal","high","critical"]).optional().default("normal"),
  relatedResourceType: z.string().max(50).optional(),
  actionUrl: z.string().max(2000).optional(),
  actionLabel: z.string().max(100).optional(),
  groupKey: z.string().max(200).optional(),
  metadata: metadataSchema,
});
```

Also: the `err.message` at line 849 (`res.status(500).json({ success: false, error: err.message })`) leaks raw database error messages to the Python caller. While the endpoint is authenticated, internal error details should be logged server-side only and a generic error returned.

---

### N05 — MEDIUM: `categories` array has no allowlist or per-element constraints

**File:** `apps/web/server/routers/notificationWebhooks.ts` lines 25–26

```typescript
categories: z.array(z.string()).nullable().optional(),
```

`z.string()` has no `.max()` or `.regex()` constraint. A user can store webhook categories with multi-kilobyte strings. The `findMatchingWebhooks` function loads all webhooks for a tenant into memory (line 353–365 in `notificationWebhookService.ts`) and filters in-memory by the categories array — storing large arrays with large strings inflates memory usage on every notification creation. There is also no cap on the number of categories per webhook.

**Fix:**

```typescript
categories: z.array(
  z.enum(["system_health","media_jobs","workflow","skill","feedback","agency","security","follow","scheduled","business"])
).max(10).nullable().optional(),
```

---

### N06 — MEDIUM: Webhook UPDATEs inside `deliverWebhook` missing tenant scope

**File:** `apps/web/server/services/notificationWebhookService.ts` lines 226–234, 253–257, 327–332

All three UPDATE paths inside `deliverWebhook` (success, HTTP failure, and timeout) scope the update using only `eq(notificationWebhooks.id, webhookId)`. The `webhook.tenantId` value is already available from the initial SELECT at line 191. While this function is called from a BullMQ worker and not directly from user input, defense-in-depth requires tenant scoping on all writes.

**Fix:** Add `eq(notificationWebhooks.tenantId, webhook.tenantId)` to all three UPDATE WHERE clauses.

---

### N10 — MEDIUM: `VITE_PUBLIC_URL` env var read in server code

**File:** `apps/web/server/services/notificationEmailService.ts` lines 11–14

```typescript
const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  process.env.VITE_PUBLIC_URL ||   // ← line 13
  "https://smartaihub.app";
```

`VITE_*` variables are bundled into client JavaScript by Vite during build. This is a confirmed pattern from prior audits (`MEMORY.md` — Known Structural Issues). Reading `VITE_PUBLIC_URL` on the server is a naming-convention violation that may cause confusion about which context the value is intended for.

**Fix:** Remove the `VITE_PUBLIC_URL` fallback. The hardcoded default `"https://smartaihub.app"` already handles the missing-env case. If configurability is needed, add `PUBLIC_URL` (no VITE prefix) to `.env.example`.

---

### N11 — MEDIUM: Escalation `escalateToUserId` not tenant-verified

**File:** `apps/web/server/jobs/escalationJob.ts` lines 95–96

```typescript
if (policy.escalateToUserId) {
  targetUserIds = [policy.escalateToUserId];
```

When an `escalationPolicy` row has `escalateToUserId` set, the job directly uses that ID without verifying the target user belongs to `policy.tenantId`. A policy row with a cross-tenant `escalateToUserId` (misconfigured or injected via a compromised DB write) would send escalation notifications to a user in a different tenant. This is an indirect IDOR with critical-priority notifications bypassing preference gates.

**Fix:**

```typescript
if (policy.escalateToUserId) {
  const targetUser = await db.select({ id: users.id }).from(users).where(
    and(
      eq(users.id, policy.escalateToUserId),
      sql`${users.currentTenantId}::text = ${policy.tenantId}`
    )
  ).limit(1);
  if (targetUser.length > 0) {
    targetUserIds = [policy.escalateToUserId];
  }
}
```

---

### N12 — MEDIUM: Admin-broadcast rate limiter is per-worker, not global

**File:** `apps/web/server/services/notificationHealthChecks.ts` lines 100–120

**File:** `apps/web/server/_core/index.ts` lines 746–757

The `adminBroadcastRateLimit` closure and `broadcastCounter` in `notificationHealthChecks.ts` are module-level in-memory state. In a multi-process Node.js deployment (e.g., cluster with 4 CPUs), the effective rate limit is `MAX_RPM × workerCount = 80 RPM` instead of 20 RPM.

**Fix:** Replace in-memory counter with Redis INCR + EXPIRE:

```typescript
async function adminBroadcastRateLimit(redis: Redis): Promise<boolean> {
  const key = "ratelimit:admin-broadcast";
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= 20;
}
```

---

### N14 — LOW: Webhook HMAC signatures have no replay protection

**File:** `apps/web/server/services/notificationWebhookService.ts` lines 117–119 and 203–204

The HMAC is computed over `body` only. If an attacker intercepts (or observes from a log) a valid webhook delivery, they can replay the exact `body` + `X-Signature-256` pair to the receiver endpoint at any future time and it will verify correctly. This may be acceptable for notification webhooks (as opposed to payment or action-triggering webhooks), but best practice is to include a delivery timestamp.

**Fix:** Include a delivery timestamp in the signed material:

```typescript
const deliveryTimestamp = new Date().toISOString();
const signingInput = `${deliveryTimestamp}.${body}`;
const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("hex");

// Send as headers:
"X-Delivery-Timestamp": deliveryTimestamp,
"X-Signature-256": `sha256=${signature}`,
```

Receivers should reject requests where `X-Delivery-Timestamp` is more than 5 minutes old.

---

### N15 — LOW: Stale-read race condition on webhook failure count

**File:** `apps/web/server/services/notificationWebhookService.ts` lines 244–251

```typescript
const newFailureCount = (webhook.failureCount ?? 0) + 1;
```

`webhook` was loaded at the start of `deliverWebhook`. If two concurrent delivery attempts both fail, both increment from the same stale value. The auto-disable threshold of 3 may not trigger correctly, allowing a broken webhook to remain enabled longer than intended.

**Fix:**

```typescript
const [updated] = await db
  .update(notificationWebhooks)
  .set({
    failureCount: sql`${notificationWebhooks.failureCount} + 1`,
    updatedAt: new Date(),
  })
  .where(eq(notificationWebhooks.id, webhookId))
  .returning({ failureCount: notificationWebhooks.failureCount });

const newFailureCount = updated?.failureCount ?? 3;
if (newFailureCount >= 3) {
  await db.update(notificationWebhooks)
    .set({ isEnabled: false })
    .where(eq(notificationWebhooks.id, webhookId));
}
```

---

## Clean Areas (Audited, No Issues Found)

| Area | Status | Notes |
|------|--------|-------|
| SSE authentication | CLEAN | `sdk.authenticateRequest()` called before any data is written; 401 returned and connection closed on failure. |
| SSE frame injection prevention | CLEAN | Redis messages are JSON-parsed and re-serialized before being written to the SSE frame. Malformed JSON is silently dropped. |
| SSE per-user connection cap | CLEAN | Correctly enforced at 5 connections per user; oldest is evicted. |
| HMAC signing correctness | CLEAN | `crypto.createHmac("sha256", secret)` with hex digest is the correct algorithm and encoding. |
| Webhook secret encryption | CLEAN | `encrypt()`/`decrypt()` from `crypto.ts` uses AES-256-GCM. Secret is never returned in API responses (`stripSecret()` removes `secretEncrypted`). |
| SSRF validation at registration and delivery | CLEAN | `validateWebhookUrl` is called both on `createWebhook`/`updateWebhook` and again inside `deliverWebhook` (DNS rebind protection). |
| HTTPS enforcement for webhooks | CLEAN | `parsed.protocol !== "https:"` check at line 83 of `notificationWebhookService.ts`. |
| `markAsRead` / `dismissNotification` tenant isolation | CLEAN | Both operations scope by `(notificationId, userId)` — a user cannot operate on another user's notification. |
| `getNotifications` tenant isolation | CLEAN | `orchestratorNotificationService.getNotifications` scopes by `userId` AND `tenantId`. |
| `getUnifiedNotifications` tenant isolation | CLEAN | Subquery `SELECT id FROM users WHERE "currentTenantId" = (SELECT id FROM tenants WHERE id = ?)` correctly scopes user notifications. `orchestratorNotifications` filtered by `eq(orchestratorNotifications.tenantId, tenantId)`. |
| Admin-broadcast token validation | CLEAN | `verifyInternalBearerToken` uses `crypto.timingSafeEqual` with minimum length check (32 chars). |
| Escalation metadata sanitization | CLEAN | `sanitizeMetadata` strips escalation fields from untrusted input; escalation job reads flags before sanitization from trusted in-code values only. |
| `notificationService.ts` actionUrl sanitization | CLEAN | `sanitizeActionUrl` blocks `javascript:`, `data:`, `vbscript:`, `blob:` and `http:` protocols. |
| SQL parameterization | CLEAN | No raw SQL string concatenation found. All interpolations use Drizzle's `sql` template tag which parameterizes properly. |
| Webhook `testWebhook` ownership check | CLEAN | Both user-owned and tenant-wide webhooks have correct ownership checks before the test payload is sent. |

---

## Priority Order for Remediation

1. **N01, N02** — IDOR on webhook UPDATE/DELETE: straightforward one-line fix per finding, high impact.
2. **N03** — SSRF IPv6 gap: requires adding `dns.resolve6` call alongside existing `resolve4`.
3. **N04** — Missing enum validation on internal broadcast: add a Zod schema, remove `err.message` exposure.
4. **N11** — Escalation target cross-tenant: add a single DB ownership check.
5. **N05** — Category allowlist: change Zod schema one line.
6. **N06** — Delivery UPDATE missing tenant scope: add WHERE clause to three UPDATE statements.
7. **N10** — VITE_ env var: remove one line.
8. **N12** — Per-worker rate limit: migrate to Redis counter.
9. **N14, N15** — HMAC replay / stale failure count: low urgency, can be batched.
